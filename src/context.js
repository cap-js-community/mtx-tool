"use strict";

const urllib = require("url");
const pathlib = require("path");
const { version } = require("../package.json");

const {
  tryReadJsonSync,
  tryAccessSync,
  writeJsonSync,
  spawnAsync,
  safeUnshift,
  escapeRegExp,
  makeOneTime,
  indexByKey,
} = require("./shared/static");
const { assert, fail } = require("./shared/error");
const { request } = require("./shared/request");
const oauth = require("./shared/oauth");
const { LazyCache, ExpiringLazyCache } = require("./shared/cache");
const { Logger } = require("./shared/logger");
const { CONFIG_TYPE, CONFIG_INFOS } = require("./config");
const { limiter } = require("./shared/funnel");

const ENV = Object.freeze({
  APP_SUFFIX: "MTX_APP_SUFFIX",
});

const APP_SUFFIXES = safeUnshift(["", "-{UUID}", "-blue", "-green"], process.env[ENV.APP_SUFFIX]);
const APP_SUFFIXES_READONLY = APP_SUFFIXES.concat(["-live"]);
const HOME = process.env.HOME || process.env.USERPROFILE;
const CF = Object.freeze({
  EXEC: "cf",
  HOME: process.env.CF_HOME || HOME,
});

const LOCATION = Object.freeze({
  LOCAL: "LOCAL",
  GLOBAL: "GLOBAL",
});
const FILENAME = Object.freeze({
  CONFIG: ".mtxrc.json",
  CACHE: ".mtxcache.json",
});

const CACHE_GAP = 14400000; // 4 hours in milliseconds
const UAA_TOKEN_CACHE_EXPIRY_GAP = 60000; // 1 minute
const CF_API_CONCURRENCY = 6;

const logger = Logger.getInstance();

const _run = async (command, ...args) => {
  return await spawnAsync(command, args, {
    env: {
      PATH: process.env.PATH,
      CF_HOME: CF.HOME,
    },
  });
};

const _cfAuthToken = async () => {
  try {
    const [stdout, stderr] = await _run(CF.EXEC, "oauth-token");
    assert(!stderr, "got stderr output from cf oauth-token\n%s", stderr);
    return stdout.trim();
  } catch (err) {
    return fail(
      "caught error during cf oauth-token\n%s",
      [err.message, err.stdout, err.stderr].filter((s) => s && s.length).join("\n")
    );
  }
};

const _cfRequest = async (cfInfo, url) => {
  try {
    if (url.startsWith("/v3")) {
      url = cfInfo.config.Target + url;
    }
    const response = await request({
      url,
      headers: {
        Accept: "application/json",
        Authorization: cfInfo.token,
      },
      logged: false,
    });
    return await response.json();
  } catch (err) {
    return fail("caught error during cf request %s\n%s", url, err.message);
  }
};

const _cfRequestPaged = async (cfInfo, url) => {
  if (url.startsWith("/v3")) {
    url = cfInfo.config.Target + url;
  }
  const result = { resources: [], included: [] };
  while (true) {
    const { pagination, resources, included } = await _cfRequest(cfInfo, url);
    if (resources) {
      result.resources = result.resources.concat(resources);
    }
    if (included) {
      result.included = result.included.concat(included);
    }
    if (pagination && pagination.next && pagination.next.href) {
      url = pagination.next.href;
    } else {
      break;
    }
  }
  return result;
};

const _readCfConfig = () => {
  const cfConfigPath = pathlib.join(CF.HOME, ".cf", "config.json");
  const cfConfig = tryReadJsonSync(cfConfigPath);
  assert(cfConfig, "could not open cf config in location", cfConfigPath);
  const { OrganizationFields, SpaceFields, Target } = cfConfig || {};
  if (
    !cfConfig ||
    !OrganizationFields ||
    !OrganizationFields.GUID ||
    !OrganizationFields.Name ||
    !SpaceFields ||
    !SpaceFields.GUID ||
    !SpaceFields.Name ||
    !Target
  ) {
    return fail("no cf org/space targeted");
  }
  logger.info(`targeting cf api ${Target} / org "${OrganizationFields.Name}" / space "${SpaceFields.Name}"`);
  return cfConfig;
};

const _resolveDir = (filename) => {
  let subdirs = process.cwd().split(pathlib.sep);
  while (true) {
    const dir = subdirs.length === 0 ? HOME : subdirs.join(pathlib.sep);
    const filepath = dir + pathlib.sep + filename;
    if (tryAccessSync(filepath)) {
      return {
        dir,
        filepath,
        location: dir === HOME ? LOCATION.GLOBAL : LOCATION.LOCAL,
      };
    }
    if (subdirs.length === 0) {
      return null;
    }
    subdirs = subdirs.slice(0, -1);
  }
};

const readRuntimeConfig = (filepath, { logged = false, checkConfig = true } = {}) => {
  const rawRuntimeConfig = filepath ? tryReadJsonSync(filepath) : null;
  if (checkConfig && !rawRuntimeConfig) {
    return fail(`failed reading runtime configuration, run setup`);
  }
  if (logged && filepath) {
    logger.info("using runtime config", filepath);
  }

  return rawRuntimeConfig
    ? Object.values(CONFIG_INFOS).reduce((result, info) => {
        const value = rawRuntimeConfig[info.config];
        if (value) {
          result[info.config] = value;
        }
        return result;
      }, Object.create(null))
    : {};
};

const _readRawAppPersistedCache = (location, filepath, orgGuid, spaceGuid, appName) => {
  const fullCache = tryReadJsonSync(filepath) || {};
  const appKey = orgGuid + "##" + spaceGuid + "##" + appName;
  if (!Object.prototype.hasOwnProperty.call(fullCache, appKey)) {
    return null;
  }
  const appCache = fullCache[appKey];
  const isOverdue = Date.now() - new Date(appCache.timestamp).getTime() > CACHE_GAP;
  if (isOverdue) {
    return null;
  }
  if (appCache.version !== version) {
    return null;
  }
  logger.info(`using ${location.toLowerCase()} cache for "${appName}"`);
  return appCache;
};

const _writeRawAppPersistedCache = (newRuntimeCache, filepath, orgGuid, spaceGuid, appName) => {
  const fullCache = tryReadJsonSync(filepath) || {};
  const appKey = orgGuid + "##" + spaceGuid + "##" + appName;
  fullCache[appKey] = newRuntimeCache;
  try {
    writeJsonSync(filepath, fullCache);
  } catch (err) {
    fail("caught error while writing app cache:", err.message);
  }
};

const _cfSsh = async (appName, { logged, localPort, remotePort, remoteHostname, appInstance, command } = {}) => {
  const args = [CF.EXEC, "ssh", appName];
  if (localPort !== undefined && localPort !== null && remotePort !== undefined && remotePort !== null) {
    args.push(
      "-L",
      localPort + ":" + (remoteHostname || "0.0.0.0") + ":" + remotePort,
      "--skip-remote-execution",
      "--disable-pseudo-tty"
    );
  }
  if (appInstance !== undefined && appInstance !== null) {
    args.push("--app-instance-index", appInstance);
  }
  if (command !== undefined && command !== null) {
    args.push("--command", command);
  }
  logged && logger.info("running", args.join(" "));
  try {
    const [stdout, stderr] = await _run(...args);
    logged && stderr && logger.error(stderr);
    logged && stdout && logger.info(stdout);
    return [stdout, stderr];
  } catch (err) {
    return fail(
      "caught error during cf ssh: %s",
      [err.message, err.stdout, err.stderr].filter((s) => s && s.length).join("\n")
    );
  }
};

const _cfMergeBuckets = (buckets, key) => buckets.reduce((acc, bucket) => ((acc = acc.concat(bucket[key])), acc), []);

const newContext = async ({ usePersistedCache = true, isReadonlyCommand = false } = {}) => {
  const cfInfo = { config: _readCfConfig(), token: await _cfAuthToken() };
  const { filepath: configPath, dir, location } = _resolveDir(FILENAME.CONFIG) || {};
  const runtimeConfig = readRuntimeConfig(configPath);
  const cachePath = pathlib.join(dir, FILENAME.CACHE);
  const { resources: cfApps } = await _cfRequestPaged(cfInfo, `/v3/apps?space_guids=${cfInfo.config.SpaceFields.GUID}`);
  const cfTokenCache = new ExpiringLazyCache({ expirationGap: UAA_TOKEN_CACHE_EXPIRY_GAP });
  const settingTypeToAppNameCache = new LazyCache();
  const appNameToCfAppCache = new LazyCache();
  let rawAppMemoryCache = {};

  const _cfServiceInfoMaps = makeOneTime(async () => {
    const { resources: cfServicePlans, included: cfServiceOfferingBuckets } = await _cfRequestPaged(
      cfInfo,
      `/v3/service_plans?include=service_offering`
    );
    const cfServiceOfferings = _cfMergeBuckets(cfServiceOfferingBuckets, "service_offerings");
    return {
      cfServiceOfferingsById: indexByKey(cfServiceOfferings, "guid"),
      cfServicePlansById: indexByKey(cfServicePlans, "guid"),
    };
  });

  const getRawAppInfo = async (cfApp) => {
    const cfBuildpack = cfApp.lifecycle?.data?.buildpacks?.[0];
    const [
      { cfServiceOfferingsById, cfServicePlansById },
      { var: cfEnvVariables },
      { resources: cfProcesses },
      { resources: cfRoutes, included: cfRouteDomainBuckets },
      { resources: cfBindingStubsRaw, included: cfServiceInstancesBuckets },
    ] = await Promise.all([
      _cfServiceInfoMaps(),
      _cfRequest(cfInfo, cfApp.links.environment_variables.href),
      _cfRequestPaged(cfInfo, cfApp.links.processes.href),
      _cfRequestPaged(cfInfo, `/v3/routes?app_guids=${cfApp.guid}&include=domain`),
      _cfRequestPaged(cfInfo, `/v3/service_credential_bindings?app_guids=${cfApp.guid}&include=service_instance`),
    ]);

    const cfRouteDomains = _cfMergeBuckets(cfRouteDomainBuckets, "domains");
    const cfRouteDomainsById = indexByKey(cfRouteDomains, "guid");
    const cfServiceInstances = _cfMergeBuckets(cfServiceInstancesBuckets, "service_instances").filter(
      (instance) => instance.type === "managed"
    );
    const cfServiceInstancesById = indexByKey(cfServiceInstances, "guid");
    const cfBindingStubs = cfBindingStubsRaw.filter((stub) =>
      Object.prototype.hasOwnProperty.call(cfServiceInstancesById, stub.relationships.service_instance.data.guid)
    );

    const cfBindings = await limiter(CF_API_CONCURRENCY, cfBindingStubs, async (stub) => {
      const instance = cfServiceInstancesById[stub.relationships.service_instance.data.guid];
      const plan = cfServicePlansById[instance.relationships.service_plan.data.guid];
      const offering = cfServiceOfferingsById[plan.relationships.service_offering.data.guid];
      const details = await _cfRequest(cfInfo, stub.links.details.href);
      return {
        id: stub.guid,
        createdAt: stub.created_at,
        updatedAt: stub.updated_at,
        offeringId: offering.guid,
        offeringName: offering.name,
        planId: plan.guid,
        planName: plan.name,
        instanceId: instance.guid,
        instanceName: instance.name,
        credentials: details.credentials,
      };
    });

    const cfProcess = cfProcesses?.[0];
    const cfRoute = cfRoutes?.[0];
    const cfRouteDomain = cfRouteDomainsById[cfRoute?.relationships.domain?.data.guid];

    return {
      timestamp: new Date().toISOString(),
      version,
      cfApp,
      cfBuildpack,
      cfEnvVariables,
      cfProcess,
      cfRoute,
      cfRouteDomain,
      cfBindings,
    };
  };

  const getRawAppInfoCached = async (cfApp) => {
    const { name: appName } = cfApp;
    // check memory cache
    if (!Object.prototype.hasOwnProperty.call(rawAppMemoryCache, appName)) {
      // check persisted cache
      let rawAppPersistedCache = usePersistedCache
        ? _readRawAppPersistedCache(
            location,
            cachePath,
            cfInfo.config.OrganizationFields.GUID,
            cfInfo.config.SpaceFields.GUID,
            appName
          )
        : null;
      if (!rawAppPersistedCache) {
        // get fresh data
        rawAppPersistedCache = await getRawAppInfo(cfApp);
        // update persisted cache
        _writeRawAppPersistedCache(
          rawAppPersistedCache,
          cachePath,
          cfInfo.config.OrganizationFields.GUID,
          cfInfo.config.SpaceFields.GUID,
          appName
        );
      }
      // update memory cache
      rawAppMemoryCache[appName] = rawAppPersistedCache;
    }
    return rawAppMemoryCache[appName];
  };

  const processRawAppInfo = (appName, rawAppInfo, { requireServices, requireRoute } = {}) => {
    const { cfApp, cfBuildpack, cfBindings, cfEnvVariables, cfRoute, cfRouteDomain, cfProcess } = rawAppInfo;

    let cfBinding = null;
    if (Array.isArray(requireServices)) {
      assert(cfBindings, "no service binding information in environment, check cf user permissions");
      const matchingServices = requireServices
        .map((service) =>
          cfBindings.find((binding) => service.label === binding.offeringName && service.plan === binding.planName)
        )
        .filter((a) => a !== undefined);
      cfBinding = matchingServices.length > 0 ? matchingServices[0] : null;
      assert(
        cfBinding,
        `could not access required service-bindings for app "${appName}" services "${JSON.stringify(requireServices)}"`
      );
    }

    const cfRouteUrl =
      cfRoute &&
      cfRouteDomain &&
      urllib.format({
        protocol: "https",
        host: `${cfRoute.host === "*" ? cfInfo.config.OrganizationFields.Name : cfRoute.host}.${cfRouteDomain.name}`,
      });
    if (requireRoute) {
      assert(cfRouteUrl, `could not obtain required route url for app "${appName}"`);
    }

    const cfSsh = async (options) => _cfSsh(appName, options);

    const cfAppName = cfApp.name;
    const cfAppGuid = cfApp.guid;
    return {
      cfAppName,
      cfAppGuid,
      cfBuildpack,
      cfProcess,
      cfBinding,
      cfBindings,
      cfEnvVariables,
      cfRouteUrl,
      cfSsh,
    };
  };

  const _getAppNameFromSettingType = (type) =>
    settingTypeToAppNameCache.getSetCb(type, () => {
      const setting = CONFIG_INFOS[type];

      // determine configured appName
      const configAppName = runtimeConfig[setting.config];
      const envAppName = (setting.envVariable && process.env[setting.envVariable]) || null;
      if (envAppName && configAppName !== envAppName) {
        if (configAppName) {
          logger.info(
            'overriding configured %s "%s" with "%s" from environment variable %s',
            setting.name,
            configAppName,
            envAppName,
            setting.envVariable
          );
        } else {
          logger.info('using %s "%s" from environment variable %s', setting.name, envAppName, setting.envVariable);
        }
      }
      const appName = envAppName || configAppName;
      assert(appName, setting.failMessage);
      return appName;
    });

  const _getAppNameCandidates = (appName) => {
    const appSuffixes = isReadonlyCommand ? APP_SUFFIXES_READONLY : APP_SUFFIXES;

    return appSuffixes.map((suffix) => {
      const label = appName + suffix;
      const isTemplate = /{UUID}/g.test(label);
      let regexp;
      if (isTemplate) {
        const [front, back] = label.split("{UUID}");
        regexp = new RegExp(
          escapeRegExp(front) +
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" +
            escapeRegExp(back)
        );
      }
      return {
        suffix,
        label,
        regexp,
      };
    });
  };

  const _getCfAppFromAppName = (appName) =>
    appNameToCfAppCache.getSetCb(appName, () => {
      // determine matching cfApp considering suffixes
      // NOTE: the appNameCandidates order should take precedence over cfApps order.
      const appNameCandidates = _getAppNameCandidates(appName);
      let cfApp;
      let cfAppSuffix;
      for (const { suffix, label, regexp } of appNameCandidates) {
        cfApp = regexp ? cfApps.find(({ name }) => regexp.test(name)) : cfApps.find(({ name }) => label === name);
        if (cfApp) {
          cfAppSuffix = suffix;
          break;
        }
      }

      assert(
        cfApp,
        `no cf app found for name "${appName}", tried candidates "${appNameCandidates.map(({ label }) => label)}"`
      );
      if (appName !== cfApp.name) {
        logger.info('using app "%s" based on suffix "%s"', cfApp.name, cfAppSuffix);
      }
      return cfApp;
    });

  const getAppInfoCached = (type) => async () => {
    const appName = _getAppNameFromSettingType(type);

    const cfApp = _getCfAppFromAppName(appName);
    const rawAppInfo = await getRawAppInfoCached(cfApp);
    const setting = CONFIG_INFOS[type];
    return processRawAppInfo(cfApp.name, rawAppInfo, setting);
  };

  const getAppNameInfoCached = async (appName, setting) => {
    assert(appName, "used getAppNameInfoCached without appName parameter");

    const cfApp = _getCfAppFromAppName(appName);
    const rawAppInfo = await getRawAppInfoCached(cfApp);
    return processRawAppInfo(cfApp.name, rawAppInfo, setting);
  };

  const getUaaInfo = makeOneTime(getAppInfoCached(CONFIG_TYPE.UAA_APP));
  const getRegInfo = makeOneTime(getAppInfoCached(CONFIG_TYPE.REGISTRY_APP));
  const hasRegInfo = Object.prototype.hasOwnProperty.call(runtimeConfig, CONFIG_INFOS[CONFIG_TYPE.REGISTRY_APP].config);
  const getSmsInfo = makeOneTime(getAppInfoCached(CONFIG_TYPE.SMS_APP));
  const hasSmsInfo = Object.prototype.hasOwnProperty.call(runtimeConfig, CONFIG_INFOS[CONFIG_TYPE.SMS_APP].config);
  const getCdsInfo = makeOneTime(getAppInfoCached(CONFIG_TYPE.CDS_APP));
  const getHdiInfo = makeOneTime(getAppInfoCached(CONFIG_TYPE.HDI_APP));
  const getSrvInfo = makeOneTime(getAppInfoCached(CONFIG_TYPE.SERVER_APP));

  const getCachedUaaTokenFromCredentials = async (credentials, options) =>
    await cfTokenCache.getSetCb(
      credentials.clientid,
      async () => await oauth.getUaaTokenFromCredentials(credentials, options),
      {
        expirationExtractor: ({ expires_in }) => Date.now() + expires_in * 1000,
        valueExtractor: ({ access_token }) => access_token,
      }
    );

  const getCachedIasTokenFromCredentials = async (credentials, options) =>
    await cfTokenCache.getSetCb(
      credentials.clientid,
      async () => await oauth.getIasTokenFromCredentials(credentials, options),
      {
        expirationExtractor: ({ expires_in }) => Date.now() + expires_in * 1000,
        valueExtractor: ({ access_token }) => access_token,
      }
    );

  const getCfEnv = async (appName) => {
    const cfApp = _getCfAppFromAppName(appName);
    return await _cfRequest(cfInfo, `/v3/apps/${cfApp.guid}/env`);
  };

  return {
    runtimeConfig,
    getUaaInfo,
    getRegInfo,
    hasRegInfo,
    getSmsInfo,
    hasSmsInfo,
    getCdsInfo,
    getHdiInfo,
    getSrvInfo,
    getCfEnv,
    getCachedUaaTokenFromCredentials,
    getCachedIasTokenFromCredentials,
    getAppNameInfoCached,
  };
};

module.exports = {
  newContext,
  readRuntimeConfig,
};

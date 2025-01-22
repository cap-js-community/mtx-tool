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
} = require("./shared/static");
const { assert, fail } = require("./shared/error");
const { request } = require("./shared/request");
const { getUaaTokenFromCredentials: sharedUaaTokenFromCredentials } = require("./shared/oauth");
const { LazyCache, ExpiringLazyCache } = require("./shared/cache");
const { SETTING_TYPE, SETTING } = require("./setting");
const { Logger } = require("./shared/logger");

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

const CACHE_GAP = 43200000; // 12 hours in milliseconds
const UAA_TOKEN_CACHE_EXPIRY_GAP = 60000; // 1 minute

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

const _cfRequest = async (cfInfo, path) => {
  try {
    const response = await request({
      url: cfInfo.config.Target,
      path,
      headers: {
        Accept: "application/json",
        Authorization: cfInfo.token,
      },
      logged: false,
    });
    return await response.json();
  } catch (err) {
    return fail("caught error during cf request %s\n%s", path, err.message);
  }
};

const _cfRequestPaged = async (cfInfo, path) => {
  let result = [];
  while (true) {
    const { pagination, resources } = await _cfRequest(cfInfo, path);
    if (resources) {
      result = result.concat(resources);
    } else {
      break;
    }
    if (pagination && pagination.next && pagination.next.href) {
      const { path: nextPath } = urllib.parse(pagination.next.href);
      path = nextPath;
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
    ? Object.values(SETTING).reduce((result, value) => {
        result[value.config] = rawRuntimeConfig[value.config];
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

const _cfSsh = async (appName, { localPort, remotePort, remoteHostname, appInstance, command } = {}) => {
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
  logger.info("running", args.join(" "));
  try {
    const [stdout, stderr] = await _run(...args);
    stderr && logger.error(stderr);
    stdout && logger.info(stdout);
    return [stdout, stderr];
  } catch (err) {
    return fail(
      "caught error during cf ssh: %s",
      [err.message, err.stdout, err.stderr].filter((s) => s && s.length).join("\n")
    );
  }
};

const _getCfApps = async (cfInfo) => _cfRequestPaged(cfInfo, `/v3/apps?space_guids=${cfInfo.config.SpaceFields.GUID}`);

const newContext = async ({ usePersistedCache = true, isReadonlyCommand = false } = {}) => {
  const cfInfo = { config: _readCfConfig(), token: await _cfAuthToken() };
  const { filepath: configPath, dir, location } = _resolveDir(FILENAME.CONFIG) || {};
  const runtimeConfig = readRuntimeConfig(configPath);
  const cachePath = pathlib.join(dir, FILENAME.CACHE);
  const cfApps = await _getCfApps(cfInfo);
  const cfUaaTokenCache = new ExpiringLazyCache({ expirationGap: UAA_TOKEN_CACHE_EXPIRY_GAP });
  const settingTypeToAppNameCache = new LazyCache();
  const appNameToCfAppCache = new LazyCache();
  let rawAppMemoryCache = {};

  const getRawAppInfo = async (cfApp) => {
    const cfBuildpack = cfApp.lifecycle?.data?.buildpacks?.[0];
    const cfEnv = await _cfRequest(cfInfo, `/v3/apps/${cfApp.guid}/env`);
    const [cfProcess] = await _cfRequestPaged(cfInfo, `/v3/apps/${cfApp.guid}/processes`);
    const cfEnvServices = cfEnv.system_env_json?.VCAP_SERVICES;
    const cfEnvApp = cfEnv.application_env_json?.VCAP_APPLICATION;
    const cfEnvVariables = cfEnv.environment_variables;

    const cfRoutes = await _cfRequestPaged(cfInfo, `/v3/apps/${cfApp.guid}/routes`);
    const cfRoute = cfRoutes?.[0];
    const cfDomainGuid = cfRoute?.relationships?.domain?.data?.guid;
    const cfRouteDomain = cfDomainGuid && (await _cfRequest(cfInfo, `/v3/domains/${cfDomainGuid}`));

    return {
      timestamp: new Date().toISOString(),
      version,
      cfApp,
      cfProcess,
      cfBuildpack,
      cfEnvServices,
      cfEnvApp,
      cfEnvVariables,
      cfRoute,
      cfRouteDomain,
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
    const { cfApp, cfBuildpack, cfEnvServices, cfEnvApp, cfEnvVariables, cfRoute, cfRouteDomain, cfProcess } =
      rawAppInfo;

    let cfService = null;
    if (Array.isArray(requireServices)) {
      assert(cfEnvServices, "no vcap service information in environment, check cf user permissions");
      const cfEnvServicesFlat = [].concat(...Object.values(cfEnvServices));
      const matchingServices = requireServices
        .map(({ label: aLabel, plan: aPlan }) =>
          cfEnvServicesFlat.find(({ label: bLabel, plan: bPlan }) => aLabel === bLabel && aPlan === bPlan)
        )
        .filter((a) => a !== undefined);
      cfService = matchingServices.length > 0 ? matchingServices[0] : null;
      assert(
        cfService,
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
      cfEnvServices,
      cfEnvApp,
      cfEnvVariables,
      cfService,
      cfRouteUrl,
      cfSsh,
    };
  };

  const _getAppNameFromSettingType = (type) =>
    settingTypeToAppNameCache.getSetCb(type, () => {
      const setting = SETTING[type];

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
    const setting = SETTING[type];
    return processRawAppInfo(cfApp.name, rawAppInfo, setting);
  };

  const getAppNameInfoCached = async (appName, setting) => {
    assert(appName, "used getAppNameInfoCached without appName parameter");

    const cfApp = _getCfAppFromAppName(appName);
    const rawAppInfo = await getRawAppInfoCached(cfApp);
    return processRawAppInfo(cfApp.name, rawAppInfo, setting);
  };

  const getUaaInfo = makeOneTime(getAppInfoCached(SETTING_TYPE.UAA_APP));
  const getRegInfo = makeOneTime(getAppInfoCached(SETTING_TYPE.REGISTRY_APP));
  const getCdsInfo = makeOneTime(getAppInfoCached(SETTING_TYPE.CDS_APP));
  const getHdiInfo = makeOneTime(getAppInfoCached(SETTING_TYPE.HDI_APP));
  const getSrvInfo = makeOneTime(getAppInfoCached(SETTING_TYPE.SERVER_APP));

  const getCachedUaaTokenFromCredentials = async (credentials, options) =>
    await cfUaaTokenCache.getSetCb(
      credentials.clientid,
      async () => await sharedUaaTokenFromCredentials(credentials, options),
      {
        expirationExtractor: ({ expires_in }) => Date.now() + expires_in * 1000,
        valueExtractor: ({ access_token }) => access_token,
      }
    );

  const getCachedUaaToken = async (options) => {
    const {
      cfService: { credentials },
    } = await getUaaInfo();
    return getCachedUaaTokenFromCredentials(credentials, options);
  };

  return {
    runtimeConfig,
    getUaaInfo,
    getRegInfo,
    getCdsInfo,
    getHdiInfo,
    getSrvInfo,
    getCachedUaaTokenFromCredentials,
    getCachedUaaToken,
    getAppNameInfoCached,
  };
};

module.exports = {
  newContext,
  readRuntimeConfig,
};

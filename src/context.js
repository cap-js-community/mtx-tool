"use strict";

const urllib = require("url");
const pathlib = require("path");
const os = require("os");
const { version } = require("../package.json");

const { tryReadJsonSync, tryAccessSync, writeJsonSync, indexByKey } = require("./shared/static");
const { makeOneTime } = require("./shared/execution-control");
const { assert, fail } = require("./shared/error");
const oauth = require("./shared/oauth");
const { LazyCache, ExpiringLazyCache } = require("./shared/cache");
const { Logger } = require("./shared/logger");
const { CONFIG_TYPE, CONFIG_INFOS } = require("./config");
const { limiter } = require("./shared/funnel");
const { CloudFoundry } = require("./shared/cloud-foundry");

const ENV = Object.freeze({
  APP_SUFFIX: "MTX_APP_SUFFIX",
});

const EXTRA_APP_SUFFIXES = process.env[ENV.APP_SUFFIX] ? [process.env[ENV.APP_SUFFIX]] : [];

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

const _resolveDir = (filename) => {
  const home = os.homedir();
  let subdirs = process.cwd().split(pathlib.sep);
  while (true) {
    const dir = subdirs.length === 0 ? home : subdirs.join(pathlib.sep);
    const filepath = dir + pathlib.sep + filename;
    if (tryAccessSync(filepath)) {
      return {
        dir,
        filepath,
        location: dir === home ? LOCATION.GLOBAL : LOCATION.LOCAL,
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

const _cfMergeBuckets = (buckets, key) => buckets.reduce((acc, bucket) => ((acc = acc.concat(bucket[key])), acc), []);

const newContext = async ({ usePersistedCache = true, isReadonlyCommand = false } = {}) => {
  const cf = CloudFoundry.getSingleton({ extraAppSuffixes: EXTRA_APP_SUFFIXES });
  const { filepath: configPath, dir, location } = _resolveDir(FILENAME.CONFIG) || {};
  const runtimeConfig = readRuntimeConfig(configPath);
  const cachePath = pathlib.join(dir, FILENAME.CACHE);
  const cfTokenCache = new ExpiringLazyCache({ expirationGap: UAA_TOKEN_CACHE_EXPIRY_GAP });
  const settingTypeToAppNameCache = new LazyCache();
  const rawAppMemoryCache = new LazyCache();

  const _cfServiceInfoMaps = makeOneTime(async () => {
    const { resources: cfServicePlans, included: cfServiceOfferingBuckets } = await cf.requestPaged(
      `/v3/service_plans?include=service_offering`
    );
    const cfServiceOfferings = _cfMergeBuckets(cfServiceOfferingBuckets, "service_offerings");
    return {
      cfServiceOfferingsById: indexByKey(cfServiceOfferings, "guid"),
      cfServicePlansById: indexByKey(cfServicePlans, "guid"),
    };
  });

  const getRawAppInfo = async (appName) => {
    const cfApp = await cf.getAppByName(appName, { isReadonlyCommand });
    const cfBuildpack = cfApp.lifecycle?.data?.buildpacks?.[0];
    const [
      { cfServiceOfferingsById, cfServicePlansById },
      { resources: cfProcesses },
      { resources: cfRoutes, included: cfRouteDomainBuckets },
      { resources: cfBindingStubsRaw, included: cfServiceInstancesBuckets },
    ] = await Promise.all([
      _cfServiceInfoMaps(),
      cf.requestPaged(`/v3/apps/${cfApp.guid}/processes`),
      cf.requestPaged(`/v3/routes?app_guids=${cfApp.guid}&include=domain`),
      cf.requestPaged(`/v3/service_credential_bindings?app_guids=${cfApp.guid}&include=service_instance`),
    ]);

    const cfRouteDomains = _cfMergeBuckets(cfRouteDomainBuckets, "domains");
    const cfRouteDomainsById = indexByKey(cfRouteDomains, "guid");
    const cfServiceInstances = _cfMergeBuckets(cfServiceInstancesBuckets, "service_instances");
    const cfServiceInstancesById = indexByKey(cfServiceInstances, "guid");
    const cfBindingStubs = cfBindingStubsRaw.filter((stub) =>
      Object.prototype.hasOwnProperty.call(cfServiceInstancesById, stub.relationships.service_instance.data.guid)
    );

    const cfBindings = await limiter(CF_API_CONCURRENCY, cfBindingStubs, async (stub) => {
      const instance = cfServiceInstancesById[stub.relationships.service_instance.data.guid];
      const details = await cf.request(`/v3/service_credential_bindings/${stub.guid}/details`);
      const result = {
        id: stub.guid,
        createdAt: stub.created_at,
        updatedAt: stub.updated_at,
        instanceId: instance.guid,
        instanceName: instance.name,
        instanceType: instance.type,
        instanceTags: instance.tags ?? [],
        credentials: details.credentials ?? {},
      };

      if (instance.type === "managed") {
        const plan = cfServicePlansById[instance.relationships.service_plan.data.guid];
        const offering = cfServiceOfferingsById[plan.relationships.service_offering.data.guid];
        Object.assign(result, {
          offeringId: offering.guid,
          offeringName: offering.name,
          planId: plan.guid,
          planName: plan.name,
        });
      }

      return result;
    });

    const cfProcess = cfProcesses?.[0];
    const cfRoute = cfRoutes?.[0];
    const cfRouteDomain = cfRouteDomainsById[cfRoute?.relationships.domain?.data.guid];

    return {
      timestamp: new Date().toISOString(),
      version,
      cfApp,
      cfBuildpack,
      cfProcess,
      cfRoute,
      cfRouteDomain,
      cfBindings,
    };
  };

  const getRawAppInfoCached = async (appName) => {
    // NOTE: both for the memory and persisted cache we use the user-familiar appName from settings and not the
    //   _actual_ appName. In getRawAppInfo, the settings appName gets resolved to cfApp, which has the real name.
    return await rawAppMemoryCache.getSetCb(appName, async () => {
      // check persisted cache
      let rawAppPersistedCache = usePersistedCache
        ? _readRawAppPersistedCache(location, cachePath, cf.orgGuid, cf.spaceGuid, appName)
        : null;
      if (!rawAppPersistedCache) {
        // get fresh data
        rawAppPersistedCache = await getRawAppInfo(appName);
        // update persisted cache
        _writeRawAppPersistedCache(rawAppPersistedCache, cachePath, cf.orgGuid, cf.spaceGuid, appName);
      }
      return rawAppPersistedCache;
    });
  };

  const processRawAppInfo = (appName, rawAppInfo, { requireServices, requireRoute } = {}) => {
    const { cfApp, cfBuildpack, cfBindings, cfRoute, cfRouteDomain, cfProcess } = rawAppInfo;

    let cfBinding = null;
    if (Array.isArray(requireServices)) {
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
        host: `${cfRoute.host === "*" ? cf.orgName : cfRoute.host}.${cfRouteDomain.name}`,
      });
    if (requireRoute) {
      assert(cfRouteUrl, `could not obtain required route url for app "${appName}"`);
    }

    const cfSsh = async (options) => await cf.ssh(cfApp.name, options);

    return {
      cfAppName: cfApp.name,
      cfAppGuid: cfApp.guid,
      cfBuildpack,
      cfProcess,
      cfBinding,
      cfBindings,
      cfRouteUrl,
      cfSsh,
    };
  };

  const _getAppNameFromSettingType = (type, setting) =>
    settingTypeToAppNameCache.getSetCb(type, () => {
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

  const getAppInfoCached = (type) => async () => {
    const setting = CONFIG_INFOS[type];
    const appName = _getAppNameFromSettingType(type, setting);
    return await getAppNameInfoCached(appName, setting);
  };

  const getAppNameInfoCached = async (appName, setting) => {
    assert(appName, "used getAppNameInfoCached without appName parameter");

    const rawAppInfo = await getRawAppInfoCached(appName);
    return processRawAppInfo(appName, rawAppInfo, setting);
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
    getCfEnv: (appName) => cf.getAppEnv(appName, { isReadonlyCommand }),
    getCfBoundApps: (instanceId) => cf.getBoundApps(instanceId),
    cfRollingRestart: (cfApp) => cf.rollingRestart(cfApp),
    getCachedUaaTokenFromCredentials,
    getCachedIasTokenFromCredentials,
    getAppNameInfoCached,
  };
};

module.exports = {
  newContext,
  readRuntimeConfig,
};

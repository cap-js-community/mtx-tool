"use strict";

const urllib = require("url");
const pathlib = require("path");
const {
  writeFileSync,
  unlinkSync,
  constants: { R_OK },
} = require("fs");
const { version } = require("../package.json");

const { question, guardedAccess, tryReadJsonSync, tryAccessSync, spawnAsync } = require("./shared/static");
const { assert, fail } = require("./shared/error");
const { request } = require("./shared/request");
const { getUaaTokenFromCredentials: sharedUaaTokenFromCredentials } = require("./shared/oauth");
const { ExpiringLazyCache } = require("./shared/cache");

const APP_SUFFIXES = ["-blue", "-green"];
const APP_SUFFIXES_READONLY = ["-blue", "-green", "-live"];
const HOME = process.env.HOME || process.env.USERPROFILE;
const CF = Object.freeze({
  EXEC: "cf",
  HOME: process.env.CF_HOME || HOME,
});

const LOCATION = Object.freeze({
  LOCAL: "LOCAL",
  GLOBAL: "GLOBAL",
});
const LOCATION_DIR = Object.freeze({
  [LOCATION.LOCAL]: process.cwd(),
  [LOCATION.GLOBAL]: HOME,
});
const FILENAME = Object.freeze({
  CONFIG: ".mtxrc.json",
  CACHE: ".mtxcache.json",
});

const SETTING_TYPE = {
  UAA: "uaaAppName",
  REG: "regAppName",
  CDS: "cdsAppName",
  HDI: "hdiAppName",
  SRV: "srvAppName",
};
const SETTING = require("./SETTING");

const CACHE_GAP = 43200000; // 12 hours in milliseconds
const UAA_TOKEN_CACHE_EXPIRY_GAP = 60000; // 1 minute

const _run = async (command, ...args) => {
  return spawnAsync(command, args, {
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
  console.log(`targeting cf api ${Target} / org "${OrganizationFields.Name}" / space "${SpaceFields.Name}"`);
  return cfConfig;
};

const _resolveDir = (filename) => {
  let subdirs = process.cwd().split(pathlib.sep);
  while (true) {
    const dir = subdirs.length === 0 ? HOME : subdirs.join(pathlib.sep);
    const filepath = dir + pathlib.sep + filename;
    if (tryAccessSync(filepath, R_OK)) {
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

const _readRuntimeConfig = (filepath, { logged = false, checkConfig = true } = {}) => {
  const rawRuntimeConfig = filepath ? tryReadJsonSync(filepath) : null;
  if (checkConfig && !rawRuntimeConfig) {
    return fail(`failed reading runtime configuration, run setup`);
  }
  if (logged && filepath) {
    console.log("using runtime config", filepath);
  }

  return rawRuntimeConfig
    ? Object.keys(SETTING).reduce((result, key) => {
        result[key] = rawRuntimeConfig[key];
        return result;
      }, Object.create(null))
    : {};
};

const _writeRuntimeConfig = async (runtimeConfig, filepath) => {
  try {
    writeFileSync(filepath, JSON.stringify(runtimeConfig, null, 2) + "\n");
    console.log("wrote runtime config");
  } catch (err) {
    fail("caught error while writing runtime config:", err.message);
  }
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
  console.log(`using ${location.toLowerCase()} cache for "${appName}"`);
  return appCache;
};

const _writeRawAppPersistedCache = (newRuntimeCache, filepath, orgGuid, spaceGuid, appName) => {
  const fullCache = tryReadJsonSync(filepath) || {};
  const appKey = orgGuid + "##" + spaceGuid + "##" + appName;
  fullCache[appKey] = newRuntimeCache;
  try {
    writeFileSync(filepath, JSON.stringify(fullCache, null, 2) + "\n");
  } catch (err) {
    fail("caught error while writing app cache:", err.message);
  }
};

const _setup = async (location) => {
  const dir = LOCATION_DIR[location];
  const filepath = pathlib.join(dir, FILENAME.CONFIG);
  const runtimeConfig = _readRuntimeConfig(filepath, { logged: true, checkConfig: false });

  const newRuntimeConfig = {};
  console.log("hit enter to skip a question. re-using the same app for multiple questions is possible.");
  try {
    const settings = Object.entries(SETTING);
    for (let i = 0; i < settings.length; i++) {
      const [key, value] = settings[i];
      const ask = `${i + 1}/${settings.length} | ${value.question}`;
      const answer = (await question(ask, runtimeConfig[key])).trim();
      if (answer) {
        newRuntimeConfig[key] = answer;
      }
    }
  } catch (err) {
    fail();
  }
  return _writeRuntimeConfig(newRuntimeConfig, filepath);
};

const setup = async () => {
  return _setup(LOCATION.GLOBAL);
};

const setupLocal = async () => {
  return _setup(LOCATION.LOCAL);
};

const setupList = () => {
  const { filepath } = _resolveDir(FILENAME.CONFIG) || {};
  const runtimeConfig = _readRuntimeConfig(filepath, { logged: true });
  return Object.entries(SETTING)
    .map(
      ([key, value], i, settings) =>
        `${i + 1}/${settings.length} | ${value.question} ${runtimeConfig[key] || "<empty>"}`
    )
    .join("\n");
};

const setupCleanCache = async () => {
  while (true) {
    const { filepath, location } = _resolveDir(FILENAME.CACHE) || {};
    if (!filepath) {
      break;
    }
    try {
      unlinkSync(filepath);
      console.log(`removed ${location.toLowerCase()} cache`, filepath);
    } catch (err) {
      fail(`could not remove ${filepath}`);
    }
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
  console.log("running", args.join(" "));
  try {
    return await _run(...args);
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
  const runtimeConfig = _readRuntimeConfig(configPath);
  const cachePath = pathlib.join(dir, FILENAME.CACHE);
  const cfApps = await _getCfApps(cfInfo);
  const cfUaaTokenCache = new ExpiringLazyCache({ expirationGap: UAA_TOKEN_CACHE_EXPIRY_GAP });
  let rawAppMemoryCache = {};

  const _getAppNameCandidates = (appName) => [
    appName,
    ...(isReadonlyCommand ? APP_SUFFIXES_READONLY : APP_SUFFIXES).map((suffix) => appName + suffix),
  ];

  const getRawAppInfo = async (cfApp) => {
    const cfBuildpack = guardedAccess(cfApp, "lifecycle", "data", "buildpacks", 0);
    const cfEnv = await _cfRequest(cfInfo, `/v3/apps/${cfApp.guid}/env`);
    const [cfProcess] = await _cfRequestPaged(cfInfo, `/v3/apps/${cfApp.guid}/processes`);
    const cfEnvServices = guardedAccess(cfEnv, "system_env_json", "VCAP_SERVICES");
    const cfEnvApp = guardedAccess(cfEnv, "application_env_json", "VCAP_APPLICATION");
    const cfEnvVariables = guardedAccess(cfEnv, "environment_variables");

    const cfRoutes = await _cfRequestPaged(cfInfo, `/v3/apps/${cfApp.guid}/routes`);
    const cfRoute = guardedAccess(cfRoutes, "0");
    const cfDomainGuid = guardedAccess(cfRoute, "relationships", "domain", "data", "guid");
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

  const processRawAppInfo = (appName, rawAppInfo, setting) => {
    const { cfApp, cfBuildpack, cfEnvServices, cfEnvApp, cfEnvVariables, cfRoute, cfRouteDomain, cfProcess } =
      rawAppInfo;
    const { requireServices, requireRoute } = setting || {};

    let cfService = null;
    if (Array.isArray(requireServices)) {
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

    const cfAppName = guardedAccess(cfApp, "name");
    const cfAppGuid = guardedAccess(cfApp, "guid");
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

  const getAppInfoCached = (type) => async () => {
    const setting = SETTING[type];

    // determine configured appName
    const configAppName = runtimeConfig[type];
    const envAppName = (setting.envVariable && process.env[setting.envVariable]) || null;
    if (envAppName && configAppName !== envAppName) {
      if (configAppName) {
        console.log(
          'overriding configured %s "%s" with "%s" from environment variable %s',
          setting.name,
          configAppName,
          envAppName,
          setting.envVariable
        );
      } else {
        console.log('using %s "%s" from environment variable %s', setting.name, envAppName, setting.envVariable);
      }
    }
    const appName = envAppName || configAppName;
    assert(appName, setting.failMessage);

    // determine matching cfApp considering suffixes
    const appNameCandidates = _getAppNameCandidates(appName);
    const cfApp = cfApps.find(({ name }) => appNameCandidates.includes(name));
    assert(cfApp, `no cf app found for name "${appName}", tried candidates "${appNameCandidates}"`);
    if (appName !== cfApp.name) {
      console.log('using app with special suffix "%s"', cfApp.name);
    }

    const rawAppInfo = await getRawAppInfoCached(cfApp);
    return processRawAppInfo(cfApp.name, rawAppInfo, setting);
  };

  const getAppNameInfoCached = async (appName, setting) => {
    assert(appName, "used getAppNameInfoCached without appName parameter");
    const cfApp = cfApps.find(({ name }) => name === appName);
    assert(cfApp, "could not find app with name %s", appName);
    const rawAppInfo = await getRawAppInfoCached(cfApp);
    return processRawAppInfo(appName, rawAppInfo, setting);
  };

  const getUaaInfo = getAppInfoCached(SETTING_TYPE.UAA);
  const getRegInfo = getAppInfoCached(SETTING_TYPE.REG);
  const getCdsInfo = getAppInfoCached(SETTING_TYPE.CDS);
  const getHdiInfo = getAppInfoCached(SETTING_TYPE.HDI);
  const getSrvInfo = getAppInfoCached(SETTING_TYPE.SRV);

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
  setup,
  setupLocal,
  setupList,
  setupCleanCache,
  newContext,
};

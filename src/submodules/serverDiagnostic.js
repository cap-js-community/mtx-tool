"use strict";

const { orderedStringify, writeTextSync } = require("../shared/static");
const { assert } = require("../shared/error");
const { request } = require("../shared/request");
const { Logger } = require("../shared/logger");

const BUILDPACK_INFO = {
  nodejs_buildpack: { runtime: "node", debugPort: 9229 },
  java_buildpack: { runtime: "java", debugPort: 8000 },
};
const DEFAULT_ENV_FILENAME = "default-env.json";

const logger = Logger.getInstance();

const _serverDebug = async (context, { appName, appInstance } = {}) => {
  const { cfBuildpack, cfAppGuid, cfRouteUrl, cfSsh } = appName
    ? await context.getAppNameInfoCached(appName)
    : await context.getSrvInfo();
  const cfBuildpackInfoKey =
    cfBuildpack &&
    Object.keys(BUILDPACK_INFO).find(
      (cfBuildpackName) =>
        cfBuildpack.includes(cfBuildpackName) || cfBuildpack.includes(cfBuildpackName.replace(/_/g, "-"))
    );
  const { runtime, debugPort: inferredPort } = (cfBuildpackInfoKey && BUILDPACK_INFO[cfBuildpackInfoKey]) || {};
  const localPort = inferredPort || 8000;

  let responseData = {};
  if (cfRouteUrl) {
    try {
      const token = await context.getCachedUaaToken();
      const response = await request({
        url: cfRouteUrl,
        pathname: "/info",
        auth: { token },
        ...(/\d+/.test(appInstance) && {
          headers: {
            "X-Cf-App-Instance": `${cfAppGuid}:${appInstance}`,
          },
        }),
        logged: false,
        checkStatus: false,
      });

      responseData = response.ok && (await response.json());
    } catch (err) {} // eslint-disable-line no-empty
  }
  const { instance, debugPort } = responseData;
  appInstance = appInstance || instance || "0";
  const remotePort = debugPort || inferredPort;
  assert(remotePort, `could not determine remote debugPort from /info or infer from buildpack`);

  logger.info();
  if (!debugPort) {
    logger.info(
      `could not determine remote debugPort from /info, falling back to ${cfBuildpack} default ${remotePort}`
    );
  }
  logger.info(`connect ${runtime ? runtime + " debugger" : "debugger"} on port ${localPort}`);
  logger.info(`use request header "X-Cf-App-Instance: ${cfAppGuid}:${appInstance}" to target this app instance`);
  logger.info();
  return cfSsh({ localPort, remotePort, appInstance });
};

const serverDebug = async (context, [appName, appInstance]) => _serverDebug(context, { appName, appInstance });

const serverEnvironment = async (context, [appName]) => {
  const { cfEnvServices, cfEnvApp, cfEnvVariables } = appName
    ? await context.getAppNameInfoCached(appName)
    : await context.getSrvInfo();
  writeTextSync(
    DEFAULT_ENV_FILENAME,
    orderedStringify({ VCAP_SERVICES: cfEnvServices, VCAP_APPLICATION: cfEnvApp, ...cfEnvVariables }, null, 2) + "\n"
  );
  logger.info(`saved system environment to ${DEFAULT_ENV_FILENAME}`);
};
const serverCertificates = async (context, [appName, appInstance = 0]) => {
  const { cfSsh, cfAppName } = appName ? await context.getAppNameInfoCached(appName) : await context.getSrvInfo();
  const dumpFile = async (cfFilename, localFilename) => {
    const [file] = await cfSsh({ command: `cat ${cfFilename}`, appInstance });
    writeTextSync(localFilename, file);
  };
  await dumpFile("$CF_INSTANCE_CERT", `certificate-${cfAppName}-${appInstance}.crt`);
  await dumpFile("$CF_INSTANCE_KEY", `certificate-${cfAppName}-${appInstance}.key`);
  logger.info("saved instance certificates");
};

const serverStartDebugger = async (context, [appName, appInstance]) => {
  const { cfSsh } = appName ? await context.getAppNameInfoCached(appName) : await context.getSrvInfo();
  return cfSsh({ command: "pkill --signal SIGUSR1 node", appInstance });
};

module.exports = {
  serverDebug,
  serverEnvironment,
  serverCertificates,
  serverStartDebugger,
};

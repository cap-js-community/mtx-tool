"use strict";

const { orderedStringify, writeTextSync } = require("../shared/static");
const { assert } = require("../shared/error");
const { Logger } = require("../shared/logger");

const RUNTIME = {
  NODE: "node",
  JAVA: "java",
};

const BUILDPACK_INFO = {
  nodejs_buildpack: { runtime: RUNTIME.NODE, debugPort: 9229 },
  java_buildpack: { runtime: RUNTIME.JAVA, debugPort: 8000 },
};
const DEFAULT_ENV_FILENAME = "default-env.json";

const logger = Logger.getInstance();

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
const serverCertificates = async (context, [appName, appInstance = "0"]) => {
  assert(/\d+/.test(appInstance), `argument "${appInstance}" is not a valid app instance`);
  const { cfSsh, cfAppName } = appName ? await context.getAppNameInfoCached(appName) : await context.getSrvInfo();
  const dumpFile = async (cfFilename, localFilename) => {
    const [file] = await cfSsh({ command: `cat ${cfFilename}`, appInstance });
    writeTextSync(localFilename, file);
  };
  await dumpFile("$CF_INSTANCE_CERT", `certificate-${cfAppName}-${appInstance}.crt`);
  await dumpFile("$CF_INSTANCE_KEY", `certificate-${cfAppName}-${appInstance}.key`);
  logger.info("saved instance certificates");
};

const _serverDebug = async (context, { appName, appInstance } = {}) => {
  const { cfBuildpack, cfAppGuid, cfSsh } = appName
    ? await context.getAppNameInfoCached(appName)
    : await context.getSrvInfo();
  const cfBuildpackInfoKey =
    cfBuildpack &&
    Object.keys(BUILDPACK_INFO).find(
      (cfBuildpackName) =>
        cfBuildpack.includes(cfBuildpackName) || cfBuildpack.includes(cfBuildpackName.replace(/_/g, "-"))
    );
  const { runtime, debugPort: inferredPort } = (cfBuildpackInfoKey && BUILDPACK_INFO[cfBuildpackInfoKey]) || {};
  assert(inferredPort, `could not infer remote debugPort from buildpack "${cfBuildpack}"`);
  const localPort = inferredPort;
  const remotePort = inferredPort;

  logger.info();
  if (runtime === RUNTIME.NODE) {
    try {
      await cfSsh({ command: "pkill --signal SIGUSR1 -f node", appInstance });
    } catch (err) {
      logger.warning("warning: could not enable debugging for node process: ", err.message);
    }
  }
  logger.info(`connect ${runtime ? runtime + " debugger" : "debugger"} on port ${localPort}`);
  logger.info(`use request header "X-Cf-App-Instance: ${cfAppGuid}:${appInstance}" to target this app instance`);
  logger.info();
  await cfSsh({ localPort, remotePort, appInstance });
};

const serverDebug = async (context, [appName, appInstance = "0"]) => {
  assert(/\d+/.test(appInstance), `argument "${appInstance}" is not a valid app instance`);
  return _serverDebug(context, { appName, appInstance });
};

module.exports = {
  serverEnvironment,
  serverCertificates,
  serverDebug,
};

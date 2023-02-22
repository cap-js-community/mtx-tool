"use strict";

const { writeFileSync } = require("fs");
const { orderedStringify } = require("../shared/static");
const { assert } = require("../shared/error");
const { request } = require("../shared/request");

const BUILDPACK_INFO = {
  nodejs_buildpack: { runtime: "node", debugPort: 9229 },
  java_buildpack: { runtime: "java", debugPort: 8000 },
};
const DEFAULT_ENV_FILENAME = "default-env.json";

const serverInfo = async (context) => {
  const { cfRouteUrl } = await context.getSrvInfo();
  const token = await context.getCachedUaaToken();
  const response = await request({
    url: cfRouteUrl,
    pathname: "/info",
    auth: { token },
  });
  return JSON.stringify(await response.json(), null, 2);
};

const _serverDebug = async (context, { appName, appInstance = 0 } = {}) => {
  const { cfBuildpack, cfAppGuid, cfRouteUrl, cfSsh } = appName
    ? await context.getAppNameInfoCached(appName)
    : await context.getSrvInfo();
  const cfBuildpackInfoKey = Object.keys(BUILDPACK_INFO).find(
    (cfBuildpackName) =>
      cfBuildpack.includes(cfBuildpackName) || cfBuildpack.includes(cfBuildpackName.replace(/_/g, "-"))
  );
  const { runtime, debugPort: inferredPort } = (cfBuildpackInfoKey && BUILDPACK_INFO[cfBuildpackInfoKey]) || {};
  const localPort = inferredPort || 8000;
  const token = await context.getCachedUaaToken();

  let responseData = {};
  if (cfRouteUrl) {
    try {
      const response = await request({
        url: cfRouteUrl,
        pathname: "/info",
        auth: { token },
        ...(Number.isInteger(appInstance) && {
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
  appInstance = instance || appInstance || 0;
  const remotePort = debugPort || inferredPort;
  assert(remotePort, `could not determine remote debugPort from /info or infer from buildpack`);

  console.log();
  if (!debugPort) {
    console.log(
      `could not determine remote debugPort from /info, falling back to ${cfBuildpack} default ${remotePort}`
    );
  }
  console.log(`connect ${runtime ? runtime + " debugger" : "debugger"} on port ${localPort}`);
  console.log(`use request header "X-Cf-App-Instance: ${cfAppGuid}:${appInstance}" to target this app instance`);
  console.log();
  return cfSsh({ localPort, remotePort, appInstance });
};

const serverDebug = async (context, [appName, appInstance]) => _serverDebug(context, { appName, appInstance });

const serverEnvironment = async (context, [appName]) => {
  const { cfEnvServices, cfEnvVariables } = appName
    ? await context.getAppNameInfoCached(appName)
    : await context.getSrvInfo();
  writeFileSync(
    DEFAULT_ENV_FILENAME,
    orderedStringify({ VCAP_SERVICES: cfEnvServices, ...cfEnvVariables }, null, 2) + "\n"
  );
  console.log(`saved system environment to ${DEFAULT_ENV_FILENAME}`);
};

const serverStartDebugger = async (context, [appName, appInstance]) => {
  const { cfSsh } = appName ? await context.getAppNameInfoCached(appName) : await context.getSrvInfo();
  return cfSsh({ command: "pkill --signal SIGUSR1 node", appInstance });
};

module.exports = {
  serverInfo,
  serverDebug,
  serverEnvironment,
  serverStartDebugger,
};

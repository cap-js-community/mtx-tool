"use strict";

const { isJWT, isDashedWord, guardedAccess, resolveTenantArg } = require("../shared/static");
const { assert } = require("../shared/error");
const { getUaaTokenFromCredentials } = require("../shared/oauth");

const _uaaOutputBearer = (token) => ["Authorization:", "Bearer " + token].join("\n");

const _uaaOutputDecoded = async (token) => {
  const [jwtHeader, jwtBody] = token
    .split(".")
    .slice(0, 2)
    .map((part) => JSON.parse(Buffer.from(part, "base64").toString()));
  return ["JWT Header:", JSON.stringify(jwtHeader), "", "JWT Body:", JSON.stringify(jwtBody, null, 2)].join("\n");
};

const _uaaSaasServiceToken = async (context, tenant, service) => {
  assert(isDashedWord(service), `argument "${service}" is not a valid service`);
  const {
    cfEnvApp: { application_name: appName },
    cfEnvServices,
  } = await context.getUaaInfo();
  let serviceCredentials = guardedAccess(cfEnvServices, service, 0, "credentials");
  serviceCredentials = guardedAccess(serviceCredentials, "uaa") || serviceCredentials;
  assert(serviceCredentials, "service %s not bound to xsuaa app %s", service, appName);
  return getUaaTokenFromCredentials(serviceCredentials, resolveTenantArg(tenant));
};

const uaaDecode = async ([token]) => {
  assert(isJWT(token), "argument is not a json web token", token);
  return _uaaOutputDecoded(token);
};

const uaaClient = async (context, [tenant], [doDecode]) =>
  doDecode
    ? _uaaOutputDecoded(await context.getUaaToken(resolveTenantArg(tenant)))
    : _uaaOutputBearer(await context.getUaaToken(resolveTenantArg(tenant)));
const uaaPasscode = async (context, [passcode, tenant], [doDecode]) =>
  doDecode
    ? _uaaOutputDecoded(await context.getUaaToken({ ...resolveTenantArg(tenant), passcode }))
    : _uaaOutputBearer(await context.getUaaToken({ ...resolveTenantArg(tenant), passcode }));
const uaaService = async (context, [service, tenant], [doDecode]) =>
  doDecode
    ? _uaaOutputDecoded(await _uaaSaasServiceToken(context, tenant, service))
    : _uaaOutputBearer(await _uaaSaasServiceToken(context, tenant, service));

module.exports = {
  uaaDecode,
  uaaClient,
  uaaPasscode,
  uaaService,
};

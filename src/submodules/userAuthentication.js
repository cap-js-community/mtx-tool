"use strict";

const { isJWT, isDashedWord, resolveTenantArg } = require("../shared/static");
const { request } = require("../shared/request");
const { assert } = require("../shared/error");

const _uaaOutputBearer = (token) => ["Authorization:", "Bearer " + token].join("\n");

const _tokenDecode = (token) =>
  token
    .split(".")
    .slice(0, 2)
    .map((part) => JSON.parse(Buffer.from(part, "base64").toString()));
const _uaaOutputDecoded = (token) => {
  const [jwtHeader, jwtBody] = _tokenDecode(token);
  return ["JWT Header:", JSON.stringify(jwtHeader), "", "JWT Body:", JSON.stringify(jwtBody, null, 2)].join("\n");
};

const _uaaSaasServiceToken = async (context, tenant, service) => {
  assert(isDashedWord(service), `argument "${service}" is not a valid service`);
  const {
    cfEnvApp: { application_name: appName },
    cfEnvServices,
  } = await context.getUaaInfo();
  let serviceCredentials = cfEnvServices[service]?.[0]?.credentials;
  if (serviceCredentials === undefined) {
    serviceCredentials = cfEnvServices["user-provided"]?.find((userProvidedService) =>
      userProvidedService.tags.includes(service)
    )?.credentials;
  }
  serviceCredentials = serviceCredentials?.uaa ?? serviceCredentials;
  assert(serviceCredentials, "service %s not bound to xsuaa app %s", service, appName);
  return context.getCachedUaaTokenFromCredentials(serviceCredentials, resolveTenantArg(tenant));
};

const _uaaUserInfo = async (context, passcode, tenant) => {
  const {
    cfService: {
      credentials: { url: paasUrl, identityzone: paasZoneDomain },
    },
  } = await context.getUaaInfo();
  const token = await context.getCachedUaaToken({ ...resolveTenantArg(tenant), passcode });
  const [, jwtBody] = _tokenDecode(token);
  const zoneId = jwtBody.zid;
  const zoneDomain = jwtBody.ext_attr && jwtBody.ext_attr.zdn;
  const uaaResponse = await request({
    url: zoneDomain ? paasUrl.replace(paasZoneDomain, zoneDomain) : paasUrl,
    pathname: "/userinfo",
    headers: {
      Accept: "application/json",
      "X-Zid": zoneId,
    },
    auth: { token },
  });
  const result = await uaaResponse.json();
  return JSON.stringify(result, null, 2) + "\n";
};

const uaaDecode = async ([token]) => {
  assert(isJWT(token), "argument is not a json web token", token);
  return _uaaOutputDecoded(token);
};

const uaaClient = async (context, [tenant], [doDecode]) =>
  doDecode
    ? _uaaOutputDecoded(await context.getCachedUaaToken(resolveTenantArg(tenant)))
    : _uaaOutputBearer(await context.getCachedUaaToken(resolveTenantArg(tenant)));
const uaaPasscode = async (context, [passcode, tenant], [doDecode]) =>
  doDecode
    ? _uaaOutputDecoded(await context.getCachedUaaToken({ ...resolveTenantArg(tenant), passcode }))
    : _uaaOutputBearer(await context.getCachedUaaToken({ ...resolveTenantArg(tenant), passcode }));
const uaaService = async (context, [service, tenant], [doDecode]) =>
  doDecode
    ? _uaaOutputDecoded(await _uaaSaasServiceToken(context, tenant, service))
    : _uaaOutputBearer(await _uaaSaasServiceToken(context, tenant, service));
const uaaUserInfo = async (context, [passcode, tenant]) => await _uaaUserInfo(context, passcode, tenant);

module.exports = {
  uaaDecode,
  uaaClient,
  uaaPasscode,
  uaaService,
  uaaUserInfo,
};

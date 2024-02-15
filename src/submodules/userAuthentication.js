"use strict";

const { isJWT, isDashedWord, resolveTenantArg } = require("../shared/static");
const { request } = require("../shared/request");
const { assert } = require("../shared/error");

const _tokenDecode = (token) =>
  token
    .split(".")
    .slice(0, 2)
    .map((part) => JSON.parse(Buffer.from(part, "base64").toString()));

const _uaaOutputBearer = (token) => ["Authorization:", "Bearer " + token].join("\n");

const _uaaOutputDecoded = (token) => {
  const [jwtHeader, jwtBody] = _tokenDecode(token);
  return ["JWT Header:", JSON.stringify(jwtHeader), "", "JWT Body:", JSON.stringify(jwtBody, null, 2)].join("\n");
};

const _uaaOutput = (token, doDecode, doAddUserInfo) => {};

const _uaaSaasServiceToken = async (context, service, options = undefined) => {
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
  return context.getCachedUaaTokenFromCredentials(serviceCredentials, options);
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
  return _uaaOutput(token, true);
};

const uaaClient = async (context, [tenant], [doDecode]) =>
  _uaaOutput(await context.getCachedUaaToken(resolveTenantArg(tenant)), doDecode);
const uaaPasscode = async (context, [passcode, tenant], [doDecode, doAddUserInfo]) =>
  _uaaOutput(await context.getCachedUaaToken({ ...resolveTenantArg(tenant), passcode }), doDecode, doAddUserInfo);
const uaaUser = async (context, [username, password, tenant], [doDecode, doAddUserInfo]) =>
  _uaaOutput(
    await context.getCachedUaaToken({ ...resolveTenantArg(tenant), username, password }),
    doDecode,
    doAddUserInfo
  );

const uaaServiceClient = async (context, [service, tenant], [doDecode]) =>
  _uaaOutput(await _uaaSaasServiceToken(context, service, { ...resolveTenantArg(tenant) }), doDecode);
const uaaServicePasscode = async (context, [service, passcode, tenant], [doDecode, doAddUserInfo]) =>
  _uaaOutput(
    await _uaaSaasServiceToken(context, service, { ...resolveTenantArg(tenant), passcode }),
    doDecode,
    doAddUserInfo
  );
const uaaServiceUser = async (context, [service, username, password, tenant], [doDecode, doAddUserInfo]) =>
  _uaaOutput(
    await _uaaSaasServiceToken(context, service, { ...resolveTenantArg(tenant), username, password }),
    doDecode,
    doAddUserInfo
  );

module.exports = {
  uaaDecode,
  uaaClient,
  uaaPasscode,
  uaaUser,
  uaaServiceClient,
  uaaServicePasscode,
  uaaServiceUser,
};

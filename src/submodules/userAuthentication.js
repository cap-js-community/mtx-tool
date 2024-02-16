"use strict";

const { isJWT, isDashedWord, resolveTenantArg } = require("../shared/static");
const { request } = require("../shared/request");
const { assert } = require("../shared/error");

const _tokenDecode = (token) =>
  token
    .split(".")
    .slice(0, 2)
    .map((part) => JSON.parse(Buffer.from(part, "base64").toString()));

const _uaaUserInfo = async (context, token) => {
  const {
    cfService: {
      credentials: { url: paasUrl, identityzone: paasZoneDomain },
    },
  } = await context.getUaaInfo();
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
  return await uaaResponse.json();
};

const _uaaOutput = (token, { doDecode = false, userInfo } = {}) => {
  let result;
  if (doDecode) {
    const [jwtHeader, jwtBody] = _tokenDecode(token);
    result = ["JWT Header:", JSON.stringify(jwtHeader), "", "JWT Body:", JSON.stringify(jwtBody, null, 2), ""];
  } else {
    result = ["Authorization:", "Bearer " + token, ""];
  }
  if (userInfo) {
    result.push("User Info:", JSON.stringify(userInfo, null, 2), "");
  }
  return result.slice(0, -1).join("\n");
};

const _uaaSaasServiceToken = async (context, service, options = undefined) => {
  assert(isDashedWord(service), `argument "${service}" is not a valid service`);
  const {
    cfService: {
      credentials: { identityzone: identityZone },
    },
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
  serviceCredentials.identityzone = serviceCredentials.identityzone ?? identityZone;
  assert(serviceCredentials, "service %s not bound to xsuaa app %s", service, appName);
  return context.getCachedUaaTokenFromCredentials(serviceCredentials, options);
};

const uaaDecode = async ([token]) => {
  assert(isJWT(token), "argument is not a json web token", token);
  return _uaaOutput(token, { doDecode: true });
};

const uaaClient = async (context, [tenant], [doDecode]) =>
  _uaaOutput(await context.getCachedUaaToken(resolveTenantArg(tenant)), { doDecode });

const uaaPasscode = async (context, [passcode, tenant], [doDecode, doAddUserInfo]) => {
  const token = await context.getCachedUaaToken({ ...resolveTenantArg(tenant), passcode });
  return _uaaOutput(token, {
    doDecode,
    ...(doAddUserInfo && { userInfo: await _uaaUserInfo(context, token) }),
  });
};

const uaaUser = async (context, [username, password, tenant], [doDecode, doAddUserInfo]) => {
  const token = await context.getCachedUaaToken({ ...resolveTenantArg(tenant), username, password });
  return _uaaOutput(token, {
    doDecode,
    ...(doAddUserInfo && { userInfo: await _uaaUserInfo(context, token) }),
  });
};

const uaaServiceClient = async (context, [service, tenant], [doDecode]) =>
  _uaaOutput(await _uaaSaasServiceToken(context, service, { ...resolveTenantArg(tenant) }), { doDecode });

const uaaServicePasscode = async (context, [service, passcode, tenant], [doDecode, doAddUserInfo]) => {
  const token = await _uaaSaasServiceToken(context, service, { ...resolveTenantArg(tenant), passcode });
  return _uaaOutput(token, {
    doDecode,
    ...(doAddUserInfo && { userInfo: await _uaaUserInfo(context, token) }),
  });
};

const uaaServiceUser = async (context, [service, username, password, tenant], [doDecode, doAddUserInfo]) => {
  const token = await _uaaSaasServiceToken(context, service, { ...resolveTenantArg(tenant), username, password });
  return _uaaOutput(token, {
    doDecode,
    ...(doAddUserInfo && { userInfo: await _uaaUserInfo(context, token) }),
  });
};

module.exports = {
  uaaDecode,
  uaaClient,
  uaaPasscode,
  uaaUser,
  uaaServiceClient,
  uaaServicePasscode,
  uaaServiceUser,
};

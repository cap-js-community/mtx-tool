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

const _uaaOutput = (token, { doDecode = false, doJsonOutput, userInfo } = {}) => {
  if (doJsonOutput) {
    if (doDecode) {
      const [header, body] = _tokenDecode(token);
      return { header, body };
    }
    return { token };
  }

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
    cfService: { credentials: uaaCredentials },
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

  const identityZone = serviceCredentials?.identityzone ?? uaaCredentials.identityzone;
  return context.getCachedUaaTokenFromCredentials(serviceCredentials, { identityZone, ...options });
};

const uaaDecode = async ([token], [doJsonOutput]) => {
  assert(isJWT(token), "argument is not a json web token", token);
  return _uaaOutput(token, { doDecode: true, doJsonOutput });
};

const uaaClient = async (context, [tenant], [doDecode, doJsonOutput]) =>
  _uaaOutput(await context.getCachedUaaToken(resolveTenantArg(tenant)), { doDecode, doJsonOutput });

const uaaPasscode = async (context, [passcode, tenant], [doDecode, doJsonOutput, doAddUserInfo]) => {
  const token = await context.getCachedUaaToken({ ...resolveTenantArg(tenant), passcode });
  return _uaaOutput(token, {
    doDecode,
    doJsonOutput,
    ...(doAddUserInfo && { userInfo: await _uaaUserInfo(context, token) }),
  });
};

const uaaUser = async (context, [username, password, tenant], [doDecode, doJsonOutput, doAddUserInfo]) => {
  const token = await context.getCachedUaaToken({ ...resolveTenantArg(tenant), username, password });
  return _uaaOutput(token, {
    doDecode,
    doJsonOutput,
    ...(doAddUserInfo && { userInfo: await _uaaUserInfo(context, token) }),
  });
};

const uaaServiceClient = async (context, [service, tenant], [doDecode, doJsonOutput]) =>
  _uaaOutput(await _uaaSaasServiceToken(context, service, { ...resolveTenantArg(tenant) }), { doDecode, doJsonOutput });

const uaaServicePasscode = async (context, [service, passcode, tenant], [doDecode, doJsonOutput, doAddUserInfo]) => {
  const token = await _uaaSaasServiceToken(context, service, { ...resolveTenantArg(tenant), passcode });
  return _uaaOutput(token, {
    doDecode,
    doJsonOutput,
    ...(doAddUserInfo && { userInfo: await _uaaUserInfo(context, token) }),
  });
};

const uaaServiceUser = async (
  context,
  [service, username, password, tenant],
  [doDecode, doJsonOutput, doAddUserInfo]
) => {
  const token = await _uaaSaasServiceToken(context, service, { ...resolveTenantArg(tenant), username, password });
  return _uaaOutput(token, {
    doDecode,
    doJsonOutput,
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

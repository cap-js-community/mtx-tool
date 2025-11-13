"use strict";

const https = require("https");
const { isDashedWord, isUUID } = require("./static");
const { assert, fail } = require("./error");
const { request } = require("./request");

const getIasTokenFromCredentials = async (credentials) => {
  const {
    url,
    app_tid: tenantId,
    clientid: clientId,
    "credential-type": credentialType,
    key,
    certificate,
  } = credentials;

  switch (credentialType) {
    case "X509_GENERATED": {
      return await getToken(url, {
        pathname: "/oauth2/token",
        bodyFields: { app_tid: tenantId },
        clientId,
        certificate,
        key,
      });
    }
    default: {
      return fail("ias credential type not supported %s", credentialType);
    }
  }
};

const getUaaTokenFromCredentials = async (
  credentials,
  { subdomain, identityZone, tenantId, passcode, username, password } = {}
) => {
  subdomain && assert(isDashedWord(subdomain), `argument "${subdomain}" is not a valid subdomain`);
  tenantId && assert(isUUID(tenantId), `argument "${tenantId}" is not a valid tenantId`);

  const {
    url: serviceUrlPaas,
    clientid: clientId,
    clientsecret: clientSecret,
    certurl: certUrlPaas,
    certificate,
    key,
    identityzone: credentialIdentityZone,
  } = credentials;
  identityZone = identityZone ?? credentialIdentityZone;
  const isX509Enabled = !clientSecret && certUrlPaas;
  const serviceUrl = subdomain ? serviceUrlPaas.replace(identityZone, subdomain) : serviceUrlPaas;
  const certUrl = subdomain && certUrlPaas ? certUrlPaas.replace(identityZone, subdomain) : certUrlPaas;
  const url = isX509Enabled ? certUrl : serviceUrl;

  passcode &&
    assert(
      [10, 32].includes(passcode.length),
      `"argument ${passcode}" is not a valid passcode, get one at ${serviceUrl}/passcode`
    );

  const baseOptions = {
    pathname: "/oauth/token",
    ...(tenantId && { headerFields: { "X-Zid": tenantId } }),
    clientId,
    passcode,
    username,
    password,
  };
  const options = isX509Enabled ? { ...baseOptions, certificate, key } : { ...baseOptions, clientSecret };
  return await getToken(url, options);
};

const getToken = async (
  url,
  { pathname, clientId, clientSecret, certificate, key, passcode, username, password, bodyFields, headerFields } = {}
) => {
  const agent = certificate && new https.Agent({ ...(key && { key }), ...(certificate && { cert: certificate }) });
  const grantType = passcode || username ? "password" : "client_credentials";
  const loginHint = username && JSON.stringify({ origin: "sap.custom" });
  const body = new URLSearchParams({
    grant_type: grantType,
    client_id: clientId,
    ...(clientSecret && { client_secret: clientSecret }),
    ...(loginHint && { login_hint: loginHint }),
    ...(passcode && { passcode }),
    ...(username && { username }),
    ...(password && { password }),
    ...bodyFields,
  }).toString();
  return await (
    await request({
      ...(agent && { agent }),
      method: "POST",
      url,
      pathname,
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        ...headerFields,
      },
      logged: false,
    })
  ).json();
};

module.exports = {
  getUaaTokenFromCredentials,
  getIasTokenFromCredentials,
};

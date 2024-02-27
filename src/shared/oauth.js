"use strict";

const https = require("https");
const { isDashedWord, isUUID } = require("./static");
const { assert } = require("./error");
const { request } = require("./request");

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

  const baseOptions = { clientId, tenantId, passcode, username, password };
  const options = isX509Enabled ? { ...baseOptions, certificate, key } : { ...baseOptions, clientSecret };
  return await getUaaToken(url, options);
};

const getUaaToken = async (
  url,
  { clientId, clientSecret, certificate, key, tenantId, passcode, username, password } = {}
) => {
  const agent = certificate && new https.Agent({ ...(key && { key }), ...(certificate && { cert: certificate }) });
  const grantType = passcode || username ? "password" : "client_credentials";
  const loginHint = username && JSON.stringify({ origin: "sap.custom" });
  const body = new URLSearchParams({
    grant_type: grantType,
    client_id: clientId,
    ...(clientSecret && { client_secret: clientSecret }),
    ...(passcode && { passcode }),
    ...(username && { username }),
    ...(password && { password }),
    ...(loginHint && { login_hint: loginHint }),
  }).toString();
  return await (
    await request({
      ...(agent && { agent }),
      method: "POST",
      url,
      pathname: "/oauth/token",
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        ...(tenantId && { "X-Zid": tenantId }),
      },
      logged: false,
    })
  ).json();
};

module.exports = {
  getUaaToken,
  getUaaTokenFromCredentials,
};

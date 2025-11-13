"use strict";

const https = require("https");
const { isDashedWord, isUUID } = require("./static");
const { assert } = require("./error");
const { request } = require("./request");

/*
IAS Credentials:
{
  "btp-tenant-api": "https://api.authentication.sap.hana.ondemand.com",
  "app_tid": "7b20408e-3fe0-4ade-aa2e-ad97baac72e8",
  "clientid": "21ad7bc4-79b2-48a7-8346-6806d385bf15",
  "credential-type": "X509_GENERATED",
  "certificate": "...",
  "domains": [
    "accounts400.ondemand.com",
    "accounts400.cloud.sap"
  ],
  "end_session_endpoint": "https://awdsp8ef4.accounts400.ondemand.com/oauth2/logout",
  "url": "https://awdsp8ef4.accounts400.ondemand.com",
  "authorization_endpoint": "https://awdsp8ef4.accounts400.ondemand.com/oauth2/authorize",
  "certificate_expires_at": "2026-02-09T19:53:07Z",
  "domain": "accounts400.ondemand.com",
  "key": "..."
}

UAA Credentials:
{
  "tenantmode": "shared",
  "sburl": "https://internal-xsuaa.authentication.sap.hana.ondemand.com",
  "subaccountid": "7b20408e-3fe0-4ade-aa2e-ad97baac72e8",
  "clientid": "sb-afc-dev!t5874",
  "credential-type": "x509",
  "clientx509enabled": false,
  "xsappname": "afc-dev!t5874",
  "certificate": "...",
  "serviceInstanceId": "e020b20a-eb23-4475-91ec-d525f8738fd7",
  "url": "https://skyfin.authentication.sap.hana.ondemand.com",
  "uaadomain": "authentication.sap.hana.ondemand.com",
  "verificationkey": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzC7fjy1M+S/4LLrSpMyR\nuEMKOKhQ3GVhgXXa7deR5Wa2clUpX6tUeDl3ITqZzfVGuznwmqMAPgTopUeK4veO\nKdljM8qMkWftJPSONDdlONNJLjNzI6rVZDfNQpQTQJ7wv3nYRGfcnS2uAp2WK03q\nlB432CRN0OfCUYw4f0ImWT7KbBVcxAYQ/hGL+srKzCwnfsPzanE6rAp3CEkqDLd0\nSoYrm9w5PAYtvuLke/NvJom1EAcWVjdjWfKXbNT2poNCbOuW0A7V2PwHmozmgwbl\nAAzmAFmCSG/1a7lU+kG51iE1705sWMxMoDvwBOyKZXODEDEc5p8un9IeUX9BPHdO\newIDAQAB\n-----END PUBLIC KEY-----",
  "apiurl": "https://api.authentication.sap.hana.ondemand.com",
  "certurl": "https://skyfin.authentication.cert.sap.hana.ondemand.com",
  "identityzone": "skyfin",
  "identityzoneid": "7b20408e-3fe0-4ade-aa2e-ad97baac72e8",
  "tenantid": "7b20408e-3fe0-4ade-aa2e-ad97baac72e8",
  "zoneid": "7b20408e-3fe0-4ade-aa2e-ad97baac72e8",
  "certificate-pinning": true,
  "key": "..."
}


 */

// const getTokenFromAuthService = async (service, options = {}) => {
//   const { subdomain, identityZone, tenantId, passcode, username, password } = options;
// };

const getIasTokenFromCredentials = async (credentials) => {
  const {
    url,
    app_tid: tenantId,
    client_id: clientId,
    "certificate-type": certificateType,
    key,
    certificate,
  } = credentials;
  console.log("!!!", credentials);

  return await getToken(url, options);
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

  const baseOptions = { clientId, tenantId, passcode, username, password };
  const options = isX509Enabled ? { ...baseOptions, certificate, key } : { ...baseOptions, clientSecret };
  return await getToken(url, options);
};

const getToken = async (
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
  getUaaTokenFromCredentials,
  getIasTokenFromCredentials,
};

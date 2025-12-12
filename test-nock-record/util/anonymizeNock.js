"use strict";

const { format } = require("util");
const { gunzipSync } = require("zlib");

const anonymizeUaaAuthCall = (call) => {
  Reflect.deleteProperty(call, "body"); // NOTE: this shouldn't work, because it makes the calls ambiguous, but currently it does...
  call.response.access_token = call.response.access_token.replace(/./g, "0");
  return call;
};

const _anonymizeTransform = (nodePath) => nodePath.join("-");

const _urlTransform = (nodePath, value) => {
  const serviceId = nodePath.join("-");
  const url = new URL(/:\/\//g.test(value) ? value : `https://${value}`);
  if (url.username) {
    url.username = `${serviceId}-username`;
  }
  if (url.password) {
    url.password = `${serviceId}-password`;
  }
  if (url.search) {
    url.search = "";
  }
  return url.toString();
};

const sensitiveFieldTransforms = [
  {
    matcher: (nodePath, key) => {
      const lowerKey = key.toLocaleLowerCase();
      return (
        ["key", "secret", "user", "pass", "token"].some((part) => lowerKey.includes(part)) ||
        [
          "certificate",
          "clientid",
          "clientsecret",
          "schema",
          "host",
          "bucket",
          "createdby", // registry subscription
          "modifiedby", // registry subscription
          "email", // cds subscription
          "subIdp", // cds subscription
        ].includes(lowerKey)
      );
    },
    transform: _anonymizeTransform,
  },
  {
    matcher: (nodePath, key) => {
      const lowerKey = key.toLocaleLowerCase();
      return (
        ["url", "uri", "certurl"].some((part) => lowerKey.includes(part)) &&
        !["urls", "uris"].some((part) => lowerKey.includes(part))
      );
    },
    transform: _urlTransform,
  },
];

const sensitiveSaasRegistryFieldTransforms = [
  {
    matcher: (nodePath, key) => {
      const lowerKey = key.toLocaleLowerCase();
      return ["error"].includes(lowerKey);
    },
    transform: _anonymizeTransform,
  },
];

const _transformValue = (nodePath, value, transformers) => {
  let key = null;
  for (let pathIndex = nodePath.length - 1; pathIndex >= 0; pathIndex--) {
    if (typeof nodePath[pathIndex] === "string") {
      key = nodePath[pathIndex];
      break;
    }
  }
  if (key === null) {
    throw new Error(format("found no key for nodePath %O", nodePath));
  }
  if (typeof value === "string") {
    for (const { matcher, transform } of transformers) {
      if (matcher(nodePath, key)) {
        return transform(nodePath, value);
      }
    }
  }
  return value;
};

const _processSubNode = (nodePath, node, transformers = sensitiveFieldTransforms) => {
  if (node === null || node === undefined || node === "") {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map((entry, index) => _processSubNode([...nodePath, index], entry, transformers));
  }
  if (typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [key, _processSubNode([...nodePath, key], value, transformers)])
    );
  }
  return _transformValue(nodePath, node, transformers);
};

const anonymizeCfEnvCall = (call) => {
  Reflect.deleteProperty(call.response, "environment_variables");
  Reflect.deleteProperty(call.response, "staging_env_json");
  Reflect.deleteProperty(call.response, "running_env_json");
  Reflect.deleteProperty(call.response, "application_env_json");
  call.response.system_env_json.VCAP_SERVICES = _processSubNode([], call.response.system_env_json.VCAP_SERVICES);
  return call;
};

const anonymizeCfCredentialCall = (call) => {
  call.response = _processSubNode(["cf-credentials"], call.response);
  return call;
};

const anonymizeServiceManagerCall = (call) => {
  call.response = _processSubNode(["service-manager"], call.response);
  return call;
};

const anonymizeSaasRegistryCall = (call) => {
  call.response = _processSubNode(["saas-registry"], call.response, sensitiveSaasRegistryFieldTransforms);
  return call;
};

const anonymizeSubscriptionManagerCall = (call) => {
  call.response = _processSubNode(["subscription-manager"], call.response, sensitiveSaasRegistryFieldTransforms);
  return call;
};

const anonymizeCdsProvisioningCall = (call) => {
  call.response = _processSubNode(["cds-provisioning"], call.response);
  return call;
};

const isGzippedCall = (call) => {
  const contentEndcodingIndex = call.rawHeaders.findIndex((entry) => entry === "content-encoding");
  return contentEndcodingIndex === -1 ? false : call.rawHeaders[contentEndcodingIndex + 1] === "gzip";
};

const anonymizeNock = (calls) => {
  return calls.map((call) => {
    // gunzip responses
    if (isGzippedCall(call)) {
      const contentEndcodingIndex = call.rawHeaders.findIndex((entry) => entry === "content-encoding");
      call.rawHeaders.splice(contentEndcodingIndex, 2);
      const buffer = gunzipSync(Buffer.concat(call.response.map((part) => Buffer.from(part, "hex"))));
      call.response = JSON.parse(buffer.toString());
    }

    // ##### UAA
    // "scope": "https://skyfin.authentication.sap.hana.ondemand.com:443",
    // "scope": "https://skyfin.authentication.cert.sap.hana.ondemand.com:443",
    // "path": "/oauth/token",
    if (
      /https:\/\/[a-z]+\.authentication\.(?:cert\.)?[a-z]+\.hana\.ondemand\.com:443/.test(call.scope) &&
      /\/oauth\/token/.test(call.path)
    ) {
      return anonymizeUaaAuthCall(call);
    }

    // ##### CF-API /v3/apps/{guid}/env
    // "scope": "https://api.cf.sap.hana.ondemand.com:443",
    // "path": "/v3/apps/188569c2-8a80-4eb2-a80b-4aa58dd40c7b/env",
    if (
      /https:\/\/api\.cf\.[a-z]+\.hana\.ondemand\.com:443/.test(call.scope) &&
      /\/v3\/apps\/[0-9a-f-]+\/env/.test(call.path)
    ) {
      return anonymizeCfEnvCall(call);
    }

    // ##### CF-API /v3/service_credential_bindings
    // "scope": "https://api.cf.sap.hana.ondemand.com:443",
    // "path": "/v3/service_credential_bindings",
    if (
      /https:\/\/api\.cf\.[a-z]+\.hana\.ondemand\.com:443/.test(call.scope) &&
      /\/v3\/service_credential_bindings/.test(call.path)
    ) {
      return anonymizeCfCredentialCall(call);
    }

    // ##### SERVICE-MANAGER
    // "scope": "https://service-manager.cfapps.sap.hana.ondemand.com:443",
    // "path": "/v1/service_bindings",
    if (
      /https:\/\/service-manager\.cfapps\.sap\.hana\.ondemand\.com:443/.test(call.scope) &&
      /\/v1\/service_bindings.*/.test(call.path)
    ) {
      return anonymizeServiceManagerCall(call);
    }

    // ##### SAAS-REGISTRY
    // "scope": "https://saas-manager.mesh.cf.sap.hana.ondemand.com:443",
    // "path": "/saas-manager/v1/application/subscriptions?appName=afc-dev",
    if (
      /https:\/\/saas-manager\.mesh\.cf\.sap\.hana\.ondemand\.com:443/.test(call.scope) &&
      /\/saas-manager\/v1\/application\/subscriptions\?appName=.*/.test(call.path)
    ) {
      return anonymizeSaasRegistryCall(call);
    }

    // ##### SUBSCRIPTION-MANAGER
    // "scope": "https://saas-manager.mesh.cf.sap.hana.ondemand.com:443",
    if (/https:\/\/service-manager\.cfapps\.sap\.hana\.ondemand\.com:443/.test(call.scope)) {
      return anonymizeSubscriptionManagerCall(call);
    }

    // ##### CDS
    // "scope": "https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443",
    // "path": "/-/cds/saas-provisioning/tenant",
    if (
      /https:\/\/skyfin-dev-afc-mtx\.cfapps\.sap\.hana\.ondemand\.com:443/.test(call.scope) &&
      /\/-\/cds\/saas-provisioning\//.test(call.path)
    ) {
      return anonymizeCdsProvisioningCall(call);
    }

    // ##### PASS CF
    // "scope": "https://api.cf.sap.hana.ondemand.com:443",
    // "path": "/v3/apps", "/v3/routes", "\/v3\/service_plans"
    if (
      /https:\/\/api\.cf\.[a-z]+\.hana\.ondemand\.com:443/.test(call.scope) &&
      (/\/v3\/apps/.test(call.path) || /\/v3\/routes/.test(call.path) || /\/v3\/service_plans/.test(call.path))
    ) {
      return call;
    }

    // ##### PASS CDS
    // "scope": "https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443",
    // "path": "/-/cds/jobs/",
    if (
      /https:\/\/skyfin-dev-afc-mtx\.cfapps\.sap\.hana\.ondemand\.com:443/.test(call.scope) &&
      /\/-\/cds\/jobs\//.test(call.path)
    ) {
      return call;
    }

    throw new Error(`unhandled scope ${call.scope} and path ${call.path}`);
  });
};

module.exports = {
  anonymizeNock,
};

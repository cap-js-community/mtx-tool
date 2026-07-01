"use strict";

const { format } = require("util");
const { createHash } = require("crypto");
const { gunzipSync } = require("zlib");

const { collapseSharedRefs } = require("./sharedFixtures");

const anonymizeUaaAuthCall = (call) => {
  Reflect.deleteProperty(call, "body"); // NOTE: this shouldn't work, because it makes the calls ambiguous, but currently it does...
  call.response.access_token = call.response.access_token.replace(/./g, "0");
  return call;
};

const _anonymizeTransform = (nodePath) => nodePath.join("-");

// NOTE: clientid needs special handling because it is used as a cache key
const _anonymizeClientIdTransform = (nodePath, value) =>
  [nodePath, [createHash("md5").update(value).digest("hex").slice(0, 8)]].flat().join("-");

const _urlTransform = (nodePath, value) => {
  value = value.trim();
  const serviceId = nodePath.join("-");
  let url;
  const isRelative = value.startsWith("/");
  const hasNoProtocol = !/^(\w+:\/\/|data:|jdbc:|mailto:|file:)/g.test(value);
  if (isRelative) {
    url = new URL(value, "https://__fakedomain.com");
  } else if (hasNoProtocol) {
    url = new URL(`https://${value}`);
  } else {
    url = new URL(value);
  }

  if (url.username) {
    url.username = `${serviceId}-username`;
  }
  if (url.password) {
    url.password = `${serviceId}-password`;
  }
  if (url.search) {
    url.search = "";
  }

  if (hasNoProtocol) {
    return url.toString().replace(/^https:\/\//, "");
  }
  if (isRelative) {
    return url.toString().replace(/^https:\/\/__fakedomain.com/, "");
  }
  return url.toString();
};

const sensitiveFieldTransforms = [
  {
    matcher: (nodePath, key) => key.toLocaleLowerCase() === "clientid",
    transform: _anonymizeClientIdTransform,
  },
  {
    matcher: (nodePath, key) => {
      const lowerKey = key.toLocaleLowerCase();
      return (
        ["key", "secret", "user", "pass", "token"].some((part) => lowerKey.includes(part)) ||
        [
          "certificate",
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
        !["urls", "uris"].some((part) => lowerKey.includes(part)) &&
        // fields with junk url
        nodePath.slice(3).join("-") !== "metadata-sap-clusterScaleoutDashboardURL" &&
        nodePath.slice(3).join("-") !== "metadata-sap-dashboardUrl"
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
  call.response.system_env_json.VCAP_SERVICES = _processSubNode([], call.response.system_env_json.VCAP_SERVICES);
  call.response.application_env_json.VCAP_APPLICATION = _processSubNode(
    [],
    call.response.application_env_json.VCAP_APPLICATION
  );
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

// NOTE: we want to save space on the fixtures for /v3/service_plans the recorded
//   response is trimmed from ~100 plans.
const CF_SERVICE_PLANS_WHITELIST = new Set([
  "aicore:sap-internal",
  "alert-notification:business-notifications",
  "application-logs:standard",
  "auditlog:oauth2",
  "autoscaler:standard",
  "business-logging:default",
  "certificate-service:standard",
  "connectivity:lite",
  "destination:lite",
  "dynatrace:environment",
  "hana:hdi-shared",
  "html5-apps-repo:app-runtime",
  "identity:application",
  "malware-scanner:clamav",
  "objectstore:standard",
  "portal:standard",
  "redis-cache:standard",
  "saas-registry:application",
  "service-manager:container",
  "subscription-manager:provider",
  "theming:standard",
  "ui5-flexibility-keyuser:keyuser",
  "xsuaa:application",
]);

const trimCfServicePlansCall = (call) => {
  const response = call.response;
  const offeringNameByGuid = new Map();
  if (response.included && Array.isArray(response.included.service_offerings)) {
    for (const offering of response.included.service_offerings) {
      offeringNameByGuid.set(offering.guid, offering.name);
    }
  }
  const keptResources = [];
  const keptOfferingGuids = new Set();
  for (const plan of response.resources) {
    const offeringGuid = plan?.relationships?.service_offering?.data?.guid;
    const offeringName = offeringNameByGuid.get(offeringGuid);
    if (!CF_SERVICE_PLANS_WHITELIST.has(`${offeringName}:${plan.name}`)) {
      continue;
    }
    keptResources.push({
      guid: plan.guid,
      name: plan.name,
      relationships: {
        service_offering: {
          data: { guid: offeringGuid },
        },
      },
    });
    keptOfferingGuids.add(offeringGuid);
  }
  let trimmedIncluded;
  if (response.included && Array.isArray(response.included.service_offerings)) {
    trimmedIncluded = {
      service_offerings: response.included.service_offerings
        .filter((offering) => keptOfferingGuids.has(offering.guid))
        .map((offering) => ({
          guid: offering.guid,
          name: offering.name,
        })),
    };
  }
  call.response = {
    pagination: response.pagination,
    resources: keptResources,
    ...(trimmedIncluded && { included: trimmedIncluded }),
  };
  return call;
};

// Read from each app resource by src/context.js: guid, name,
// lifecycle.data.buildpacks (first entry consumed as cfBuildpack).
const trimCfAppsListCall = (call) => {
  const response = call.response;
  call.response = {
    pagination: response.pagination,
    resources: response.resources.map((app) => ({
      guid: app.guid,
      name: app.name,
      lifecycle: {
        data: {
          buildpacks: app?.lifecycle?.data?.buildpacks ?? [],
        },
      },
    })),
  };
  return call;
};

// Trim a CF /v3/service_credential_bindings?app_guids=...&include=service_instance
// response. Production reads from each binding stub: guid, created_at,
// updated_at, relationships.service_instance.data.guid. From each included
// service_instance: guid, name, type, tags, and (for managed instances only)
// relationships.service_plan.data.guid.
const trimCfBindingListCall = (call) => {
  const response = call.response;
  const trimmedResources = response.resources.map((stub) => ({
    guid: stub.guid,
    created_at: stub.created_at,
    updated_at: stub.updated_at,
    relationships: {
      service_instance: {
        data: { guid: stub?.relationships?.service_instance?.data?.guid },
      },
    },
  }));
  let trimmedIncluded;
  if (response.included && Array.isArray(response.included.service_instances)) {
    trimmedIncluded = {
      service_instances: response.included.service_instances.map((instance) => ({
        guid: instance.guid,
        name: instance.name,
        type: instance.type,
        tags: instance.tags ?? [],
        ...(instance.type === "managed" && {
          relationships: {
            service_plan: {
              data: { guid: instance?.relationships?.service_plan?.data?.guid },
            },
          },
        }),
      })),
    };
  }
  call.response = {
    pagination: response.pagination,
    resources: trimmedResources,
    ...(trimmedIncluded && { included: trimmedIncluded }),
  };
  return call;
};

// Trim a CF /v3/routes?app_guids=...&include=domain response. Production reads
// only cfRoute.host and the included domain's name (joined via relationships).
const trimCfRoutesCall = (call) => {
  const response = call.response;
  const trimmedResources = response.resources.map((route) => ({
    guid: route.guid,
    host: route.host,
    relationships: {
      domain: {
        data: { guid: route?.relationships?.domain?.data?.guid },
      },
    },
  }));
  let trimmedIncluded;
  if (response.included && Array.isArray(response.included.domains)) {
    trimmedIncluded = {
      domains: response.included.domains.map((domain) => ({
        guid: domain.guid,
        name: domain.name,
      })),
    };
  }
  call.response = {
    pagination: response.pagination,
    resources: trimmedResources,
    ...(trimmedIncluded && { included: trimmedIncluded }),
  };
  return call;
};

// Trim a CF /v3/apps/{guid}/processes response. Production reads only
// cfProcess.instances from the first resource.
const trimCfProcessesCall = (call) => {
  const response = call.response;
  call.response = {
    pagination: response.pagination,
    resources: response.resources.map((process) => ({
      instances: process.instances,
    })),
  };
  return call;
};

// Trim a service-manager /v1/service_instances response. Production reads from
// each instance: id, ready, service_plan_id, created_at, updated_at, and
// labels (labels.tenant_id is checked, and the full labels object is cloned
// into newly-created bindings).
const trimServiceManagerInstancesCall = (call) => {
  const response = call.response;
  call.response = {
    items: response.items.map((instance) => ({
      id: instance.id,
      ready: instance.ready,
      service_plan_id: instance.service_plan_id,
      created_at: instance.created_at,
      updated_at: instance.updated_at,
      labels: instance.labels,
    })),
  };
  return call;
};

// Trim a service-manager /v1/service_bindings response. Production reads from
// each binding: id, ready, service_instance_id, created_at, updated_at,
// labels, and credentials (the credentials sub-object is kept intact since it
// exercises _hideSensitiveDataInBinding redaction and is surfaced verbatim by
// long-list commands).
const trimServiceManagerBindingsCall = (call) => {
  const response = call.response;
  call.response = {
    items: response.items.map((binding) => ({
      id: binding.id,
      ready: binding.ready,
      service_instance_id: binding.service_instance_id,
      created_at: binding.created_at,
      updated_at: binding.updated_at,
      labels: binding.labels,
      credentials: binding.credentials,
    })),
  };
  return call;
};

// Trim a service-manager /v2/service_instances response. Production reads from
// each instance: id, usable, service_plan_id, created_at, updated_at, and
// labels.
const trimServiceManagerInstancesV2Call = (call) => {
  const response = call.response;
  call.response = {
    items: response.items.map((instance) => ({
      id: instance.id,
      usable: instance.usable,
      service_plan_id: instance.service_plan_id,
      created_at: instance.created_at,
      updated_at: instance.updated_at,
      labels: instance.labels,
    })),
  };
  return call;
};

// Trim a service-manager /v2/service_bindings response. Production reads from
// each binding: id, last_operation.state, service_instance_id, created_at,
// updated_at, labels, and credentials.
const trimServiceManagerBindingsV2Call = (call) => {
  const response = call.response;
  call.response = {
    items: response.items.map((binding) => ({
      id: binding.id,
      last_operation: binding.last_operation && { state: binding.last_operation.state },
      service_instance_id: binding.service_instance_id,
      created_at: binding.created_at,
      updated_at: binding.updated_at,
      labels: binding.labels,
      credentials: binding.credentials,
    })),
  };
  return call;
};

const isGzippedCall = (call) => {
  const contentEndcodingIndex = call.rawHeaders.findIndex((entry) => entry === "content-encoding");
  return contentEndcodingIndex === -1 ? false : call.rawHeaders[contentEndcodingIndex + 1] === "gzip";
};

// CF API responses carry ~37 lines of headers per call (ratelimit, trace ids,
// security headers, vendor x-* headers, dates). None affect nock playback —
// only content-type matters. Keep that, drop the rest. Applied to every
// api.cf.*.hana.ondemand.com call regardless of path.
const CF_KEPT_HEADERS = new Set(["content-type"]);
const trimCfRawHeaders = (call) => {
  const kept = [];
  for (let i = 0; i < call.rawHeaders.length; i += 2) {
    if (CF_KEPT_HEADERS.has(call.rawHeaders[i])) {
      kept.push(call.rawHeaders[i], call.rawHeaders[i + 1]);
    }
  }
  call.rawHeaders = kept;
  return call;
};

const trimAndAnonymize = (calls) => {
  const processed = calls.map((call) => {
    // gunzip responses
    if (isGzippedCall(call)) {
      const contentEndcodingIndex = call.rawHeaders.findIndex((entry) => entry === "content-encoding");
      call.rawHeaders.splice(contentEndcodingIndex, 2);
      const buffer = gunzipSync(Buffer.concat(call.response.map((part) => Buffer.from(part, "hex"))));
      call.response = JSON.parse(buffer.toString());
    }

    // ##### CF-API /v3/apps/{guid}/env
    // ##### CF-API /v3/service_credential_bindings (list with ?app_guids=)
    // ##### CF-API /v3/service_credential_bindings/{guid}/details
    // ##### CF-API /v3/apps?space_guids=, /v3/apps/{guid}/processes,
    //              /v3/routes, /v3/service_plans
    if (/https:\/\/api\.cf\.[a-z]+\.hana\.ondemand\.com:443/.test(call.scope)) {
      call = trimCfRawHeaders(call);

      if (/\/v3\/apps\/[0-9a-f-]+\/env/.test(call.path)) {
        return anonymizeCfEnvCall(call);
      }
      if (/^\/v3\/service_credential_bindings\?app_guids=/.test(call.path)) {
        return trimCfBindingListCall(call);
      }
      if (/\/v3\/service_credential_bindings/.test(call.path)) {
        return anonymizeCfCredentialCall(call);
      }
      if (/^\/v3\/apps\?space_guids=/.test(call.path)) {
        return trimCfAppsListCall(call);
      }
      if (/^\/v3\/apps\/[0-9a-f-]+\/processes/.test(call.path)) {
        return trimCfProcessesCall(call);
      }
      if (/^\/v3\/routes/.test(call.path)) {
        return trimCfRoutesCall(call);
      }
      if (/\/v3\/service_plans/.test(call.path)) {
        return trimCfServicePlansCall(call);
      }
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

    // ##### SERVICE-MANAGER v1
    // "scope": "https://service-manager.cfapps.sap.hana.ondemand.com:443",
    // "path": "/v1/service_bindings",
    if (
      /https:\/\/service-manager\.cfapps\.sap\.hana\.ondemand\.com:443/.test(call.scope) &&
      (/\/v1\/service_offerings.*/.test(call.path) ||
        /\/v1\/service_plans.*/.test(call.path) ||
        /\/v1\/service_instances.*/.test(call.path) ||
        /\/v1\/service_bindings.*/.test(call.path))
    ) {
      if (/\/v1\/service_instances.*/.test(call.path)) {
        call = trimServiceManagerInstancesCall(call);
      } else if (/\/v1\/service_bindings.*/.test(call.path)) {
        call = trimServiceManagerBindingsCall(call);
      }
      return anonymizeServiceManagerCall(call);
    }

    // ##### SERVICE-MANAGER v2
    // "scope": "https://service-manager.cfapps.sap.hana.ondemand.com:443",
    // "path": "/v2/service_bindings", or operation-polling paths like
    //         "/v2/service_bindings/{id}/operations/{op_id}"
    if (
      /https:\/\/service-manager\.cfapps\.sap\.hana\.ondemand\.com:443/.test(call.scope) &&
      /\/v2\/service_(?:offerings|plans|instances|bindings)/.test(call.path)
    ) {
      // NOTE: list endpoints expose `items` and benefit from field-trim; nested
      //   paths (notably /.../operations/...) return single objects and are
      //   only anonymized.
      if (/\/v2\/service_instances(?:\?|$)/.test(call.path)) {
        call = trimServiceManagerInstancesV2Call(call);
      } else if (/\/v2\/service_bindings(?:\?|$)/.test(call.path)) {
        call = trimServiceManagerBindingsV2Call(call);
      }
      return anonymizeServiceManagerCall(call);
    }

    // ##### SAAS | SAAS-REGISTRY
    // "scope": "https://saas-manager.mesh.cf.sap.hana.ondemand.com:443",
    // "path": "/saas-manager/v1/",
    if (
      /https:\/\/saas-manager\.mesh\.cf\.sap\.hana\.ondemand\.com:443/.test(call.scope) &&
      /\/saas-manager\/v1\//.test(call.path)
    ) {
      return anonymizeSaasRegistryCall(call);
    }

    // ##### SAAS | SUBSCRIPTION-MANAGER
    // "scope": "https://saas-manager.mesh.cf.sap.hana.ondemand.com:443",
    // "path": "/subscription-manager/v1/",
    if (
      /https:\/\/saas-manager\.mesh\.cf\.sap\.hana\.ondemand\.com:443/.test(call.scope) &&
      /\/subscription-manager\/v1\//.test(call.path)
    ) {
      return anonymizeSubscriptionManagerCall(call);
    }

    // ##### SAAS | JOBS
    // "scope": "https://saas-manager.mesh.cf.sap.hana.ondemand.com:443",
    // "path": "/api/v2.0/jobs/",
    if (
      /https:\/\/saas-manager\.mesh\.cf\.sap\.hana\.ondemand\.com:443/.test(call.scope) &&
      /\/api\/v2\.0\/jobs\//.test(call.path)
    ) {
      return call;
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

  return collapseSharedRefs(processed);
};

module.exports = {
  trimAndAnonymize,
};

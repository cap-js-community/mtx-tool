"use strict";

const { parseIntWithFallback } = require("../shared/static");
const { assert } = require("../shared/error");
const { request } = require("../shared/request");
const { Logger } = require("../shared/logger");

const ENV = Object.freeze({
  SVM_CONCURRENCY: "MTX_SVM_CONCURRENCY",
});

const SERVICE_MANAGER_REQUEST_CONCURRENCY_FALLBACK = 8;
const SERVICE_MANAGER_IDEAL_BINDING_COUNT = 1;
const SENSITIVE_FIELD_MARKERS = ["password", "key"];
const SENSITIVE_FIELD_HIDDEN_TEXT = "*** show with --reveal ***";

const logger = Logger.getInstance();

const svmRequestConcurrency = parseIntWithFallback(
  process.env[ENV.SVM_CONCURRENCY],
  SERVICE_MANAGER_REQUEST_CONCURRENCY_FALLBACK
);

const _getQuery = (filters) =>
  Object.entries(filters)
    .reduce((acc, [key, value]) => {
      acc.push(`${key} eq '${value}'`);
      return acc;
    }, [])
    .join(" and ");

const _formatOutput = (output) =>
  JSON.stringify(Array.isArray(output) && output.length === 1 ? output[0] : output, null, 2);

const _hideSensitiveDataInBindingOrInstance = (entry) => {
  const fields = entry?.credentials ? Object.keys(entry.credentials) : [];
  for (const field of fields) {
    if (SENSITIVE_FIELD_MARKERS.some((marker) => field.includes(marker))) {
      entry.credentials[field] = SENSITIVE_FIELD_HIDDEN_TEXT;
    }
  }
};

const _serviceManagerInstances = async (context, { filterTenantId, doEnsureTenantLabel = true } = {}) => {
  const {
    cfService: { credentials },
  } = await context.getHdiInfo();
  const { sm_url } = credentials;
  const token = await context.getCachedUaaTokenFromCredentials(credentials);

  const response = await request({
    url: sm_url,
    pathname: "/v1/service_instances",
    query: {
      // fieldQuery: _getQuery({ service_plan_id: servicePlanId }),
      ...(filterTenantId && { labelQuery: _getQuery({ tenant_id: filterTenantId }) }),
    },
    auth: { token },
  });
  const responseData = (await response.json()) || {};
  let instances = responseData.items || [];
  if (doEnsureTenantLabel) {
    instances = instances.filter((instance) => instance.labels.tenant_id !== undefined);
  }
  return instances;
};

const _serviceManagerBindings = async (
  context,
  { filterTenantId, doReveal = false, doAssertFoundSome = false, doEnsureTenantLabel = true } = {}
) => {
  const {
    cfService: { credentials },
  } = await context.getHdiInfo();
  const { sm_url } = credentials;
  const token = await context.getCachedUaaTokenFromCredentials(credentials);

  const getBindingsResponse = await request({
    url: sm_url,
    pathname: "/v1/service_bindings",
    query: {
      labelQuery: _getQuery({
        // service_plan_id: servicePlanId,
        ...(filterTenantId && { tenant_id: filterTenantId }),
      }),
    },
    auth: { token },
  });
  const responseData = (await getBindingsResponse.json()) || {};
  let bindings = responseData.items || [];
  if (doEnsureTenantLabel) {
    bindings = bindings.filter((instance) => instance.labels.tenant_id !== undefined);
  }
  if (doAssertFoundSome) {
    if (filterTenantId) {
      assert(
        Array.isArray(bindings) && bindings.length >= 1,
        "could not find service binding for tenant %s",
        filterTenantId
      );
    } else {
      assert(Array.isArray(bindings) && bindings.length >= 1, "could not find any service bindings");
    }
  }
  if (!doReveal) {
    bindings.forEach(_hideSensitiveDataInBindingOrInstance);
  }
  return bindings;
};

const serviceManagerList = async (context, [tenantId], [doTimestamps, doJsonOutput]) =>
  await _serviceManagerList(context, { filterTenantId: tenantId, doTimestamps, doJsonOutput });

const _serviceManagerLongList = async (context, { filterTenantId, doJsonOutput, doReveal } = {}) => {
  const [instances, bindings] = await Promise.all([
    _serviceManagerInstances(context, { filterTenantId, doEnsureTenantLabel: false }),
    _serviceManagerBindings(context, { filterTenantId, doReveal, doEnsureTenantLabel: false }),
  ]);

  if (doJsonOutput) {
    return { instances, bindings };
  }
  return `
=== instance${instances.length === 1 ? "" : "s"} ===

${_formatOutput(instances)}

=== binding${bindings.length === 1 ? "" : "s"} ===

${_formatOutput(bindings)}
`;
};

const serviceManagerLongList = async (context, [filterTenantId], [doJsonOutput, doReveal]) =>
  await _serviceManagerLongList(context, { filterTenantId, doJsonOutput, doReveal });

module.exports = {
  serviceManagerList: () => {},
  serviceManagerLongList,

  _: {
    _reset() {
      // resetOneTime(_getHdiSharedPlanId);
    },
  },
};

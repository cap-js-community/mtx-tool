"use strict";

const { parseIntWithFallback, compareFor, formatTimestampsWithRelativeDays, tableList } = require("../shared/static");
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

const compareForServiceManagerTenantId = compareFor((a) => a.labels.tenant_id[0].toUpperCase());
// const compareForServiceManagerBindingUpdatedAtDesc = compareFor((a) => a.updated_at, true);

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

const _serviceManagerRequest = async (context, reqOptions = {}) => {
  const {
    cfService: { credentials },
  } = await context.getHdiInfo();
  const url = credentials.sm_url;
  const auth = { token: await context.getCachedUaaTokenFromCredentials(credentials) };
  const response = await request({ url, auth, ...reqOptions });
  return (await response.json())?.items ?? [];
};

const _serviceManagerOfferings = async (context) =>
  await _serviceManagerRequest(context, { pathname: "/v1/service_offerings" });

const _serviceManagerPlans = async (context) =>
  await _serviceManagerRequest(context, { pathname: "/v1/service_plans" });

const _serviceManagerInstances = async (context, { filterTenantId, doEnsureTenantLabel = true } = {}) => {
  let instances = await _serviceManagerRequest(context, {
    pathname: "/v1/service_instances",
    query: {
      // fieldQuery: _getQuery({ service_plan_id: servicePlanId }),
      ...(filterTenantId && { labelQuery: _getQuery({ tenant_id: filterTenantId }) }),
    },
  });
  if (doEnsureTenantLabel) {
    instances = instances.filter((instance) => instance.labels.tenant_id !== undefined);
  }
  return instances;
};

const _serviceManagerBindings = async (
  context,
  { filterTenantId, doReveal = false, doAssertFoundSome = false, doEnsureTenantLabel = true } = {}
) => {
  let bindings = await _serviceManagerRequest(context, {
    pathname: "/v1/service_bindings",
    query: {
      labelQuery: _getQuery({
        // service_plan_id: servicePlanId,
        ...(filterTenantId && { tenant_id: filterTenantId }),
      }),
    },
  });
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

const _clusterObjectsByKey = (dataObjects, key) => {
  return dataObjects.reduce((result, dataObject) => {
    const identifier = dataObject[key];
    if (result[identifier]) {
      result[identifier].push(dataObject);
    } else {
      result[identifier] = [dataObject];
    }
    return result;
  }, {});
};

const _serviceManagerList = async (context, { filterTenantId, doTimestamps, doJsonOutput }) => {
  const [offerings, plans, instances, bindings] = await Promise.all([
    _serviceManagerOfferings(context),
    _serviceManagerPlans(context),
    _serviceManagerInstances(context, { filterTenantId }),
    _serviceManagerBindings(context, { filterTenantId }),
  ]);
  const offeringsById = _clusterObjectsByKey(offerings, "id");
  const plansById = _clusterObjectsByKey(plans, "id");
  instances.sort(compareForServiceManagerTenantId);
  const bindingsByInstance = _clusterObjectsByKey(bindings, "service_instance_id");

  const nowDate = new Date();
  const headerRow = ["tenant_id", "service", "instance_id", "", "binding_id", "ready"];
  doTimestamps && headerRow.push("created_on", "updated_on");
  const table = [headerRow];

  if (doJsonOutput) {
    return {
      instances: instances.map((instance) => {
        return { ...instance, bindings: bindingsByInstance[instance.id] };
      }),
    };
  }

  for (const instance of instances) {
    const [plan] = plansById[instance.service_plan_id];
    const [offering] = offeringsById[plan.service_offering_id];
    const instanceBindings = bindingsByInstance[instance.id];
    if (instanceBindings) {
      for (const [index, binding] of instanceBindings.entries()) {
        const row = [];
        if (index === 0) {
          row.push(
            instance.labels.tenant_id[0],
            `${offering.name}:${plan.name}`,
            instance.id,
            instanceBindings.length === 1 ? "---" : "-+-",
            binding.id,
            binding.ready
          );
        } else {
          row.push("", "", index === instanceBindings.length - 1 ? " \\-" : " |-", binding.id, binding.ready);
        }
        doTimestamps &&
          row.push(...formatTimestampsWithRelativeDays([binding.created_at, binding.updated_at], nowDate));
        table.push(row);
      }
    } else {
      table.push([instance.labels.tenant_id[0], instance.id, "-x"]);
    }
  }

  return tableList(table, { sortCol: null, withRowNumber: !filterTenantId });
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
  serviceManagerList,
  serviceManagerLongList,

  _: {
    _reset() {
      // resetOneTime(_getHdiSharedPlanId);
    },
  },
};

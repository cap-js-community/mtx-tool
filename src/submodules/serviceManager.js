/**
 * This is a wrapper for APIs of the service-manager
 * - https://api.sap.com/api/APIServiceManager/resource/Service_Instances
 * - https://api.sap.com/api/APIServiceManager/resource/Service_Bindings
 */
"use strict";

const {
  parseIntWithFallback,
  compareFor,
  formatTimestampsWithRelativeDays,
  tableList,
  tryJsonParse,
  isObject,
  partition,
  randomString,
  makeOneTime,
  resetOneTime,
} = require("../shared/static");
const { assert } = require("../shared/error");
const { request, RETRY_MODE } = require("../shared/request");
const { Logger } = require("../shared/logger");
const { limiter, FunnelQueue } = require("../shared/funnel");

const ENV = Object.freeze({
  SVM_CONCURRENCY: "MTX_SVM_CONCURRENCY",
});

const SERVICE_MANAGER_REQUEST_CONCURRENCY_FALLBACK = 8;
const SERVICE_MANAGER_IDEAL_BINDING_COUNT = 1;
const SERVICE_PLAN_ALL_IDENTIFIER = "all-services";
const TENANT_ID_ALL_IDENTIFIER = "all-tenants";
const SENSITIVE_FIELD_NAMES = ["uri"];
const SENSITIVE_FIELD_MARKERS = ["password", "key"];
const SENSITIVE_FIELD_HIDDEN_TEXT = "*** show with --reveal ***";

const QUERY_TYPE = {
  FIELD: "fieldQuery",
  LABEL: "labelQuery",
};

const logger = Logger.getInstance();

const svmRequestConcurrency = parseIntWithFallback(
  process.env[ENV.SVM_CONCURRENCY],
  SERVICE_MANAGER_REQUEST_CONCURRENCY_FALLBACK
);

// NOTE: the tenant ids for service manager are not necessarily uuids, this is a much broader validator
const isValidTenantId = (input) => input && /^[0-9a-z-_/]+$/i.test(input);

const compareForTenantId = compareFor((a) => a.labels.tenant_id[0].toUpperCase());
const compareForUpdatedAtDesc = compareFor((a) => a.updated_at, true);

const _formatOutput = (output) =>
  JSON.stringify(Array.isArray(output) && output.length === 1 ? output[0] : output, null, 2);

const _hideSensitiveDataInBindingOrInstance = (entry) => {
  const fields = entry?.credentials ? Object.keys(entry.credentials) : [];
  for (const field of fields) {
    if (SENSITIVE_FIELD_MARKERS.some((marker) => field.includes(marker)) || SENSITIVE_FIELD_NAMES.includes(field)) {
      entry.credentials[field] = SENSITIVE_FIELD_HIDDEN_TEXT;
    }
  }
};

const _getQueryPart = (filters) =>
  Object.entries(filters)
    .reduce((acc, [key, value]) => {
      acc.push(`${key} eq '${value}'`);
      return acc;
    }, [])
    .join(" and ");

const _getQuery = (components) => {
  const partMap = components.reduce((acc, { predicate, type, key, value }) => {
    if (predicate) {
      if (!Object.prototype.hasOwnProperty.call(acc, type)) {
        acc[type] = { [key]: value };
      } else {
        acc[type][key] = value;
      }
    }
    return acc;
  }, {});
  const parts = Object.entries(partMap);
  return parts.length === 0
    ? undefined
    : parts.reduce(
        (acc, [type, filters]) => {
          acc["query"][type] = _getQueryPart(filters);
          return acc;
        },
        { query: {} }
      );
};

const _serviceManagerRequest = async (context, reqOptions = {}) => {
  const {
    cfService: { credentials },
  } = await context.getHdiInfo();
  const url = credentials.sm_url;
  const auth = { token: await context.getCachedUaaTokenFromCredentials(credentials) };
  const response = await request({ url, auth, ...reqOptions });

  if (reqOptions.method) {
    return response;
  }
  // NOTE: no method here means GET and all service endpoints we use have this structure
  return (await response.json())?.items ?? [];
};

const _requestOfferings = makeOneTime(
  async (context, { filterServiceOfferingName } = {}) =>
    await _serviceManagerRequest(context, {
      pathname: "/v1/service_offerings",
      ..._getQuery([
        { predicate: filterServiceOfferingName, type: QUERY_TYPE.FIELD, key: "name", value: filterServiceOfferingName },
      ]),
    })
);

const _requestPlans = makeOneTime(
  async (context, { filterServicePlanId, filterServiceOfferingId, filterServicePlanName } = {}) => {
    return await _serviceManagerRequest(context, {
      pathname: "/v1/service_plans",
      ..._getQuery([
        { predicate: filterServicePlanId, type: QUERY_TYPE.FIELD, key: "id", value: filterServicePlanId },
        {
          predicate: filterServiceOfferingId,
          type: QUERY_TYPE.FIELD,
          key: "service_offering_id",
          value: filterServiceOfferingId,
        },
        { predicate: filterServicePlanName, type: QUERY_TYPE.FIELD, key: "name", value: filterServicePlanName },
      ]),
    });
  }
);

const _requestInstances = async (
  context,
  { filterTenantId, filterServicePlanId, doEnsureReady = false, doEnsureTenantLabel = false } = {}
) => {
  let instances = await _serviceManagerRequest(context, {
    pathname: "/v1/service_instances",
    ..._getQuery([
      { predicate: doEnsureReady, type: QUERY_TYPE.FIELD, key: "ready", value: true },
      { predicate: filterServicePlanId, type: QUERY_TYPE.FIELD, key: "service_plan_id", value: filterServicePlanId },
      { predicate: filterTenantId, type: QUERY_TYPE.LABEL, key: "tenant_id", value: filterTenantId },
    ]),
  });
  if (doEnsureTenantLabel) {
    instances = instances.filter((instance) => instance.labels.tenant_id !== undefined);
  }
  return instances;
};

const _requestBindings = async (
  context,
  {
    filterTenantId,
    doEnsureReady = false,
    doEnsureTenantLabel = false,
    doAssertFoundSome = false,
    doReveal = false,
  } = {}
) => {
  let bindings = await _serviceManagerRequest(context, {
    pathname: "/v1/service_bindings",
    ..._getQuery([
      { predicate: doEnsureReady, type: QUERY_TYPE.FIELD, key: "ready", value: true },
      { predicate: filterTenantId, type: QUERY_TYPE.LABEL, key: "tenant_id", value: filterTenantId },
    ]),
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

const _indexByKey = (dataObjects, key) =>
  dataObjects.reduce((result, dataObject) => {
    const identifier = dataObject[key];
    result[identifier] = dataObject;
    return result;
  }, {});

const _clusterByKey = (dataObjects, key) =>
  dataObjects.reduce((result, dataObject) => {
    const identifier = dataObject[key];
    if (result[identifier]) {
      result[identifier].push(dataObject);
    } else {
      result[identifier] = [dataObject];
    }
    return result;
  }, {});

const _indexServicePlanNameById = (offerings, plans) => {
  const offeringById = _indexByKey(offerings, "id");
  return plans.reduce((acc, plan) => {
    acc[plan.id] = `${offeringById[plan.service_offering_id].name}:${plan.name}`;
    return acc;
  }, {});
};

const _serviceManagerList = async (context, { filterTenantId, doTimestamps, doJsonOutput }) => {
  const [offerings, plans, instances, bindings] = await Promise.all([
    _requestOfferings(context),
    _requestPlans(context),
    _requestInstances(context, { filterTenantId, doEnsureTenantLabel: true }),
    _requestBindings(context, { filterTenantId }),
  ]);
  const servicePlanNameById = _indexServicePlanNameById(offerings, plans);
  instances.sort(compareForTenantId);
  const bindingsByInstance = _clusterByKey(bindings, "service_instance_id");

  if (doJsonOutput) {
    return {
      instances: instances.map((instance) => {
        return { ...instance, bindings: bindingsByInstance[instance.id] };
      }),
    };
  }

  const nowDate = new Date();
  const headerRow = [
    "tenant_id",
    "service_plan",
    "instance_id",
    "ready",
    ...(doTimestamps ? ["created_on", "updated_on"] : []),
    "",
    "binding_id",
    "ready",
    ...(doTimestamps ? ["created_on", "updated_on"] : []),
  ];
  const table = [headerRow];

  const connectorPiece = (length, index) =>
    length === 0 ? "-x " : length === 1 ? "---" : index === 0 ? "-+-" : index === length - 1 ? " \\-" : " |-";

  for (const instance of instances) {
    const instanceBindings = bindingsByInstance[instance.id];
    if (instanceBindings) {
      for (const [index, binding] of instanceBindings.entries()) {
        table.push([
          instance.labels.tenant_id[0],
          servicePlanNameById[instance.service_plan_id],
          instance.id,
          instance.ready,
          ...(doTimestamps
            ? formatTimestampsWithRelativeDays([instance.created_at, instance.updated_at], nowDate)
            : []),
          connectorPiece(instanceBindings.length, index),
          binding.id,
          binding.ready,
          ...(doTimestamps ? formatTimestampsWithRelativeDays([binding.created_at, binding.updated_at], nowDate) : []),
        ]);
      }
    } else {
      table.push([
        instance.labels.tenant_id[0],
        servicePlanNameById[instance.service_plan_id],
        instance.id,
        instance.ready,
        ...(doTimestamps ? formatTimestampsWithRelativeDays([instance.created_at, instance.updated_at], nowDate) : []),
        connectorPiece(0, 0),
      ]);
    }
  }

  return tableList(table, { sortCol: null, withRowNumber: !filterTenantId });
};

const serviceManagerList = async (context, [tenantId], [doTimestamps, doJsonOutput]) =>
  await _serviceManagerList(context, { filterTenantId: tenantId, doTimestamps, doJsonOutput });

const _serviceManagerLongList = async (context, { filterTenantId, doJsonOutput, doReveal } = {}) => {
  const [instances, bindings] = await Promise.all([
    _requestInstances(context, { filterTenantId }),
    _requestBindings(context, { filterTenantId, doReveal }),
  ]);

  if (doJsonOutput) {
    return { instances, bindings };
  }
  return `
=== ${instances.length} instance${instances.length === 1 ? "" : "s"} ===

${_formatOutput(instances)}

=== ${bindings.length} binding${bindings.length === 1 ? "" : "s"} ===

${_formatOutput(bindings)}
`;
};

const serviceManagerLongList = async (context, [filterTenantId], [doJsonOutput, doReveal]) =>
  await _serviceManagerLongList(context, { filterTenantId, doJsonOutput, doReveal });

const _requestCreateBinding = async (context, instance, { name = randomString(32), parameters } = {}) => {
  const labels = Object.entries(instance.labels)
    .filter(([key]) => !["container_id", "subaccount_id"].includes(key))
    .reduce((acc, [key, value]) => ((acc[key] = value), acc), {});
  await _serviceManagerRequest(context, {
    retryMode: RETRY_MODE.ALL_FAILED,
    method: "POST",
    pathname: `/v1/service_bindings`,
    query: { async: false },
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      service_instance_id: instance.id,
      labels,
      ...(parameters && { parameters }),
    }),
  });
};

const _requestDeleteBinding = async (context, serviceBindingId) =>
  await _serviceManagerRequest(context, {
    retryMode: RETRY_MODE.ALL_FAILED,
    method: "DELETE",
    pathname: `/v1/service_bindings/${serviceBindingId}`,
    query: { async: false },
  });

const _serviceManagerRepairBindings = async (context, { filterServicePlanId, parameters } = {}) => {
  const [offerings, plans, instances, bindings] = await Promise.all([
    _requestOfferings(context),
    _requestPlans(context, { filterServicePlanId }),
    _requestInstances(context, { filterServicePlanId, doEnsureReady: true, doEnsureTenantLabel: true }),
    _requestBindings(context),
  ]);

  const servicePlanNameById = _indexServicePlanNameById(offerings, plans);
  const bindingsByInstance = _clusterByKey(bindings, "service_instance_id");
  instances.sort(compareForTenantId);
  const changeQueue = new FunnelQueue(svmRequestConcurrency);

  for (const instance of instances) {
    const tenantId = instance.labels.tenant_id[0];
    const servicePlanName = servicePlanNameById[instance.service_plan_id];
    const instanceBindings = bindingsByInstance[instance.id] ?? [];
    instanceBindings.sort(compareForUpdatedAtDesc);

    const [readyBindings, unreadyBindings] = partition(instanceBindings, (binding) => binding.ready);
    if (readyBindings.length < SERVICE_MANAGER_IDEAL_BINDING_COUNT) {
      const missingBindingCount = SERVICE_MANAGER_IDEAL_BINDING_COUNT - instanceBindings.length;
      for (let i = 0; i < missingBindingCount; i++) {
        changeQueue.enqueue(async () => await _requestCreateBinding(context, instance, { parameters }));
      }
      changeQueue.milestone().then(() => {
        logger.info(
          "created %i missing binding%s for tenant %s plan %s",
          missingBindingCount,
          missingBindingCount === 1 ? "" : "s",
          tenantId,
          servicePlanName
        );
      });
    } else if (readyBindings.length > SERVICE_MANAGER_IDEAL_BINDING_COUNT) {
      const ambivalentBindings = readyBindings.slice(1);
      for (const ambivalentBinding of ambivalentBindings) {
        changeQueue.enqueue(async () => await _requestDeleteBinding(context, ambivalentBinding.id));
      }
      changeQueue.milestone().then(() => {
        logger.info(
          "deleted %i ambivalent binding%s for tenant %s plan %s",
          ambivalentBindings.length,
          ambivalentBindings.length === 1 ? "" : "s",
          tenantId,
          servicePlanName
        );
      });
    }
    if (unreadyBindings.length > 0) {
      for (const unreadyBinding of unreadyBindings) {
        changeQueue.enqueue(async () => await _requestDeleteBinding(context, unreadyBinding.id));
      }
      changeQueue.milestone().then(() => {
        logger.info(
          "deleted %i unready binding%s for tenant %s plan %s",
          unreadyBindings.length,
          unreadyBindings.length === 1 ? "" : "s",
          tenantId,
          servicePlanName
        );
      });
    }
  }

  const changeCount = changeQueue.size();
  if (changeCount === 0) {
    logger.info(
      "found ideal binding count %i for %i instances, all is well",
      SERVICE_MANAGER_IDEAL_BINDING_COUNT,
      instances.length
    );
  } else {
    logger.info("triggering %i change%s", changeCount, changeCount === 1 ? "" : "s");
    await changeQueue.dequeueAll();
  }
};

const _resolveServicePlanId = async (context, servicePlanName) => {
  const match = /^(\S+):(\S+)$/i.exec(servicePlanName);
  assert(
    match !== null,
    `could not detect form "offering:plan" or "${SERVICE_PLAN_ALL_IDENTIFIER}" in "${servicePlanName}"`
  );
  const [, offeringName, planName] = match;
  const [offering] = await _requestOfferings(context, { filterServiceOfferingName: offeringName });
  assert(offering?.id, `could not find service offering "${offeringName}"`);
  const [plan] = await _requestPlans(context, {
    filterServicePlanName: planName,
    filterServiceOfferingId: offering.id,
  });
  assert(plan?.id, `could not find service plan "${planName}" within offering "${offeringName}"`);
  return plan.id;
};

const serviceManagerRepairBindings = async (context, [servicePlanName], [rawParameters]) => {
  const doFilterServicePlan = servicePlanName !== SERVICE_PLAN_ALL_IDENTIFIER;
  const filterServicePlanId = doFilterServicePlan && (await _resolveServicePlanId(context, servicePlanName));
  const parameters = tryJsonParse(rawParameters);
  assert(!rawParameters || isObject(parameters), `argument "${rawParameters}" needs to be a valid JSON object`);
  return await _serviceManagerRepairBindings(context, {
    ...(doFilterServicePlan && { filterServicePlanId }),
    parameters,
  });
};

const _serviceManagerRefreshBindings = async (context, { filterServicePlanId, filterTenantId, parameters } = {}) => {
  const [instances, bindings] = await Promise.all([
    _requestInstances(context, { filterTenantId, filterServicePlanId, doEnsureReady: true, doEnsureTenantLabel: true }),
    _requestBindings(context, { filterTenantId }),
  ]);

  const instanceById = _indexByKey(instances, "id");
  const filteredBindings = bindings.filter((binding) => instanceById[binding.service_instance_id]);
  await limiter(svmRequestConcurrency, filteredBindings, async (binding) => {
    const instance = instanceById[binding.service_instance_id];
    await _requestCreateBinding(context, instance, { parameters });
    await _requestDeleteBinding(context, binding.id);
  });
  logger.info("refreshed %i binding%s", filteredBindings.length, filteredBindings.length === 1 ? "" : "s");
};

const serviceManagerRefreshBindings = async (context, [servicePlanName, tenantId], [rawParameters]) => {
  const doFilterServicePlan = servicePlanName !== SERVICE_PLAN_ALL_IDENTIFIER;
  const filterServicePlanId = doFilterServicePlan && (await _resolveServicePlanId(context, servicePlanName));
  const doFilterTenantId = tenantId !== TENANT_ID_ALL_IDENTIFIER;
  const filterTenantId = doFilterTenantId && tenantId;
  assert(!doFilterTenantId || isValidTenantId(filterTenantId), `argument "${tenantId}" is not a valid tenant id`);
  const parameters = tryJsonParse(rawParameters);
  assert(!rawParameters || isObject(parameters), `argument "${rawParameters}" needs to be a valid JSON object`);

  return await _serviceManagerRefreshBindings(context, {
    ...(doFilterServicePlan && { filterServicePlanId }),
    ...(doFilterTenantId && { filterTenantId }),
    parameters,
  });
};

const _serviceManagerDelete = async (
  context,
  { doDeleteInstances = false, doDeleteBindings = false, filterServicePlanId, filterTenantId } = {}
) => {
  const [instances, bindings] = await Promise.all([
    _requestInstances(context, { filterTenantId, filterServicePlanId }),
    _requestBindings(context, { filterTenantId }),
  ]);

  if (doDeleteBindings) {
    const instanceById = _indexByKey(instances, "id");
    const filteredBindings = bindings.filter((binding) => instanceById[binding.service_instance_id]);
    await limiter(
      svmRequestConcurrency,
      filteredBindings,
      async (binding) => await _requestDeleteBinding(context, binding.id)
    );
    logger.info("deleted %i binding%s", filteredBindings.length, filteredBindings.length === 1 ? "" : "s");
  }

  if (doDeleteInstances) {
    await limiter(
      svmRequestConcurrency,
      instances,
      async (instance) => await _requestDeleteInstance(context, instance.id)
    );
    logger.info("deleted %i instance%s", instances.length, instances.length === 1 ? "" : "s");
  }
};

const serviceManagerDeleteBindings = async (context, [servicePlanName, tenantId]) => {
  const doFilterServicePlan = servicePlanName !== SERVICE_PLAN_ALL_IDENTIFIER;
  const filterServicePlanId = doFilterServicePlan && (await _resolveServicePlanId(context, servicePlanName));
  const doFilterTenantId = tenantId !== TENANT_ID_ALL_IDENTIFIER;
  const filterTenantId = doFilterTenantId && tenantId;
  assert(!doFilterTenantId || isValidTenantId(filterTenantId), `argument "${tenantId}" is not a valid tenant id`);
  return await _serviceManagerDelete(context, {
    doDeleteBindings: true,
    ...(doFilterServicePlan && { filterServicePlanId }),
    ...(doFilterTenantId && { filterTenantId }),
  });
};

const _requestDeleteInstance = async (context, serviceInstanceId) =>
  await _serviceManagerRequest(context, {
    retryMode: RETRY_MODE.ALL_FAILED,
    method: "DELETE",
    pathname: `/v1/service_instances/${serviceInstanceId}`,
    query: { async: false },
  });

const serviceManagerDeleteInstancesAndBindings = async (context, [servicePlanName, tenantId]) => {
  const doFilterServicePlan = servicePlanName !== SERVICE_PLAN_ALL_IDENTIFIER;
  const filterServicePlanId = doFilterServicePlan && (await _resolveServicePlanId(context, servicePlanName));
  const doFilterTenantId = tenantId !== TENANT_ID_ALL_IDENTIFIER;
  const filterTenantId = doFilterTenantId && tenantId;
  assert(!doFilterTenantId || isValidTenantId(filterTenantId), `argument "${tenantId}" is not a valid tenant id`);
  return await _serviceManagerDelete(context, {
    doDeleteInstances: true,
    doDeleteBindings: true,
    ...(doFilterServicePlan && { filterServicePlanId }),
    ...(doFilterTenantId && { filterTenantId }),
  });
};

module.exports = {
  serviceManagerList,
  serviceManagerLongList,
  serviceManagerRepairBindings,
  serviceManagerRefreshBindings,
  serviceManagerDeleteBindings,
  serviceManagerDeleteInstancesAndBindings,

  _: {
    _reset() {
      resetOneTime(_requestOfferings);
      resetOneTime(_requestPlans);
    },
  },
};

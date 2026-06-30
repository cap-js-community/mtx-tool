/**
 * This is a wrapper for APIs of the service-manager
 * - https://api.sap.com/api/APIServiceManager/resource/Service_Instances
 * - https://api.sap.com/api/APIServiceManager/resource/Service_Bindings
 *
 * API docs for v2
 * https://service-manager.cfapps.sap.hana.ondemand.com/v2/swagger/swaggerui/
 */
"use strict";

const packageInfo = require("../../package.json");
const {
  parseIntWithFallback,
  compareFor,
  formatTimestampsWithRelativeDays,
  tableList,
  tryJsonParse,
  isObject,
  partition,
  randomString,
  indexByKey,
  clusterByKey,
  sleep,
} = require("../shared/static");
const { makeOneTime } = require("../shared/execution-control");
const { assert, fail } = require("../shared/error");
const { request } = require("../shared/request");
const { Logger } = require("../shared/logger");
const { limiter, FunnelQueue } = require("../shared/funnel");

const ENV = Object.freeze({
  SVM_CONCURRENCY: "MTX_SVM_CONCURRENCY",
  SVM_POLL_FREQUENCY: "MTX_SVM_POLL_FREQUENCY",
});

const SERVICE_MANAGER_REQUEST_CONCURRENCY_FALLBACK = 6;
const SERVICE_MANAGER_POLL_FREQUENCY_FALLBACK = 6000;
const SERVICE_MANAGER_IDEAL_BINDING_COUNT = 1;
const SERVICE_PLAN_ALL_IDENTIFIER = "all-services";
const TENANT_ID_ALL_IDENTIFIER = "all-tenants";
const SENSITIVE_FIELD_NAMES = ["uri"];
const SENSITIVE_FIELD_MARKERS = ["password", "key"];
const SENSITIVE_FIELD_HIDDEN_TEXT = "*** show with --reveal ***";

const QUERY_TYPE = {
  FIELD: "field",
  LABEL: "label",
};

const OPERATION_STATE = Object.freeze({
  IN_PROGRESS: "in progress",
  PENDING: "pending",
  POLLING: "polling",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
});

// NOTE: old versions of cap java relied on managing_client_lib label for hana containers
const HANA_CONTAINER_OFFERING_PLAN_NAME = "hana:hdi-shared";
const HANA_CONTAINER_LABELS = { managing_client_lib: ["instance-manager-client-lib"] };

const logger = Logger.getInstance();

const svmRequestConcurrency = parseIntWithFallback(
  process.env[ENV.SVM_CONCURRENCY],
  SERVICE_MANAGER_REQUEST_CONCURRENCY_FALLBACK
);
const svmPollFrequency = parseIntWithFallback(
  process.env[ENV.SVM_POLL_FREQUENCY],
  SERVICE_MANAGER_POLL_FREQUENCY_FALLBACK
);

// NOTE: the tenant ids for service manager are not necessarily uuids, this is a much broader validator
const isValidTenantId = (input) => input && /^[0-9a-z-_/]+$/i.test(input);

const compareForTenantId = compareFor((a) => a.labels.tenant_id[0].toUpperCase());
const compareForUpdatedAtDesc = compareFor((a) => a.updated_at, true);

const _formatOutput = (output) =>
  JSON.stringify(Array.isArray(output) && output.length === 1 ? output[0] : output, null, 2);

const _hideSensitiveDataInBinding = (entry) => {
  const fields = entry?.credentials ? Object.keys(entry.credentials) : [];
  for (const field of fields) {
    if (SENSITIVE_FIELD_MARKERS.some((marker) => field.includes(marker)) || SENSITIVE_FIELD_NAMES.includes(field)) {
      entry.credentials[field] = SENSITIVE_FIELD_HIDDEN_TEXT;
    }
  }
};

const _getQuery = (components) => {
  const labels = [];
  const query = {};
  for (const { predicate, type, key, value } of components) {
    if (!predicate) continue;
    if (type === QUERY_TYPE.LABEL) {
      labels.push(`${key}=${value}`);
    } else {
      query[key] = value;
    }
  }
  if (labels.length > 0) {
    query.labels = labels.join(",");
  }
  return Object.keys(query).length > 0 ? { query } : undefined;
};

// NOTE: service-manager v2 paginates via a Link header: </path?page_token=x>; rel="next"
const _parseLinkNextPageToken = (linkHeader) => {
  if (!linkHeader) return undefined;
  const match = /[<]([^>]+)[>]; rel="next"/.exec(linkHeader);
  if (!match || !match[1]) return undefined;
  return new URL(match[1], "http://x").searchParams.get("page_token");
};

const _serviceManagerRequestBase = async (context, reqOptions = {}) => {
  const {
    cfBinding: { credentials },
  } = await context.getHdiInfo();
  const url = credentials.sm_url;
  const auth = { token: await context.getCachedUaaTokenFromCredentials(credentials) };
  return await request({
    url,
    auth,
    ...reqOptions,
    headers: {
      // NOTE: service-manager uses this client information for better consumption reporting and rate-limiting
      "Client-Name": packageInfo.name,
      "Client-Version": packageInfo.version,
      ...reqOptions?.headers,
    },
  });
};

const _serviceManagerRequest = async (context, reqOptions = {}) => {
  if ([undefined, "GET"].includes(reqOptions.method)) {
    // NOTE: GET — accumulate pages until no Link rel="next" header
    let items = [];
    let pageToken;
    do {
      const response = await _serviceManagerRequestBase(context, {
        ...reqOptions,
        ...(pageToken && { query: { ...reqOptions.query, page_token: pageToken } }),
      });
      const data = await response.json();
      items = items.concat(data?.items ?? []);
      pageToken = _parseLinkNextPageToken(response.headers.get("link"));
    } while (pageToken);
    return items;
  } else if (["POST", "DELETE"].includes(reqOptions.method)) {
    const response = await _serviceManagerRequestBase(context, reqOptions);
    const location = response.headers.get("location");
    assert(location, "missing location header for polling from %s", reqOptions.pathname);
    let operation;
    do {
      await sleep(svmPollFrequency);
      const pollResponse = await _serviceManagerRequestBase(context, { pathname: location });
      operation = await pollResponse.json();
    } while (operation.state !== OPERATION_STATE.SUCCEEDED && operation.state !== OPERATION_STATE.FAILED);
    if (operation.state === OPERATION_STATE.FAILED) {
      const detail = operation.error?.description ?? operation.error?.broker_error?.description ?? "";
      fail("service-manager operation failed for %s: %s", location, detail);
    }
  } else {
    return fail("method %s not implemented for service-manager request", reqOptions.method);
  }
};

const _requestOfferings = makeOneTime(
  async (context, { filterServiceOfferingName } = {}) =>
    await _serviceManagerRequest(context, {
      pathname: "/v2/service_offerings",
      ..._getQuery([
        { predicate: filterServiceOfferingName, type: QUERY_TYPE.FIELD, key: "name", value: filterServiceOfferingName },
      ]),
    })
);

const _requestPlans = makeOneTime(
  async (context, { filterServicePlanId, filterServiceOfferingId, filterServicePlanName } = {}) => {
    return await _serviceManagerRequest(context, {
      pathname: "/v2/service_plans",
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

// NOTE: we rely on service brokers to implement usable:
//   https://github.com/cloudfoundry/servicebroker/blob/v2.17/spec.md#service-broker-errors
const _requestInstances = async (
  context,
  { filterTenantId, filterServicePlanId, doEnsureUsable = false, doEnsureTenantLabel = false } = {}
) => {
  let instances = await _serviceManagerRequest(context, {
    pathname: "/v2/service_instances",
    ..._getQuery([
      { predicate: filterServicePlanId, type: QUERY_TYPE.FIELD, key: "service_plan_id", value: filterServicePlanId },
      { predicate: filterTenantId, type: QUERY_TYPE.LABEL, key: "tenant_id", value: filterTenantId },
    ]),
  });
  if (doEnsureUsable) {
    instances = instances.filter((instance) => instance.usable);
  }
  if (doEnsureTenantLabel) {
    instances = instances.filter((instance) => instance.labels.tenant_id !== undefined);
  }
  return instances;
};

const _requestBindings = async (
  context,
  { filterTenantId, doEnsureTenantLabel = false, doAssertFoundSome = false, doReveal = false } = {}
) => {
  let bindings = await _serviceManagerRequest(context, {
    pathname: "/v2/service_bindings",
    ..._getQuery([{ predicate: filterTenantId, type: QUERY_TYPE.LABEL, key: "tenant_id", value: filterTenantId }]),
  });
  if (doEnsureTenantLabel) {
    bindings = bindings.filter((binding) => binding.labels.tenant_id !== undefined);
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
    bindings.forEach(_hideSensitiveDataInBinding);
  }
  return bindings;
};

const _indexServicePlanNameById = (offerings, plans) => {
  const offeringById = indexByKey(offerings, "id");
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
  const bindingsByInstance = clusterByKey(bindings, "service_instance_id");

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
    "usable",
    ...(doTimestamps ? ["created_on", "updated_on"] : []),
    "",
    "binding_id",
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
          instance.usable,
          ...(doTimestamps
            ? formatTimestampsWithRelativeDays([instance.created_at, instance.updated_at], nowDate)
            : []),
          connectorPiece(instanceBindings.length, index),
          binding.id,
          ...(doTimestamps ? formatTimestampsWithRelativeDays([binding.created_at, binding.updated_at], nowDate) : []),
        ]);
      }
    } else {
      table.push([
        instance.labels.tenant_id[0],
        servicePlanNameById[instance.service_plan_id],
        instance.id,
        instance.usable,
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

const _requestCreateBinding = async (
  context,
  serviceInstanceId,
  servicePlanId,
  labelsInput,
  { name = randomString(32), parameters } = {}
) => {
  // NOTE: service-manager sets the container_id and subaccount_id itself and will block requests that set these
  // NOTE: cds-mtxs relies on service_plan_id label
  const labels = Object.entries(labelsInput)
    .concat([["service_plan_id", [servicePlanId]]])
    .filter(([key]) => !["container_id", "subaccount_id"].includes(key))
    .reduce((acc, [key, value]) => ((acc[key] = value), acc), {});
  await _serviceManagerRequest(context, {
    method: "POST",
    pathname: `/v2/service_bindings`,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      service_instance_id: serviceInstanceId,
      labels,
      ...(parameters && { parameters }),
    }),
  });
};

const _requestDeleteBinding = async (context, serviceBindingId) =>
  await _serviceManagerRequest(context, {
    method: "DELETE",
    pathname: `/v2/service_bindings/${serviceBindingId}`,
  });

const _serviceManagerRepairBindings = async (context, { filterServicePlanId, parameters } = {}) => {
  const [offerings, plans, instances, bindings] = await Promise.all([
    _requestOfferings(context),
    _requestPlans(context, { filterServicePlanId }),
    _requestInstances(context, { filterServicePlanId, doEnsureUsable: true, doEnsureTenantLabel: true }),
    _requestBindings(context),
  ]);

  instances.sort(compareForTenantId);
  bindings.sort(compareForUpdatedAtDesc);
  const servicePlanNameById = _indexServicePlanNameById(offerings, plans);
  const bindingsByInstance = clusterByKey(bindings, "service_instance_id");
  const changeQueue = new FunnelQueue(svmRequestConcurrency);

  for (const instance of instances) {
    const tenantId = instance.labels.tenant_id[0];
    const servicePlanName = servicePlanNameById[instance.service_plan_id];
    const instanceBindings = bindingsByInstance[instance.id] ?? [];

    // NOTE: we want to cleanup unusable bindings here. we assume non-succeeded bindings are failed.
    // TODO: validate that this assumption makes sense in practice.
    const [succeededBindings, failedBindings] = partition(
      instanceBindings,
      (binding) => binding.last_operation?.state === OPERATION_STATE.SUCCEEDED
    );
    if (succeededBindings.length < SERVICE_MANAGER_IDEAL_BINDING_COUNT) {
      const missingBindingCount = SERVICE_MANAGER_IDEAL_BINDING_COUNT - instanceBindings.length;
      for (let i = 0; i < missingBindingCount; i++) {
        const newLabels = {
          ...instance.labels,
          ...(servicePlanName === HANA_CONTAINER_OFFERING_PLAN_NAME && HANA_CONTAINER_LABELS),
        };
        changeQueue.enqueue(
          async () =>
            await _requestCreateBinding(context, instance.id, instance.service_plan_id, newLabels, { parameters })
        );
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
    } else if (succeededBindings.length > SERVICE_MANAGER_IDEAL_BINDING_COUNT) {
      const ambivalentBindings = succeededBindings.slice(1);
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
    if (failedBindings.length > 0) {
      for (const failedBinding of failedBindings) {
        changeQueue.enqueue(async () => await _requestDeleteBinding(context, failedBinding.id));
      }
      changeQueue.milestone().then(() => {
        logger.info(
          "deleted %i failed binding%s for tenant %s plan %s",
          failedBindings.length,
          failedBindings.length === 1 ? "" : "s",
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

const _serviceManagerFreshBindings = async (
  context,
  { filterServicePlanId, filterTenantId, parameters, doRefresh = false } = {}
) => {
  const [offerings, plans, instances, bindings] = await Promise.all([
    _requestOfferings(context),
    _requestPlans(context, { filterServicePlanId }),
    _requestInstances(context, {
      filterTenantId,
      filterServicePlanId,
      doEnsureUsable: true,
      doEnsureTenantLabel: true,
    }),
    _requestBindings(context, { filterTenantId }),
  ]);

  bindings.sort(compareForUpdatedAtDesc);
  const servicePlanNameById = _indexServicePlanNameById(offerings, plans);
  const bindingsByInstance = clusterByKey(bindings, "service_instance_id");

  await limiter(svmRequestConcurrency, instances, async (instance) => {
    const [binding] = bindingsByInstance[instance.id] ?? [];
    const servicePlanName = servicePlanNameById[instance.service_plan_id];
    const newLabels = {
      ...instance.labels,
      ...(binding && binding.labels),
      ...(servicePlanName === HANA_CONTAINER_OFFERING_PLAN_NAME && HANA_CONTAINER_LABELS),
    };
    await _requestCreateBinding(context, instance.id, instance.service_plan_id, newLabels, { parameters });
    if (doRefresh && binding) {
      await _requestDeleteBinding(context, binding.id);
    }
  });
  if (doRefresh) {
    logger.info("refreshed %i binding%s", instances.length, instances.length === 1 ? "" : "s");
  } else {
    logger.info("created %i binding%s", instances.length, instances.length === 1 ? "" : "s");
  }
};

async function _resolveFreshBindingsOptions(context, servicePlanName, tenantId, rawParameters) {
  const doFilterServicePlan = servicePlanName !== SERVICE_PLAN_ALL_IDENTIFIER;
  const filterServicePlanId = doFilterServicePlan && (await _resolveServicePlanId(context, servicePlanName));
  const doFilterTenantId = tenantId !== TENANT_ID_ALL_IDENTIFIER;
  const filterTenantId = doFilterTenantId && tenantId;
  assert(!doFilterTenantId || isValidTenantId(filterTenantId), `argument "${tenantId}" is not a valid tenant id`);
  const parameters = tryJsonParse(rawParameters);
  assert(!rawParameters || isObject(parameters), `argument "${rawParameters}" needs to be a valid JSON object`);
  return {
    ...(doFilterServicePlan && { filterServicePlanId }),
    ...(doFilterTenantId && { filterTenantId }),
    parameters,
  };
}

const serviceManagerRefreshBindings = async (context, [servicePlanName, tenantId], [rawParameters]) =>
  await _serviceManagerFreshBindings(context, {
    doRefresh: true,
    ...(await _resolveFreshBindingsOptions(context, servicePlanName, tenantId, rawParameters)),
  });

const serviceManagerFreshBindings = async (context, [servicePlanName, tenantId], [rawParameters]) =>
  await _serviceManagerFreshBindings(
    context,
    await _resolveFreshBindingsOptions(context, servicePlanName, tenantId, rawParameters)
  );

const _serviceManagerDelete = async (
  context,
  { doDeleteInstances = false, doDeleteBindings = false, filterServicePlanId, filterTenantId } = {}
) => {
  const [instances, bindings] = await Promise.all([
    _requestInstances(context, { filterTenantId, filterServicePlanId }),
    _requestBindings(context, { filterTenantId }),
  ]);

  if (doDeleteBindings) {
    const instanceById = indexByKey(instances, "id");
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
    method: "DELETE",
    pathname: `/v2/service_instances/${serviceInstanceId}`,
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
  serviceManagerFreshBindings,
  serviceManagerRefreshBindings,
  serviceManagerDeleteBindings,
  serviceManagerDeleteInstancesAndBindings,

  _: {
    _requestOfferings,
    _requestPlans,
  },
};

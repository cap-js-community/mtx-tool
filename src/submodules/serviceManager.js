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
} = require("../shared/static");
const { assert } = require("../shared/error");
const { request } = require("../shared/request");
const { Logger } = require("../shared/logger");
const { FunnelQueue, limiter } = require("../shared/funnel");

const ENV = Object.freeze({
  SVM_CONCURRENCY: "MTX_SVM_CONCURRENCY",
});

const SERVICE_MANAGER_REQUEST_CONCURRENCY_FALLBACK = 8;
const SERVICE_MANAGER_IDEAL_BINDING_COUNT = 1;
const SERVICE_PLAN_ALL_IDENTIFIER = "all-services";
const TENANT_ID_ALL_IDENTIFIER = "all-tenants";
const SENSITIVE_FIELD_MARKERS = ["password", "key"];
const SENSITIVE_FIELD_HIDDEN_TEXT = "*** show with --reveal ***";

const logger = Logger.getInstance();

const svmRequestConcurrency = parseIntWithFallback(
  process.env[ENV.SVM_CONCURRENCY],
  SERVICE_MANAGER_REQUEST_CONCURRENCY_FALLBACK
);

// TODO
const isValidTenantId = (input) => input && /^[0-9a-z-_/]+$/i.test(input);

const compareForTenantId = compareFor((a) => a.labels.tenant_id[0].toUpperCase());
const compareForUpdatedAtDesc = compareFor((a) => a.updated_at, true);

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

const _serviceManagerOfferings = async (context, { filterServiceOfferingName } = {}) =>
  await _serviceManagerRequest(context, {
    pathname: "/v1/service_offerings",
    ...(filterServiceOfferingName && {
      query: {
        fieldQuery: _getQuery({ name: filterServiceOfferingName }),
      },
    }),
  });

const _serviceManagerPlans = async (
  context,
  { filterServicePlanId, filterServiceOfferingId, filterServicePlanName } = {}
) => {
  const hasQuery = filterServicePlanId || filterServiceOfferingId || filterServicePlanName;
  return await _serviceManagerRequest(context, {
    pathname: "/v1/service_plans",
    ...(hasQuery && {
      query: {
        fieldQuery: _getQuery({
          ...(filterServicePlanId && { id: filterServicePlanId }),
          ...(filterServiceOfferingId && { service_offering_id: filterServiceOfferingId }),
          ...(filterServicePlanName && { name: filterServicePlanName }),
        }),
      },
    }),
  });
};

const _serviceManagerInstances = async (
  context,
  { filterTenantId, filterServicePlanId, doEnsureTenantLabel = true } = {}
) => {
  const hasQuery = filterServicePlanId || filterTenantId;
  let instances = await _serviceManagerRequest(context, {
    pathname: "/v1/service_instances",
    ...(hasQuery && {
      query: {
        ...(filterServicePlanId && { fieldQuery: _getQuery({ service_plan_id: filterServicePlanId }) }),
        ...(filterTenantId && { labelQuery: _getQuery({ tenant_id: filterTenantId }) }),
      },
    }),
  });
  if (doEnsureTenantLabel) {
    instances = instances.filter((instance) => instance.labels.tenant_id !== undefined);
  }
  return instances;
};

// TODO: the servicePlan filter here should probably not be used. The instance determines the service plan, not the binding
const _serviceManagerBindings = async (
  context,
  { filterTenantId, filterServicePlanId, doReveal = false, doAssertFoundSome = false, doEnsureTenantLabel = true } = {}
) => {
  const hasQuery = filterServicePlanId || filterTenantId;
  let bindings = await _serviceManagerRequest(context, {
    pathname: "/v1/service_bindings",
    ...(hasQuery && {
      query: {
        labelQuery: _getQuery({
          ...(filterServicePlanId && { service_plan_id: filterServicePlanId }),
          ...(filterTenantId && { tenant_id: filterTenantId }),
        }),
      },
    }),
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
    _serviceManagerOfferings(context),
    _serviceManagerPlans(context),
    _serviceManagerInstances(context, { filterTenantId }),
    _serviceManagerBindings(context, { filterTenantId }),
  ]);
  const servicePlanNameById = _indexServicePlanNameById(offerings, plans);
  instances.sort(compareForTenantId);
  const bindingsByInstance = _clusterByKey(bindings, "service_instance_id");

  const nowDate = new Date();
  const headerRow = ["tenant_id", "service_plan", "instance_id", "", "binding_id", "ready"];
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
    const instanceBindings = bindingsByInstance[instance.id];
    if (instanceBindings) {
      for (const [index, binding] of instanceBindings.entries()) {
        const row = [];
        if (index === 0) {
          row.push(
            instance.labels.tenant_id[0],
            servicePlanNameById[instance.service_plan_id],
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
=== ${instances.length} instance${instances.length === 1 ? "" : "s"} ===

${_formatOutput(instances)}

=== ${bindings.length} binding${bindings.length === 1 ? "" : "s"} ===

${_formatOutput(bindings)}
`;
};

const serviceManagerLongList = async (context, [filterTenantId], [doJsonOutput, doReveal]) =>
  await _serviceManagerLongList(context, { filterTenantId, doJsonOutput, doReveal });

const _serviceManagerCreateBinding = async (
  context,
  serviceInstanceId,
  servicePlanId,
  tenantId,
  { name = randomString(32), parameters } = {}
) => {
  await _serviceManagerRequest(context, {
    method: "POST",
    pathname: `/v1/service_bindings`,
    query: { async: false },
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      service_instance_id: serviceInstanceId,
      labels: {
        service_plan_id: [servicePlanId],
        tenant_id: [tenantId],
      },
      ...(parameters && { parameters }),
    }),
  });
};

const _serviceManagerDeleteBinding = async (context, serviceBindingId) =>
  await _serviceManagerRequest(context, {
    method: "DELETE",
    pathname: `/v1/service_bindings/${serviceBindingId}`,
    query: { async: false },
  });

const _serviceManagerRepairBindings = async (context, { filterServicePlanId, parameters } = {}) => {
  const [offerings, plans, instances, bindings] = await Promise.all([
    _serviceManagerOfferings(context),
    _serviceManagerPlans(context, { filterServicePlanId }),
    _serviceManagerInstances(context, { filterServicePlanId }),
    _serviceManagerBindings(context),
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
    const [instanceBindingsReady, instanceBindingsUnready] = partition(instanceBindings, (binding) => binding.ready);
    if (instanceBindingsReady.length < SERVICE_MANAGER_IDEAL_BINDING_COUNT) {
      const missingBindingCount = SERVICE_MANAGER_IDEAL_BINDING_COUNT - instanceBindings.length;
      for (let i = 0; i < missingBindingCount; i++) {
        changeQueue.enqueue(async () => {
          await _serviceManagerCreateBinding(
            context,
            instance.id,
            instance.service_plan_id,
            instance.labels.tenant_id[0],
            { parameters }
          );
          logger.info(
            "created %i missing binding%s for tenant %s plan %s",
            missingBindingCount,
            missingBindingCount === 1 ? "" : "s",
            tenantId,
            servicePlanName
          );
        });
      }
    } else if (instanceBindingsReady.length > SERVICE_MANAGER_IDEAL_BINDING_COUNT) {
      const ambivalentBindings = instanceBindingsReady.slice(1);
      for (const { id } of ambivalentBindings) {
        changeQueue.enqueue(async () => {
          await _serviceManagerDeleteBinding(context, id);
          logger.info(
            "deleted %i ambivalent ready binding%s for tenant %s plan %s",
            ambivalentBindings.length,
            ambivalentBindings.length === 1 ? "" : "s",
            tenantId,
            servicePlanName
          );
        });
      }
    }
    for (const { id } of instanceBindingsUnready) {
      changeQueue.enqueue(async () => {
        await _serviceManagerDeleteBinding(context, id);
        logger.info(
          "deleted %i unready binding%s for tenant %s plan %s",
          instanceBindingsUnready.length,
          instanceBindingsUnready.length === 1 ? "" : "s",
          tenantId,
          servicePlanName
        );
      });
    }
  }

  const changeCount = changeQueue.size();
  if (changeCount > 0) {
    logger.info("triggering %i change%s", changeCount, changeCount === 1 ? "" : "s");
    await changeQueue.dequeueAll();
  } else {
    logger.info(
      "found ideal binding count %i for %i instances, all is well",
      SERVICE_MANAGER_IDEAL_BINDING_COUNT,
      instances.length
    );
  }
};

const _resolveServicePlanId = async (context, servicePlanName) => {
  const match = /([a-z0-9-_]+):([a-z0-9-_]+)/.exec(servicePlanName);
  assert(
    match !== null,
    `could not detect form "offering:plan" or "${SERVICE_PLAN_ALL_IDENTIFIER}" in "${servicePlanName}"`
  );
  const [, offeringName, planName] = match;
  const [offering] = await _serviceManagerOfferings(context, { filterServiceOfferingName: offeringName });
  assert(offering?.id, `could not find service offering "${offeringName}"`);
  const [plan] = await _serviceManagerPlans(context, {
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

const _serviceManagerDelete = async (
  context,
  { filterServicePlanId, filterTenantId, doDeleteInstances = false, doDeleteBindings = false } = {}
) => {
  const [instances, bindings] = await Promise.all([
    _serviceManagerInstances(context, { filterTenantId, filterServicePlanId }),
    _serviceManagerBindings(context, { filterTenantId }),
  ]);
  const queue = new FunnelQueue(svmRequestConcurrency);

  if (doDeleteBindings) {
    const instanceById = _indexByKey(instances, "id");
    const filteredBindings = bindings.filter((binding) => instanceById[binding.service_instance_id]);
    for (const binding of filteredBindings) {
      queue.enqueue(async () => await _serviceManagerDeleteBinding(context, binding.id));
    }
    queue.enqueue(() => {
      logger.info("deleted %i binding%s", filteredBindings.length, filteredBindings.length === 1 ? "" : "s");
    });
  }
  if (doDeleteInstances) {
    for (const instance of instances) {
      queue.enqueue(async () => await _serviceManagerDeleteInstance(context, instance.id));
    }
    queue.enqueue(() => {
      logger.info("deleted %i instances%s", instances.length, instances.length === 1 ? "" : "s");
    });
  }
  return await queue.dequeueAll();
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

const _serviceManagerDeleteInstance = async (context, serviceInstanceId) =>
  await _serviceManagerRequest(context, {
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
  serviceManagerDeleteBindings,
  serviceManagerDeleteInstancesAndBindings,

  _: {
    _reset() {},
  },
};

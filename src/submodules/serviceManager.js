/**
 * This is a wrapper for APIs of the service-manager
 * - https://api.sap.com/api/APIServiceManager/resource/Service_Instances
 * - https://api.sap.com/api/APIServiceManager/resource/Service_Bindings
 *
 * API docs for v2
 * https://service-manager.cfapps.sap.hana.ondemand.com/v2/swagger/swaggerui/
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
  indexByKey,
  clusterByKey,
} = require("../shared/static");
const { makeOneTime } = require("../shared/execution-control");
const { assert } = require("../shared/error");
const { Logger } = require("../shared/logger");
const { limiter, FunnelQueue } = require("../shared/funnel");
const { ServiceManager, OPERATION_STATE } = require("../shared/service-manager");

const ENV = Object.freeze({
  SVM_CONCURRENCY: "MTX_SVM_CONCURRENCY",
});

const SERVICE_MANAGER_REQUEST_CONCURRENCY_FALLBACK = 6;
const SERVICE_MANAGER_IDEAL_BINDING_COUNT = 1;
const SERVICE_PLAN_ALL_IDENTIFIER = "all-services";
const TENANT_ID_ALL_IDENTIFIER = "all-tenants";

// NOTE: old versions of cap java relied on managing_client_lib label for hana containers
const HANA_CONTAINER_OFFERING_PLAN_NAME = "hana:hdi-shared";
const HANA_CONTAINER_LABELS = { managing_client_lib: ["instance-manager-client-lib"] };

const logger = Logger.getInstance();

const svmRequestConcurrency = parseIntWithFallback(
  process.env[ENV.SVM_CONCURRENCY],
  SERVICE_MANAGER_REQUEST_CONCURRENCY_FALLBACK
);

// NOTE: the tenant ids for service manager are not necessarily uuids, this is a much broader validator
const isValidTenantId = (input) => input && /^[0-9a-z-_/]+$/i.test(input);

const compareInstancesForTenantId = compareFor((a) => a.labels.tenant_id[0].toUpperCase());
const compareBindingsForUpdatedAtDesc = compareFor((a) => a.updated_at, true);

const _formatOutput = (output) =>
  JSON.stringify(Array.isArray(output) && output.length === 1 ? output[0] : output, null, 2);

const _getServiceManager = makeOneTime(async (context) => {
  const {
    cfBinding: { credentials },
  } = await context.getHdiInfo();
  return new ServiceManager({
    credentials,
    getToken: (credentials) => context.getCachedUaaTokenFromCredentials(credentials),
  });
});

const _indexPlanFullNameById = (offerings, plans) => {
  const offeringById = indexByKey(offerings, "id");
  return plans.reduce((acc, plan) => {
    acc[plan.id] = `${offeringById[plan.service_offering_id].name}:${plan.name}`;
    return acc;
  }, {});
};

const _serviceManagerList = async (context, { filterTenantId, doTimestamps, doJsonOutput }) => {
  const svm = await _getServiceManager(context);
  const [offerings, plans, instances, bindings] = await Promise.all([
    svm.getOfferings(),
    svm.getPlans(),
    svm.getInstances({ filterTenantId, doEnsureTenantLabel: true }),
    svm.getBindings({ filterTenantId }),
  ]);
  const planFullNameById = _indexPlanFullNameById(offerings, plans);
  instances.sort(compareInstancesForTenantId);
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
          planFullNameById[instance.service_plan_id],
          instance.id,
          instance.usable,
          ...(doTimestamps
            ? // NOTE: we currently use instance.last_operation.updated_at in preference to instance.updated_at,
              //   because the top-level fields appears not to be filled correctly.
              formatTimestampsWithRelativeDays([instance.created_at, instance.last_operation?.updated_at], nowDate)
            : []),
          connectorPiece(instanceBindings.length, index),
          binding.id,
          ...(doTimestamps ? formatTimestampsWithRelativeDays([binding.created_at, binding.updated_at], nowDate) : []),
        ]);
      }
    } else {
      table.push([
        instance.labels.tenant_id[0],
        planFullNameById[instance.service_plan_id],
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
  const svm = await _getServiceManager(context);
  const [instances, bindings] = await Promise.all([
    svm.getInstances({ filterTenantId }),
    svm.getBindings({ filterTenantId, doReveal }),
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

const _indexPlanFullNameByIdFromPlanInfo = (planInfo) => {
  return { [planInfo.planId]: `${planInfo.offeringName}:${planInfo.planName}` };
};

const _serviceManagerRepairBindings = async (context, { planInfo, parameters } = {}) => {
  const svm = await _getServiceManager(context);
  const filterPlanId = planInfo?.planId;
  const [offerings, plans, instances, bindings] = await Promise.all([
    planInfo ? undefined : svm.getOfferings(),
    planInfo ? undefined : svm.getPlans(),
    svm.getInstances({ filterPlanId, doEnsureUsable: true, doEnsureTenantLabel: true }),
    svm.getBindings(),
  ]);
  const planFullNameById = planInfo
    ? _indexPlanFullNameByIdFromPlanInfo(planInfo)
    : _indexPlanFullNameById(offerings, plans);

  instances.sort(compareInstancesForTenantId);
  bindings.sort(compareBindingsForUpdatedAtDesc);
  const bindingsByInstance = clusterByKey(bindings, "service_instance_id");
  const changeQueue = new FunnelQueue(svmRequestConcurrency);

  for (const instance of instances) {
    const tenantId = instance.labels.tenant_id[0];
    const planFullName = planFullNameById[instance.service_plan_id];
    const instanceBindings = bindingsByInstance[instance.id] ?? [];

    // NOTE: we want to cleanup unusable bindings here. we assume non-succeeded bindings are failed.
    // TODO: validate that this assumption makes sense in practice.
    const [succeededBindings, failedBindings] = partition(
      instanceBindings,
      (binding) => binding.last_operation?.state === OPERATION_STATE.SUCCEEDED
    );
    if (succeededBindings.length < SERVICE_MANAGER_IDEAL_BINDING_COUNT) {
      const missingBindingCount = SERVICE_MANAGER_IDEAL_BINDING_COUNT - succeededBindings.length;
      for (let i = 0; i < missingBindingCount; i++) {
        const newLabels = {
          ...instance.labels,
          ...(planFullName === HANA_CONTAINER_OFFERING_PLAN_NAME && HANA_CONTAINER_LABELS),
        };
        changeQueue.enqueue(
          async () => await svm.createBinding(instance.id, instance.service_plan_id, { labels: newLabels, parameters })
        );
      }
      changeQueue.milestone().then(() => {
        logger.info(
          "created %i missing binding%s for tenant %s plan %s",
          missingBindingCount,
          missingBindingCount === 1 ? "" : "s",
          tenantId,
          planFullName
        );
      });
    } else if (succeededBindings.length > SERVICE_MANAGER_IDEAL_BINDING_COUNT) {
      const ambivalentBindings = succeededBindings.slice(1);
      for (const ambivalentBinding of ambivalentBindings) {
        changeQueue.enqueue(async () => await svm.deleteBinding(ambivalentBinding.id));
      }
      changeQueue.milestone().then(() => {
        logger.info(
          "deleted %i ambivalent binding%s for tenant %s plan %s",
          ambivalentBindings.length,
          ambivalentBindings.length === 1 ? "" : "s",
          tenantId,
          planFullName
        );
      });
    }
    if (failedBindings.length > 0) {
      for (const failedBinding of failedBindings) {
        changeQueue.enqueue(async () => await svm.deleteBinding(failedBinding.id));
      }
      changeQueue.milestone().then(() => {
        logger.info(
          "deleted %i failed binding%s for tenant %s plan %s",
          failedBindings.length,
          failedBindings.length === 1 ? "" : "s",
          tenantId,
          planFullName
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

const _getPlanInfoFromFullName = async (context, planFullName) => {
  const match = /^(\S+):(\S+)$/i.exec(planFullName);
  assert(
    match !== null,
    `could not detect form "offering:plan" or "${SERVICE_PLAN_ALL_IDENTIFIER}" in "${planFullName}"`
  );
  const [, offeringName, planName] = match;
  const svm = await _getServiceManager(context);
  return await svm.getPlanInfo(offeringName, planName);
};

const serviceManagerRepairBindings = async (context, [planFullName], [rawParameters]) => {
  const doFilterPlanId = planFullName !== SERVICE_PLAN_ALL_IDENTIFIER;
  const planInfo = doFilterPlanId ? await _getPlanInfoFromFullName(context, planFullName) : undefined;
  const parameters = tryJsonParse(rawParameters);
  assert(!rawParameters || isObject(parameters), `argument "${rawParameters}" needs to be a valid JSON object`);
  return await _serviceManagerRepairBindings(context, {
    ...(planInfo && { planInfo }),
    parameters,
  });
};

const _serviceManagerFreshBindings = async (
  context,
  { planInfo, filterTenantId, parameters, doRefresh = false } = {}
) => {
  const svm = await _getServiceManager(context);
  const filterPlanId = planInfo?.planId;
  const [offerings, plans, instances, bindings] = await Promise.all([
    planInfo ? undefined : svm.getOfferings(),
    planInfo ? undefined : svm.getPlans(),
    svm.getInstances({
      filterTenantId,
      filterPlanId,
      doEnsureUsable: true,
      doEnsureTenantLabel: true,
    }),
    svm.getBindings({ filterTenantId }),
  ]);
  const planFullNameById = planInfo
    ? _indexPlanFullNameByIdFromPlanInfo(planInfo)
    : _indexPlanFullNameById(offerings, plans);

  bindings.sort(compareBindingsForUpdatedAtDesc);
  const bindingsByInstance = clusterByKey(bindings, "service_instance_id");

  await limiter(svmRequestConcurrency, instances, async (instance) => {
    const [binding] = bindingsByInstance[instance.id] ?? [];
    const planFullName = planFullNameById[instance.service_plan_id];
    const newLabels = {
      ...instance.labels,
      ...(binding && binding.labels),
      ...(planFullName === HANA_CONTAINER_OFFERING_PLAN_NAME && HANA_CONTAINER_LABELS),
    };
    await svm.createBinding(instance.id, instance.service_plan_id, { labels: newLabels, parameters });
    if (doRefresh && binding) {
      await svm.deleteBinding(binding.id);
    }
  });
  if (doRefresh) {
    logger.info("refreshed %i binding%s", instances.length, instances.length === 1 ? "" : "s");
  } else {
    logger.info("created %i binding%s", instances.length, instances.length === 1 ? "" : "s");
  }
};

async function _resolveFreshBindingsOptions(context, planFullName, tenantId, rawParameters) {
  const doFilterPlanId = planFullName !== SERVICE_PLAN_ALL_IDENTIFIER;
  const planInfo = doFilterPlanId ? await _getPlanInfoFromFullName(context, planFullName) : undefined;
  const doFilterTenantId = tenantId !== TENANT_ID_ALL_IDENTIFIER;
  const filterTenantId = doFilterTenantId && tenantId;
  assert(!doFilterTenantId || isValidTenantId(filterTenantId), `argument "${tenantId}" is not a valid tenant id`);
  const parameters = tryJsonParse(rawParameters);
  assert(!rawParameters || isObject(parameters), `argument "${rawParameters}" needs to be a valid JSON object`);
  return {
    ...(planInfo && { planInfo }),
    ...(doFilterTenantId && { filterTenantId }),
    parameters,
  };
}

const serviceManagerRefreshBindings = async (context, [planFullName, tenantId], [rawParameters]) =>
  await _serviceManagerFreshBindings(context, {
    doRefresh: true,
    ...(await _resolveFreshBindingsOptions(context, planFullName, tenantId, rawParameters)),
  });

const serviceManagerFreshBindings = async (context, [planFullName, tenantId], [rawParameters]) =>
  await _serviceManagerFreshBindings(
    context,
    await _resolveFreshBindingsOptions(context, planFullName, tenantId, rawParameters)
  );

const _serviceManagerDelete = async (
  context,
  { doDeleteInstances = false, doDeleteBindings = false, filterPlanId, filterTenantId } = {}
) => {
  const svm = await _getServiceManager(context);
  const [instances, bindings] = await Promise.all([
    svm.getInstances({ filterTenantId, filterPlanId }),
    svm.getBindings({ filterTenantId }),
  ]);

  if (doDeleteBindings) {
    const instanceById = indexByKey(instances, "id");
    const filteredBindings = bindings.filter((binding) => instanceById[binding.service_instance_id]);
    await limiter(svmRequestConcurrency, filteredBindings, async (binding) => await svm.deleteBinding(binding.id));
    logger.info("deleted %i binding%s", filteredBindings.length, filteredBindings.length === 1 ? "" : "s");
  }

  if (doDeleteInstances) {
    await limiter(svmRequestConcurrency, instances, async (instance) => await svm.deleteInstance(instance.id));
    logger.info("deleted %i instance%s", instances.length, instances.length === 1 ? "" : "s");
  }
};

const serviceManagerDeleteBindings = async (context, [planFullName, tenantId]) => {
  const doFilterPlanId = planFullName !== SERVICE_PLAN_ALL_IDENTIFIER;
  const filterPlanId = doFilterPlanId && (await _getPlanInfoFromFullName(context, planFullName)).planId;
  const doFilterTenantId = tenantId !== TENANT_ID_ALL_IDENTIFIER;
  const filterTenantId = doFilterTenantId && tenantId;
  assert(!doFilterTenantId || isValidTenantId(filterTenantId), `argument "${tenantId}" is not a valid tenant id`);
  return await _serviceManagerDelete(context, {
    doDeleteBindings: true,
    ...(doFilterPlanId && { filterPlanId }),
    ...(doFilterTenantId && { filterTenantId }),
  });
};

const serviceManagerDeleteInstancesAndBindings = async (context, [planFullName, tenantId]) => {
  const doFilterPlanId = planFullName !== SERVICE_PLAN_ALL_IDENTIFIER;
  const filterPlanId = doFilterPlanId && (await _getPlanInfoFromFullName(context, planFullName)).planId;
  const doFilterTenantId = tenantId !== TENANT_ID_ALL_IDENTIFIER;
  const filterTenantId = doFilterTenantId && tenantId;
  assert(!doFilterTenantId || isValidTenantId(filterTenantId), `argument "${tenantId}" is not a valid tenant id`);
  return await _serviceManagerDelete(context, {
    doDeleteInstances: true,
    doDeleteBindings: true,
    ...(doFilterPlanId && { filterPlanId }),
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
    _getServiceManager,
  },
};

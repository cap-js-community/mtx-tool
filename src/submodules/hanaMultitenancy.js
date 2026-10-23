"use strict";

const {
  tableList,
  formatTimestampsWithRelativeDays,
  parseIntWithFallback,
  collectValuesForKey,
} = require("../shared/static");
const { makeOneTime } = require("../shared/execution-control");
const { assert, fail } = require("../shared/error");
const { limiter } = require("../shared/funnel");
const { ServiceManager, HANA_CONTAINER_OFFERING_PLAN_NAME } = require("../shared/service-manager");
const { HanaMultitenancy } = require("../shared/hana-multitenancy");

// NOTE: scaffold for the hana-multitenancy (Tenant Management Service, TMS v2) backed commands. These mirror the
//   service-manager commands (src/submodules/serviceManager.js) but drop the service_plan argument, since TMS
//   addresses containers under a tenant directly. Implementations land in a follow-up step; for now each command
//   fails explicitly so the wiring (config, context, cli) can be reviewed in isolation.

const ENV = Object.freeze({
  TMS_CONCURRENCY: "MTX_TMS_CONCURRENCY",
});

const TMS_CONCURRENCY_FALLBACK = 6;

const NOT_IMPLEMENTED = "tenant-management-service command is not implemented yet";

const tmsConcurrency = parseIntWithFallback(process.env[ENV.TMS_CONCURRENCY], TMS_CONCURRENCY_FALLBACK);

const _getServiceManager = makeOneTime(async (context) => {
  const {
    cfBinding: { credentials },
  } = await context.getHdiInfo();
  return new ServiceManager({
    credentials,
    getToken: (credentials) => context.getCachedUaaTokenFromCredentials(credentials),
  });
});

const _getHanaMultitenancy = makeOneTime(async (context) => {
  const {
    cfBinding: { credentials },
  } = await context.getTmsInfo();
  return new HanaMultitenancy({
    credentials,
    getToken: (credentials) => context.getCachedUaaTokenFromCredentials(credentials),
  });
});

const _getHanaMultitenancyAdmin = makeOneTime(async (context) => {
  const credentials = {
    // TODO
  };
  return new HanaMultitenancy({
    credentials,
    getToken: (credentials) => context.getCachedUaaTokenFromCredentials(credentials),
  });
});

const tmsMigrateFromSvm = async (context, [tenantId]) => {
  const svm = await _getServiceManager(context);
  const tmsAdmin = await _getHanaMultitenancyAdmin(context);
  const { planId } = await svm.getPlanInfoFromFullName(HANA_CONTAINER_OFFERING_PLAN_NAME);
  const [instance] = await svm.getInstances({ filterPlanId: planId, filterTenantId: tenantId });
  assert(instance, "could not find svm instance for tenantId");
  await svm.updateInstance(instance.id, { parameters: { action: "migrateToMTv2" } });
  const [container] = await tmsAdmin.getContainers(instance.id);
  assert(container, "could not migrate to tms container for tenantId");
  const labels = HanaMultitenancy.fromSvmLabels(instance.labels);
  const {
    cfBinding: { instanceId: tmsInstanceId },
  } = await context.getTmsInfo();
  await tmsAdmin.updateContainer(instance.id, container.id, { labels, tmsInstanceId });
};

const _labelValue = (labels, key) => {
  const prefix = `${key}=`;
  const entry = labels?.find((label) => label.startsWith(prefix));
  return entry?.slice(prefix.length);
};

const _getEnrichedTenants = async (context, { filterTenantId } = {}) => {
  const tms = await _getHanaMultitenancy(context);
  if (filterTenantId) {
    return await tms.getTenants({
      filterContainerTenantId: filterTenantId,
      doExpandContainers: true,
      doExpandCredentials: true,
    });
  }
  const tenantStubs = await tms.getTenants();
  const hanaIds = collectValuesForKey(tenantStubs, "serviceInstanceID");
  const perHanaTenants = await limiter(
    tmsConcurrency,
    hanaIds,
    async (hanaId) =>
      await tms.getTenants({
        filterServiceInstanceId: hanaId,
        doExpandContainers: true,
        doExpandCredentials: true,
      })
  );
  return perHanaTenants.flat().filter((tenant) => tenant.containers?.length);
};

const _tmsList = async (context, { filterTenantId, doTimestamps, doJsonOutput } = {}) => {
  const tenants = await _getEnrichedTenants(context, { filterTenantId });

  if (doJsonOutput) {
    return { tenants };
  }

  const headerRow = [
    "tenant_id",
    "db_tenant_id",
    "hana_id",
    "schema",
    "ready",
    ...(doTimestamps ? ["created_on", "updated_on"] : []),
  ];

  const nowDate = new Date();
  const table = [headerRow];
  for (const tenant of tenants) {
    for (const container of tenant.containers) {
      const tenantId = _labelValue(container.labels, "tenant_id");
      // TODO how to handle multiple credentials???
      const credential = container.credentials[0];
      table.push([
        tenantId,
        tenant.id,
        tenant.serviceInstanceID,
        credential.schema,
        container.status?.ready,
        ...(doTimestamps
          ? formatTimestampsWithRelativeDays(
              [container.createTimestamp, container.status.lastTransitionTimestamp ?? container.createTimestamp],
              nowDate
            )
          : []),
      ]);
    }
  }
  return tableList(table, { sortCol: null, withRowNumber: !filterTenantId });
};

const tmsList = async (context, [tenantId], [doTimestamps, doJsonOutput]) =>
  await _tmsList(context, { filterTenantId: tenantId, doTimestamps, doJsonOutput });

// eslint-disable-next-line no-unused-vars
const tmsLongList = async (context, [tenantId], [doJsonOutput, doReveal]) => fail(NOT_IMPLEMENTED);

// eslint-disable-next-line no-unused-vars
const tmsMakeBindingsSingle = async (context, [tenantId], [rawParameters]) => fail(NOT_IMPLEMENTED);

// eslint-disable-next-line no-unused-vars
const tmsMakeBindingsDouble = async (context, [tenantId], [rawParameters]) => fail(NOT_IMPLEMENTED);

// eslint-disable-next-line no-unused-vars
const tmsDeleteBindings = async (context, [tenantId]) => fail(NOT_IMPLEMENTED);

// eslint-disable-next-line no-unused-vars
const tmsDeleteInstancesAndBindings = async (context, [tenantId]) => fail(NOT_IMPLEMENTED);

// eslint-disable-next-line no-unused-vars
const tmsRestart = async (context) => fail(NOT_IMPLEMENTED);

// eslint-disable-next-line no-unused-vars
const tmsRestartSkip = async (context, [skipApps]) => fail(NOT_IMPLEMENTED);

module.exports = {
  tmsList,
  tmsLongList,
  tmsMigrateFromSvm,
  tmsMakeBindingsSingle,
  tmsMakeBindingsDouble,
  tmsDeleteBindings,
  tmsDeleteInstancesAndBindings,
  tmsRestart,
  tmsRestartSkip,
};

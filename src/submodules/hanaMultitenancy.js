"use strict";

const { makeOneTime } = require("../shared/execution-control");
const { assert } = require("../shared/error");
const { ServiceManager, HANA_CONTAINER_OFFERING_PLAN_NAME } = require("../shared/service-manager");
const { HanaMultitenancy } = require("../shared/hana-multitenancy");

const { fail } = require("../shared/error");

// NOTE: scaffold for the hana-multitenancy (Tenant Management Service, TMS v2) backed commands. These mirror the
//   service-manager commands (src/submodules/serviceManager.js) but drop the service_plan argument, since TMS
//   addresses containers under a tenant directly. Implementations land in a follow-up step; for now each command
//   fails explicitly so the wiring (config, context, cli) can be reviewed in isolation.

const NOT_IMPLEMENTED = "tenant-management-service command is not implemented yet";

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
  // TODO: tbd if this works with non-admin service binding
  const svm = await _getServiceManager(context);
  const tmsAdmin = await _getHanaMultitenancyAdmin(context);
  const { planId } = await svm.getPlanInfoFromFullName(HANA_CONTAINER_OFFERING_PLAN_NAME);
  const [instance] = await svm.getInstances({ filterPlanId: planId, filterTenantId: tenantId });
  assert(instance, "could not find svm instance for tenantId");
  // await svm.updateInstance(instance.id, { parameters: { action: "migrateToMTv2" } });
  const [container] = await tmsAdmin.getContainers(instance.id);
  assert(container, "could not migrate to tms container for tenantId");
  const labels = HanaMultitenancy.fromSvmLabels(instance.labels);
  const {
    cfBinding: { instanceId: tmsInstanceId },
  } = await context.getTmsInfo();
  await tmsAdmin.updateContainer(instance.id, container.id, { labels, tmsInstanceId });
};

// eslint-disable-next-line no-unused-vars
const tmsList = async (context, [tenantId], [doTimestamps, doJsonOutput]) => {
  const tms = await _getHanaMultitenancy(context);
  const tenants = await tms.getTenants({ doExpandContainers: true });
  const tenantsWithContainers = tenants.filter((t) => t.containers);
  debugger;
};

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

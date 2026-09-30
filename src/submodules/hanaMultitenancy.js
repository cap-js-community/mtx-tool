"use strict";

const { fail } = require("../shared/error");

// NOTE: scaffold for the hana-multitenancy (Tenant Management Service, TMS v2) backed commands. These mirror the
//   service-manager commands (src/submodules/serviceManager.js) but drop the service_plan argument, since TMS
//   addresses containers under a tenant directly. Implementations land in a follow-up step; for now each command
//   fails explicitly so the wiring (config, context, cli) can be reviewed in isolation.

const NOT_IMPLEMENTED = "tenant-management-service command is not implemented yet";

// eslint-disable-next-line no-unused-vars
const tmsList = async (context, [tenantId], [doTimestamps, doJsonOutput]) => fail(NOT_IMPLEMENTED);

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
  tmsMakeBindingsSingle,
  tmsMakeBindingsDouble,
  tmsDeleteBindings,
  tmsDeleteInstancesAndBindings,
  tmsRestart,
  tmsRestartSkip,
};

"use strict";

const { parseIntWithFallback } = require("../shared/static");
const { assert } = require("../shared/error");
const { request } = require("../shared/request");
const { Logger } = require("../shared/logger");
const { limiter, FunnelQueue } = require("../shared/funnel");

const ENV = Object.freeze({
  SVC_CONCURRENCY: "MTX_SVC_CONCURRENCY",
});

const HIDDEN_PASSWORD_TEXT = "*** show with --reveal ***";
const SERVICE_MANAGER_REQUEST_CONCURRENCY_FALLBACK = 10;
const SERVICE_MANAGER_IDEAL_BINDING_COUNT = 1;
const SENSITIVE_CREDENTIAL_FIELDS = ["password", "hdi_password"];

const logger = Logger.getInstance();

const svcRequestConcurrency = parseIntWithFallback(
  process.env[ENV.SVC_CONCURRENCY],
  SERVICE_MANAGER_REQUEST_CONCURRENCY_FALLBACK
);

module.exports = {
  serviceList,
  serviceLongList,

  _: {
    _reset() {
      resetOneTime(_getHdiSharedPlanId);
    },
  },
};

"use strict";

module.exports = {
  ...require("./cli"),
  ...require("./context"),
  ...require("./shared/cache"),
  ...require("./shared/error"),
  ...require("./shared/fetch"),
  ...require("./shared/oauth"),
  ...require("./shared/request"),
  ...require("./shared/static"),
  ...require("./submodules/userAuthentication"),
  ...require("./submodules/tenantRegistry"),
  ...require("./submodules/capMultitenancy"),
  ...require("./submodules/hanaManagement"),
  ...require("./submodules/serverDiagnostic"),
};

/**
 * TODO
 *
 * consistency:
 * --cds-upgrade-* should take an optional parameter like params instead or on top of auto-undeploy for arbitrary params
 *
 */

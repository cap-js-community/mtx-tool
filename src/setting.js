const { ENV } = require("./shared/static");

const SETTING_TYPE = {
  UAA: "uaaAppName",
  REG: "regAppName",
  CDS: "cdsAppName",
  HDI: "hdiAppName",
  SRV: "srvAppName",
};

const SETTING = {
  [SETTING_TYPE.UAA]: {
    name: "uaa app",
    envVariable: ENV.UAA_APP,
    question: "cf app bound to xsuaa service (optional)?",
    failMessage: "option requires configured app bound to service label:xsuaa plan:application",
    requireServices: [
      {
        label: "xsuaa",
        plan: "application",
      },
      {
        label: "xsuaa",
        plan: "broker",
      },
    ],
  },
  [SETTING_TYPE.REG]: {
    name: "registry app",
    envVariable: ENV.REGISTRY_APP,
    question: "cf app bound to saas-registry service (optional)?",
    failMessage: "option requires configured app bound to service label:saas-registry plan:application",
    requireServices: [
      {
        label: "saas-registry",
        plan: "application",
      },
    ],
  },
  [SETTING_TYPE.CDS]: {
    name: "cds-mtx app",
    envVariable: ENV.CDS_APP,
    question: "cf app running @sap/cds-mtx or @sap/cds-mtxs library (optional)?",
    failMessage: "option requires configured app running @sap/cds-mtx",
    requireRoute: true,
  },
  [SETTING_TYPE.HDI]: {
    name: "hdi app",
    envVariable: ENV.HDI_APP,
    question: "cf app bound to service-manager or managed-hana service (optional)?",
    failMessage:
      "option requires configured app bound to service label:managed-hana plan:hdi-shared OR label:service-manager plan:container",
    requireServices: [
      {
        label: "service-manager",
        plan: "container",
      },
      {
        label: "managed-hana",
        plan: "hdi-shared",
      },
    ],
  },
  [SETTING_TYPE.SRV]: {
    name: "server app",
    envVariable: ENV.SERVER_APP,
    question: 'cf app with "/info" endpoint (optional)?',
    failMessage: 'option requires configured app with "/info" endpoint',
    requireRoute: true,
  },
};

module.exports = {
  SETTING_TYPE,
  SETTING,
};

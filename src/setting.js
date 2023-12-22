"use strict";

const { ENV } = require("./shared/static");

const SETTING_TYPE = {
  UAA_APP: "UAA_APP",
  UAA_KEY: "UAA_KEY",
  REGISTRY_APP: "REGISTRY_APP",
  REGISTRY_KEY: "REGISTRY_KEY",
  CDS_APP: "CDS_APP",
  HDI_APP: "HDI_APP",
  HDI_KEY: "HDI_KEY",
  SERVER_APP: "SERVER_APP",
};

const SETTING = {
  [SETTING_TYPE.UAA_APP]: {
    config: "uaaAppName",
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
  [SETTING_TYPE.REGISTRY_APP]: {
    config: "regAppName",
    name: "saas-registry app",
    envVariable: ENV.REGISTRY_APP,
    question: "cf app bound to saas-registry service (optional)?",
    failMessage: "option requires configured app bound to service label:saas-registry plan:application",
    requireServices: [
      {
        label: "saas-registry",
        plan: "application",
      },
      {
        label: "saas-registry",
        plan: "service",
      },
    ],
  },
  [SETTING_TYPE.CDS]: {
  [SETTING_TYPE.CDS_APP]: {
    config: "cdsAppName",
    name: "cds-mtx app",
    envVariable: ENV.CDS_APP,
    question: "cf app running @sap/cds-mtx or @sap/cds-mtxs library (optional)?",
    failMessage: "option requires configured app running @sap/cds-mtx",
    requireRoute: true,
  },
  [SETTING_TYPE.HDI_APP]: {
    config: "hdiAppName",
    name: "service-manager app",
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
  [SETTING_TYPE.SERVER_APP]: {
    config: "srvAppName",
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

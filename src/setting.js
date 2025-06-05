"use strict";

const ENV = Object.freeze({
  UAA_APP: "MTX_UAA_APP",
  UAA_KEY: "MTX_UAA_KEY",
  REGISTRY_APP: "MTX_REG_APP",
  REGISTRY_KEY: "MTX_REG_KEY",
  CDS_APP: "MTX_CDS_APP",
  HDI_APP: "MTX_HDI_APP",
  HDI_KEY: "MTX_HDI_KEY",
  SVM_APP: "MTX_SVM_APP",
  SVM_KEY: "MTX_SVM_KEY",
  SERVER_APP: "MTX_SRV_APP",
});

const SETTING_TYPE = {
  UAA_APP: "UAA_APP",
  UAA_KEY: "UAA_KEY",
  REGISTRY_APP: "REGISTRY_APP",
  REGISTRY_KEY: "REGISTRY_KEY",
  CDS_APP: "CDS_APP",
  HDI_APP: "HDI_APP",
  HDI_KEY: "HDI_KEY",
  SVM_APP: "SVM_APP",
  SVM_KEY: "SVM_KEY",
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

  [SETTING_TYPE.REGISTRY_APP]: {
    config: "regAppName",
    name: "saas-registry app",
    envVariable: ENV.REGISTRY_APP,
    question: "cf app bound to saas-registry service (optional)?",
    failMessage: "option requires configured app bound to service label:saas-registry plan:application or plan:service",
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
    question: "cf app bound to service-manager (optional)?",
    failMessage: "option requires configured app bound to service label:service-manager",
    requireServices: [
      {
        label: "service-manager",
      },
    ],
  },

  [SETTING_TYPE.SERVER_APP]: {
    config: "srvAppName",
    name: "server app",
    envVariable: ENV.SERVER_APP,
    question: "cf app with server (optional)?",
    failMessage: "option requires configured server app",
    requireRoute: true,
  },
};

module.exports = {
  ENV,
  SETTING_TYPE,
  SETTING,
};

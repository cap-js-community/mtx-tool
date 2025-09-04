"use strict";

const ENV = Object.freeze({
  UAA_APP: "MTX_UAA_APP",
  UAA_KEY: "MTX_UAA_KEY",
  REGISTRY_APP: "MTX_REG_APP",
  REGISTRY_KEY: "MTX_REG_KEY",
  SMS_APP: "MTX_SMS_APP",
  SMS_KEY: "MTX_SMS_KEY",
  CDS_APP: "MTX_CDS_APP",
  HDI_APP: "MTX_HDI_APP",
  HDI_KEY: "MTX_HDI_KEY",
  SVM_APP: "MTX_SVM_APP",
  SVM_KEY: "MTX_SVM_KEY",
  SERVER_APP: "MTX_SRV_APP",
});

const CONFIG_TYPE = {
  UAA_APP: "UAA_APP",
  UAA_KEY: "UAA_KEY",
  REGISTRY_APP: "REGISTRY_APP",
  REGISTRY_KEY: "REGISTRY_KEY",
  SMS_APP: "SMS_APP",
  SMS_KEY: "SMS_KEY",
  CDS_APP: "CDS_APP",
  HDI_APP: "HDI_APP",
  HDI_KEY: "HDI_KEY",
  SVM_APP: "SVM_APP",
  SVM_KEY: "SVM_KEY",
  SERVER_APP: "SERVER_APP",
};

const CONFIG_INFOS = {
  [CONFIG_TYPE.UAA_APP]: {
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

  [CONFIG_TYPE.REGISTRY_APP]: {
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

  [CONFIG_TYPE.SMS_APP]: {
    config: "smsAppName",
    name: "subscription manager app",
    envVariable: ENV.SMS_APP,
    question: "cf app bound to subscription manager service (optional)?",
    failMessage: "option requires configured app bound to service label:subscription-manager plan:provider",
    requireServices: [
      {
        label: "subscription-manager",
        plan: "provider",
      },
    ],
  },

  [CONFIG_TYPE.CDS_APP]: {
    config: "cdsAppName",
    name: "cds-mtx app",
    envVariable: ENV.CDS_APP,
    question: "cf app running @sap/cds-mtx or @sap/cds-mtxs library (optional)?",
    failMessage: "option requires configured app running @sap/cds-mtx",
    requireRoute: true,
  },

  [CONFIG_TYPE.HDI_APP]: {
    config: "hdiAppName",
    name: "service-manager app",
    envVariable: ENV.HDI_APP,
    question: "cf app bound to service-manager (optional)?",
    failMessage: "option requires configured app bound to service label:service-manager",
    requireServices: [
      {
        label: "service-manager",
        plan: "container",
      },
    ],
  },

  [CONFIG_TYPE.SERVER_APP]: {
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
  CONFIG_TYPE,
  CONFIG_INFOS,
};

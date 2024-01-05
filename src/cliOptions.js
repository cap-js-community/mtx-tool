"use strict";

const set = require("./context");
const uaa = require("./submodules/userAuthentication");
const reg = require("./submodules/tenantRegistry");
const cds = require("./submodules/capMultitenancy");
const hdi = require("./submodules/hanaManagement");
const srv = require("./submodules/serverDiagnostic");

const PASS_ARG = Object.freeze({
  TOKEN: "TOKEN",
  TENANT: "TENANT", // either subdomain or tenant_id
  SUBDOMAIN: "SUBDOMAIN",
  PASSCODE: "PASSCODE",
  SERVICE: "SERVICE",
  JOB_ID: "JOB_ID",
  TENANT_ID: "TENANT_ID",
  SKIP_APPS: "SKIP_APPS",
  APP_NAME: "APP_NAME",
  APP_INSTANCE: "APP_INSTANCE",
  PARAMS: "PARAMS",
});

const FLAG_ARG = Object.freeze({
  DECODE: "--decode",
  REVEAL: "--reveal",
  TIMESTAMPS: "--time",
  AUTO_UNDEPLOY: "--auto-undeploy",
  SKIP_UNCHANGED: "--skip-unchanged",
});

module.exports = {
  SETUP_LIST: {
    commandVariants: ["setl", "--setup-list"],
    callback: set.setupList,
    passContext: false,
    readonly: true,
  },
  SETUP: { commandVariants: ["set", "--setup"], callback: set.setup, passContext: false },
  SETUP_LOCAL: { commandVariants: ["setcwd", "--setup-local"], callback: set.setupLocal, passContext: false },
  SETUP_CLEAN_CACHE: { commandVariants: ["setcc", "--clean-cache"], callback: set.setupCleanCache, passContext: false },

  UAA_DECODE: {
    commandVariants: ["uaad", "--uaa-decode"],
    requiredPassArgs: [PASS_ARG.TOKEN],
    callback: uaa.uaaDecode,
    passContext: false,
    readonly: true,
  },
  UAA_CLIENT: {
    commandVariants: ["uaac", "--uaa-client"],
    optionalPassArgs: [PASS_ARG.TENANT],
    optionalFlagArgs: [FLAG_ARG.DECODE],
    callback: uaa.uaaClient,
    readonly: true,
  },
  UAA_PASSCODE: {
    commandVariants: ["uaap", "--uaa-passcode"],
    requiredPassArgs: [PASS_ARG.PASSCODE],
    optionalPassArgs: [PASS_ARG.TENANT],
    optionalFlagArgs: [FLAG_ARG.DECODE],
    callback: uaa.uaaPasscode,
    readonly: true,
  },
  UAA_USERINFO: {
    commandVariants: ["uaai", "--uaa-userinfo"],
    requiredPassArgs: [PASS_ARG.PASSCODE],
    optionalPassArgs: [PASS_ARG.TENANT],
    callback: uaa.uaaUserInfo,
    readonly: true,
  },
  UAA_SERVICE: {
    commandVariants: ["uaas", "--uaa-service"],
    requiredPassArgs: [PASS_ARG.SERVICE],
    optionalPassArgs: [PASS_ARG.TENANT],
    optionalFlagArgs: [FLAG_ARG.DECODE],
    callback: uaa.uaaService,
    readonly: true,
  },

  REGISTRY_LIST: {
    commandVariants: ["regl", "--registry-list"],
    optionalPassArgs: [PASS_ARG.TENANT],
    optionalFlagArgs: [FLAG_ARG.TIMESTAMPS],
    callback: reg.registryListSubscriptions,
    readonly: true,
  },
  REGISTRY_LONG_LIST: {
    commandVariants: ["regll", "--registry-long-list"],
    optionalPassArgs: [PASS_ARG.TENANT],
    callback: reg.registryLongListSubscriptions,
    readonly: true,
  },
  REGISTRY_SERVICE_CONFIG: {
    commandVariants: ["regs", "--registry-service-config"],
    callback: reg.registryServiceConfig,
    readonly: true,
  },
  REGISTRY_JOB: {
    commandVariants: ["regj", "--registry-job"],
    requiredPassArgs: [PASS_ARG.JOB_ID],
    callback: reg.registryJob,
    readonly: true,
  },
  REGISTRY_UPDATE_DEPENDENCIES: {
    commandVariants: ["--registry-update"],
    requiredPassArgs: [PASS_ARG.TENANT_ID],
    optionalFlagArgs: [FLAG_ARG.SKIP_UNCHANGED],
    callback: reg.registryUpdateDependencies,
  },
  REGISTRY_UPDATE_ALL_DEPENDENCIES: {
    commandVariants: ["--registry-update-all"],
    optionalFlagArgs: [FLAG_ARG.SKIP_UNCHANGED],
    callback: reg.registryUpdateAllDependencies,
  },
  REGISTRY_UPDATE_APPURL: {
    commandVariants: ["--registry-update-url"],
    optionalPassArgs: [PASS_ARG.TENANT_ID],
    callback: reg.registryUpdateApplicationURL,
  },
  REGISTRY_OFFBOARD_SUBSCRIPTION: {
    commandVariants: ["--registry-offboard"],
    requiredPassArgs: [PASS_ARG.TENANT_ID],
    callback: reg.registryOffboardSubscription,
    danger: true,
  },
  REGISTRY_OFFBOARD_SUBSCRIPTION_SKIP: {
    commandVariants: ["--registry-offboard-skip"],
    requiredPassArgs: [PASS_ARG.TENANT_ID, PASS_ARG.SKIP_APPS],
    callback: reg.registryOffboardSubscriptionSkip,
    danger: true,
  },

  CDS_LIST: {
    commandVariants: ["cdsl", "--cds-list"],
    optionalPassArgs: [PASS_ARG.TENANT],
    optionalFlagArgs: [FLAG_ARG.TIMESTAMPS],
    callback: cds.cdsList,
    readonly: true,
  },
  CDS_LONG_LIST: {
    commandVariants: ["cdsll", "--cds-long-list"],
    optionalPassArgs: [PASS_ARG.TENANT],

    callback: cds.cdsLongList,
    readonly: true,
  },
  CDS_ONBOARD_TENANT: {
    commandVariants: ["cdsot", "--cds-onboard-tenant"],
    requiredPassArgs: [PASS_ARG.TENANT_ID, PASS_ARG.SUBDOMAIN],
    callback: cds.cdsOnboardTenant,
  },
  CDS_UPGRADE_TENANT: {
    commandVariants: ["cdsut", "--cds-upgrade-tenant"],
    requiredPassArgs: [PASS_ARG.TENANT_ID],
    optionalFlagArgs: [FLAG_ARG.AUTO_UNDEPLOY],
    callback: cds.cdsUpgradeTenant,
  },
  CDS_UPGRADE_ALL: {
    commandVariants: ["cdsua", "--cds-upgrade-all"],
    optionalFlagArgs: [FLAG_ARG.AUTO_UNDEPLOY],
    callback: cds.cdsUpgradeAll,
    useCache: false,
  },
  CDS_OFFBOARD_TENANT: {
    commandVariants: ["--cds-offboard-tenant"],
    requiredPassArgs: [PASS_ARG.TENANT_ID],
    callback: cds.cdsOffboardTenant,
    danger: true,
  },
  CDS_OFFBOARD_ALL: { commandVariants: ["--cds-offboard-all"], callback: cds.cdsOffboardAll, danger: true },

  HDI_LIST: {
    commandVariants: ["hdil", "--hdi-list"],
    optionalPassArgs: [PASS_ARG.TENANT_ID],
    optionalFlagArgs: [FLAG_ARG.TIMESTAMPS],
    callback: hdi.hdiList,
    useCache: false,
    readonly: true,
  },
  HDI_LONG_LIST: {
    commandVariants: ["hdill", "--hdi-long-list"],
    optionalPassArgs: [PASS_ARG.TENANT_ID],
    optionalFlagArgs: [FLAG_ARG.REVEAL],
    callback: hdi.hdiLongList,
    useCache: false,
    readonly: true,
  },
  HDI_LIST_RELATIONS: {
    commandVariants: ["hdilr", "--hdi-list-relations"],
    optionalPassArgs: [PASS_ARG.TENANT_ID],
    optionalFlagArgs: [FLAG_ARG.TIMESTAMPS],
    callback: hdi.hdiListRelations,
    useCache: false,
    readonly: true,
  },
  HDI_TUNNEL_TENANT: {
    commandVariants: ["hditt", "--hdi-tunnel-tenant"],
    requiredPassArgs: [PASS_ARG.TENANT_ID],
    optionalFlagArgs: [FLAG_ARG.REVEAL],
    callback: hdi.hdiTunnelTenant,
    useCache: false,
    readonly: true,
  },
  HDI_REBIND_TENANT: {
    commandVariants: ["hdirt", "--hdi-rebind-tenant"],
    requiredPassArgs: [PASS_ARG.TENANT_ID],
    optionalPassArgs: [PASS_ARG.PARAMS],
    callback: hdi.hdiRebindTenant,
    useCache: false,
  },
  HDI_REBIND_ALL: {
    commandVariants: ["hdira", "--hdi-rebind-all"],
    optionalPassArgs: [PASS_ARG.PARAMS],
    callback: hdi.hdiRebindAll,
    useCache: false,
  },
  HDI_REPAIR_BINDINGS: {
    commandVariants: ["--hdi-repair-bindings"],
    optionalPassArgs: [PASS_ARG.PARAMS],
    callback: hdi.hdiRepairBindings,
    useCache: false,
  },
  HDI_MIGRATE_ALL: {
    commandVariants: ["--hdi-migrate-all"],
    callback: hdi.hdiMigrateAll,
    useCache: false,
  },
  HDI_DELETE_TENANT: {
    commandVariants: ["--hdi-delete-tenant"],
    requiredPassArgs: [PASS_ARG.TENANT_ID],
    callback: hdi.hdiDeleteTenant,
    useCache: false,
    danger: true,
  },
  HDI_DELETE_ALL: { commandVariants: ["--hdi-delete-all"], callback: hdi.hdiDeleteAll, useCache: false, danger: true },

  SRV_INFO: { commandVariants: ["srv", "--server-info"], callback: srv.serverInfo, readonly: true },
  SRV_DEBUG: {
    commandVariants: ["srvd", "--server-debug"],
    optionalPassArgs: [PASS_ARG.APP_NAME, PASS_ARG.APP_INSTANCE],
    callback: srv.serverDebug,
    readonly: true,
  },
  SRV_ENVIRONMENT: {
    commandVariants: ["srvenv", "--server-env"],
    optionalPassArgs: [PASS_ARG.APP_NAME],
    callback: srv.serverEnvironment,
    useCache: false,
    readonly: true,
  },
  SRV_CERTIFICATES: {
    commandVariants: ["srvcrt", "--server-certificates"],
    optionalPassArgs: [PASS_ARG.APP_NAME],
    callback: srv.serverCertificates,
    useCache: false,
    readonly: true,
  },
  SRV_START_DEBUGGER: {
    commandVariants: ["--server-start-debugger"],
    optionalPassArgs: [PASS_ARG.APP_NAME, PASS_ARG.APP_INSTANCE],
    callback: srv.serverStartDebugger,
    danger: true,
  },
};

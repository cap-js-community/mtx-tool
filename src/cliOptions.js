"use strict";

const pathlib = require("path");
const { version: VERSION } = require("../package.json");

const set = require("./context");
const uaa = require("./submodules/userAuthentication");
const reg = require("./submodules/tenantRegistry");
const cds = require("./submodules/capMultitenancy");
const hdi = require("./submodules/hanaManagement");
const srv = require("./submodules/serverDiagnostic");

const { name: NAME } = pathlib.parse(process.argv[1]);

const PASS_ARG = Object.freeze({
  TOKEN: "TOKEN",
  TENANT: "TENANT", // either subdomain or tenant_id
  SUBDOMAIN: "SUBDOMAIN",
  PASSCODE: "PASSCODE",
  USERNAME: "USERNAME",
  PASSWORD: "PASSWORD",
  SERVICE: "SERVICE",
  JOB_ID: "JOB_ID",
  TENANT_ID: "TENANT_ID",
  SKIP_APPS: "SKIP_APPS",
  APP_NAME: "APP_NAME",
  APP_INSTANCE: "APP_INSTANCE",
  PARAMS: "PARAMS",
  METADATA: "METADATA",
});
const PASS_ARG_META = Object.freeze({
  [PASS_ARG.TOKEN]: { sensitive: true },
  [PASS_ARG.PASSCODE]: { sensitive: true, envVariable: "UAA_PASSCODE" },
  [PASS_ARG.USERNAME]: { envVariable: "UAA_USERNAME" },
  [PASS_ARG.PASSWORD]: { sensitive: true, envVariable: "UAA_PASSWORD" },
});

const FLAG_ARG = Object.freeze({
  DECODE: "--decode",
  REVEAL: "--reveal",
  TIMESTAMPS: "--time",
  JSON: "--json",
  USER_INFO: "--userinfo",
  AUTO_UNDEPLOY: "--auto-undeploy",
  SKIP_UNCHANGED: "--skip-unchanged",
  ONLY_STALE: "--only-stale",
  ONLY_FAILED: "--only-failed",
});

const FORCE_FLAG = "--force";

const USAGE = `usage: ${NAME} [command]

commands:
   h  -h  --help     show complete help
   v  -v  --version  show version

   === tool setup (set) ===
~  setl    --setup-list   list runtime config
   set     --setup        interactive setup for global config
   setcwd  --setup-local  interactive setup for local config
   setcc   --clean-cache  clean all app caches

   === user authentication (uaa) ===
~  uaad   --uaa-decode TOKEN                                     decode JSON web token
~  uaac   --uaa-client [TENANT]                                  obtain uaa token for generic client
~  uaap   --uaa-passcode PASSCODE [TENANT]                       obtain uaa token for one-time passcode
~  uaau   --uaa-user USERNAME PASSWORD [TENANT]                  obtain uaa token for username password
~  uaasc  --uaa-service-client SERVICE [TENANT]                  obtain service token for generic client
~  uaasp  --uaa-service-passcode SERVICE PASSCODE [TENANT]       obtain service token for one-time passcode
~  uaasu  --uaa-service-user SERVICE USERNAME PASSWORD [TENANT]  obtain service token for username password
          ...    [TENANT]                                        obtain token for tenant, fallback to paas tenant
          ...    --decode                                        decode result token
          ...    --userinfo                                      add detailed user info for passcode or username

   === tenant registry (reg) ===
~  regl   --registry-list [TENANT]                      list all subscribed subaccount names
~  regll  --registry-long-list [TENANT]                 long list all subscribed subaccounts
~  regs   --registry-service-config                     show registry service config
~  regj   --registry-job JOB_ID                         show registry job
          --registry-update TENANT_ID                   update tenant dependencies
          --registry-update-all                         update dependencies for all subscribed tenants
          --registry-update-url [TENANT_ID]             update all subscribed application URL
*         --registry-offboard TENANT_ID                 offboard tenant subscription
*         --registry-offboard-skip TENANT_ID SKIP_APPS  offboard tenant subscription skipping apps
          ...    [TENANT]                               filter list for tenant id or subdomain
          ...    --time                                 list includes timestamps
          ...    --skip-unchanged                       skip update for unchanged dependencies
          ...    --only-stale                           only update subscriptions that have not changed today
          ...    --only-failed                          only update subscriptions with UPDATE_FAILED state

   === cap multitenancy (cds) ===
~  cdsl   --cds-list [TENANT]                        list all cds-mtx tenant names
~  cdsll  --cds-long-list [TENANT]                   long list all cds-mtx tenants
   cdsot  --cds-onboard-tenant TENANT_ID [METADATA]  onboard specific tenant
   cdsut  --cds-upgrade-tenant TENANT_ID             upgrade specific tenant
   cdsua  --cds-upgrade-all                          upgrade all tenants
*         --cds-offboard-tenant TENANT_ID            offboard specific tenant
*         --cds-offboard-all                         offboard all tenants
          ...    [METADATA]                          onboard subscription metadata
          ...    [TENANT]                            filter list for tenant id or subdomain
          ...    --auto-undeploy                     upgrade with auto undeploy
          ...    --time                              list includes timestamps

   === hana management (hdi) ===
~  hdil   --hdi-list [TENANT_ID]                  list all hdi container instances
~  hdill  --hdi-long-list [TENANT_ID]             long list all hdi container instances and bindings
~  hdilr  --hdi-list-relations [TENANT_ID]        list all hdi container instance and binding relations
~  hditt  --hdi-tunnel-tenant TENANT_ID           open ssh tunnel to tenant db
   hdirt  --hdi-rebind-tenant TENANT_ID [PARAMS]  rebind tenant hdi container instances
   hdira  --hdi-rebind-all [PARAMS]               rebind all hdi container instances
          --hdi-repair-bindings [PARAMS]          create missing and delete ambiguous bindings
*         --hdi-delete-tenant TENANT_ID           delete hdi container instance and bindings for tenant
*         --hdi-delete-all                        delete all hdi container instances and bindings
          ...    [TENANT_ID]                      filter for tenant id
          ...    [PARAMS]                         create binding with custom parameters
          ...    --reveal                         show passwords
          ...    --time                           list includes timestamps

   === server diagnostic (srv) ===
~  srv     --server-info                                      call server /info
~  srvd    --server-debug [APP_NAME] [APP_INSTANCE]           open ssh tunnel to port /info {debugPort}
~  srvenv  --server-env [APP_NAME]                            dump system environment
~  srvcrt  --server-certificates [APP_NAME] [APP_INSTANCE]    dump instance certificates
*          --server-start-debugger [APP_NAME] [APP_INSTANCE]  start debugger on server node process
           ...    [APP_NAME]                                  run server commands for a specific app
           ...    [APP_INSTANCE]                              tunnel to specific app instance, fallback to 0

~  are read-only commands
*  are potentially _dangerous_ commands
`;

const GENERIC_CLI_OPTIONS = {
  HELP: {
    commandVariants: ["h", "-h", "--help"],
    silent: true,
    passContext: false,
    callback: () => USAGE,
  },
  VERSION: {
    commandVariants: ["v", "-v", "--version"],
    silent: true,
    passContext: false,
    callback: () => [NAME, VERSION],
  },
};

const APP_CLI_OPTIONS = Object.freeze({
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
    optionalFlagArgs: [FLAG_ARG.DECODE, FLAG_ARG.USER_INFO],
    callback: uaa.uaaPasscode,
    readonly: true,
  },
  UAA_USER: {
    commandVariants: ["uaau", "--uaa-user"],
    requiredPassArgs: [PASS_ARG.USERNAME, PASS_ARG.PASSWORD],
    optionalPassArgs: [PASS_ARG.TENANT],
    optionalFlagArgs: [FLAG_ARG.DECODE, FLAG_ARG.USER_INFO],
    callback: uaa.uaaUser,
    readonly: true,
  },
  UAA_SERVICE_CLIENT: {
    commandVariants: ["uaasc", "--uaa-service-client"],
    requiredPassArgs: [PASS_ARG.SERVICE],
    optionalPassArgs: [PASS_ARG.TENANT],
    optionalFlagArgs: [FLAG_ARG.DECODE],
    callback: uaa.uaaServiceClient,
    readonly: true,
  },
  UAA_SERVICE_PASSCODE: {
    commandVariants: ["uaasp", "--uaa-service-passcode"],
    requiredPassArgs: [PASS_ARG.SERVICE, PASS_ARG.PASSCODE],
    optionalPassArgs: [PASS_ARG.TENANT],
    optionalFlagArgs: [FLAG_ARG.DECODE, FLAG_ARG.USER_INFO],
    callback: uaa.uaaServicePasscode,
    readonly: true,
  },
  UAA_SERVICE_USER: {
    commandVariants: ["uaasu", "--uaa-service-user"],
    requiredPassArgs: [PASS_ARG.SERVICE, PASS_ARG.USERNAME, PASS_ARG.PASSWORD],
    optionalPassArgs: [PASS_ARG.TENANT],
    optionalFlagArgs: [FLAG_ARG.DECODE, FLAG_ARG.USER_INFO],
    callback: uaa.uaaServiceUser,
    readonly: true,
  },

  REGISTRY_LIST: {
    commandVariants: ["regl", "--registry-list"],
    optionalPassArgs: [PASS_ARG.TENANT],
    optionalFlagArgs: [FLAG_ARG.TIMESTAMPS, FLAG_ARG.ONLY_STALE, FLAG_ARG.ONLY_FAILED],
    callback: reg.registryListSubscriptions,
    readonly: true,
  },
  REGISTRY_LONG_LIST: {
    commandVariants: ["regll", "--registry-long-list"],
    optionalPassArgs: [PASS_ARG.TENANT],
    optionalFlagArgs: [FLAG_ARG.JSON, FLAG_ARG.ONLY_STALE, FLAG_ARG.ONLY_FAILED],
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
    optionalFlagArgs: [FLAG_ARG.SKIP_UNCHANGED, FLAG_ARG.ONLY_STALE, FLAG_ARG.ONLY_FAILED],
    callback: reg.registryUpdateAllDependencies,
  },
  REGISTRY_UPDATE_APP_URL: {
    commandVariants: ["--registry-update-url"],
    optionalPassArgs: [PASS_ARG.TENANT_ID],
    optionalFlagArgs: [FLAG_ARG.ONLY_STALE, FLAG_ARG.ONLY_FAILED],
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
    optionalFlagArgs: [FLAG_ARG.JSON],
    callback: cds.cdsLongList,
    readonly: true,
  },
  CDS_ONBOARD_TENANT: {
    commandVariants: ["cdsot", "--cds-onboard-tenant"],
    requiredPassArgs: [PASS_ARG.TENANT_ID],
    optionalPassArgs: [PASS_ARG.METADATA],
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
    optionalFlagArgs: [FLAG_ARG.JSON, FLAG_ARG.REVEAL],
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
  HDI_ENABLE_NATIVE: {
    commandVariants: ["--hdi-enable-native"],
    optionalPassArgs: [PASS_ARG.TENANT_ID],
    callback: hdi.hdiEnableNative,
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
    optionalPassArgs: [PASS_ARG.APP_NAME, PASS_ARG.APP_INSTANCE],
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
});

module.exports = {
  PASS_ARG_META,
  FORCE_FLAG,
  USAGE,
  GENERIC_CLI_OPTIONS,
  APP_CLI_OPTIONS,
};

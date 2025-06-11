"use strict";

const pathlib = require("path");
const { version: VERSION } = require("../package.json");

const set = require("./submodules/setup");
const uaa = require("./submodules/userAuthentication");
const reg = require("./submodules/tenantRegistry");
const cds = require("./submodules/capMultitenancy");
const hdi = require("./submodules/hanaManagement");
const svm = require("./submodules/serviceManager");
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
  SERVICE_PLAN: "SERVICE_PLAN",
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
  FORCE: "--force",
  DECODE: "--decode",
  REVEAL: "--reveal",
  TIMESTAMPS: "--time",
  JSON_OUTPUT: "--json",
  USER_INFO: "--userinfo",
  AUTO_UNDEPLOY: "--auto-undeploy",
  FIRST_INSTANCE: "--first-instance",
  SKIP_UNCHANGED: "--skip-unchanged",
  ONLY_STALE: "--only-stale",
  ONLY_FAILED: "--only-failed",
});

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
          ...    --json                                          output in json
          ...    --decode                                        decode result token
          ...    --userinfo                                      add detailed user info for passcode or username

   === tenant registry (reg) ===
~  regl   --registry-list [TENANT]                      list all subscribed subaccount names
~  regll  --registry-long-list [TENANT]                 long list all subscribed subaccounts
~  regs   --registry-service-config                     show registry service config
          --registry-update TENANT_ID                   update tenant dependencies
          --registry-update-all                         update dependencies for all subscribed tenants
          --registry-update-url [TENANT_ID]             update all subscribed application URL
*         --registry-offboard TENANT_ID                 offboard tenant subscription
*         --registry-offboard-skip TENANT_ID SKIP_APPS  offboard tenant subscription skipping apps
          ...    [TENANT]                               filter list for tenant id or subdomain
          ...    --json                                 list in json
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
          ...    --json                              list in json
          ...    --time                              list includes timestamps
          ...    --auto-undeploy                     upgrade with auto undeploy
          ...    --first-instance                    upgrade only through first app instance

   === hana management (hdi) ===
~  hdil   --hdi-list [TENANT_ID]         list all hdi container instances
~  hdill  --hdi-long-list [TENANT_ID]    long list all hdi container instances and bindings
~  hditt  --hdi-tunnel-tenant TENANT_ID  open ssh tunnel to tenant db
          ...    [TENANT_ID]             filter for tenant id
          ...    --json                  list in json
          ...    --time                  list includes timestamps
          ...    --reveal                show sensitive information

   === service manager (svm) ===
~  svml   --svm-list [TENANT_ID]                                  list all managed service instances and binding
~  svmll  --svm-long-list [TENANT_ID]                             long list all managed service instances and bindings
          --svm-repair-bindings SERVICE_PLAN [PARAMS]             repair missing and ambivalent service bindings
          --svm-refresh-bindings SERVICE_PLAN TENANT_ID [PARAMS]  delete and recreate service bindings
*         --svm-delete-bindings SERVICE_PLAN TENANT_ID            delete service bindings
*         --svm-delete SERVICE_PLAN TENANT_ID                     delete service instances and bindings
          ...    SERVICE_PLAN                                     filter for service plan with "offering:plan"
                                                                    or "all-services" for all
          ...    TENANT_ID                                        filter for tenant id or "all-tenants" for all
          ...    [PARAMS]                                         create binding with custom parameters
          ...    --json                                           list in json
          ...    --time                                           list includes timestamps
          ...    --reveal                                         show sensitive information

   === server diagnostic (srv) ===
~  srvenv  --server-env [APP_NAME]                            dump system environment
~  srvcrt  --server-certificates [APP_NAME] [APP_INSTANCE]    dump instance certificates
   srvd    --server-debug [APP_NAME] [APP_INSTANCE]           open ssh tunnel to debug port
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
    callback: () => `${NAME} v${VERSION}`,
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
    optionalFlagArgs: [FLAG_ARG.JSON_OUTPUT],
    callback: uaa.uaaDecode,
    passContext: false,
    readonly: true,
  },
  UAA_CLIENT: {
    commandVariants: ["uaac", "--uaa-client"],
    optionalPassArgs: [PASS_ARG.TENANT],
    optionalFlagArgs: [FLAG_ARG.DECODE, FLAG_ARG.JSON_OUTPUT],
    callback: uaa.uaaClient,
    readonly: true,
  },
  UAA_PASSCODE: {
    commandVariants: ["uaap", "--uaa-passcode"],
    requiredPassArgs: [PASS_ARG.PASSCODE],
    optionalPassArgs: [PASS_ARG.TENANT],
    optionalFlagArgs: [FLAG_ARG.DECODE, FLAG_ARG.JSON_OUTPUT, FLAG_ARG.USER_INFO],
    callback: uaa.uaaPasscode,
    readonly: true,
  },
  UAA_USER: {
    commandVariants: ["uaau", "--uaa-user"],
    requiredPassArgs: [PASS_ARG.USERNAME, PASS_ARG.PASSWORD],
    optionalPassArgs: [PASS_ARG.TENANT],
    optionalFlagArgs: [FLAG_ARG.DECODE, FLAG_ARG.JSON_OUTPUT, FLAG_ARG.USER_INFO],
    callback: uaa.uaaUser,
    readonly: true,
  },
  UAA_SERVICE_CLIENT: {
    commandVariants: ["uaasc", "--uaa-service-client"],
    requiredPassArgs: [PASS_ARG.SERVICE],
    optionalPassArgs: [PASS_ARG.TENANT],
    optionalFlagArgs: [FLAG_ARG.DECODE, FLAG_ARG.JSON_OUTPUT],
    callback: uaa.uaaServiceClient,
    readonly: true,
  },
  UAA_SERVICE_PASSCODE: {
    commandVariants: ["uaasp", "--uaa-service-passcode"],
    requiredPassArgs: [PASS_ARG.SERVICE, PASS_ARG.PASSCODE],
    optionalPassArgs: [PASS_ARG.TENANT],
    optionalFlagArgs: [FLAG_ARG.DECODE, FLAG_ARG.JSON_OUTPUT, FLAG_ARG.USER_INFO],
    callback: uaa.uaaServicePasscode,
    readonly: true,
  },
  UAA_SERVICE_USER: {
    commandVariants: ["uaasu", "--uaa-service-user"],
    requiredPassArgs: [PASS_ARG.SERVICE, PASS_ARG.USERNAME, PASS_ARG.PASSWORD],
    optionalPassArgs: [PASS_ARG.TENANT],
    optionalFlagArgs: [FLAG_ARG.DECODE, FLAG_ARG.JSON_OUTPUT, FLAG_ARG.USER_INFO],
    callback: uaa.uaaServiceUser,
    readonly: true,
  },

  REGISTRY_LIST: {
    commandVariants: ["regl", "--registry-list"],
    optionalPassArgs: [PASS_ARG.TENANT],
    optionalFlagArgs: [FLAG_ARG.TIMESTAMPS, FLAG_ARG.JSON_OUTPUT, FLAG_ARG.ONLY_STALE, FLAG_ARG.ONLY_FAILED],
    callback: reg.registryListSubscriptions,
    readonly: true,
  },
  REGISTRY_LONG_LIST: {
    commandVariants: ["regll", "--registry-long-list"],
    optionalPassArgs: [PASS_ARG.TENANT],
    optionalFlagArgs: [FLAG_ARG.JSON_OUTPUT, FLAG_ARG.ONLY_STALE, FLAG_ARG.ONLY_FAILED],
    callback: reg.registryLongListSubscriptions,
    readonly: true,
  },
  REGISTRY_SERVICE_CONFIG: {
    commandVariants: ["regs", "--registry-service-config"],
    callback: reg.registryServiceConfig,
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
    optionalFlagArgs: [FLAG_ARG.TIMESTAMPS, FLAG_ARG.JSON_OUTPUT],
    callback: cds.cdsList,
    readonly: true,
  },
  CDS_LONG_LIST: {
    commandVariants: ["cdsll", "--cds-long-list"],
    optionalPassArgs: [PASS_ARG.TENANT],
    optionalFlagArgs: [FLAG_ARG.JSON_OUTPUT],
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
    optionalFlagArgs: [FLAG_ARG.AUTO_UNDEPLOY, FLAG_ARG.FIRST_INSTANCE],
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
    optionalFlagArgs: [FLAG_ARG.TIMESTAMPS, FLAG_ARG.JSON_OUTPUT],
    callback: hdi.hdiList,
    useCache: false,
    readonly: true,
  },
  HDI_LONG_LIST: {
    commandVariants: ["hdill", "--hdi-long-list"],
    optionalPassArgs: [PASS_ARG.TENANT_ID],
    optionalFlagArgs: [FLAG_ARG.JSON_OUTPUT, FLAG_ARG.REVEAL],
    callback: hdi.hdiLongList,
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

  SVM_LIST: {
    commandVariants: ["svml", "--svm-list"],
    optionalPassArgs: [PASS_ARG.TENANT_ID],
    optionalFlagArgs: [FLAG_ARG.TIMESTAMPS, FLAG_ARG.JSON_OUTPUT],
    callback: svm.serviceManagerList,
    useCache: false,
    readonly: true,
  },
  SVM_LONG_LIST: {
    commandVariants: ["svmll", "--svm-long-list"],
    optionalPassArgs: [PASS_ARG.TENANT_ID],
    optionalFlagArgs: [FLAG_ARG.JSON_OUTPUT, FLAG_ARG.REVEAL],
    callback: svm.serviceManagerLongList,
    useCache: false,
    readonly: true,
  },
  SVM_REPAIR_BINDINGS: {
    commandVariants: ["--svm-repair-bindings"],
    requiredPassArgs: [PASS_ARG.SERVICE_PLAN],
    optionalPassArgs: [PASS_ARG.PARAMS],
    callback: svm.serviceManagerRepairBindings,
    useCache: false,
  },
  SVM_REFRESH_BINDINGS: {
    commandVariants: ["--svm-refresh-bindings"],
    requiredPassArgs: [PASS_ARG.SERVICE_PLAN, PASS_ARG.TENANT_ID],
    optionalPassArgs: [PASS_ARG.PARAMS],
    callback: svm.serviceManagerRefreshBindings,
    useCache: false,
  },
  SVM_DELETE_BINDINGS: {
    commandVariants: ["--svm-delete-bindings"],
    requiredPassArgs: [PASS_ARG.SERVICE_PLAN, PASS_ARG.TENANT_ID],
    callback: svm.serviceManagerDeleteBindings,
    useCache: false,
    danger: true,
  },
  SVM_DELETE: {
    commandVariants: ["--svm-delete"],
    requiredPassArgs: [PASS_ARG.SERVICE_PLAN, PASS_ARG.TENANT_ID],
    callback: svm.serviceManagerDeleteInstancesAndBindings,
    useCache: false,
    danger: true,
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
  SRV_DEBUG: {
    commandVariants: ["srvd", "--server-debug"],
    optionalPassArgs: [PASS_ARG.APP_NAME, PASS_ARG.APP_INSTANCE],
    callback: srv.serverDebug,
  },
});

module.exports = {
  PASS_ARG_META,
  FLAG_ARG,
  USAGE,
  GENERIC_CLI_OPTIONS,
  APP_CLI_OPTIONS,
};

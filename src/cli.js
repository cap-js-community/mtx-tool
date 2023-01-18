"use strict";
// https://apidocs.cloudfoundry.org/12.36.0/service_bindings/list_all_service_bindings.html

const { parse } = require("path");
const { sleep, partition, question } = require("./shared/static");
const { assert, fail, ApplicationError } = require("./shared/error");
const { newContext } = require("./context");

const appCliOptions = require("./cliOptions");

const { name: NAME } = parse(process.argv[1]);
const { version: VERSION } = require("../package.json");
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
~  uaad  --uaa-decode TOKEN                decode JSON web token
~  uaac  --uaa-client [TENANT]             obtain token for generic client
~  uaap  --uaa-passcode PASSCODE [TENANT]  obtain token for uaa one-time passcode
~  uaas  --uaa-service SERVICE [TENANT]    obtain token for uaa trusted service
         ...    [TENANT]                   obtain token for tenant, fallback to paas tenant
         ...    --decode                   decode result token

   === tenant registry (reg) ===
~  regl   --registry-list [TENANT]                      list all subscribed subaccount names
~  regll  --registry-long-list [TENANT]                 long list all subscribed subaccounts
~  regs   --registry-service-config                     show registry service config
~  regj   --registry-job JOB_ID                         show registry job
          --registry-update TENANT_ID                   update tenant dependencies
          --registry-update-all                         update dependencies for all subscribed tenants
*         --registry-offboard TENANT_ID                 offboard tenant subscription
*         --registry-offboard-skip TENANT_ID SKIP_APPS  offboard tenant subscription skipping apps
          ...    [TENANT]                               filter list for tenant id or subdomain
          ...    --time                                 list includes timestamps

   === cap multitenancy (cds) ===
~  cdsl   --cds-list [TENANT]                       list all cds-mtx tenant names
~  cdsll  --cds-long-list [TENANT]                  long list all cds-mtx tenants
   cdsot  --cds-onboard-tenant TENANT_ID SUBDOMAIN  onboard specific tenant
   cdsut  --cds-upgrade-tenant TENANT_ID            upgrade specific tenant
   cdsua  --cds-upgrade-all                         upgrade all tenants
*         --cds-offboard-tenant TENANT_ID           offboard specific tenant
*         --cds-offboard-all                        offboard all tenants
          ...    [TENANT]                           filter list for tenant id or subdomain
          ...    --auto-undeploy                    upgrade with auto undeploy

   === hana management (hdi) ===
~  hdil   --hdi-list [TENANT_ID]                  list all hdi container instances
~  hdill  --hdi-long-list [TENANT_ID]             long list all hdi container instances and bindings
~  hdilr  --hdi-list-relations [TENANT_ID]        list all hdi container instance and binding relations
~  hditt  --hdi-tunnel-tenant TENANT_ID           open ssh tunnel to tenant db
   hdirt  --hdi-rebind-tenant TENANT_ID [PARAMS]  rebind tenant hdi container instances
   hdira  --hdi-rebind-all [PARAMS]               rebind all hdi container instances
          --hdi-repair-bindings [PARAMS]          create missing and delete ambiguous bindings
          --hdi-migrate-all                       migrate all hdi containers to service-manager
*         --hdi-delete-tenant TENANT_ID           delete hdi container instance and bindings for tenant
*         --hdi-delete-all                        delete all hdi container instances and bindings
          ...    [TENANT_ID]                      filter list for tenant id
          ...    [PARAMS]                         create binding with custom parameters
          ...    --reveal                         show passwords
          ...    --time                           list includes timestamps

   === server diagnostic (srv) ===
~  srv     --server-info                               call server /info
~  srvd    --server-debug [APP_NAME] [APP_INSTANCE]    open ssh tunnel to port /info {debugPort}
~  srvenv  --server-env [APP_NAME]                     dump system environment
*          --server-start-debugger [APP_NAME]          start debugger on server node process
           ...    [APP_NAME]                           run server commands for a specific app
           ...    [APP_INSTANCE]                       tunnel to specific app instance, fallback to 0

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

const _dangerGuard = async () => {
  console.log('this is a dangerous operation, wait for 15sec and then enter "yes" if you are sure.');
  await sleep(15000);
  const answer = await question("do you want to proceed?");
  assert(answer === "yes", "failed danger guard check");
};

const checkOption = async (cliOption, args) => {
  const [firstArg] = args;
  const [passArgs, flagArgs] = partition(args.slice(1), (arg) => !arg.startsWith("--"));
  const {
    callback,
    commandVariants = [],
    requiredPassArgs = [],
    optionalPassArgs = [],
    optionalFlagArgs = [],
    silent = false,
    passContext = true,
    danger = false,
    useCache = true,
    readonly = false,
  } = cliOption;
  if (firstArg && commandVariants.includes(firstArg)) {
    const command = commandVariants[commandVariants.length - 1];
    let flagValues = null;
    assert(
      passArgs.length >= requiredPassArgs.length,
      'command "%s" requires %s %s',
      command,
      requiredPassArgs.length === 1 ? "argument" : "arguments",
      requiredPassArgs.join(", ")
    );
    const allPassArgs = [].concat(requiredPassArgs, optionalPassArgs);
    assert(
      passArgs.length <= allPassArgs.length,
      'command "%s" takes %s %s',
      command,
      allPassArgs.length === 1 ? "argument" : "arguments",
      allPassArgs.join(", ")
    );
    if (optionalFlagArgs) {
      flagArgs.forEach((flagArg) => {
        assert(
          flagArg === FORCE_FLAG || optionalFlagArgs.includes(flagArg),
          'flag argument "%s" not valid for command "%s"',
          flagArg,
          command
        );
      });
      flagValues = optionalFlagArgs.map((flag) => flagArgs.includes(flag));
    }
    !silent && console.log("running", command, ...passArgs, ...flagArgs);
    const context = passContext ? await newContext({ usePersistedCache: useCache, isReadonlyCommand: readonly }) : null;
    danger && !flagArgs.includes(FORCE_FLAG) && (await _dangerGuard());
    const result = context ? await callback(context, passArgs, flagValues) : await callback(passArgs, flagValues);

    if (typeof result === "string") {
      console.log(result);
    } else if (Array.isArray(result)) {
      console.log(...result);
    }
    return true;
  }
};

const cli = async (args) => {
  try {
    const [firstArg] = args;

    if (!firstArg) {
      console.log(USAGE);
      return;
    }

    for (const appCliOption of [].concat(
      [GENERIC_CLI_OPTIONS.HELP, GENERIC_CLI_OPTIONS.VERSION],
      Object.values(appCliOptions)
    )) {
      if (await checkOption(appCliOption, args)) {
        return;
      }
    }

    fail('unknown command "%s"', firstArg);
  } catch (err) {
    if (!(err instanceof ApplicationError)) {
      throw err;
    }
    if (err.message) {
      console.error("error: " + err.message);
    }
    process.exit(-1);
  }
};

module.exports = {
  GENERIC_CLI_OPTIONS,
  USAGE,
  cli,
};

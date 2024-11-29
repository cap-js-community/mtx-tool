"use strict";
// https://apidocs.cloudfoundry.org/12.36.0/service_bindings/list_all_service_bindings.html

const { sleep, partition, question, isObject } = require("./shared/static");
const { assert, fail, ApplicationError } = require("./shared/error");
const { newContext } = require("./context");
const {
  FORCE_FLAG,
  JSON_OUTPUT_FLAG,
  PASS_ARG_META,
  USAGE,
  GENERIC_CLI_OPTIONS,
  APP_CLI_OPTIONS,
} = require("./cliOptions");
const { LEVEL, Logger } = require("./shared/logger");

const logger = Logger.getInstance();

const _dangerGuard = async () => {
  logger.info('this is a dangerous operation, wait for 15sec and then enter "yes" if you are sure.');
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
  if (!firstArg || !commandVariants.includes(firstArg)) {
    return false;
  }
  const allPassArgs = [].concat(requiredPassArgs, optionalPassArgs);
  const command = commandVariants[commandVariants.length - 1];
  let flagValues = null;

  // NOTE: this mixes in (required and optional) positional arguments that can
  //   be replaced by env variables.
  for (const [index, passArg] of allPassArgs.entries()) {
    const envVariable = PASS_ARG_META[passArg]?.envVariable;
    const value = envVariable && process.env[envVariable];
    if (envVariable && value) {
      passArgs.splice(index, 0, value);
    }
  }
  assert(
    passArgs.length >= requiredPassArgs.length,
    'command "%s" requires %s %s',
    command,
    requiredPassArgs.length === 1 ? "argument" : "arguments",
    requiredPassArgs.join(", ")
  );
  assert(
    passArgs.length <= allPassArgs.length,
    'command "%s" takes %s %s',
    command,
    allPassArgs.length === 1 ? "argument" : "arguments",
    allPassArgs.join(", ")
  );
  if (optionalFlagArgs) {
    flagArgs.forEach((flagArg) => {
      assert(optionalFlagArgs.includes(flagArg), 'flag argument "%s" not valid for command "%s"', flagArg, command);
    });
    flagValues = optionalFlagArgs.map((flag) => flagArgs.includes(flag));
  }
  const doForce = flagArgs.includes(FORCE_FLAG);
  const doJsonOutput = flagArgs.includes(JSON_OUTPUT_FLAG);
  const maskedPassArgs = passArgs.map((arg, index) => (PASS_ARG_META[allPassArgs[index]]?.sensitive ? "*****" : arg));

  doJsonOutput && logger.setMaxLevel(LEVEL.ERROR);
  !silent && logger.info("running", command, ...maskedPassArgs, ...flagArgs);
  const context = passContext ? await newContext({ usePersistedCache: useCache, isReadonlyCommand: readonly }) : null;
  danger && !doForce && (await _dangerGuard());
  const result = context ? await callback(context, passArgs, flagValues) : await callback(passArgs, flagValues);

  doJsonOutput && logger.setMaxLevel(LEVEL.INFO);
  if (typeof result === "string") {
    logger.info(result);
  } else if (isObject(result)) {
    logger.info(JSON.stringify(result, null, 2));
  }
  return true;
};

const cli = async (args) => {
  try {
    const [firstArg] = args;

    if (!firstArg) {
      logger.info(USAGE);
      return;
    }

    for (const appCliOption of [].concat(
      [GENERIC_CLI_OPTIONS.HELP, GENERIC_CLI_OPTIONS.VERSION],
      Object.values(APP_CLI_OPTIONS)
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
      logger.error("error: " + err.message);
    }
    process.exit(-1);
  }
};

module.exports = {
  cli,
};

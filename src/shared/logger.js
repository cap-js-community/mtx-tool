"use strict";
const util = require("util");

// NOTE: logger levels are tricky. looking at console, npm, winston, and cap there is no real consistency. we will
//   offer the same levels as console and an additional "off" level.
const LEVEL = Object.freeze({
  OFF: "OFF", // SILENT: "SILENT"
  ERROR: "ERROR",
  WARNING: "WARNING",
  INFO: "INFO",
  DEBUG: "DEBUG", // VERBOSE: "VERBOSE",
  TRACE: "TRACE", // SILLY: "SILLY"
});

const LEVEL_NUMBER = Object.freeze({
  [LEVEL.OFF]: 0,
  [LEVEL.ERROR]: 100,
  [LEVEL.WARNING]: 200,
  [LEVEL.INFO]: 300,
  [LEVEL.DEBUG]: 400,
  [LEVEL.TRACE]: 500,
});

const FIELD = Object.freeze({
  LEVEL: "level",
  WRITTEN_TIME: "written_ts",
  MESSAGE: "msg",
});

/**
 * Logger is an implementation of a logger that simultaneously produces natural human-readable logs locally and, in
 * Cloud Foundry environments, will produce logs in the form of JSON objects with special properties.
 */
class Logger {
  constructor({ maxLevel = LEVEL.INFO, inspectOptions = { colors: false } } = {}) {
    this.__dataList = [];
    this.__inspectOptions = inspectOptions;
    this.__maxLevelNumber = LEVEL_NUMBER[maxLevel];
  }

  setMaxLevel(maxLevel) {
    this.__maxLevelNumber = LEVEL_NUMBER[maxLevel];
  }

  /**
   * @returns {Logger}
   */
  static getInstance() {
    if (!Logger.__instance) {
      Logger.__instance = new Logger();
    }
    return Logger.__instance;
  }

  _logData(level, args) {
    let message;
    if (args.length > 0) {
      const firstArg = args[0];

      // special handling if the only arg is an Error
      if (firstArg instanceof Error) {
        const err = firstArg;
        message = util.formatWithOptions(this.__inspectOptions, "%s", err.stack);
      }
      // normal handling
      else {
        message = util.formatWithOptions(this.__inspectOptions, ...args);
      }
    }

    const invocationData = {
      [FIELD.MESSAGE]: message ?? "",
    };
    return Object.assign({}, ...this.__dataList, invocationData);
  }

  _log(level, args) {
    if (this.__maxLevelNumber < LEVEL_NUMBER[level]) {
      return;
    }
    const streamOut = level === LEVEL.ERROR ? process.stderr : process.stdout;
    const data = this._logData(level, args);
    streamOut.write(data[FIELD.MESSAGE] + "\n");
  }

  error(...args) {
    return this._log(LEVEL.ERROR, args);
  }
  warning(...args) {
    return this._log(LEVEL.WARNING, args);
  }
  info(...args) {
    return this._log(LEVEL.INFO, args);
  }
  debug(...args) {
    return this._log(LEVEL.DEBUG, args);
  }
  trace(...args) {
    return this._log(LEVEL.TRACE, args);
  }
}

module.exports = {
  LEVEL,

  Logger,

  _: {
    _reset() {
      Reflect.deleteProperty(Logger, "__instance");
    },
  },
};

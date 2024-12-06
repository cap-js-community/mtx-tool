"use strict";

const pathlib = require("path");
const {
  writeFileSync,
  unlinkSync,
  constants: { R_OK },
} = require("fs");

const { question, tryReadJsonSync, tryAccessSync } = require("../shared/static");
const { fail } = require("../shared/error");
const { SETTING } = require("../setting");
const { Logger } = require("../shared/logger");

const PROCESS_CWD = process.cwd();
const HOME = process.env.HOME || process.env.USERPROFILE;

const LOCATION = Object.freeze({
  LOCAL: "LOCAL",
  GLOBAL: "GLOBAL",
});
const LOCATION_DIR = Object.freeze({
  [LOCATION.LOCAL]: PROCESS_CWD,
  [LOCATION.GLOBAL]: HOME,
});
const FILENAME = Object.freeze({
  CONFIG: ".mtxrc.json",
  CACHE: ".mtxcache.json",
});

const logger = Logger.getInstance();

const _resolveDir = (filename) => {
  let subdirs = PROCESS_CWD.split(pathlib.sep);
  while (true) {
    const dir = subdirs.length === 0 ? HOME : subdirs.join(pathlib.sep);
    const filepath = dir + pathlib.sep + filename;
    if (tryAccessSync(filepath, R_OK)) {
      return {
        dir,
        filepath,
        location: dir === HOME ? LOCATION.GLOBAL : LOCATION.LOCAL,
      };
    }
    if (subdirs.length === 0) {
      return null;
    }
    subdirs = subdirs.slice(0, -1);
  }
};

const _readRuntimeConfig = (filepath, { logged = false, checkConfig = true } = {}) => {
  const rawRuntimeConfig = filepath ? tryReadJsonSync(filepath) : null;
  if (checkConfig && !rawRuntimeConfig) {
    return fail(`failed reading runtime configuration, run setup`);
  }
  if (logged && filepath) {
    logger.info("using runtime config", filepath);
  }

  return rawRuntimeConfig
    ? Object.values(SETTING).reduce((result, value) => {
        result[value.config] = rawRuntimeConfig[value.config];
        return result;
      }, Object.create(null))
    : {};
};

const _writeRuntimeConfig = async (runtimeConfig, filepath) => {
  try {
    writeFileSync(filepath, JSON.stringify(runtimeConfig, null, 2) + "\n");
    logger.info("wrote runtime config");
  } catch (err) {
    fail("caught error while writing runtime config:", err.message);
  }
};

const _setup = async (location) => {
  const dir = LOCATION_DIR[location];
  const filepath = pathlib.join(dir, FILENAME.CONFIG);
  const runtimeConfig = _readRuntimeConfig(filepath, { logged: true, checkConfig: false });

  const newRuntimeConfig = {};
  logger.info("hit enter to skip a question. re-using the same app for multiple questions is possible.");
  try {
    const settings = Object.values(SETTING);
    for (let i = 0; i < settings.length; i++) {
      const value = settings[i];
      const ask = `${i + 1}/${settings.length} | ${value.question}`;
      const answer = (await question(ask, runtimeConfig[value.config])).trim();
      if (answer) {
        newRuntimeConfig[value.config] = answer;
      }
    }
  } catch (err) {
    fail();
  }
  return _writeRuntimeConfig(newRuntimeConfig, filepath);
};

const setup = async () => {
  return _setup(LOCATION.GLOBAL);
};

const setupLocal = async () => {
  return _setup(LOCATION.LOCAL);
};

const setupList = () => {
  const { filepath } = _resolveDir(FILENAME.CONFIG) || {};
  const runtimeConfig = _readRuntimeConfig(filepath, { logged: true });
  return Object.values(SETTING)
    .map(
      (value, i, settings) =>
        `${i + 1}/${settings.length} | ${value.question} ${runtimeConfig[value.config] || "<empty>"}`
    )
    .join("\n");
};

const setupCleanCache = async () => {
  while (true) {
    const { filepath, location } = _resolveDir(FILENAME.CACHE) || {};
    if (!filepath) {
      break;
    }
    try {
      unlinkSync(filepath);
      logger.info(`removed ${location.toLowerCase()} cache`, filepath);
    } catch (err) {
      fail(`could not remove ${filepath}`);
    }
  }
};

module.exports = {
  setup,
  setupLocal,
  setupList,
  setupCleanCache,
};

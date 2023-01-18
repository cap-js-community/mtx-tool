"use strict";

const { sleep } = require("./static");
const fetch = require("./fetch");
const { fail } = require("./error");

const request = async (options) => {
  try {
    return await fetch(options);
  } catch (err) {
    fail(err.message);
  }
};

const requestTry = async (options) => {
  try {
    return await fetch(options);
  } catch (err) {
    console.error(err.message);
    return null;
  }
};

const requestRetry = async (options, tries = 10, timeout = 3000) => {
  for (let i = 0; i < tries; i++) {
    try {
      return await fetch(options);
    } catch (err) {
      console.error(err.message);
      await sleep(timeout);
    }
  }
  return null;
};

module.exports = {
  request,
  requestTry,
  requestRetry,
};

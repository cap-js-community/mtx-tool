"use strict";

const { format } = require("util");

class ApplicationError extends Error {
  constructor(message, ...messageArgs) {
    super(message ? format(message, ...messageArgs) : "");
  }
}

const assert = (condition, message, ...messageArgs) => {
  if (!condition) {
    throw new ApplicationError(message, ...messageArgs);
  }
};

const assertAll =
  (message, ...messageArgs) =>
  async (promises) => {
    const results = await Promise.allSettled(promises);
    assert(
      results.every(({ status }) => status === "fulfilled"),
      [format(message, ...messageArgs)]
        .concat(
          Array.from(results.entries())
            .filter(([, { status }]) => status === "rejected")
            .map(([index, { reason }]) => `error in promise ${index + 1}: ${reason.message}`)
        )
        .join("\n")
    );
    return results.map(({ value }) => value);
  };

const fail = (message, ...messageArgs) => {
  throw new ApplicationError(message, ...messageArgs);
};

module.exports = {
  assert,
  assertAll,
  fail,
  ApplicationError,
};

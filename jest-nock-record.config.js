"use strict";

// For a detailed explanation regarding each configuration property, visit:
// https://jestjs.io/docs/en/configuration.html

module.exports = {
  // NOTE: Inline Snapshots are not supported when using Prettier 3.0.0 or above
  // https://jestjs.io/docs/configuration/#prettierpath-string
  prettierPath: null,

  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: false,

  // The test environment that will be used for testing
  testEnvironment: "node",

  // The glob patterns Jest uses to detect test files
  testMatch: ["<rootDir>/test-nock-record/**/?(*.)+(spec|test).[tj]s?(x)"],

  // node-fetch v3 is ESM-only and jest 30's synchronous require(ESM) needs Node >=24.9.
  // On Node 20 we route requires to a CJS shim that lazy-imports the real module.
  // TODO: remove this mapper (and test/test-util/node-fetch-shim.js) once tests run on Node >=24.9.
  moduleNameMapper: {
    "^node-fetch$": "<rootDir>/test/test-util/node-fetch-shim.js",
  },
};

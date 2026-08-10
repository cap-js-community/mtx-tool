"use strict";

// For a detailed explanation regarding each configuration property, visit:
// https://jestjs.io/docs/en/configuration.html

module.exports = {
  // NOTE: Inline Snapshots are not supported when using Prettier 3.0.0 or above
  // https://jestjs.io/docs/configuration/#prettierpath-string
  prettierPath: null,

  // Automatically clear mock calls and instances between every test
  clearMocks: true,

  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,

  // An array of glob patterns indicating a set of files for which coverage information should be collected
  collectCoverageFrom: ["src/**/*.js"],

  // An array of regexp pattern strings used to skip coverage collection
  coveragePathIgnorePatterns: ["/node_modules/", "/bin/"],

  // Indicates which provider should be used to instrument code for coverage
  coverageProvider: "v8",

  // A list of reporter names that Jest uses when writing coverage reports
  coverageReporters: ["text-summary"],

  // An object that configures minimum threshold enforcement for coverage results
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
    },
  },

  // The test environment that will be used for testing
  testEnvironment: "node",

  // The glob patterns Jest uses to detect test files
  testMatch: ["<rootDir>/test/**/?(*.)+(spec|test).[tj]s?(x)"],

  // node-fetch v3 is ESM-only and jest 30's synchronous require(ESM) needs Node >=24.9.
  // On Node 20 we route requires to a CJS shim that lazy-imports the real module.
  // TODO: remove this mapper (and test/test-util/node-fetch-shim.js) once tests run on Node >=24.9.
  moduleNameMapper: {
    "^node-fetch$": "<rootDir>/test/test-util/node-fetch-shim.js",
  },
};

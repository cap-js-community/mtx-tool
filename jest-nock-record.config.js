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
};

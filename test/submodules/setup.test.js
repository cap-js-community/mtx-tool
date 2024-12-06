"use strict";

const { Logger: MockLogger } = require("../../src/shared/logger");
const mockLogger = MockLogger.getInstance();
jest.mock("../../src/shared/logger", () => require("../__mocks/shared/logger"));

const set = require("../../src/submodules/setup");

const mockStatic = require("../../src/shared/static");
jest.mock("../../src/shared/static", () => {
  const { ENV, safeUnshift, escapeRegExp, makeOneTime } = jest.requireActual("../../src/shared/static");
  return {
    ENV,
    safeUnshift,
    escapeRegExp,
    makeOneTime,
    tryAccessSync: jest.fn(),
    tryReadJsonSync: jest.fn(),
    spawnAsync: jest.fn(),
  };
});

const mockRuntimeConfig = {
  uaaAppName: "mock-uaa-app",
  regAppName: "mock-reg-app",
  cdsAppName: "mock-cds-app",
  hdiAppName: "mock-hdi-app",
  srvAppName: "mock-srv-app",
};

describe("set tests", () => {
  test("setup list", async () => {
    mockStatic.tryAccessSync.mockReturnValueOnce(true);
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockRuntimeConfig);

    expect(set.setupList()).toMatchInlineSnapshot(`
      "1/5 | cf app bound to xsuaa service (optional)? mock-uaa-app
      2/5 | cf app bound to saas-registry service (optional)? mock-reg-app
      3/5 | cf app running @sap/cds-mtx or @sap/cds-mtxs library (optional)? mock-cds-app
      4/5 | cf app bound to service-manager or managed-hana service (optional)? mock-hdi-app
      5/5 | cf app with "/info" endpoint (optional)? mock-srv-app"
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });
});

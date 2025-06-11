"use strict";

const { Logger: MockLogger } = require("../../src/shared/logger");
const mockLogger = MockLogger.getInstance();
jest.mock("../../src/shared/logger", () => require("../__mocks/shared/logger"));

const srv = require("../../src/submodules/serverDiagnostic");
const mockAppName = "mock-app-name";

const mockStatic = require("../../src/shared/static");
jest.mock("../../src/shared/static", () => ({
  tryAccessSync: jest.fn(),
  writeJsonSync: jest.fn(),
  deleteFileSync: jest.fn(),
  question: jest.fn(),
}));

const mockCfSsh = jest.fn();

const mockContext = {
  getSrvInfo() {
    return {
      cfSsh: mockCfSsh,
      cfBuildpack: "java-default-app",
      cfAppGuid: "config-default-guid",
      cfEnvServices: "config-default-services",
      cfEnvApp: "",
      cfEnvVariables,
    };
  },
  getAppNameInfoCached(appName) {
    if (appName !== mockAppName) {
      throw new Error("unexpected appName");
    }
    return { cfSsh: mockCfSsh, cfBuildpack: "node-mock-app", cfAppGuid: "mock-app-guid" };
  },
};

const { outputFromLogger } = require("../test-util/static");

describe("srv tests", () => {
  test("srv env", async () => {
    await expect(srv.serverEnvironment(mockContext, [])).resolves.toMatchInlineSnapshot();
    await expect(srv.serverEnvironment(mockContext, [mockAppName])).resolves.toMatchInlineSnapshot();
  });

  test("srv certificates", async () => {});

  test("srv debug", async () => {});
});

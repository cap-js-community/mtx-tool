"use strict";

const { Logger: MockLogger } = require("../../src/shared/logger");
const mockLogger = MockLogger.getInstance();
jest.mock("../../src/shared/logger", () => require("../__mocks/shared/logger"));

const srv = require("../../src/submodules/serverDiagnostic");
const mockAppName = "mock-app-name";

jest.mock("../../src/shared/static", () => require("../__mocks/sharedNockPlayback/static"));

const { outputFromLogger } = require("../test-util/static");

const mockCfSsh = jest.fn();

const mockContext = {
  getSrvInfo() {
    return {
      cfSsh: mockCfSsh,
      cfBuildpack: "java_buildpack",
      cfAppGuid: "config-default-guid",
    };
  },
  getAppNameInfoCached(appName) {
    if (appName !== mockAppName) {
      throw new Error("unexpected appName");
    }
    return { cfSsh: mockCfSsh, cfBuildpack: "nodejs_buildpack", cfAppGuid: "mock-app-guid" };
  },
};

describe("srv tests", () => {
  test("srv debug default", async () => {
    await expect(srv.serverDebug(mockContext, [])).resolves.toMatchInlineSnapshot(`undefined`);
    expect(mockCfSsh).toHaveBeenCalledTimes(1);
    expect(mockCfSsh.mock.calls[0]).toMatchInlineSnapshot(`
      [
        {
          "appInstance": "0",
          "localPort": 8000,
          "remotePort": 8000,
        },
      ]
    `);
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "
      connect java debugger on port 8000
      use request header "X-Cf-App-Instance: config-default-guid:0" to target this app instance
      "
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("srv debug custom", async () => {
    await expect(srv.serverDebug(mockContext, [mockAppName, "1"])).resolves.toMatchInlineSnapshot(`undefined`);
    expect(mockCfSsh).toHaveBeenCalledTimes(2);
    expect(mockCfSsh.mock.calls[0]).toMatchInlineSnapshot(`
      [
        {
          "appInstance": "1",
          "command": "pkill --signal SIGUSR1 node",
        },
      ]
    `);
    expect(mockCfSsh.mock.calls[1]).toMatchInlineSnapshot(`
      [
        {
          "appInstance": "1",
          "localPort": 9229,
          "remotePort": 9229,
        },
      ]
    `);
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "
      connect node debugger on port 9229
      use request header "X-Cf-App-Instance: mock-app-guid:1" to target this app instance
      "
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });
});

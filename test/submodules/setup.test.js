"use strict";

const { Logger: MockLogger } = require("../../src/shared/logger");
const mockLogger = MockLogger.getInstance();
jest.mock("../../src/shared/logger", () => require("../__mocks/shared/logger"));

const mockStatic = require("../../src/shared/static");
jest.mock("../../src/shared/static", () => ({
  tryAccessSync: jest.fn(),
  question: jest.fn(),
}));

const mockContextModule = require("../../src/context");
jest.mock("../../src/context", () => ({
  readRuntimeConfig: jest.fn(),
}));

const mockFs = require("fs");
jest.mock("fs", () => ({
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  constants: { R_OK: 4 },
}));

const processCwdSpy = jest.spyOn(process, "cwd");

const { outputFromLogger } = require("../test-util/static");

const mockRuntimeConfig = {
  uaaAppName: "mock-uaa-app",
  regAppName: "mock-reg-app",
  cdsAppName: "mock-cds-app",
  hdiAppName: "mock-hdi-app",
  srvAppName: "mock-srv-app",
};

let set;

describe("set tests", () => {
  beforeEach(() => {
    jest.isolateModules(() => {
      process.env.HOME = "/root/home-dir";
      processCwdSpy.mockReturnValueOnce("/root/local-dir");
      set = require("../../src/submodules/setup");
    });
  });

  test("setup list", async () => {
    mockStatic.tryAccessSync.mockReturnValue(true);
    mockContextModule.readRuntimeConfig.mockReturnValueOnce(mockRuntimeConfig);

    expect(set.setupList()).toMatchInlineSnapshot(`
      "1/5 | cf app bound to xsuaa service (optional)? mock-uaa-app
      2/5 | cf app bound to saas-registry service (optional)? mock-reg-app
      3/5 | cf app running @sap/cds-mtx or @sap/cds-mtxs library (optional)? mock-cds-app
      4/5 | cf app bound to service-manager or managed-hana service (optional)? mock-hdi-app
      5/5 | cf app with "/info" endpoint (optional)? mock-srv-app"
    `);
    expect(mockStatic.tryAccessSync).toHaveBeenCalledTimes(1);
    expect(mockContextModule.readRuntimeConfig).toHaveBeenCalledTimes(1);
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`""`);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("setup global", async () => {
    mockContextModule.readRuntimeConfig.mockReturnValueOnce(mockRuntimeConfig);
    for (let i = 0; i < Object.keys(mockRuntimeConfig).length; i++) {
      mockStatic.question.mockReturnValueOnce(`answer ${i + 1}`);
    }

    expect(await set.setup()).toMatchInlineSnapshot(`undefined`);
    expect(mockStatic.tryAccessSync).toHaveBeenCalledTimes(0);
    expect(mockContextModule.readRuntimeConfig).toHaveBeenCalledTimes(1);
    expect(mockFs.writeFileSync).toHaveBeenCalledTimes(1);
    expect(mockFs.writeFileSync.mock.calls[0]).toMatchInlineSnapshot(`
      [
        "/root/home-dir/.mtxrc.json",
        "{
        "uaaAppName": "answer 1",
        "regAppName": "answer 2",
        "cdsAppName": "answer 3",
        "hdiAppName": "answer 4",
        "srvAppName": "answer 5"
      }
      ",
      ]
    `);
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "hit enter to skip a question. re-using the same app for multiple questions is possible.
      wrote runtime config"
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("setup local", async () => {
    mockContextModule.readRuntimeConfig.mockReturnValueOnce(mockRuntimeConfig);
    for (let i = 0; i < Object.keys(mockRuntimeConfig).length; i++) {
      mockStatic.question.mockReturnValueOnce(`answer ${i + 1}`);
    }

    expect(await set.setupLocal()).toMatchInlineSnapshot(`undefined`);
    expect(mockStatic.tryAccessSync).toHaveBeenCalledTimes(0);
    expect(mockContextModule.readRuntimeConfig).toHaveBeenCalledTimes(1);
    expect(mockFs.writeFileSync).toHaveBeenCalledTimes(1);
    expect(mockFs.writeFileSync.mock.calls[0]).toMatchInlineSnapshot(`
      [
        "/root/local-dir/.mtxrc.json",
        "{
        "uaaAppName": "answer 1",
        "regAppName": "answer 2",
        "cdsAppName": "answer 3",
        "hdiAppName": "answer 4",
        "srvAppName": "answer 5"
      }
      ",
      ]
    `);
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "hit enter to skip a question. re-using the same app for multiple questions is possible.
      wrote runtime config"
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("setup clean cache", async () => {
    mockStatic.tryAccessSync.mockReturnValueOnce(true);
    mockStatic.tryAccessSync.mockReturnValueOnce(false);

    set.setupCleanCache();
    expect(mockStatic.tryAccessSync).toHaveBeenCalledTimes(2);
    expect(mockFs.unlinkSync).toHaveBeenCalledTimes(1);
    expect(mockFs.unlinkSync.mock.calls[0]).toMatchInlineSnapshot(`
      [
        "root/local-dir/.mtxcache.json",
      ]
    `);
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(
      `"removed local cache root/local-dir/.mtxcache.json"`
    );
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });
});

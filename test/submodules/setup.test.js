"use strict";

const { Logger: MockLogger } = require("../../src/shared/logger");
const mockLogger = MockLogger.getInstance();
jest.mock("../../src/shared/logger", () => require("../__mocks/shared/logger"));

const mockStatic = require("../../src/shared/static");
jest.mock("../../src/shared/static", () => ({
  tryAccessSync: jest.fn(),
  writeJsonSync: jest.fn(),
  deleteFileSync: jest.fn(),
  question: jest.fn(),
}));

const mockContextModule = require("../../src/context");
jest.mock("../../src/context", () => ({
  readRuntimeConfig: jest.fn(),
}));

const { CONFIG_INFOS } = require("../../src/config");

const processCwdSpy = jest.spyOn(process, "cwd");

const { outputFromLogger } = require("../test-util/static");

const mockRuntimeConfig = {
  uaaAppName: "mock-uaa-app",
  regAppName: "mock-reg-app",
  smsAppName: "mock-sms-app",
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
    mockStatic.tryAccessSync.mockReturnValueOnce(true);
    mockContextModule.readRuntimeConfig.mockReturnValueOnce(mockRuntimeConfig);

    expect(set.setupList()).toMatchInlineSnapshot(`
      "1/6 | cf app bound to xsuaa service (optional)? mock-uaa-app
      2/6 | cf app bound to saas-registry service (optional)? mock-reg-app
      3/6 | cf app bound to subscription manager service (optional)? mock-sms-app
      4/6 | cf app running @sap/cds-mtx or @sap/cds-mtxs library (optional)? mock-cds-app
      5/6 | cf app bound to service-manager (optional)? mock-hdi-app
      6/6 | cf app with server (optional)? mock-srv-app"
    `);
    expect(mockStatic.tryAccessSync).toHaveBeenCalledTimes(1);
    expect(mockContextModule.readRuntimeConfig).toHaveBeenCalledTimes(1);
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`""`);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("setup global", async () => {
    mockContextModule.readRuntimeConfig.mockReturnValueOnce(mockRuntimeConfig);
    for (const configInfo of Object.values(CONFIG_INFOS)) {
      mockStatic.question.mockReturnValueOnce(`answer for ${configInfo.config}`);
    }

    await expect(set.setup()).resolves.toBeUndefined();
    expect(mockStatic.tryAccessSync).toHaveBeenCalledTimes(0);
    expect(mockContextModule.readRuntimeConfig).toHaveBeenCalledTimes(1);
    expect(mockStatic.writeJsonSync).toHaveBeenCalledTimes(1);
    expect(mockStatic.writeJsonSync.mock.calls[0]).toMatchInlineSnapshot(`
      [
        "/root/home-dir/.mtxrc.json",
        {
          "cdsAppName": "answer for cdsAppName",
          "hdiAppName": "answer for hdiAppName",
          "regAppName": "answer for regAppName",
          "smsAppName": "answer for smsAppName",
          "srvAppName": "answer for srvAppName",
          "uaaAppName": "answer for uaaAppName",
        },
      ]
    `);
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "hit enter to skip a question. re-using the same app for multiple questions is possible.
      wrote runtime config"
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("setup global with failing question", async () => {
    mockContextModule.readRuntimeConfig.mockReturnValueOnce(mockRuntimeConfig);
    mockStatic.question.mockImplementationOnce(() => {
      throw new Error("question fail");
    });

    await expect(set.setup()).rejects.toMatchInlineSnapshot(`[Error: caught error during question: question fail]`);
  });

  test("setup global with question interrupted", async () => {
    mockContextModule.readRuntimeConfig.mockReturnValueOnce(mockRuntimeConfig);
    mockStatic.question.mockImplementationOnce(() => {
      throw undefined;
    });

    await expect(set.setup()).rejects.toMatchInlineSnapshot(`[Error]`);
  });

  test("setup global with failing write", async () => {
    mockContextModule.readRuntimeConfig.mockReturnValueOnce(mockRuntimeConfig);
    for (const configInfo of Object.values(CONFIG_INFOS)) {
      mockStatic.question.mockReturnValueOnce(`answer for ${configInfo.config}`);
    }
    mockStatic.writeJsonSync.mockImplementationOnce(() => {
      throw new Error("cannot write");
    });

    await expect(set.setup()).rejects.toMatchInlineSnapshot(
      `[Error: caught error while writing runtime config: cannot write]`
    );
  });

  test("setup local", async () => {
    mockContextModule.readRuntimeConfig.mockReturnValueOnce(mockRuntimeConfig);
    for (const configInfo of Object.values(CONFIG_INFOS)) {
      mockStatic.question.mockReturnValueOnce(`answer for ${configInfo.config}`);
    }

    await expect(set.setupLocal()).resolves.toBeUndefined();
    expect(mockStatic.tryAccessSync).toHaveBeenCalledTimes(0);
    expect(mockContextModule.readRuntimeConfig).toHaveBeenCalledTimes(1);
    expect(mockStatic.writeJsonSync).toHaveBeenCalledTimes(1);
    expect(mockStatic.writeJsonSync.mock.calls[0]).toMatchInlineSnapshot(`
      [
        "/root/local-dir/.mtxrc.json",
        {
          "cdsAppName": "answer for cdsAppName",
          "hdiAppName": "answer for hdiAppName",
          "regAppName": "answer for regAppName",
          "smsAppName": "answer for smsAppName",
          "srvAppName": "answer for srvAppName",
          "uaaAppName": "answer for uaaAppName",
        },
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
    for (let i = 0; i < 4; i++) {
      mockStatic.tryAccessSync.mockReturnValueOnce(false);
    }

    set.setupCleanCache();
    expect(mockStatic.tryAccessSync.mock.calls).toMatchInlineSnapshot(`
      [
        [
          "/root/local-dir/.mtxcache.json",
        ],
        [
          "/root/local-dir/.mtxcache.json",
        ],
        [
          "/root/.mtxcache.json",
        ],
        [
          "/.mtxcache.json",
        ],
        [
          "/root/home-dir/.mtxcache.json",
        ],
      ]
    `);
    expect(mockStatic.deleteFileSync.mock.calls).toMatchInlineSnapshot(`
      [
        [
          "/root/local-dir/.mtxcache.json",
        ],
      ]
    `);
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(
      `"removed local cache /root/local-dir/.mtxcache.json"`
    );
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("setup clean cache with failing delete", async () => {
    mockStatic.tryAccessSync.mockReturnValueOnce(true);
    for (let i = 0; i < 4; i++) {
      mockStatic.tryAccessSync.mockReturnValueOnce(false);
    }
    mockStatic.deleteFileSync.mockImplementationOnce(() => {
      throw new Error("failing delete");
    });

    await expect(async () => set.setupCleanCache()).rejects.toMatchInlineSnapshot(
      `[Error: could not remove /root/local-dir/.mtxcache.json]`
    );
  });
});

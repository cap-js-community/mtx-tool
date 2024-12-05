"use strict";

const { newContext } = require("../src/context");

jest.mock("../src/shared/logger", () => require("./__mocks/shared/logger"));

const mockStatic = require("../src/shared/static");
jest.mock("../src/shared/static", () => {
  const { ENV, safeUnshift, escapeRegExp, makeOneTime } = jest.requireActual("../src/shared/static");
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

const { request: mockRequest } = require("../src/shared/request");
jest.mock("../src/shared/request", () => {
  return {
    request: jest.fn(),
  };
});

const mockCfConfig = require("./__mock-data__/mockCfConfig.json");
const mockCfEnvNoServices = require("./__mock-data__/mockCfEnvNoServices.json");
const mockCfApps = require("./__mock-data__/mockCfApps.json");
const mockCfProcess = require("./__mock-data__/mockCfProcess.json");
const mockCfRoutes = require("./__mock-data__/mockCfRoutes.json");
const mockRuntimeConfig = {
  uaaAppName: "uaa-app",
  regAppName: "reg-app",
  cdsAppName: "cds-app",
  hdiAppName: "hdi-app",
  srvAppName: "srv-app",
};

let context;

describe("context tests", () => {
  test("setup list", async () => {
    mockStatic.spawnAsync.mockReturnValueOnce(["oauth-token"]);
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockCfConfig);
    mockStatic.tryAccessSync.mockReturnValueOnce(true);
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockRuntimeConfig);
    mockRequest.mockReturnValueOnce({ json: () => mockCfApps });
    mockRequest.mockReturnValueOnce({ json: () => mockCfEnvNoServices });

    context = await newContext();
    expect(await setupList()).toMatchInlineSnapshot(
      `[Error: no vcap service information in environment, check cf user permissions]`
    );
  });

  test("no vcap service information means no uaa token (space supporter role)", async () => {
    mockStatic.spawnAsync.mockReturnValueOnce(["oauth-token"]);
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockCfConfig);
    mockStatic.tryAccessSync.mockReturnValueOnce(true);
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockRuntimeConfig);
    mockRequest.mockReturnValueOnce({ json: () => mockCfApps });
    mockRequest.mockReturnValueOnce({ json: () => mockCfEnvNoServices });

    const context = await newContext();

    mockRequest.mockReturnValueOnce({ json: () => mockCfProcess });
    mockRequest.mockReturnValueOnce({ json: () => mockCfRoutes });

    await expect(context.getCachedUaaToken()).rejects.toMatchInlineSnapshot(
      `[Error: no vcap service information in environment, check cf user permissions]`
    );
  });
});

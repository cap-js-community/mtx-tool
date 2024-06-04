"use strict";

const { newContext } = require("../src/context");

jest.mock("../src/shared/static", () => {
  const { ENV, safeUnshift, escapeRegExp } = jest.requireActual("../src/shared/static");
  return {
    ENV,
    safeUnshift,
    escapeRegExp,
    tryAccessSync: jest.fn(),
    tryReadJsonSync: jest.fn(),
    spawnAsync: jest.fn(),
  };
});
const mockStatic = require("../src/shared/static");

jest.mock("../src/shared/request", () => {
  return {
    request: jest.fn(),
  };
});
const { request: mockRequest } = require("../src/shared/request");

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
describe("context tests", () => {
  afterEach(() => {
    jest.clearAllMocks();
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

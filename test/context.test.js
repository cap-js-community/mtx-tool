"use strict";

const { newContext } = require("../src/context");

jest.mock("../src/shared/logger", () => require("./__mocks/shared/logger"));

const mockStatic = require("../src/shared/static");
jest.mock("../src/shared/static", () => {
  const { safeUnshift, escapeRegExp, indexByKey } = jest.requireActual("../src/shared/static");
  return {
    safeUnshift,
    escapeRegExp,
    indexByKey,
    tryAccessSync: jest.fn(),
    tryReadJsonSync: jest.fn(),
    writeJsonSync: jest.fn(),
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
const mockCfAppsPages = require("./__mock-data__/mockCfAppsPages.json");
const mockCfProcess = require("./__mock-data__/mockCfProcess.json");
const mockCfRoutes = require("./__mock-data__/mockCfRoutes.json");
const mockCfServicePlans = require("./__mock-data__/mockCfServicePlans.json");
const mockCfBindingsEmpty = require("./__mock-data__/mockCfBindingsEmpty.json");
const mockRuntimeConfig = {
  uaaAppName: "uaa-app",
  regAppName: "reg-app",
  cdsAppName: "cds-app",
  hdiAppName: "hdi-app",
  srvAppName: "srv-app",
};

// getRawAppInfo fans out 4 parallel paged requests via Promise.all in the order:
//   1. /v3/service_plans?include=service_offering   (via _cfServiceInfoMaps)
//   2. /v3/apps/{guid}/processes
//   3. /v3/routes?app_guids={guid}&include=domain
//   4. /v3/service_credential_bindings?app_guids={guid}&include=service_instance
// Queue the matching responses in that order.
const mockRawAppInfoRequests = ({
  bindings,
  servicePlans = mockCfServicePlans,
  processes = mockCfProcess,
  routes = mockCfRoutes,
}) => {
  mockRequest.mockReturnValueOnce({ json: () => servicePlans });
  mockRequest.mockReturnValueOnce({ json: () => processes });
  mockRequest.mockReturnValueOnce({ json: () => routes });
  mockRequest.mockReturnValueOnce({ json: () => bindings });
};

describe("context tests", () => {
  test("fail with an error when bindings are empty", async () => {
    mockStatic.spawnAsync.mockReturnValueOnce(["oauth-token"]);
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockCfConfig);
    mockStatic.tryAccessSync.mockReturnValueOnce(true);
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockRuntimeConfig);
    mockRequest.mockReturnValueOnce({ json: () => mockCfApps });

    const context = await newContext();

    mockRawAppInfoRequests({ bindings: mockCfBindingsEmpty });

    await expect(context.getUaaInfo()).rejects.toMatchInlineSnapshot(
      `[Error: could not access required service-bindings for app "uaa-app" services "[{"label":"xsuaa","plan":"application"},{"label":"xsuaa","plan":"broker"}]"]`
    );
  });

  test("can create context for paged cf apps", async () => {
    mockStatic.spawnAsync.mockReturnValueOnce(["oauth-token"]);
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockCfConfig);
    mockStatic.tryAccessSync.mockReturnValueOnce(true);
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockRuntimeConfig);
    for (const mockCfAppsPage of mockCfAppsPages) {
      mockRequest.mockReturnValueOnce({ json: () => mockCfAppsPage });
    }
    mockRequest.mockReturnValueOnce({ json: () => mockCfEnvNoServices });

    await expect(newContext()).resolves.toBeDefined();
    expect(mockRequest.mock.calls).toMatchSnapshot();
  });

  test("has reg/sms info", async () => {
    mockStatic.spawnAsync.mockReturnValueOnce(["oauth-token"]);
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockCfConfig);
    mockStatic.tryAccessSync.mockReturnValueOnce(true);
    mockStatic.tryReadJsonSync.mockReturnValueOnce({ regAppName: "reg-app" });
    mockRequest.mockReturnValueOnce({ json: () => mockCfApps });
    mockRequest.mockReturnValueOnce({ json: () => mockCfEnvNoServices });

    const context = await newContext();

    expect(context.hasRegInfo).toBe(true);
    expect(context.hasSmsInfo).toBe(false);
  });
});

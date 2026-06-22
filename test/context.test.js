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

const mockCfApps = require("./__mock-data__/mockCfApps.json");
const mockCfAppsPages = require("./__mock-data__/mockCfAppsPages.json");
const mockCfProcess = require("./__mock-data__/mockCfProcess.json");
const mockCfRoutes = require("./__mock-data__/mockCfRoutes.json");

const mockCfEnvNoServices = require("./__mock-data__/mockCfEnvNoServices.json");
const mockCfServicePlansEmpty = require("./__mock-data__/mockCfServicePlansEmpty.json");
const mockCfBindingsEmpty = require("./__mock-data__/mockCfBindingsEmpty.json");

const mockCfServicePlansUaa = require("./__mock-data__/mockCfServicePlansUaa.json");
const mockCfBindingsUaa = require("./__mock-data__/mockCfBindingsUaa.json");
const mockCfBindingsUaaDetails = require("./__mock-data__/mockCfBindingsUaaDetails.json");

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
// Then a limiter fans out one /v3/service_credential_bindings/{guid}/details per stub
// in the bindings response — the caller passes bindingsDetails (in stub order) when bindings is non-empty.
const mockRawAppInfoRequests = ({
  servicePlans,
  bindings,
  bindingsDetails,
  processes = mockCfProcess,
  routes = mockCfRoutes,
}) => {
  mockRequest.mockReturnValueOnce({ json: () => servicePlans });
  mockRequest.mockReturnValueOnce({ json: () => processes });
  mockRequest.mockReturnValueOnce({ json: () => routes });
  mockRequest.mockReturnValueOnce({ json: () => bindings });
  if (bindingsDetails) {
    for (const details of bindingsDetails) {
      mockRequest.mockReturnValueOnce({ json: () => details });
    }
  }
};

describe("context tests", () => {
  test("fail with an error when bindings are empty", async () => {
    mockStatic.spawnAsync.mockReturnValueOnce(["oauth-token"]);
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockCfConfig);
    mockStatic.tryAccessSync.mockReturnValueOnce(true);
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockRuntimeConfig);
    mockRequest.mockReturnValueOnce({ json: () => mockCfApps });

    const context = await newContext();

    mockRawAppInfoRequests({ servicePlans: mockCfServicePlansEmpty, bindings: mockCfBindingsEmpty });

    await expect(context.getUaaInfo()).rejects.toMatchInlineSnapshot(
      `[Error: could not access required service-bindings for app "uaa-app" services "[{"label":"xsuaa","plan":"application"},{"label":"xsuaa","plan":"broker"}]"]`
    );
  });

  test("resolves uaa binding from xsuaa/application service", async () => {
    mockStatic.spawnAsync.mockReturnValueOnce(["oauth-token"]);
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockCfConfig);
    mockStatic.tryAccessSync.mockReturnValueOnce(true);
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockRuntimeConfig);
    mockRequest.mockReturnValueOnce({ json: () => mockCfApps });

    const context = await newContext();

    mockRawAppInfoRequests({
      servicePlans: mockCfServicePlansUaa,
      bindings: mockCfBindingsUaa,
      bindingsDetails: [mockCfBindingsUaaDetails],
    });

    const uaaInfo = await context.getUaaInfo();
    expect(uaaInfo.cfAppName).toBe("uaa-app");
    expect(uaaInfo.cfBinding).toMatchInlineSnapshot(`
      {
        "createdAt": "2021-01-01T00:00:00Z",
        "credentials": {
          "clientid": "test-clientid",
          "clientsecret": "test-clientsecret",
          "url": "https://test-tenant.authentication.sap.hana.ondemand.com",
          "xsappname": "test-xsappname",
        },
        "id": "binding-uaa",
        "instanceId": "instance-uaa",
        "instanceName": "uaa-instance",
        "offeringId": "offering-xsuaa",
        "offeringName": "xsuaa",
        "planId": "plan-xsuaa-application",
        "planName": "application",
        "updatedAt": "2021-01-02T00:00:00Z",
      }
    `);
    expect(uaaInfo.cfBindings).toHaveLength(1);
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

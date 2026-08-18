"use strict";

const { newContext } = require("../src/context");

jest.mock("../src/shared/logger", () => require("./__mocks/shared/logger"));

const mockStatic = require("../src/shared/static");
jest.mock("../src/shared/static", () => {
  const { safeUnshift, escapeRegExp, indexByKey, parseIntWithFallback } = jest.requireActual("../src/shared/static");
  return {
    safeUnshift,
    escapeRegExp,
    indexByKey,
    parseIntWithFallback,
    sleep: jest.fn(),
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

const { CloudFoundry } = require("../src/shared/cloud-foundry");

const mockCfApps = require("./__mock-data__/mockCfApps.json");
const mockCfAppsPages = require("./__mock-data__/mockCfAppsPages.json");
const mockCfProcess = require("./__mock-data__/mockCfProcess.json");
const mockCfRoutes = require("./__mock-data__/mockCfRoutes.json");

const mockCfServicePlansEmpty = require("./__mock-data__/mockCfServicePlansEmpty.json");
const mockCfBindingsEmpty = require("./__mock-data__/mockCfBindingsEmpty.json");

const mockCfServicePlansUaa = require("./__mock-data__/mockCfServicePlansUaa.json");
const mockCfBindingsUaa = require("./__mock-data__/mockCfBindingsUaa.json");
const mockCfBindingsUaaDetails = require("./__mock-data__/mockCfBindingsUaaDetails.json");

const mockCfAppEnv = require("./__mock-data__/mockCfAppEnv.json");

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
  beforeEach(() => {
    CloudFoundry.resetSingleton();
  });

  test("fail with an error when bindings are empty", async () => {
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockCfConfig);
    mockStatic.tryAccessSync.mockReturnValueOnce(true);
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockRuntimeConfig);

    const context = await newContext();

    mockRequest.mockReturnValueOnce({ json: () => mockCfApps });
    mockRawAppInfoRequests({ servicePlans: mockCfServicePlansEmpty, bindings: mockCfBindingsEmpty });

    await expect(context.getUaaInfo()).rejects.toMatchInlineSnapshot(
      `[Error: could not access required service-bindings for app "uaa-app" services "[{"label":"xsuaa","plan":"application"},{"label":"xsuaa","plan":"broker"}]"]`
    );
  });

  test("resolves uaa binding from xsuaa/application service", async () => {
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockCfConfig);
    mockStatic.tryAccessSync.mockReturnValueOnce(true);
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockRuntimeConfig);

    const context = await newContext();

    mockRequest.mockReturnValueOnce({ json: () => mockCfApps });
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
        "instanceTags": [
          "xsuaa",
        ],
        "instanceType": "managed",
        "offeringId": "offering-xsuaa",
        "offeringName": "xsuaa",
        "planId": "plan-xsuaa-application",
        "planName": "application",
        "updatedAt": "2021-01-02T00:00:00Z",
      }
    `);
    expect(uaaInfo.cfBindings).toHaveLength(1);
  });

  test("getCfEnv fetches the app env endpoint and returns the raw payload", async () => {
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockCfConfig);
    mockStatic.tryAccessSync.mockReturnValueOnce(true);
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockRuntimeConfig);

    const context = await newContext();

    mockRequest.mockReturnValueOnce({ json: () => mockCfApps });
    mockRequest.mockReturnValueOnce({ json: () => mockCfAppEnv });

    const env = await context.getCfEnv("uaa-app");
    expect(env).toBe(mockCfAppEnv);
    expect(mockRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: "https://api.cf.sap.hana.ondemand.com/v3/apps/f84d681e-7123-442f-b8ea-2c747c11e145/env",
      })
    );
  });

  test("getCfEnv inlines VCAP_SERVICES from VCAP_SERVICES_FILE_PATH via cf ssh", async () => {
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockCfConfig);
    mockStatic.tryAccessSync.mockReturnValueOnce(true);
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockRuntimeConfig);

    const context = await newContext();

    mockRequest.mockReturnValueOnce({ json: () => mockCfApps });
    const filePath = "/etc/cf-service-bindings/vcap_services";
    const fileBackedServices = {
      xsuaa: [
        {
          label: "xsuaa",
          plan: "application",
          name: "uaa-instance",
          credentials: { clientid: "file-clientid" },
        },
      ],
    };
    const cfAppEnvWithFilePath = {
      ...mockCfAppEnv,
      system_env_json: { VCAP_SERVICES_FILE_PATH: filePath },
    };

    mockRequest.mockReturnValueOnce({ json: () => cfAppEnvWithFilePath });
    mockStatic.spawnAsync.mockReturnValueOnce([JSON.stringify(fileBackedServices), ""]);

    const env = await context.getCfEnv("uaa-app");
    expect(env.system_env_json.VCAP_SERVICES).toEqual(fileBackedServices);
    expect(mockStatic.spawnAsync).toHaveBeenLastCalledWith(
      "cf",
      ["ssh", "uaa-app", "--command", `cat ${filePath}`],
      expect.any(Object)
    );
  });

  test("getCfEnv rejects an unsafe VCAP_SERVICES_FILE_PATH without invoking cf ssh", async () => {
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockCfConfig);
    mockStatic.tryAccessSync.mockReturnValueOnce(true);
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockRuntimeConfig);

    const context = await newContext();

    mockRequest.mockReturnValueOnce({ json: () => mockCfApps });
    const cfAppEnvWithFilePath = {
      ...mockCfAppEnv,
      system_env_json: { VCAP_SERVICES_FILE_PATH: "/tmp/x; rm -rf ~" },
    };
    mockRequest.mockReturnValueOnce({ json: () => cfAppEnvWithFilePath });

    const sshCallsBefore = mockStatic.spawnAsync.mock.calls.length;
    const err = await context.getCfEnv("uaa-app").catch((e) => e);
    expect(err.message).toMatch(/refusing to read VCAP_SERVICES_FILE_PATH/);
    expect(mockStatic.spawnAsync.mock.calls.length).toBe(sshCallsBefore);
  });

  test("CloudFoundry.getApps follows pagination and merges all pages", async () => {
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockCfConfig);
    mockStatic.tryAccessSync.mockReturnValueOnce(true);
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockRuntimeConfig);

    const context = await newContext();
    expect(context).toBeDefined();

    for (const mockCfAppsPage of mockCfAppsPages) {
      mockRequest.mockReturnValueOnce({ json: () => mockCfAppsPage });
    }

    const cfApps = await CloudFoundry.getSingleton().getApps();
    expect(cfApps.map(({ name }) => name)).toEqual(["uaa-app-1", "uaa-app-2"]);
    expect(mockRequest.mock.calls).toMatchSnapshot();
  });

  test("has reg/sms info", async () => {
    mockStatic.tryReadJsonSync.mockReturnValueOnce(mockCfConfig);
    mockStatic.tryAccessSync.mockReturnValueOnce(true);
    mockStatic.tryReadJsonSync.mockReturnValueOnce({ regAppName: "reg-app" });

    const context = await newContext();

    expect(context.hasRegInfo).toBe(true);
    expect(context.hasSmsInfo).toBe(false);
  });

  describe("getCfBoundApps", () => {
    const newTestContext = async () => {
      mockStatic.tryReadJsonSync.mockReturnValueOnce(mockCfConfig);
      mockStatic.tryAccessSync.mockReturnValueOnce(true);
      mockStatic.tryReadJsonSync.mockReturnValueOnce(mockRuntimeConfig);
      return await newContext();
    };

    test("resolves bound apps against getApps and dedupes by guid", async () => {
      const context = await newTestContext();
      // NOTE: bindings only carry app guids. two reference the same app (dedupe), one references an app absent from
      //   getApps (filtered out). state filtering is left to the caller, so both states are returned here.
      mockRequest.mockReturnValueOnce({
        json: () => ({
          resources: [
            { guid: "binding-0", relationships: { app: { data: { guid: "app-started" } } } },
            { guid: "binding-1", relationships: { app: { data: { guid: "app-started" } } } },
            { guid: "binding-2", relationships: { app: { data: { guid: "app-stopped" } } } },
            { guid: "binding-3", relationships: { app: { data: { guid: "app-unknown" } } } },
          ],
        }),
      });
      mockRequest.mockReturnValueOnce({
        json: () => ({
          resources: [
            { guid: "app-started", name: "app-started-name", state: "STARTED" },
            { guid: "app-stopped", name: "app-stopped-name", state: "STOPPED" },
            { guid: "app-unbound", name: "app-unbound-name", state: "STARTED" },
          ],
        }),
      });

      const apps = await context.getCfBoundApps("svm-instance-id");
      expect(apps).toEqual([
        { guid: "app-started", name: "app-started-name", state: "STARTED" },
        { guid: "app-stopped", name: "app-stopped-name", state: "STOPPED" },
      ]);
      expect(mockRequest).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          url: "https://api.cf.sap.hana.ondemand.com/v3/service_credential_bindings?service_instance_guids=svm-instance-id&type=app",
        })
      );
    });

    test("returns empty when no apps are bound", async () => {
      const context = await newTestContext();
      mockRequest.mockReturnValueOnce({ json: () => ({ resources: [] }) });
      mockRequest.mockReturnValueOnce({
        json: () => ({ resources: [{ guid: "app-unbound", name: "app-unbound-name", state: "STARTED" }] }),
      });

      const apps = await context.getCfBoundApps("svm-instance-id");
      expect(apps).toEqual([]);
    });
  });

  describe("cfRollingRestart", () => {
    const newTestContext = async () => {
      mockStatic.tryReadJsonSync.mockReturnValueOnce(mockCfConfig);
      mockStatic.tryAccessSync.mockReturnValueOnce(true);
      mockStatic.tryReadJsonSync.mockReturnValueOnce(mockRuntimeConfig);
      return await newContext();
    };

    test("creates a rolling deployment and polls until finalized/deployed", async () => {
      const context = await newTestContext();
      mockRequest.mockReturnValueOnce({
        json: () => ({ guid: "deployment-0", status: { value: "ACTIVE", reason: "DEPLOYING" } }),
      });
      mockRequest.mockReturnValueOnce({
        json: () => ({ guid: "deployment-0", status: { value: "ACTIVE", reason: "DEPLOYING" } }),
      });
      mockRequest.mockReturnValueOnce({
        json: () => ({ guid: "deployment-0", status: { value: "FINALIZED", reason: "DEPLOYED" } }),
      });

      const result = await context.cfRollingRestart({ guid: "app-guid-0", name: "app-name-0" });
      expect(result.status).toEqual({ value: "FINALIZED", reason: "DEPLOYED" });
      expect(mockRequest).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          url: "https://api.cf.sap.hana.ondemand.com/v3/deployments",
          method: "POST",
          body: JSON.stringify({
            relationships: { app: { data: { guid: "app-guid-0" } } },
            strategy: "rolling",
          }),
        })
      );
      expect(mockRequest).toHaveBeenLastCalledWith(
        expect.objectContaining({
          url: "https://api.cf.sap.hana.ondemand.com/v3/deployments/deployment-0",
        })
      );
    });

    test("throws when the deployment finalizes with a non-deployed reason", async () => {
      const context = await newTestContext();
      mockRequest.mockReturnValueOnce({
        json: () => ({ guid: "deployment-0", status: { value: "FINALIZED", reason: "CANCELED" } }),
      });

      await expect(context.cfRollingRestart({ guid: "app-guid-0", name: "app-name-0" })).rejects.toMatchInlineSnapshot(
        `[Error: rolling restart of app "app-name-0" finished with reason CANCELED]`
      );
    });
  });
});

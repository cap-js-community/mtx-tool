"use strict";

const mockRequest = require("../src/shared/request");
jest.mock("../src/shared/request", () => ({
  request: jest.fn(),
}));

jest.mock("../src/shared/static", () => {
  const staticLib = jest.requireActual("../src/shared/static");
  return {
    ...staticLib,
    sleep: jest.fn(),
  };
});

const { Logger: MockLogger } = require("../src/shared/logger");
const mockLogger = MockLogger.getInstance();
jest.mock("../src/shared/logger", () => require("./__mocks/shared/logger"));

const hdi = require("../src/submodules/hanaManagement");
const { outputFromLogger } = require("./util/static");

const mockCredentials = {
  certurl: "uaa-cert-url",
  clientid: "clientid",
  key: "rsa-key",
  sm_url: "service-manager-url",
  url: "uaa-url",
  xsappname: "xsappname",
};

const mockContext = {
  getHdiInfo() {
    return { cfService: { credentials: mockCredentials } };
  },
  getCachedUaaToken() {
    return "token";
  },
  getCachedUaaTokenFromCredentials() {
    return "token";
  },
};

const mockInstanceFactory = (i) => ({
  id: `instance-id-${i}`,
  ready: true,
  name: `instance-name-${i}`,
  service_plan_id: "instance-service-plan-id",
  usable: true,
  labels: {
    tenant_id: [`tenant-id-${i}`],
  },
});

const mockBindingFactory = (i) => ({
  id: `binding-id-${i}`,
  ready: true,
  name: `binding-name-${i}`,
  service_instance_id: "service-instance-id",
  usable: true,
  labels: {
    tenant_id: [`tenant-id-${i}`],
  },
});

describe("hdi tests", () => {
  test("enable native tenant already enabled", async () => {
    const n = 4;

    mockRequest.request.mockReturnValueOnce({
      async json() {
        return { items: [{ id: "service-plan-id" }] };
      },
    });
    mockRequest.request.mockReturnValueOnce({
      async json() {
        return { items: Array.from({ length: n }).map((_, i) => mockInstanceFactory(i)) };
      },
    });
    mockRequest.request.mockReturnValueOnce({
      async json() {
        return { items: Array.from({ length: n }).map((_, i) => mockBindingFactory(i)) };
      },
    });

    // check if already migrated
    for (let i = 0; i < n; i++) {
      mockRequest.request.mockReturnValueOnce({
        async json() {
          return { enableTenant: i === 0 };
        },
      });
    }

    // run migration
    for (let i = 0; i + 1 < n; i++) {
      mockRequest.request.mockReturnValueOnce({
        async json() {
          return { last_operation: { state: "succeeded" } };
        },
      });
    }

    // re-create bindings
    for (let i = 0; i + 1 < n; i++) {
      mockRequest.request.mockReturnValueOnce({
        async json() {},
      });
    }

    await expect(hdi.hdiEnableNative(mockContext, [])).resolves.toBeUndefined();
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "skipping 1 already enabled tenants
      enabling 3 tenants tenant-id-1, tenant-id-2, tenant-id-3
      deleting 0 bindings to protect enablement
      created 1 missing binding for tenant tenant-id-1
      created 1 missing binding for tenant tenant-id-2
      created 1 missing binding for tenant tenant-id-3"
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });
});

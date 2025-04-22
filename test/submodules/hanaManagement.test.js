"use strict";

const mockRequest = require("../../src/shared/request");
jest.mock("../../src/shared/request", () => ({
  request: jest.fn(),
}));

const mockStatic = require("../../src/shared/static");
jest.mock("../../src/shared/static", () => {
  const staticLib = jest.requireActual("../../src/shared/static");
  return {
    ...staticLib,
    sleep: jest.fn(),
    isPortFree: jest.fn(),
  };
});

const { Logger: MockLogger } = require("../../src/shared/logger");
const mockLogger = MockLogger.getInstance();
jest.mock("../../src/shared/logger", () => require("../__mocks/shared/logger"));

const hdi = require("../../src/submodules/hanaManagement");
const { outputFromLogger, collectRequestMockCalls } = require("../test-util/static");

const testTenantId = "5ecc7413-2b7e-414a-9496-ad4a61f6cccf";

const mockCredentials = {
  certurl: "uaa-cert-url",
  clientid: "clientid",
  key: "rsa-key",
  sm_url: "service-manager-url",
  url: "uaa-url",
  xsappname: "xsappname",
};

const mockCfSsh = jest.fn();

const mockContext = {
  getHdiInfo() {
    return { cfSsh: mockCfSsh, cfService: { credentials: mockCredentials } };
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
    service_plan_id: [`service-plan-id-${i}`],
  },
});

describe("hdi tests", () => {
  afterEach(() => {
    hdi._._reset();
  });

  test("enable native tenant already enabled", async () => {
    const n = 4;

    mockRequest.request.mockReturnValueOnce({
      async json() {
        return { items: [{ id: "service-offering-id" }] };
      },
    });
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
      triggering 3 changes
      created 1 missing binding for tenant tenant-id-1
      created 1 missing binding for tenant tenant-id-2
      created 1 missing binding for tenant tenant-id-3"
    `);
    expect(collectRequestMockCalls(mockRequest.request)).toMatchInlineSnapshot(`
      [
        "GET service-manager-url /v1/service_offerings {"fieldQuery":"name eq 'hana'"}",
        "GET service-manager-url /v1/service_plans {"fieldQuery":"service_offering_id eq 'service-offering-id' and name eq 'hdi-shared'"}",
        "GET service-manager-url /v1/service_instances {"fieldQuery":"service_plan_id eq 'service-plan-id'"}",
        "GET service-manager-url /v1/service_bindings {"labelQuery":"service_plan_id eq 'service-plan-id'"}",
        "GET service-manager-url /v1/service_instances/instance-id-0/parameters",
        "GET service-manager-url /v1/service_instances/instance-id-1/parameters",
        "GET service-manager-url /v1/service_instances/instance-id-2/parameters",
        "GET service-manager-url /v1/service_instances/instance-id-3/parameters",
        "PATCH service-manager-url /v1/service_instances/instance-id-1 {"async":false}",
        "PATCH service-manager-url /v1/service_instances/instance-id-2 {"async":false}",
        "PATCH service-manager-url /v1/service_instances/instance-id-3 {"async":false}",
        "POST service-manager-url /v1/service_bindings {"async":false}",
        "POST service-manager-url /v1/service_bindings {"async":false}",
        "POST service-manager-url /v1/service_bindings {"async":false}",
      ]
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("hdi tunnel", async () => {
    mockRequest.request.mockReturnValueOnce({
      async json() {
        return { items: [{ id: "service-offering-id" }] };
      },
    });
    mockRequest.request.mockReturnValueOnce({
      async json() {
        return { items: [{ id: "service-plan-id" }] };
      },
    });
    mockRequest.request.mockReturnValueOnce({
      async json() {
        return {
          items: [
            {
              credentials: {
                host: "host",
                port: "port",
                url: "jdbc:sap://host:port",
                user: "user",
                password: "password",
                schema: "schema",
                hdi_user: "hdi-user",
                hdi_password: "hdi-password",
              },
              labels: {
                tenant_id: [testTenantId],
              },
            },
          ],
        };
      },
    });
    mockStatic.isPortFree.mockReturnValueOnce(true);
    mockCfSsh.mockReturnValueOnce();

    await expect(hdi.hdiTunnelTenant(mockContext, [testTenantId], [false])).resolves.toBeUndefined();

    expect(mockRequest.request).toHaveBeenCalledTimes(3);
    expect(mockStatic.isPortFree).toHaveBeenCalledTimes(1);
    expect(mockCfSsh).toHaveBeenCalledTimes(1);
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "
      runtime
      localUrl   jdbc:sap://localhost:30015
      remoteUrl  jdbc:sap://host:port      
      user       user                      
      password   *** show with --reveal ***

      designtime
      localUrl   jdbc:sap://localhost:30015
      remoteUrl  jdbc:sap://host:port      
      user       hdi-user                  
      password   *** show with --reveal ***
      "
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("hdi rebind tenant", async () => {
    mockRequest.request.mockReturnValueOnce({
      async json() {
        return { items: [{ id: "service-offering-id" }] };
      },
    });
    mockRequest.request.mockReturnValueOnce({
      async json() {
        return { items: [{ id: "service-plan-id" }] };
      },
    });
    mockRequest.request.mockReturnValueOnce({
      async json() {
        return { items: [mockBindingFactory(0)] };
      },
    });
    mockRequest.request.mockReturnValueOnce();
    mockRequest.request.mockReturnValueOnce();

    expect(await hdi.hdiRebindTenant(mockContext, [testTenantId])).toBeUndefined();
    expect(collectRequestMockCalls(mockRequest.request)).toMatchInlineSnapshot(`
      [
        "GET service-manager-url /v1/service_offerings {"fieldQuery":"name eq 'hana'"}",
        "GET service-manager-url /v1/service_plans {"fieldQuery":"service_offering_id eq 'service-offering-id' and name eq 'hdi-shared'"}",
        "GET service-manager-url /v1/service_bindings {"labelQuery":"service_plan_id eq 'service-plan-id' and tenant_id eq '5ecc7413-2b7e-414a-9496-ad4a61f6cccf'"}",
        "POST service-manager-url /v1/service_bindings {"async":false}",
        "DELETE service-manager-url /v1/service_bindings/binding-id-0 {"async":false}",
      ]
    `);
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`""`);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("hdi rebind all", async () => {
    const n = 2;
    mockRequest.request.mockReturnValueOnce({
      async json() {
        return { items: [{ id: "service-offering-id" }] };
      },
    });
    mockRequest.request.mockReturnValueOnce({
      async json() {
        return { items: [{ id: "service-plan-id" }] };
      },
    });
    mockRequest.request.mockReturnValueOnce({
      async json() {
        return { items: Array.from({ length: n }).map((_, i) => mockBindingFactory(i)) };
      },
    });
    for (let i = 0; i < n; i++) {
      mockRequest.request.mockReturnValueOnce();
      mockRequest.request.mockReturnValueOnce();
    }

    expect(await hdi.hdiRebindAll(mockContext, [])).toBeUndefined();
    expect(collectRequestMockCalls(mockRequest.request)).toMatchInlineSnapshot(`
      [
        "GET service-manager-url /v1/service_offerings {"fieldQuery":"name eq 'hana'"}",
        "GET service-manager-url /v1/service_plans {"fieldQuery":"service_offering_id eq 'service-offering-id' and name eq 'hdi-shared'"}",
        "GET service-manager-url /v1/service_bindings {"labelQuery":"service_plan_id eq 'service-plan-id'"}",
        "POST service-manager-url /v1/service_bindings {"async":false}",
        "POST service-manager-url /v1/service_bindings {"async":false}",
        "DELETE service-manager-url /v1/service_bindings/binding-id-0 {"async":false}",
        "DELETE service-manager-url /v1/service_bindings/binding-id-1 {"async":false}",
      ]
    `);
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(
      `"rebinding tenants tenant-id-0, tenant-id-1"`
    );
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("hdi delete tenant", async () => {
    mockRequest.request.mockReturnValueOnce({
      async json() {
        return { items: [{ id: "service-offering-id" }] };
      },
    });
    mockRequest.request.mockReturnValueOnce({
      async json() {
        return { items: [{ id: "service-plan-id" }] };
      },
    });
    mockRequest.request.mockReturnValueOnce({
      async json() {
        return { items: [mockBindingFactory(0)] };
      },
    });
    mockRequest.request.mockReturnValueOnce();
    mockRequest.request.mockReturnValueOnce({
      async json() {
        return { items: [mockInstanceFactory(0)] };
      },
    });
    mockRequest.request.mockReturnValueOnce();

    expect(await hdi.hdiDeleteTenant(mockContext, [testTenantId])).toBeUndefined();
    expect(collectRequestMockCalls(mockRequest.request)).toMatchInlineSnapshot(`
      [
        "GET service-manager-url /v1/service_offerings {"fieldQuery":"name eq 'hana'"}",
        "GET service-manager-url /v1/service_plans {"fieldQuery":"service_offering_id eq 'service-offering-id' and name eq 'hdi-shared'"}",
        "GET service-manager-url /v1/service_bindings {"labelQuery":"service_plan_id eq 'service-plan-id' and tenant_id eq '5ecc7413-2b7e-414a-9496-ad4a61f6cccf'"}",
        "DELETE service-manager-url /v1/service_bindings/binding-id-0 {"async":false}",
        "GET service-manager-url /v1/service_instances {"fieldQuery":"service_plan_id eq 'service-plan-id'","labelQuery":"tenant_id eq '5ecc7413-2b7e-414a-9496-ad4a61f6cccf'"}",
        "DELETE service-manager-url /v1/service_instances/instance-id-0 {"async":false}",
      ]
    `);
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`""`);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("hdi delete all", async () => {
    const n = 2;
    mockRequest.request.mockReturnValueOnce({
      async json() {
        return { items: [{ id: "service-offering-id" }] };
      },
    });
    mockRequest.request.mockReturnValueOnce({
      async json() {
        return { items: [{ id: "service-plan-id" }] };
      },
    });
    mockRequest.request.mockReturnValueOnce({
      async json() {
        return { items: Array.from({ length: n }).map((_, i) => mockBindingFactory(i)) };
      },
    });
    for (let i = 0; i < n; i++) {
      mockRequest.request.mockReturnValueOnce();
    }
    mockRequest.request.mockReturnValueOnce({
      async json() {
        return { items: Array.from({ length: n }).map((_, i) => mockInstanceFactory(i)) };
      },
    });
    for (let i = 0; i < n; i++) {
      mockRequest.request.mockReturnValueOnce();
    }

    expect(await hdi.hdiDeleteAll(mockContext)).toBeUndefined();
    expect(collectRequestMockCalls(mockRequest.request)).toMatchInlineSnapshot(`
      [
        "GET service-manager-url /v1/service_offerings {"fieldQuery":"name eq 'hana'"}",
        "GET service-manager-url /v1/service_plans {"fieldQuery":"service_offering_id eq 'service-offering-id' and name eq 'hdi-shared'"}",
        "GET service-manager-url /v1/service_bindings {"labelQuery":"service_plan_id eq 'service-plan-id'"}",
        "DELETE service-manager-url /v1/service_bindings/binding-id-0 {"async":false}",
        "DELETE service-manager-url /v1/service_bindings/binding-id-1 {"async":false}",
        "GET service-manager-url /v1/service_instances {"fieldQuery":"service_plan_id eq 'service-plan-id'"}",
        "DELETE service-manager-url /v1/service_instances/instance-id-0 {"async":false}",
        "DELETE service-manager-url /v1/service_instances/instance-id-1 {"async":false}",
      ]
    `);
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`""`);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });
});

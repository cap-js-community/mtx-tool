"use strict";

const mockRequest = require("../../src/shared/request");
jest.mock("../../src/shared/request", () => {
  const { RETRY_MODE } = jest.requireActual("../../src/shared/request");
  return {
    RETRY_MODE,
    request: jest.fn(),
  };
});

const mockStatic = require("../../src/shared/static");
jest.mock("../../src/shared/static", () => {
  const staticLib = jest.requireActual("../../src/shared/static");
  return {
    ...staticLib,
    sleep: jest.fn(),
  };
});

const { Logger: MockLogger } = require("../../src/shared/logger");
const mockLogger = MockLogger.getInstance();
jest.mock("../../src/shared/logger", () => require("../__mocks/shared/logger"));

const svm = require("../../src/submodules/serviceManager");
const { outputFromLogger, collectRequestMockCalls } = require("../test-util/static");

const testTenantId = "5ecc7413-2b7e-414a-9496-ad4a61f6cccf";
const testServicePlanName = "myOffering:myPlan";

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

const mockOfferingFactory = (i) => ({
  id: `offering-id-${i}`,
  name: `offering-name-${i}`,
});

const mockPlanFactory = (i) => ({
  id: `plan-id-${i}`,
  service_offering_id: `offering-id-${i}`,
  name: `plan-name-${i}`,
});

const mockInstanceFactory = (i) => ({
  id: `instance-id-${i}`,
  ready: true,
  name: `instance-name-${i}`,
  service_plan_id: `plan-id-${i % 2}`,
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

describe("svm tests", () => {
  afterEach(() => {
    svm._._reset();
  });

  test("svm repair bindings", async () => {
    mockRequest.request.mockReturnValueOnce({
      async json() {
        return { items: Array.from({ length: 2 }).map((_, i) => mockOfferingFactory(i)) };
      },
    });
    mockRequest.request.mockReturnValueOnce({
      async json() {
        return { items: Array.from({ length: 2 }).map((_, i) => mockPlanFactory(i)) };
      },
    });
    mockRequest.request.mockReturnValueOnce({
      async json() {
        return { items: Array.from({ length: 3 }).map((_, i) => mockInstanceFactory(i)) };
      },
    });
    mockRequest.request.mockReturnValueOnce({
      async json() {
        return { items: [mockBindingFactory(0)] };
      },
    });

    mockRequest.request.mockReturnValueOnce();
    mockRequest.request.mockReturnValueOnce();
    mockRequest.request.mockReturnValueOnce();
    mockRequest.request.mockReturnValueOnce();

    expect(await svm.serviceManagerRepairBindings(mockContext, [testServicePlanName], [])).toBeUndefined();
    expect(collectRequestMockCalls(mockRequest.request)).toMatchInlineSnapshot();
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot();
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

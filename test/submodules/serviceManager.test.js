"use strict";

const mockRequest = require("../../src/shared/request");
jest.mock("../../src/shared/request", () => {
  const { RETRY_MODE } = jest.requireActual("../../src/shared/request");
  return {
    RETRY_MODE,
    request: jest.fn(),
  };
});

const { Logger: MockLogger } = require("../../src/shared/logger");
const mockLogger = MockLogger.getInstance();
jest.mock("../../src/shared/logger", () => require("../__mocks/shared/logger"));

const svm = require("../../src/submodules/serviceManager");
const { outputFromLogger, collectRequestMockCalls } = require("../test-util/static");

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

const testServicePlanName = "myOffering:myPlan";
const testServicePlanId = "plan-id-0";
const testTenantId = "tenant-id-1";

const mockOfferingResponse = {
  json: () => ({
    items: [
      { id: `offering-id-0`, name: `myOffering` },
      { id: `offering-id-1`, name: `otherOffering` },
    ],
  }),
};
const mockFilteredOfferingResponse = {
  json: () => ({
    items: [{ id: `offering-id-0`, name: `myOffering` }],
  }),
};
const mockPlanResponse = {
  json: () => ({
    items: [
      { id: `plan-id-0`, service_offering_id: `offering-id-0`, name: `myPlan` },
      { id: `plan-id-1`, service_offering_id: `offering-id-1`, name: `otherPlan` },
    ],
  }),
};
const mockFilteredPlanResponse = {
  json: () => ({
    items: [{ id: `plan-id-0`, service_offering_id: `offering-id-0`, name: `myPlan` }],
  }),
};

const mockInstanceFactory = (i) => ({
  id: `instance-id-${i}`,
  ready: true,
  name: `instance-name-${i}`,
  service_plan_id: `plan-id-${i % 2}`,
  usable: true,
  labels: {
    tenant_id: [`tenant-id-${Math.floor(i / 2)}`],
  },
});
const mockInstanceResponse = (n, { isPlanFiltered = false, isTenantFiltered = false } = {}) => ({
  json: () => ({
    items: Array.from({ length: n })
      .map((_, i) => mockInstanceFactory(i))
      .filter((a) => !isPlanFiltered || a.service_plan_id === testServicePlanId)
      .filter((a) => !isTenantFiltered || a.labels.tenant_id[0] === testTenantId),
  }),
});

const mockBindingFactory = (i) => ({
  id: `binding-id-${i}`,
  service_instance_id: `instance-id-${i}`,
  ready: true,
  name: `binding-name-${i}`,
  usable: true,
  labels: {
    tenant_id: [`tenant-id-${i}`],
  },
});

describe("svm tests", () => {
  afterEach(() => {
    svm._._reset();
  });

  test("svm repair bindings all-services", async () => {
    mockRequest.request.mockReturnValueOnce(mockOfferingResponse);
    mockRequest.request.mockReturnValueOnce(mockPlanResponse);
    mockRequest.request.mockReturnValueOnce(mockInstanceResponse(6));
    mockRequest.request.mockReturnValueOnce({
      json: () => ({
        items: [mockBindingFactory(2), mockBindingFactory(5)],
      }),
    });

    expect(await svm.serviceManagerRepairBindings(mockContext, ["all-services"], [])).toBeUndefined();
    expect(collectRequestMockCalls(mockRequest.request)).toMatchInlineSnapshot(`
      [
        "GET service-manager-url /v1/service_offerings",
        "GET service-manager-url /v1/service_plans",
        "GET service-manager-url /v1/service_instances",
        "GET service-manager-url /v1/service_bindings",
        "POST service-manager-url /v1/service_bindings {"async":false}",
        "POST service-manager-url /v1/service_bindings {"async":false}",
        "POST service-manager-url /v1/service_bindings {"async":false}",
        "POST service-manager-url /v1/service_bindings {"async":false}",
      ]
    `);
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "triggering 4 changes
      created 1 missing binding for tenant tenant-id-0 plan myOffering:myPlan
      created 1 missing binding for tenant tenant-id-0 plan otherOffering:otherPlan
      created 1 missing binding for tenant tenant-id-1 plan otherOffering:otherPlan
      created 1 missing binding for tenant tenant-id-2 plan myOffering:myPlan"
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("svm repair bindings myPlan", async () => {
    mockRequest.request.mockReturnValueOnce(mockFilteredOfferingResponse);
    mockRequest.request.mockReturnValueOnce(mockFilteredPlanResponse);
    mockRequest.request.mockReturnValueOnce(mockInstanceResponse(6, { isPlanFiltered: true }));
    mockRequest.request.mockReturnValueOnce({
      json: () => ({
        items: [mockBindingFactory(2)],
      }),
    });

    expect(await svm.serviceManagerRepairBindings(mockContext, [testServicePlanName], [])).toBeUndefined();
    expect(collectRequestMockCalls(mockRequest.request)).toMatchInlineSnapshot(`
      [
        "GET service-manager-url /v1/service_offerings {"fieldQuery":"name eq 'myOffering'"}",
        "GET service-manager-url /v1/service_plans {"fieldQuery":"service_offering_id eq 'offering-id-0' and name eq 'myPlan'"}",
        "GET service-manager-url /v1/service_instances {"fieldQuery":"service_plan_id eq 'plan-id-0'"}",
        "GET service-manager-url /v1/service_bindings",
        "POST service-manager-url /v1/service_bindings {"async":false}",
        "POST service-manager-url /v1/service_bindings {"async":false}",
      ]
    `);
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "triggering 2 changes
      created 1 missing binding for tenant tenant-id-0 plan myOffering:myPlan
      created 1 missing binding for tenant tenant-id-2 plan myOffering:myPlan"
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("hdi delete bindings all-services all-tenants", async () => {
    mockRequest.request.mockReturnValueOnce(mockInstanceResponse(6));
    mockRequest.request.mockReturnValueOnce({
      json: () => ({
        items: Array.from({ length: 6 }).map((_, i) => mockBindingFactory(i)),
      }),
    });

    expect(await svm.serviceManagerDeleteBindings(mockContext, ["all-services", "all-tenants"])).toBeUndefined();
    expect(collectRequestMockCalls(mockRequest.request)).toMatchInlineSnapshot(`
      [
        "GET service-manager-url /v1/service_instances",
        "GET service-manager-url /v1/service_bindings",
        "DELETE service-manager-url /v1/service_bindings/binding-id-0 {"async":false}",
        "DELETE service-manager-url /v1/service_bindings/binding-id-1 {"async":false}",
        "DELETE service-manager-url /v1/service_bindings/binding-id-2 {"async":false}",
        "DELETE service-manager-url /v1/service_bindings/binding-id-3 {"async":false}",
        "DELETE service-manager-url /v1/service_bindings/binding-id-4 {"async":false}",
        "DELETE service-manager-url /v1/service_bindings/binding-id-5 {"async":false}",
      ]
    `);
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`"deleted 6 bindings"`);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("hdi delete bindings myPlan all-tenants", async () => {
    mockRequest.request.mockReturnValueOnce(mockFilteredOfferingResponse);
    mockRequest.request.mockReturnValueOnce(mockFilteredPlanResponse);
    mockRequest.request.mockReturnValueOnce(mockInstanceResponse(6, { isPlanFiltered: true }));
    mockRequest.request.mockReturnValueOnce({
      json: () => ({
        items: Array.from({ length: 6 }).map((_, i) => mockBindingFactory(i)),
      }),
    });

    expect(await svm.serviceManagerDeleteBindings(mockContext, [testServicePlanName, "all-tenants"])).toBeUndefined();
    expect(collectRequestMockCalls(mockRequest.request)).toMatchInlineSnapshot(`
      [
        "GET service-manager-url /v1/service_offerings {"fieldQuery":"name eq 'myOffering'"}",
        "GET service-manager-url /v1/service_plans {"fieldQuery":"service_offering_id eq 'offering-id-0' and name eq 'myPlan'"}",
        "GET service-manager-url /v1/service_instances {"fieldQuery":"service_plan_id eq 'plan-id-0'"}",
        "GET service-manager-url /v1/service_bindings",
        "DELETE service-manager-url /v1/service_bindings/binding-id-0 {"async":false}",
        "DELETE service-manager-url /v1/service_bindings/binding-id-2 {"async":false}",
        "DELETE service-manager-url /v1/service_bindings/binding-id-4 {"async":false}",
      ]
    `);
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`"deleted 3 bindings"`);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("hdi delete bindings all-services myTenant", async () => {
    mockRequest.request.mockReturnValueOnce(mockInstanceResponse(6, { isTenantFiltered: true }));
    mockRequest.request.mockReturnValueOnce({
      json: () => ({
        items: Array.from({ length: 6 }).map((_, i) => mockBindingFactory(i)),
      }),
    });

    expect(await svm.serviceManagerDeleteBindings(mockContext, ["all-services", testTenantId])).toBeUndefined();
    expect(collectRequestMockCalls(mockRequest.request)).toMatchInlineSnapshot(`
      [
        "GET service-manager-url /v1/service_instances {"labelQuery":"tenant_id eq 'tenant-id-1'"}",
        "GET service-manager-url /v1/service_bindings {"labelQuery":"tenant_id eq 'tenant-id-1'"}",
        "DELETE service-manager-url /v1/service_bindings/binding-id-2 {"async":false}",
        "DELETE service-manager-url /v1/service_bindings/binding-id-3 {"async":false}",
      ]
    `);
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`"deleted 2 bindings"`);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("hdi delete instances and bindings all-services all-tenants", async () => {
    mockRequest.request.mockReturnValueOnce(mockInstanceResponse(6));
    mockRequest.request.mockReturnValueOnce({
      json: () => ({
        items: Array.from({ length: 6 }).map((_, i) => mockBindingFactory(i)),
      }),
    });

    expect(
      await svm.serviceManagerDeleteInstancesAndBindings(mockContext, ["all-services", "all-tenants"])
    ).toBeUndefined();
    expect(collectRequestMockCalls(mockRequest.request)).toMatchInlineSnapshot(`
      [
        "GET service-manager-url /v1/service_instances",
        "GET service-manager-url /v1/service_bindings",
        "DELETE service-manager-url /v1/service_bindings/binding-id-0 {"async":false}",
        "DELETE service-manager-url /v1/service_bindings/binding-id-1 {"async":false}",
        "DELETE service-manager-url /v1/service_bindings/binding-id-2 {"async":false}",
        "DELETE service-manager-url /v1/service_bindings/binding-id-3 {"async":false}",
        "DELETE service-manager-url /v1/service_bindings/binding-id-4 {"async":false}",
        "DELETE service-manager-url /v1/service_bindings/binding-id-5 {"async":false}",
        "DELETE service-manager-url /v1/service_instances/instance-id-0 {"async":false}",
        "DELETE service-manager-url /v1/service_instances/instance-id-1 {"async":false}",
        "DELETE service-manager-url /v1/service_instances/instance-id-2 {"async":false}",
        "DELETE service-manager-url /v1/service_instances/instance-id-3 {"async":false}",
        "DELETE service-manager-url /v1/service_instances/instance-id-4 {"async":false}",
        "DELETE service-manager-url /v1/service_instances/instance-id-5 {"async":false}",
      ]
    `);
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "deleted 6 bindings
      deleted 6 instances"
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("hdi delete instances and bindings myPlan all-tenants", async () => {
    mockRequest.request.mockReturnValueOnce(mockFilteredOfferingResponse);
    mockRequest.request.mockReturnValueOnce(mockFilteredPlanResponse);
    mockRequest.request.mockReturnValueOnce(mockInstanceResponse(6, { isPlanFiltered: true }));
    mockRequest.request.mockReturnValueOnce({
      json: () => ({
        items: Array.from({ length: 6 }).map((_, i) => mockBindingFactory(i)),
      }),
    });

    expect(
      await svm.serviceManagerDeleteInstancesAndBindings(mockContext, [testServicePlanName, "all-tenants"])
    ).toBeUndefined();
    expect(collectRequestMockCalls(mockRequest.request)).toMatchInlineSnapshot(`
      [
        "GET service-manager-url /v1/service_offerings {"fieldQuery":"name eq 'myOffering'"}",
        "GET service-manager-url /v1/service_plans {"fieldQuery":"service_offering_id eq 'offering-id-0' and name eq 'myPlan'"}",
        "GET service-manager-url /v1/service_instances {"fieldQuery":"service_plan_id eq 'plan-id-0'"}",
        "GET service-manager-url /v1/service_bindings",
        "DELETE service-manager-url /v1/service_bindings/binding-id-0 {"async":false}",
        "DELETE service-manager-url /v1/service_bindings/binding-id-2 {"async":false}",
        "DELETE service-manager-url /v1/service_bindings/binding-id-4 {"async":false}",
        "DELETE service-manager-url /v1/service_instances/instance-id-0 {"async":false}",
        "DELETE service-manager-url /v1/service_instances/instance-id-2 {"async":false}",
        "DELETE service-manager-url /v1/service_instances/instance-id-4 {"async":false}",
      ]
    `);
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "deleted 3 bindings
      deleted 3 instances"
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("hdi delete instances and bindings all-services myTenant", async () => {
    mockRequest.request.mockReturnValueOnce(mockInstanceResponse(6, { isTenantFiltered: true }));
    mockRequest.request.mockReturnValueOnce({
      json: () => ({
        items: Array.from({ length: 6 }).map((_, i) => mockBindingFactory(i)),
      }),
    });

    expect(
      await svm.serviceManagerDeleteInstancesAndBindings(mockContext, ["all-services", testTenantId])
    ).toBeUndefined();
    expect(collectRequestMockCalls(mockRequest.request)).toMatchInlineSnapshot(`
      [
        "GET service-manager-url /v1/service_instances {"labelQuery":"tenant_id eq 'tenant-id-1'"}",
        "GET service-manager-url /v1/service_bindings {"labelQuery":"tenant_id eq 'tenant-id-1'"}",
        "DELETE service-manager-url /v1/service_bindings/binding-id-2 {"async":false}",
        "DELETE service-manager-url /v1/service_bindings/binding-id-3 {"async":false}",
        "DELETE service-manager-url /v1/service_instances/instance-id-2 {"async":false}",
        "DELETE service-manager-url /v1/service_instances/instance-id-3 {"async":false}",
      ]
    `);
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "deleted 2 bindings
      deleted 2 instances"
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });
});

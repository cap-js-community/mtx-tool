"use strict";

const packageInfo = require("../../package.json");
const { resetMakeOneTime } = require("../../src/shared/execution-control");
const mockRequest = require("../../src/shared/request");
jest.mock("../../src/shared/request", () => ({
  request: jest.fn(),
}));
// NOTE: default fallback — POST/DELETE return 202 with Location header pointing to a succeeded operation
mockRequest.request.mockImplementation(({ method, pathname }) => {
  if (method === "POST" || method === "DELETE") {
    return {
      status: 202,
      headers: new Headers([["location", `${pathname}/operations/op-id`]]),
      json: () => ({}),
    };
  }
  if (pathname?.includes("/operations/")) {
    return { headers: new Headers(), json: () => ({ state: "succeeded" }) };
  }
  return mockItemsResponse([]);
});

const { Logger: MockLogger } = require("../../src/shared/logger");
const mockLogger = MockLogger.getInstance();
jest.mock("../../src/shared/logger", () => require("../__mocks/shared/logger"));

jest.mock("../../src/shared/static", () => ({
  ...jest.requireActual("../../src/shared/static"),
  sleep: jest.fn(),
}));

const svm = require("../../src/submodules/serviceManager");
const { outputFromLogger, collectRequestMockCalls } = require("../test-util/static");

const collectRequestMockCallsStable = (...args) =>
  collectRequestMockCalls(...args).map((a) => a.replace(/"name":"[a-z\d]{32}"/gi, '"name":"xxx"'));

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
    return { cfSsh: mockCfSsh, cfBinding: { credentials: mockCredentials } };
  },
  getCachedUaaTokenFromCredentials() {
    return "token";
  },
};

const testServicePlanName = "myOffering:myPlan";
const testServicePlanId = "plan-id-0";
const testTenantId = "tenant-id-1";

const mockItemsResponse = (items) => ({ headers: new Headers(), json: () => ({ items }) });

const mockOfferingResponse = mockItemsResponse([
  { id: `offering-id-0`, name: `myOffering` },
  { id: `offering-id-1`, name: `otherOffering` },
]);
const mockFilteredOfferingResponse = mockItemsResponse([{ id: `offering-id-0`, name: `myOffering` }]);
const mockPlanResponse = mockItemsResponse([
  { id: `plan-id-0`, service_offering_id: `offering-id-0`, name: `myPlan` },
  { id: `plan-id-1`, service_offering_id: `offering-id-1`, name: `otherPlan` },
]);
const mockFilteredPlanResponse = mockItemsResponse([
  { id: `plan-id-0`, service_offering_id: `offering-id-0`, name: `myPlan` },
]);

const testHanaContainerPlanName = "hana:hdi-shared";
const mockFilteredHanaContainerOfferingResponse = mockItemsResponse([{ id: `offering-id-0`, name: `hana` }]);
const mockFilteredHanaContainerPlanResponse = mockItemsResponse([
  { id: `plan-id-0`, service_offering_id: `offering-id-0`, name: `hdi-shared` },
]);

const mockInstanceFactory = (i) => ({
  id: `instance-id-${i}`,
  name: `instance-name-${i}`,
  service_plan_id: `plan-id-${i % 2}`,
  usable: true,
  labels: {
    container_id: [`container-id-${i}`],
    subaccount_id: [`subaccount-id-${i}`],
    instance_id: [`instance-id-${i}`],
    tenant_id: [`tenant-id-${Math.floor(i / 2)}`],
  },
});
const mockInstanceResponse = (n, { isPlanFiltered = false, isTenantFiltered = false } = {}) =>
  mockItemsResponse(
    Array.from({ length: n })
      .map((_, i) => mockInstanceFactory(i))
      .filter((a) => !isPlanFiltered || a.service_plan_id === testServicePlanId)
      .filter((a) => !isTenantFiltered || a.labels.tenant_id[0] === testTenantId)
  );

const mockBindingFactory = (i) => ({
  id: `binding-id-${i}`,
  service_instance_id: `instance-id-${i}`,
  name: `binding-name-${i}`,
  last_operation: { state: "succeeded" },
  labels: {
    container_id: [`container-id-${i}`],
    subaccount_id: [`subaccount-id-${i}`],
  },
});

describe("svm tests", () => {
  afterEach(() => {
    resetMakeOneTime(svm._._getServiceManager);
    mockRequest.request.mockClear();
  });

  describe("svm basics", () => {
    test("client headers", async () => {
      mockRequest.request.mockReturnValueOnce(mockOfferingResponse);
      mockRequest.request.mockReturnValueOnce(mockPlanResponse);
      mockRequest.request.mockReturnValueOnce(mockInstanceResponse(6));
      mockRequest.request.mockReturnValueOnce(mockItemsResponse([mockBindingFactory(2), mockBindingFactory(5)]));

      await expect(svm.serviceManagerList(mockContext, [], [false, false])).resolves.toBeDefined();

      expect(mockRequest.request.mock.calls).toMatchObject(
        mockRequest.request.mock.calls.map(() => [
          {
            headers: { "Client-Name": packageInfo.name, "Client-Version": packageInfo.version },
          },
        ])
      );
    });

    test("pagination accumulates across pages", async () => {
      const page1 = {
        headers: new Headers([["link", '</v2/service_instances?page_token=p2>; rel="next"']]),
        json: () => ({ items: [mockInstanceFactory(0), mockInstanceFactory(1)] }),
      };
      const page2 = {
        headers: new Headers(),
        json: () => ({ items: [mockInstanceFactory(2), mockInstanceFactory(3)] }),
      };
      mockRequest.request.mockReturnValueOnce(page1);
      mockRequest.request.mockReturnValueOnce(page2);
      mockRequest.request.mockReturnValueOnce(mockItemsResponse([]));

      const result = await svm.serviceManagerLongList(mockContext, [], [true, false]);
      expect(result).toMatchSnapshot();
      expect(mockRequest.request).toHaveBeenCalledTimes(3);
    });
  });

  describe("svm make bindings single", () => {
    test("all-services all-tenants creates missing bindings", async () => {
      mockRequest.request.mockReturnValueOnce(mockOfferingResponse);
      mockRequest.request.mockReturnValueOnce(mockPlanResponse);
      mockRequest.request.mockReturnValueOnce(mockInstanceResponse(6));
      mockRequest.request.mockReturnValueOnce(mockItemsResponse([mockBindingFactory(2), mockBindingFactory(5)]));

      expect(
        await svm.serviceManagerMakeBindingsSingle(mockContext, ["all-services", "all-tenants"], [])
      ).toBeUndefined();
      expect(collectRequestMockCallsStable(mockRequest.request)).toMatchInlineSnapshot(`
        [
          "GET service-manager-url /v2/service_offerings",
          "GET service-manager-url /v2/service_plans",
          "GET service-manager-url /v2/service_instances",
          "GET service-manager-url /v2/service_bindings",
          "POST service-manager-url /v2/service_bindings
        '{"name":"xxx","service_instance_id":"instance-id-0","labels":{"instance_id":["instance-id-0"],"tenant_id":["tenant-id-0"],"service_plan_id":["plan-id-0"]}}'",
          "POST service-manager-url /v2/service_bindings
        '{"name":"xxx","service_instance_id":"instance-id-1","labels":{"instance_id":["instance-id-1"],"tenant_id":["tenant-id-0"],"service_plan_id":["plan-id-1"]}}'",
          "POST service-manager-url /v2/service_bindings
        '{"name":"xxx","service_instance_id":"instance-id-3","labels":{"instance_id":["instance-id-3"],"tenant_id":["tenant-id-1"],"service_plan_id":["plan-id-1"]}}'",
          "POST service-manager-url /v2/service_bindings
        '{"name":"xxx","service_instance_id":"instance-id-4","labels":{"instance_id":["instance-id-4"],"tenant_id":["tenant-id-2"],"service_plan_id":["plan-id-0"]}}'",
          "GET service-manager-url /v2/service_bindings/operations/op-id",
          "GET service-manager-url /v2/service_bindings/operations/op-id",
          "GET service-manager-url /v2/service_bindings/operations/op-id",
          "GET service-manager-url /v2/service_bindings/operations/op-id",
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

    test("all-services all-tenants prunes ambivalent bindings", async () => {
      mockRequest.request.mockReturnValueOnce(mockOfferingResponse);
      mockRequest.request.mockReturnValueOnce(mockPlanResponse);
      mockRequest.request.mockReturnValueOnce(mockInstanceResponse(6));
      // NOTE: instance-id-0 has three succeeded bindings; the two older ones are ambivalent and get pruned.
      mockRequest.request.mockReturnValueOnce(
        mockItemsResponse([
          { ...mockBindingFactory(0), id: "binding-id-0a", updated_at: "2026-01-03" },
          { ...mockBindingFactory(0), id: "binding-id-0b", updated_at: "2026-01-02" },
          { ...mockBindingFactory(0), id: "binding-id-0c", updated_at: "2026-01-01" },
          mockBindingFactory(1),
          mockBindingFactory(2),
          mockBindingFactory(3),
          mockBindingFactory(4),
          mockBindingFactory(5),
        ])
      );

      expect(
        await svm.serviceManagerMakeBindingsSingle(mockContext, ["all-services", "all-tenants"], [])
      ).toBeUndefined();
      expect(collectRequestMockCallsStable(mockRequest.request)).toMatchInlineSnapshot(`
        [
          "GET service-manager-url /v2/service_offerings",
          "GET service-manager-url /v2/service_plans",
          "GET service-manager-url /v2/service_instances",
          "GET service-manager-url /v2/service_bindings",
          "DELETE service-manager-url /v2/service_bindings/binding-id-0b",
          "DELETE service-manager-url /v2/service_bindings/binding-id-0c",
          "GET service-manager-url /v2/service_bindings/binding-id-0b/operations/op-id",
          "GET service-manager-url /v2/service_bindings/binding-id-0c/operations/op-id",
        ]
      `);
      expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "triggering 2 changes
        deleted 2 ambivalent bindings for tenant tenant-id-0 plan myOffering:myPlan"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("all-services all-tenants deletes failed bindings", async () => {
      mockRequest.request.mockReturnValueOnce(mockOfferingResponse);
      mockRequest.request.mockReturnValueOnce(mockPlanResponse);
      mockRequest.request.mockReturnValueOnce(mockInstanceResponse(6));
      // NOTE: instance-id-0 has a failed binding alongside its succeeded one; the failed one gets cleaned up.
      mockRequest.request.mockReturnValueOnce(
        mockItemsResponse([
          mockBindingFactory(0),
          { ...mockBindingFactory(0), id: "binding-id-0-failed", last_operation: { state: "failed" } },
          mockBindingFactory(1),
          mockBindingFactory(2),
          mockBindingFactory(3),
          mockBindingFactory(4),
          mockBindingFactory(5),
        ])
      );

      expect(
        await svm.serviceManagerMakeBindingsSingle(mockContext, ["all-services", "all-tenants"], [])
      ).toBeUndefined();
      expect(collectRequestMockCallsStable(mockRequest.request)).toMatchInlineSnapshot(`
        [
          "GET service-manager-url /v2/service_offerings",
          "GET service-manager-url /v2/service_plans",
          "GET service-manager-url /v2/service_instances",
          "GET service-manager-url /v2/service_bindings",
          "DELETE service-manager-url /v2/service_bindings/binding-id-0-failed",
          "GET service-manager-url /v2/service_bindings/binding-id-0-failed/operations/op-id",
        ]
      `);
      expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "triggering 1 change
        deleted 1 failed binding for tenant tenant-id-0 plan myOffering:myPlan"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("all-services all-tenants already normalized is a no-op", async () => {
      mockRequest.request.mockReturnValueOnce(mockOfferingResponse);
      mockRequest.request.mockReturnValueOnce(mockPlanResponse);
      mockRequest.request.mockReturnValueOnce(mockInstanceResponse(6));
      mockRequest.request.mockReturnValueOnce(
        mockItemsResponse(Array.from({ length: 6 }).map((_, i) => mockBindingFactory(i)))
      );

      expect(
        await svm.serviceManagerMakeBindingsSingle(mockContext, ["all-services", "all-tenants"], [])
      ).toBeUndefined();
      expect(collectRequestMockCallsStable(mockRequest.request)).toMatchInlineSnapshot(`
        [
          "GET service-manager-url /v2/service_offerings",
          "GET service-manager-url /v2/service_plans",
          "GET service-manager-url /v2/service_instances",
          "GET service-manager-url /v2/service_bindings",
        ]
      `);
      expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(
        `"found target binding count 1 for 6 instances, all is well"`
      );
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("myPlan all-tenants", async () => {
      mockRequest.request.mockReturnValueOnce(mockFilteredOfferingResponse);
      mockRequest.request.mockReturnValueOnce(mockFilteredPlanResponse);
      mockRequest.request.mockReturnValueOnce(mockInstanceResponse(6, { isPlanFiltered: true }));
      mockRequest.request.mockReturnValueOnce(mockItemsResponse([mockBindingFactory(2)]));

      expect(
        await svm.serviceManagerMakeBindingsSingle(mockContext, [testServicePlanName, "all-tenants"], [])
      ).toBeUndefined();
      expect(collectRequestMockCallsStable(mockRequest.request)).toMatchInlineSnapshot(`
        [
          "GET service-manager-url /v2/service_offerings { name: 'myOffering' }",
          "GET service-manager-url /v2/service_plans { service_offering_id: 'offering-id-0', name: 'myPlan' }",
          "GET service-manager-url /v2/service_instances { service_plan_id: 'plan-id-0' }",
          "GET service-manager-url /v2/service_bindings",
          "POST service-manager-url /v2/service_bindings
        '{"name":"xxx","service_instance_id":"instance-id-0","labels":{"instance_id":["instance-id-0"],"tenant_id":["tenant-id-0"],"service_plan_id":["plan-id-0"]}}'",
          "POST service-manager-url /v2/service_bindings
        '{"name":"xxx","service_instance_id":"instance-id-4","labels":{"instance_id":["instance-id-4"],"tenant_id":["tenant-id-2"],"service_plan_id":["plan-id-0"]}}'",
          "GET service-manager-url /v2/service_bindings/operations/op-id",
          "GET service-manager-url /v2/service_bindings/operations/op-id",
        ]
      `);
      expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "triggering 2 changes
        created 1 missing binding for tenant tenant-id-0 plan myOffering:myPlan
        created 1 missing binding for tenant tenant-id-2 plan myOffering:myPlan"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("all-services myTenant filters getInstances and getBindings by tenant", async () => {
      mockRequest.request.mockReturnValueOnce(mockOfferingResponse);
      mockRequest.request.mockReturnValueOnce(mockPlanResponse);
      mockRequest.request.mockReturnValueOnce(mockInstanceResponse(6, { isTenantFiltered: true }));
      mockRequest.request.mockReturnValueOnce(mockItemsResponse([]));

      expect(
        await svm.serviceManagerMakeBindingsSingle(mockContext, ["all-services", testTenantId], [])
      ).toBeUndefined();
      expect(collectRequestMockCallsStable(mockRequest.request)).toMatchInlineSnapshot(`
        [
          "GET service-manager-url /v2/service_offerings",
          "GET service-manager-url /v2/service_plans",
          "GET service-manager-url /v2/service_instances { labels: 'tenant_id=tenant-id-1' }",
          "GET service-manager-url /v2/service_bindings { labels: 'tenant_id=tenant-id-1' }",
          "POST service-manager-url /v2/service_bindings
        '{"name":"xxx","service_instance_id":"instance-id-2","labels":{"instance_id":["instance-id-2"],"tenant_id":["tenant-id-1"],"service_plan_id":["plan-id-0"]}}'",
          "POST service-manager-url /v2/service_bindings
        '{"name":"xxx","service_instance_id":"instance-id-3","labels":{"instance_id":["instance-id-3"],"tenant_id":["tenant-id-1"],"service_plan_id":["plan-id-1"]}}'",
          "GET service-manager-url /v2/service_bindings/operations/op-id",
          "GET service-manager-url /v2/service_bindings/operations/op-id",
        ]
      `);
      expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "triggering 2 changes
        created 1 missing binding for tenant tenant-id-1 plan myOffering:myPlan
        created 1 missing binding for tenant tenant-id-1 plan otherOffering:otherPlan"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("hana container plan gets container labels on created bindings", async () => {
      mockRequest.request.mockReturnValueOnce(mockFilteredHanaContainerOfferingResponse);
      mockRequest.request.mockReturnValueOnce(mockFilteredHanaContainerPlanResponse);
      mockRequest.request.mockReturnValueOnce(mockInstanceResponse(2, { isPlanFiltered: true }));
      mockRequest.request.mockReturnValueOnce(mockItemsResponse([]));

      expect(
        await svm.serviceManagerMakeBindingsSingle(mockContext, [testHanaContainerPlanName, "all-tenants"], [])
      ).toBeUndefined();
      expect(collectRequestMockCallsStable(mockRequest.request)).toMatchInlineSnapshot(`
        [
          "GET service-manager-url /v2/service_offerings { name: 'hana' }",
          "GET service-manager-url /v2/service_plans { service_offering_id: 'offering-id-0', name: 'hdi-shared' }",
          "GET service-manager-url /v2/service_instances { service_plan_id: 'plan-id-0' }",
          "GET service-manager-url /v2/service_bindings",
          "POST service-manager-url /v2/service_bindings
        '{"name":"xxx","service_instance_id":"instance-id-0","labels":{"instance_id":["instance-id-0"],"tenant_id":["tenant-id-0"],"managing_client_lib":["instance-manager-client-lib"],"service_plan_id":["plan-id-0"]}}'",
          "GET service-manager-url /v2/service_bindings/operations/op-id",
        ]
      `);
      expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "triggering 1 change
        created 1 missing binding for tenant tenant-id-0 plan hana:hdi-shared"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });
  });

  describe("svm make bindings double", () => {
    test("all-services all-tenants creates second binding where one exists", async () => {
      mockRequest.request.mockReturnValueOnce(mockOfferingResponse);
      mockRequest.request.mockReturnValueOnce(mockPlanResponse);
      mockRequest.request.mockReturnValueOnce(mockInstanceResponse(6));
      // NOTE: instances 0..3 have one succeeded binding each, so each needs one more to reach the target of two.
      mockRequest.request.mockReturnValueOnce(
        mockItemsResponse(Array.from({ length: 4 }).map((_, i) => mockBindingFactory(i)))
      );

      expect(
        await svm.serviceManagerMakeBindingsDouble(mockContext, ["all-services", "all-tenants"], [])
      ).toBeUndefined();
      expect(collectRequestMockCallsStable(mockRequest.request)).toMatchInlineSnapshot(`
        [
          "GET service-manager-url /v2/service_offerings",
          "GET service-manager-url /v2/service_plans",
          "GET service-manager-url /v2/service_instances",
          "GET service-manager-url /v2/service_bindings",
          "POST service-manager-url /v2/service_bindings
        '{"name":"xxx","service_instance_id":"instance-id-0","labels":{"instance_id":["instance-id-0"],"tenant_id":["tenant-id-0"],"service_plan_id":["plan-id-0"]}}'",
          "POST service-manager-url /v2/service_bindings
        '{"name":"xxx","service_instance_id":"instance-id-1","labels":{"instance_id":["instance-id-1"],"tenant_id":["tenant-id-0"],"service_plan_id":["plan-id-1"]}}'",
          "POST service-manager-url /v2/service_bindings
        '{"name":"xxx","service_instance_id":"instance-id-2","labels":{"instance_id":["instance-id-2"],"tenant_id":["tenant-id-1"],"service_plan_id":["plan-id-0"]}}'",
          "POST service-manager-url /v2/service_bindings
        '{"name":"xxx","service_instance_id":"instance-id-3","labels":{"instance_id":["instance-id-3"],"tenant_id":["tenant-id-1"],"service_plan_id":["plan-id-1"]}}'",
          "POST service-manager-url /v2/service_bindings
        '{"name":"xxx","service_instance_id":"instance-id-4","labels":{"instance_id":["instance-id-4"],"tenant_id":["tenant-id-2"],"service_plan_id":["plan-id-0"]}}'",
          "POST service-manager-url /v2/service_bindings
        '{"name":"xxx","service_instance_id":"instance-id-4","labels":{"instance_id":["instance-id-4"],"tenant_id":["tenant-id-2"],"service_plan_id":["plan-id-0"]}}'",
          "GET service-manager-url /v2/service_bindings/operations/op-id",
          "GET service-manager-url /v2/service_bindings/operations/op-id",
          "GET service-manager-url /v2/service_bindings/operations/op-id",
          "GET service-manager-url /v2/service_bindings/operations/op-id",
          "GET service-manager-url /v2/service_bindings/operations/op-id",
          "GET service-manager-url /v2/service_bindings/operations/op-id",
          "POST service-manager-url /v2/service_bindings
        '{"name":"xxx","service_instance_id":"instance-id-5","labels":{"instance_id":["instance-id-5"],"tenant_id":["tenant-id-2"],"service_plan_id":["plan-id-1"]}}'",
          "POST service-manager-url /v2/service_bindings
        '{"name":"xxx","service_instance_id":"instance-id-5","labels":{"instance_id":["instance-id-5"],"tenant_id":["tenant-id-2"],"service_plan_id":["plan-id-1"]}}'",
          "GET service-manager-url /v2/service_bindings/operations/op-id",
          "GET service-manager-url /v2/service_bindings/operations/op-id",
        ]
      `);
      expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "triggering 8 changes
        created 1 missing binding for tenant tenant-id-0 plan myOffering:myPlan
        created 1 missing binding for tenant tenant-id-0 plan otherOffering:otherPlan
        created 1 missing binding for tenant tenant-id-1 plan myOffering:myPlan
        created 1 missing binding for tenant tenant-id-1 plan otherOffering:otherPlan
        created 2 missing bindings for tenant tenant-id-2 plan myOffering:myPlan
        created 2 missing bindings for tenant tenant-id-2 plan otherOffering:otherPlan"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("new binding inherits labels from the existing most-recent binding", async () => {
      mockRequest.request.mockReturnValueOnce(mockFilteredOfferingResponse);
      mockRequest.request.mockReturnValueOnce(mockFilteredPlanResponse);
      mockRequest.request.mockReturnValueOnce(mockInstanceResponse(2, { isPlanFiltered: true }));
      // NOTE: existing binding carries an extra custom label that must be copied onto the created binding.
      mockRequest.request.mockReturnValueOnce(
        mockItemsResponse([{ ...mockBindingFactory(0), labels: { custom_label: ["custom-value"] } }])
      );

      expect(
        await svm.serviceManagerMakeBindingsDouble(mockContext, [testServicePlanName, "all-tenants"], [])
      ).toBeUndefined();
      expect(collectRequestMockCallsStable(mockRequest.request)).toMatchInlineSnapshot(`
        [
          "GET service-manager-url /v2/service_offerings { name: 'myOffering' }",
          "GET service-manager-url /v2/service_plans { service_offering_id: 'offering-id-0', name: 'myPlan' }",
          "GET service-manager-url /v2/service_instances { service_plan_id: 'plan-id-0' }",
          "GET service-manager-url /v2/service_bindings",
          "POST service-manager-url /v2/service_bindings
        '{"name":"xxx","service_instance_id":"instance-id-0","labels":{"instance_id":["instance-id-0"],"tenant_id":["tenant-id-0"],"custom_label":["custom-value"],"service_plan_id":["plan-id-0"]}}'",
          "GET service-manager-url /v2/service_bindings/operations/op-id",
        ]
      `);
      expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "triggering 1 change
        created 1 missing binding for tenant tenant-id-0 plan myOffering:myPlan"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("passes custom parameters to created bindings", async () => {
      mockRequest.request.mockReturnValueOnce(mockFilteredOfferingResponse);
      mockRequest.request.mockReturnValueOnce(mockFilteredPlanResponse);
      mockRequest.request.mockReturnValueOnce(mockInstanceResponse(2, { isPlanFiltered: true }));
      mockRequest.request.mockReturnValueOnce(mockItemsResponse([mockBindingFactory(0)]));

      expect(
        await svm.serviceManagerMakeBindingsDouble(
          mockContext,
          [testServicePlanName, "all-tenants"],
          ['{"special":true}']
        )
      ).toBeUndefined();
      expect(collectRequestMockCallsStable(mockRequest.request)).toMatchInlineSnapshot(`
        [
          "GET service-manager-url /v2/service_offerings { name: 'myOffering' }",
          "GET service-manager-url /v2/service_plans { service_offering_id: 'offering-id-0', name: 'myPlan' }",
          "GET service-manager-url /v2/service_instances { service_plan_id: 'plan-id-0' }",
          "GET service-manager-url /v2/service_bindings",
          "POST service-manager-url /v2/service_bindings
        '{"name":"xxx","service_instance_id":"instance-id-0","labels":{"instance_id":["instance-id-0"],"tenant_id":["tenant-id-0"],"service_plan_id":["plan-id-0"]},"parameters":{"special":true}}'",
          "GET service-manager-url /v2/service_bindings/operations/op-id",
        ]
      `);
      expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "triggering 1 change
        created 1 missing binding for tenant tenant-id-0 plan myOffering:myPlan"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });
  });

  describe("svm deprecated bindings commands", () => {
    test("repair delegates to make-bindings-single and warns", async () => {
      mockRequest.request.mockReturnValueOnce(mockOfferingResponse);
      mockRequest.request.mockReturnValueOnce(mockPlanResponse);
      mockRequest.request.mockReturnValueOnce(mockInstanceResponse(6));
      mockRequest.request.mockReturnValueOnce(mockItemsResponse([mockBindingFactory(2), mockBindingFactory(5)]));

      expect(await svm.serviceManagerRepairBindingsDeprecated(mockContext, ["all-services"], [])).toBeUndefined();
      expect(collectRequestMockCallsStable(mockRequest.request)).toMatchInlineSnapshot(`
        [
          "GET service-manager-url /v2/service_offerings",
          "GET service-manager-url /v2/service_plans",
          "GET service-manager-url /v2/service_instances",
          "GET service-manager-url /v2/service_bindings",
          "POST service-manager-url /v2/service_bindings
        '{"name":"xxx","service_instance_id":"instance-id-0","labels":{"instance_id":["instance-id-0"],"tenant_id":["tenant-id-0"],"service_plan_id":["plan-id-0"]}}'",
          "POST service-manager-url /v2/service_bindings
        '{"name":"xxx","service_instance_id":"instance-id-1","labels":{"instance_id":["instance-id-1"],"tenant_id":["tenant-id-0"],"service_plan_id":["plan-id-1"]}}'",
          "POST service-manager-url /v2/service_bindings
        '{"name":"xxx","service_instance_id":"instance-id-3","labels":{"instance_id":["instance-id-3"],"tenant_id":["tenant-id-1"],"service_plan_id":["plan-id-1"]}}'",
          "POST service-manager-url /v2/service_bindings
        '{"name":"xxx","service_instance_id":"instance-id-4","labels":{"instance_id":["instance-id-4"],"tenant_id":["tenant-id-2"],"service_plan_id":["plan-id-0"]}}'",
          "GET service-manager-url /v2/service_bindings/operations/op-id",
          "GET service-manager-url /v2/service_bindings/operations/op-id",
          "GET service-manager-url /v2/service_bindings/operations/op-id",
          "GET service-manager-url /v2/service_bindings/operations/op-id",
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

    test("fresh delegates to make-bindings-double", async () => {
      mockRequest.request.mockReturnValueOnce(mockFilteredOfferingResponse);
      mockRequest.request.mockReturnValueOnce(mockFilteredPlanResponse);
      mockRequest.request.mockReturnValueOnce(mockInstanceResponse(6, { isPlanFiltered: true }));
      mockRequest.request.mockReturnValueOnce(
        mockItemsResponse(Array.from({ length: 6 }).map((_, i) => mockBindingFactory(i)))
      );

      expect(
        await svm.serviceManagerFreshBindingsDeprecated(mockContext, [testServicePlanName, "all-tenants"], [])
      ).toBeUndefined();
      expect(collectRequestMockCallsStable(mockRequest.request)).toMatchInlineSnapshot(`
        [
          "GET service-manager-url /v2/service_offerings { name: 'myOffering' }",
          "GET service-manager-url /v2/service_plans { service_offering_id: 'offering-id-0', name: 'myPlan' }",
          "GET service-manager-url /v2/service_instances { service_plan_id: 'plan-id-0' }",
          "GET service-manager-url /v2/service_bindings",
          "POST service-manager-url /v2/service_bindings
        '{"name":"xxx","service_instance_id":"instance-id-0","labels":{"instance_id":["instance-id-0"],"tenant_id":["tenant-id-0"],"service_plan_id":["plan-id-0"]}}'",
          "POST service-manager-url /v2/service_bindings
        '{"name":"xxx","service_instance_id":"instance-id-2","labels":{"instance_id":["instance-id-2"],"tenant_id":["tenant-id-1"],"service_plan_id":["plan-id-0"]}}'",
          "POST service-manager-url /v2/service_bindings
        '{"name":"xxx","service_instance_id":"instance-id-4","labels":{"instance_id":["instance-id-4"],"tenant_id":["tenant-id-2"],"service_plan_id":["plan-id-0"]}}'",
          "GET service-manager-url /v2/service_bindings/operations/op-id",
          "GET service-manager-url /v2/service_bindings/operations/op-id",
          "GET service-manager-url /v2/service_bindings/operations/op-id",
        ]
      `);
      expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "triggering 3 changes
        created 1 missing binding for tenant tenant-id-0 plan myOffering:myPlan
        created 1 missing binding for tenant tenant-id-1 plan myOffering:myPlan
        created 1 missing binding for tenant tenant-id-2 plan myOffering:myPlan"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("refresh grows to double then prunes back to single", async () => {
      // NOTE: refresh resolves the plan once, then runs normalize-to-2 followed by normalize-to-1. we start each
      //   instance at two succeeded bindings so round one (target two) is a no-op and round two (target one) prunes
      //   the older binding. this keeps every write a DELETE served by the default mock, so no queued GET response
      //   is consumed out of order by a create.
      const doubleBindings = mockItemsResponse(
        [0, 2, 4].flatMap((i) => [
          { ...mockBindingFactory(i), id: `binding-id-${i}a`, updated_at: "2026-01-02" },
          { ...mockBindingFactory(i), id: `binding-id-${i}b`, updated_at: "2026-01-01" },
        ])
      );
      mockRequest.request.mockReturnValueOnce(mockFilteredOfferingResponse);
      mockRequest.request.mockReturnValueOnce(mockFilteredPlanResponse);
      for (let round = 0; round < 2; round++) {
        mockRequest.request.mockReturnValueOnce(mockInstanceResponse(6, { isPlanFiltered: true }));
        mockRequest.request.mockReturnValueOnce(doubleBindings);
      }

      expect(
        await svm.serviceManagerRefreshBindingsDeprecated(mockContext, [testServicePlanName, "all-tenants"], [])
      ).toBeUndefined();
      expect(collectRequestMockCallsStable(mockRequest.request)).toMatchInlineSnapshot(`
        [
          "GET service-manager-url /v2/service_offerings { name: 'myOffering' }",
          "GET service-manager-url /v2/service_plans { service_offering_id: 'offering-id-0', name: 'myPlan' }",
          "GET service-manager-url /v2/service_instances { service_plan_id: 'plan-id-0' }",
          "GET service-manager-url /v2/service_bindings",
          "GET service-manager-url /v2/service_instances { service_plan_id: 'plan-id-0' }",
          "GET service-manager-url /v2/service_bindings",
          "DELETE service-manager-url /v2/service_bindings/binding-id-0b",
          "DELETE service-manager-url /v2/service_bindings/binding-id-2b",
          "DELETE service-manager-url /v2/service_bindings/binding-id-4b",
          "GET service-manager-url /v2/service_bindings/binding-id-0b/operations/op-id",
          "GET service-manager-url /v2/service_bindings/binding-id-2b/operations/op-id",
          "GET service-manager-url /v2/service_bindings/binding-id-4b/operations/op-id",
        ]
      `);
      expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "found target binding count 2 for 3 instances, all is well
        triggering 3 changes
        deleted 1 ambivalent binding for tenant tenant-id-0 plan myOffering:myPlan
        deleted 1 ambivalent binding for tenant tenant-id-1 plan myOffering:myPlan
        deleted 1 ambivalent binding for tenant tenant-id-2 plan myOffering:myPlan"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });
  });

  describe("svm delete bindings", () => {
    test("all-services all-tenants", async () => {
      mockRequest.request.mockReturnValueOnce(mockInstanceResponse(6));
      mockRequest.request.mockReturnValueOnce(
        mockItemsResponse(Array.from({ length: 6 }).map((_, i) => mockBindingFactory(i)))
      );

      expect(await svm.serviceManagerDeleteBindings(mockContext, ["all-services", "all-tenants"])).toBeUndefined();
      expect(collectRequestMockCallsStable(mockRequest.request)).toMatchInlineSnapshot(`
        [
          "GET service-manager-url /v2/service_instances",
          "GET service-manager-url /v2/service_bindings",
          "DELETE service-manager-url /v2/service_bindings/binding-id-0",
          "DELETE service-manager-url /v2/service_bindings/binding-id-1",
          "DELETE service-manager-url /v2/service_bindings/binding-id-2",
          "DELETE service-manager-url /v2/service_bindings/binding-id-3",
          "DELETE service-manager-url /v2/service_bindings/binding-id-4",
          "DELETE service-manager-url /v2/service_bindings/binding-id-5",
          "GET service-manager-url /v2/service_bindings/binding-id-0/operations/op-id",
          "GET service-manager-url /v2/service_bindings/binding-id-1/operations/op-id",
          "GET service-manager-url /v2/service_bindings/binding-id-2/operations/op-id",
          "GET service-manager-url /v2/service_bindings/binding-id-3/operations/op-id",
          "GET service-manager-url /v2/service_bindings/binding-id-4/operations/op-id",
          "GET service-manager-url /v2/service_bindings/binding-id-5/operations/op-id",
        ]
      `);
      expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`"deleted 6 bindings"`);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("myPlan all-tenants", async () => {
      mockRequest.request.mockReturnValueOnce(mockFilteredOfferingResponse);
      mockRequest.request.mockReturnValueOnce(mockFilteredPlanResponse);
      mockRequest.request.mockReturnValueOnce(mockInstanceResponse(6, { isPlanFiltered: true }));
      mockRequest.request.mockReturnValueOnce(
        mockItemsResponse(Array.from({ length: 6 }).map((_, i) => mockBindingFactory(i)))
      );

      expect(await svm.serviceManagerDeleteBindings(mockContext, [testServicePlanName, "all-tenants"])).toBeUndefined();
      expect(collectRequestMockCallsStable(mockRequest.request)).toMatchInlineSnapshot(`
        [
          "GET service-manager-url /v2/service_offerings { name: 'myOffering' }",
          "GET service-manager-url /v2/service_plans { service_offering_id: 'offering-id-0', name: 'myPlan' }",
          "GET service-manager-url /v2/service_instances { service_plan_id: 'plan-id-0' }",
          "GET service-manager-url /v2/service_bindings",
          "DELETE service-manager-url /v2/service_bindings/binding-id-0",
          "DELETE service-manager-url /v2/service_bindings/binding-id-2",
          "DELETE service-manager-url /v2/service_bindings/binding-id-4",
          "GET service-manager-url /v2/service_bindings/binding-id-0/operations/op-id",
          "GET service-manager-url /v2/service_bindings/binding-id-2/operations/op-id",
          "GET service-manager-url /v2/service_bindings/binding-id-4/operations/op-id",
        ]
      `);
      expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`"deleted 3 bindings"`);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("all-services myTenant", async () => {
      mockRequest.request.mockReturnValueOnce(mockInstanceResponse(6, { isTenantFiltered: true }));
      mockRequest.request.mockReturnValueOnce(
        mockItemsResponse(Array.from({ length: 6 }).map((_, i) => mockBindingFactory(i)))
      );

      expect(await svm.serviceManagerDeleteBindings(mockContext, ["all-services", testTenantId])).toBeUndefined();
      expect(collectRequestMockCallsStable(mockRequest.request)).toMatchInlineSnapshot(`
        [
          "GET service-manager-url /v2/service_instances { labels: 'tenant_id=tenant-id-1' }",
          "GET service-manager-url /v2/service_bindings { labels: 'tenant_id=tenant-id-1' }",
          "DELETE service-manager-url /v2/service_bindings/binding-id-2",
          "DELETE service-manager-url /v2/service_bindings/binding-id-3",
          "GET service-manager-url /v2/service_bindings/binding-id-2/operations/op-id",
          "GET service-manager-url /v2/service_bindings/binding-id-3/operations/op-id",
        ]
      `);
      expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`"deleted 2 bindings"`);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("myPlan myTenant", async () => {
      mockRequest.request.mockReturnValueOnce(mockFilteredOfferingResponse);
      mockRequest.request.mockReturnValueOnce(mockFilteredPlanResponse);
      mockRequest.request.mockReturnValueOnce(
        mockInstanceResponse(6, { isTenantFiltered: true, isPlanFiltered: true })
      );
      mockRequest.request.mockReturnValueOnce(
        mockItemsResponse(Array.from({ length: 6 }).map((_, i) => mockBindingFactory(i)))
      );

      expect(await svm.serviceManagerDeleteBindings(mockContext, [testServicePlanName, testTenantId])).toBeUndefined();
      expect(collectRequestMockCallsStable(mockRequest.request)).toMatchInlineSnapshot(`
        [
          "GET service-manager-url /v2/service_offerings { name: 'myOffering' }",
          "GET service-manager-url /v2/service_plans { service_offering_id: 'offering-id-0', name: 'myPlan' }",
          "GET service-manager-url /v2/service_instances { service_plan_id: 'plan-id-0', labels: 'tenant_id=tenant-id-1' }",
          "GET service-manager-url /v2/service_bindings { labels: 'tenant_id=tenant-id-1' }",
          "DELETE service-manager-url /v2/service_bindings/binding-id-2",
          "GET service-manager-url /v2/service_bindings/binding-id-2/operations/op-id",
        ]
      `);
      expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`"deleted 1 binding"`);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });
  });

  describe("svm delete instances and bindings", () => {
    test("all-services all-tenants", async () => {
      mockRequest.request.mockReturnValueOnce(mockInstanceResponse(6));
      mockRequest.request.mockReturnValueOnce(
        mockItemsResponse(Array.from({ length: 6 }).map((_, i) => mockBindingFactory(i)))
      );

      expect(
        await svm.serviceManagerDeleteInstancesAndBindings(mockContext, ["all-services", "all-tenants"])
      ).toBeUndefined();
      expect(collectRequestMockCallsStable(mockRequest.request)).toMatchInlineSnapshot(`
        [
          "GET service-manager-url /v2/service_instances",
          "GET service-manager-url /v2/service_bindings",
          "DELETE service-manager-url /v2/service_bindings/binding-id-0",
          "DELETE service-manager-url /v2/service_bindings/binding-id-1",
          "DELETE service-manager-url /v2/service_bindings/binding-id-2",
          "DELETE service-manager-url /v2/service_bindings/binding-id-3",
          "DELETE service-manager-url /v2/service_bindings/binding-id-4",
          "DELETE service-manager-url /v2/service_bindings/binding-id-5",
          "GET service-manager-url /v2/service_bindings/binding-id-0/operations/op-id",
          "GET service-manager-url /v2/service_bindings/binding-id-1/operations/op-id",
          "GET service-manager-url /v2/service_bindings/binding-id-2/operations/op-id",
          "GET service-manager-url /v2/service_bindings/binding-id-3/operations/op-id",
          "GET service-manager-url /v2/service_bindings/binding-id-4/operations/op-id",
          "GET service-manager-url /v2/service_bindings/binding-id-5/operations/op-id",
          "DELETE service-manager-url /v2/service_instances/instance-id-0",
          "DELETE service-manager-url /v2/service_instances/instance-id-1",
          "DELETE service-manager-url /v2/service_instances/instance-id-2",
          "DELETE service-manager-url /v2/service_instances/instance-id-3",
          "DELETE service-manager-url /v2/service_instances/instance-id-4",
          "DELETE service-manager-url /v2/service_instances/instance-id-5",
          "GET service-manager-url /v2/service_instances/instance-id-0/operations/op-id",
          "GET service-manager-url /v2/service_instances/instance-id-1/operations/op-id",
          "GET service-manager-url /v2/service_instances/instance-id-2/operations/op-id",
          "GET service-manager-url /v2/service_instances/instance-id-3/operations/op-id",
          "GET service-manager-url /v2/service_instances/instance-id-4/operations/op-id",
          "GET service-manager-url /v2/service_instances/instance-id-5/operations/op-id",
        ]
      `);
      expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "deleted 6 bindings
        deleted 6 instances"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("myPlan all-tenants", async () => {
      mockRequest.request.mockReturnValueOnce(mockFilteredOfferingResponse);
      mockRequest.request.mockReturnValueOnce(mockFilteredPlanResponse);
      mockRequest.request.mockReturnValueOnce(mockInstanceResponse(6, { isPlanFiltered: true }));
      mockRequest.request.mockReturnValueOnce(
        mockItemsResponse(Array.from({ length: 6 }).map((_, i) => mockBindingFactory(i)))
      );

      expect(
        await svm.serviceManagerDeleteInstancesAndBindings(mockContext, [testServicePlanName, "all-tenants"])
      ).toBeUndefined();
      expect(collectRequestMockCallsStable(mockRequest.request)).toMatchInlineSnapshot(`
        [
          "GET service-manager-url /v2/service_offerings { name: 'myOffering' }",
          "GET service-manager-url /v2/service_plans { service_offering_id: 'offering-id-0', name: 'myPlan' }",
          "GET service-manager-url /v2/service_instances { service_plan_id: 'plan-id-0' }",
          "GET service-manager-url /v2/service_bindings",
          "DELETE service-manager-url /v2/service_bindings/binding-id-0",
          "DELETE service-manager-url /v2/service_bindings/binding-id-2",
          "DELETE service-manager-url /v2/service_bindings/binding-id-4",
          "GET service-manager-url /v2/service_bindings/binding-id-0/operations/op-id",
          "GET service-manager-url /v2/service_bindings/binding-id-2/operations/op-id",
          "GET service-manager-url /v2/service_bindings/binding-id-4/operations/op-id",
          "DELETE service-manager-url /v2/service_instances/instance-id-0",
          "DELETE service-manager-url /v2/service_instances/instance-id-2",
          "DELETE service-manager-url /v2/service_instances/instance-id-4",
          "GET service-manager-url /v2/service_instances/instance-id-0/operations/op-id",
          "GET service-manager-url /v2/service_instances/instance-id-2/operations/op-id",
          "GET service-manager-url /v2/service_instances/instance-id-4/operations/op-id",
        ]
      `);
      expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "deleted 3 bindings
        deleted 3 instances"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("all-services myTenant", async () => {
      mockRequest.request.mockReturnValueOnce(mockInstanceResponse(6, { isTenantFiltered: true }));
      mockRequest.request.mockReturnValueOnce(
        mockItemsResponse(Array.from({ length: 6 }).map((_, i) => mockBindingFactory(i)))
      );

      expect(
        await svm.serviceManagerDeleteInstancesAndBindings(mockContext, ["all-services", testTenantId])
      ).toBeUndefined();
      expect(collectRequestMockCallsStable(mockRequest.request)).toMatchInlineSnapshot(`
        [
          "GET service-manager-url /v2/service_instances { labels: 'tenant_id=tenant-id-1' }",
          "GET service-manager-url /v2/service_bindings { labels: 'tenant_id=tenant-id-1' }",
          "DELETE service-manager-url /v2/service_bindings/binding-id-2",
          "DELETE service-manager-url /v2/service_bindings/binding-id-3",
          "GET service-manager-url /v2/service_bindings/binding-id-2/operations/op-id",
          "GET service-manager-url /v2/service_bindings/binding-id-3/operations/op-id",
          "DELETE service-manager-url /v2/service_instances/instance-id-2",
          "DELETE service-manager-url /v2/service_instances/instance-id-3",
          "GET service-manager-url /v2/service_instances/instance-id-2/operations/op-id",
          "GET service-manager-url /v2/service_instances/instance-id-3/operations/op-id",
        ]
      `);
      expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "deleted 2 bindings
        deleted 2 instances"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("myPlan myTenant", async () => {
      mockRequest.request.mockReturnValueOnce(mockFilteredOfferingResponse);
      mockRequest.request.mockReturnValueOnce(mockFilteredPlanResponse);
      mockRequest.request.mockReturnValueOnce(
        mockInstanceResponse(6, { isTenantFiltered: true, isPlanFiltered: true })
      );
      mockRequest.request.mockReturnValueOnce(
        mockItemsResponse(Array.from({ length: 6 }).map((_, i) => mockBindingFactory(i)))
      );

      expect(
        await svm.serviceManagerDeleteInstancesAndBindings(mockContext, [testServicePlanName, testTenantId])
      ).toBeUndefined();
      expect(collectRequestMockCallsStable(mockRequest.request)).toMatchInlineSnapshot(`
        [
          "GET service-manager-url /v2/service_offerings { name: 'myOffering' }",
          "GET service-manager-url /v2/service_plans { service_offering_id: 'offering-id-0', name: 'myPlan' }",
          "GET service-manager-url /v2/service_instances { service_plan_id: 'plan-id-0', labels: 'tenant_id=tenant-id-1' }",
          "GET service-manager-url /v2/service_bindings { labels: 'tenant_id=tenant-id-1' }",
          "DELETE service-manager-url /v2/service_bindings/binding-id-2",
          "GET service-manager-url /v2/service_bindings/binding-id-2/operations/op-id",
          "DELETE service-manager-url /v2/service_instances/instance-id-2",
          "GET service-manager-url /v2/service_instances/instance-id-2/operations/op-id",
        ]
      `);
      expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "deleted 1 binding
        deleted 1 instance"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });
  });
});

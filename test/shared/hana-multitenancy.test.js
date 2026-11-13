"use strict";

const { request: mockRequest } = require("../../src/shared/request");
jest.mock("../../src/shared/request", () => ({ request: jest.fn() }));

const { HanaMultitenancy } = require("../../src/shared/hana-multitenancy");

const mockCredentials = {
  baseurl: "hana-tms-host",
  uaa: { clientid: "clientid", clientsecret: "clientsecret", url: "uaa-url" },
};
const newHanaMultitenancy = () => new HanaMultitenancy({ credentials: mockCredentials, getToken: () => "token" });
const mockResponse = (data, extra = {}) => ({ json: () => data, ...extra });
const mockTenant = () => ({
  id: "db-tenant-1",
  containers: [
    {
      id: "container-1",
      credentials: [
        {
          id: "credential-1",
          host: "host",
          url: "jdbc:sap://host:443",
          schema: "SCHEMA",
          user: "USER",
          password: "secret",
          hdiPassword: "hdi-secret",
          privateKey: "private-key",
          PASSWORD: "uppercase-secret",
          certificate: "cert-chain",
        },
      ],
    },
  ],
});

beforeEach(() => mockRequest.mockReset());

describe("constructor and authentication", () => {
  test.each([
    [undefined, /baseurl/i],
    [{ credentials: { uaa: {} }, getToken: () => "token" }, /baseurl/i],
    [{ credentials: { baseurl: "x" }, getToken: () => "token" }, /uaa/i],
    [{ credentials: mockCredentials }, /getToken/i],
  ])("rejects invalid options %p", (options, message) => {
    expect(() => new HanaMultitenancy(options)).toThrow(message);
  });

  test.each([
    ["hana-tms-host", "https://hana-tms-host"],
    ["https://hana-tms-host", "https://hana-tms-host"],
    ["http://localhost", "http://localhost"],
  ])("uses baseurl %s and nested UAA credentials", async (baseurl, url) => {
    const getToken = jest.fn().mockResolvedValue("token");
    mockRequest.mockReturnValue(mockResponse({ data: [] }));
    const hana = new HanaMultitenancy({ credentials: { ...mockCredentials, baseurl }, getToken });
    await hana.getTenants();
    expect(getToken).toHaveBeenCalledWith(mockCredentials.uaa);
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ url, auth: { token: "token" }, headers: { Accept: "application/json" } })
    );
  });
});

describe("hasTenant", () => {
  test("requires a tenant ID before making a request", async () => {
    await expect(newHanaMultitenancy().hasTenant()).rejects.toThrow(/tenantId/);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  test.each([200, 204, 400, 401, 403, 404, 409, 429, 499])(
    "checks the tenant directly for status %i",
    async (status) => {
      mockRequest.mockResolvedValue({ status, ok: status < 400 });
      await expect(newHanaMultitenancy().hasTenant("db-tenant-1")).resolves.toBe(status < 400);
      expect(mockRequest).toHaveBeenCalledTimes(1);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: "/tenants/v2/tenants/db-tenant-1", checkStatus: false })
      );
    }
  );

  test.each([500, 503])("rejects server errors with status %i", async (status) => {
    mockRequest.mockResolvedValue({ status, ok: false });
    await expect(newHanaMultitenancy().hasTenant("db-tenant-1")).rejects.toThrow(
      "could not check hana-multitenancy tenant db-tenant-1: got response " + status
    );
  });

  test("propagates request failures", async () => {
    mockRequest.mockRejectedValue(new Error("connection failed"));
    await expect(newHanaMultitenancy().hasTenant("db-tenant-1")).rejects.toThrow("connection failed");
  });
});

describe("getTenant", () => {
  test.each([
    [undefined, { $expand: "containers/credentials" }],
    [{ doExpandCredentials: false }, { $expand: "containers" }],
    [{ doExpandContainers: false, doExpandCredentials: false }, undefined],
  ])("expands the requested data for options %p", async (options, query) => {
    mockRequest.mockReturnValue(mockResponse({ id: "db-tenant-1" }));
    await expect(newHanaMultitenancy().getTenant("db-tenant-1", options)).resolves.toEqual({ id: "db-tenant-1" });
    expect(mockRequest.mock.calls[0][0].pathname).toBe("/tenants/v2/tenants/db-tenant-1");
    expect(mockRequest.mock.calls[0][0].query).toEqual(query);
  });

  test("requires a tenant ID", async () => {
    await expect(newHanaMultitenancy().getTenant()).rejects.toThrow(/tenantId/);
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

describe("getTenants", () => {
  test("lists tenant stubs without expansion by default", async () => {
    mockRequest.mockReturnValue(mockResponse({ data: [{ id: "t-1" }] }));
    await expect(newHanaMultitenancy().getTenants()).resolves.toEqual([{ id: "t-1" }]);
    expect(mockRequest.mock.calls[0][0].query).toBeUndefined();
  });

  test.each([
    [{ doExpandContainers: true }, "containers"],
    [{ doExpandContainers: true, doExpandCredentials: true }, "containers/credentials"],
  ])("preserves filters and expansion %p across pages", async (options, expand) => {
    mockRequest.mockReturnValueOnce(mockResponse({ data: [{ id: "t-1" }], $skiptoken: "page-2" }));
    mockRequest.mockReturnValueOnce(mockResponse({ data: [{ id: "t-2" }], $skiptoken: "page-3" }));
    mockRequest.mockReturnValueOnce(mockResponse({ data: [{ id: "t-3" }] }));
    const query = {
      serviceInstanceID: "hana-1",
      containerFilter: 'hassubset(labels,["tenant_id=business-tenant"])',
      $expand: expand,
    };
    await expect(
      newHanaMultitenancy().getTenants({
        ...options,
        filterServiceInstanceId: "hana-1",
        filterContainerTenantId: "business-tenant",
      })
    ).resolves.toEqual([{ id: "t-1" }, { id: "t-2" }, { id: "t-3" }]);
    expect(mockRequest.mock.calls.map(([request]) => request.query)).toEqual([
      query,
      { ...query, $skiptoken: "page-2" },
      { ...query, $skiptoken: "page-3" },
    ]);
  });

  test("handles a page without data", async () => {
    mockRequest.mockReturnValue(mockResponse({}));
    await expect(newHanaMultitenancy().getTenants()).resolves.toEqual([]);
  });

  test("excludes tenants without containers and containers without business tenant labels", async () => {
    mockRequest.mockReturnValue(
      mockResponse({
        data: [
          { id: "no-containers" },
          { id: "empty-containers", containers: [] },
          {
            id: "t-1",
            containers: [
              { id: "labeled", labels: ["tenant_id=business-tenant"] },
              { id: "other-label", labels: ["other_tenant_id=business-tenant"] },
              { id: "no-labels" },
            ],
          },
        ],
      })
    );
    await expect(
      newHanaMultitenancy().getTenants({
        doExpandContainers: true,
        doEnsureContainer: true,
        doEnsureTenantLabel: true,
      })
    ).resolves.toEqual([{ id: "t-1", containers: [{ id: "labeled", labels: ["tenant_id=business-tenant"] }] }]);
  });
});

describe.each(["getTenant", "getTenants"])("%s credentials", (method) => {
  const readTenant = async (tenant, options = {}) => {
    mockRequest.mockReturnValue(mockResponse(method === "getTenant" ? tenant : { data: [tenant] }));
    const hana = newHanaMultitenancy();
    if (method === "getTenant") return await hana.getTenant(tenant.id, options);
    const [result] = await hana.getTenants({ doExpandContainers: true, doExpandCredentials: true, ...options });
    return result;
  };

  test("masks password and key fields, preserving connection metadata", async () => {
    const tenant = await readTenant(mockTenant());
    expect(tenant.containers[0].credentials[0]).toEqual({
      ...mockTenant().containers[0].credentials[0],
      password: "*** show with --reveal ***",
      hdiPassword: "*** show with --reveal ***",
      privateKey: "*** show with --reveal ***",
      PASSWORD: "*** show with --reveal ***",
    });
  });

  test("reveals credentials on request", async () => {
    await expect(readTenant(mockTenant(), { doReveal: true })).resolves.toEqual(mockTenant());
  });

  test.each([undefined, null, []])("handles missing credentials %p", async (credentials) => {
    const tenant = { id: "t-1", containers: [{ id: "c-1", credentials }] };
    await expect(readTenant(tenant)).resolves.toEqual(tenant);
  });
});

describe("fromSvmLabels", () => {
  test("converts multiple values and excludes service-manager reserved labels", () => {
    const labels = {
      tenant_id: ["business-tenant"],
      custom: ["one", "two"],
      container_id: ["container-1"],
      subaccount_id: ["subaccount-1"],
    };
    expect(HanaMultitenancy.fromSvmLabels(labels)).toEqual(["tenant_id=business-tenant", "custom=one,two"]);
    expect(labels.container_id).toEqual(["container-1"]);
  });

  test.each([undefined, null, {}])("handles labels %p", (labels) => {
    expect(HanaMultitenancy.fromSvmLabels(labels)).toEqual(labels ? [] : labels);
  });
});

describe("updateContainer", () => {
  test("patches labels and the target multitenancy instance and returns JSON", async () => {
    mockRequest.mockReturnValue(mockResponse({ id: "container-1" }, { status: 200 }));
    await expect(
      newHanaMultitenancy().updateContainer("db-tenant-1", "container-1", {
        labels: ["tenant_id=business-tenant"],
        tmsInstanceId: "tms-instance-1",
      })
    ).resolves.toEqual({ id: "container-1" });
    expect(mockRequest.mock.calls[0][0]).toMatchObject({
      method: "PATCH",
      pathname: "/tenants/v2/tenants/db-tenant-1/containers/container-1",
    });
    expect(JSON.parse(mockRequest.mock.calls[0][0].body)).toEqual({
      labels: ["tenant_id=business-tenant"],
      multitenancyInstanceID: "tms-instance-1",
    });
  });

  test("returns text for a non-200 response and omits unspecified fields", async () => {
    mockRequest.mockReturnValue({ status: 204, text: () => "" });
    await expect(newHanaMultitenancy().updateContainer("t-1", "c-1")).resolves.toBe("");
    expect(JSON.parse(mockRequest.mock.calls[0][0].body)).toEqual({});
  });

  test.each([
    [undefined, "c-1", /tenantId/],
    ["t-1", undefined, /containerId/],
  ])("requires both IDs (%p, %p)", async (tenantId, containerId, message) => {
    await expect(newHanaMultitenancy().updateContainer(tenantId, containerId)).rejects.toThrow(message);
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

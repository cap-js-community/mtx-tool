"use strict";

const { request: mockRequest } = require("../../src/shared/request");
jest.mock("../../src/shared/request", () => ({ request: jest.fn() }));
jest.mock("../../src/shared/logger", () => require("../__mocks/shared/logger"));
jest.mock("../../src/shared/static", () => ({
  ...jest.requireActual("../../src/shared/static"),
  sleep: jest.fn(),
}));

const svmCredentials = { sm_url: "https://service-manager", clientid: "svm-client" };
const adminCredentials = { baseurl: "tms-admin", uaa: { clientid: "admin-client" } };
const tmsCredentials = { baseurl: "tms-user", uaa: { clientid: "tms-client" } };
const tenantPath = "/tenants/v2/tenants";
const instancePath = "/v2/service_instances";
const newInstance = (index) => ({
  id: "svm-" + index,
  labels: {
    tenant_id: ["tenant-" + index],
    custom: ["one", "two"],
    container_id: ["old-container"],
    subaccount_id: ["subaccount"],
  },
});
const response = (data, extra = {}) => ({
  headers: new Headers(),
  status: 200,
  ok: true,
  json: () => structuredClone(data),
  ...extra,
});
const requests = () => mockRequest.mock.calls.map(([request]) => request);
const writes = () => requests().filter(({ method }) => method === "PATCH");
const tenantReads = () => requests().filter(({ pathname }) => pathname === tenantPath);

let tms;
let mockLogger;
let context;
let instances;
let tenants;
let tenantStatus;
let migratedContainers;
let failure;
let tenantStubs;
let listedTenants;
let originalAdminCredentials;

beforeEach(() => {
  mockRequest.mockReset();
  originalAdminCredentials = process.env.MTX_TMS_ADMIN_CREDENTIALS;
  process.env.MTX_TMS_ADMIN_CREDENTIALS = JSON.stringify(adminCredentials);
  instances = [newInstance(1)];
  tenants = [];
  tenantStatus = 403;
  migratedContainers = [{ id: "migrated-container" }];
  failure = undefined;
  tenantStubs = [];
  listedTenants = {};
  context = {
    getHdiInfo: jest.fn().mockResolvedValue({ cfBinding: { credentials: svmCredentials } }),
    getTmsInfo: jest.fn().mockResolvedValue({ cfBinding: { instanceId: "target-tms", credentials: tmsCredentials } }),
    getCachedUaaTokenFromCredentials: jest.fn().mockResolvedValue("token"),
  };
  // Each command module gets fresh makeOneTime client caches.
  jest.isolateModules(() => {
    tms = require("../../src/submodules/hanaMultitenancy");
    mockLogger = require("../../src/shared/logger").Logger.getInstance();
  });
  mockRequest.mockImplementation(async ({ url, pathname, method = "GET", query, checkStatus }) => {
    if (url === "https://service-manager") {
      if (pathname === "/v2/service_offerings") return response({ items: [{ id: "hana-offering" }] });
      if (pathname === "/v2/service_plans") return response({ items: [{ id: "hdi-plan" }] });
      if (pathname === instancePath) return response({ items: instances });
      if (method === "PATCH")
        return response(undefined, {
          status: 202,
          headers: new Headers({ Location: "/v2/operations/migration" }),
        });
      if (pathname === "/v2/operations/migration")
        return response(
          failure === "svm" ? { state: "failed", error: { description: "migration failed" } } : { state: "succeeded" }
        );
    }
    if (url === "https://tms-admin") {
      if (pathname === tenantPath) return response({ data: tenants });
      if (checkStatus === false) return response(undefined, { status: tenantStatus, ok: tenantStatus < 400 });
      if (method === "PATCH") {
        if (failure === "assignment") throw new Error("assignment failed");
        return response({});
      }
      return response({ id: pathname.split("/").at(-1), containers: migratedContainers });
    }
    if (url === "https://tms-user" && pathname === tenantPath) {
      return response({
        data: query?.$expand ? (listedTenants[query.serviceInstanceID ?? "filtered"] ?? []) : tenantStubs,
      });
    }
    throw new Error("unexpected request: " + method + " " + url + pathname);
  });
});

afterEach(() => {
  if (originalAdminCredentials === undefined) delete process.env.MTX_TMS_ADMIN_CREDENTIALS;
  else process.env.MTX_TMS_ADMIN_CREDENTIALS = originalAdminCredentials;
  jest.useRealTimers();
});

describe("single tenant migration", () => {
  test("checks the SVM instance ID directly and migrates with labels and target assignment", async () => {
    await expect(tms.tmsMigrateFromSvm(context, ["tenant-1"])).resolves.toBeUndefined();

    expect(tenantReads()).toEqual([]);
    expect(requests()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pathname: instancePath,
          query: { service_plan_id: "hdi-plan", labels: "tenant_id=tenant-1" },
        }),
        expect.objectContaining({ pathname: "/v2/service_offerings", query: { name: "hana" } }),
        expect.objectContaining({
          pathname: "/v2/service_plans",
          query: { service_offering_id: "hana-offering", name: "hdi-shared" },
        }),
        expect.objectContaining({ pathname: tenantPath + "/svm-1", checkStatus: false }),
        expect.objectContaining({ pathname: tenantPath + "/svm-1", query: { $expand: "containers/credentials" } }),
      ])
    );
    expect(writes().map(({ pathname, body }) => [pathname, JSON.parse(body)])).toEqual([
      [instancePath + "/svm-1", { parameters: { action: "migrateToMTv2" } }],
      [
        tenantPath + "/svm-1/containers/migrated-container",
        {
          labels: ["tenant_id=tenant-1", "custom=one,two"],
          multitenancyInstanceID: "target-tms",
        },
      ],
    ]);
    expect(context.getCachedUaaTokenFromCredentials).toHaveBeenCalledWith(adminCredentials.uaa);
  });

  test("logs and skips an already migrated instance", async () => {
    tenantStatus = 200;
    await tms.tmsMigrateFromSvm(context, ["tenant-1"]);
    expect(mockLogger.info).toHaveBeenCalledWith("tenant %s already migrated to hana multitenancy", "tenant-1");
    expect(writes()).toEqual([]);
    expect(tenantReads()).toEqual([]);
    expect(context.getTmsInfo).not.toHaveBeenCalled();
  });

  test("fails when the SVM instance is missing", async () => {
    instances = [];
    await expect(tms.tmsMigrateFromSvm(context, ["tenant-1"])).rejects.toThrow("could not find svm instance");
    expect(writes()).toEqual([]);
    expect(requests().filter(({ url }) => url === "https://tms-admin")).toEqual([]);
  });

  test("does not migrate when the existence check fails with a server error", async () => {
    tenantStatus = 503;
    await expect(tms.tmsMigrateFromSvm(context, ["tenant-1"])).rejects.toThrow("got response 503");
    expect(writes()).toEqual([]);
  });
});

describe("all tenant migration", () => {
  test("lists once, counts existing instance IDs, and migrates every missing tenant sequentially", async () => {
    instances = [...Array.from({ length: 8 }, (_, index) => newInstance(index + 1)), { id: "unlabeled", labels: {} }];
    // Business tenant IDs and unrelated TMS tenants must not count as migrated SVM instances.
    tenants = [{ id: "svm-1" }, { id: "tenant-2" }, { id: "unrelated" }];

    await tms.tmsMigrateFromSvm(context, ["all-tenants"]);

    expect(tenantReads()).toHaveLength(1);
    expect(tenantReads()[0].query).toBeUndefined();
    expect(requests().filter(({ pathname }) => pathname === instancePath)).toHaveLength(1);
    expect(requests().find(({ pathname }) => pathname === instancePath).query).toEqual({ service_plan_id: "hdi-plan" });
    expect(requests().filter(({ checkStatus }) => checkStatus === false)).toEqual([]);
    expect(mockLogger.info).toHaveBeenCalledWith("%i of %i tenants are already migrated to hana multitenancy", 1, 8);
    expect(mockLogger.info).toHaveBeenCalledWith("migrating %i tenants", 7);
    const migrationRequests = requests().filter(
      ({ pathname }) =>
        pathname.startsWith(instancePath + "/") ||
        pathname.startsWith(tenantPath + "/") ||
        pathname.startsWith("/v2/operations/")
    );
    expect(migrationRequests.map(({ pathname }) => pathname)).toEqual(
      Array.from({ length: 7 }, (_, index) => [
        instancePath + "/svm-" + (index + 2),
        "/v2/operations/migration",
        tenantPath + "/svm-" + (index + 2),
        tenantPath + "/svm-" + (index + 2) + "/containers/migrated-container",
      ]).flat()
    );
    expect(
      writes()
        .filter(({ url }) => url === "https://tms-admin")
        .map(({ body }) => JSON.parse(body))
    ).toEqual(
      Array.from({ length: 7 }, (_, index) => ({
        labels: ["tenant_id=tenant-" + (index + 2), "custom=one,two"],
        multitenancyInstanceID: "target-tms",
      }))
    );
  });

  test.each([{ candidates: [] }, { candidates: [newInstance(1)] }])(
    "avoids target configuration and writes when nothing is missing: $candidates",
    async ({ candidates }) => {
      instances = candidates;
      tenants = [{ id: "svm-1" }, { id: "unrelated" }];
      await tms.tmsMigrateFromSvm(context, ["all-tenants"]);
      expect(writes()).toEqual([]);
      expect(context.getTmsInfo).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        "%i of %i tenants are already migrated to hana multitenancy",
        candidates.length,
        candidates.length
      );
    }
  );

  test.each([
    ["svm", "migration failed"],
    ["missing-container", "could not migrate to tms container for tenantId tenant-1"],
    ["assignment", "assignment failed"],
  ])("stops later mutations after %s failure", async (failureType, message) => {
    instances = [newInstance(1), newInstance(2)];
    failure = failureType;
    if (failureType === "missing-container") migratedContainers = [];
    await expect(tms.tmsMigrateFromSvm(context, ["all-tenants"])).rejects.toThrow(message);
    expect(writes().filter(({ url }) => url === "https://service-manager")).toEqual([
      expect.objectContaining({ pathname: instancePath + "/svm-1" }),
    ]);
    expect(writes().filter(({ url }) => url === "https://tms-admin")).toHaveLength(
      failureType === "assignment" ? 1 : 0
    );
  });
});

describe("migration configuration", () => {
  test.each(["tenant-1", "all-tenants"])("resolves the target before writing for %s", async (tenantId) => {
    context.getTmsInfo.mockRejectedValue(new Error("target not configured"));
    await expect(tms.tmsMigrateFromSvm(context, [tenantId])).rejects.toThrow("target not configured");
    expect(writes()).toEqual([]);
  });

  test.each([undefined, "invalid-json", "{}"])("requires admin credentials: %p", async (credentials) => {
    if (credentials === undefined) delete process.env.MTX_TMS_ADMIN_CREDENTIALS;
    else process.env.MTX_TMS_ADMIN_CREDENTIALS = credentials;
    await expect(tms.tmsMigrateFromSvm(context, ["tenant-1"])).rejects.toThrow("MTX_TMS_ADMIN_CREDENTIALS");
    expect(writes()).toEqual([]);
  });
});

describe("rollback", () => {
  test("checks the instance ID and requests rollback for a migrated tenant", async () => {
    tenantStatus = 200;
    await tms.tmsRollbackToSvm(context, ["tenant-1"]);
    expect(tenantReads()).toEqual([]);
    expect(requests()).toEqual(
      expect.arrayContaining([expect.objectContaining({ pathname: tenantPath + "/svm-1", checkStatus: false })])
    );
    expect(writes().map(({ pathname, body }) => [pathname, JSON.parse(body)])).toEqual([
      [instancePath + "/svm-1", { parameters: { action: "rollbackToMTv1" } }],
    ]);
    expect(context.getTmsInfo).not.toHaveBeenCalled();
  });

  test("rejects an unmigrated tenant without writing", async () => {
    await expect(tms.tmsRollbackToSvm(context, ["tenant-1"])).rejects.toThrow("tenant tenant-1 was not migrated");
    expect(writes()).toEqual([]);
  });

  test("rejects a missing SVM instance without querying TMS", async () => {
    instances = [];
    await expect(tms.tmsRollbackToSvm(context, ["tenant-1"])).rejects.toThrow("could not find svm instance");
    expect(writes()).toEqual([]);
    expect(requests().filter(({ url }) => url === "https://tms-admin")).toEqual([]);
  });
});

describe("tenant lists", () => {
  beforeEach(() => {
    // Listing uses the configured binding, without admin credentials.
    delete process.env.MTX_TMS_ADMIN_CREDENTIALS;
    tenantStubs = [
      { id: "db-1", serviceInstanceID: "hana-1" },
      { id: "db-2", serviceInstanceID: "hana-1" },
      { id: "db-3", serviceInstanceID: "hana-2" },
    ];
    listedTenants = {
      "hana-1": [
        {
          id: "db-1",
          serviceInstanceID: "hana-1",
          containers: [
            {
              id: "container-z",
              labels: ["tenant_id=z-tenant"],
              credentials: [{ schema: "SCHEMA", password: "secret", hdiPassword: "hdi-secret" }],
              status: { ready: true },
            },
          ],
        },
      ],
      "hana-2": [
        {
          id: "db-3",
          serviceInstanceID: "hana-2",
          containers: [
            { id: "container-a", labels: ["tenant_id=a-tenant"] },
            { id: "unlabeled", labels: ["custom=one"] },
          ],
        },
      ],
    };
    listedTenants.filtered = listedTenants["hana-1"];
  });

  test("fetches each HANA once and sorts by business tenant with parent metadata", async () => {
    const output = await tms.tmsList(context, [], [false, true]);
    expect(output.containers.map(({ id }) => id)).toEqual(["container-a", "container-z"]);
    expect(output.containers[0].tenant).toEqual({ id: "db-3", serviceInstanceID: "hana-2", containers: undefined });
    expect(tenantReads().map(({ query }) => query)).toEqual([
      undefined,
      { serviceInstanceID: "hana-1", $expand: "containers/credentials" },
      { serviceInstanceID: "hana-2", $expand: "containers/credentials" },
    ]);
    expect(JSON.stringify(output)).not.toContain("labelTenantId");
    expect(output.containers[1].credentials[0].password).toBe("*** show with --reveal ***");
    expect(context.getHdiInfo).not.toHaveBeenCalled();
  });

  test.each([
    { credentials: undefined, status: undefined },
    { credentials: null, status: undefined },
    { credentials: [], status: undefined },
    { credentials: [], status: { ready: true, state: "CREATE_SUCCEEDED" } },
  ])(
    "displays missing credentials $credentials and handles status $status with timestamps",
    async ({ credentials, status }) => {
      listedTenants.filtered[0].containers = [
        {
          id: "container-1",
          labels: ["tenant_id=tenant-1"],
          credentials,
          status,
          createTimestamp: "2026-11-10T12:00:00Z",
        },
      ];
      jest.useFakeTimers({ now: new Date("2026-11-13T12:00:00Z") });
      const output = await tms.tmsList(context, ["tenant-1"], [true, false]);
      expect(output).toContain("missing credentials");
      expect(output).toContain("tenant-1");
      expect(output.match(/2026-11-10T12:00:00Z \(3 days ago\)/g)).toHaveLength(2);
      expect(tenantReads()).toHaveLength(1);
      expect(tenantReads()[0].query).toEqual({
        containerFilter: 'hassubset(labels,["tenant_id=tenant-1"])',
        $expand: "containers/credentials",
      });
    }
  );

  test("uses the status transition timestamp when present", async () => {
    const container = listedTenants.filtered[0].containers[0];
    container.createTimestamp = "2026-11-10T12:00:00Z";
    container.status.lastTransitionTimestamp = "2026-11-12T12:00:00Z";
    jest.useFakeTimers({ now: new Date("2026-11-13T12:00:00Z") });
    const output = await tms.tmsList(context, ["z-tenant"], [true, false]);
    expect(output).toContain("2026-11-10T12:00:00Z (3 days ago)");
    expect(output).toContain("2026-11-12T12:00:00Z (1 day ago)");
    expect(output).toContain("SCHEMA");
  });

  test.each([false, true])("long JSON lists retain unlabeled containers and reveal=%s", async (doReveal) => {
    const output = await tms.tmsLongList(context, [], [true, doReveal]);
    expect(output.containers).toHaveLength(3);
    expect(output.containers.map(({ id }) => id)).toContain("unlabeled");
    const credential = output.containers.find(({ id }) => id === "container-z").credentials[0];
    expect(credential.password).toBe(doReveal ? "secret" : "*** show with --reveal ***");
    expect(credential.hdiPassword).toBe(doReveal ? "hdi-secret" : "*** show with --reveal ***");
  });

  test("formats a single long-list container as an object", async () => {
    const output = await tms.tmsLongList(context, ["z-tenant"], [false, false]);
    expect(output).toContain("=== 1 container ===");
    expect(JSON.parse(output.slice(output.indexOf("{"))).id).toBe("container-z");
    expect(output).not.toContain("secret");
  });

  test("handles an empty tenant list without expanded requests", async () => {
    tenantStubs = [];
    await expect(tms.tmsList(context, [], [false, true])).resolves.toEqual({ containers: [] });
    expect(tenantReads()).toHaveLength(1);
  });
});

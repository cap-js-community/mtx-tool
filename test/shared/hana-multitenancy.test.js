"use strict";

const mockRequest = require("../../src/shared/request");
jest.mock("../../src/shared/request", () => ({
  request: jest.fn(),
}));

jest.mock("../../src/shared/logger", () => require("../__mocks/shared/logger"));

jest.mock("../../src/shared/static", () => ({
  ...jest.requireActual("../../src/shared/static"),
  sleep: jest.fn(),
}));

const { OPERATION_STATE, HanaMultitenancy } = require("../../src/shared/hana-multitenancy");
const { collectRequestMockCalls } = require("../test-util/static");

const mockCredentials = {
  baseurl: "hana-tms-host",
  uaa: {
    clientid: "clientid",
    clientsecret: "clientsecret",
    url: "uaa-url",
  },
};

const newHanaMultitenancy = () =>
  new HanaMultitenancy({ credentials: mockCredentials, getToken: () => "token" });

const mockDataResponse = (data, extra = {}) => ({
  headers: new Headers(),
  json: () => ({ data, ...extra }),
});

const testTenantId = "tenant-id-1";
const testContainerId = "container-id-1";

afterEach(() => {
  mockRequest.request.mockReset();
});

describe("constructor", () => {
  test("requires credentials with a baseurl", () => {
    expect(() => new HanaMultitenancy({ credentials: { uaa: {} }, getToken: () => "token" })).toThrow(
      /baseurl/i
    );
  });

  test("requires credentials with a uaa section", () => {
    expect(() => new HanaMultitenancy({ credentials: { baseurl: "x" }, getToken: () => "token" })).toThrow(
      /uaa/i
    );
  });

  test("requires a getToken function", () => {
    expect(() => new HanaMultitenancy({ credentials: mockCredentials })).toThrow(/getToken/i);
  });
});

describe("getTenants", () => {
  test("follows $skiptoken pagination and flattens data", async () => {
    mockRequest.request.mockReturnValueOnce(mockDataResponse([{ id: "t-1" }], { $skiptoken: "page-2" }));
    mockRequest.request.mockReturnValueOnce(mockDataResponse([{ id: "t-2" }]));

    const hana = newHanaMultitenancy();
    await expect(hana.getTenants()).resolves.toEqual([{ id: "t-1" }, { id: "t-2" }]);

    expect(collectRequestMockCalls(mockRequest.request)).toMatchInlineSnapshot(`
      [
        "GET https://hana-tms-host /tenants/v2/tenants",
        "GET https://hana-tms-host /tenants/v2/tenants { '$skiptoken': 'page-2' }",
      ]
    `);
  });

  test("builds serviceInstanceID filter and $expand", async () => {
    mockRequest.request.mockReturnValueOnce(mockDataResponse([]));

    const hana = newHanaMultitenancy();
    await hana.getTenants({ filterServiceInstanceId: "svc-1", doExpandContainers: true });

    expect(collectRequestMockCalls(mockRequest.request)).toMatchInlineSnapshot(`
      [
        "GET https://hana-tms-host /tenants/v2/tenants { serviceInstanceID: 'svc-1', '$expand': 'containers,containers/credentials' }",
      ]
    `);
  });
});

describe("getContainers", () => {
  test("requests container path with credentials expand", async () => {
    mockRequest.request.mockReturnValueOnce(mockDataResponse([{ id: testContainerId }]));

    const hana = newHanaMultitenancy();
    await expect(hana.getContainers(testTenantId, { doExpandCredentials: true })).resolves.toEqual([
      { id: testContainerId },
    ]);

    expect(collectRequestMockCalls(mockRequest.request)).toMatchInlineSnapshot(`
      [
        "GET https://hana-tms-host /tenants/v2/tenants/tenant-id-1/containers/ { '$expand': 'credentials' }",
      ]
    `);
  });
});

describe("getCredentials", () => {
  const mockCredentialData = () => [
    {
      id: "cred-1",
      credentialType: "PASSWORD",
      host: "host",
      port: "443",
      url: "jdbc:sap://host:443",
      schema: "SCHEMA",
      user: "USER",
      password: "secret",
      hdiUser: "HDI_USER",
      hdiPassword: "hdi-secret",
      certificate: "cert-chain",
    },
  ];

  test("hides sensitive fields by default", async () => {
    mockRequest.request.mockReturnValueOnce(mockDataResponse(mockCredentialData()));

    const hana = newHanaMultitenancy();
    const [cred] = await hana.getCredentials(testTenantId, testContainerId);

    const hidden = "*** show with --reveal ***";
    expect(cred).toMatchObject({
      user: "USER",
      schema: "SCHEMA",
      host: "host",
      url: hidden,
      password: hidden,
      hdiPassword: hidden,
      certificate: hidden,
    });

    expect(collectRequestMockCalls(mockRequest.request)).toMatchInlineSnapshot(`
      [
        "GET https://hana-tms-host /tenants/v2/tenants/tenant-id-1/containers/container-id-1/credentials",
      ]
    `);
  });

  test("reveals sensitive fields with doReveal", async () => {
    mockRequest.request.mockReturnValueOnce(mockDataResponse(mockCredentialData()));

    const hana = newHanaMultitenancy();
    const [cred] = await hana.getCredentials(testTenantId, testContainerId, { doReveal: true });

    expect(cred.password).toBe("secret");
    expect(cred.url).toBe("jdbc:sap://host:443");
  });
});

describe("operation states", () => {
  // NOTE: the read-only surface does not expose a polling method yet; OPERATION_STATE is exported for the
  //   create/update/delete helpers landing in a later step. Lock the terminal states here.
  test("exports terminal operation states", () => {
    expect(OPERATION_STATE.COMPLETED).toBe("COMPLETED");
    expect(OPERATION_STATE.FAILED).toBe("FAILED");
  });
});

"use strict";

const { resetMakeOneTime } = require("../../src/shared/execution-control");
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
const { outputFromLogger } = require("../test-util/static");

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
    return { cfSsh: mockCfSsh, cfBinding: { credentials: mockCredentials } };
  },
  getCachedUaaTokenFromCredentials() {
    return "token";
  },
};

const mockTmsCredentials = {
  baseurl: "tms-api-host",
  uaa: {
    certurl: "uaa-cert-url",
    clientid: "clientid",
    key: "rsa-key",
    url: "uaa-url",
    xsappname: "xsappname",
  },
};

const mockTmsContext = {
  hasHdiTmsInfo: true,
  getHdiTmsInfo() {
    return { cfSsh: mockCfSsh, cfBinding: { credentials: mockTmsCredentials } };
  },
  getCachedUaaTokenFromCredentials() {
    return "token";
  },
};

const mockTmsTenant = {
  id: "hana-tenant-id",
  name: "tenant-name",
  serviceInstanceID: "hana-instance-id",
  // NOTE: real TMS v2 tenant labels do not carry tenant_id; only the container does
  labels: ["prefix=some-prefix", `name=${testTenantId}`],
  status: { ready: true, state: "CREATE_SUCCEEDED" },
  containers: [
    {
      id: "container-id",
      type: "hdi",
      name: "container-name",
      labels: [`tenant_id=${testTenantId}`],
      status: { ready: true, state: "CREATE_SUCCEEDED" },
      credentials: [
        {
          id: "credential-id",
          host: "host",
          port: "port",
          url: "jdbc:sap://host:port",
          user: "user",
          password: "password",
          schema: "schema",
          hdiUser: "hdi-user",
          hdiPassword: "hdi-password",
        },
      ],
    },
  ],
};

describe("hdi tests", () => {
  afterEach(() => {
    resetMakeOneTime(hdi._._getServiceManager);
    resetMakeOneTime(hdi._._getHdiSharedPlanId);
  });

  test("hdi tunnel", async () => {
    mockRequest.request.mockImplementation(async ({ pathname }) => ({
      headers: new Headers(),
      async json() {
        switch (pathname) {
          case "/v2/service_offerings":
            return { items: [{ id: "service-offering-id" }] };
          case "/v2/service_plans":
            return { items: [{ id: "service-plan-id" }] };
          case "/v2/service_instances":
            return {
              items: [
                {
                  id: "service-instance-id",
                  labels: { tenant_id: [testTenantId] },
                },
              ],
            };
          case "/v2/service_bindings":
            return {
              items: [
                {
                  service_instance_id: "service-instance-id",
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
                  labels: { tenant_id: [testTenantId] },
                },
              ],
            };
        }
      },
    }));
    mockStatic.isPortFree.mockReturnValueOnce(true);
    mockCfSsh.mockReturnValueOnce();

    await expect(hdi.hdiTunnelTenant(mockContext, [testTenantId], [false])).resolves.toBeUndefined();

    expect(mockRequest.request).toHaveBeenCalledTimes(4);
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
});

describe("hdi tms (v2) tests", () => {
  afterEach(() => {
    resetMakeOneTime(hdi._._getTenantManagement);
    jest.clearAllMocks();
  });

  test("hdi tms list", async () => {
    mockRequest.request.mockImplementation(async () => ({
      headers: new Headers(),
      async json() {
        return { data: [mockTmsTenant] };
      },
    }));

    const result = await hdi.hdiList(mockTmsContext, [testTenantId], [false, false]);

    expect(mockRequest.request).toHaveBeenCalledTimes(1);
    const [[reqOptions]] = mockRequest.request.mock.calls;
    expect(reqOptions.url).toBe("https://tms-api-host");
    expect(reqOptions.pathname).toBe("/tenants/v2/tenants");
    expect(reqOptions.query.$expand).toBe("containers/credentials");
    expect(reqOptions.query.containerFilter).toBe(`hassubset(labels,["tenant_id=${testTenantId}"])`);
    expect(reqOptions.query.$filter).toBeUndefined();
    expect(result).toMatchInlineSnapshot(`
"tenant_id                             host       schema  usable
5ecc7413-2b7e-414a-9496-ad4a61f6cccf  host:port  schema  true  "
`);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("hdi tms list all without credentials", async () => {
    mockRequest.request.mockImplementation(async () => ({
      headers: new Headers(),
      async json() {
        const tenant = JSON.parse(JSON.stringify(mockTmsTenant));
        // NOTE: an unfiltered list cannot expand credentials, so containers carry no connection details
        tenant.containers[0].credentials = [{ id: "credential-id" }];
        return { data: [tenant] };
      },
    }));

    const result = await hdi.hdiList(mockTmsContext, [undefined], [false, false]);

    const [[reqOptions]] = mockRequest.request.mock.calls;
    expect(reqOptions.query.$expand).toBe("containers");
    expect(reqOptions.query.$filter).toBeUndefined();
    expect(result).toMatchInlineSnapshot(`
"#  tenant_id                             host  schema  usable
1  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  *     *       true  

* the HANA TMS v2 api only returns host/schema when scoped to one tenant, filter for a tenant id to see them"
`);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("hdi tms tunnel", async () => {
    mockRequest.request.mockImplementation(async () => ({
      headers: new Headers(),
      async json() {
        return { data: [mockTmsTenant] };
      },
    }));
    mockStatic.isPortFree.mockReturnValueOnce(true);
    mockCfSsh.mockReturnValueOnce();

    await expect(hdi.hdiTunnelTenant(mockTmsContext, [testTenantId], [false])).resolves.toBeUndefined();

    expect(mockRequest.request).toHaveBeenCalledTimes(1);
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
});

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

describe("hdi tests", () => {
  afterEach(() => {
    hdi._._reset();
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
});

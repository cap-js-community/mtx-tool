"use strict";

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

const mockRequest = require("../src/shared/request");
const mockShared = require("../src/shared/static");

const reg = require("../src/submodules/tenantRegistry");
const { anonymizeListTimestamps, outputFromLoggerPartitionFetch } = require("./util/static");

let loggerSpy = {
  info: jest.spyOn(console, "log").mockImplementation(),
  error: jest.spyOn(console, "error").mockImplementation(),
};

const fakeContext = {
  getRegInfo: () => ({
    cfService: {
      plan: "plan",
      credentials: {
        saas_registry_url: "saas_registry_url",
        appName: "appName",
      },
    },
  }),
  getCachedUaaTokenFromCredentials: () => "token",
};

const fakeSubscriptionFactory = (index) => {
  const paddedCount = String(index).padStart(3, "0");
  const paddedAltCount = String(1000 - index).padStart(3, "0");
  const uuid = `00000000-0000-0000-0000-000000000${paddedCount}`;
  const altUuid = `00000000-0000-0000-0000-000000000${paddedAltCount}`;
  const name = `skyfin-${paddedCount}`;

  return {
    url: `https://${name}.dev-afc-sap.cfapps.sap.hana.ondemand.com`,
    subdomain: name,
    appName: "afc-dev",
    commercialAppName: "afc-dev",
    consumerTenantId: uuid,
    globalAccountId: altUuid,
    subaccountId: uuid,
    subscriptionGUID: "8999d1fa-3a3e-bbf5-c21d-2db950822b8a",
    code: "standard",
    amount: 1,
    state: "SUBSCRIBED",
    createdOn: "Fri Mar 19 09:51:40 GMT 2021",
    changedOn: "Wed Apr 03 14:49:51 GMT 2024",
    internalSubscriptionId: "afc-dev!t5874_5ecc7413-2b7e-414a-9496-ad4a61f6cccf_afc-dev!t5874",
    authProviderState: "SUBSCRIBED",
    callbackState: "UPDATE_CALLBACK_SUCCEEDED",
  };
};

const fakeUpdateImplementationFactory = () => (options) => {
  const match = /\/saas-manager\/v1\/plan\/tenants\/(.*)\/subscriptions/.exec(options.pathname);
  const [, tenantId] = match;
  const jobId = "11111111" + tenantId.substring(8);
  return {
    text: async () => `Job for update subscription of application: appId and tenant: ${tenantId}, was created`,
    headers: {
      raw: () => ({
        location: [`/api/v2.0/jobs/${jobId}`],
      }),
    },
  };
};

const fakeJobImplementationFactory =
  (_, { doFail = false, doFailRequest = false } = {}) =>
  (options) => {
    const match = /\/api\/v2\.0\/jobs\/(.*)/.exec(options.pathname);
    const [, jobId] = match;
    if (doFailRequest) {
      throw new Error("server feels ill");
    }
    return {
      status: 200,
      statusText: "OK",
      json: async () => ({
        id: jobId,
        state: doFail ? "FAILED" : "SUCCEEDED",
      }),
    };
  };

describe("reg tests", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("reg list paging", async () => {
    const fakeSubscriptions = Array.from({ length: 20 }).map((x, i) => fakeSubscriptionFactory(i + 1));
    mockRequest.request.mockReturnValueOnce({
      json: () => ({ subscriptions: fakeSubscriptions.slice(0, 10), morePages: true }),
    });
    mockRequest.request.mockReturnValueOnce({
      json: () => ({ subscriptions: fakeSubscriptions.slice(10) }),
    });

    const regListOutput = await reg.registryListSubscriptions(fakeContext, [], []);
    expect(mockRequest.request.mock.calls).toMatchSnapshot();
    expect(anonymizeListTimestamps(regListOutput)).toMatchInlineSnapshot(`
      "#   consumerTenantId                      globalAccountId                       subdomain   plan      state       url                                                        
      1   00000000-0000-0000-0000-000000000001  00000000-0000-0000-0000-000000000999  skyfin-001  standard  SUBSCRIBED  https://skyfin-001.dev-afc-sap.cfapps.sap.hana.ondemand.com
      2   00000000-0000-0000-0000-000000000002  00000000-0000-0000-0000-000000000998  skyfin-002  standard  SUBSCRIBED  https://skyfin-002.dev-afc-sap.cfapps.sap.hana.ondemand.com
      3   00000000-0000-0000-0000-000000000003  00000000-0000-0000-0000-000000000997  skyfin-003  standard  SUBSCRIBED  https://skyfin-003.dev-afc-sap.cfapps.sap.hana.ondemand.com
      4   00000000-0000-0000-0000-000000000004  00000000-0000-0000-0000-000000000996  skyfin-004  standard  SUBSCRIBED  https://skyfin-004.dev-afc-sap.cfapps.sap.hana.ondemand.com
      5   00000000-0000-0000-0000-000000000005  00000000-0000-0000-0000-000000000995  skyfin-005  standard  SUBSCRIBED  https://skyfin-005.dev-afc-sap.cfapps.sap.hana.ondemand.com
      6   00000000-0000-0000-0000-000000000006  00000000-0000-0000-0000-000000000994  skyfin-006  standard  SUBSCRIBED  https://skyfin-006.dev-afc-sap.cfapps.sap.hana.ondemand.com
      7   00000000-0000-0000-0000-000000000007  00000000-0000-0000-0000-000000000993  skyfin-007  standard  SUBSCRIBED  https://skyfin-007.dev-afc-sap.cfapps.sap.hana.ondemand.com
      8   00000000-0000-0000-0000-000000000008  00000000-0000-0000-0000-000000000992  skyfin-008  standard  SUBSCRIBED  https://skyfin-008.dev-afc-sap.cfapps.sap.hana.ondemand.com
      9   00000000-0000-0000-0000-000000000009  00000000-0000-0000-0000-000000000991  skyfin-009  standard  SUBSCRIBED  https://skyfin-009.dev-afc-sap.cfapps.sap.hana.ondemand.com
      10  00000000-0000-0000-0000-000000000010  00000000-0000-0000-0000-000000000990  skyfin-010  standard  SUBSCRIBED  https://skyfin-010.dev-afc-sap.cfapps.sap.hana.ondemand.com
      11  00000000-0000-0000-0000-000000000011  00000000-0000-0000-0000-000000000989  skyfin-011  standard  SUBSCRIBED  https://skyfin-011.dev-afc-sap.cfapps.sap.hana.ondemand.com
      12  00000000-0000-0000-0000-000000000012  00000000-0000-0000-0000-000000000988  skyfin-012  standard  SUBSCRIBED  https://skyfin-012.dev-afc-sap.cfapps.sap.hana.ondemand.com
      13  00000000-0000-0000-0000-000000000013  00000000-0000-0000-0000-000000000987  skyfin-013  standard  SUBSCRIBED  https://skyfin-013.dev-afc-sap.cfapps.sap.hana.ondemand.com
      14  00000000-0000-0000-0000-000000000014  00000000-0000-0000-0000-000000000986  skyfin-014  standard  SUBSCRIBED  https://skyfin-014.dev-afc-sap.cfapps.sap.hana.ondemand.com
      15  00000000-0000-0000-0000-000000000015  00000000-0000-0000-0000-000000000985  skyfin-015  standard  SUBSCRIBED  https://skyfin-015.dev-afc-sap.cfapps.sap.hana.ondemand.com
      16  00000000-0000-0000-0000-000000000016  00000000-0000-0000-0000-000000000984  skyfin-016  standard  SUBSCRIBED  https://skyfin-016.dev-afc-sap.cfapps.sap.hana.ondemand.com
      17  00000000-0000-0000-0000-000000000017  00000000-0000-0000-0000-000000000983  skyfin-017  standard  SUBSCRIBED  https://skyfin-017.dev-afc-sap.cfapps.sap.hana.ondemand.com
      18  00000000-0000-0000-0000-000000000018  00000000-0000-0000-0000-000000000982  skyfin-018  standard  SUBSCRIBED  https://skyfin-018.dev-afc-sap.cfapps.sap.hana.ondemand.com
      19  00000000-0000-0000-0000-000000000019  00000000-0000-0000-0000-000000000981  skyfin-019  standard  SUBSCRIBED  https://skyfin-019.dev-afc-sap.cfapps.sap.hana.ondemand.com
      20  00000000-0000-0000-0000-000000000020  00000000-0000-0000-0000-000000000980  skyfin-020  standard  SUBSCRIBED  https://skyfin-020.dev-afc-sap.cfapps.sap.hana.ondemand.com"
    `);
    expect(loggerSpy.info).toHaveBeenCalledTimes(0);
    expect(loggerSpy.error).toHaveBeenCalledTimes(0);
  });

  test("reg update without failure", async () => {
    const n = 4;
    const fakeSubscriptions = Array.from({ length: n }).map((x, i) => fakeSubscriptionFactory(i + 1));
    mockRequest.request.mockReturnValueOnce({
      json: () => ({ subscriptions: fakeSubscriptions }),
    });
    for (let index = 0; index < n; index++) {
      mockRequest.request.mockImplementationOnce(fakeUpdateImplementationFactory(index));
    }
    for (let index = 0; index < n; index++) {
      mockRequest.request.mockImplementationOnce(fakeJobImplementationFactory(index));
    }

    await reg.registryUpdateAllDependencies(fakeContext, undefined, [false]);

    expect(mockRequest.request).toHaveBeenCalledTimes(1 + n * 2);

    expect(mockShared.sleep.mock.calls).toMatchSnapshot();

    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "response: Job for update subscription of application: appId and tenant: 00000000-0000-0000-0000-000000000001, was created
      polling job /api/v2.0/jobs/11111111-0000-0000-0000-000000000001 with interval 15sec
      response: Job for update subscription of application: appId and tenant: 00000000-0000-0000-0000-000000000002, was created
      polling job /api/v2.0/jobs/11111111-0000-0000-0000-000000000002 with interval 15sec
      response: Job for update subscription of application: appId and tenant: 00000000-0000-0000-0000-000000000003, was created
      polling job /api/v2.0/jobs/11111111-0000-0000-0000-000000000003 with interval 15sec
      response: Job for update subscription of application: appId and tenant: 00000000-0000-0000-0000-000000000004, was created
      polling job /api/v2.0/jobs/11111111-0000-0000-0000-000000000004 with interval 15sec
      [
        {
          "tenantId": "00000000-0000-0000-0000-000000000001",
          "jobId": "11111111-0000-0000-0000-000000000001",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "00000000-0000-0000-0000-000000000002",
          "jobId": "11111111-0000-0000-0000-000000000002",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "00000000-0000-0000-0000-000000000003",
          "jobId": "11111111-0000-0000-0000-000000000003",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "00000000-0000-0000-0000-000000000004",
          "jobId": "11111111-0000-0000-0000-000000000004",
          "state": "SUCCEEDED"
        }
      ]
      "
    `);
    expect(loggerSpy.error).toHaveBeenCalledTimes(0);
  });

  test("reg update with state failed", async () => {
    const n = 4;
    const fakeSubscriptions = Array.from({ length: n }).map((x, i) => fakeSubscriptionFactory(i + 1));
    mockRequest.request.mockReturnValueOnce({
      json: () => ({ subscriptions: fakeSubscriptions }),
    });
    for (let index = 0; index < n; index++) {
      mockRequest.request.mockImplementationOnce(fakeUpdateImplementationFactory(index));
    }
    for (let index = 0; index < n; index++) {
      mockRequest.request.mockImplementationOnce(fakeJobImplementationFactory(index, { doFail: index === n / 2 }));
    }

    let caughtErr;
    try {
      await reg.registryUpdateAllDependencies(fakeContext, undefined, [false]);
    } catch (err) {
      caughtErr = err;
    }

    expect(mockRequest.request).toHaveBeenCalledTimes(1 + n * 2);

    expect(caughtErr).toBeDefined();
    expect(caughtErr.message).toMatchInlineSnapshot(`"registry PATCH failed for some tenant"`);

    expect(mockShared.sleep.mock.calls).toMatchSnapshot();

    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "response: Job for update subscription of application: appId and tenant: 00000000-0000-0000-0000-000000000001, was created
      polling job /api/v2.0/jobs/11111111-0000-0000-0000-000000000001 with interval 15sec
      response: Job for update subscription of application: appId and tenant: 00000000-0000-0000-0000-000000000002, was created
      polling job /api/v2.0/jobs/11111111-0000-0000-0000-000000000002 with interval 15sec
      response: Job for update subscription of application: appId and tenant: 00000000-0000-0000-0000-000000000003, was created
      polling job /api/v2.0/jobs/11111111-0000-0000-0000-000000000003 with interval 15sec
      response: Job for update subscription of application: appId and tenant: 00000000-0000-0000-0000-000000000004, was created
      polling job /api/v2.0/jobs/11111111-0000-0000-0000-000000000004 with interval 15sec
      [
        {
          "tenantId": "00000000-0000-0000-0000-000000000001",
          "jobId": "11111111-0000-0000-0000-000000000001",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "00000000-0000-0000-0000-000000000002",
          "jobId": "11111111-0000-0000-0000-000000000002",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "00000000-0000-0000-0000-000000000003",
          "jobId": "11111111-0000-0000-0000-000000000003",
          "state": "FAILED"
        },
        {
          "tenantId": "00000000-0000-0000-0000-000000000004",
          "jobId": "11111111-0000-0000-0000-000000000004",
          "state": "SUCCEEDED"
        }
      ]
      "
    `);
    expect(loggerSpy.error).toHaveBeenCalledTimes(0);
  });

  test("reg update with request failed", async () => {
    const n = 4;
    const fakeSubscriptions = Array.from({ length: n }).map((x, i) => fakeSubscriptionFactory(i + 1));
    mockRequest.request.mockReturnValueOnce({
      json: () => ({ subscriptions: fakeSubscriptions }),
    });
    for (let index = 0; index < n; index++) {
      mockRequest.request.mockImplementationOnce(fakeUpdateImplementationFactory(index));
    }
    for (let index = 0; index < n; index++) {
      mockRequest.request.mockImplementationOnce(
        fakeJobImplementationFactory(index, { doFailRequest: index === n / 2 })
      );
    }

    let caughtErr;
    try {
      await reg.registryUpdateAllDependencies(fakeContext, undefined, [false]);
    } catch (err) {
      caughtErr = err;
    }

    expect(mockRequest.request).toHaveBeenCalledTimes(1 + n * 2);

    expect(caughtErr).toBeDefined();
    expect(caughtErr.message).toMatchInlineSnapshot(`"server feels ill"`);

    expect(mockShared.sleep.mock.calls).toMatchSnapshot();

    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "response: Job for update subscription of application: appId and tenant: 00000000-0000-0000-0000-000000000001, was created
      polling job /api/v2.0/jobs/11111111-0000-0000-0000-000000000001 with interval 15sec
      response: Job for update subscription of application: appId and tenant: 00000000-0000-0000-0000-000000000002, was created
      polling job /api/v2.0/jobs/11111111-0000-0000-0000-000000000002 with interval 15sec
      response: Job for update subscription of application: appId and tenant: 00000000-0000-0000-0000-000000000003, was created
      polling job /api/v2.0/jobs/11111111-0000-0000-0000-000000000003 with interval 15sec
      response: Job for update subscription of application: appId and tenant: 00000000-0000-0000-0000-000000000004, was created
      polling job /api/v2.0/jobs/11111111-0000-0000-0000-000000000004 with interval 15sec
      "
    `);
    expect(loggerSpy.error).toHaveBeenCalledTimes(0);
  });
});

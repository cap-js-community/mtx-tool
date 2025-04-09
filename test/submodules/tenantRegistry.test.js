"use strict";

const mockRequest = require("../../src/shared/request");
jest.mock("../../src/shared/request", () => ({
  request: jest.fn(),
}));
const mockShared = require("../../src/shared/static");
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

const reg = require("../../src/submodules/tenantRegistry");
const { outputFromLoggerPartitionFetch } = require("../test-util/static");

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

const fakeSubscriptionFactory = (index, { doFail, doRecent } = {}) => {
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
    state: doFail ? "UPDATE_FAILED" : "SUBSCRIBED",
    createdOn: "Fri Mar 19 09:51:40 GMT 2021",
    changedOn: doRecent ? new Date().toUTCString() : "Wed Apr 03 14:49:51 GMT 2024",
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
  test.each([
    ["unfiltered", false, false],
    ["only stale", true, false],
    ["only failed", false, true],
    ["only stale and failed", true, true],
  ])("reg list paging %s", async (_, doOnlyStale, doOnlyFail) => {
    const fakeSubscriptions = Array.from({ length: 20 }).map((x, i) =>
      fakeSubscriptionFactory(i + 1, { doFail: i + 1 <= 2 || i + 1 >= 19, doRecent: i + 1 >= 15 })
    );
    mockRequest.request.mockReturnValueOnce({
      json: () => ({ subscriptions: fakeSubscriptions.slice(0, 10), morePages: true }),
    });
    mockRequest.request.mockReturnValueOnce({
      json: () => ({ subscriptions: fakeSubscriptions.slice(10) }),
    });

    const regListOutput = await reg.registryListSubscriptions(fakeContext, [], [false, false, doOnlyStale, doOnlyFail]);
    expect(mockRequest.request.mock.calls).toMatchSnapshot();
    expect(regListOutput).toMatchSnapshot();
    expect(mockLogger.info).toHaveBeenCalledTimes(0);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
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

    await reg.registryUpdateAllDependencies(fakeContext, undefined, []);

    expect(mockRequest.request).toHaveBeenCalledTimes(1 + n * 2);

    expect(mockShared.sleep.mock.calls).toMatchSnapshot();

    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
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
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
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
      await reg.registryUpdateAllDependencies(fakeContext, undefined, []);
    } catch (err) {
      caughtErr = err;
    }

    expect(mockRequest.request).toHaveBeenCalledTimes(1 + n * 2);

    expect(caughtErr).toBeDefined();
    expect(caughtErr.message).toMatchInlineSnapshot(`"registry PATCH failed for some tenant"`);

    expect(mockShared.sleep.mock.calls).toMatchSnapshot();

    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
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
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
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
      await reg.registryUpdateAllDependencies(fakeContext, undefined, []);
    } catch (err) {
      caughtErr = err;
    }

    expect(mockRequest.request).toHaveBeenCalledTimes(1 + n * 2);

    expect(caughtErr).toBeDefined();
    expect(caughtErr.message).toMatchInlineSnapshot(`"server feels ill"`);

    expect(mockShared.sleep.mock.calls).toMatchSnapshot();

    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
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
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });
});

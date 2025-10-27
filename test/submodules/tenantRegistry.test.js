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
const { outputFromLogger } = require("../test-util/static");

const fakeContextOnlyReg = {
  hasRegInfo: true,
  getRegInfo: () => ({
    cfService: {
      plan: "planReg",
      credentials: {
        saas_registry_url: "saas_registry_url",
        appName: "appNameReg",
      },
    },
  }),
  getCachedUaaTokenFromCredentials: () => "token",
};

const fakeContextMixed = {
  hasSmsInfo: true,
  hasRegInfo: true,
  getSmsInfo: () => ({
    cfService: {
      plan: "planSms",
      credentials: {
        subscription_manager_url: "subscription_manager_url",
        app_name: "appNameSms",
      },
    },
  }),
  getRegInfo: () => ({
    cfService: {
      plan: "planReg",
      credentials: {
        saas_registry_url: "saas_registry_url",
        appName: "appNameReg",
      },
    },
  }),
  getCachedUaaTokenFromCredentials: () => "token",
};

const fakeSmsSubscriptionFactory = (index, { doFail, doRecent } = {}) => {
  const paddedCount = String(index).padStart(4, "0");
  const paddedAltCount = String(10000 - index).padStart(4, "0");
  const tenantId = `00000000-0000-0000-0000-00000000${paddedCount}`;
  const accountId = `00000000-0000-0000-0000-00000000${paddedAltCount}`;
  const subscriptionId = `00000000-0000-0000-0000-${paddedCount}00000000`;
  const name = `skyfin-${paddedCount}`;
  const state = doFail ? "UPDATE_FAILED" : "SUBSCRIBED";
  const changedOn = doRecent ? new Date().toUTCString() : "Wed Apr 03 14:49:51 GMT 2024";

  return {
    subscriptionId: "00000000-0000-0000-0000-000000000000",
    subscriptionGUID: subscriptionId,
    subscriptionUrl: `https://${name}.dev-afc-sap.cfapps.sap.hana.ondemand.com`,
    subscriptionState: state,
    subscriptionPlanName: "standard",
    subscriber: {
      zoneId: tenantId,
      app_tid: tenantId,
      subaccountId: tenantId,
      subaccountSubdomain: name,
      globalAccountId: accountId,
      licenseType: "SAPDEV",
    },
    provider: {
      appName: "afc-dev-sms",
      commercialAppName: "afc-dev",
      iasServiceInstanceId: "00000000-0000-0000-0000-000000000000",
      zoneId: "00000000-0000-0000-0000-000000000000",
      app_tid: "00000000-0000-0000-0000-000000000000",
    },
    iasAppRefId: "00000000-0000-0000-0000-000000000000",
    iasAppRefState: "SUBSCRIBED",
    iasServiceInstanceId: "00000000-0000-0000-0000-000000000000",
    callbackState: "UPDATE_CALLBACK_SUCCEEDED",
    createdDate: "Fri Sep 19 09:15:52 UTC 2025",
    createdBy: "sb-afc-dev-sms-clone!b5874|lps-registry-broker!b13",
    modifiedDate: changedOn,
    modifiedBy: "sb-afc-dev-sms-clone!b5874|lps-registry-broker!b13",
  };
};

const fakeRegSubscriptionFactory = (index, { doFail, doRecent } = {}) => {
  const paddedCount = String(index).padStart(4, "0");
  const paddedAltCount = String(10000 - index).padStart(4, "0");
  const tenantId = `00000000-0000-0000-0000-00000000${paddedCount}`;
  const accountId = `00000000-0000-0000-0000-00000000${paddedAltCount}`;
  const subscriptionId = `00000000-0000-0000-0000-${paddedCount}00000000`;
  const name = `skyfin-${paddedCount}`;
  const state = doFail ? "UPDATE_FAILED" : "SUBSCRIBED";
  const changedOn = doRecent ? new Date().toUTCString() : "Wed Apr 03 14:49:51 GMT 2024";

  return {
    url: `https://${name}.dev-afc-sap.cfapps.sap.hana.ondemand.com`,
    subdomain: name,
    appName: "afc-dev",
    commercialAppName: "afc-dev",
    consumerTenantId: tenantId,
    globalAccountId: accountId,
    subaccountId: tenantId,
    subscriptionGUID: subscriptionId,
    code: "standard",
    amount: 1,
    state,
    createdOn: "Fri Mar 19 09:51:40 GMT 2021",
    changedOn,
    internalSubscriptionId: "afc-dev!t5874_5ecc7413-2b7e-414a-9496-ad4a61f6cccf_afc-dev!t5874",
    authProviderState: "SUBSCRIBED",
    callbackState: "UPDATE_CALLBACK_SUCCEEDED",
  };
};

const fakeRegUpdateImplementationFactory = () => (options) => {
  const match = /\/saas-manager\/v1\/application\/tenants\/(.*)\/subscriptions/.exec(options.pathname);
  const [, tenantId] = match;
  const jobId = "11111111" + tenantId.substring(8);
  return {
    status: 202,
    statusText: "Accepted",
    text: async () => `Job for update subscription of application: appId and tenant: ${tenantId}, was created`,
    headers: {
      raw: () => ({
        location: [`/api/v2.0/jobs/${jobId}`],
      }),
    },
  };
};

const fakeRegJobImplementationFactory =
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
  describe("only reg", () => {
    test.each([
      ["unfiltered", false, false],
      ["only stale", true, false],
      ["only failed", false, true],
      ["only stale and failed", true, true],
    ])("reg list paging %s", async (_, doOnlyStale, doOnlyFail) => {
      const fakeSubscriptions = Array.from({ length: 10 }).map((x, i) =>
        fakeRegSubscriptionFactory(i + 1, { doFail: i + 1 <= 2 || i + 1 >= 9, doRecent: i + 1 >= 6 })
      );
      mockRequest.request.mockReturnValueOnce({
        json: () => ({ subscriptions: fakeSubscriptions.slice(0, 5), morePages: true }),
      });
      mockRequest.request.mockReturnValueOnce({
        json: () => ({ subscriptions: fakeSubscriptions.slice(5) }),
      });

      const regListOutput = await reg.registryListSubscriptions(
        fakeContextOnlyReg,
        [],
        [false, false, doOnlyStale, doOnlyFail]
      );
      expect(mockRequest.request.mock.calls).toMatchSnapshot();
      expect(regListOutput).toMatchSnapshot();
      expect(mockLogger.info).toHaveBeenCalledTimes(0);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("reg update without failure", async () => {
      const n = 4;
      const fakeSubscriptions = Array.from({ length: n }).map((x, i) => fakeRegSubscriptionFactory(i + 1));
      mockRequest.request.mockReturnValueOnce({
        json: () => ({ subscriptions: fakeSubscriptions }),
      });
      for (let index = 0; index < n; index++) {
        mockRequest.request.mockImplementationOnce(fakeRegUpdateImplementationFactory(index));
      }
      for (let index = 0; index < n; index++) {
        mockRequest.request.mockImplementationOnce(fakeRegJobImplementationFactory(index));
      }

      await expect(reg.registryUpdateAllDependencies(fakeContextOnlyReg, undefined, [])).resolves
        .toMatchInlineSnapshot(`
            [
              {
                "duration": "0 sec",
                "jobId": "11111111-0000-0000-0000-000000000001",
                "jobState": "SUCCEEDED",
                "tenantId": "00000000-0000-0000-0000-000000000001",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "11111111-0000-0000-0000-000000000002",
                "jobState": "SUCCEEDED",
                "tenantId": "00000000-0000-0000-0000-000000000002",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "11111111-0000-0000-0000-000000000003",
                "jobState": "SUCCEEDED",
                "tenantId": "00000000-0000-0000-0000-000000000003",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "11111111-0000-0000-0000-000000000004",
                "jobState": "SUCCEEDED",
                "tenantId": "00000000-0000-0000-0000-000000000004",
                Symbol(IS_SUCCESS): true,
              },
            ]
          `);

      expect(mockRequest.request).toHaveBeenCalledTimes(1 + n * 2);

      expect(mockShared.sleep.mock.calls).toMatchSnapshot();

      expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "polling subscription /api/v2.0/jobs/11111111-0000-0000-0000-000000000001 with interval 15sec
      polling subscription /api/v2.0/jobs/11111111-0000-0000-0000-000000000002 with interval 15sec
      polling subscription /api/v2.0/jobs/11111111-0000-0000-0000-000000000003 with interval 15sec
      polling subscription /api/v2.0/jobs/11111111-0000-0000-0000-000000000004 with interval 15sec"
    `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("reg update with state failed", async () => {
      const n = 4;
      const fakeSubscriptions = Array.from({ length: n }).map((x, i) => fakeRegSubscriptionFactory(i + 1));
      mockRequest.request.mockReturnValueOnce({
        json: () => ({ subscriptions: fakeSubscriptions }),
      });
      for (let index = 0; index < n; index++) {
        mockRequest.request.mockImplementationOnce(fakeRegUpdateImplementationFactory(index));
      }
      for (let index = 0; index < n; index++) {
        mockRequest.request.mockImplementationOnce(fakeRegJobImplementationFactory(index, { doFail: index === n / 2 }));
      }

      let caughtErr;
      try {
        await reg.registryUpdateAllDependencies(fakeContextOnlyReg, undefined, []);
      } catch (err) {
        caughtErr = err;
      }

      expect(mockRequest.request).toHaveBeenCalledTimes(1 + n * 2);

      expect(caughtErr).toBeDefined();
      expect(caughtErr.message).toMatchInlineSnapshot(`"call failed for tenants 00000000-0000-0000-0000-000000000003"`);

      expect(mockShared.sleep.mock.calls).toMatchSnapshot();

      expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "polling subscription /api/v2.0/jobs/11111111-0000-0000-0000-000000000001 with interval 15sec
      polling subscription /api/v2.0/jobs/11111111-0000-0000-0000-000000000002 with interval 15sec
      polling subscription /api/v2.0/jobs/11111111-0000-0000-0000-000000000003 with interval 15sec
      polling subscription /api/v2.0/jobs/11111111-0000-0000-0000-000000000004 with interval 15sec"
    `);
      expect(outputFromLogger(mockLogger.error.mock.calls)).toMatchInlineSnapshot(`
      "[
        {
          "tenantId": "00000000-0000-0000-0000-000000000001",
          "duration": "0 sec",
          "jobId": "11111111-0000-0000-0000-000000000001",
          "jobState": "SUCCEEDED"
        },
        {
          "tenantId": "00000000-0000-0000-0000-000000000002",
          "duration": "0 sec",
          "jobId": "11111111-0000-0000-0000-000000000002",
          "jobState": "SUCCEEDED"
        },
        {
          "tenantId": "00000000-0000-0000-0000-000000000003",
          "duration": "0 sec",
          "jobId": "11111111-0000-0000-0000-000000000003",
          "jobState": "FAILED"
        },
        {
          "tenantId": "00000000-0000-0000-0000-000000000004",
          "duration": "0 sec",
          "jobId": "11111111-0000-0000-0000-000000000004",
          "jobState": "SUCCEEDED"
        }
      ]"
    `);
    });

    test("reg update with request failed", async () => {
      const n = 4;
      const fakeSubscriptions = Array.from({ length: n }).map((x, i) => fakeRegSubscriptionFactory(i + 1));
      mockRequest.request.mockReturnValueOnce({
        json: () => ({ subscriptions: fakeSubscriptions }),
      });
      for (let index = 0; index < n; index++) {
        mockRequest.request.mockImplementationOnce(fakeRegUpdateImplementationFactory(index));
      }
      for (let index = 0; index < n; index++) {
        mockRequest.request.mockImplementationOnce(
          fakeRegJobImplementationFactory(index, { doFailRequest: index === n / 2 })
        );
      }

      let caughtErr;
      try {
        await reg.registryUpdateAllDependencies(fakeContextOnlyReg, undefined, []);
      } catch (err) {
        caughtErr = err;
      }

      expect(mockRequest.request).toHaveBeenCalledTimes(1 + n * 2);

      expect(caughtErr).toBeDefined();
      expect(caughtErr.message).toMatchInlineSnapshot(`"call failed for tenants 00000000-0000-0000-0000-000000000003"`);

      expect(mockShared.sleep.mock.calls).toMatchSnapshot();

      expect(outputFromLogger(mockLogger.error.mock.calls)).toMatchInlineSnapshot(`
      "[
        {
          "tenantId": "00000000-0000-0000-0000-000000000001",
          "duration": "0 sec",
          "jobId": "11111111-0000-0000-0000-000000000001",
          "jobState": "SUCCEEDED"
        },
        {
          "tenantId": "00000000-0000-0000-0000-000000000002",
          "duration": "0 sec",
          "jobId": "11111111-0000-0000-0000-000000000002",
          "jobState": "SUCCEEDED"
        },
        {
          "tenantId": "00000000-0000-0000-0000-000000000003",
          "duration": "0 sec",
          "error": "server feels ill"
        },
        {
          "tenantId": "00000000-0000-0000-0000-000000000004",
          "duration": "0 sec",
          "jobId": "11111111-0000-0000-0000-000000000004",
          "jobState": "SUCCEEDED"
        }
      ]"
    `);
      expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "polling subscription /api/v2.0/jobs/11111111-0000-0000-0000-000000000001 with interval 15sec
      polling subscription /api/v2.0/jobs/11111111-0000-0000-0000-000000000002 with interval 15sec
      polling subscription /api/v2.0/jobs/11111111-0000-0000-0000-000000000003 with interval 15sec
      polling subscription /api/v2.0/jobs/11111111-0000-0000-0000-000000000004 with interval 15sec"
    `);
    });
  });
  describe("mixed reg and sms", () => {
    test.each([
      ["unfiltered", false, false],
      ["only stale", true, false],
      ["only failed", false, true],
      ["only stale and failed", true, true],
    ])("reg list paging %s", async (_, doOnlyStale, doOnlyFail) => {
      const fakeSmsSubscriptions = Array.from({ length: 10 }).map((x, i) =>
        fakeSmsSubscriptionFactory(i + 1, { doFail: i + 1 <= 2 || i + 1 >= 9, doRecent: i + 1 >= 6 })
      );
      const fakeRegSubscriptions = Array.from({ length: 10 }).map((x, i) =>
        fakeRegSubscriptionFactory(10 + i + 1, { doFail: i + 1 <= 2 || i + 1 >= 9, doRecent: i + 1 >= 6 })
      );
      const firstResponse = (reqOptions) => ({
        json: () => ({
          subscriptions:
            reqOptions.url === "subscription_manager_url"
              ? fakeSmsSubscriptions.slice(0, 5)
              : fakeRegSubscriptions.slice(0, 5),
          morePages: true,
        }),
      });
      const secondResponse = (reqOptions) => ({
        json: () => ({
          subscriptions:
            reqOptions.url === "subscription_manager_url"
              ? fakeSmsSubscriptions.slice(5)
              : fakeRegSubscriptions.slice(5),
        }),
      });
      mockRequest.request.mockImplementationOnce(firstResponse);
      mockRequest.request.mockImplementationOnce(firstResponse);
      mockRequest.request.mockImplementationOnce(secondResponse);
      mockRequest.request.mockImplementationOnce(secondResponse);

      const regListOutput = await reg.registryListSubscriptions(
        fakeContextMixed,
        [],
        [false, false, doOnlyStale, doOnlyFail]
      );
      expect(mockRequest.request.mock.calls).toMatchSnapshot();
      expect(regListOutput).toMatchSnapshot();
      expect(mockLogger.info).toHaveBeenCalledTimes(0);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    // test("reg update without failure", async () => {
    //   const n = 4;
    //   const fakeSubscriptions = Array.from({ length: n }).map((x, i) => fakeRegSubscriptionFactory(i + 1));
    //   mockRequest.request.mockReturnValueOnce({
    //     json: () => ({ subscriptions: fakeSubscriptions }),
    //   });
    //   for (let index = 0; index < n; index++) {
    //     mockRequest.request.mockImplementationOnce(fakeRegUpdateImplementationFactory(index));
    //   }
    //   for (let index = 0; index < n; index++) {
    //     mockRequest.request.mockImplementationOnce(fakeRegJobImplementationFactory(index));
    //   }
    //
    //   await expect(reg.registryUpdateAllDependencies(fakeContextOnlyReg, undefined, [])).resolves
    //     .toMatchInlineSnapshot(`
    //         [
    //           {
    //             "duration": "0 sec",
    //             "jobId": "11111111-0000-0000-0000-000000000001",
    //             "jobState": "SUCCEEDED",
    //             "tenantId": "00000000-0000-0000-0000-000000000001",
    //             Symbol(IS_SUCCESS): true,
    //           },
    //           {
    //             "duration": "0 sec",
    //             "jobId": "11111111-0000-0000-0000-000000000002",
    //             "jobState": "SUCCEEDED",
    //             "tenantId": "00000000-0000-0000-0000-000000000002",
    //             Symbol(IS_SUCCESS): true,
    //           },
    //           {
    //             "duration": "0 sec",
    //             "jobId": "11111111-0000-0000-0000-000000000003",
    //             "jobState": "SUCCEEDED",
    //             "tenantId": "00000000-0000-0000-0000-000000000003",
    //             Symbol(IS_SUCCESS): true,
    //           },
    //           {
    //             "duration": "0 sec",
    //             "jobId": "11111111-0000-0000-0000-000000000004",
    //             "jobState": "SUCCEEDED",
    //             "tenantId": "00000000-0000-0000-0000-000000000004",
    //             Symbol(IS_SUCCESS): true,
    //           },
    //         ]
    //       `);
    //
    //   expect(mockRequest.request).toHaveBeenCalledTimes(1 + n * 2);
    //
    //   expect(mockShared.sleep.mock.calls).toMatchSnapshot();
    //
    //   expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
    //   "polling subscription /api/v2.0/jobs/11111111-0000-0000-0000-000000000001 with interval 15sec
    //   polling subscription /api/v2.0/jobs/11111111-0000-0000-0000-000000000002 with interval 15sec
    //   polling subscription /api/v2.0/jobs/11111111-0000-0000-0000-000000000003 with interval 15sec
    //   polling subscription /api/v2.0/jobs/11111111-0000-0000-0000-000000000004 with interval 15sec"
    // `);
    //   expect(mockLogger.error).toHaveBeenCalledTimes(0);
    // });
    //
    // test("reg update with state failed", async () => {
    //   const n = 4;
    //   const fakeSubscriptions = Array.from({ length: n }).map((x, i) => fakeRegSubscriptionFactory(i + 1));
    //   mockRequest.request.mockReturnValueOnce({
    //     json: () => ({ subscriptions: fakeSubscriptions }),
    //   });
    //   for (let index = 0; index < n; index++) {
    //     mockRequest.request.mockImplementationOnce(fakeRegUpdateImplementationFactory(index));
    //   }
    //   for (let index = 0; index < n; index++) {
    //     mockRequest.request.mockImplementationOnce(fakeRegJobImplementationFactory(index, { doFail: index === n / 2 }));
    //   }
    //
    //   let caughtErr;
    //   try {
    //     await reg.registryUpdateAllDependencies(fakeContextOnlyReg, undefined, []);
    //   } catch (err) {
    //     caughtErr = err;
    //   }
    //
    //   expect(mockRequest.request).toHaveBeenCalledTimes(1 + n * 2);
    //
    //   expect(caughtErr).toBeDefined();
    //   expect(caughtErr.message).toMatchInlineSnapshot(`"call failed for tenants 00000000-0000-0000-0000-000000000003"`);
    //
    //   expect(mockShared.sleep.mock.calls).toMatchSnapshot();
    //
    //   expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
    //   "polling subscription /api/v2.0/jobs/11111111-0000-0000-0000-000000000001 with interval 15sec
    //   polling subscription /api/v2.0/jobs/11111111-0000-0000-0000-000000000002 with interval 15sec
    //   polling subscription /api/v2.0/jobs/11111111-0000-0000-0000-000000000003 with interval 15sec
    //   polling subscription /api/v2.0/jobs/11111111-0000-0000-0000-000000000004 with interval 15sec"
    // `);
    //   expect(outputFromLogger(mockLogger.error.mock.calls)).toMatchInlineSnapshot(`
    //   "[
    //     {
    //       "tenantId": "00000000-0000-0000-0000-000000000001",
    //       "duration": "0 sec",
    //       "jobId": "11111111-0000-0000-0000-000000000001",
    //       "jobState": "SUCCEEDED"
    //     },
    //     {
    //       "tenantId": "00000000-0000-0000-0000-000000000002",
    //       "duration": "0 sec",
    //       "jobId": "11111111-0000-0000-0000-000000000002",
    //       "jobState": "SUCCEEDED"
    //     },
    //     {
    //       "tenantId": "00000000-0000-0000-0000-000000000003",
    //       "duration": "0 sec",
    //       "jobId": "11111111-0000-0000-0000-000000000003",
    //       "jobState": "FAILED"
    //     },
    //     {
    //       "tenantId": "00000000-0000-0000-0000-000000000004",
    //       "duration": "0 sec",
    //       "jobId": "11111111-0000-0000-0000-000000000004",
    //       "jobState": "SUCCEEDED"
    //     }
    //   ]"
    // `);
    // });
    //
    // test("reg update with request failed", async () => {
    //   const n = 4;
    //   const fakeSubscriptions = Array.from({ length: n }).map((x, i) => fakeRegSubscriptionFactory(i + 1));
    //   mockRequest.request.mockReturnValueOnce({
    //     json: () => ({ subscriptions: fakeSubscriptions }),
    //   });
    //   for (let index = 0; index < n; index++) {
    //     mockRequest.request.mockImplementationOnce(fakeRegUpdateImplementationFactory(index));
    //   }
    //   for (let index = 0; index < n; index++) {
    //     mockRequest.request.mockImplementationOnce(
    //       fakeRegJobImplementationFactory(index, { doFailRequest: index === n / 2 })
    //     );
    //   }
    //
    //   let caughtErr;
    //   try {
    //     await reg.registryUpdateAllDependencies(fakeContextOnlyReg, undefined, []);
    //   } catch (err) {
    //     caughtErr = err;
    //   }
    //
    //   expect(mockRequest.request).toHaveBeenCalledTimes(1 + n * 2);
    //
    //   expect(caughtErr).toBeDefined();
    //   expect(caughtErr.message).toMatchInlineSnapshot(`"call failed for tenants 00000000-0000-0000-0000-000000000003"`);
    //
    //   expect(mockShared.sleep.mock.calls).toMatchSnapshot();
    //
    //   expect(outputFromLogger(mockLogger.error.mock.calls)).toMatchInlineSnapshot(`
    //   "[
    //     {
    //       "tenantId": "00000000-0000-0000-0000-000000000001",
    //       "duration": "0 sec",
    //       "jobId": "11111111-0000-0000-0000-000000000001",
    //       "jobState": "SUCCEEDED"
    //     },
    //     {
    //       "tenantId": "00000000-0000-0000-0000-000000000002",
    //       "duration": "0 sec",
    //       "jobId": "11111111-0000-0000-0000-000000000002",
    //       "jobState": "SUCCEEDED"
    //     },
    //     {
    //       "tenantId": "00000000-0000-0000-0000-000000000003",
    //       "duration": "0 sec",
    //       "error": "server feels ill"
    //     },
    //     {
    //       "tenantId": "00000000-0000-0000-0000-000000000004",
    //       "duration": "0 sec",
    //       "jobId": "11111111-0000-0000-0000-000000000004",
    //       "jobState": "SUCCEEDED"
    //     }
    //   ]"
    // `);
    //   expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
    //   "polling subscription /api/v2.0/jobs/11111111-0000-0000-0000-000000000001 with interval 15sec
    //   polling subscription /api/v2.0/jobs/11111111-0000-0000-0000-000000000002 with interval 15sec
    //   polling subscription /api/v2.0/jobs/11111111-0000-0000-0000-000000000003 with interval 15sec
    //   polling subscription /api/v2.0/jobs/11111111-0000-0000-0000-000000000004 with interval 15sec"
    // `);
    // });
  });
});

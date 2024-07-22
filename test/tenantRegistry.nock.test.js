"use strict";

/**
 * Using Nock
 *
 * RECORDING:
 * NOCK_MODE=record npm t -- --updateSnapshot
 *
 * PLAYBACK:
 * npm t
 */

const pathlib = require("path");
const nock = require("nock");

const { newContext } = require("../src/context");
const reg = require("../src/submodules/tenantRegistry");
const { anonymizeNock } = require("./util/anonymizeNock");
const { outputFromLoggerPartitionFetch, anonymizeListTimestamps } = require("./util/static");

// https://github.com/nock/nock#modes
const NOCK_MODE = {
  RECORD: "record",
  PLAYBACK: "playback",
};

const nockBack = nock.back;
nockBack.fixtures = pathlib.join(__dirname, "__nock-fixtures__");
nockBack.setMode(process.env.NOCK_MODE === NOCK_MODE.RECORD ? "update" : "lockdown");

jest.mock("../src/shared/static", () =>
  process.env.NOCK_MODE === NOCK_MODE.RECORD
    ? jest.requireActual("../src/shared/static")
    : require("./__mocks/sharedNockPlayback/static")
);
process.env.NOCK_MODE === NOCK_MODE.RECORD && jest.setTimeout(480000);

const testTenantId = "5ecc7413-2b7e-414a-9496-ad4a61f6cccf";

let loggerSpy = {
  info: jest.spyOn(console, "log").mockImplementation(),
  error: jest.spyOn(console, "error").mockImplementation(),
};
const freshContext = async () => await newContext({ usePersistedCache: false, isReadonlyCommand: false });

describe("reg tests", () => {
  beforeAll(async () => {});

  afterEach(() => {
    nock.restore();
    jest.clearAllMocks();
  });

  test("reg list and longlist", async () => {
    const { nockDone } = await nockBack("reg-list.json", { afterRecord: anonymizeNock });

    const regListOutput = await reg.registryListSubscriptions(await freshContext(), [], [true]);
    expect(anonymizeListTimestamps(regListOutput)).toMatchInlineSnapshot(`
      "#   consumerTenantId                      globalAccountId                       subdomain              plan      state       url                                                                     created_on  updated_on
      1   288393a7-972c-4fa8-acfd-12299c4db374  096cea2e-77ef-498f-a588-114b33817f5d  nga-dev-eu10-uofvpsx0  standard  SUBSCRIBED  https://nga-dev-eu10-uofvpsx0.dev-afc-sap.cfapps.sap.hana.ondemand.com  2024-01-05T07:50:05Z (x days ago)  2024-05-10T08:16:02Z (x days ago)  
      2   34d6259c-41bc-4f6b-8220-018ace187813  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  afc-booster-test       standard  SUBSCRIBED  https://afc-booster-test.dev.eu10-canary.afc.cloud.sap                  2024-04-19T09:58:19Z (x days ago)  2024-05-10T08:15:59Z (x days ago)  
      3   4c0909b1-a84e-4763-a26e-532fdb9e40fa  1fb05c0d-22c0-43d8-9ca7-c9ef0c28f67f  hw6-apps-eu10          standard  SUBSCRIBED  https://hw6-apps-eu10.dev-afc-sap.cfapps.sap.hana.ondemand.com          2023-09-05T14:19:13Z (x days ago)  2024-05-10T08:15:55Z (x days ago)  
      4   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-company         standard  SUBSCRIBED  https://skyfin-company.dev-afc-sap.cfapps.sap.hana.ondemand.com         2021-03-19T09:51:40Z (x days ago)  2024-05-10T08:15:58Z (x days ago)  
      5   6917dfd6-7590-4033-af2a-140b75263b0d  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-debug-company   standard  SUBSCRIBED  https://skyfin-debug-company.dev-afc-sap.cfapps.sap.hana.ondemand.com   2022-04-28T07:57:29Z (x days ago)  2024-05-10T08:15:58Z (x days ago)  
      6   6ef2372b-d256-4fef-8b01-6eeb18f2eefe  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  afc-sap-start-test     standard  SUBSCRIBED  https://afc-sap-start-test.dev-afc-sap.cfapps.sap.hana.ondemand.com     2024-04-17T06:17:11Z (x days ago)  2024-05-10T08:15:56Z (x days ago)  
      7   848a0f14-792d-4bd2-821c-7c6280780ca3  14834dda-03aa-46e2-9ea7-01492f461a23  saas-starter-eu-10     standard  SUBSCRIBED  https://saas-starter-eu-10.dev-afc-sap.cfapps.sap.hana.ondemand.com     2023-08-08T14:41:19Z (x days ago)  2024-05-10T08:16:00Z (x days ago)  
      8   cb9158ce-f8fd-441b-b443-17219e8f79fa  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skysand                          SUBSCRIBED  https://skysand.dev-afc-sap.cfapps.sap.hana.ondemand.com                2022-09-05T12:11:10Z (x days ago)  2024-05-10T08:16:00Z (x days ago)  
      9   cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  a6786cbf-f7e7-4103-9386-b91d1c07e3ea  jyd-dev-apps-eu10      standard  SUBSCRIBED  https://jyd-dev-apps-eu10.dev-afc-sap.cfapps.sap.hana.ondemand.com      2024-03-19T16:47:52Z (x days ago)  2024-05-10T08:15:56Z (x days ago)  
      10  dde70ec5-983d-4848-b50c-fb2cdac7d359  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-test-3          standard  SUBSCRIBED  https://skyfin-test-3.dev-afc-sap.cfapps.sap.hana.ondemand.com          2024-02-23T15:34:25Z (x days ago)  2024-05-10T08:16:00Z (x days ago)  "
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&size=200&page=1 200 OK (88ms)"
    `);
    loggerSpy.info.mockClear();
    expect(await reg.registryListSubscriptions(await freshContext(), [], [])).toMatchInlineSnapshot(`
      "#   consumerTenantId                      globalAccountId                       subdomain              plan      state       url                                                                   
      1   288393a7-972c-4fa8-acfd-12299c4db374  096cea2e-77ef-498f-a588-114b33817f5d  nga-dev-eu10-uofvpsx0  standard  SUBSCRIBED  https://nga-dev-eu10-uofvpsx0.dev-afc-sap.cfapps.sap.hana.ondemand.com
      2   34d6259c-41bc-4f6b-8220-018ace187813  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  afc-booster-test       standard  SUBSCRIBED  https://afc-booster-test.dev.eu10-canary.afc.cloud.sap                
      3   4c0909b1-a84e-4763-a26e-532fdb9e40fa  1fb05c0d-22c0-43d8-9ca7-c9ef0c28f67f  hw6-apps-eu10          standard  SUBSCRIBED  https://hw6-apps-eu10.dev-afc-sap.cfapps.sap.hana.ondemand.com        
      4   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-company         standard  SUBSCRIBED  https://skyfin-company.dev-afc-sap.cfapps.sap.hana.ondemand.com       
      5   6917dfd6-7590-4033-af2a-140b75263b0d  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-debug-company   standard  SUBSCRIBED  https://skyfin-debug-company.dev-afc-sap.cfapps.sap.hana.ondemand.com 
      6   6ef2372b-d256-4fef-8b01-6eeb18f2eefe  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  afc-sap-start-test     standard  SUBSCRIBED  https://afc-sap-start-test.dev-afc-sap.cfapps.sap.hana.ondemand.com   
      7   848a0f14-792d-4bd2-821c-7c6280780ca3  14834dda-03aa-46e2-9ea7-01492f461a23  saas-starter-eu-10     standard  SUBSCRIBED  https://saas-starter-eu-10.dev-afc-sap.cfapps.sap.hana.ondemand.com   
      8   cb9158ce-f8fd-441b-b443-17219e8f79fa  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skysand                          SUBSCRIBED  https://skysand.dev-afc-sap.cfapps.sap.hana.ondemand.com              
      9   cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  a6786cbf-f7e7-4103-9386-b91d1c07e3ea  jyd-dev-apps-eu10      standard  SUBSCRIBED  https://jyd-dev-apps-eu10.dev-afc-sap.cfapps.sap.hana.ondemand.com    
      10  dde70ec5-983d-4848-b50c-fb2cdac7d359  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-test-3          standard  SUBSCRIBED  https://skyfin-test-3.dev-afc-sap.cfapps.sap.hana.ondemand.com        "
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&size=200&page=1 200 OK (88ms)"
    `);
    loggerSpy.info.mockClear();
    expect(await reg.registryLongListSubscriptions(await freshContext(), [])).toMatchSnapshot();
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&size=200&page=1 200 OK (88ms)"
    `);
    loggerSpy.info.mockClear();

    nockDone();
    expect(loggerSpy.error.mock.calls).toHaveLength(0);
  });

  test("reg list and longlist filtered", async () => {
    const { nockDone } = await nockBack("reg-list-filtered.json", { afterRecord: anonymizeNock });

    const regListOutput = await reg.registryListSubscriptions(await freshContext(), [testTenantId], [true]);
    expect(anonymizeListTimestamps(regListOutput)).toMatchInlineSnapshot(`
      "consumerTenantId                      globalAccountId                       subdomain       plan      state       url                                                              created_on  updated_on
      5ecc7413-2b7e-414a-9496-ad4a61f6cccf  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-company  standard  SUBSCRIBED  https://skyfin-company.dev-afc-sap.cfapps.sap.hana.ondemand.com  2021-03-19T09:51:40Z (x days ago)  2024-05-10T08:15:58Z (x days ago)  "
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&tenantId=5ecc7413-2b7e-414a-9496-ad4a61f6cccf&size=200&page=1 200 OK (88ms)"
    `);
    loggerSpy.info.mockClear();
    expect(await reg.registryListSubscriptions(await freshContext(), [testTenantId], [])).toMatchInlineSnapshot(`
      "consumerTenantId                      globalAccountId                       subdomain       plan      state       url                                                            
      5ecc7413-2b7e-414a-9496-ad4a61f6cccf  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-company  standard  SUBSCRIBED  https://skyfin-company.dev-afc-sap.cfapps.sap.hana.ondemand.com"
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&tenantId=5ecc7413-2b7e-414a-9496-ad4a61f6cccf&size=200&page=1 200 OK (88ms)"
    `);
    loggerSpy.info.mockClear();
    const result = await reg.registryLongListSubscriptions(await freshContext(), [testTenantId]);
    expect(JSON.parse(result).subscriptions).toHaveLength(1);
    expect(result).toMatchSnapshot();
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&tenantId=5ecc7413-2b7e-414a-9496-ad4a61f6cccf&size=200&page=1 200 OK (88ms)"
    `);
    loggerSpy.info.mockClear();

    nockDone();
    expect(loggerSpy.error.mock.calls).toHaveLength(0);
  });

  test("reg service config", async () => {
    const { nockDone } = await nockBack("reg-service-config.json", { afterRecord: anonymizeNock });

    expect(await reg.registryServiceConfig(await freshContext())).toMatchInlineSnapshot(`
      "{
        "getDependencies": "https://skyfin.dev.eu10-canary.afc.cloud.sap/callback/v1.0/dependencies",
        "onSubscription": "https://skyfin.dev.eu10-canary.afc.cloud.sap/callback/v1.0/tenants/{tenantId}",
        "onSubscriptionAsync": true,
        "onUnSubscriptionAsync": true,
        "onUpdateSubscriptionParametersAsync": false,
        "callbackTimeoutMillis": 900000,
        "runGetDependenciesOnAsyncCallback": false,
        "onUpdateDependenciesAsync": false
      }"
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      "
    `);

    nockDone();
    expect(loggerSpy.error.mock.calls).toHaveLength(0);
  });

  test("reg update tenant", async () => {
    const { nockDone } = await nockBack("reg-update-tenant.json", { afterRecord: anonymizeNock });

    expect(await reg.registryUpdateDependencies(await freshContext(), [testTenantId], [])).toBeUndefined();
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      response: Job for update subscription of application: afc-dev and tenant: 5ecc7413-2b7e-414a-9496-ad4a61f6cccf, was created
      polling job /api/v2.0/jobs/4520b25d-29fc-4bbd-9403-4a76acebbfcd with interval 15sec
      {
        "tenantId": "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
        "jobId": "4520b25d-29fc-4bbd-9403-4a76acebbfcd",
        "state": "SUCCEEDED"
      }

      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&tenantId=5ecc7413-2b7e-414a-9496-ad4a61f6cccf&size=200&page=1 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/5ecc7413-2b7e-414a-9496-ad4a61f6cccf/subscriptions 202 Accepted (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/4520b25d-29fc-4bbd-9403-4a76acebbfcd 200 OK (88ms)"
    `);

    nockDone();
    expect(loggerSpy.error.mock.calls).toHaveLength(0);
  });

  test("reg update tenant all", async () => {
    const { nockDone } = await nockBack("reg-update-tenant-all.json", { afterRecord: anonymizeNock });

    expect(await reg.registryUpdateAllDependencies(await freshContext(), undefined, [])).toBeUndefined();
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      response: Job for update subscription of application: afc-dev and tenant: 5ecc7413-2b7e-414a-9496-ad4a61f6cccf, was created
      polling job /api/v2.0/jobs/a6334e8e-6b69-46c6-97cc-94a02c4965e5 with interval 15sec
      response: Job for update subscription of application: afc-dev and tenant: 6917dfd6-7590-4033-af2a-140b75263b0d, was created
      polling job /api/v2.0/jobs/eba2a96a-3de7-4f75-a3cf-af6821d0c826 with interval 15sec
      response: Job for update subscription of application: afc-dev and tenant: cb9158ce-f8fd-441b-b443-17219e8f79fa, was created
      polling job /api/v2.0/jobs/ef9575a0-d3f9-4347-b792-24d60756bcdc with interval 15sec
      response: Job for update subscription of application: afc-dev and tenant: 848a0f14-792d-4bd2-821c-7c6280780ca3, was created
      polling job /api/v2.0/jobs/cf60da54-382d-48dd-bd5a-0e4eae14ceb7 with interval 15sec
      response: Job for update subscription of application: afc-dev and tenant: 4c0909b1-a84e-4763-a26e-532fdb9e40fa, was created
      polling job /api/v2.0/jobs/17889327-5c21-4056-8d7c-ac75ede93088 with interval 15sec
      response: Job for update subscription of application: afc-dev and tenant: 288393a7-972c-4fa8-acfd-12299c4db374, was created
      polling job /api/v2.0/jobs/a8d43a70-80f4-4ed5-bf1f-0cb6b9e51463 with interval 15sec
      response: Job for update subscription of application: afc-dev and tenant: dde70ec5-983d-4848-b50c-fb2cdac7d359, was created
      polling job /api/v2.0/jobs/bb2c6cc7-6432-4def-b2fa-e97375268e00 with interval 15sec
      response: Job for update subscription of application: afc-dev and tenant: cf528063-6a43-4bf2-8ccc-ca4e6d75d88e, was created
      polling job /api/v2.0/jobs/d47be903-50f9-425b-94e1-b464d987087f with interval 15sec
      response: Job for update subscription of application: afc-dev and tenant: 6ef2372b-d256-4fef-8b01-6eeb18f2eefe, was created
      polling job /api/v2.0/jobs/cd27bfbc-3f18-4297-a24c-cbc92035b80d with interval 15sec
      response: Job for update subscription of application: afc-dev and tenant: 34d6259c-41bc-4f6b-8220-018ace187813, was created
      polling job /api/v2.0/jobs/78ff106a-3a26-4246-a4db-6da81cecc0fa with interval 15sec
      [
        {
          "tenantId": "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
          "jobId": "a6334e8e-6b69-46c6-97cc-94a02c4965e5",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "6917dfd6-7590-4033-af2a-140b75263b0d",
          "jobId": "eba2a96a-3de7-4f75-a3cf-af6821d0c826",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "cb9158ce-f8fd-441b-b443-17219e8f79fa",
          "jobId": "ef9575a0-d3f9-4347-b792-24d60756bcdc",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "848a0f14-792d-4bd2-821c-7c6280780ca3",
          "jobId": "cf60da54-382d-48dd-bd5a-0e4eae14ceb7",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "4c0909b1-a84e-4763-a26e-532fdb9e40fa",
          "jobId": "17889327-5c21-4056-8d7c-ac75ede93088",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "288393a7-972c-4fa8-acfd-12299c4db374",
          "jobId": "a8d43a70-80f4-4ed5-bf1f-0cb6b9e51463",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "dde70ec5-983d-4848-b50c-fb2cdac7d359",
          "jobId": "bb2c6cc7-6432-4def-b2fa-e97375268e00",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "cf528063-6a43-4bf2-8ccc-ca4e6d75d88e",
          "jobId": "d47be903-50f9-425b-94e1-b464d987087f",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "6ef2372b-d256-4fef-8b01-6eeb18f2eefe",
          "jobId": "cd27bfbc-3f18-4297-a24c-cbc92035b80d",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "34d6259c-41bc-4f6b-8220-018ace187813",
          "jobId": "78ff106a-3a26-4246-a4db-6da81cecc0fa",
          "state": "SUCCEEDED"
        }
      ]

      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&size=200&page=1 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/5ecc7413-2b7e-414a-9496-ad4a61f6cccf/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/6917dfd6-7590-4033-af2a-140b75263b0d/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/cb9158ce-f8fd-441b-b443-17219e8f79fa/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/848a0f14-792d-4bd2-821c-7c6280780ca3/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/4c0909b1-a84e-4763-a26e-532fdb9e40fa/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/288393a7-972c-4fa8-acfd-12299c4db374/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/dde70ec5-983d-4848-b50c-fb2cdac7d359/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/cf528063-6a43-4bf2-8ccc-ca4e6d75d88e/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/6ef2372b-d256-4fef-8b01-6eeb18f2eefe/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/34d6259c-41bc-4f6b-8220-018ace187813/subscriptions 202 Accepted (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/a6334e8e-6b69-46c6-97cc-94a02c4965e5 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/eba2a96a-3de7-4f75-a3cf-af6821d0c826 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/ef9575a0-d3f9-4347-b792-24d60756bcdc 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/cf60da54-382d-48dd-bd5a-0e4eae14ceb7 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/17889327-5c21-4056-8d7c-ac75ede93088 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/a8d43a70-80f4-4ed5-bf1f-0cb6b9e51463 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/bb2c6cc7-6432-4def-b2fa-e97375268e00 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/d47be903-50f9-425b-94e1-b464d987087f 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/cd27bfbc-3f18-4297-a24c-cbc92035b80d 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/78ff106a-3a26-4246-a4db-6da81cecc0fa 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/a6334e8e-6b69-46c6-97cc-94a02c4965e5 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/ef9575a0-d3f9-4347-b792-24d60756bcdc 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/cf60da54-382d-48dd-bd5a-0e4eae14ceb7 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/a8d43a70-80f4-4ed5-bf1f-0cb6b9e51463 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/bb2c6cc7-6432-4def-b2fa-e97375268e00 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/d47be903-50f9-425b-94e1-b464d987087f 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/cd27bfbc-3f18-4297-a24c-cbc92035b80d 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/78ff106a-3a26-4246-a4db-6da81cecc0fa 200 OK (88ms)"
    `);

    nockDone();
    expect(loggerSpy.error.mock.calls).toHaveLength(0);
  });

  test("reg update tenant application url all", async () => {
    const { nockDone } = await nockBack("reg-update-tenant-appurl-all.json", { afterRecord: anonymizeNock });

    expect(await reg.registryUpdateApplicationURL(await freshContext(), [], [])).toBeUndefined();
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      [
        {
          "tenantId": "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "6917dfd6-7590-4033-af2a-140b75263b0d",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "cb9158ce-f8fd-441b-b443-17219e8f79fa",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "848a0f14-792d-4bd2-821c-7c6280780ca3",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "4c0909b1-a84e-4763-a26e-532fdb9e40fa",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "288393a7-972c-4fa8-acfd-12299c4db374",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "dde70ec5-983d-4848-b50c-fb2cdac7d359",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "cf528063-6a43-4bf2-8ccc-ca4e6d75d88e",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "6ef2372b-d256-4fef-8b01-6eeb18f2eefe",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "34d6259c-41bc-4f6b-8220-018ace187813",
          "state": "SUCCEEDED"
        }
      ]

      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&size=200&page=1 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/5ecc7413-2b7e-414a-9496-ad4a61f6cccf/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/6917dfd6-7590-4033-af2a-140b75263b0d/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/cb9158ce-f8fd-441b-b443-17219e8f79fa/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/848a0f14-792d-4bd2-821c-7c6280780ca3/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 429 Too Many Requests (88ms) retrying in 6sec
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/4c0909b1-a84e-4763-a26e-532fdb9e40fa/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/288393a7-972c-4fa8-acfd-12299c4db374/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/dde70ec5-983d-4848-b50c-fb2cdac7d359/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/cf528063-6a43-4bf2-8ccc-ca4e6d75d88e/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/6ef2372b-d256-4fef-8b01-6eeb18f2eefe/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/34d6259c-41bc-4f6b-8220-018ace187813/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/848a0f14-792d-4bd2-821c-7c6280780ca3/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)"
    `);

    nockDone();
    expect(loggerSpy.error.mock.calls).toHaveLength(0);
  });

  test("reg update tenant application url with tenant", async () => {
    const { nockDone } = await nockBack("req-update-tenant-appurl.json", { afterRecord: anonymizeNock });

    expect(await reg.registryUpdateApplicationURL(await freshContext(), [testTenantId], [])).toBeUndefined();
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      {
        "tenantId": "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
        "state": "SUCCEEDED"
      }

      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&tenantId=5ecc7413-2b7e-414a-9496-ad4a61f6cccf&size=200&page=1 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/5ecc7413-2b7e-414a-9496-ad4a61f6cccf/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)"
    `);

    nockDone();
    expect(loggerSpy.error.mock.calls).toHaveLength(0);
  });
});

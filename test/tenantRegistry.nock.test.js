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
      "#  consumerTenantId                      globalAccountId                       subdomain              plan      state       url                                                                     created_on  updated_on
      1  288393a7-972c-4fa8-acfd-12299c4db374  096cea2e-77ef-498f-a588-114b33817f5d  nga-dev-eu10-uofvpsx0  standard  SUBSCRIBED  https://nga-dev-eu10-uofvpsx0.dev-afc-sap.cfapps.sap.hana.ondemand.com  2024-01-05T07:50:05Z (x days ago)  2024-03-05T09:59:35Z (x days ago)  
      2  4c0909b1-a84e-4763-a26e-532fdb9e40fa  1fb05c0d-22c0-43d8-9ca7-c9ef0c28f67f  hw6-apps-eu10          standard  SUBSCRIBED  https://hw6-apps-eu10.dev-afc-sap.cfapps.sap.hana.ondemand.com          2023-09-05T14:19:13Z (x days ago)  2024-03-05T09:59:14Z (x days ago)  
      3  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-company         standard  SUBSCRIBED  https://skyfin-company.dev-afc-sap.cfapps.sap.hana.ondemand.com         2021-03-19T09:51:40Z (x days ago)  2024-03-05T09:57:53Z (x days ago)  
      4  6917dfd6-7590-4033-af2a-140b75263b0d  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-debug-company   standard  SUBSCRIBED  https://skyfin-debug-company.dev-afc-sap.cfapps.sap.hana.ondemand.com   2022-04-28T07:57:29Z (x days ago)  2024-03-05T09:58:14Z (x days ago)  
      5  848a0f14-792d-4bd2-821c-7c6280780ca3  14834dda-03aa-46e2-9ea7-01492f461a23  saas-starter-eu-10     standard  SUBSCRIBED  https://saas-starter-eu-10.dev-afc-sap.cfapps.sap.hana.ondemand.com     2023-08-08T14:41:19Z (x days ago)  2024-03-05T09:58:55Z (x days ago)  
      6  cb9158ce-f8fd-441b-b443-17219e8f79fa  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skysand                          SUBSCRIBED  https://skysand.dev-afc-sap.cfapps.sap.hana.ondemand.com                2022-09-05T12:11:10Z (x days ago)  2024-03-05T09:58:34Z (x days ago)  
      7  dde70ec5-983d-4848-b50c-fb2cdac7d359  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-test-3          standard  SUBSCRIBED  https://skyfin-test-3.dev-afc-sap.cfapps.sap.hana.ondemand.com          2024-02-23T15:34:25Z (x days ago)  2024-03-05T09:59:55Z (x days ago)  "
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&size=200&page=1 200 OK (88ms)"
    `);
    loggerSpy.info.mockClear();
    expect(await reg.registryListSubscriptions(await freshContext(), [], [false])).toMatchInlineSnapshot(`
      "#  consumerTenantId                      globalAccountId                       subdomain              plan      state       url                                                                   
      1  288393a7-972c-4fa8-acfd-12299c4db374  096cea2e-77ef-498f-a588-114b33817f5d  nga-dev-eu10-uofvpsx0  standard  SUBSCRIBED  https://nga-dev-eu10-uofvpsx0.dev-afc-sap.cfapps.sap.hana.ondemand.com
      2  4c0909b1-a84e-4763-a26e-532fdb9e40fa  1fb05c0d-22c0-43d8-9ca7-c9ef0c28f67f  hw6-apps-eu10          standard  SUBSCRIBED  https://hw6-apps-eu10.dev-afc-sap.cfapps.sap.hana.ondemand.com        
      3  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-company         standard  SUBSCRIBED  https://skyfin-company.dev-afc-sap.cfapps.sap.hana.ondemand.com       
      4  6917dfd6-7590-4033-af2a-140b75263b0d  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-debug-company   standard  SUBSCRIBED  https://skyfin-debug-company.dev-afc-sap.cfapps.sap.hana.ondemand.com 
      5  848a0f14-792d-4bd2-821c-7c6280780ca3  14834dda-03aa-46e2-9ea7-01492f461a23  saas-starter-eu-10     standard  SUBSCRIBED  https://saas-starter-eu-10.dev-afc-sap.cfapps.sap.hana.ondemand.com   
      6  cb9158ce-f8fd-441b-b443-17219e8f79fa  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skysand                          SUBSCRIBED  https://skysand.dev-afc-sap.cfapps.sap.hana.ondemand.com              
      7  dde70ec5-983d-4848-b50c-fb2cdac7d359  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-test-3          standard  SUBSCRIBED  https://skyfin-test-3.dev-afc-sap.cfapps.sap.hana.ondemand.com        "
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
      5ecc7413-2b7e-414a-9496-ad4a61f6cccf  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-company  standard  SUBSCRIBED  https://skyfin-company.dev-afc-sap.cfapps.sap.hana.ondemand.com  2021-03-19T09:51:40Z (x days ago)  2024-03-05T09:57:53Z (x days ago)  "
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&tenantId=5ecc7413-2b7e-414a-9496-ad4a61f6cccf&size=200&page=1 200 OK (88ms)"
    `);
    loggerSpy.info.mockClear();
    expect(await reg.registryListSubscriptions(await freshContext(), [testTenantId], [false])).toMatchInlineSnapshot(`
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
        "getDependencies": "https://skyfin.dev-afc-sap.cfapps.sap.hana.ondemand.com/callback/v1.0/dependencies",
        "onSubscription": "https://skyfin.dev-afc-sap.cfapps.sap.hana.ondemand.com/callback/v1.0/tenants/{tenantId}",
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

    expect(await reg.registryUpdateDependencies(await freshContext(), [testTenantId], [false])).toMatchInlineSnapshot(`
      "{
        "id": "83285f25-8bf0-4f98-b613-07bb604aa812",
        "state": "SUCCEEDED"
      }"
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      response: Job for update subscription of application: afc-dev and tenant: 5ecc7413-2b7e-414a-9496-ad4a61f6cccf, was created
      polling job /api/v2.0/jobs/83285f25-8bf0-4f98-b613-07bb604aa812 with interval 10sec

      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&tenantId=5ecc7413-2b7e-414a-9496-ad4a61f6cccf&size=200&page=1 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/5ecc7413-2b7e-414a-9496-ad4a61f6cccf/subscriptions 202 Accepted (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/83285f25-8bf0-4f98-b613-07bb604aa812 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/83285f25-8bf0-4f98-b613-07bb604aa812 200 OK (88ms)"
    `);

    nockDone();
    expect(loggerSpy.error.mock.calls).toHaveLength(0);
  });

  test("reg update tenant all", async () => {
    const { nockDone } = await nockBack("reg-update-tenant-all.json", { afterRecord: anonymizeNock });

    expect(await reg.registryUpdateAllDependencies(await freshContext(), undefined, [false])).toMatchInlineSnapshot(`
      [
        "{
        "id": "264d23af-b2e7-4682-9c4a-86a9a9a3d5fb",
        "state": "SUCCEEDED"
      }",
        "{
        "id": "fc8523c6-ec4f-47b2-ab5f-aa2bb1150f5c",
        "state": "SUCCEEDED"
      }",
        "{
        "id": "d1dd4efe-f484-476d-b174-04825fde3bdd",
        "state": "SUCCEEDED"
      }",
        "{
        "id": "f314ad02-f413-4151-b852-1e048f1c316e",
        "state": "SUCCEEDED"
      }",
        "{
        "id": "ed497bf4-e40e-496c-bc50-d5e15b110eff",
        "state": "SUCCEEDED"
      }",
        "{
        "id": "5620b899-f606-405d-ad38-bb8e485b0693",
        "state": "SUCCEEDED"
      }",
        "{
        "id": "6cb1d026-094b-48c7-b94f-98420e2a34b3",
        "state": "SUCCEEDED"
      }",
      ]
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      response: Job for update subscription of application: afc-dev and tenant: 5ecc7413-2b7e-414a-9496-ad4a61f6cccf, was created
      polling job /api/v2.0/jobs/264d23af-b2e7-4682-9c4a-86a9a9a3d5fb with interval 10sec
      response: Job for update subscription of application: afc-dev and tenant: 6917dfd6-7590-4033-af2a-140b75263b0d, was created
      polling job /api/v2.0/jobs/fc8523c6-ec4f-47b2-ab5f-aa2bb1150f5c with interval 10sec
      response: Job for update subscription of application: afc-dev and tenant: cb9158ce-f8fd-441b-b443-17219e8f79fa, was created
      polling job /api/v2.0/jobs/d1dd4efe-f484-476d-b174-04825fde3bdd with interval 10sec
      response: Job for update subscription of application: afc-dev and tenant: 848a0f14-792d-4bd2-821c-7c6280780ca3, was created
      polling job /api/v2.0/jobs/f314ad02-f413-4151-b852-1e048f1c316e with interval 10sec
      response: Job for update subscription of application: afc-dev and tenant: 4c0909b1-a84e-4763-a26e-532fdb9e40fa, was created
      polling job /api/v2.0/jobs/ed497bf4-e40e-496c-bc50-d5e15b110eff with interval 10sec
      response: Job for update subscription of application: afc-dev and tenant: 288393a7-972c-4fa8-acfd-12299c4db374, was created
      polling job /api/v2.0/jobs/5620b899-f606-405d-ad38-bb8e485b0693 with interval 10sec
      response: Job for update subscription of application: afc-dev and tenant: dde70ec5-983d-4848-b50c-fb2cdac7d359, was created
      polling job /api/v2.0/jobs/6cb1d026-094b-48c7-b94f-98420e2a34b3 with interval 10sec

      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&size=200&page=1 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/5ecc7413-2b7e-414a-9496-ad4a61f6cccf/subscriptions 202 Accepted (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/264d23af-b2e7-4682-9c4a-86a9a9a3d5fb 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/264d23af-b2e7-4682-9c4a-86a9a9a3d5fb 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/6917dfd6-7590-4033-af2a-140b75263b0d/subscriptions 202 Accepted (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/fc8523c6-ec4f-47b2-ab5f-aa2bb1150f5c 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/cb9158ce-f8fd-441b-b443-17219e8f79fa/subscriptions 202 Accepted (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/d1dd4efe-f484-476d-b174-04825fde3bdd 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/d1dd4efe-f484-476d-b174-04825fde3bdd 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/848a0f14-792d-4bd2-821c-7c6280780ca3/subscriptions 202 Accepted (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/f314ad02-f413-4151-b852-1e048f1c316e 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/f314ad02-f413-4151-b852-1e048f1c316e 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/4c0909b1-a84e-4763-a26e-532fdb9e40fa/subscriptions 202 Accepted (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/ed497bf4-e40e-496c-bc50-d5e15b110eff 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/288393a7-972c-4fa8-acfd-12299c4db374/subscriptions 202 Accepted (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/5620b899-f606-405d-ad38-bb8e485b0693 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/dde70ec5-983d-4848-b50c-fb2cdac7d359/subscriptions 202 Accepted (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/6cb1d026-094b-48c7-b94f-98420e2a34b3 200 OK (88ms)"
    `);

    nockDone();
    expect(loggerSpy.error.mock.calls).toHaveLength(0);
  });

  test("reg update tenant application url all", async () => {
    const { nockDone } = await nockBack("reg-update-tenant-appurl-all.json", { afterRecord: anonymizeNock });

    expect(await reg.registryUpdateApplicationURL(await freshContext(), [])).toMatchInlineSnapshot(`
      [
        "{
        "tenantId": "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
        "state": "SUCCEEDED"
      }",
        "{
        "tenantId": "6917dfd6-7590-4033-af2a-140b75263b0d",
        "state": "SUCCEEDED"
      }",
        "{
        "tenantId": "cb9158ce-f8fd-441b-b443-17219e8f79fa",
        "state": "SUCCEEDED"
      }",
        "{
        "tenantId": "848a0f14-792d-4bd2-821c-7c6280780ca3",
        "state": "SUCCEEDED"
      }",
        "{
        "tenantId": "4c0909b1-a84e-4763-a26e-532fdb9e40fa",
        "state": "SUCCEEDED"
      }",
        "{
        "tenantId": "288393a7-972c-4fa8-acfd-12299c4db374",
        "state": "SUCCEEDED"
      }",
        "{
        "tenantId": "dde70ec5-983d-4848-b50c-fb2cdac7d359",
        "state": "SUCCEEDED"
      }",
      ]
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      Subscription Operation with method PATCH for tenant 5ecc7413-2b7e-414a-9496-ad4a61f6cccf finished with state SUCCEEDED
      Subscription Operation with method PATCH for tenant 6917dfd6-7590-4033-af2a-140b75263b0d finished with state SUCCEEDED
      Subscription Operation with method PATCH for tenant cb9158ce-f8fd-441b-b443-17219e8f79fa finished with state SUCCEEDED
      Subscription Operation with method PATCH for tenant 848a0f14-792d-4bd2-821c-7c6280780ca3 finished with state SUCCEEDED
      Subscription Operation with method PATCH for tenant 4c0909b1-a84e-4763-a26e-532fdb9e40fa finished with state SUCCEEDED
      Subscription Operation with method PATCH for tenant 288393a7-972c-4fa8-acfd-12299c4db374 finished with state SUCCEEDED
      Subscription Operation with method PATCH for tenant dde70ec5-983d-4848-b50c-fb2cdac7d359 finished with state SUCCEEDED

      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&size=200&page=1 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/5ecc7413-2b7e-414a-9496-ad4a61f6cccf/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/6917dfd6-7590-4033-af2a-140b75263b0d/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/cb9158ce-f8fd-441b-b443-17219e8f79fa/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/848a0f14-792d-4bd2-821c-7c6280780ca3/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/4c0909b1-a84e-4763-a26e-532fdb9e40fa/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/288393a7-972c-4fa8-acfd-12299c4db374/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/dde70ec5-983d-4848-b50c-fb2cdac7d359/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)"
    `);

    nockDone();
    expect(loggerSpy.error.mock.calls).toHaveLength(0);
  });

  test("reg update tenant application url with tenant", async () => {
    const { nockDone } = await nockBack("req-update-tenant-appurl.json", { afterRecord: anonymizeNock });

    expect(await reg.registryUpdateApplicationURL(await freshContext(), [testTenantId])).toMatchInlineSnapshot(`
      "{
        "tenantId": "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
        "state": "SUCCEEDED"
      }"
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      Subscription Operation with method PATCH for tenant 5ecc7413-2b7e-414a-9496-ad4a61f6cccf finished with state SUCCEEDED

      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&tenantId=5ecc7413-2b7e-414a-9496-ad4a61f6cccf&size=200&page=1 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/5ecc7413-2b7e-414a-9496-ad4a61f6cccf/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)"
    `);

    nockDone();
    expect(loggerSpy.error.mock.calls).toHaveLength(0);
  });
});

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
process.env.NOCK_MODE === NOCK_MODE.RECORD && jest.setTimeout(240000);

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
      "#  consumerTenantId                      globalAccountId                       subdomain             plan       state             url                                                                   created_on  updated_on
      1  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-company        standard   SUBSCRIBED        http://skyfin-company.dev-afc-sap.cfapps.sap.hana.ondemand.com        2021-03-19T09:51:40Z (x days ago)  2022-12-14T14:07:41Z (x days ago)  
      2  6917dfd6-7590-4033-af2a-140b75263b0d  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-debug-company  standard   SUBSCRIBED        http://skyfin-debug-company.dev-afc-sap.cfapps.sap.hana.ondemand.com  2022-04-28T07:57:29Z (x days ago)  2022-12-14T14:07:51Z (x days ago)  
      3  cb9158ce-f8fd-441b-b443-17219e8f79fa  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skysand               undefined  SUBSCRIBED        https://skysand.dev-afc-sap.cfapps.sap.hana.ondemand.com              2022-09-05T12:11:10Z (x days ago)  2022-12-14T14:08:01Z (x days ago)  
      4  dde70ec5-983d-4848-b50c-fb2cdac7d359  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-test-3         standard   SUBSCRIBE_FAILED  undefined                                                             2022-11-28T09:51:43Z (x days ago)  2022-11-28T09:51:57Z (x days ago)  "
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&size=200&page=1 200 OK (88ms)"
    `);
    loggerSpy.info.mockClear();
    expect(await reg.registryListSubscriptions(await freshContext(), [], [false])).toMatchInlineSnapshot(`
      "#  consumerTenantId                      globalAccountId                       subdomain             plan       state             url                                                                 
      1  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-company        standard   SUBSCRIBED        http://skyfin-company.dev-afc-sap.cfapps.sap.hana.ondemand.com      
      2  6917dfd6-7590-4033-af2a-140b75263b0d  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-debug-company  standard   SUBSCRIBED        http://skyfin-debug-company.dev-afc-sap.cfapps.sap.hana.ondemand.com
      3  cb9158ce-f8fd-441b-b443-17219e8f79fa  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skysand               undefined  SUBSCRIBED        https://skysand.dev-afc-sap.cfapps.sap.hana.ondemand.com            
      4  dde70ec5-983d-4848-b50c-fb2cdac7d359  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-test-3         standard   SUBSCRIBE_FAILED  undefined                                                           "
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
      "consumerTenantId                      globalAccountId                       subdomain       plan      state       url                                                             created_on  updated_on
      5ecc7413-2b7e-414a-9496-ad4a61f6cccf  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-company  standard  SUBSCRIBED  http://skyfin-company.dev-afc-sap.cfapps.sap.hana.ondemand.com  2021-03-19T09:51:40Z (x days ago)  2022-12-14T14:07:41Z (x days ago)  "
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&tenantId=5ecc7413-2b7e-414a-9496-ad4a61f6cccf&size=200&page=1 200 OK (88ms)"
    `);
    loggerSpy.info.mockClear();
    expect(await reg.registryListSubscriptions(await freshContext(), [testTenantId], [false])).toMatchInlineSnapshot(`
      "consumerTenantId                      globalAccountId                       subdomain       plan      state       url                                                           
      5ecc7413-2b7e-414a-9496-ad4a61f6cccf  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-company  standard  SUBSCRIBED  http://skyfin-company.dev-afc-sap.cfapps.sap.hana.ondemand.com"
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
        "id": "3b2e7059-86e9-4599-a017-60154745b4fb",
        "state": "SUCCEEDED"
      }"
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      response: Job for update subscription of application: afc-dev and tenant: 5ecc7413-2b7e-414a-9496-ad4a61f6cccf, was created
      polling job /api/v2.0/jobs/3b2e7059-86e9-4599-a017-60154745b4fb with interval 10sec
      
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/5ecc7413-2b7e-414a-9496-ad4a61f6cccf/subscriptions 202 Accepted (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/3b2e7059-86e9-4599-a017-60154745b4fb 200 OK (88ms)"
    `);

    nockDone();
    expect(loggerSpy.error.mock.calls).toHaveLength(0);
  });

  test("reg update tenant all", async () => {
    const { nockDone } = await nockBack("reg-update-tenant-all.json", { afterRecord: anonymizeNock });

    expect(await reg.registryUpdateAllDependencies(await freshContext(), undefined, [false])).toMatchInlineSnapshot(`
      [
        "{
        "id": "77a3bd87-7fff-4f33-bf98-c1d1300cab34",
        "state": "SUCCEEDED"
      }",
        "{
        "id": "263eb598-6d9d-4480-a251-0f8eb5a0c41e",
        "state": "SUCCEEDED"
      }",
        "{
        "id": "2638c748-3546-4fd8-b176-f92bb8a09068",
        "state": "SUCCEEDED"
      }",
      ]
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      response: Job for update subscription of application: afc-dev and tenant: 5ecc7413-2b7e-414a-9496-ad4a61f6cccf, was created
      polling job /api/v2.0/jobs/77a3bd87-7fff-4f33-bf98-c1d1300cab34 with interval 10sec
      response: Job for update subscription of application: afc-dev and tenant: 6917dfd6-7590-4033-af2a-140b75263b0d, was created
      polling job /api/v2.0/jobs/263eb598-6d9d-4480-a251-0f8eb5a0c41e with interval 10sec
      response: Job for update subscription of application: afc-dev and tenant: cb9158ce-f8fd-441b-b443-17219e8f79fa, was created
      polling job /api/v2.0/jobs/2638c748-3546-4fd8-b176-f92bb8a09068 with interval 10sec
      
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&size=200&page=1 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/5ecc7413-2b7e-414a-9496-ad4a61f6cccf/subscriptions 202 Accepted (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/77a3bd87-7fff-4f33-bf98-c1d1300cab34 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/6917dfd6-7590-4033-af2a-140b75263b0d/subscriptions 202 Accepted (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/263eb598-6d9d-4480-a251-0f8eb5a0c41e 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/cb9158ce-f8fd-441b-b443-17219e8f79fa/subscriptions 202 Accepted (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/2638c748-3546-4fd8-b176-f92bb8a09068 200 OK (88ms)"
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
      ]
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      Subscription Operation with method PATCH for tenant 5ecc7413-2b7e-414a-9496-ad4a61f6cccf finished with state SUCCEEDED
      Subscription Operation with method PATCH for tenant 6917dfd6-7590-4033-af2a-140b75263b0d finished with state SUCCEEDED
      Subscription Operation with method PATCH for tenant cb9158ce-f8fd-441b-b443-17219e8f79fa finished with state SUCCEEDED
      
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&size=200&page=1 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/5ecc7413-2b7e-414a-9496-ad4a61f6cccf/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/6917dfd6-7590-4033-af2a-140b75263b0d/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/cb9158ce-f8fd-441b-b443-17219e8f79fa/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)"
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
      
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/5ecc7413-2b7e-414a-9496-ad4a61f6cccf/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)"
    `);

    nockDone();
    expect(loggerSpy.error.mock.calls).toHaveLength(0);
  });
});

"use strict";

const pathlib = require("path");
const nock = require("nock");

const { newContext } = require("../../src/context");
const reg = require("../../src/submodules/tenantRegistry");
const { outputFromLoggerPartitionFetch, anonymizeListTimestamps, collectRequestCount } = require("../test-util/static");

nock.back.fixtures = pathlib.resolve(`${__dirname}/../../test-nock-record/__nock-fixtures__`);
nock.back.setMode("lockdown");

jest.mock("../../src/shared/static", () => require("../__mocks/sharedNockPlayback/static"));

const { Logger: MockLogger } = require("../../src/shared/logger");
const mockLogger = MockLogger.getInstance();
jest.mock("../../src/shared/logger", () => require("../__mocks/shared/logger"));

const {
  _: { LogRequestId },
} = require("../../src/shared/request");

const testTenantId = "5ecc7413-2b7e-414a-9496-ad4a61f6cccf";

const freshContext = async () => await newContext({ usePersistedCache: false, isReadonlyCommand: false });

describe("reg nock tests", () => {
  afterEach(() => {
    LogRequestId.reset();
    nock.restore();
  });

  test("request count", async () => {
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-list.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 5,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-list-filtered.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 5,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-long-list.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 5,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-long-list-filtered.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 5,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-service-config.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 5,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-update-tenant.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 5,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 5,
        "PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-update-tenant-all.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 5,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 45,
        "PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 10,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-update-tenant-app-url.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 5,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 1,
        "PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-update-tenant-app-url-all.json`)))
      .toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 5,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 1,
        "PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 10,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 1,
      }
    `);
  });

  describe("reg list", () => {
    test("reg list basic", async () => {
      await nock.back("reg-list.json");
      const output = await reg.registryListSubscriptions(await freshContext(), [], [false, false, false, false]);
      expect(output).toMatchInlineSnapshot(`
        "#   consumerTenantId                      globalAccountId                       subdomain              appName  plan      state               url                                                        
        1   288393a7-972c-4fa8-acfd-12299c4db374  096cea2e-77ef-498f-a588-114b33817f5d  nga-dev-eu10-uofvpsx0  afc-dev  standard  SUBSCRIBED          https://nga-dev-eu10-uofvpsx0.dev.eu10-canary.afc.cloud.sap
        2   4c0909b1-a84e-4763-a26e-532fdb9e40fa  1fb05c0d-22c0-43d8-9ca7-c9ef0c28f67f  hw6-apps-eu10          afc-dev  standard  SUBSCRIBED          https://hw6-apps-eu10.dev.eu10-canary.afc.cloud.sap        
        3   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-company         afc-dev  standard  SUBSCRIBED          https://skyfin-company.dev.eu10-canary.afc.cloud.sap       
        4   663d2938-be50-44ab-92ca-538855eb594f  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-workzone        afc-dev  standard  SUBSCRIBED          https://skyfin-workzone.dev.eu10-canary.afc.cloud.sap      
        5   6917dfd6-7590-4033-af2a-140b75263b0d  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-debug-company   afc-dev  standard  UPDATE_FAILED       https://skyfin-debug-company.dev.eu10-canary.afc.cloud.sap 
        6   9c418100-6318-4e8a-b4b2-1114f4f44aef  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-booster         afc-dev  standard  SUBSCRIBED          https://skyfin-booster.dev.eu10-canary.afc.cloud.sap       
        7   ae2dc112-9745-4f5e-8feb-79ebdc0094bd  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-sap-start       afc-dev  standard  SUBSCRIBED          https://skyfin-sap-start.dev.eu10-canary.afc.cloud.sap     
        8   cb9158ce-f8fd-441b-b443-17219e8f79fa  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skysand                afc-dev            SUBSCRIBED          https://skysand.dev.eu10-canary.afc.cloud.sap              
        9   cd414f5b-e4f8-4346-94b7-ca4cb2b55ecc  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-demo            afc-dev  standard  UNSUBSCRIBE_FAILED  https://skyfin-demo.dev.eu10-canary.afc.cloud.sap          
        10  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  a6786cbf-f7e7-4103-9386-b91d1c07e3ea  jyd-dev-apps-eu10      afc-dev  standard  SUBSCRIBED          https://jyd-dev-apps-eu10.dev.eu10-canary.afc.cloud.sap    
        11  dde70ec5-983d-4848-b50c-fb2cdac7d359  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-test-3          afc-dev  standard  SUBSCRIBED          https://skyfin-test-3.dev.eu10-canary.afc.cloud.sap        "
      `);
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
        
        GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&size=200&page=1 200 OK (88ms)"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("reg list timestamps", async () => {
      await nock.back("reg-list.json");
      const output = await reg.registryListSubscriptions(await freshContext(), [], [true, false, false, false]);
      expect(anonymizeListTimestamps(output)).toMatchInlineSnapshot(`
        "#   consumerTenantId                      globalAccountId                       subdomain              appName  plan      state               url                                                          created_on  updated_on
        1   288393a7-972c-4fa8-acfd-12299c4db374  096cea2e-77ef-498f-a588-114b33817f5d  nga-dev-eu10-uofvpsx0  afc-dev  standard  SUBSCRIBED          https://nga-dev-eu10-uofvpsx0.dev.eu10-canary.afc.cloud.sap  2024-01-05T07:50:05Z (x days ago)  2024-12-02T14:15:12Z (x days ago)  
        2   4c0909b1-a84e-4763-a26e-532fdb9e40fa  1fb05c0d-22c0-43d8-9ca7-c9ef0c28f67f  hw6-apps-eu10          afc-dev  standard  SUBSCRIBED          https://hw6-apps-eu10.dev.eu10-canary.afc.cloud.sap          2023-09-05T14:19:13Z (x days ago)  2024-12-02T14:15:12Z (x days ago)  
        3   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-company         afc-dev  standard  SUBSCRIBED          https://skyfin-company.dev.eu10-canary.afc.cloud.sap         2021-03-19T09:51:40Z (x days ago)  2024-12-02T14:23:57Z (x days ago)  
        4   663d2938-be50-44ab-92ca-538855eb594f  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-workzone        afc-dev  standard  SUBSCRIBED          https://skyfin-workzone.dev.eu10-canary.afc.cloud.sap        2024-09-11T07:32:10Z (x days ago)  2024-12-02T14:16:03Z (x days ago)  
        5   6917dfd6-7590-4033-af2a-140b75263b0d  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-debug-company   afc-dev  standard  UPDATE_FAILED       https://skyfin-debug-company.dev.eu10-canary.afc.cloud.sap   2024-06-26T10:26:07Z (x days ago)  2024-12-02T14:20:04Z (x days ago)  
        6   9c418100-6318-4e8a-b4b2-1114f4f44aef  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-booster         afc-dev  standard  SUBSCRIBED          https://skyfin-booster.dev.eu10-canary.afc.cloud.sap         2024-11-27T06:48:43Z (x days ago)  2024-12-02T14:16:03Z (x days ago)  
        7   ae2dc112-9745-4f5e-8feb-79ebdc0094bd  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-sap-start       afc-dev  standard  SUBSCRIBED          https://skyfin-sap-start.dev.eu10-canary.afc.cloud.sap       2024-07-05T11:18:15Z (x days ago)  2024-12-02T14:16:03Z (x days ago)  
        8   cb9158ce-f8fd-441b-b443-17219e8f79fa  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skysand                afc-dev            SUBSCRIBED          https://skysand.dev.eu10-canary.afc.cloud.sap                2022-09-05T12:11:10Z (x days ago)  2024-12-02T14:15:13Z (x days ago)  
        9   cd414f5b-e4f8-4346-94b7-ca4cb2b55ecc  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-demo            afc-dev  standard  UNSUBSCRIBE_FAILED  https://skyfin-demo.dev.eu10-canary.afc.cloud.sap            2024-09-11T09:31:15Z (x days ago)  2024-11-08T12:10:03Z (x days ago)  
        10  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  a6786cbf-f7e7-4103-9386-b91d1c07e3ea  jyd-dev-apps-eu10      afc-dev  standard  SUBSCRIBED          https://jyd-dev-apps-eu10.dev.eu10-canary.afc.cloud.sap      2024-03-19T16:47:52Z (x days ago)  2024-12-02T14:15:11Z (x days ago)  
        11  dde70ec5-983d-4848-b50c-fb2cdac7d359  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-test-3          afc-dev  standard  SUBSCRIBED          https://skyfin-test-3.dev.eu10-canary.afc.cloud.sap          2024-07-09T08:37:51Z (x days ago)  2024-12-02T14:16:03Z (x days ago)  "
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("reg list json", async () => {
      await nock.back("reg-list.json");
      const output = await reg.registryListSubscriptions(await freshContext(), [], [true, true, false, false]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("reg list filtered basic", async () => {
      await nock.back("reg-list-filtered.json");
      const output = await reg.registryListSubscriptions(
        await freshContext(),
        [testTenantId],
        [false, false, false, false]
      );
      expect(output).toMatchInlineSnapshot(`
        "consumerTenantId                      globalAccountId                       subdomain       appName  plan      state       url                                                 
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-company  afc-dev  standard  SUBSCRIBED  https://skyfin-company.dev.eu10-canary.afc.cloud.sap"
      `);
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
        
        GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&tenantId=5ecc7413-2b7e-414a-9496-ad4a61f6cccf&size=200&page=1 200 OK (88ms)"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("reg list filtered timestamps", async () => {
      await nock.back("reg-list-filtered.json");
      const output = await reg.registryListSubscriptions(
        await freshContext(),
        [testTenantId],
        [true, false, false, false]
      );
      expect(anonymizeListTimestamps(output)).toMatchInlineSnapshot(`
        "consumerTenantId                      globalAccountId                       subdomain       appName  plan      state       url                                                   created_on  updated_on
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-company  afc-dev  standard  SUBSCRIBED  https://skyfin-company.dev.eu10-canary.afc.cloud.sap  2021-03-19T09:51:40Z (x days ago)  2024-12-02T14:23:57Z (x days ago)  "
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("reg list filtered json", async () => {
      await nock.back("reg-list-filtered.json");
      const output = await reg.registryListSubscriptions(
        await freshContext(),
        [testTenantId],
        [true, true, false, false]
      );
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });
  });

  describe("reg long list", () => {
    test("reg long list basic/json", async () => {
      await nock.back("reg-long-list.json");
      const output = await reg.registryLongListSubscriptions(await freshContext(), [], [false, false, false]);
      expect(output).toMatchSnapshot();
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
        
        GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&size=200&page=1 200 OK (88ms)"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("reg long list filtered basic/json", async () => {
      await nock.back("reg-long-list-filtered.json");
      const output = await reg.registryLongListSubscriptions(await freshContext(), [], [false, false, false]);
      expect(output).toMatchSnapshot();
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
        
        GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&size=200&page=1 200 OK (88ms)"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });
  });

  test("reg service config", async () => {
    await nock.back("reg-service-config.json");
    const output = await reg.registryServiceConfig(await freshContext());
    expect(output).toMatchInlineSnapshot(`
      {
        "callbackTimeoutMillis": 900000,
        "getDependencies": "https://skyfin.dev.eu10-canary.afc.cloud.sap/callback/v1.0/dependencies",
        "getSubscriptionParameters": "",
        "onSubscription": "https://skyfin.dev.eu10-canary.afc.cloud.sap/callback/v1.0/tenants/{tenantId}",
        "onSubscriptionAsync": true,
        "onUnSubscriptionAsync": true,
        "onUpdateDependenciesAsync": false,
        "onUpdateSubscriptionParametersAsync": false,
        "runGetDependenciesOnAsyncCallback": false,
      }
    `);
    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      "
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("reg update tenant", async () => {
    await nock.back("reg-update-tenant.json");
    expect(await reg.registryUpdateDependencies(await freshContext(), [testTenantId], [])).toBeUndefined();
    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      response: Job for update subscription of application: afc-dev and tenant: 5ecc7413-2b7e-414a-9496-ad4a61f6cccf, was created
      polling job /api/v2.0/jobs/25251d4d-4bf2-4574-b286-06c829f0641c with interval 15sec
      {
        "tenantId": "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
        "jobId": "25251d4d-4bf2-4574-b286-06c829f0641c",
        "state": "SUCCEEDED"
      }
      
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/25251d4d-4bf2-4574-b286-06c829f0641c 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/25251d4d-4bf2-4574-b286-06c829f0641c 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/25251d4d-4bf2-4574-b286-06c829f0641c 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/25251d4d-4bf2-4574-b286-06c829f0641c 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&tenantId=5ecc7413-2b7e-414a-9496-ad4a61f6cccf&size=200&page=1 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/5ecc7413-2b7e-414a-9496-ad4a61f6cccf/subscriptions 202 Accepted (88ms)"
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("reg update tenant all", async () => {
    await nock.back("reg-update-tenant-all.json");
    expect(await reg.registryUpdateAllDependencies(await freshContext(), undefined, [])).toBeUndefined();
    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      response: Job for update subscription of application: afc-dev and tenant: 5ecc7413-2b7e-414a-9496-ad4a61f6cccf, was created
      polling job /api/v2.0/jobs/7f01d658-f8eb-4d2c-bd1c-7aabaea2fcd0 with interval 15sec
      response: Job for update subscription of application: afc-dev and tenant: cb9158ce-f8fd-441b-b443-17219e8f79fa, was created
      polling job /api/v2.0/jobs/11213aa0-ee46-4edb-ad04-2c476dbf281d with interval 15sec
      response: Job for update subscription of application: afc-dev and tenant: 4c0909b1-a84e-4763-a26e-532fdb9e40fa, was created
      polling job /api/v2.0/jobs/1b2d77ce-5687-409a-9e90-98c8a6a1864d with interval 15sec
      response: Job for update subscription of application: afc-dev and tenant: 288393a7-972c-4fa8-acfd-12299c4db374, was created
      polling job /api/v2.0/jobs/6d35eb76-094d-4626-aa16-ef8f9a6931ed with interval 15sec
      response: Job for update subscription of application: afc-dev and tenant: cf528063-6a43-4bf2-8ccc-ca4e6d75d88e, was created
      polling job /api/v2.0/jobs/4ef337eb-3212-4b76-9c12-6486104c8a38 with interval 15sec
      response: Job for update subscription of application: afc-dev and tenant: 6917dfd6-7590-4033-af2a-140b75263b0d, was created
      polling job /api/v2.0/jobs/9f4404d2-1a6d-4638-b8d5-f95be5864edc with interval 15sec
      response: Job for update subscription of application: afc-dev and tenant: ae2dc112-9745-4f5e-8feb-79ebdc0094bd, was created
      polling job /api/v2.0/jobs/af06d002-6622-4cb9-8348-72baf33cd9d3 with interval 15sec
      response: Job for update subscription of application: afc-dev and tenant: dde70ec5-983d-4848-b50c-fb2cdac7d359, was created
      polling job /api/v2.0/jobs/e94d829e-0e1b-4deb-88d9-00bfc03bd81e with interval 15sec
      response: Job for update subscription of application: afc-dev and tenant: 663d2938-be50-44ab-92ca-538855eb594f, was created
      polling job /api/v2.0/jobs/2f205481-46a1-40ce-a2f3-2285b1b354d6 with interval 15sec
      response: Job for update subscription of application: afc-dev and tenant: 9c418100-6318-4e8a-b4b2-1114f4f44aef, was created
      polling job /api/v2.0/jobs/2fa5a778-fa76-47bf-8d8e-1503a609980b with interval 15sec
      [
        {
          "tenantId": "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
          "jobId": "7f01d658-f8eb-4d2c-bd1c-7aabaea2fcd0",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "cb9158ce-f8fd-441b-b443-17219e8f79fa",
          "jobId": "11213aa0-ee46-4edb-ad04-2c476dbf281d",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "4c0909b1-a84e-4763-a26e-532fdb9e40fa",
          "jobId": "1b2d77ce-5687-409a-9e90-98c8a6a1864d",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "288393a7-972c-4fa8-acfd-12299c4db374",
          "jobId": "6d35eb76-094d-4626-aa16-ef8f9a6931ed",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "cf528063-6a43-4bf2-8ccc-ca4e6d75d88e",
          "jobId": "4ef337eb-3212-4b76-9c12-6486104c8a38",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "6917dfd6-7590-4033-af2a-140b75263b0d",
          "jobId": "9f4404d2-1a6d-4638-b8d5-f95be5864edc",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "ae2dc112-9745-4f5e-8feb-79ebdc0094bd",
          "jobId": "af06d002-6622-4cb9-8348-72baf33cd9d3",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "dde70ec5-983d-4848-b50c-fb2cdac7d359",
          "jobId": "e94d829e-0e1b-4deb-88d9-00bfc03bd81e",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "663d2938-be50-44ab-92ca-538855eb594f",
          "jobId": "2f205481-46a1-40ce-a2f3-2285b1b354d6",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "9c418100-6318-4e8a-b4b2-1114f4f44aef",
          "jobId": "2fa5a778-fa76-47bf-8d8e-1503a609980b",
          "state": "SUCCEEDED"
        }
      ]
      
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/11213aa0-ee46-4edb-ad04-2c476dbf281d 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/11213aa0-ee46-4edb-ad04-2c476dbf281d 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/11213aa0-ee46-4edb-ad04-2c476dbf281d 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/11213aa0-ee46-4edb-ad04-2c476dbf281d 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/11213aa0-ee46-4edb-ad04-2c476dbf281d 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/1b2d77ce-5687-409a-9e90-98c8a6a1864d 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/1b2d77ce-5687-409a-9e90-98c8a6a1864d 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/1b2d77ce-5687-409a-9e90-98c8a6a1864d 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/1b2d77ce-5687-409a-9e90-98c8a6a1864d 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/1b2d77ce-5687-409a-9e90-98c8a6a1864d 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/2f205481-46a1-40ce-a2f3-2285b1b354d6 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/2f205481-46a1-40ce-a2f3-2285b1b354d6 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/2f205481-46a1-40ce-a2f3-2285b1b354d6 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/2f205481-46a1-40ce-a2f3-2285b1b354d6 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/2fa5a778-fa76-47bf-8d8e-1503a609980b 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/2fa5a778-fa76-47bf-8d8e-1503a609980b 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/2fa5a778-fa76-47bf-8d8e-1503a609980b 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/2fa5a778-fa76-47bf-8d8e-1503a609980b 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/4ef337eb-3212-4b76-9c12-6486104c8a38 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/4ef337eb-3212-4b76-9c12-6486104c8a38 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/4ef337eb-3212-4b76-9c12-6486104c8a38 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/4ef337eb-3212-4b76-9c12-6486104c8a38 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/6d35eb76-094d-4626-aa16-ef8f9a6931ed 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/6d35eb76-094d-4626-aa16-ef8f9a6931ed 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/6d35eb76-094d-4626-aa16-ef8f9a6931ed 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/6d35eb76-094d-4626-aa16-ef8f9a6931ed 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/6d35eb76-094d-4626-aa16-ef8f9a6931ed 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/7f01d658-f8eb-4d2c-bd1c-7aabaea2fcd0 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/7f01d658-f8eb-4d2c-bd1c-7aabaea2fcd0 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/7f01d658-f8eb-4d2c-bd1c-7aabaea2fcd0 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/7f01d658-f8eb-4d2c-bd1c-7aabaea2fcd0 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/7f01d658-f8eb-4d2c-bd1c-7aabaea2fcd0 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/9f4404d2-1a6d-4638-b8d5-f95be5864edc 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/9f4404d2-1a6d-4638-b8d5-f95be5864edc 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/9f4404d2-1a6d-4638-b8d5-f95be5864edc 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/9f4404d2-1a6d-4638-b8d5-f95be5864edc 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/9f4404d2-1a6d-4638-b8d5-f95be5864edc 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/af06d002-6622-4cb9-8348-72baf33cd9d3 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/af06d002-6622-4cb9-8348-72baf33cd9d3 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/af06d002-6622-4cb9-8348-72baf33cd9d3 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/e94d829e-0e1b-4deb-88d9-00bfc03bd81e 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/e94d829e-0e1b-4deb-88d9-00bfc03bd81e 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/e94d829e-0e1b-4deb-88d9-00bfc03bd81e 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/e94d829e-0e1b-4deb-88d9-00bfc03bd81e 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&size=200&page=1 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/288393a7-972c-4fa8-acfd-12299c4db374/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/4c0909b1-a84e-4763-a26e-532fdb9e40fa/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/5ecc7413-2b7e-414a-9496-ad4a61f6cccf/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/663d2938-be50-44ab-92ca-538855eb594f/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/6917dfd6-7590-4033-af2a-140b75263b0d/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/9c418100-6318-4e8a-b4b2-1114f4f44aef/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/ae2dc112-9745-4f5e-8feb-79ebdc0094bd/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/cb9158ce-f8fd-441b-b443-17219e8f79fa/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/cf528063-6a43-4bf2-8ccc-ca4e6d75d88e/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/dde70ec5-983d-4848-b50c-fb2cdac7d359/subscriptions 202 Accepted (88ms)"
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("reg update tenant application url all", async () => {
    await nock.back("reg-update-tenant-app-url-all.json");
    expect(await reg.registryUpdateApplicationURL(await freshContext(), [], [])).toBeUndefined();
    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      [
        {
          "tenantId": "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "cb9158ce-f8fd-441b-b443-17219e8f79fa",
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
          "tenantId": "cf528063-6a43-4bf2-8ccc-ca4e6d75d88e",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "6917dfd6-7590-4033-af2a-140b75263b0d",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "ae2dc112-9745-4f5e-8feb-79ebdc0094bd",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "dde70ec5-983d-4848-b50c-fb2cdac7d359",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "663d2938-be50-44ab-92ca-538855eb594f",
          "state": "SUCCEEDED"
        },
        {
          "tenantId": "9c418100-6318-4e8a-b4b2-1114f4f44aef",
          "state": "SUCCEEDED"
        }
      ]
      
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&size=200&page=1 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/288393a7-972c-4fa8-acfd-12299c4db374/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/4c0909b1-a84e-4763-a26e-532fdb9e40fa/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/5ecc7413-2b7e-414a-9496-ad4a61f6cccf/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/663d2938-be50-44ab-92ca-538855eb594f/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/6917dfd6-7590-4033-af2a-140b75263b0d/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/9c418100-6318-4e8a-b4b2-1114f4f44aef/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/ae2dc112-9745-4f5e-8feb-79ebdc0094bd/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/cb9158ce-f8fd-441b-b443-17219e8f79fa/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/cf528063-6a43-4bf2-8ccc-ca4e6d75d88e/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/dde70ec5-983d-4848-b50c-fb2cdac7d359/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)"
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("reg update tenant application url with tenant", async () => {
    await nock.back("reg-update-tenant-app-url.json");
    expect(await reg.registryUpdateApplicationURL(await freshContext(), [testTenantId], [])).toBeUndefined();
    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      {
        "tenantId": "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
        "state": "SUCCEEDED"
      }
      
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&tenantId=5ecc7413-2b7e-414a-9496-ad4a61f6cccf&size=200&page=1 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/5ecc7413-2b7e-414a-9496-ad4a61f6cccf/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)"
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });
});

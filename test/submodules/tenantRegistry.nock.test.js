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
        "GET https://api.cf.sap.hana.ondemand.com:443": 9,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 2,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 2,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-list-filtered.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 9,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 2,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 2,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-long-list.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 9,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 2,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 2,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-long-list-filtered.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 9,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 2,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 2,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-service-config.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 5,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-update-deps-tenant.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 9,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 4,
        "PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 2,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-update-deps-all.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 9,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 36,
        "PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 16,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 2,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-update-url-tenant.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 9,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 2,
        "PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 2,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-update-url-all.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 9,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 2,
        "PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 16,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 2,
      }
    `);
  });

  describe("reg list", () => {
    test("reg list basic", async () => {
      await nock.back("reg-list.json");
      const output = await reg.registryListSubscriptions(await freshContext(), [], [false, false, false, false]);
      expect(output).toMatchInlineSnapshot(`
        "#   consumerTenantId                      subscriptionId                        globalAccountId                       subdomain                       appName      plan      state       url                                                                 
        1   0de2abab-9030-4524-9940-e5b37ac75d92  8a625b43-956c-451f-b61a-a4248cb84f5a  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-task-model-management    afc-dev                SUBSCRIBED  https://skyfin-task-model-management.dev.eu10-canary.afc.cloud.sap  
        2   1bbe07b0-4de1-4cdb-830d-49b0ddf20b53  995f7bb0-2040-4905-ada5-a916eb0fcb56  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-ias-test                 afc-dev-sms  standard  SUBSCRIBED  https://skyfin-ias-test.dev.eu10-canary.afc.cloud.sap               
        3   4a5bcd5e-733d-4865-8f05-91937b680d4c  0bd71acf-a538-4e99-ad88-23277ac57d73  e9dc0c80-f047-40a4-a013-57bed3edd6fa  afc-402500-c22wco6t             afc-dev      standard  SUBSCRIBED  https://afc-402500-c22wco6t.dev.eu10-canary.afc.cloud.sap           
        4   4c0909b1-a84e-4763-a26e-532fdb9e40fa  b6db4043-7b32-4bc5-89cc-b605ac033edd  1fb05c0d-22c0-43d8-9ca7-c9ef0c28f67f  hw6-apps-eu10                   afc-dev      standard  SUBSCRIBED  https://hw6-apps-eu10.dev.eu10-canary.afc.cloud.sap                 
        5   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  2538cd89-8890-42f3-9d21-9250480a74a6  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-onboarding-test          afc-dev-sms  standard  SUBSCRIBED  https://skyfin-onboarding-test.dev.eu10-canary.afc.cloud.sap        
        6   663d2938-be50-44ab-92ca-538855eb594f  1da4a3ef-da21-4087-a9ca-7283c67f4e21  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-workzone                 afc-dev      standard  SUBSCRIBED  https://skyfin-workzone.dev.eu10-canary.afc.cloud.sap               
        7   73675fb3-0298-4cf3-8f86-a78c18392193  c2633973-b85f-4520-99cb-99173231fd94  5853d05a-ab42-4081-9397-e8c8c980f41b  i050811sapdev2-myafc-bybooster  afc-dev      standard  SUBSCRIBED  https://i050811sapdev2-myafc-bybooster.dev.eu10-canary.afc.cloud.sap
        8   86ab464d-5770-46b4-b93d-292c1416c453  6e0549f1-30db-441f-b27b-13ec1544069e  096cea2e-77ef-498f-a588-114b33817f5d  acra-dev-eu10-afc               afc-dev      standard  SUBSCRIBED  https://acra-dev-eu10-afc.dev.eu10-canary.afc.cloud.sap             
        9   9c418100-6318-4e8a-b4b2-1114f4f44aef  97e5ac7a-f91a-4bbf-a29d-443138d65313  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-booster                  afc-dev      standard  SUBSCRIBED  https://skyfin-booster.dev.eu10-canary.afc.cloud.sap                
        10  a1c320ff-b7f8-48d8-a20d-b44e92f69e65  aad6b25a-fb88-4a70-a343-59659ace75e3  e9dc0c80-f047-40a4-a013-57bed3edd6fa  tk02r4qx17c7dqhv                afc-dev      standard  SUBSCRIBED  https://tk02r4qx17c7dqhv.dev.eu10-canary.afc.cloud.sap              
        11  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  204919bb-585f-471e-97d7-5f249d182a94  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-sap-start                afc-dev      standard  SUBSCRIBED  https://skyfin-sap-start.dev.eu10-canary.afc.cloud.sap              
        12  ba22b06c-b55f-4940-ae38-b92a5928c8a5  04270e2a-f04f-426f-ab40-65b5625a1b8e  d1d271a7-1288-47c6-b34d-3456c2780be5  v20t58n-51jq8hrq                afc-dev      standard  SUBSCRIBED  https://v20t58n-51jq8hrq.dev.eu10-canary.afc.cloud.sap              
        13  be884689-aad4-486e-b556-23fdcf266f6d  4fe92245-71ba-4e93-b7cb-964ee40db376  0bb891ba-6257-4fde-b307-a1e33e97a0b7  test-afc-g2bup7lj               afc-dev      standard  SUBSCRIBED  https://test-afc-g2bup7lj.dev.eu10-canary.afc.cloud.sap             
        14  cb9158ce-f8fd-441b-b443-17219e8f79fa  76fcb047-85cc-baa4-9705-aa22aebf47f7  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skysand                         afc-dev                SUBSCRIBED  https://skysand.dev.eu10-canary.afc.cloud.sap                       
        15  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  b9659eb7-cf54-4cb4-bab2-6262b48b1a60  a6786cbf-f7e7-4103-9386-b91d1c07e3ea  jyd-dev-apps-eu10               afc-dev      standard  SUBSCRIBED  https://jyd-dev-apps-eu10.dev.eu10-canary.afc.cloud.sap             
        16  d91fb749-a148-479f-b29d-71b1b6a9309d  2002e8b0-8f67-4484-bb08-5baf7bee7c48  5853d05a-ab42-4081-9397-e8c8c980f41b  afctest1                        afc-dev      standard  SUBSCRIBED  https://afctest1.dev.eu10-canary.afc.cloud.sap                      "
      `);
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
        
        GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&size=200&page=1 200 OK (88ms)
        GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions?appName=afc-dev-sms&size=200&page=1 200 OK (88ms)"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("reg list timestamps", async () => {
      await nock.back("reg-list.json");
      const output = await reg.registryListSubscriptions(await freshContext(), [], [true, false, false, false]);
      expect(anonymizeListTimestamps(output)).toMatchInlineSnapshot(`
        "#   consumerTenantId                      subscriptionId                        globalAccountId                       subdomain                       appName      plan      state       url                                                                   created_on  updated_on
        1   0de2abab-9030-4524-9940-e5b37ac75d92  8a625b43-956c-451f-b61a-a4248cb84f5a  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-task-model-management    afc-dev                SUBSCRIBED  https://skyfin-task-model-management.dev.eu10-canary.afc.cloud.sap    2025-04-04T07:44:15Z (x days ago)  2025-10-27T16:30:10Z (x days ago)  
        2   1bbe07b0-4de1-4cdb-830d-49b0ddf20b53  995f7bb0-2040-4905-ada5-a916eb0fcb56  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-ias-test                 afc-dev-sms  standard  SUBSCRIBED  https://skyfin-ias-test.dev.eu10-canary.afc.cloud.sap                 2025-09-19T09:15:52Z (x days ago)  2025-10-27T16:30:11Z (x days ago)  
        3   4a5bcd5e-733d-4865-8f05-91937b680d4c  0bd71acf-a538-4e99-ad88-23277ac57d73  e9dc0c80-f047-40a4-a013-57bed3edd6fa  afc-402500-c22wco6t             afc-dev      standard  SUBSCRIBED  https://afc-402500-c22wco6t.dev.eu10-canary.afc.cloud.sap             2025-07-02T09:04:17Z (x days ago)  2025-10-27T16:30:06Z (x days ago)  
        4   4c0909b1-a84e-4763-a26e-532fdb9e40fa  b6db4043-7b32-4bc5-89cc-b605ac033edd  1fb05c0d-22c0-43d8-9ca7-c9ef0c28f67f  hw6-apps-eu10                   afc-dev      standard  SUBSCRIBED  https://hw6-apps-eu10.dev.eu10-canary.afc.cloud.sap                   2023-09-05T14:19:13Z (x days ago)  2025-10-27T16:30:11Z (x days ago)  
        5   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  2538cd89-8890-42f3-9d21-9250480a74a6  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-onboarding-test          afc-dev-sms  standard  SUBSCRIBED  https://skyfin-onboarding-test.dev.eu10-canary.afc.cloud.sap          2025-10-27T14:38:38Z (x days ago)  2025-10-27T16:30:10Z (x days ago)  
        6   663d2938-be50-44ab-92ca-538855eb594f  1da4a3ef-da21-4087-a9ca-7283c67f4e21  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-workzone                 afc-dev      standard  SUBSCRIBED  https://skyfin-workzone.dev.eu10-canary.afc.cloud.sap                 2024-09-11T07:32:10Z (x days ago)  2025-10-27T16:30:06Z (x days ago)  
        7   73675fb3-0298-4cf3-8f86-a78c18392193  c2633973-b85f-4520-99cb-99173231fd94  5853d05a-ab42-4081-9397-e8c8c980f41b  i050811sapdev2-myafc-bybooster  afc-dev      standard  SUBSCRIBED  https://i050811sapdev2-myafc-bybooster.dev.eu10-canary.afc.cloud.sap  2025-05-22T12:06:34Z (x days ago)  2025-10-27T16:30:37Z (x days ago)  
        8   86ab464d-5770-46b4-b93d-292c1416c453  6e0549f1-30db-441f-b27b-13ec1544069e  096cea2e-77ef-498f-a588-114b33817f5d  acra-dev-eu10-afc               afc-dev      standard  SUBSCRIBED  https://acra-dev-eu10-afc.dev.eu10-canary.afc.cloud.sap               2025-09-23T14:22:21Z (x days ago)  2025-10-27T16:30:35Z (x days ago)  
        9   9c418100-6318-4e8a-b4b2-1114f4f44aef  97e5ac7a-f91a-4bbf-a29d-443138d65313  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-booster                  afc-dev      standard  SUBSCRIBED  https://skyfin-booster.dev.eu10-canary.afc.cloud.sap                  2024-11-27T06:48:43Z (x days ago)  2025-10-27T16:30:35Z (x days ago)  
        10  a1c320ff-b7f8-48d8-a20d-b44e92f69e65  aad6b25a-fb88-4a70-a343-59659ace75e3  e9dc0c80-f047-40a4-a013-57bed3edd6fa  tk02r4qx17c7dqhv                afc-dev      standard  SUBSCRIBED  https://tk02r4qx17c7dqhv.dev.eu10-canary.afc.cloud.sap                2025-01-29T07:59:04Z (x days ago)  2025-10-27T16:30:35Z (x days ago)  
        11  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  204919bb-585f-471e-97d7-5f249d182a94  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-sap-start                afc-dev      standard  SUBSCRIBED  https://skyfin-sap-start.dev.eu10-canary.afc.cloud.sap                2024-07-05T11:18:15Z (x days ago)  2025-10-27T16:30:34Z (x days ago)  
        12  ba22b06c-b55f-4940-ae38-b92a5928c8a5  04270e2a-f04f-426f-ab40-65b5625a1b8e  d1d271a7-1288-47c6-b34d-3456c2780be5  v20t58n-51jq8hrq                afc-dev      standard  SUBSCRIBED  https://v20t58n-51jq8hrq.dev.eu10-canary.afc.cloud.sap                2025-09-25T10:01:52Z (x days ago)  2025-10-27T16:30:39Z (x days ago)  
        13  be884689-aad4-486e-b556-23fdcf266f6d  4fe92245-71ba-4e93-b7cb-964ee40db376  0bb891ba-6257-4fde-b307-a1e33e97a0b7  test-afc-g2bup7lj               afc-dev      standard  SUBSCRIBED  https://test-afc-g2bup7lj.dev.eu10-canary.afc.cloud.sap               2024-12-09T03:48:41Z (x days ago)  2025-10-27T16:31:05Z (x days ago)  
        14  cb9158ce-f8fd-441b-b443-17219e8f79fa  76fcb047-85cc-baa4-9705-aa22aebf47f7  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skysand                         afc-dev                SUBSCRIBED  https://skysand.dev.eu10-canary.afc.cloud.sap                         2022-09-05T12:11:10Z (x days ago)  2025-10-27T16:31:47Z (x days ago)  
        15  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  b9659eb7-cf54-4cb4-bab2-6262b48b1a60  a6786cbf-f7e7-4103-9386-b91d1c07e3ea  jyd-dev-apps-eu10               afc-dev      standard  SUBSCRIBED  https://jyd-dev-apps-eu10.dev.eu10-canary.afc.cloud.sap               2024-03-19T16:47:52Z (x days ago)  2025-10-27T16:31:04Z (x days ago)  
        16  d91fb749-a148-479f-b29d-71b1b6a9309d  2002e8b0-8f67-4484-bb08-5baf7bee7c48  5853d05a-ab42-4081-9397-e8c8c980f41b  afctest1                        afc-dev      standard  SUBSCRIBED  https://afctest1.dev.eu10-canary.afc.cloud.sap                        2025-05-22T12:25:05Z (x days ago)  2025-10-27T16:31:06Z (x days ago)  "
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
        "consumerTenantId                      subscriptionId                        globalAccountId                       subdomain               appName      plan      state       url                                                         
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  2538cd89-8890-42f3-9d21-9250480a74a6  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-onboarding-test  afc-dev-sms  standard  SUBSCRIBED  https://skyfin-onboarding-test.dev.eu10-canary.afc.cloud.sap"
      `);
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
        
        GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&tenantId=5ecc7413-2b7e-414a-9496-ad4a61f6cccf&size=200&page=1 200 OK (88ms)
        GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions?appName=afc-dev-sms&app_tid=5ecc7413-2b7e-414a-9496-ad4a61f6cccf&size=200&page=1 200 OK (88ms)"
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
        "consumerTenantId                      subscriptionId                        globalAccountId                       subdomain               appName      plan      state       url                                                           created_on  updated_on
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  2538cd89-8890-42f3-9d21-9250480a74a6  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-onboarding-test  afc-dev-sms  standard  SUBSCRIBED  https://skyfin-onboarding-test.dev.eu10-canary.afc.cloud.sap  2025-10-27T14:38:38Z (x days ago)  2025-10-27T16:30:10Z (x days ago)  "
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
        
        GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&size=200&page=1 200 OK (88ms)
        GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions?appName=afc-dev-sms&size=200&page=1 200 OK (88ms)"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("reg long list filtered basic/json", async () => {
      await nock.back("reg-long-list-filtered.json");
      const output = await reg.registryLongListSubscriptions(await freshContext(), [], [false, false, false]);
      expect(output).toMatchSnapshot();
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
        
        GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&size=200&page=1 200 OK (88ms)
        GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions?appName=afc-dev-sms&size=200&page=1 200 OK (88ms)"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });
  });

  test("reg service config", async () => {
    await nock.back("reg-service-config.json");
    const output = await reg.registryServiceConfig(await freshContext());
    expect(output).toMatchInlineSnapshot(`
      {
        "regServiceConfig": {
          "callbackTimeoutMillis": 900000,
          "getDependencies": "https://skyfin-dev-afc-mtx.mesh.cf.sap.hana.ondemand.com/-/cds/saas-provisioning/dependencies",
          "getSubscriptionParameters": "",
          "onSubscription": "https://skyfin-dev-afc-mtx.mesh.cf.sap.hana.ondemand.com/-/cds/saas-provisioning/tenant/{tenantId}",
          "onSubscriptionAsync": true,
          "onUnSubscriptionAsync": true,
          "onUpdateDependenciesAsync": false,
          "onUpdateSubscriptionParametersAsync": false,
          "runGetDependenciesOnAsyncCallback": false,
        },
        "smsServiceConfig": {
          "dependenciesCallbacks": {
            "url": "https://skyfin-dev-afc-mtx.mesh.cf.sap.hana.ondemand.com/-/cds/sms-provisioning/dependencies/{app_tid}",
          },
          "omitSubscriptionCallbacks": null,
          "subscriptionCallbacks": {
            "async": {
              "subscribeEnable": true,
              "timeoutInMillis": 600000,
              "unSubscribeEnable": true,
              "updateDependenciesEnable": false,
              "updateSubscriptionParametersEnable": false,
            },
            "url": "https://skyfin-dev-afc-mtx.mesh.cf.sap.hana.ondemand.com/-/cds/sms-provisioning/tenant/{app_tid}",
          },
          "subscriptionParamsCallbacks": {
            "url": "",
          },
        },
      }
    `);
    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      "
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("reg update tenant", async () => {
    await nock.back("reg-update-deps-tenant.json");
    await expect(reg.registryUpdateDependencies(await freshContext(), [testTenantId], [])).resolves
      .toMatchInlineSnapshot(`
            [
              {
                "duration": "0 sec",
                "subscriptionId": "d898ba97-2950-4fda-8ed0-127be8c0cfb0",
                "subscriptionState": "SUBSCRIBED",
                "tenantId": "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
                Symbol(IS_SUCCESS): true,
              },
            ]
          `);
    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      polling subscription /subscription-manager/v1/subscriptions/d898ba97-2950-4fda-8ed0-127be8c0cfb0 with interval 15sec
      
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&tenantId=5ecc7413-2b7e-414a-9496-ad4a61f6cccf&size=200&page=1 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/d898ba97-2950-4fda-8ed0-127be8c0cfb0 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/d898ba97-2950-4fda-8ed0-127be8c0cfb0 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions?appName=afc-dev-sms&app_tid=5ecc7413-2b7e-414a-9496-ad4a61f6cccf&size=200&page=1 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/5ecc7413-2b7e-414a-9496-ad4a61f6cccf 202 Accepted (88ms)"
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("reg update tenant all", async () => {
    await nock.back("reg-update-deps-all.json");
    await expect(reg.registryUpdateAllDependencies(await freshContext(), undefined, [])).resolves
      .toMatchInlineSnapshot(`
            [
              {
                "duration": "0 sec",
                "jobId": "10bb9cea-d5fb-4a18-ae8b-166444e6b04a",
                "jobState": "SUCCEEDED",
                "tenantId": "0de2abab-9030-4524-9940-e5b37ac75d92",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "subscriptionId": "6610a64c-3fbe-488b-9464-b9d8a8072db7",
                "subscriptionState": "SUBSCRIBED",
                "tenantId": "1bbe07b0-4de1-4cdb-830d-49b0ddf20b53",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "8d5500fe-a071-4598-8a49-ddd867cd3c56",
                "jobState": "SUCCEEDED",
                "tenantId": "4a5bcd5e-733d-4865-8f05-91937b680d4c",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "123112fb-3c31-4359-909d-c95bc1071198",
                "jobState": "SUCCEEDED",
                "tenantId": "4c0909b1-a84e-4763-a26e-532fdb9e40fa",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "subscriptionId": "d898ba97-2950-4fda-8ed0-127be8c0cfb0",
                "subscriptionState": "SUBSCRIBED",
                "tenantId": "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "c259cfbb-23c5-478e-b406-15376dd5c3bb",
                "jobState": "SUCCEEDED",
                "tenantId": "663d2938-be50-44ab-92ca-538855eb594f",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "d5a9adc1-aeed-4349-a88f-aa6f0d443f4d",
                "jobState": "SUCCEEDED",
                "tenantId": "73675fb3-0298-4cf3-8f86-a78c18392193",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "b6af29fd-10ac-46f6-8aa3-bfccdfa71c2b",
                "jobState": "SUCCEEDED",
                "tenantId": "86ab464d-5770-46b4-b93d-292c1416c453",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "870b0506-094e-40d9-9636-60331aa28b0d",
                "jobState": "SUCCEEDED",
                "tenantId": "9c418100-6318-4e8a-b4b2-1114f4f44aef",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "75ad50a8-cbfd-4d98-8bd9-b0b63da9b735",
                "jobState": "SUCCEEDED",
                "tenantId": "a1c320ff-b7f8-48d8-a20d-b44e92f69e65",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "8a7817c5-6f75-4040-80ed-acc4f829e026",
                "jobState": "SUCCEEDED",
                "tenantId": "ae2dc112-9745-4f5e-8feb-79ebdc0094bd",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "0980415a-647c-4002-b26b-dad2fbfe098d",
                "jobState": "SUCCEEDED",
                "tenantId": "ba22b06c-b55f-4940-ae38-b92a5928c8a5",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "68ee6db9-0fb3-4f15-9f19-4d05e7b50c42",
                "jobState": "SUCCEEDED",
                "tenantId": "be884689-aad4-486e-b556-23fdcf266f6d",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "0c28f720-5208-406b-9ce8-846180c5e0d7",
                "jobState": "SUCCEEDED",
                "tenantId": "cb9158ce-f8fd-441b-b443-17219e8f79fa",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "757c8453-6d76-474a-9ef2-77cc62ea00e3",
                "jobState": "SUCCEEDED",
                "tenantId": "cf528063-6a43-4bf2-8ccc-ca4e6d75d88e",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "f355ff0e-530b-4ae6-85f9-c5a26748e9a4",
                "jobState": "SUCCEEDED",
                "tenantId": "d91fb749-a148-479f-b29d-71b1b6a9309d",
                Symbol(IS_SUCCESS): true,
              },
            ]
          `);

    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      polling subscription /api/v2.0/jobs/10bb9cea-d5fb-4a18-ae8b-166444e6b04a with interval 15sec
      polling subscription /subscription-manager/v1/subscriptions/6610a64c-3fbe-488b-9464-b9d8a8072db7 with interval 15sec
      polling subscription /api/v2.0/jobs/8d5500fe-a071-4598-8a49-ddd867cd3c56 with interval 15sec
      polling subscription /api/v2.0/jobs/123112fb-3c31-4359-909d-c95bc1071198 with interval 15sec
      polling subscription /subscription-manager/v1/subscriptions/d898ba97-2950-4fda-8ed0-127be8c0cfb0 with interval 15sec
      polling subscription /api/v2.0/jobs/c259cfbb-23c5-478e-b406-15376dd5c3bb with interval 15sec
      polling subscription /api/v2.0/jobs/d5a9adc1-aeed-4349-a88f-aa6f0d443f4d with interval 15sec
      polling subscription /api/v2.0/jobs/b6af29fd-10ac-46f6-8aa3-bfccdfa71c2b with interval 15sec
      polling subscription /api/v2.0/jobs/870b0506-094e-40d9-9636-60331aa28b0d with interval 15sec
      polling subscription /api/v2.0/jobs/75ad50a8-cbfd-4d98-8bd9-b0b63da9b735 with interval 15sec
      polling subscription /api/v2.0/jobs/8a7817c5-6f75-4040-80ed-acc4f829e026 with interval 15sec
      polling subscription /api/v2.0/jobs/0980415a-647c-4002-b26b-dad2fbfe098d with interval 15sec
      polling subscription /api/v2.0/jobs/68ee6db9-0fb3-4f15-9f19-4d05e7b50c42 with interval 15sec
      polling subscription /api/v2.0/jobs/0c28f720-5208-406b-9ce8-846180c5e0d7 with interval 15sec
      polling subscription /api/v2.0/jobs/757c8453-6d76-474a-9ef2-77cc62ea00e3 with interval 15sec
      polling subscription /api/v2.0/jobs/f355ff0e-530b-4ae6-85f9-c5a26748e9a4 with interval 15sec
      
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/0980415a-647c-4002-b26b-dad2fbfe098d 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/0980415a-647c-4002-b26b-dad2fbfe098d 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/0c28f720-5208-406b-9ce8-846180c5e0d7 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/0c28f720-5208-406b-9ce8-846180c5e0d7 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/0c28f720-5208-406b-9ce8-846180c5e0d7 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/0c28f720-5208-406b-9ce8-846180c5e0d7 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/10bb9cea-d5fb-4a18-ae8b-166444e6b04a 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/10bb9cea-d5fb-4a18-ae8b-166444e6b04a 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/123112fb-3c31-4359-909d-c95bc1071198 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/123112fb-3c31-4359-909d-c95bc1071198 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/68ee6db9-0fb3-4f15-9f19-4d05e7b50c42 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/68ee6db9-0fb3-4f15-9f19-4d05e7b50c42 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/757c8453-6d76-474a-9ef2-77cc62ea00e3 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/757c8453-6d76-474a-9ef2-77cc62ea00e3 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/75ad50a8-cbfd-4d98-8bd9-b0b63da9b735 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/75ad50a8-cbfd-4d98-8bd9-b0b63da9b735 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/870b0506-094e-40d9-9636-60331aa28b0d 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/870b0506-094e-40d9-9636-60331aa28b0d 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/8a7817c5-6f75-4040-80ed-acc4f829e026 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/8a7817c5-6f75-4040-80ed-acc4f829e026 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/8d5500fe-a071-4598-8a49-ddd867cd3c56 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/8d5500fe-a071-4598-8a49-ddd867cd3c56 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/b6af29fd-10ac-46f6-8aa3-bfccdfa71c2b 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/b6af29fd-10ac-46f6-8aa3-bfccdfa71c2b 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/c259cfbb-23c5-478e-b406-15376dd5c3bb 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/c259cfbb-23c5-478e-b406-15376dd5c3bb 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/d5a9adc1-aeed-4349-a88f-aa6f0d443f4d 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/d5a9adc1-aeed-4349-a88f-aa6f0d443f4d 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/f355ff0e-530b-4ae6-85f9-c5a26748e9a4 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/f355ff0e-530b-4ae6-85f9-c5a26748e9a4 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&size=200&page=1 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/6610a64c-3fbe-488b-9464-b9d8a8072db7 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/6610a64c-3fbe-488b-9464-b9d8a8072db7 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/d898ba97-2950-4fda-8ed0-127be8c0cfb0 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/d898ba97-2950-4fda-8ed0-127be8c0cfb0 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions?appName=afc-dev-sms&size=200&page=1 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/0de2abab-9030-4524-9940-e5b37ac75d92/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/4a5bcd5e-733d-4865-8f05-91937b680d4c/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/4c0909b1-a84e-4763-a26e-532fdb9e40fa/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/663d2938-be50-44ab-92ca-538855eb594f/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/73675fb3-0298-4cf3-8f86-a78c18392193/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/86ab464d-5770-46b4-b93d-292c1416c453/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/9c418100-6318-4e8a-b4b2-1114f4f44aef/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/a1c320ff-b7f8-48d8-a20d-b44e92f69e65/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/ae2dc112-9745-4f5e-8feb-79ebdc0094bd/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/ba22b06c-b55f-4940-ae38-b92a5928c8a5/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/be884689-aad4-486e-b556-23fdcf266f6d/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/cb9158ce-f8fd-441b-b443-17219e8f79fa/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/cf528063-6a43-4bf2-8ccc-ca4e6d75d88e/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/d91fb749-a148-479f-b29d-71b1b6a9309d/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/1bbe07b0-4de1-4cdb-830d-49b0ddf20b53 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/5ecc7413-2b7e-414a-9496-ad4a61f6cccf 202 Accepted (88ms)"
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("reg update tenant application url with tenant", async () => {
    await nock.back("reg-update-url-tenant.json");
    await expect(reg.registryUpdateApplicationURL(await freshContext(), [testTenantId], [])).resolves
      .toMatchInlineSnapshot(`
            [
              {
                "duration": "0 sec",
                "info": "update succeeded",
                "tenantId": "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
                Symbol(IS_SUCCESS): true,
              },
            ]
          `);
    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&tenantId=5ecc7413-2b7e-414a-9496-ad4a61f6cccf&size=200&page=1 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions?appName=afc-dev-sms&app_tid=5ecc7413-2b7e-414a-9496-ad4a61f6cccf&size=200&page=1 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/5ecc7413-2b7e-414a-9496-ad4a61f6cccf?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)"
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("reg update tenant application url all", async () => {
    await nock.back("reg-update-url-all.json");
    await expect(reg.registryUpdateApplicationURL(await freshContext(), [], [])).resolves.toMatchInlineSnapshot(`
            [
              {
                "duration": "0 sec",
                "info": "update succeeded",
                "tenantId": "0de2abab-9030-4524-9940-e5b37ac75d92",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "info": "update succeeded",
                "tenantId": "1bbe07b0-4de1-4cdb-830d-49b0ddf20b53",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "info": "update succeeded",
                "tenantId": "4a5bcd5e-733d-4865-8f05-91937b680d4c",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "info": "update succeeded",
                "tenantId": "4c0909b1-a84e-4763-a26e-532fdb9e40fa",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "info": "update succeeded",
                "tenantId": "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "info": "update succeeded",
                "tenantId": "663d2938-be50-44ab-92ca-538855eb594f",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "info": "update succeeded",
                "tenantId": "73675fb3-0298-4cf3-8f86-a78c18392193",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "info": "update succeeded",
                "tenantId": "86ab464d-5770-46b4-b93d-292c1416c453",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "info": "update succeeded",
                "tenantId": "9c418100-6318-4e8a-b4b2-1114f4f44aef",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "info": "update succeeded",
                "tenantId": "a1c320ff-b7f8-48d8-a20d-b44e92f69e65",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "info": "update succeeded",
                "tenantId": "ae2dc112-9745-4f5e-8feb-79ebdc0094bd",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "info": "update succeeded",
                "tenantId": "ba22b06c-b55f-4940-ae38-b92a5928c8a5",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "info": "update succeeded",
                "tenantId": "be884689-aad4-486e-b556-23fdcf266f6d",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "info": "update succeeded",
                "tenantId": "cb9158ce-f8fd-441b-b443-17219e8f79fa",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "info": "update succeeded",
                "tenantId": "cf528063-6a43-4bf2-8ccc-ca4e6d75d88e",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "info": "update succeeded",
                "tenantId": "d91fb749-a148-479f-b29d-71b1b6a9309d",
                Symbol(IS_SUCCESS): true,
              },
            ]
          `);

    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&size=200&page=1 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions?appName=afc-dev-sms&size=200&page=1 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/0de2abab-9030-4524-9940-e5b37ac75d92/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/4a5bcd5e-733d-4865-8f05-91937b680d4c/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/4c0909b1-a84e-4763-a26e-532fdb9e40fa/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/663d2938-be50-44ab-92ca-538855eb594f/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/73675fb3-0298-4cf3-8f86-a78c18392193/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/86ab464d-5770-46b4-b93d-292c1416c453/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/9c418100-6318-4e8a-b4b2-1114f4f44aef/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/a1c320ff-b7f8-48d8-a20d-b44e92f69e65/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/ae2dc112-9745-4f5e-8feb-79ebdc0094bd/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/ba22b06c-b55f-4940-ae38-b92a5928c8a5/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/be884689-aad4-486e-b556-23fdcf266f6d/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/cb9158ce-f8fd-441b-b443-17219e8f79fa/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/cf528063-6a43-4bf2-8ccc-ca4e6d75d88e/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/d91fb749-a148-479f-b29d-71b1b6a9309d/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/1bbe07b0-4de1-4cdb-830d-49b0ddf20b53?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/5ecc7413-2b7e-414a-9496-ad4a61f6cccf?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)"
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });
});

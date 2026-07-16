"use strict";

const pathlib = require("path");
const nock = require("nock");

const { newContext } = require("../../src/context");
const reg = require("../../src/submodules/tenantRegistry");
const { outputFromLoggerPartitionFetch, anonymizeListTimestamps, collectRequestCount } = require("../test-util/static");

nock.back.fixtures = pathlib.resolve(`${__dirname}/../../test-nock-record/__nock-fixtures__`);
nock.back.setMode("lockdown");

const { beforeExpandSharedRefs } = require("../../test-nock-record/util/sharedFixtures");

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
    // eslint-disable-next-line jest/no-standalone-expect
    expect(nock.pendingMocks()).toEqual([]);
    nock.cleanAll();
  });

  test("request count", async () => {
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-list.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 25,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 2,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 2,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-list-filtered.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 25,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 2,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 2,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-long-list.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 25,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 2,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 2,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-long-list-filtered.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 25,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 2,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 2,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-service-config.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 25,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-update-deps-tenant.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 25,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 6,
        "PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 2,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-update-deps-all.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 25,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 66,
        "PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 23,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 2,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-update-url-tenant.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 25,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 2,
        "PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 2,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-update-url-all.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 25,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 2,
        "PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 23,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 2,
      }
    `);
  });

  describe("reg list", () => {
    test("reg list basic", async () => {
      await nock.back("reg-list.json", { before: beforeExpandSharedRefs });
      const output = await reg.registryListSubscriptions(await freshContext(), [], [false, false, false, false]);
      expect(output).toMatchInlineSnapshot(`
        "#   consumerTenantId                      subscriptionId                        globalAccountId                       subdomain                     appName      plan      state       url                                                               
        1   0de2abab-9030-4524-9940-e5b37ac75d92  8a625b43-956c-451f-b61a-a4248cb84f5a  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-task-model-management  afc-dev                SUBSCRIBED  https://skyfin-task-model-management.dev.eu10-canary.afc.cloud.sap
        2   116b3ac3-6d84-4ed5-81be-0af4464a09b6  2538cd89-8890-42f3-9d21-9250480a74a6  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-onboarding-test        afc-dev-sms  standard  SUBSCRIBED  https://skyfin-onboarding-test.dev.eu10-canary.afc.cloud.sap      
        3   1bbe07b0-4de1-4cdb-830d-49b0ddf20b53  995f7bb0-2040-4905-ada5-a916eb0fcb56  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-ias-test               afc-dev-sms  standard  SUBSCRIBED  https://skyfin-ias-test.dev.eu10-canary.afc.cloud.sap             
        4   1cc0aa7f-f77e-4038-9ab0-48ae43ed3c7a  2309994c-0e6a-44d1-a246-bb4e58525618  dc11d7c4-b65e-467d-8d96-82172463d915  support-ee                    afc-dev-sms  standard  SUBSCRIBED  https://support-ee.dev.eu10-canary.afc.cloud.sap                  
        5   4c0909b1-a84e-4763-a26e-532fdb9e40fa  b6db4043-7b32-4bc5-89cc-b605ac033edd  1fb05c0d-22c0-43d8-9ca7-c9ef0c28f67f  hw6-apps-eu10                 afc-dev      standard  SUBSCRIBED  https://hw6-apps-eu10.dev.eu10-canary.afc.cloud.sap               
        6   524ffdf2-8174-4b70-bc10-36bf458ab360  7ab41ed3-b938-4b7d-b951-f2452d663d84  23accf3a-a3c6-4521-973c-e8e0f05d27b7  wb1k383qm34wrr5x              afc-dev-sms  standard  SUBSCRIBED  https://wb1k383qm34wrr5x.dev.eu10-canary.afc.cloud.sap            
        7   5d5ebba0-e1b9-44c3-989e-f274438c91ec  32a5a55f-9185-4636-a316-eab6441cc3bc  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-booster-retest         afc-dev-sms  standard  SUBSCRIBED  https://skyfin-booster-retest.dev.eu10-canary.afc.cloud.sap       
        8   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  07a3fb9e-8c5d-4126-9f4e-53218998c0d1  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-company                afc-dev-sms  standard  SUBSCRIBED  https://skyfin-company.dev.eu10-canary.afc.cloud.sap              
        9   663d2938-be50-44ab-92ca-538855eb594f  1da4a3ef-da21-4087-a9ca-7283c67f4e21  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-workzone               afc-dev      standard  SUBSCRIBED  https://skyfin-workzone.dev.eu10-canary.afc.cloud.sap             
        10  79604d57-3933-4a66-81c2-a022413ec11d  26c6a0fd-fffd-45d4-9787-6eab54595ba8  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-booster-ias            afc-dev-sms  standard  SUBSCRIBED  https://skyfin-booster-ias.dev.eu10-canary.afc.cloud.sap          
        11  86ab464d-5770-46b4-b93d-292c1416c453  6e0549f1-30db-441f-b27b-13ec1544069e  096cea2e-77ef-498f-a588-114b33817f5d  acra-dev-eu10-afc             afc-dev      standard  SUBSCRIBED  https://acra-dev-eu10-afc.dev.eu10-canary.afc.cloud.sap           
        12  899887a3-46a1-4370-b69a-d615f7420f08  5a096405-06ea-4824-b856-e85124f00752  23accf3a-a3c6-4521-973c-e8e0f05d27b7  jt35-4gy8z-hq495              afc-dev-sms  standard  SUBSCRIBED  https://jt35-4gy8z-hq495.dev.eu10-canary.afc.cloud.sap            
        13  97b55bf7-a906-42ab-9176-3e86762dcdb7  acbf01be-fe81-4175-b41e-ac8008b8eb4d  3a2babd2-8520-4291-9fa6-d5c11097cc3d  research-and-innovation       afc-dev-sms  standard  SUBSCRIBED  https://research-and-innovation.dev.eu10-canary.afc.cloud.sap     
        14  9c418100-6318-4e8a-b4b2-1114f4f44aef  97e5ac7a-f91a-4bbf-a29d-443138d65313  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-booster                afc-dev      standard  SUBSCRIBED  https://skyfin-booster.dev.eu10-canary.afc.cloud.sap              
        15  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  204919bb-585f-471e-97d7-5f249d182a94  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-sap-start              afc-dev      standard  SUBSCRIBED  https://skyfin-sap-start.dev.eu10-canary.afc.cloud.sap            
        16  b46f4c09-e46e-432b-b837-0aad96d145f9  e8050628-a098-403b-9f22-781e0e46d821  aba29156-0716-4958-b4e1-c43a6bd7e572  zwqh6y1-3gxwtj3l              afc-dev      standard  SUBSCRIBED  https://zwqh6y1-3gxwtj3l.dev.eu10-canary.afc.cloud.sap            
        17  ba22b06c-b55f-4940-ae38-b92a5928c8a5  04270e2a-f04f-426f-ab40-65b5625a1b8e  d1d271a7-1288-47c6-b34d-3456c2780be5  v20t58n-51jq8hrq              afc-dev      standard  SUBSCRIBED  https://v20t58n-51jq8hrq.dev.eu10-canary.afc.cloud.sap            
        18  be884689-aad4-486e-b556-23fdcf266f6d  4fe92245-71ba-4e93-b7cb-964ee40db376  0bb891ba-6257-4fde-b307-a1e33e97a0b7  test-afc-g2bup7lj             afc-dev      standard  SUBSCRIBED  https://test-afc-g2bup7lj.dev.eu10-canary.afc.cloud.sap           
        19  cb9158ce-f8fd-441b-b443-17219e8f79fa  76fcb047-85cc-baa4-9705-aa22aebf47f7  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skysand                       afc-dev                SUBSCRIBED  https://skysand.dev.eu10-canary.afc.cloud.sap                     
        20  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  b9659eb7-cf54-4cb4-bab2-6262b48b1a60  a6786cbf-f7e7-4103-9386-b91d1c07e3ea  jyd-dev-apps-eu10             afc-dev      standard  SUBSCRIBED  https://jyd-dev-apps-eu10.dev.eu10-canary.afc.cloud.sap           
        21  e0cdfa19-1d01-48b5-bc78-cb4785b20bc6  8ffa6617-3e23-41f1-9fb1-bb77cb1008af  23accf3a-a3c6-4521-973c-e8e0f05d27b7  t0752sztfb5l4fz1              afc-dev-sms  standard  SUBSCRIBED  https://t0752sztfb5l4fz1.dev.eu10-canary.afc.cloud.sap            
        22  ed99fc2a-b367-4fc6-8918-5547e2e655a7  3d85a09c-66be-4608-83a3-e96bd4a2e04c  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  afc-e2e                       afc-dev      standard  SUBSCRIBED  https://afc-e2e.dev.eu10-canary.afc.cloud.sap                     
        23  fe2e319f-68cd-450f-8a02-d726dac64b35  6cc71fb4-be2f-4d0f-82f5-c385f1f1999d  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  sky-major-tom-fin             afc-dev      standard  SUBSCRIBED  https://sky-major-tom-fin.dev.eu10-canary.afc.cloud.sap           "
      `);
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
        
        GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&size=200&page=1 200 OK (88ms)
        GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions?appName=afc-dev-sms&size=200&page=1 200 OK (88ms)"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("reg list timestamps", async () => {
      await nock.back("reg-list.json", { before: beforeExpandSharedRefs });
      const output = await reg.registryListSubscriptions(await freshContext(), [], [true, false, false, false]);
      expect(anonymizeListTimestamps(output)).toMatchInlineSnapshot(`
        "#   consumerTenantId                      subscriptionId                        globalAccountId                       subdomain                     appName      plan      state       url                                                                 created_on  updated_on
        1   0de2abab-9030-4524-9940-e5b37ac75d92  8a625b43-956c-451f-b61a-a4248cb84f5a  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-task-model-management  afc-dev                SUBSCRIBED  https://skyfin-task-model-management.dev.eu10-canary.afc.cloud.sap  2025-04-04T07:44:15Z (x days ago)  2026-07-01T14:29:17Z (x days ago)  
        2   116b3ac3-6d84-4ed5-81be-0af4464a09b6  2538cd89-8890-42f3-9d21-9250480a74a6  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-onboarding-test        afc-dev-sms  standard  SUBSCRIBED  https://skyfin-onboarding-test.dev.eu10-canary.afc.cloud.sap        2025-10-27T14:38:38Z (x days ago)  2026-07-01T14:29:18Z (x days ago)  
        3   1bbe07b0-4de1-4cdb-830d-49b0ddf20b53  995f7bb0-2040-4905-ada5-a916eb0fcb56  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-ias-test               afc-dev-sms  standard  SUBSCRIBED  https://skyfin-ias-test.dev.eu10-canary.afc.cloud.sap               2025-09-19T09:15:52Z (x days ago)  2026-07-01T14:29:22Z (x days ago)  
        4   1cc0aa7f-f77e-4038-9ab0-48ae43ed3c7a  2309994c-0e6a-44d1-a246-bb4e58525618  dc11d7c4-b65e-467d-8d96-82172463d915  support-ee                    afc-dev-sms  standard  SUBSCRIBED  https://support-ee.dev.eu10-canary.afc.cloud.sap                    2026-04-17T16:17:09Z (x days ago)  2026-07-01T14:29:21Z (x days ago)  
        5   4c0909b1-a84e-4763-a26e-532fdb9e40fa  b6db4043-7b32-4bc5-89cc-b605ac033edd  1fb05c0d-22c0-43d8-9ca7-c9ef0c28f67f  hw6-apps-eu10                 afc-dev      standard  SUBSCRIBED  https://hw6-apps-eu10.dev.eu10-canary.afc.cloud.sap                 2023-09-05T14:19:13Z (x days ago)  2026-07-01T14:29:17Z (x days ago)  
        6   524ffdf2-8174-4b70-bc10-36bf458ab360  7ab41ed3-b938-4b7d-b951-f2452d663d84  23accf3a-a3c6-4521-973c-e8e0f05d27b7  wb1k383qm34wrr5x              afc-dev-sms  standard  SUBSCRIBED  https://wb1k383qm34wrr5x.dev.eu10-canary.afc.cloud.sap              2026-05-18T11:02:43Z (x days ago)  2026-07-01T14:29:20Z (x days ago)  
        7   5d5ebba0-e1b9-44c3-989e-f274438c91ec  32a5a55f-9185-4636-a316-eab6441cc3bc  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-booster-retest         afc-dev-sms  standard  SUBSCRIBED  https://skyfin-booster-retest.dev.eu10-canary.afc.cloud.sap         2026-06-08T05:30:55Z (x days ago)  2026-07-01T14:30:01Z (x days ago)  
        8   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  07a3fb9e-8c5d-4126-9f4e-53218998c0d1  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-company                afc-dev-sms  standard  SUBSCRIBED  https://skyfin-company.dev.eu10-canary.afc.cloud.sap                2025-09-18T09:24:29Z (x days ago)  2026-07-01T14:30:00Z (x days ago)  
        9   663d2938-be50-44ab-92ca-538855eb594f  1da4a3ef-da21-4087-a9ca-7283c67f4e21  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-workzone               afc-dev      standard  SUBSCRIBED  https://skyfin-workzone.dev.eu10-canary.afc.cloud.sap               2024-09-11T07:32:10Z (x days ago)  2026-07-01T14:29:58Z (x days ago)  
        10  79604d57-3933-4a66-81c2-a022413ec11d  26c6a0fd-fffd-45d4-9787-6eab54595ba8  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-booster-ias            afc-dev-sms  standard  SUBSCRIBED  https://skyfin-booster-ias.dev.eu10-canary.afc.cloud.sap            2026-01-15T10:41:36Z (x days ago)  2026-07-01T14:30:03Z (x days ago)  
        11  86ab464d-5770-46b4-b93d-292c1416c453  6e0549f1-30db-441f-b27b-13ec1544069e  096cea2e-77ef-498f-a588-114b33817f5d  acra-dev-eu10-afc             afc-dev      standard  SUBSCRIBED  https://acra-dev-eu10-afc.dev.eu10-canary.afc.cloud.sap             2025-09-23T14:22:21Z (x days ago)  2026-07-01T14:30:29Z (x days ago)  
        12  899887a3-46a1-4370-b69a-d615f7420f08  5a096405-06ea-4824-b856-e85124f00752  23accf3a-a3c6-4521-973c-e8e0f05d27b7  jt35-4gy8z-hq495              afc-dev-sms  standard  SUBSCRIBED  https://jt35-4gy8z-hq495.dev.eu10-canary.afc.cloud.sap              2026-05-20T05:21:36Z (x days ago)  2026-07-01T14:30:32Z (x days ago)  
        13  97b55bf7-a906-42ab-9176-3e86762dcdb7  acbf01be-fe81-4175-b41e-ac8008b8eb4d  3a2babd2-8520-4291-9fa6-d5c11097cc3d  research-and-innovation       afc-dev-sms  standard  SUBSCRIBED  https://research-and-innovation.dev.eu10-canary.afc.cloud.sap       2026-03-12T14:49:04Z (x days ago)  2026-07-01T14:30:30Z (x days ago)  
        14  9c418100-6318-4e8a-b4b2-1114f4f44aef  97e5ac7a-f91a-4bbf-a29d-443138d65313  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-booster                afc-dev      standard  SUBSCRIBED  https://skyfin-booster.dev.eu10-canary.afc.cloud.sap                2024-11-27T06:48:43Z (x days ago)  2026-07-01T14:30:29Z (x days ago)  
        15  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  204919bb-585f-471e-97d7-5f249d182a94  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-sap-start              afc-dev      standard  SUBSCRIBED  https://skyfin-sap-start.dev.eu10-canary.afc.cloud.sap              2024-07-05T11:18:15Z (x days ago)  2026-07-01T14:30:43Z (x days ago)  
        16  b46f4c09-e46e-432b-b837-0aad96d145f9  e8050628-a098-403b-9f22-781e0e46d821  aba29156-0716-4958-b4e1-c43a6bd7e572  zwqh6y1-3gxwtj3l              afc-dev      standard  SUBSCRIBED  https://zwqh6y1-3gxwtj3l.dev.eu10-canary.afc.cloud.sap              2025-12-22T02:13:53Z (x days ago)  2026-07-01T14:31:00Z (x days ago)  
        17  ba22b06c-b55f-4940-ae38-b92a5928c8a5  04270e2a-f04f-426f-ab40-65b5625a1b8e  d1d271a7-1288-47c6-b34d-3456c2780be5  v20t58n-51jq8hrq              afc-dev      standard  SUBSCRIBED  https://v20t58n-51jq8hrq.dev.eu10-canary.afc.cloud.sap              2025-09-25T10:01:52Z (x days ago)  2026-07-01T14:30:59Z (x days ago)  
        18  be884689-aad4-486e-b556-23fdcf266f6d  4fe92245-71ba-4e93-b7cb-964ee40db376  0bb891ba-6257-4fde-b307-a1e33e97a0b7  test-afc-g2bup7lj             afc-dev      standard  SUBSCRIBED  https://test-afc-g2bup7lj.dev.eu10-canary.afc.cloud.sap             2024-12-09T03:48:41Z (x days ago)  2026-07-01T14:31:00Z (x days ago)  
        19  cb9158ce-f8fd-441b-b443-17219e8f79fa  76fcb047-85cc-baa4-9705-aa22aebf47f7  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skysand                       afc-dev                SUBSCRIBED  https://skysand.dev.eu10-canary.afc.cloud.sap                       2022-09-05T12:11:10Z (x days ago)  2026-07-01T14:30:58Z (x days ago)  
        20  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  b9659eb7-cf54-4cb4-bab2-6262b48b1a60  a6786cbf-f7e7-4103-9386-b91d1c07e3ea  jyd-dev-apps-eu10             afc-dev      standard  SUBSCRIBED  https://jyd-dev-apps-eu10.dev.eu10-canary.afc.cloud.sap             2024-03-19T16:47:52Z (x days ago)  2026-07-01T14:31:01Z (x days ago)  
        21  e0cdfa19-1d01-48b5-bc78-cb4785b20bc6  8ffa6617-3e23-41f1-9fb1-bb77cb1008af  23accf3a-a3c6-4521-973c-e8e0f05d27b7  t0752sztfb5l4fz1              afc-dev-sms  standard  SUBSCRIBED  https://t0752sztfb5l4fz1.dev.eu10-canary.afc.cloud.sap              2026-05-19T14:34:20Z (x days ago)  2026-07-01T14:31:34Z (x days ago)  
        22  ed99fc2a-b367-4fc6-8918-5547e2e655a7  3d85a09c-66be-4608-83a3-e96bd4a2e04c  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  afc-e2e                       afc-dev      standard  SUBSCRIBED  https://afc-e2e.dev.eu10-canary.afc.cloud.sap                       2025-11-27T08:33:57Z (x days ago)  2026-07-01T14:31:34Z (x days ago)  
        23  fe2e319f-68cd-450f-8a02-d726dac64b35  6cc71fb4-be2f-4d0f-82f5-c385f1f1999d  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  sky-major-tom-fin             afc-dev      standard  SUBSCRIBED  https://sky-major-tom-fin.dev.eu10-canary.afc.cloud.sap             2025-12-02T12:41:56Z (x days ago)  2026-07-01T14:31:33Z (x days ago)  "
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("reg list json", async () => {
      await nock.back("reg-list.json", { before: beforeExpandSharedRefs });
      const output = await reg.registryListSubscriptions(await freshContext(), [], [true, true, false, false]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("reg list filtered basic", async () => {
      await nock.back("reg-list-filtered.json", { before: beforeExpandSharedRefs });
      const output = await reg.registryListSubscriptions(
        await freshContext(),
        [testTenantId],
        [false, false, false, false]
      );
      expect(output).toMatchInlineSnapshot(`
        "consumerTenantId                      subscriptionId                        globalAccountId                       subdomain       appName      plan      state       url                                                 
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  07a3fb9e-8c5d-4126-9f4e-53218998c0d1  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-company  afc-dev-sms  standard  SUBSCRIBED  https://skyfin-company.dev.eu10-canary.afc.cloud.sap"
      `);
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
        
        GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&tenantId=5ecc7413-2b7e-414a-9496-ad4a61f6cccf&size=200&page=1 200 OK (88ms)
        GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions?appName=afc-dev-sms&app_tid=5ecc7413-2b7e-414a-9496-ad4a61f6cccf&size=200&page=1 200 OK (88ms)"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("reg list filtered timestamps", async () => {
      await nock.back("reg-list-filtered.json", { before: beforeExpandSharedRefs });
      const output = await reg.registryListSubscriptions(
        await freshContext(),
        [testTenantId],
        [true, false, false, false]
      );
      expect(anonymizeListTimestamps(output)).toMatchInlineSnapshot(`
        "consumerTenantId                      subscriptionId                        globalAccountId                       subdomain       appName      plan      state       url                                                   created_on  updated_on
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  07a3fb9e-8c5d-4126-9f4e-53218998c0d1  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-company  afc-dev-sms  standard  SUBSCRIBED  https://skyfin-company.dev.eu10-canary.afc.cloud.sap  2025-09-18T09:24:29Z (x days ago)  2026-07-01T14:30:00Z (x days ago)  "
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("reg list filtered json", async () => {
      await nock.back("reg-list-filtered.json", { before: beforeExpandSharedRefs });
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
      await nock.back("reg-long-list.json", { before: beforeExpandSharedRefs });
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
      await nock.back("reg-long-list-filtered.json", { before: beforeExpandSharedRefs });
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
    await nock.back("reg-service-config.json", { before: beforeExpandSharedRefs });
    const output = await reg.registryServiceConfig(await freshContext());
    expect(output).toMatchInlineSnapshot(`
      {
        "regServiceConfig": {
          "callbackTimeoutMillis": 900000,
          "getDependencies": "https://skyfin-dev-afc-mtx.mesh.cf.sap.hana.ondemand.com/-/cds/saas-provisioning/dependencies",
          "getSubscriptionParameters": "",
          "onSubscription": "https://skyfin-dev-afc-mtx.mesh.cf.sap.hana.ondemand.com/-/cds/saas-provisioning/tenant/{tenantId}",
          "onSubscriptionAsync": true,
          "onSubscriptionFailure": null,
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
          "subscriptionFailureCallbacks": null,
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
    await nock.back("reg-update-deps-tenant.json", { before: beforeExpandSharedRefs });
    await expect(reg.registryUpdateDependencies(await freshContext(), [testTenantId], [])).resolves
      .toMatchInlineSnapshot(`
            [
              {
                "duration": "0 sec",
                "subscriptionId": "07a3fb9e-8c5d-4126-9f4e-53218998c0d1",
                "subscriptionState": "SUBSCRIBED",
                "tenantId": "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
                Symbol(IS_SUCCESS): true,
              },
            ]
          `);
    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      polling subscription /subscription-manager/v1/subscriptions/07a3fb9e-8c5d-4126-9f4e-53218998c0d1 with interval 15sec
      
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&tenantId=5ecc7413-2b7e-414a-9496-ad4a61f6cccf&size=200&page=1 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/07a3fb9e-8c5d-4126-9f4e-53218998c0d1 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/07a3fb9e-8c5d-4126-9f4e-53218998c0d1 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/07a3fb9e-8c5d-4126-9f4e-53218998c0d1 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/07a3fb9e-8c5d-4126-9f4e-53218998c0d1 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions?appName=afc-dev-sms&app_tid=5ecc7413-2b7e-414a-9496-ad4a61f6cccf&size=200&page=1 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/5ecc7413-2b7e-414a-9496-ad4a61f6cccf 202 Accepted (88ms)"
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("reg update tenant all", async () => {
    await nock.back("reg-update-deps-all.json", { before: beforeExpandSharedRefs });
    await expect(reg.registryUpdateAllDependencies(await freshContext(), undefined, [])).resolves
      .toMatchInlineSnapshot(`
            [
              {
                "duration": "0 sec",
                "jobId": "13726afb-4ab7-43ba-abdd-3cf56da2d2cd",
                "jobState": "SUCCEEDED",
                "tenantId": "0de2abab-9030-4524-9940-e5b37ac75d92",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "subscriptionId": "d898ba97-2950-4fda-8ed0-127be8c0cfb0",
                "subscriptionState": "SUBSCRIBED",
                "tenantId": "116b3ac3-6d84-4ed5-81be-0af4464a09b6",
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
                "subscriptionId": "2309994c-0e6a-44d1-a246-bb4e58525618",
                "subscriptionState": "SUBSCRIBED",
                "tenantId": "1cc0aa7f-f77e-4038-9ab0-48ae43ed3c7a",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "981c37d3-6428-4626-b9c9-8fdf50acc2a9",
                "jobState": "SUCCEEDED",
                "tenantId": "4c0909b1-a84e-4763-a26e-532fdb9e40fa",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "subscriptionId": "7ab41ed3-b938-4b7d-b951-f2452d663d84",
                "subscriptionState": "SUBSCRIBED",
                "tenantId": "524ffdf2-8174-4b70-bc10-36bf458ab360",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "subscriptionId": "32a5a55f-9185-4636-a316-eab6441cc3bc",
                "subscriptionState": "SUBSCRIBED",
                "tenantId": "5d5ebba0-e1b9-44c3-989e-f274438c91ec",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "subscriptionId": "07a3fb9e-8c5d-4126-9f4e-53218998c0d1",
                "subscriptionState": "SUBSCRIBED",
                "tenantId": "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "df53d234-098d-452f-a093-f446103c6f81",
                "jobState": "SUCCEEDED",
                "tenantId": "663d2938-be50-44ab-92ca-538855eb594f",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "subscriptionId": "26c6a0fd-fffd-45d4-9787-6eab54595ba8",
                "subscriptionState": "SUBSCRIBED",
                "tenantId": "79604d57-3933-4a66-81c2-a022413ec11d",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "0c0a7dd5-1a92-4b0e-90d0-79bff2eddeac",
                "jobState": "SUCCEEDED",
                "tenantId": "86ab464d-5770-46b4-b93d-292c1416c453",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "subscriptionId": "5a096405-06ea-4824-b856-e85124f00752",
                "subscriptionState": "SUBSCRIBED",
                "tenantId": "899887a3-46a1-4370-b69a-d615f7420f08",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "subscriptionId": "acbf01be-fe81-4175-b41e-ac8008b8eb4d",
                "subscriptionState": "SUBSCRIBED",
                "tenantId": "97b55bf7-a906-42ab-9176-3e86762dcdb7",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "32722908-d464-459f-a9e3-7f440bb83ac1",
                "jobState": "SUCCEEDED",
                "tenantId": "9c418100-6318-4e8a-b4b2-1114f4f44aef",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "bb3c492d-0cc4-4ba3-ab3a-a9a603806cbf",
                "jobState": "SUCCEEDED",
                "tenantId": "ae2dc112-9745-4f5e-8feb-79ebdc0094bd",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "d791d2c1-2d8c-445d-8d76-0df4dadb76bc",
                "jobState": "SUCCEEDED",
                "tenantId": "b46f4c09-e46e-432b-b837-0aad96d145f9",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "cb651518-7877-4436-ba9b-f73976b3b9aa",
                "jobState": "SUCCEEDED",
                "tenantId": "ba22b06c-b55f-4940-ae38-b92a5928c8a5",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "78cf6af4-98ce-4190-9f9a-455059ae2cdf",
                "jobState": "SUCCEEDED",
                "tenantId": "be884689-aad4-486e-b556-23fdcf266f6d",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "9d58350e-0fdc-4ec8-89e5-03ce3962d049",
                "jobState": "SUCCEEDED",
                "tenantId": "cb9158ce-f8fd-441b-b443-17219e8f79fa",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "622abffb-c0fa-4a21-8a18-31196313c9e1",
                "jobState": "SUCCEEDED",
                "tenantId": "cf528063-6a43-4bf2-8ccc-ca4e6d75d88e",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "subscriptionId": "8ffa6617-3e23-41f1-9fb1-bb77cb1008af",
                "subscriptionState": "SUBSCRIBED",
                "tenantId": "e0cdfa19-1d01-48b5-bc78-cb4785b20bc6",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "9791be51-9dcd-4311-bbc1-ce3da088d566",
                "jobState": "SUCCEEDED",
                "tenantId": "ed99fc2a-b367-4fc6-8918-5547e2e655a7",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "38a08e8a-29cc-4072-8a44-343ab8c32344",
                "jobState": "SUCCEEDED",
                "tenantId": "fe2e319f-68cd-450f-8a02-d726dac64b35",
                Symbol(IS_SUCCESS): true,
              },
            ]
          `);

    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      polling subscription /api/v2.0/jobs/13726afb-4ab7-43ba-abdd-3cf56da2d2cd with interval 15sec
      polling subscription /subscription-manager/v1/subscriptions/d898ba97-2950-4fda-8ed0-127be8c0cfb0 with interval 15sec
      polling subscription /subscription-manager/v1/subscriptions/6610a64c-3fbe-488b-9464-b9d8a8072db7 with interval 15sec
      polling subscription /subscription-manager/v1/subscriptions/2309994c-0e6a-44d1-a246-bb4e58525618 with interval 15sec
      polling subscription /api/v2.0/jobs/981c37d3-6428-4626-b9c9-8fdf50acc2a9 with interval 15sec
      polling subscription /subscription-manager/v1/subscriptions/7ab41ed3-b938-4b7d-b951-f2452d663d84 with interval 15sec
      polling subscription /subscription-manager/v1/subscriptions/32a5a55f-9185-4636-a316-eab6441cc3bc with interval 15sec
      polling subscription /subscription-manager/v1/subscriptions/07a3fb9e-8c5d-4126-9f4e-53218998c0d1 with interval 15sec
      polling subscription /api/v2.0/jobs/df53d234-098d-452f-a093-f446103c6f81 with interval 15sec
      polling subscription /subscription-manager/v1/subscriptions/26c6a0fd-fffd-45d4-9787-6eab54595ba8 with interval 15sec
      polling subscription /api/v2.0/jobs/0c0a7dd5-1a92-4b0e-90d0-79bff2eddeac with interval 15sec
      polling subscription /subscription-manager/v1/subscriptions/5a096405-06ea-4824-b856-e85124f00752 with interval 15sec
      polling subscription /subscription-manager/v1/subscriptions/acbf01be-fe81-4175-b41e-ac8008b8eb4d with interval 15sec
      polling subscription /api/v2.0/jobs/32722908-d464-459f-a9e3-7f440bb83ac1 with interval 15sec
      polling subscription /api/v2.0/jobs/bb3c492d-0cc4-4ba3-ab3a-a9a603806cbf with interval 15sec
      polling subscription /api/v2.0/jobs/d791d2c1-2d8c-445d-8d76-0df4dadb76bc with interval 15sec
      polling subscription /api/v2.0/jobs/cb651518-7877-4436-ba9b-f73976b3b9aa with interval 15sec
      polling subscription /api/v2.0/jobs/78cf6af4-98ce-4190-9f9a-455059ae2cdf with interval 15sec
      polling subscription /api/v2.0/jobs/9d58350e-0fdc-4ec8-89e5-03ce3962d049 with interval 15sec
      polling subscription /api/v2.0/jobs/622abffb-c0fa-4a21-8a18-31196313c9e1 with interval 15sec
      polling subscription /subscription-manager/v1/subscriptions/8ffa6617-3e23-41f1-9fb1-bb77cb1008af with interval 15sec
      polling subscription /api/v2.0/jobs/9791be51-9dcd-4311-bbc1-ce3da088d566 with interval 15sec
      polling subscription /api/v2.0/jobs/38a08e8a-29cc-4072-8a44-343ab8c32344 with interval 15sec
      
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/0c0a7dd5-1a92-4b0e-90d0-79bff2eddeac 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/0c0a7dd5-1a92-4b0e-90d0-79bff2eddeac 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/13726afb-4ab7-43ba-abdd-3cf56da2d2cd 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/13726afb-4ab7-43ba-abdd-3cf56da2d2cd 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/13726afb-4ab7-43ba-abdd-3cf56da2d2cd 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/13726afb-4ab7-43ba-abdd-3cf56da2d2cd 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/13726afb-4ab7-43ba-abdd-3cf56da2d2cd 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/32722908-d464-459f-a9e3-7f440bb83ac1 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/32722908-d464-459f-a9e3-7f440bb83ac1 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/38a08e8a-29cc-4072-8a44-343ab8c32344 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/38a08e8a-29cc-4072-8a44-343ab8c32344 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/622abffb-c0fa-4a21-8a18-31196313c9e1 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/622abffb-c0fa-4a21-8a18-31196313c9e1 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/78cf6af4-98ce-4190-9f9a-455059ae2cdf 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/78cf6af4-98ce-4190-9f9a-455059ae2cdf 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/78cf6af4-98ce-4190-9f9a-455059ae2cdf 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/9791be51-9dcd-4311-bbc1-ce3da088d566 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/9791be51-9dcd-4311-bbc1-ce3da088d566 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/981c37d3-6428-4626-b9c9-8fdf50acc2a9 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/981c37d3-6428-4626-b9c9-8fdf50acc2a9 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/981c37d3-6428-4626-b9c9-8fdf50acc2a9 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/981c37d3-6428-4626-b9c9-8fdf50acc2a9 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/981c37d3-6428-4626-b9c9-8fdf50acc2a9 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/9d58350e-0fdc-4ec8-89e5-03ce3962d049 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/9d58350e-0fdc-4ec8-89e5-03ce3962d049 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/bb3c492d-0cc4-4ba3-ab3a-a9a603806cbf 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/bb3c492d-0cc4-4ba3-ab3a-a9a603806cbf 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/cb651518-7877-4436-ba9b-f73976b3b9aa 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/cb651518-7877-4436-ba9b-f73976b3b9aa 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/d791d2c1-2d8c-445d-8d76-0df4dadb76bc 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/d791d2c1-2d8c-445d-8d76-0df4dadb76bc 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/df53d234-098d-452f-a093-f446103c6f81 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/df53d234-098d-452f-a093-f446103c6f81 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/df53d234-098d-452f-a093-f446103c6f81 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&size=200&page=1 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/07a3fb9e-8c5d-4126-9f4e-53218998c0d1 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/07a3fb9e-8c5d-4126-9f4e-53218998c0d1 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/07a3fb9e-8c5d-4126-9f4e-53218998c0d1 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/2309994c-0e6a-44d1-a246-bb4e58525618 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/2309994c-0e6a-44d1-a246-bb4e58525618 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/2309994c-0e6a-44d1-a246-bb4e58525618 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/26c6a0fd-fffd-45d4-9787-6eab54595ba8 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/26c6a0fd-fffd-45d4-9787-6eab54595ba8 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/32a5a55f-9185-4636-a316-eab6441cc3bc 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/32a5a55f-9185-4636-a316-eab6441cc3bc 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/32a5a55f-9185-4636-a316-eab6441cc3bc 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/5a096405-06ea-4824-b856-e85124f00752 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/5a096405-06ea-4824-b856-e85124f00752 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/6610a64c-3fbe-488b-9464-b9d8a8072db7 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/6610a64c-3fbe-488b-9464-b9d8a8072db7 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/6610a64c-3fbe-488b-9464-b9d8a8072db7 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/7ab41ed3-b938-4b7d-b951-f2452d663d84 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/7ab41ed3-b938-4b7d-b951-f2452d663d84 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/7ab41ed3-b938-4b7d-b951-f2452d663d84 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/7ab41ed3-b938-4b7d-b951-f2452d663d84 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/7ab41ed3-b938-4b7d-b951-f2452d663d84 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/8ffa6617-3e23-41f1-9fb1-bb77cb1008af 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/8ffa6617-3e23-41f1-9fb1-bb77cb1008af 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/8ffa6617-3e23-41f1-9fb1-bb77cb1008af 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/acbf01be-fe81-4175-b41e-ac8008b8eb4d 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/acbf01be-fe81-4175-b41e-ac8008b8eb4d 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/acbf01be-fe81-4175-b41e-ac8008b8eb4d 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/d898ba97-2950-4fda-8ed0-127be8c0cfb0 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/d898ba97-2950-4fda-8ed0-127be8c0cfb0 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/d898ba97-2950-4fda-8ed0-127be8c0cfb0 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions?appName=afc-dev-sms&size=200&page=1 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/0de2abab-9030-4524-9940-e5b37ac75d92/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/4c0909b1-a84e-4763-a26e-532fdb9e40fa/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/663d2938-be50-44ab-92ca-538855eb594f/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/86ab464d-5770-46b4-b93d-292c1416c453/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/9c418100-6318-4e8a-b4b2-1114f4f44aef/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/ae2dc112-9745-4f5e-8feb-79ebdc0094bd/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/b46f4c09-e46e-432b-b837-0aad96d145f9/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/ba22b06c-b55f-4940-ae38-b92a5928c8a5/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/be884689-aad4-486e-b556-23fdcf266f6d/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/cb9158ce-f8fd-441b-b443-17219e8f79fa/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/cf528063-6a43-4bf2-8ccc-ca4e6d75d88e/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/ed99fc2a-b367-4fc6-8918-5547e2e655a7/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/fe2e319f-68cd-450f-8a02-d726dac64b35/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/116b3ac3-6d84-4ed5-81be-0af4464a09b6 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/1bbe07b0-4de1-4cdb-830d-49b0ddf20b53 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/1cc0aa7f-f77e-4038-9ab0-48ae43ed3c7a 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/524ffdf2-8174-4b70-bc10-36bf458ab360 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/5d5ebba0-e1b9-44c3-989e-f274438c91ec 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/5ecc7413-2b7e-414a-9496-ad4a61f6cccf 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/79604d57-3933-4a66-81c2-a022413ec11d 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/899887a3-46a1-4370-b69a-d615f7420f08 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/97b55bf7-a906-42ab-9176-3e86762dcdb7 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/e0cdfa19-1d01-48b5-bc78-cb4785b20bc6 202 Accepted (88ms)"
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("reg update tenant application url with tenant", async () => {
    await nock.back("reg-update-url-tenant.json", { before: beforeExpandSharedRefs });
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
    await nock.back("reg-update-url-all.json", { before: beforeExpandSharedRefs });
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
                "tenantId": "116b3ac3-6d84-4ed5-81be-0af4464a09b6",
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
                "tenantId": "1cc0aa7f-f77e-4038-9ab0-48ae43ed3c7a",
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
                "tenantId": "524ffdf2-8174-4b70-bc10-36bf458ab360",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "info": "update succeeded",
                "tenantId": "5d5ebba0-e1b9-44c3-989e-f274438c91ec",
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
                "tenantId": "79604d57-3933-4a66-81c2-a022413ec11d",
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
                "tenantId": "899887a3-46a1-4370-b69a-d615f7420f08",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "info": "update succeeded",
                "tenantId": "97b55bf7-a906-42ab-9176-3e86762dcdb7",
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
                "tenantId": "ae2dc112-9745-4f5e-8feb-79ebdc0094bd",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "info": "update succeeded",
                "tenantId": "b46f4c09-e46e-432b-b837-0aad96d145f9",
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
                "tenantId": "e0cdfa19-1d01-48b5-bc78-cb4785b20bc6",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "info": "update succeeded",
                "tenantId": "ed99fc2a-b367-4fc6-8918-5547e2e655a7",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "info": "update succeeded",
                "tenantId": "fe2e319f-68cd-450f-8a02-d726dac64b35",
                Symbol(IS_SUCCESS): true,
              },
            ]
          `);

    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&size=200&page=1 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions?appName=afc-dev-sms&size=200&page=1 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/0de2abab-9030-4524-9940-e5b37ac75d92/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/4c0909b1-a84e-4763-a26e-532fdb9e40fa/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/663d2938-be50-44ab-92ca-538855eb594f/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/86ab464d-5770-46b4-b93d-292c1416c453/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/9c418100-6318-4e8a-b4b2-1114f4f44aef/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/ae2dc112-9745-4f5e-8feb-79ebdc0094bd/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/b46f4c09-e46e-432b-b837-0aad96d145f9/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/ba22b06c-b55f-4940-ae38-b92a5928c8a5/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/be884689-aad4-486e-b556-23fdcf266f6d/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/cb9158ce-f8fd-441b-b443-17219e8f79fa/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/cf528063-6a43-4bf2-8ccc-ca4e6d75d88e/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/ed99fc2a-b367-4fc6-8918-5547e2e655a7/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/fe2e319f-68cd-450f-8a02-d726dac64b35/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/116b3ac3-6d84-4ed5-81be-0af4464a09b6?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/1bbe07b0-4de1-4cdb-830d-49b0ddf20b53?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/1cc0aa7f-f77e-4038-9ab0-48ae43ed3c7a?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/524ffdf2-8174-4b70-bc10-36bf458ab360?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/5d5ebba0-e1b9-44c3-989e-f274438c91ec?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/5ecc7413-2b7e-414a-9496-ad4a61f6cccf?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/79604d57-3933-4a66-81c2-a022413ec11d?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/899887a3-46a1-4370-b69a-d615f7420f08?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/97b55bf7-a906-42ab-9176-3e86762dcdb7?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/e0cdfa19-1d01-48b5-bc78-cb4785b20bc6?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)"
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });
});

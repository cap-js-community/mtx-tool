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
    nock.restore();
  });

  test("request count", async () => {
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-list.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 46,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 2,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 2,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-list-filtered.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 46,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 2,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 2,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-long-list.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 46,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 2,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 2,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-long-list-filtered.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 46,
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
        "GET https://api.cf.sap.hana.ondemand.com:443": 46,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 8,
        "PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 2,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-update-deps-all.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 46,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 82,
        "PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 26,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 2,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-update-url-tenant.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 46,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 2,
        "PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 2,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/reg-update-url-all.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 46,
        "GET https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 2,
        "PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com:443": 26,
        "POST https://skyfin.authentication.sap.hana.ondemand.com:443": 2,
      }
    `);
  });

  describe("reg list", () => {
    test("reg list basic", async () => {
      await nock.back("reg-list.json", { before: beforeExpandSharedRefs });
      const output = await reg.registryListSubscriptions(await freshContext(), [], [false, false, false, false]);
      expect(output).toMatchInlineSnapshot(`
        "#   consumerTenantId                      subscriptionId                        globalAccountId                       subdomain                       appName      plan                  state       url                                                                 
        1   0de2abab-9030-4524-9940-e5b37ac75d92  8a625b43-956c-451f-b61a-a4248cb84f5a  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-task-model-management    afc-dev                            SUBSCRIBED  https://skyfin-task-model-management.dev.eu10-canary.afc.cloud.sap  
        2   116b3ac3-6d84-4ed5-81be-0af4464a09b6  2538cd89-8890-42f3-9d21-9250480a74a6  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-onboarding-test          afc-dev-sms  standard              SUBSCRIBED  https://skyfin-onboarding-test.dev.eu10-canary.afc.cloud.sap        
        3   1bbe07b0-4de1-4cdb-830d-49b0ddf20b53  995f7bb0-2040-4905-ada5-a916eb0fcb56  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-ias-test                 afc-dev-sms  standard              SUBSCRIBED  https://skyfin-ias-test.dev.eu10-canary.afc.cloud.sap               
        4   1cc0aa7f-f77e-4038-9ab0-48ae43ed3c7a  2309994c-0e6a-44d1-a246-bb4e58525618  dc11d7c4-b65e-467d-8d96-82172463d915  support-ee                      afc-dev-sms  standard              SUBSCRIBED  https://support-ee.dev.eu10-canary.afc.cloud.sap                    
        5   4c0909b1-a84e-4763-a26e-532fdb9e40fa  b6db4043-7b32-4bc5-89cc-b605ac033edd  1fb05c0d-22c0-43d8-9ca7-c9ef0c28f67f  hw6-apps-eu10                   afc-dev      standard              SUBSCRIBED  https://hw6-apps-eu10.dev.eu10-canary.afc.cloud.sap                 
        6   524ffdf2-8174-4b70-bc10-36bf458ab360  7ab41ed3-b938-4b7d-b951-f2452d663d84  23accf3a-a3c6-4521-973c-e8e0f05d27b7  wb1k383qm34wrr5x                afc-dev-sms  standard              SUBSCRIBED  https://wb1k383qm34wrr5x.dev.eu10-canary.afc.cloud.sap              
        7   5ca3a561-93c7-4ce1-a911-ad9923120381  c4710dfd-0dea-4456-b697-8905d0c31df3  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  afc-level-0-test                afc-dev-sms  sap-managed-standard  SUBSCRIBED  https://afc-level-0-test.dev.eu10-canary.afc.cloud.sap              
        8   5d5ebba0-e1b9-44c3-989e-f274438c91ec  32a5a55f-9185-4636-a316-eab6441cc3bc  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-booster-retest           afc-dev-sms  standard              SUBSCRIBED  https://skyfin-booster-retest.dev.eu10-canary.afc.cloud.sap         
        9   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  07a3fb9e-8c5d-4126-9f4e-53218998c0d1  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-company                  afc-dev-sms  standard              SUBSCRIBED  https://skyfin-company.dev.eu10-canary.afc.cloud.sap                
        10  663d2938-be50-44ab-92ca-538855eb594f  1da4a3ef-da21-4087-a9ca-7283c67f4e21  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-workzone                 afc-dev      standard              SUBSCRIBED  https://skyfin-workzone.dev.eu10-canary.afc.cloud.sap               
        11  73675fb3-0298-4cf3-8f86-a78c18392193  c2633973-b85f-4520-99cb-99173231fd94  5853d05a-ab42-4081-9397-e8c8c980f41b  i050811sapdev2-myafc-bybooster  afc-dev      standard              SUBSCRIBED  https://i050811sapdev2-myafc-bybooster.dev.eu10-canary.afc.cloud.sap
        12  79604d57-3933-4a66-81c2-a022413ec11d  26c6a0fd-fffd-45d4-9787-6eab54595ba8  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-booster-ias              afc-dev-sms  standard              SUBSCRIBED  https://skyfin-booster-ias.dev.eu10-canary.afc.cloud.sap            
        13  86ab464d-5770-46b4-b93d-292c1416c453  6e0549f1-30db-441f-b27b-13ec1544069e  096cea2e-77ef-498f-a588-114b33817f5d  acra-dev-eu10-afc               afc-dev      standard              SUBSCRIBED  https://acra-dev-eu10-afc.dev.eu10-canary.afc.cloud.sap             
        14  899887a3-46a1-4370-b69a-d615f7420f08  5a096405-06ea-4824-b856-e85124f00752  23accf3a-a3c6-4521-973c-e8e0f05d27b7  jt35-4gy8z-hq495                afc-dev-sms  standard              SUBSCRIBED  https://jt35-4gy8z-hq495.dev.eu10-canary.afc.cloud.sap              
        15  97b55bf7-a906-42ab-9176-3e86762dcdb7  acbf01be-fe81-4175-b41e-ac8008b8eb4d  3a2babd2-8520-4291-9fa6-d5c11097cc3d  research-and-innovation         afc-dev-sms  standard              SUBSCRIBED  https://research-and-innovation.dev.eu10-canary.afc.cloud.sap       
        16  9c418100-6318-4e8a-b4b2-1114f4f44aef  97e5ac7a-f91a-4bbf-a29d-443138d65313  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-booster                  afc-dev      standard              SUBSCRIBED  https://skyfin-booster.dev.eu10-canary.afc.cloud.sap                
        17  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  204919bb-585f-471e-97d7-5f249d182a94  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-sap-start                afc-dev      standard              SUBSCRIBED  https://skyfin-sap-start.dev.eu10-canary.afc.cloud.sap              
        18  b46f4c09-e46e-432b-b837-0aad96d145f9  e8050628-a098-403b-9f22-781e0e46d821  aba29156-0716-4958-b4e1-c43a6bd7e572  zwqh6y1-3gxwtj3l                afc-dev      standard              SUBSCRIBED  https://zwqh6y1-3gxwtj3l.dev.eu10-canary.afc.cloud.sap              
        19  ba22b06c-b55f-4940-ae38-b92a5928c8a5  04270e2a-f04f-426f-ab40-65b5625a1b8e  d1d271a7-1288-47c6-b34d-3456c2780be5  v20t58n-51jq8hrq                afc-dev      standard              SUBSCRIBED  https://v20t58n-51jq8hrq.dev.eu10-canary.afc.cloud.sap              
        20  be884689-aad4-486e-b556-23fdcf266f6d  4fe92245-71ba-4e93-b7cb-964ee40db376  0bb891ba-6257-4fde-b307-a1e33e97a0b7  test-afc-g2bup7lj               afc-dev      standard              SUBSCRIBED  https://test-afc-g2bup7lj.dev.eu10-canary.afc.cloud.sap             
        21  cb9158ce-f8fd-441b-b443-17219e8f79fa  76fcb047-85cc-baa4-9705-aa22aebf47f7  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skysand                         afc-dev                            SUBSCRIBED  https://skysand.dev.eu10-canary.afc.cloud.sap                       
        22  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  b9659eb7-cf54-4cb4-bab2-6262b48b1a60  a6786cbf-f7e7-4103-9386-b91d1c07e3ea  jyd-dev-apps-eu10               afc-dev      standard              SUBSCRIBED  https://jyd-dev-apps-eu10.dev.eu10-canary.afc.cloud.sap             
        23  d91fb749-a148-479f-b29d-71b1b6a9309d  2002e8b0-8f67-4484-bb08-5baf7bee7c48  5853d05a-ab42-4081-9397-e8c8c980f41b  afctest1                        afc-dev      standard              SUBSCRIBED  https://afctest1.dev.eu10-canary.afc.cloud.sap                      
        24  e0cdfa19-1d01-48b5-bc78-cb4785b20bc6  8ffa6617-3e23-41f1-9fb1-bb77cb1008af  23accf3a-a3c6-4521-973c-e8e0f05d27b7  t0752sztfb5l4fz1                afc-dev-sms  standard              SUBSCRIBED  https://t0752sztfb5l4fz1.dev.eu10-canary.afc.cloud.sap              
        25  ed99fc2a-b367-4fc6-8918-5547e2e655a7  3d85a09c-66be-4608-83a3-e96bd4a2e04c  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  afc-e2e                         afc-dev      standard              SUBSCRIBED  https://afc-e2e.dev.eu10-canary.afc.cloud.sap                       
        26  fe2e319f-68cd-450f-8a02-d726dac64b35  6cc71fb4-be2f-4d0f-82f5-c385f1f1999d  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  sky-major-tom-fin               afc-dev      standard              SUBSCRIBED  https://sky-major-tom-fin.dev.eu10-canary.afc.cloud.sap             "
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
        "#   consumerTenantId                      subscriptionId                        globalAccountId                       subdomain                       appName      plan                  state       url                                                                   created_on  updated_on
        1   0de2abab-9030-4524-9940-e5b37ac75d92  8a625b43-956c-451f-b61a-a4248cb84f5a  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-task-model-management    afc-dev                            SUBSCRIBED  https://skyfin-task-model-management.dev.eu10-canary.afc.cloud.sap    2025-04-04T07:44:15Z (x days ago)  2026-06-23T09:33:07Z (x days ago)  
        2   116b3ac3-6d84-4ed5-81be-0af4464a09b6  2538cd89-8890-42f3-9d21-9250480a74a6  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-onboarding-test          afc-dev-sms  standard              SUBSCRIBED  https://skyfin-onboarding-test.dev.eu10-canary.afc.cloud.sap          2025-10-27T14:38:38Z (x days ago)  2026-06-23T09:32:25Z (x days ago)  
        3   1bbe07b0-4de1-4cdb-830d-49b0ddf20b53  995f7bb0-2040-4905-ada5-a916eb0fcb56  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-ias-test                 afc-dev-sms  standard              SUBSCRIBED  https://skyfin-ias-test.dev.eu10-canary.afc.cloud.sap                 2025-09-19T09:15:52Z (x days ago)  2026-06-23T09:32:26Z (x days ago)  
        4   1cc0aa7f-f77e-4038-9ab0-48ae43ed3c7a  2309994c-0e6a-44d1-a246-bb4e58525618  dc11d7c4-b65e-467d-8d96-82172463d915  support-ee                      afc-dev-sms  standard              SUBSCRIBED  https://support-ee.dev.eu10-canary.afc.cloud.sap                      2026-04-17T16:17:09Z (x days ago)  2026-06-23T09:32:25Z (x days ago)  
        5   4c0909b1-a84e-4763-a26e-532fdb9e40fa  b6db4043-7b32-4bc5-89cc-b605ac033edd  1fb05c0d-22c0-43d8-9ca7-c9ef0c28f67f  hw6-apps-eu10                   afc-dev      standard              SUBSCRIBED  https://hw6-apps-eu10.dev.eu10-canary.afc.cloud.sap                   2023-09-05T14:19:13Z (x days ago)  2026-06-23T09:33:08Z (x days ago)  
        6   524ffdf2-8174-4b70-bc10-36bf458ab360  7ab41ed3-b938-4b7d-b951-f2452d663d84  23accf3a-a3c6-4521-973c-e8e0f05d27b7  wb1k383qm34wrr5x                afc-dev-sms  standard              SUBSCRIBED  https://wb1k383qm34wrr5x.dev.eu10-canary.afc.cloud.sap                2026-05-18T11:02:43Z (x days ago)  2026-06-23T09:33:05Z (x days ago)  
        7   5ca3a561-93c7-4ce1-a911-ad9923120381  c4710dfd-0dea-4456-b697-8905d0c31df3  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  afc-level-0-test                afc-dev-sms  sap-managed-standard  SUBSCRIBED  https://afc-level-0-test.dev.eu10-canary.afc.cloud.sap                2026-06-19T09:36:44Z (x days ago)  2026-06-23T09:33:44Z (x days ago)  
        8   5d5ebba0-e1b9-44c3-989e-f274438c91ec  32a5a55f-9185-4636-a316-eab6441cc3bc  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-booster-retest           afc-dev-sms  standard              SUBSCRIBED  https://skyfin-booster-retest.dev.eu10-canary.afc.cloud.sap           2026-06-08T05:30:55Z (x days ago)  2026-06-23T09:33:10Z (x days ago)  
        9   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  07a3fb9e-8c5d-4126-9f4e-53218998c0d1  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-company                  afc-dev-sms  standard              SUBSCRIBED  https://skyfin-company.dev.eu10-canary.afc.cloud.sap                  2025-09-18T09:24:29Z (x days ago)  2026-06-23T09:33:10Z (x days ago)  
        10  663d2938-be50-44ab-92ca-538855eb594f  1da4a3ef-da21-4087-a9ca-7283c67f4e21  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-workzone                 afc-dev      standard              SUBSCRIBED  https://skyfin-workzone.dev.eu10-canary.afc.cloud.sap                 2024-09-11T07:32:10Z (x days ago)  2026-06-23T09:33:34Z (x days ago)  
        11  73675fb3-0298-4cf3-8f86-a78c18392193  c2633973-b85f-4520-99cb-99173231fd94  5853d05a-ab42-4081-9397-e8c8c980f41b  i050811sapdev2-myafc-bybooster  afc-dev      standard              SUBSCRIBED  https://i050811sapdev2-myafc-bybooster.dev.eu10-canary.afc.cloud.sap  2025-05-22T12:06:34Z (x days ago)  2026-06-23T09:33:48Z (x days ago)  
        12  79604d57-3933-4a66-81c2-a022413ec11d  26c6a0fd-fffd-45d4-9787-6eab54595ba8  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-booster-ias              afc-dev-sms  standard              SUBSCRIBED  https://skyfin-booster-ias.dev.eu10-canary.afc.cloud.sap              2026-01-15T10:41:36Z (x days ago)  2026-06-23T09:33:51Z (x days ago)  
        13  86ab464d-5770-46b4-b93d-292c1416c453  6e0549f1-30db-441f-b27b-13ec1544069e  096cea2e-77ef-498f-a588-114b33817f5d  acra-dev-eu10-afc               afc-dev      standard              SUBSCRIBED  https://acra-dev-eu10-afc.dev.eu10-canary.afc.cloud.sap               2025-09-23T14:22:21Z (x days ago)  2026-06-23T09:33:47Z (x days ago)  
        14  899887a3-46a1-4370-b69a-d615f7420f08  5a096405-06ea-4824-b856-e85124f00752  23accf3a-a3c6-4521-973c-e8e0f05d27b7  jt35-4gy8z-hq495                afc-dev-sms  standard              SUBSCRIBED  https://jt35-4gy8z-hq495.dev.eu10-canary.afc.cloud.sap                2026-05-20T05:21:36Z (x days ago)  2026-06-23T09:33:49Z (x days ago)  
        15  97b55bf7-a906-42ab-9176-3e86762dcdb7  acbf01be-fe81-4175-b41e-ac8008b8eb4d  3a2babd2-8520-4291-9fa6-d5c11097cc3d  research-and-innovation         afc-dev-sms  standard              SUBSCRIBED  https://research-and-innovation.dev.eu10-canary.afc.cloud.sap         2026-03-12T14:49:04Z (x days ago)  2026-06-23T09:34:10Z (x days ago)  
        16  9c418100-6318-4e8a-b4b2-1114f4f44aef  97e5ac7a-f91a-4bbf-a29d-443138d65313  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-booster                  afc-dev      standard              SUBSCRIBED  https://skyfin-booster.dev.eu10-canary.afc.cloud.sap                  2024-11-27T06:48:43Z (x days ago)  2026-06-23T09:34:21Z (x days ago)  
        17  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  204919bb-585f-471e-97d7-5f249d182a94  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-sap-start                afc-dev      standard              SUBSCRIBED  https://skyfin-sap-start.dev.eu10-canary.afc.cloud.sap                2024-07-05T11:18:15Z (x days ago)  2026-06-23T09:34:21Z (x days ago)  
        18  b46f4c09-e46e-432b-b837-0aad96d145f9  e8050628-a098-403b-9f22-781e0e46d821  aba29156-0716-4958-b4e1-c43a6bd7e572  zwqh6y1-3gxwtj3l                afc-dev      standard              SUBSCRIBED  https://zwqh6y1-3gxwtj3l.dev.eu10-canary.afc.cloud.sap                2025-12-22T02:13:53Z (x days ago)  2026-06-23T09:34:21Z (x days ago)  
        19  ba22b06c-b55f-4940-ae38-b92a5928c8a5  04270e2a-f04f-426f-ab40-65b5625a1b8e  d1d271a7-1288-47c6-b34d-3456c2780be5  v20t58n-51jq8hrq                afc-dev      standard              SUBSCRIBED  https://v20t58n-51jq8hrq.dev.eu10-canary.afc.cloud.sap                2025-09-25T10:01:52Z (x days ago)  2026-06-23T09:34:21Z (x days ago)  
        20  be884689-aad4-486e-b556-23fdcf266f6d  4fe92245-71ba-4e93-b7cb-964ee40db376  0bb891ba-6257-4fde-b307-a1e33e97a0b7  test-afc-g2bup7lj               afc-dev      standard              SUBSCRIBED  https://test-afc-g2bup7lj.dev.eu10-canary.afc.cloud.sap               2024-12-09T03:48:41Z (x days ago)  2026-06-23T09:34:36Z (x days ago)  
        21  cb9158ce-f8fd-441b-b443-17219e8f79fa  76fcb047-85cc-baa4-9705-aa22aebf47f7  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skysand                         afc-dev                            SUBSCRIBED  https://skysand.dev.eu10-canary.afc.cloud.sap                         2022-09-05T12:11:10Z (x days ago)  2026-06-23T09:34:50Z (x days ago)  
        22  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  b9659eb7-cf54-4cb4-bab2-6262b48b1a60  a6786cbf-f7e7-4103-9386-b91d1c07e3ea  jyd-dev-apps-eu10               afc-dev      standard              SUBSCRIBED  https://jyd-dev-apps-eu10.dev.eu10-canary.afc.cloud.sap               2024-03-19T16:47:52Z (x days ago)  2026-06-23T09:34:49Z (x days ago)  
        23  d91fb749-a148-479f-b29d-71b1b6a9309d  2002e8b0-8f67-4484-bb08-5baf7bee7c48  5853d05a-ab42-4081-9397-e8c8c980f41b  afctest1                        afc-dev      standard              SUBSCRIBED  https://afctest1.dev.eu10-canary.afc.cloud.sap                        2025-05-22T12:25:05Z (x days ago)  2026-06-23T09:34:51Z (x days ago)  
        24  e0cdfa19-1d01-48b5-bc78-cb4785b20bc6  8ffa6617-3e23-41f1-9fb1-bb77cb1008af  23accf3a-a3c6-4521-973c-e8e0f05d27b7  t0752sztfb5l4fz1                afc-dev-sms  standard              SUBSCRIBED  https://t0752sztfb5l4fz1.dev.eu10-canary.afc.cloud.sap                2026-05-19T14:34:20Z (x days ago)  2026-06-23T09:34:52Z (x days ago)  
        25  ed99fc2a-b367-4fc6-8918-5547e2e655a7  3d85a09c-66be-4608-83a3-e96bd4a2e04c  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  afc-e2e                         afc-dev      standard              SUBSCRIBED  https://afc-e2e.dev.eu10-canary.afc.cloud.sap                         2025-11-27T08:33:57Z (x days ago)  2026-06-23T09:34:49Z (x days ago)  
        26  fe2e319f-68cd-450f-8a02-d726dac64b35  6cc71fb4-be2f-4d0f-82f5-c385f1f1999d  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  sky-major-tom-fin               afc-dev      standard              SUBSCRIBED  https://sky-major-tom-fin.dev.eu10-canary.afc.cloud.sap               2025-12-02T12:41:56Z (x days ago)  2026-06-23T09:35:05Z (x days ago)  "
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
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  07a3fb9e-8c5d-4126-9f4e-53218998c0d1  011b4e7a-43b5-4f63-819a-9b1e46ab23b6  skyfin-company  afc-dev-sms  standard  SUBSCRIBED  https://skyfin-company.dev.eu10-canary.afc.cloud.sap  2025-09-18T09:24:29Z (x days ago)  2026-06-23T09:33:10Z (x days ago)  "
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
                "jobId": "53e52909-3927-4c06-a8b7-4ce3cb5c61aa",
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
                "jobId": "96edf8cb-bf8a-4b38-8bd0-fa42876fdc04",
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
                "subscriptionId": "c4710dfd-0dea-4456-b697-8905d0c31df3",
                "subscriptionState": "SUBSCRIBED",
                "tenantId": "5ca3a561-93c7-4ce1-a911-ad9923120381",
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
                "jobId": "2a12fe5c-3782-4ebd-8a3a-14bb96b770f9",
                "jobState": "SUCCEEDED",
                "tenantId": "663d2938-be50-44ab-92ca-538855eb594f",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "c072139b-84fe-402a-9bb3-0fd81e87065c",
                "jobState": "SUCCEEDED",
                "tenantId": "73675fb3-0298-4cf3-8f86-a78c18392193",
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
                "jobId": "375e8faf-291b-44c4-b2d4-049a2cfc86b7",
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
                "jobId": "c92028cb-022b-4018-9f11-620eea49712e",
                "jobState": "SUCCEEDED",
                "tenantId": "9c418100-6318-4e8a-b4b2-1114f4f44aef",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "fc7073cb-23ea-47c2-81c0-2c2d4b1ca8d6",
                "jobState": "SUCCEEDED",
                "tenantId": "ae2dc112-9745-4f5e-8feb-79ebdc0094bd",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "3ac02e7a-65a9-45b3-95d0-01846f3b90b5",
                "jobState": "SUCCEEDED",
                "tenantId": "b46f4c09-e46e-432b-b837-0aad96d145f9",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "bcef1ca9-0921-483e-8f43-cbce188882c3",
                "jobState": "SUCCEEDED",
                "tenantId": "ba22b06c-b55f-4940-ae38-b92a5928c8a5",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "036bdc16-7e1e-481d-904b-19e857d1e834",
                "jobState": "SUCCEEDED",
                "tenantId": "be884689-aad4-486e-b556-23fdcf266f6d",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "3a71f60f-1ed2-42fa-8f43-70a75e2236e6",
                "jobState": "SUCCEEDED",
                "tenantId": "cb9158ce-f8fd-441b-b443-17219e8f79fa",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "3ddd4639-a6cd-439d-a5ae-9aa06967ac23",
                "jobState": "SUCCEEDED",
                "tenantId": "cf528063-6a43-4bf2-8ccc-ca4e6d75d88e",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "c5335f23-90ee-4d1a-a2c6-3d374b70e602",
                "jobState": "SUCCEEDED",
                "tenantId": "d91fb749-a148-479f-b29d-71b1b6a9309d",
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
                "jobId": "45ff6a62-918a-439a-a164-1ff60fd7365a",
                "jobState": "SUCCEEDED",
                "tenantId": "ed99fc2a-b367-4fc6-8918-5547e2e655a7",
                Symbol(IS_SUCCESS): true,
              },
              {
                "duration": "0 sec",
                "jobId": "53d4067d-23bf-4b2e-9d0c-392519bf1cb7",
                "jobState": "SUCCEEDED",
                "tenantId": "fe2e319f-68cd-450f-8a02-d726dac64b35",
                Symbol(IS_SUCCESS): true,
              },
            ]
          `);

    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      polling subscription /api/v2.0/jobs/53e52909-3927-4c06-a8b7-4ce3cb5c61aa with interval 15sec
      polling subscription /subscription-manager/v1/subscriptions/d898ba97-2950-4fda-8ed0-127be8c0cfb0 with interval 15sec
      polling subscription /subscription-manager/v1/subscriptions/6610a64c-3fbe-488b-9464-b9d8a8072db7 with interval 15sec
      polling subscription /subscription-manager/v1/subscriptions/2309994c-0e6a-44d1-a246-bb4e58525618 with interval 15sec
      polling subscription /api/v2.0/jobs/96edf8cb-bf8a-4b38-8bd0-fa42876fdc04 with interval 15sec
      polling subscription /subscription-manager/v1/subscriptions/7ab41ed3-b938-4b7d-b951-f2452d663d84 with interval 15sec
      polling subscription /subscription-manager/v1/subscriptions/c4710dfd-0dea-4456-b697-8905d0c31df3 with interval 15sec
      polling subscription /subscription-manager/v1/subscriptions/32a5a55f-9185-4636-a316-eab6441cc3bc with interval 15sec
      polling subscription /subscription-manager/v1/subscriptions/07a3fb9e-8c5d-4126-9f4e-53218998c0d1 with interval 15sec
      polling subscription /api/v2.0/jobs/2a12fe5c-3782-4ebd-8a3a-14bb96b770f9 with interval 15sec
      polling subscription /api/v2.0/jobs/c072139b-84fe-402a-9bb3-0fd81e87065c with interval 15sec
      polling subscription /subscription-manager/v1/subscriptions/26c6a0fd-fffd-45d4-9787-6eab54595ba8 with interval 15sec
      polling subscription /api/v2.0/jobs/375e8faf-291b-44c4-b2d4-049a2cfc86b7 with interval 15sec
      polling subscription /subscription-manager/v1/subscriptions/5a096405-06ea-4824-b856-e85124f00752 with interval 15sec
      polling subscription /subscription-manager/v1/subscriptions/acbf01be-fe81-4175-b41e-ac8008b8eb4d with interval 15sec
      polling subscription /api/v2.0/jobs/c92028cb-022b-4018-9f11-620eea49712e with interval 15sec
      polling subscription /api/v2.0/jobs/fc7073cb-23ea-47c2-81c0-2c2d4b1ca8d6 with interval 15sec
      polling subscription /api/v2.0/jobs/3ac02e7a-65a9-45b3-95d0-01846f3b90b5 with interval 15sec
      polling subscription /api/v2.0/jobs/bcef1ca9-0921-483e-8f43-cbce188882c3 with interval 15sec
      polling subscription /api/v2.0/jobs/036bdc16-7e1e-481d-904b-19e857d1e834 with interval 15sec
      polling subscription /api/v2.0/jobs/3a71f60f-1ed2-42fa-8f43-70a75e2236e6 with interval 15sec
      polling subscription /api/v2.0/jobs/3ddd4639-a6cd-439d-a5ae-9aa06967ac23 with interval 15sec
      polling subscription /api/v2.0/jobs/c5335f23-90ee-4d1a-a2c6-3d374b70e602 with interval 15sec
      polling subscription /subscription-manager/v1/subscriptions/8ffa6617-3e23-41f1-9fb1-bb77cb1008af with interval 15sec
      polling subscription /api/v2.0/jobs/45ff6a62-918a-439a-a164-1ff60fd7365a with interval 15sec
      polling subscription /api/v2.0/jobs/53d4067d-23bf-4b2e-9d0c-392519bf1cb7 with interval 15sec
      
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/036bdc16-7e1e-481d-904b-19e857d1e834 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/036bdc16-7e1e-481d-904b-19e857d1e834 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/036bdc16-7e1e-481d-904b-19e857d1e834 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/2a12fe5c-3782-4ebd-8a3a-14bb96b770f9 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/2a12fe5c-3782-4ebd-8a3a-14bb96b770f9 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/2a12fe5c-3782-4ebd-8a3a-14bb96b770f9 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/375e8faf-291b-44c4-b2d4-049a2cfc86b7 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/375e8faf-291b-44c4-b2d4-049a2cfc86b7 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/3a71f60f-1ed2-42fa-8f43-70a75e2236e6 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/3a71f60f-1ed2-42fa-8f43-70a75e2236e6 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/3ac02e7a-65a9-45b3-95d0-01846f3b90b5 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/3ac02e7a-65a9-45b3-95d0-01846f3b90b5 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/3ac02e7a-65a9-45b3-95d0-01846f3b90b5 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/3ddd4639-a6cd-439d-a5ae-9aa06967ac23 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/3ddd4639-a6cd-439d-a5ae-9aa06967ac23 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/3ddd4639-a6cd-439d-a5ae-9aa06967ac23 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/45ff6a62-918a-439a-a164-1ff60fd7365a 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/45ff6a62-918a-439a-a164-1ff60fd7365a 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/45ff6a62-918a-439a-a164-1ff60fd7365a 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/53d4067d-23bf-4b2e-9d0c-392519bf1cb7 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/53d4067d-23bf-4b2e-9d0c-392519bf1cb7 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/53d4067d-23bf-4b2e-9d0c-392519bf1cb7 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/53e52909-3927-4c06-a8b7-4ce3cb5c61aa 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/53e52909-3927-4c06-a8b7-4ce3cb5c61aa 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/53e52909-3927-4c06-a8b7-4ce3cb5c61aa 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/53e52909-3927-4c06-a8b7-4ce3cb5c61aa 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/53e52909-3927-4c06-a8b7-4ce3cb5c61aa 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/96edf8cb-bf8a-4b38-8bd0-fa42876fdc04 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/96edf8cb-bf8a-4b38-8bd0-fa42876fdc04 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/96edf8cb-bf8a-4b38-8bd0-fa42876fdc04 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/96edf8cb-bf8a-4b38-8bd0-fa42876fdc04 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/96edf8cb-bf8a-4b38-8bd0-fa42876fdc04 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/bcef1ca9-0921-483e-8f43-cbce188882c3 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/bcef1ca9-0921-483e-8f43-cbce188882c3 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/bcef1ca9-0921-483e-8f43-cbce188882c3 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/c072139b-84fe-402a-9bb3-0fd81e87065c 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/c072139b-84fe-402a-9bb3-0fd81e87065c 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/c072139b-84fe-402a-9bb3-0fd81e87065c 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/c5335f23-90ee-4d1a-a2c6-3d374b70e602 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/c5335f23-90ee-4d1a-a2c6-3d374b70e602 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/c5335f23-90ee-4d1a-a2c6-3d374b70e602 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/c92028cb-022b-4018-9f11-620eea49712e 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/c92028cb-022b-4018-9f11-620eea49712e 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/fc7073cb-23ea-47c2-81c0-2c2d4b1ca8d6 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/api/v2.0/jobs/fc7073cb-23ea-47c2-81c0-2c2d4b1ca8d6 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/subscriptions?appName=afc-dev&size=200&page=1 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/07a3fb9e-8c5d-4126-9f4e-53218998c0d1 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/07a3fb9e-8c5d-4126-9f4e-53218998c0d1 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/07a3fb9e-8c5d-4126-9f4e-53218998c0d1 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/2309994c-0e6a-44d1-a246-bb4e58525618 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/2309994c-0e6a-44d1-a246-bb4e58525618 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/2309994c-0e6a-44d1-a246-bb4e58525618 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/26c6a0fd-fffd-45d4-9787-6eab54595ba8 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/26c6a0fd-fffd-45d4-9787-6eab54595ba8 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/26c6a0fd-fffd-45d4-9787-6eab54595ba8 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/32a5a55f-9185-4636-a316-eab6441cc3bc 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/32a5a55f-9185-4636-a316-eab6441cc3bc 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/32a5a55f-9185-4636-a316-eab6441cc3bc 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/5a096405-06ea-4824-b856-e85124f00752 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/5a096405-06ea-4824-b856-e85124f00752 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/5a096405-06ea-4824-b856-e85124f00752 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/6610a64c-3fbe-488b-9464-b9d8a8072db7 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/6610a64c-3fbe-488b-9464-b9d8a8072db7 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/6610a64c-3fbe-488b-9464-b9d8a8072db7 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/7ab41ed3-b938-4b7d-b951-f2452d663d84 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/7ab41ed3-b938-4b7d-b951-f2452d663d84 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/7ab41ed3-b938-4b7d-b951-f2452d663d84 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/8ffa6617-3e23-41f1-9fb1-bb77cb1008af 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/8ffa6617-3e23-41f1-9fb1-bb77cb1008af 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/8ffa6617-3e23-41f1-9fb1-bb77cb1008af 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/acbf01be-fe81-4175-b41e-ac8008b8eb4d 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/acbf01be-fe81-4175-b41e-ac8008b8eb4d 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/acbf01be-fe81-4175-b41e-ac8008b8eb4d 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/c4710dfd-0dea-4456-b697-8905d0c31df3 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/c4710dfd-0dea-4456-b697-8905d0c31df3 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/c4710dfd-0dea-4456-b697-8905d0c31df3 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/c4710dfd-0dea-4456-b697-8905d0c31df3 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/c4710dfd-0dea-4456-b697-8905d0c31df3 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/d898ba97-2950-4fda-8ed0-127be8c0cfb0 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/d898ba97-2950-4fda-8ed0-127be8c0cfb0 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/d898ba97-2950-4fda-8ed0-127be8c0cfb0 200 OK (88ms)
      GET https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions?appName=afc-dev-sms&size=200&page=1 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/0de2abab-9030-4524-9940-e5b37ac75d92/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/4c0909b1-a84e-4763-a26e-532fdb9e40fa/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/663d2938-be50-44ab-92ca-538855eb594f/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/73675fb3-0298-4cf3-8f86-a78c18392193/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/86ab464d-5770-46b4-b93d-292c1416c453/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/9c418100-6318-4e8a-b4b2-1114f4f44aef/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/ae2dc112-9745-4f5e-8feb-79ebdc0094bd/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/b46f4c09-e46e-432b-b837-0aad96d145f9/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/ba22b06c-b55f-4940-ae38-b92a5928c8a5/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/be884689-aad4-486e-b556-23fdcf266f6d/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/cb9158ce-f8fd-441b-b443-17219e8f79fa/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/cf528063-6a43-4bf2-8ccc-ca4e6d75d88e/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/d91fb749-a148-479f-b29d-71b1b6a9309d/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/ed99fc2a-b367-4fc6-8918-5547e2e655a7/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/fe2e319f-68cd-450f-8a02-d726dac64b35/subscriptions 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/116b3ac3-6d84-4ed5-81be-0af4464a09b6 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/1bbe07b0-4de1-4cdb-830d-49b0ddf20b53 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/1cc0aa7f-f77e-4038-9ab0-48ae43ed3c7a 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/524ffdf2-8174-4b70-bc10-36bf458ab360 202 Accepted (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/5ca3a561-93c7-4ce1-a911-ad9923120381 202 Accepted (88ms)
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
                "tenantId": "5ca3a561-93c7-4ce1-a911-ad9923120381",
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
                "tenantId": "73675fb3-0298-4cf3-8f86-a78c18392193",
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
                "tenantId": "d91fb749-a148-479f-b29d-71b1b6a9309d",
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
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/73675fb3-0298-4cf3-8f86-a78c18392193/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/86ab464d-5770-46b4-b93d-292c1416c453/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/9c418100-6318-4e8a-b4b2-1114f4f44aef/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/ae2dc112-9745-4f5e-8feb-79ebdc0094bd/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/b46f4c09-e46e-432b-b837-0aad96d145f9/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/ba22b06c-b55f-4940-ae38-b92a5928c8a5/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/be884689-aad4-486e-b556-23fdcf266f6d/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/cb9158ce-f8fd-441b-b443-17219e8f79fa/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/cf528063-6a43-4bf2-8ccc-ca4e6d75d88e/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/d91fb749-a148-479f-b29d-71b1b6a9309d/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/ed99fc2a-b367-4fc6-8918-5547e2e655a7/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/saas-manager/v1/application/tenants/fe2e319f-68cd-450f-8a02-d726dac64b35/subscriptions?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/116b3ac3-6d84-4ed5-81be-0af4464a09b6?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/1bbe07b0-4de1-4cdb-830d-49b0ddf20b53?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/1cc0aa7f-f77e-4038-9ab0-48ae43ed3c7a?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/524ffdf2-8174-4b70-bc10-36bf458ab360?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
      PATCH https://saas-manager.mesh.cf.sap.hana.ondemand.com/subscription-manager/v1/subscriptions/5ca3a561-93c7-4ce1-a911-ad9923120381?updateApplicationURL=true&skipUpdatingDependencies=true 200 OK (88ms)
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

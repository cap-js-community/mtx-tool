"use strict";

const pathlib = require("path");
const nock = require("nock");

const { resetMakeOneTime } = require("../../src/shared/execution-control");
const { newContext } = require("../../src/context");
const svm = require("../../src/submodules/serviceManager");
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

describe("svm nock tests", () => {
  afterEach(() => {
    LogRequestId.reset();
    resetMakeOneTime(svm._._requestOfferings);
    resetMakeOneTime(svm._._requestPlans);
    nock.restore();
  });

  test("request count", async () => {
    expect(collectRequestCount(require(`${nock.back.fixtures}/svm-list.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 24,
        "GET https://service-manager.cfapps.sap.hana.ondemand.com:443": 4,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/svm-list-filtered.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 24,
        "GET https://service-manager.cfapps.sap.hana.ondemand.com:443": 4,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/svm-long-list.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 24,
        "GET https://service-manager.cfapps.sap.hana.ondemand.com:443": 4,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/svm-long-list-filtered.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 24,
        "GET https://service-manager.cfapps.sap.hana.ondemand.com:443": 4,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
  });

  describe("list", () => {
    test("list basic", async () => {
      await nock.back("svm-list.json", { before: beforeExpandSharedRefs });
      const output = await svm.serviceManagerList(await freshContext(), [], [false, false]);
      expect(output).toMatchInlineSnapshot(`
        "#   tenant_id                             service_plan          instance_id                           ready       binding_id                            ready
        1   0de2abab-9030-4524-9940-e5b37ac75d92  hana:hdi-shared       ea6bfebc-a2a7-4a0f-b893-c970face3cd6  true   ---  4a6dfc5a-c24c-4dfd-b45b-8dd9d7cdc694  true 
        2   0de2abab-9030-4524-9940-e5b37ac75d92  objectstore:standard  899f36fe-1bf3-4d95-8ae3-cdd4722c2832  true   ---  da24e4ef-61df-4b54-91d9-e6172a51c540  true 
        3   116b3ac3-6d84-4ed5-81be-0af4464a09b6  hana:hdi-shared       56c535b2-bc3a-44f5-96c8-3ae1054f455c  true   ---  9e2526d7-8cbd-4bfd-af40-42ab28f374bc  true 
        4   116b3ac3-6d84-4ed5-81be-0af4464a09b6  objectstore:standard  adcba256-b5ef-4e7d-b8c5-5ea5e9c808f9  true   ---  a3e0940f-1e35-440b-a309-94d1e37b87ce  true 
        5   1bbe07b0-4de1-4cdb-830d-49b0ddf20b53  hana:hdi-shared       7758e957-e3a9-418f-9e2b-50bd492cefa6  true   ---  65a4b71a-1f5e-4dfd-a392-1b74d21f0c8c  true 
        6   1bbe07b0-4de1-4cdb-830d-49b0ddf20b53  objectstore:standard  c18d7de5-195f-4967-8470-3a6438a23e24  true   ---  595c3b95-4653-485e-9feb-3f25b5506887  true 
        7   1cc0aa7f-f77e-4038-9ab0-48ae43ed3c7a  hana:hdi-shared       1d031371-1b20-4363-b1f9-473d21e6dd2a  true   ---  75748015-e87b-4c44-96d5-8f2520b0116c  true 
        8   1cc0aa7f-f77e-4038-9ab0-48ae43ed3c7a  objectstore:standard  5f503f0c-cf58-4c40-9c77-c2688d95b43d  true   ---  3b8f9439-b4d2-4d08-afe5-33111cb76808  true 
        9   3af21e38-10cc-45e3-976f-1463f1d63879  objectstore:standard  5b846327-36b7-4c55-b0fb-88abb38f23dc  true   ---  742dd01a-2c87-47be-a2c0-268e3de9d813  true 
        10  4c0909b1-a84e-4763-a26e-532fdb9e40fa  hana:hdi-shared       8a633bdf-bd76-43ee-8414-74f8095a05c3  true   ---  ae032460-89da-4e9a-bff9-3899c0708d35  true 
        11  4c0909b1-a84e-4763-a26e-532fdb9e40fa  objectstore:standard  ca87508f-b17a-4f9e-84c5-8b974eec9488  true   ---  97ac4f61-16d6-4bd9-98b6-68b3fc0d68fa  true 
        12  524ffdf2-8174-4b70-bc10-36bf458ab360  hana:hdi-shared       a1d78a19-0f96-4ac4-bd31-d532f1d68f92  true   ---  a5ffa56e-9ae4-4acb-8448-ce1cdad9eff9  true 
        13  524ffdf2-8174-4b70-bc10-36bf458ab360  objectstore:standard  62a446e2-f529-4969-8194-fb26cb6117f4  true   ---  4b1f8f98-b728-4a39-ac59-fd0d15b50df9  true 
        14  5ca3a561-93c7-4ce1-a911-ad9923120381  hana:hdi-shared       70e48010-a730-4e88-b1b0-6fab23adad01  true   ---  797f9ee7-b142-46a7-8240-29aa76603834  true 
        15  5ca3a561-93c7-4ce1-a911-ad9923120381  objectstore:standard  806ce3f6-dd9c-4196-bb27-a730c7c24c26  true   ---  4057b8e0-cff2-4054-840d-d8ad181658c3  true 
        16  5d5ebba0-e1b9-44c3-989e-f274438c91ec  hana:hdi-shared       e9215dad-0d24-4bb5-a91b-e6e7ef7ed7d9  true   ---  65d9fdba-d15d-4b26-b465-1e6166840231  true 
        17  5d5ebba0-e1b9-44c3-989e-f274438c91ec  objectstore:standard  b5dea6b1-d41e-476c-ba2d-01e277887e7f  true   ---  44473336-af38-449e-a7cb-53a3e17f44f1  true 
        18  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  hana:hdi-shared       cd0dd852-4045-4bff-82b5-909d0948c6fb  true   ---  38d700e2-e64b-4f25-873d-6f5deced7f05  true 
        19  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  objectstore:standard  61d42c22-f100-419b-83d9-f0d7caeeca57  true   ---  ddca7ef0-e3ee-4900-ae10-d150144fcdfb  true 
        20  663d2938-be50-44ab-92ca-538855eb594f  hana:hdi-shared       9915f7de-1cbd-447d-a315-35825f68be69  true   ---  6761f349-e09c-4352-b7f6-32bf3ce4bce2  true 
        21  663d2938-be50-44ab-92ca-538855eb594f  objectstore:standard  25c4c0ca-a01a-4534-bf34-842fb6e27c71  true   ---  da0fcab4-1c81-43a8-bb7b-21c575ed9775  true 
        22  73675fb3-0298-4cf3-8f86-a78c18392193  hana:hdi-shared       852bb033-afab-49d0-b827-4a3f32abe9ba  true   ---  271fed86-867f-46a0-91e3-0d7867657ae5  true 
        23  73675fb3-0298-4cf3-8f86-a78c18392193  objectstore:standard  66654db4-834b-4ae5-9a53-0e0fbabd42d1  true   ---  5eb68670-91c0-4caa-a795-7390bdc01290  true 
        24  79604d57-3933-4a66-81c2-a022413ec11d  hana:hdi-shared       1c61ab20-0ab1-41ce-8ae4-b7269d9513a4  true   ---  a97a4711-16df-448b-b7ac-a1b0ef27a5a6  true 
        25  79604d57-3933-4a66-81c2-a022413ec11d  objectstore:standard  411fac3d-9b5c-4fec-93ba-59fbc905c6cf  true   ---  daecba05-37fa-4ae3-8dce-24db492a682c  true 
        26  86ab464d-5770-46b4-b93d-292c1416c453  hana:hdi-shared       2e5b16d4-5379-47b5-a03d-d749777dadae  true   ---  d7fd73a8-5c23-4a88-80c9-675bd2f22004  true 
        27  86ab464d-5770-46b4-b93d-292c1416c453  objectstore:standard  54699da7-b092-4e4b-9429-b0df4770c2b2  true   ---  8accbaa7-c9a6-49e2-aace-2c11d01f413c  true 
        28  899887a3-46a1-4370-b69a-d615f7420f08  hana:hdi-shared       6430d626-937c-47db-a961-e38f52c17ba0  true   ---  85abc091-e0ec-461d-b1e2-3447eb538a86  true 
        29  899887a3-46a1-4370-b69a-d615f7420f08  objectstore:standard  7ba9df5d-29c9-42a6-aff1-4dab737e0448  true   ---  34e8007f-ca50-429e-837c-d0d962a3d2e2  true 
        30  97b55bf7-a906-42ab-9176-3e86762dcdb7  hana:hdi-shared       eaf48f15-7d72-4a5b-8833-96a4b04dba8f  true   ---  9b917159-3cf1-457a-bf2b-0eefe7c80ad6  true 
        31  97b55bf7-a906-42ab-9176-3e86762dcdb7  objectstore:standard  db86c471-92f6-458e-973c-a3d2e4329bf9  true   ---  e958fdf2-3c7d-4264-a13e-81d97e78f2c1  true 
        32  9c418100-6318-4e8a-b4b2-1114f4f44aef  hana:hdi-shared       c1626f78-e2de-47ab-8674-efe747db2fe3  true   ---  f120b0c3-de9d-4201-a993-1188ca6ce6c2  true 
        33  9c418100-6318-4e8a-b4b2-1114f4f44aef  objectstore:standard  164c212e-b0e9-4ec9-9259-3abbd753cb21  true   ---  76c897cf-f08f-48eb-bb74-59e116fb18c1  true 
        34  ad91dbba-5c90-436d-8cd8-63b3fb88cf6a  objectstore:standard  500011f3-9dd7-483b-bcc6-b9a87bc27fbe  true   ---  cbf88795-01f1-4cb1-9a00-0f59adda6991  true 
        35  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  hana:hdi-shared       8dbac1ec-7127-4bda-86a4-0ff02cfefd8d  true   ---  c6e5a14b-4dcb-479e-9c6e-5fc6ff830b32  true 
        36  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  objectstore:standard  a66e6ae9-72dd-4689-851a-f2b33bfb8ff9  true   ---  f8d7f8a6-5d5b-4850-af1b-eb8cd3edb0d8  true 
        37  b46f4c09-e46e-432b-b837-0aad96d145f9  objectstore:standard  2240055d-5306-43e7-a0c2-8623eff8e538  true   ---  2a4cbb0d-13c9-48be-a109-12e2bb1ad7e2  true 
        38  b46f4c09-e46e-432b-b837-0aad96d145f9  hana:hdi-shared       3e0696d7-6669-40ce-8bde-8eb71b227b15  true   ---  d74f6504-58bb-4fa4-a3aa-ddcaa8b44b58  true 
        39  ba22b06c-b55f-4940-ae38-b92a5928c8a5  hana:hdi-shared       67a22c54-b5b7-4b96-bea1-0a2d38999def  true   ---  27cb0a64-cb06-41e6-b1b4-046e4c9b10ab  true 
        40  ba22b06c-b55f-4940-ae38-b92a5928c8a5  objectstore:standard  2db8caf7-fcac-4b9d-abf2-38683639d2b1  true   ---  fa43acac-9ccd-4f6f-82c4-186464bbe652  true 
        41  be884689-aad4-486e-b556-23fdcf266f6d  hana:hdi-shared       875d3ddf-1ede-41e1-b8af-134e418427a3  true   ---  01c3b537-c239-4171-919a-59afa9030632  true 
        42  be884689-aad4-486e-b556-23fdcf266f6d  objectstore:standard  f92f8e3e-f813-46b1-9846-c582de2b7982  true   ---  8224a299-c6e2-4dba-a079-97b73d24fb67  true 
        43  cb9158ce-f8fd-441b-b443-17219e8f79fa  hana:hdi-shared       42ff43bd-14a7-41f7-b903-259235c1abcb  true   ---  fef1f660-25e4-448d-8e44-71b3461c6d12  true 
        44  cb9158ce-f8fd-441b-b443-17219e8f79fa  objectstore:standard  ce93990a-885f-482b-a3e4-f5b55fa65e77  true   ---  18f1f9eb-23cd-4749-8bea-41a59b556777  true 
        45  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  hana:hdi-shared       fe81e5b0-6526-4237-95a4-19268049f779  true   ---  a6b9dfa3-c6b5-4d7e-bb5b-befb7be01426  true 
        46  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  objectstore:standard  af9af05c-808b-4ada-a775-6c78854ad466  true   ---  e27c0f6b-644c-4588-bc4a-43c3e759a87a  true 
        47  d91fb749-a148-479f-b29d-71b1b6a9309d  hana:hdi-shared       9e954752-5a2d-45fa-a809-e9707cedf2e5  true   ---  60afecbf-8e2e-463f-a44f-f355384abfb6  true 
        48  d91fb749-a148-479f-b29d-71b1b6a9309d  objectstore:standard  57944233-590b-416d-93fd-399cabcb30b8  true   ---  30d25d05-7fdb-4d05-ad94-649120f74bb0  true 
        49  e0cdfa19-1d01-48b5-bc78-cb4785b20bc6  hana:hdi-shared       9be55a43-72bd-41b5-b33e-3aeb1f432ce0  true   ---  de65c3ad-a21d-423a-b8c2-5bcf43e5e8ec  true 
        50  e0cdfa19-1d01-48b5-bc78-cb4785b20bc6  objectstore:standard  6c0e4f10-5c61-4830-8ac2-2be2d8947747  true   ---  ebcedbb1-20c6-462f-8ed2-f7ed83000c4f  true 
        51  ed99fc2a-b367-4fc6-8918-5547e2e655a7  hana:hdi-shared       a56a9023-fe64-43ba-991d-50ed9395f2e8  true   ---  6f1eb107-46e0-439f-bbc1-c826b1a2172a  true 
        52  ed99fc2a-b367-4fc6-8918-5547e2e655a7  objectstore:standard  66da3e8b-eee4-456b-8aac-750c797c6d6d  true   ---  1ba94fe6-ad02-4e04-9267-26c29343f304  true 
        53  fe2e319f-68cd-450f-8a02-d726dac64b35  hana:hdi-shared       639793df-096a-470b-8ef1-c7aec9bd048f  true   ---  f4d942e1-e205-4183-bd60-a8061816d62f  true 
        54  fe2e319f-68cd-450f-8a02-d726dac64b35  objectstore:standard  9e57fd34-309e-4ce2-9603-8371372d6c80  true   ---  f14ae5f9-2c38-4f19-a332-87f69c08d654  true 
        55  ffc185ec-3f22-48d5-9940-102ec4e62411  objectstore:standard  12fac650-6d22-4759-bb28-5e23628bbd8b  true   ---  25c7d889-a1e8-4b58-9af6-4e25e3179de4  true 
        56  t0                                    hana:hdi-shared       6e96ba0f-d345-43ef-a5be-b7d0de85d58b  true   ---  cf9b587d-b3a6-4185-a73b-3768f7c71096  true "
      `);
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
        
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_bindings 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_instances 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_offerings 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_plans 200 OK (88ms)"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("list timestamps", async () => {
      await nock.back("svm-list.json", { before: beforeExpandSharedRefs });
      const output = await svm.serviceManagerList(await freshContext(), [], [true, false]);
      expect(anonymizeListTimestamps(output)).toMatchInlineSnapshot(`
        "#   tenant_id                             service_plan          instance_id                           ready  created_on  updated_onbinding_id                            ready  created_on  updated_on
        1   0de2abab-9030-4524-9940-e5b37ac75d92  hana:hdi-shared       ea6bfebc-a2a7-4a0f-b893-c970face3cd6  true   2025-04-04T07:45:52Z (x days ago)  2025-04-04T07:46:02Z (x days ago)  ---  4a6dfc5a-c24c-4dfd-b45b-8dd9d7cdc694  true   2026-06-23T01:01:59Z (x days ago)  2026-06-23T01:02:09Z (x days ago)  
        2   0de2abab-9030-4524-9940-e5b37ac75d92  objectstore:standard  899f36fe-1bf3-4d95-8ae3-cdd4722c2832  true   2025-04-04T07:49:33Z (x days ago)  2025-04-04T07:50:09Z (x days ago)  ---  da24e4ef-61df-4b54-91d9-e6172a51c540  true   2026-06-23T01:02:01Z (x days ago)  2026-06-23T01:02:02Z (x days ago)  
        3   116b3ac3-6d84-4ed5-81be-0af4464a09b6  hana:hdi-shared       56c535b2-bc3a-44f5-96c8-3ae1054f455c  true   2025-10-27T13:43:30Z (x days ago)  2025-10-27T13:43:40Z (x days ago)  ---  9e2526d7-8cbd-4bfd-af40-42ab28f374bc  true   2026-06-23T01:02:09Z (x days ago)  2026-06-23T01:02:20Z (x days ago)  
        4   116b3ac3-6d84-4ed5-81be-0af4464a09b6  objectstore:standard  adcba256-b5ef-4e7d-b8c5-5ea5e9c808f9  true   2025-10-29T09:18:13Z (x days ago)  2025-10-29T09:18:49Z (x days ago)  ---  a3e0940f-1e35-440b-a309-94d1e37b87ce  true   2026-06-23T01:02:12Z (x days ago)  2026-06-23T01:02:14Z (x days ago)  
        5   1bbe07b0-4de1-4cdb-830d-49b0ddf20b53  hana:hdi-shared       7758e957-e3a9-418f-9e2b-50bd492cefa6  true   2025-09-19T08:54:05Z (x days ago)  2025-09-19T08:54:15Z (x days ago)  ---  65a4b71a-1f5e-4dfd-a392-1b74d21f0c8c  true   2026-06-23T01:02:08Z (x days ago)  2026-06-23T01:02:18Z (x days ago)  
        6   1bbe07b0-4de1-4cdb-830d-49b0ddf20b53  objectstore:standard  c18d7de5-195f-4967-8470-3a6438a23e24  true   2025-10-29T09:22:49Z (x days ago)  2025-10-29T09:23:25Z (x days ago)  ---  595c3b95-4653-485e-9feb-3f25b5506887  true   2026-06-23T01:02:15Z (x days ago)  2026-06-23T01:02:16Z (x days ago)  
        7   1cc0aa7f-f77e-4038-9ab0-48ae43ed3c7a  hana:hdi-shared       1d031371-1b20-4363-b1f9-473d21e6dd2a  true   2026-04-17T16:18:11Z (x days ago)  2026-04-17T16:18:26Z (x days ago)  ---  75748015-e87b-4c44-96d5-8f2520b0116c  true   2026-06-23T01:02:26Z (x days ago)  2026-06-23T01:02:36Z (x days ago)  
        8   1cc0aa7f-f77e-4038-9ab0-48ae43ed3c7a  objectstore:standard  5f503f0c-cf58-4c40-9c77-c2688d95b43d  true   2026-04-17T16:22:45Z (x days ago)  2026-04-17T16:23:41Z (x days ago)  ---  3b8f9439-b4d2-4d08-afe5-33111cb76808  true   2026-06-23T01:02:27Z (x days ago)  2026-06-23T01:02:28Z (x days ago)  
        9   3af21e38-10cc-45e3-976f-1463f1d63879  objectstore:standard  5b846327-36b7-4c55-b0fb-88abb38f23dc  true   2026-01-15T09:23:02Z (x days ago)  2026-01-15T09:23:38Z (x days ago)  ---  742dd01a-2c87-47be-a2c0-268e3de9d813  true   2026-06-23T01:02:20Z (x days ago)  2026-06-23T01:02:21Z (x days ago)  
        10  4c0909b1-a84e-4763-a26e-532fdb9e40fa  hana:hdi-shared       8a633bdf-bd76-43ee-8414-74f8095a05c3  true   2023-09-05T14:19:48Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  ---  ae032460-89da-4e9a-bff9-3899c0708d35  true   2026-06-23T01:01:47Z (x days ago)  2026-06-23T01:01:57Z (x days ago)  
        11  4c0909b1-a84e-4763-a26e-532fdb9e40fa  objectstore:standard  ca87508f-b17a-4f9e-84c5-8b974eec9488  true   2024-06-21T06:50:45Z (x days ago)  2024-07-12T20:16:51Z (x days ago)  ---  97ac4f61-16d6-4bd9-98b6-68b3fc0d68fa  true   2026-06-23T01:01:50Z (x days ago)  2026-06-23T01:01:52Z (x days ago)  
        12  524ffdf2-8174-4b70-bc10-36bf458ab360  hana:hdi-shared       a1d78a19-0f96-4ac4-bd31-d532f1d68f92  true   2026-05-18T11:04:24Z (x days ago)  2026-05-18T11:04:39Z (x days ago)  ---  a5ffa56e-9ae4-4acb-8448-ce1cdad9eff9  true   2026-06-23T01:02:28Z (x days ago)  2026-06-23T01:02:39Z (x days ago)  
        13  524ffdf2-8174-4b70-bc10-36bf458ab360  objectstore:standard  62a446e2-f529-4969-8194-fb26cb6117f4  true   2026-05-18T11:09:08Z (x days ago)  2026-05-18T11:10:04Z (x days ago)  ---  4b1f8f98-b728-4a39-ac59-fd0d15b50df9  true   2026-06-23T01:02:28Z (x days ago)  2026-06-23T01:02:30Z (x days ago)  
        14  5ca3a561-93c7-4ce1-a911-ad9923120381  hana:hdi-shared       70e48010-a730-4e88-b1b0-6fab23adad01  true   2026-06-19T09:38:23Z (x days ago)  2026-06-19T09:38:38Z (x days ago)  ---  797f9ee7-b142-46a7-8240-29aa76603834  true   2026-06-23T01:02:34Z (x days ago)  2026-06-23T01:02:45Z (x days ago)  
        15  5ca3a561-93c7-4ce1-a911-ad9923120381  objectstore:standard  806ce3f6-dd9c-4196-bb27-a730c7c24c26  true   2026-06-19T09:42:59Z (x days ago)  2026-06-19T09:43:15Z (x days ago)  ---  4057b8e0-cff2-4054-840d-d8ad181658c3  true   2026-06-23T01:02:36Z (x days ago)  2026-06-23T01:02:37Z (x days ago)  
        16  5d5ebba0-e1b9-44c3-989e-f274438c91ec  hana:hdi-shared       e9215dad-0d24-4bb5-a91b-e6e7ef7ed7d9  true   2026-06-08T05:32:39Z (x days ago)  2026-06-08T05:32:54Z (x days ago)  ---  65d9fdba-d15d-4b26-b465-1e6166840231  true   2026-06-23T01:02:33Z (x days ago)  2026-06-23T01:02:43Z (x days ago)  
        17  5d5ebba0-e1b9-44c3-989e-f274438c91ec  objectstore:standard  b5dea6b1-d41e-476c-ba2d-01e277887e7f  true   2026-06-08T05:37:22Z (x days ago)  2026-06-08T05:38:18Z (x days ago)  ---  44473336-af38-449e-a7cb-53a3e17f44f1  true   2026-06-23T01:02:33Z (x days ago)  2026-06-23T01:02:34Z (x days ago)  
        18  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  hana:hdi-shared       cd0dd852-4045-4bff-82b5-909d0948c6fb  true   2022-04-26T18:05:44Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  ---  38d700e2-e64b-4f25-873d-6f5deced7f05  true   2026-06-23T01:01:47Z (x days ago)  2026-06-23T01:01:57Z (x days ago)  
        19  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  objectstore:standard  61d42c22-f100-419b-83d9-f0d7caeeca57  true   2024-06-26T09:03:37Z (x days ago)  2024-07-12T20:15:50Z (x days ago)  ---  ddca7ef0-e3ee-4900-ae10-d150144fcdfb  true   2026-06-23T01:01:52Z (x days ago)  2026-06-23T01:01:53Z (x days ago)  
        20  663d2938-be50-44ab-92ca-538855eb594f  hana:hdi-shared       9915f7de-1cbd-447d-a315-35825f68be69  true   2024-09-11T07:33:25Z (x days ago)  2024-09-11T07:33:35Z (x days ago)  ---  6761f349-e09c-4352-b7f6-32bf3ce4bce2  true   2026-06-23T01:01:58Z (x days ago)  2026-06-23T01:02:08Z (x days ago)  
        21  663d2938-be50-44ab-92ca-538855eb594f  objectstore:standard  25c4c0ca-a01a-4534-bf34-842fb6e27c71  true   2024-09-11T07:37:20Z (x days ago)  2024-09-11T07:37:56Z (x days ago)  ---  da0fcab4-1c81-43a8-bb7b-21c575ed9775  true   2026-06-23T01:01:58Z (x days ago)  2026-06-23T01:01:59Z (x days ago)  
        22  73675fb3-0298-4cf3-8f86-a78c18392193  hana:hdi-shared       852bb033-afab-49d0-b827-4a3f32abe9ba  true   2025-05-22T12:08:28Z (x days ago)  2025-05-22T12:08:38Z (x days ago)  ---  271fed86-867f-46a0-91e3-0d7867657ae5  true   2026-06-23T01:02:02Z (x days ago)  2026-06-23T01:02:12Z (x days ago)  
        23  73675fb3-0298-4cf3-8f86-a78c18392193  objectstore:standard  66654db4-834b-4ae5-9a53-0e0fbabd42d1  true   2025-05-22T12:12:16Z (x days ago)  2025-05-22T12:12:52Z (x days ago)  ---  5eb68670-91c0-4caa-a795-7390bdc01290  true   2026-06-23T01:02:04Z (x days ago)  2026-06-23T01:02:05Z (x days ago)  
        24  79604d57-3933-4a66-81c2-a022413ec11d  hana:hdi-shared       1c61ab20-0ab1-41ce-8ae4-b7269d9513a4  true   2026-01-15T10:43:40Z (x days ago)  2026-01-15T10:43:51Z (x days ago)  ---  a97a4711-16df-448b-b7ac-a1b0ef27a5a6  true   2026-06-23T01:02:21Z (x days ago)  2026-06-23T01:02:31Z (x days ago)  
        25  79604d57-3933-4a66-81c2-a022413ec11d  objectstore:standard  411fac3d-9b5c-4fec-93ba-59fbc905c6cf  true   2026-01-15T10:47:52Z (x days ago)  2026-01-15T10:48:31Z (x days ago)  ---  daecba05-37fa-4ae3-8dce-24db492a682c  true   2026-06-23T01:02:21Z (x days ago)  2026-06-23T01:02:23Z (x days ago)  
        26  86ab464d-5770-46b4-b93d-292c1416c453  hana:hdi-shared       2e5b16d4-5379-47b5-a03d-d749777dadae  true   2025-09-23T14:24:15Z (x days ago)  2025-09-23T14:24:27Z (x days ago)  ---  d7fd73a8-5c23-4a88-80c9-675bd2f22004  true   2026-06-23T01:02:09Z (x days ago)  2026-06-23T01:02:20Z (x days ago)  
        27  86ab464d-5770-46b4-b93d-292c1416c453  objectstore:standard  54699da7-b092-4e4b-9429-b0df4770c2b2  true   2025-10-29T09:22:49Z (x days ago)  2025-10-29T09:24:01Z (x days ago)  ---  8accbaa7-c9a6-49e2-aace-2c11d01f413c  true   2026-06-23T01:02:14Z (x days ago)  2026-06-23T01:02:15Z (x days ago)  
        28  899887a3-46a1-4370-b69a-d615f7420f08  hana:hdi-shared       6430d626-937c-47db-a961-e38f52c17ba0  true   2026-05-20T05:23:16Z (x days ago)  2026-05-20T05:23:32Z (x days ago)  ---  85abc091-e0ec-461d-b1e2-3447eb538a86  true   2026-06-23T01:02:31Z (x days ago)  2026-06-23T01:02:42Z (x days ago)  
        29  899887a3-46a1-4370-b69a-d615f7420f08  objectstore:standard  7ba9df5d-29c9-42a6-aff1-4dab737e0448  true   2026-05-20T05:27:49Z (x days ago)  2026-05-20T05:28:45Z (x days ago)  ---  34e8007f-ca50-429e-837c-d0d962a3d2e2  true   2026-06-23T01:02:31Z (x days ago)  2026-06-23T01:02:33Z (x days ago)  
        30  97b55bf7-a906-42ab-9176-3e86762dcdb7  hana:hdi-shared       eaf48f15-7d72-4a5b-8833-96a4b04dba8f  true   2026-03-12T14:50:46Z (x days ago)  2026-03-12T14:51:01Z (x days ago)  ---  9b917159-3cf1-457a-bf2b-0eefe7c80ad6  true   2026-06-23T01:02:23Z (x days ago)  2026-06-23T01:02:33Z (x days ago)  
        31  97b55bf7-a906-42ab-9176-3e86762dcdb7  objectstore:standard  db86c471-92f6-458e-973c-a3d2e4329bf9  true   2026-03-12T14:55:10Z (x days ago)  2026-03-12T14:56:27Z (x days ago)  ---  e958fdf2-3c7d-4264-a13e-81d97e78f2c1  true   2026-06-23T01:02:23Z (x days ago)  2026-06-23T01:02:24Z (x days ago)  
        32  9c418100-6318-4e8a-b4b2-1114f4f44aef  hana:hdi-shared       c1626f78-e2de-47ab-8674-efe747db2fe3  true   2024-11-27T06:50:22Z (x days ago)  2024-11-27T06:50:32Z (x days ago)  ---  f120b0c3-de9d-4201-a993-1188ca6ce6c2  true   2026-06-23T01:01:58Z (x days ago)  2026-06-23T01:02:08Z (x days ago)  
        33  9c418100-6318-4e8a-b4b2-1114f4f44aef  objectstore:standard  164c212e-b0e9-4ec9-9259-3abbd753cb21  true   2024-11-27T06:54:41Z (x days ago)  2024-11-27T06:55:17Z (x days ago)  ---  76c897cf-f08f-48eb-bb74-59e116fb18c1  true   2026-06-23T01:01:58Z (x days ago)  2026-06-23T01:01:59Z (x days ago)  
        34  ad91dbba-5c90-436d-8cd8-63b3fb88cf6a  objectstore:standard  500011f3-9dd7-483b-bcc6-b9a87bc27fbe  true   2025-12-11T03:43:21Z (x days ago)  2025-12-11T03:43:57Z (x days ago)  ---  cbf88795-01f1-4cb1-9a00-0f59adda6991  true   2026-06-23T01:02:20Z (x days ago)  2026-06-23T01:02:21Z (x days ago)  
        35  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  hana:hdi-shared       8dbac1ec-7127-4bda-86a4-0ff02cfefd8d  true   2024-07-05T11:19:53Z (x days ago)  2024-07-05T11:20:04Z (x days ago)  ---  c6e5a14b-4dcb-479e-9c6e-5fc6ff830b32  true   2026-06-23T01:01:53Z (x days ago)  2026-06-23T01:02:03Z (x days ago)  
        36  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  objectstore:standard  a66e6ae9-72dd-4689-851a-f2b33bfb8ff9  true   2024-07-05T20:24:38Z (x days ago)  2024-07-12T20:17:23Z (x days ago)  ---  f8d7f8a6-5d5b-4850-af1b-eb8cd3edb0d8  true   2026-06-23T01:01:58Z (x days ago)  2026-06-23T01:01:59Z (x days ago)  
        37  b46f4c09-e46e-432b-b837-0aad96d145f9  objectstore:standard  2240055d-5306-43e7-a0c2-8623eff8e538  true   2025-12-19T02:15:12Z (x days ago)  2025-12-19T02:15:48Z (x days ago)  ---  2a4cbb0d-13c9-48be-a109-12e2bb1ad7e2  true   2026-06-23T01:02:20Z (x days ago)  2026-06-23T01:02:21Z (x days ago)  
        38  b46f4c09-e46e-432b-b837-0aad96d145f9  hana:hdi-shared       3e0696d7-6669-40ce-8bde-8eb71b227b15  true   2025-12-22T02:15:53Z (x days ago)  2025-12-22T02:16:04Z (x days ago)  ---  d74f6504-58bb-4fa4-a3aa-ddcaa8b44b58  true   2026-06-23T01:02:20Z (x days ago)  2026-06-23T01:02:30Z (x days ago)  
        39  ba22b06c-b55f-4940-ae38-b92a5928c8a5  hana:hdi-shared       67a22c54-b5b7-4b96-bea1-0a2d38999def  true   2025-09-25T10:03:52Z (x days ago)  2025-09-25T10:04:03Z (x days ago)  ---  27cb0a64-cb06-41e6-b1b4-046e4c9b10ab  true   2026-06-23T01:02:09Z (x days ago)  2026-06-23T01:02:20Z (x days ago)  
        40  ba22b06c-b55f-4940-ae38-b92a5928c8a5  objectstore:standard  2db8caf7-fcac-4b9d-abf2-38683639d2b1  true   2025-10-29T09:22:49Z (x days ago)  2025-10-29T09:23:25Z (x days ago)  ---  fa43acac-9ccd-4f6f-82c4-186464bbe652  true   2026-06-23T01:02:15Z (x days ago)  2026-06-23T01:02:16Z (x days ago)  
        41  be884689-aad4-486e-b556-23fdcf266f6d  hana:hdi-shared       875d3ddf-1ede-41e1-b8af-134e418427a3  true   2024-12-09T03:50:22Z (x days ago)  2024-12-09T03:50:32Z (x days ago)  ---  01c3b537-c239-4171-919a-59afa9030632  true   2026-06-23T01:01:59Z (x days ago)  2026-06-23T01:02:09Z (x days ago)  
        42  be884689-aad4-486e-b556-23fdcf266f6d  objectstore:standard  f92f8e3e-f813-46b1-9846-c582de2b7982  true   2024-12-09T03:54:45Z (x days ago)  2024-12-09T03:55:21Z (x days ago)  ---  8224a299-c6e2-4dba-a079-97b73d24fb67  true   2026-06-23T01:01:59Z (x days ago)  2026-06-23T01:02:00Z (x days ago)  
        43  cb9158ce-f8fd-441b-b443-17219e8f79fa  hana:hdi-shared       42ff43bd-14a7-41f7-b903-259235c1abcb  true   2022-09-05T12:11:41Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  ---  fef1f660-25e4-448d-8e44-71b3461c6d12  true   2026-06-23T01:01:47Z (x days ago)  2026-06-23T01:01:58Z (x days ago)  
        44  cb9158ce-f8fd-441b-b443-17219e8f79fa  objectstore:standard  ce93990a-885f-482b-a3e4-f5b55fa65e77  true   2024-06-21T06:11:31Z (x days ago)  2024-07-12T20:16:20Z (x days ago)  ---  18f1f9eb-23cd-4749-8bea-41a59b556777  true   2026-06-23T01:01:49Z (x days ago)  2026-06-23T01:01:50Z (x days ago)  
        45  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  hana:hdi-shared       fe81e5b0-6526-4237-95a4-19268049f779  true   2024-03-19T16:53:23Z (x days ago)  2024-03-19T16:53:33Z (x days ago)  ---  a6b9dfa3-c6b5-4d7e-bb5b-befb7be01426  true   2026-06-23T01:01:47Z (x days ago)  2026-06-23T01:01:58Z (x days ago)  
        46  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  objectstore:standard  af9af05c-808b-4ada-a775-6c78854ad466  true   2024-06-19T10:16:54Z (x days ago)  2024-07-12T20:15:18Z (x days ago)  ---  e27c0f6b-644c-4588-bc4a-43c3e759a87a  true   2026-06-23T01:01:47Z (x days ago)  2026-06-23T01:01:49Z (x days ago)  
        47  d91fb749-a148-479f-b29d-71b1b6a9309d  hana:hdi-shared       9e954752-5a2d-45fa-a809-e9707cedf2e5  true   2025-05-22T12:27:03Z (x days ago)  2025-05-22T12:27:13Z (x days ago)  ---  60afecbf-8e2e-463f-a44f-f355384abfb6  true   2026-06-23T01:02:05Z (x days ago)  2026-06-23T01:02:15Z (x days ago)  
        48  d91fb749-a148-479f-b29d-71b1b6a9309d  objectstore:standard  57944233-590b-416d-93fd-399cabcb30b8  true   2025-05-22T12:30:47Z (x days ago)  2025-05-22T12:31:23Z (x days ago)  ---  30d25d05-7fdb-4d05-ad94-649120f74bb0  true   2026-06-23T01:02:08Z (x days ago)  2026-06-23T01:02:09Z (x days ago)  
        49  e0cdfa19-1d01-48b5-bc78-cb4785b20bc6  hana:hdi-shared       9be55a43-72bd-41b5-b33e-3aeb1f432ce0  true   2026-05-19T14:36:04Z (x days ago)  2026-05-19T14:36:19Z (x days ago)  ---  de65c3ad-a21d-423a-b8c2-5bcf43e5e8ec  true   2026-06-23T01:02:30Z (x days ago)  2026-06-23T01:02:40Z (x days ago)  
        50  e0cdfa19-1d01-48b5-bc78-cb4785b20bc6  objectstore:standard  6c0e4f10-5c61-4830-8ac2-2be2d8947747  true   2026-05-19T14:40:28Z (x days ago)  2026-05-19T14:41:26Z (x days ago)  ---  ebcedbb1-20c6-462f-8ed2-f7ed83000c4f  true   2026-06-23T01:02:30Z (x days ago)  2026-06-23T01:02:31Z (x days ago)  
        51  ed99fc2a-b367-4fc6-8918-5547e2e655a7  hana:hdi-shared       a56a9023-fe64-43ba-991d-50ed9395f2e8  true   2025-11-27T08:35:57Z (x days ago)  2025-11-27T08:36:08Z (x days ago)  ---  6f1eb107-46e0-439f-bbc1-c826b1a2172a  true   2026-06-23T01:02:16Z (x days ago)  2026-06-23T01:02:27Z (x days ago)  
        52  ed99fc2a-b367-4fc6-8918-5547e2e655a7  objectstore:standard  66da3e8b-eee4-456b-8aac-750c797c6d6d  true   2025-11-27T08:40:12Z (x days ago)  2025-11-27T08:40:48Z (x days ago)  ---  1ba94fe6-ad02-4e04-9267-26c29343f304  true   2026-06-23T01:02:17Z (x days ago)  2026-06-23T01:02:18Z (x days ago)  
        53  fe2e319f-68cd-450f-8a02-d726dac64b35  hana:hdi-shared       639793df-096a-470b-8ef1-c7aec9bd048f  true   2025-12-02T12:44:02Z (x days ago)  2025-12-02T12:44:14Z (x days ago)  ---  f4d942e1-e205-4183-bd60-a8061816d62f  true   2026-06-23T01:02:18Z (x days ago)  2026-06-23T01:02:28Z (x days ago)  
        54  fe2e319f-68cd-450f-8a02-d726dac64b35  objectstore:standard  9e57fd34-309e-4ce2-9603-8371372d6c80  true   2025-12-02T12:48:39Z (x days ago)  2025-12-02T12:49:15Z (x days ago)  ---  f14ae5f9-2c38-4f19-a332-87f69c08d654  true   2026-06-23T01:02:18Z (x days ago)  2026-06-23T01:02:20Z (x days ago)  
        55  ffc185ec-3f22-48d5-9940-102ec4e62411  objectstore:standard  12fac650-6d22-4759-bb28-5e23628bbd8b  true   2026-01-15T10:11:57Z (x days ago)  2026-01-15T10:12:33Z (x days ago)  ---  25c7d889-a1e8-4b58-9af6-4e25e3179de4  true   2026-06-23T01:02:21Z (x days ago)  2026-06-23T01:02:23Z (x days ago)  
        56  t0                                    hana:hdi-shared       6e96ba0f-d345-43ef-a5be-b7d0de85d58b  true   2023-01-30T20:19:09Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  ---  cf9b587d-b3a6-4185-a73b-3768f7c71096  true   2026-06-23T01:01:47Z (x days ago)  2026-06-23T01:01:58Z (x days ago)  "
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("list json", async () => {
      await nock.back("svm-list.json", { before: beforeExpandSharedRefs });
      const output = await svm.serviceManagerList(await freshContext(), [], [true, true]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("list filtered basic", async () => {
      await nock.back("svm-list-filtered.json", { before: beforeExpandSharedRefs });
      const output = await svm.serviceManagerList(await freshContext(), [testTenantId], [false, false]);
      expect(output).toMatchInlineSnapshot(`
        "tenant_id                             service_plan          instance_id                           ready       binding_id                            ready
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  hana:hdi-shared       cd0dd852-4045-4bff-82b5-909d0948c6fb  true   ---  38d700e2-e64b-4f25-873d-6f5deced7f05  true 
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  objectstore:standard  61d42c22-f100-419b-83d9-f0d7caeeca57  true   ---  ddca7ef0-e3ee-4900-ae10-d150144fcdfb  true "
      `);
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
        
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_bindings?labelQuery=tenant_id+eq+'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_instances?labelQuery=tenant_id+eq+'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_offerings 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_plans 200 OK (88ms)"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("list filtered timestamps", async () => {
      await nock.back("svm-list-filtered.json", { before: beforeExpandSharedRefs });
      const output = await svm.serviceManagerList(await freshContext(), [testTenantId], [true, false]);
      expect(anonymizeListTimestamps(output)).toMatchInlineSnapshot(`
        "tenant_id                             service_plan          instance_id                           ready  created_on  updated_onbinding_id                            ready  created_on  updated_on
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  hana:hdi-shared       cd0dd852-4045-4bff-82b5-909d0948c6fb  true   2022-04-26T18:05:44Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  ---  38d700e2-e64b-4f25-873d-6f5deced7f05  true   2026-06-23T01:01:47Z (x days ago)  2026-06-23T01:01:57Z (x days ago)  
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  objectstore:standard  61d42c22-f100-419b-83d9-f0d7caeeca57  true   2024-06-26T09:03:37Z (x days ago)  2024-07-12T20:15:50Z (x days ago)  ---  ddca7ef0-e3ee-4900-ae10-d150144fcdfb  true   2026-06-23T01:01:52Z (x days ago)  2026-06-23T01:01:53Z (x days ago)  "
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("list filtered json", async () => {
      await nock.back("svm-list-filtered.json", { before: beforeExpandSharedRefs });
      const output = await svm.serviceManagerList(await freshContext(), [testTenantId], [true, true]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });
  });

  describe("long list", () => {
    test("long list basic", async () => {
      await nock.back("svm-long-list.json", { before: beforeExpandSharedRefs });
      const output = await svm.serviceManagerLongList(await freshContext(), [], [false, false]);
      expect(output).toMatchSnapshot();
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
        
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_bindings 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_instances 200 OK (88ms)"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("long list revealed", async () => {
      await nock.back("svm-long-list.json", { before: beforeExpandSharedRefs });
      const output = await svm.serviceManagerLongList(await freshContext(), [], [false, true]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("long list json", async () => {
      await nock.back("svm-long-list.json", { before: beforeExpandSharedRefs });
      const output = await svm.serviceManagerLongList(await freshContext(), [], [true, true]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("long list filtered basic", async () => {
      await nock.back("svm-long-list-filtered.json", { before: beforeExpandSharedRefs });
      const output = await svm.serviceManagerLongList(await freshContext(), [testTenantId], [false, false]);
      expect(output).toMatchSnapshot();
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
        
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_bindings?labelQuery=tenant_id+eq+'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_instances?labelQuery=tenant_id+eq+'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("long list filtered revealed", async () => {
      await nock.back("svm-long-list-filtered.json", { before: beforeExpandSharedRefs });
      const output = await svm.serviceManagerLongList(await freshContext(), [testTenantId], [false, true]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("long list filtered json", async () => {
      await nock.back("svm-long-list-filtered.json", { before: beforeExpandSharedRefs });
      const output = await svm.serviceManagerLongList(await freshContext(), [testTenantId], [true, true]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });
  });
});

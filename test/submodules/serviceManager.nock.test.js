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
    // eslint-disable-next-line jest/no-standalone-expect
    expect(nock.pendingMocks()).toEqual([]);
    nock.cleanAll();
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
        "#   tenant_id                             service_plan          instance_id                           usable       binding_id                          
        1   0de2abab-9030-4524-9940-e5b37ac75d92  hana:hdi-shared       ea6bfebc-a2a7-4a0f-b893-c970face3cd6  true    ---  1df14d9f-eedb-49d9-b5f4-75ca9614957a
        2   0de2abab-9030-4524-9940-e5b37ac75d92  objectstore:standard  899f36fe-1bf3-4d95-8ae3-cdd4722c2832  true    ---  55484247-4565-4f02-9f47-e17fe73cb99e
        3   116b3ac3-6d84-4ed5-81be-0af4464a09b6  hana:hdi-shared       56c535b2-bc3a-44f5-96c8-3ae1054f455c  true    ---  94ca1997-1ec4-4cda-86b5-49ab890d0c1d
        4   116b3ac3-6d84-4ed5-81be-0af4464a09b6  objectstore:standard  adcba256-b5ef-4e7d-b8c5-5ea5e9c808f9  true    ---  4d44a37b-39c6-40aa-af58-40546c0470a6
        5   1bbe07b0-4de1-4cdb-830d-49b0ddf20b53  hana:hdi-shared       7758e957-e3a9-418f-9e2b-50bd492cefa6  true    ---  7de6abe4-a470-4b5e-80ca-9b722572ee08
        6   1bbe07b0-4de1-4cdb-830d-49b0ddf20b53  objectstore:standard  c18d7de5-195f-4967-8470-3a6438a23e24  true    ---  30164478-67a1-4952-bcaf-320f887c5c39
        7   1cc0aa7f-f77e-4038-9ab0-48ae43ed3c7a  hana:hdi-shared       1d031371-1b20-4363-b1f9-473d21e6dd2a  true    ---  d80fec91-cef9-4906-baab-4c8fb502d8d1
        8   1cc0aa7f-f77e-4038-9ab0-48ae43ed3c7a  objectstore:standard  5f503f0c-cf58-4c40-9c77-c2688d95b43d  true    ---  0ffb6e3e-4191-4028-b568-d07b72def644
        9   3af21e38-10cc-45e3-976f-1463f1d63879  objectstore:standard  5b846327-36b7-4c55-b0fb-88abb38f23dc  true    ---  a6f0652b-3a2a-4b9b-af72-036e7914ac7f
        10  4c0909b1-a84e-4763-a26e-532fdb9e40fa  hana:hdi-shared       8a633bdf-bd76-43ee-8414-74f8095a05c3  true    ---  c7627d65-f537-4c51-9369-faa0e02adbaf
        11  4c0909b1-a84e-4763-a26e-532fdb9e40fa  objectstore:standard  ca87508f-b17a-4f9e-84c5-8b974eec9488  true    ---  6dadbbb5-4777-458d-80ef-07346a3abc59
        12  524ffdf2-8174-4b70-bc10-36bf458ab360  hana:hdi-shared       a1d78a19-0f96-4ac4-bd31-d532f1d68f92  true    ---  bd8b67ad-5bb9-4ad9-9013-637a15cc866d
        13  524ffdf2-8174-4b70-bc10-36bf458ab360  objectstore:standard  62a446e2-f529-4969-8194-fb26cb6117f4  true    ---  94cb7a9c-ab7a-4ead-ac46-48d8836681d2
        14  5ca3a561-93c7-4ce1-a911-ad9923120381  hana:hdi-shared       70e48010-a730-4e88-b1b0-6fab23adad01  true    ---  46ffeee2-7d4b-4831-82ce-487c4d2cbcfc
        15  5ca3a561-93c7-4ce1-a911-ad9923120381  objectstore:standard  806ce3f6-dd9c-4196-bb27-a730c7c24c26  true    ---  d70e157f-cd25-46ec-ac92-831699e680bc
        16  5d5ebba0-e1b9-44c3-989e-f274438c91ec  hana:hdi-shared       e9215dad-0d24-4bb5-a91b-e6e7ef7ed7d9  true    ---  436f54df-0270-4765-97bf-1b380b314c8e
        17  5d5ebba0-e1b9-44c3-989e-f274438c91ec  objectstore:standard  b5dea6b1-d41e-476c-ba2d-01e277887e7f  true    ---  1f4ab147-db78-48fd-9243-04dc411afc44
        18  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  hana:hdi-shared       cd0dd852-4045-4bff-82b5-909d0948c6fb  true    ---  3bc942d4-03f9-441a-9fae-1f16b2dc7957
        19  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  objectstore:standard  61d42c22-f100-419b-83d9-f0d7caeeca57  true    ---  ba448bef-a29c-48fc-b638-596e42420258
        20  663d2938-be50-44ab-92ca-538855eb594f  hana:hdi-shared       9915f7de-1cbd-447d-a315-35825f68be69  true    ---  ce549ba0-df9e-4c4d-b4c7-57b44aa85126
        21  663d2938-be50-44ab-92ca-538855eb594f  objectstore:standard  25c4c0ca-a01a-4534-bf34-842fb6e27c71  true    ---  f49fc193-500c-43b2-bf0a-f0058d82521f
        22  73675fb3-0298-4cf3-8f86-a78c18392193  hana:hdi-shared       852bb033-afab-49d0-b827-4a3f32abe9ba  true    ---  0598c435-88b3-4544-a67a-f3c4845c2571
        23  73675fb3-0298-4cf3-8f86-a78c18392193  objectstore:standard  66654db4-834b-4ae5-9a53-0e0fbabd42d1  true    ---  423d3f66-6417-44ee-9772-8f6550c8de0d
        24  79604d57-3933-4a66-81c2-a022413ec11d  hana:hdi-shared       1c61ab20-0ab1-41ce-8ae4-b7269d9513a4  true    ---  8c20f7b1-9801-40ab-a1f5-4617ade19416
        25  79604d57-3933-4a66-81c2-a022413ec11d  objectstore:standard  411fac3d-9b5c-4fec-93ba-59fbc905c6cf  true    ---  0db54575-12ac-44b6-a035-2610d58425bd
        26  86ab464d-5770-46b4-b93d-292c1416c453  hana:hdi-shared       2e5b16d4-5379-47b5-a03d-d749777dadae  true    ---  7ddbc0e2-0192-4725-876f-b1ec80885587
        27  86ab464d-5770-46b4-b93d-292c1416c453  objectstore:standard  54699da7-b092-4e4b-9429-b0df4770c2b2  true    ---  c856b8cb-f6d8-4c7d-8bc8-796a45949876
        28  899887a3-46a1-4370-b69a-d615f7420f08  hana:hdi-shared       6430d626-937c-47db-a961-e38f52c17ba0  true    ---  a1b03a4e-8cb9-4ae9-9537-aa27686d4fac
        29  899887a3-46a1-4370-b69a-d615f7420f08  objectstore:standard  7ba9df5d-29c9-42a6-aff1-4dab737e0448  true    ---  bcbb1355-d1fa-4741-aafc-c7da0ac2ba97
        30  97b55bf7-a906-42ab-9176-3e86762dcdb7  hana:hdi-shared       eaf48f15-7d72-4a5b-8833-96a4b04dba8f  true    ---  302e92bb-e8b7-4ba4-9ecb-9c840ba0f020
        31  97b55bf7-a906-42ab-9176-3e86762dcdb7  objectstore:standard  db86c471-92f6-458e-973c-a3d2e4329bf9  true    ---  a93dfd31-fc82-4fc4-a984-8e69fc6c8862
        32  9c418100-6318-4e8a-b4b2-1114f4f44aef  hana:hdi-shared       c1626f78-e2de-47ab-8674-efe747db2fe3  true    ---  82c5f66c-5078-47e9-94ac-1c221e9c49cb
        33  9c418100-6318-4e8a-b4b2-1114f4f44aef  objectstore:standard  164c212e-b0e9-4ec9-9259-3abbd753cb21  true    ---  8c6bcf01-29ef-4605-9a84-c723479ae35e
        34  ad91dbba-5c90-436d-8cd8-63b3fb88cf6a  objectstore:standard  500011f3-9dd7-483b-bcc6-b9a87bc27fbe  true    ---  251289a9-35c3-4af9-a14f-46f6bc962474
        35  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  hana:hdi-shared       8dbac1ec-7127-4bda-86a4-0ff02cfefd8d  true    ---  9e4206f5-65c0-416a-8b5a-8169820a7d91
        36  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  objectstore:standard  a66e6ae9-72dd-4689-851a-f2b33bfb8ff9  true    ---  70add69b-af18-4729-8036-bbbd21928b3e
        37  b46f4c09-e46e-432b-b837-0aad96d145f9  objectstore:standard  2240055d-5306-43e7-a0c2-8623eff8e538  true    ---  77116159-0306-423f-877a-e58ad1f3951b
        38  b46f4c09-e46e-432b-b837-0aad96d145f9  hana:hdi-shared       3e0696d7-6669-40ce-8bde-8eb71b227b15  true    ---  142c8e4b-5fad-4d8e-abcf-f6674cd9272c
        39  ba22b06c-b55f-4940-ae38-b92a5928c8a5  hana:hdi-shared       67a22c54-b5b7-4b96-bea1-0a2d38999def  true    ---  1aa10e1e-62f8-415e-b3c4-fd8d8a87d48c
        40  ba22b06c-b55f-4940-ae38-b92a5928c8a5  objectstore:standard  2db8caf7-fcac-4b9d-abf2-38683639d2b1  true    ---  51f18161-10fe-43b3-9853-b99ab95c8979
        41  be884689-aad4-486e-b556-23fdcf266f6d  hana:hdi-shared       875d3ddf-1ede-41e1-b8af-134e418427a3  true    ---  401a3234-1da9-4310-81ff-8b64a6795a37
        42  be884689-aad4-486e-b556-23fdcf266f6d  objectstore:standard  f92f8e3e-f813-46b1-9846-c582de2b7982  true    ---  792193d7-454e-445f-828e-c0d52c58d28d
        43  cb9158ce-f8fd-441b-b443-17219e8f79fa  hana:hdi-shared       42ff43bd-14a7-41f7-b903-259235c1abcb  true    ---  0afaea0b-8979-4f73-8eac-1a970475837e
        44  cb9158ce-f8fd-441b-b443-17219e8f79fa  objectstore:standard  ce93990a-885f-482b-a3e4-f5b55fa65e77  true    ---  b4636055-3e77-493c-baf8-abf34d700fde
        45  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  hana:hdi-shared       fe81e5b0-6526-4237-95a4-19268049f779  true    ---  c7250e2c-95e5-4acc-8b19-20ade98fc8d3
        46  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  objectstore:standard  af9af05c-808b-4ada-a775-6c78854ad466  true    ---  8eb1e868-b7b6-4228-8fd7-5803a7bd7dec
        47  d91fb749-a148-479f-b29d-71b1b6a9309d  hana:hdi-shared       9e954752-5a2d-45fa-a809-e9707cedf2e5  true    ---  4b8faf64-556f-4537-96e5-b39d88683cde
        48  d91fb749-a148-479f-b29d-71b1b6a9309d  objectstore:standard  57944233-590b-416d-93fd-399cabcb30b8  true    ---  36eba8db-4f6f-45bc-99f5-a66d9332ad3d
        49  e0cdfa19-1d01-48b5-bc78-cb4785b20bc6  hana:hdi-shared       9be55a43-72bd-41b5-b33e-3aeb1f432ce0  true    ---  714dbdae-4615-455c-8a56-2d3d53f3e00f
        50  e0cdfa19-1d01-48b5-bc78-cb4785b20bc6  objectstore:standard  6c0e4f10-5c61-4830-8ac2-2be2d8947747  true    ---  f424e51f-2e75-4c12-bcf8-fcca3253ab49
        51  ed99fc2a-b367-4fc6-8918-5547e2e655a7  hana:hdi-shared       a56a9023-fe64-43ba-991d-50ed9395f2e8  true    ---  d9b7b53b-2041-44a0-858a-355155ca6a78
        52  ed99fc2a-b367-4fc6-8918-5547e2e655a7  objectstore:standard  66da3e8b-eee4-456b-8aac-750c797c6d6d  true    ---  8f47c739-f841-4087-8b6d-7b195300a64a
        53  fe2e319f-68cd-450f-8a02-d726dac64b35  hana:hdi-shared       639793df-096a-470b-8ef1-c7aec9bd048f  true    ---  f40678ea-9039-42fc-a003-8530f5649521
        54  fe2e319f-68cd-450f-8a02-d726dac64b35  objectstore:standard  9e57fd34-309e-4ce2-9603-8371372d6c80  true    ---  6495c3c5-a9e1-4b52-95d1-5977847bf674
        55  ffc185ec-3f22-48d5-9940-102ec4e62411  objectstore:standard  12fac650-6d22-4759-bb28-5e23628bbd8b  true    ---  3b5c13b4-d315-4a05-ae51-967fb4258107
        56  t0                                    hana:hdi-shared       6e96ba0f-d345-43ef-a5be-b7d0de85d58b  true    ---  6b6a252b-fa87-478d-924f-3310557b82d5"
      `);
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
        
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_bindings 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_instances 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_offerings 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_plans 200 OK (88ms)"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("list timestamps", async () => {
      await nock.back("svm-list.json", { before: beforeExpandSharedRefs });
      const output = await svm.serviceManagerList(await freshContext(), [], [true, false]);
      expect(anonymizeListTimestamps(output)).toMatchInlineSnapshot(`
        "#   tenant_id                             service_plan          instance_id                           usable  created_on  updated_onbinding_id                            created_on  updated_on
        1   0de2abab-9030-4524-9940-e5b37ac75d92  hana:hdi-shared       ea6bfebc-a2a7-4a0f-b893-c970face3cd6  true    2025-04-04T07:45:52Z (x days ago)  2025-04-04T07:45:52Z (x days ago)  ---  1df14d9f-eedb-49d9-b5f4-75ca9614957a  2026-06-30T01:02:13Z (x days ago)  2026-06-30T01:02:23Z (x days ago)  
        2   0de2abab-9030-4524-9940-e5b37ac75d92  objectstore:standard  899f36fe-1bf3-4d95-8ae3-cdd4722c2832  true    2025-04-04T07:49:33Z (x days ago)  2025-04-04T07:49:33Z (x days ago)  ---  55484247-4565-4f02-9f47-e17fe73cb99e  2026-06-30T01:02:14Z (x days ago)  2026-06-30T01:02:15Z (x days ago)  
        3   116b3ac3-6d84-4ed5-81be-0af4464a09b6  hana:hdi-shared       56c535b2-bc3a-44f5-96c8-3ae1054f455c  true    2025-10-27T13:43:30Z (x days ago)  2025-10-27T13:43:30Z (x days ago)  ---  94ca1997-1ec4-4cda-86b5-49ab890d0c1d  2026-06-30T01:02:23Z (x days ago)  2026-06-30T01:02:33Z (x days ago)  
        4   116b3ac3-6d84-4ed5-81be-0af4464a09b6  objectstore:standard  adcba256-b5ef-4e7d-b8c5-5ea5e9c808f9  true    2025-10-29T09:18:13Z (x days ago)  2025-10-29T09:18:13Z (x days ago)  ---  4d44a37b-39c6-40aa-af58-40546c0470a6  2026-06-30T01:02:25Z (x days ago)  2026-06-30T01:02:27Z (x days ago)  
        5   1bbe07b0-4de1-4cdb-830d-49b0ddf20b53  hana:hdi-shared       7758e957-e3a9-418f-9e2b-50bd492cefa6  true    2025-09-19T08:54:05Z (x days ago)  2025-09-19T08:54:05Z (x days ago)  ---  7de6abe4-a470-4b5e-80ca-9b722572ee08  2026-06-30T01:02:21Z (x days ago)  2026-06-30T01:02:32Z (x days ago)  
        6   1bbe07b0-4de1-4cdb-830d-49b0ddf20b53  objectstore:standard  c18d7de5-195f-4967-8470-3a6438a23e24  true    2025-10-29T09:22:49Z (x days ago)  2025-10-29T09:22:49Z (x days ago)  ---  30164478-67a1-4952-bcaf-320f887c5c39  2026-06-30T01:02:30Z (x days ago)  2026-06-30T01:02:31Z (x days ago)  
        7   1cc0aa7f-f77e-4038-9ab0-48ae43ed3c7a  hana:hdi-shared       1d031371-1b20-4363-b1f9-473d21e6dd2a  true    2026-04-17T16:18:11Z (x days ago)  2026-04-17T16:18:11Z (x days ago)  ---  d80fec91-cef9-4906-baab-4c8fb502d8d1  2026-06-30T01:02:38Z (x days ago)  2026-06-30T01:02:49Z (x days ago)  
        8   1cc0aa7f-f77e-4038-9ab0-48ae43ed3c7a  objectstore:standard  5f503f0c-cf58-4c40-9c77-c2688d95b43d  true    2026-04-17T16:22:45Z (x days ago)  2026-04-17T16:22:45Z (x days ago)  ---  0ffb6e3e-4191-4028-b568-d07b72def644  2026-06-30T01:02:41Z (x days ago)  2026-06-30T01:02:43Z (x days ago)  
        9   3af21e38-10cc-45e3-976f-1463f1d63879  objectstore:standard  5b846327-36b7-4c55-b0fb-88abb38f23dc  true    2026-01-15T09:23:02Z (x days ago)  2026-01-15T09:23:02Z (x days ago)  ---  a6f0652b-3a2a-4b9b-af72-036e7914ac7f  2026-06-30T01:02:34Z (x days ago)  2026-06-30T01:02:36Z (x days ago)  
        10  4c0909b1-a84e-4763-a26e-532fdb9e40fa  hana:hdi-shared       8a633bdf-bd76-43ee-8414-74f8095a05c3  true    2023-09-05T14:19:48Z (x days ago)  2023-09-05T14:19:48Z (x days ago)  ---  c7627d65-f537-4c51-9369-faa0e02adbaf  2026-06-30T01:02:01Z (x days ago)  2026-06-30T01:02:11Z (x days ago)  
        11  4c0909b1-a84e-4763-a26e-532fdb9e40fa  objectstore:standard  ca87508f-b17a-4f9e-84c5-8b974eec9488  true    2024-06-21T06:50:45Z (x days ago)  2024-06-21T06:50:45Z (x days ago)  ---  6dadbbb5-4777-458d-80ef-07346a3abc59  2026-06-30T01:02:04Z (x days ago)  2026-06-30T01:02:06Z (x days ago)  
        12  524ffdf2-8174-4b70-bc10-36bf458ab360  hana:hdi-shared       a1d78a19-0f96-4ac4-bd31-d532f1d68f92  true    2026-05-18T11:04:24Z (x days ago)  2026-05-18T11:04:24Z (x days ago)  ---  bd8b67ad-5bb9-4ad9-9013-637a15cc866d  2026-06-30T01:02:42Z (x days ago)  2026-06-30T01:02:52Z (x days ago)  
        13  524ffdf2-8174-4b70-bc10-36bf458ab360  objectstore:standard  62a446e2-f529-4969-8194-fb26cb6117f4  true    2026-05-18T11:09:08Z (x days ago)  2026-05-18T11:09:08Z (x days ago)  ---  94cb7a9c-ab7a-4ead-ac46-48d8836681d2  2026-06-30T01:02:43Z (x days ago)  2026-06-30T01:02:44Z (x days ago)  
        14  5ca3a561-93c7-4ce1-a911-ad9923120381  hana:hdi-shared       70e48010-a730-4e88-b1b0-6fab23adad01  true    2026-06-19T09:38:23Z (x days ago)  2026-06-19T09:38:23Z (x days ago)  ---  46ffeee2-7d4b-4831-82ce-487c4d2cbcfc  2026-06-30T01:02:48Z (x days ago)  2026-06-30T01:02:59Z (x days ago)  
        15  5ca3a561-93c7-4ce1-a911-ad9923120381  objectstore:standard  806ce3f6-dd9c-4196-bb27-a730c7c24c26  true    2026-06-19T09:42:59Z (x days ago)  2026-06-19T09:42:59Z (x days ago)  ---  d70e157f-cd25-46ec-ac92-831699e680bc  2026-06-30T01:02:49Z (x days ago)  2026-06-30T01:02:50Z (x days ago)  
        16  5d5ebba0-e1b9-44c3-989e-f274438c91ec  hana:hdi-shared       e9215dad-0d24-4bb5-a91b-e6e7ef7ed7d9  true    2026-06-08T05:32:39Z (x days ago)  2026-06-08T05:32:39Z (x days ago)  ---  436f54df-0270-4765-97bf-1b380b314c8e  2026-06-30T01:02:46Z (x days ago)  2026-06-30T01:02:57Z (x days ago)  
        17  5d5ebba0-e1b9-44c3-989e-f274438c91ec  objectstore:standard  b5dea6b1-d41e-476c-ba2d-01e277887e7f  true    2026-06-08T05:37:22Z (x days ago)  2026-06-08T05:37:22Z (x days ago)  ---  1f4ab147-db78-48fd-9243-04dc411afc44  2026-06-30T01:02:47Z (x days ago)  2026-06-30T01:02:48Z (x days ago)  
        18  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  hana:hdi-shared       cd0dd852-4045-4bff-82b5-909d0948c6fb  true    2022-04-26T18:05:44Z (x days ago)  2022-04-26T18:05:44Z (x days ago)  ---  3bc942d4-03f9-441a-9fae-1f16b2dc7957  2026-06-30T01:02:01Z (x days ago)  2026-06-30T01:02:11Z (x days ago)  
        19  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  objectstore:standard  61d42c22-f100-419b-83d9-f0d7caeeca57  true    2024-06-26T09:03:37Z (x days ago)  2024-06-26T09:03:37Z (x days ago)  ---  ba448bef-a29c-48fc-b638-596e42420258  2026-06-30T01:02:06Z (x days ago)  2026-06-30T01:02:07Z (x days ago)  
        20  663d2938-be50-44ab-92ca-538855eb594f  hana:hdi-shared       9915f7de-1cbd-447d-a315-35825f68be69  true    2024-09-11T07:33:25Z (x days ago)  2024-09-11T07:33:25Z (x days ago)  ---  ce549ba0-df9e-4c4d-b4c7-57b44aa85126  2026-06-30T01:02:11Z (x days ago)  2026-06-30T01:02:21Z (x days ago)  
        21  663d2938-be50-44ab-92ca-538855eb594f  objectstore:standard  25c4c0ca-a01a-4534-bf34-842fb6e27c71  true    2024-09-11T07:37:20Z (x days ago)  2024-09-11T07:37:20Z (x days ago)  ---  f49fc193-500c-43b2-bf0a-f0058d82521f  2026-06-30T01:02:11Z (x days ago)  2026-06-30T01:02:12Z (x days ago)  
        22  73675fb3-0298-4cf3-8f86-a78c18392193  hana:hdi-shared       852bb033-afab-49d0-b827-4a3f32abe9ba  true    2025-05-22T12:08:28Z (x days ago)  2025-05-22T12:08:28Z (x days ago)  ---  0598c435-88b3-4544-a67a-f3c4845c2571  2026-06-30T01:02:15Z (x days ago)  2026-06-30T01:02:25Z (x days ago)  
        23  73675fb3-0298-4cf3-8f86-a78c18392193  objectstore:standard  66654db4-834b-4ae5-9a53-0e0fbabd42d1  true    2025-05-22T12:12:16Z (x days ago)  2025-05-22T12:12:16Z (x days ago)  ---  423d3f66-6417-44ee-9772-8f6550c8de0d  2026-06-30T01:02:19Z (x days ago)  2026-06-30T01:02:21Z (x days ago)  
        24  79604d57-3933-4a66-81c2-a022413ec11d  hana:hdi-shared       1c61ab20-0ab1-41ce-8ae4-b7269d9513a4  true    2026-01-15T10:43:40Z (x days ago)  2026-01-15T10:43:40Z (x days ago)  ---  8c20f7b1-9801-40ab-a1f5-4617ade19416  2026-06-30T01:02:35Z (x days ago)  2026-06-30T01:02:45Z (x days ago)  
        25  79604d57-3933-4a66-81c2-a022413ec11d  objectstore:standard  411fac3d-9b5c-4fec-93ba-59fbc905c6cf  true    2026-01-15T10:47:52Z (x days ago)  2026-01-15T10:47:52Z (x days ago)  ---  0db54575-12ac-44b6-a035-2610d58425bd  2026-06-30T01:02:36Z (x days ago)  2026-06-30T01:02:37Z (x days ago)  
        26  86ab464d-5770-46b4-b93d-292c1416c453  hana:hdi-shared       2e5b16d4-5379-47b5-a03d-d749777dadae  true    2025-09-23T14:24:15Z (x days ago)  2025-09-23T14:24:15Z (x days ago)  ---  7ddbc0e2-0192-4725-876f-b1ec80885587  2026-06-30T01:02:23Z (x days ago)  2026-06-30T01:02:33Z (x days ago)  
        27  86ab464d-5770-46b4-b93d-292c1416c453  objectstore:standard  54699da7-b092-4e4b-9429-b0df4770c2b2  true    2025-10-29T09:22:49Z (x days ago)  2025-10-29T09:22:49Z (x days ago)  ---  c856b8cb-f6d8-4c7d-8bc8-796a45949876  2026-06-30T01:02:27Z (x days ago)  2026-06-30T01:02:28Z (x days ago)  
        28  899887a3-46a1-4370-b69a-d615f7420f08  hana:hdi-shared       6430d626-937c-47db-a961-e38f52c17ba0  true    2026-05-20T05:23:16Z (x days ago)  2026-05-20T05:23:16Z (x days ago)  ---  a1b03a4e-8cb9-4ae9-9537-aa27686d4fac  2026-06-30T01:02:45Z (x days ago)  2026-06-30T01:02:55Z (x days ago)  
        29  899887a3-46a1-4370-b69a-d615f7420f08  objectstore:standard  7ba9df5d-29c9-42a6-aff1-4dab737e0448  true    2026-05-20T05:27:49Z (x days ago)  2026-05-20T05:27:49Z (x days ago)  ---  bcbb1355-d1fa-4741-aafc-c7da0ac2ba97  2026-06-30T01:02:46Z (x days ago)  2026-06-30T01:02:47Z (x days ago)  
        30  97b55bf7-a906-42ab-9176-3e86762dcdb7  hana:hdi-shared       eaf48f15-7d72-4a5b-8833-96a4b04dba8f  true    2026-03-12T14:50:46Z (x days ago)  2026-03-12T14:50:46Z (x days ago)  ---  302e92bb-e8b7-4ba4-9ecb-9c840ba0f020  2026-06-30T01:02:36Z (x days ago)  2026-06-30T01:02:46Z (x days ago)  
        31  97b55bf7-a906-42ab-9176-3e86762dcdb7  objectstore:standard  db86c471-92f6-458e-973c-a3d2e4329bf9  true    2026-03-12T14:55:10Z (x days ago)  2026-03-12T14:55:10Z (x days ago)  ---  a93dfd31-fc82-4fc4-a984-8e69fc6c8862  2026-06-30T01:02:37Z (x days ago)  2026-06-30T01:02:38Z (x days ago)  
        32  9c418100-6318-4e8a-b4b2-1114f4f44aef  hana:hdi-shared       c1626f78-e2de-47ab-8674-efe747db2fe3  true    2024-11-27T06:50:22Z (x days ago)  2024-11-27T06:50:22Z (x days ago)  ---  82c5f66c-5078-47e9-94ac-1c221e9c49cb  2026-06-30T01:02:11Z (x days ago)  2026-06-30T01:02:21Z (x days ago)  
        33  9c418100-6318-4e8a-b4b2-1114f4f44aef  objectstore:standard  164c212e-b0e9-4ec9-9259-3abbd753cb21  true    2024-11-27T06:54:41Z (x days ago)  2024-11-27T06:54:41Z (x days ago)  ---  8c6bcf01-29ef-4605-9a84-c723479ae35e  2026-06-30T01:02:11Z (x days ago)  2026-06-30T01:02:13Z (x days ago)  
        34  ad91dbba-5c90-436d-8cd8-63b3fb88cf6a  objectstore:standard  500011f3-9dd7-483b-bcc6-b9a87bc27fbe  true    2025-12-11T03:43:21Z (x days ago)  2025-12-11T03:43:21Z (x days ago)  ---  251289a9-35c3-4af9-a14f-46f6bc962474  2026-06-30T01:02:33Z (x days ago)  2026-06-30T01:02:34Z (x days ago)  
        35  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  hana:hdi-shared       8dbac1ec-7127-4bda-86a4-0ff02cfefd8d  true    2024-07-05T11:19:53Z (x days ago)  2024-07-05T11:19:53Z (x days ago)  ---  9e4206f5-65c0-416a-8b5a-8169820a7d91  2026-06-30T01:02:08Z (x days ago)  2026-06-30T01:02:19Z (x days ago)  
        36  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  objectstore:standard  a66e6ae9-72dd-4689-851a-f2b33bfb8ff9  true    2024-07-05T20:24:38Z (x days ago)  2024-07-05T20:24:38Z (x days ago)  ---  70add69b-af18-4729-8036-bbbd21928b3e  2026-06-30T01:02:11Z (x days ago)  2026-06-30T01:02:12Z (x days ago)  
        37  b46f4c09-e46e-432b-b837-0aad96d145f9  objectstore:standard  2240055d-5306-43e7-a0c2-8623eff8e538  true    2025-12-19T02:15:12Z (x days ago)  2025-12-19T02:15:12Z (x days ago)  ---  77116159-0306-423f-877a-e58ad1f3951b  2026-06-30T01:02:33Z (x days ago)  2026-06-30T01:02:35Z (x days ago)  
        38  b46f4c09-e46e-432b-b837-0aad96d145f9  hana:hdi-shared       3e0696d7-6669-40ce-8bde-8eb71b227b15  true    2025-12-22T02:15:53Z (x days ago)  2025-12-22T02:15:53Z (x days ago)  ---  142c8e4b-5fad-4d8e-abcf-f6674cd9272c  2026-06-30T01:02:33Z (x days ago)  2026-06-30T01:02:44Z (x days ago)  
        39  ba22b06c-b55f-4940-ae38-b92a5928c8a5  hana:hdi-shared       67a22c54-b5b7-4b96-bea1-0a2d38999def  true    2025-09-25T10:03:52Z (x days ago)  2025-09-25T10:03:52Z (x days ago)  ---  1aa10e1e-62f8-415e-b3c4-fd8d8a87d48c  2026-06-30T01:02:23Z (x days ago)  2026-06-30T01:02:33Z (x days ago)  
        40  ba22b06c-b55f-4940-ae38-b92a5928c8a5  objectstore:standard  2db8caf7-fcac-4b9d-abf2-38683639d2b1  true    2025-10-29T09:22:49Z (x days ago)  2025-10-29T09:22:49Z (x days ago)  ---  51f18161-10fe-43b3-9853-b99ab95c8979  2026-06-30T01:02:28Z (x days ago)  2026-06-30T01:02:30Z (x days ago)  
        41  be884689-aad4-486e-b556-23fdcf266f6d  hana:hdi-shared       875d3ddf-1ede-41e1-b8af-134e418427a3  true    2024-12-09T03:50:22Z (x days ago)  2024-12-09T03:50:22Z (x days ago)  ---  401a3234-1da9-4310-81ff-8b64a6795a37  2026-06-30T01:02:12Z (x days ago)  2026-06-30T01:02:23Z (x days ago)  
        42  be884689-aad4-486e-b556-23fdcf266f6d  objectstore:standard  f92f8e3e-f813-46b1-9846-c582de2b7982  true    2024-12-09T03:54:45Z (x days ago)  2024-12-09T03:54:45Z (x days ago)  ---  792193d7-454e-445f-828e-c0d52c58d28d  2026-06-30T01:02:12Z (x days ago)  2026-06-30T01:02:14Z (x days ago)  
        43  cb9158ce-f8fd-441b-b443-17219e8f79fa  hana:hdi-shared       42ff43bd-14a7-41f7-b903-259235c1abcb  true    2022-09-05T12:11:41Z (x days ago)  2022-09-05T12:11:41Z (x days ago)  ---  0afaea0b-8979-4f73-8eac-1a970475837e  2026-06-30T01:02:01Z (x days ago)  2026-06-30T01:02:11Z (x days ago)  
        44  cb9158ce-f8fd-441b-b443-17219e8f79fa  objectstore:standard  ce93990a-885f-482b-a3e4-f5b55fa65e77  true    2024-06-21T06:11:31Z (x days ago)  2024-06-21T06:11:31Z (x days ago)  ---  b4636055-3e77-493c-baf8-abf34d700fde  2026-06-30T01:02:02Z (x days ago)  2026-06-30T01:02:04Z (x days ago)  
        45  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  hana:hdi-shared       fe81e5b0-6526-4237-95a4-19268049f779  true    2024-03-19T16:53:23Z (x days ago)  2024-03-19T16:53:23Z (x days ago)  ---  c7250e2c-95e5-4acc-8b19-20ade98fc8d3  2026-06-30T01:02:01Z (x days ago)  2026-06-30T01:02:11Z (x days ago)  
        46  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  objectstore:standard  af9af05c-808b-4ada-a775-6c78854ad466  true    2024-06-19T10:16:54Z (x days ago)  2024-06-19T10:16:54Z (x days ago)  ---  8eb1e868-b7b6-4228-8fd7-5803a7bd7dec  2026-06-30T01:02:01Z (x days ago)  2026-06-30T01:02:02Z (x days ago)  
        47  d91fb749-a148-479f-b29d-71b1b6a9309d  hana:hdi-shared       9e954752-5a2d-45fa-a809-e9707cedf2e5  true    2025-05-22T12:27:03Z (x days ago)  2025-05-22T12:27:03Z (x days ago)  ---  4b8faf64-556f-4537-96e5-b39d88683cde  2026-06-30T01:02:21Z (x days ago)  2026-06-30T01:02:31Z (x days ago)  
        48  d91fb749-a148-479f-b29d-71b1b6a9309d  objectstore:standard  57944233-590b-416d-93fd-399cabcb30b8  true    2025-05-22T12:30:47Z (x days ago)  2025-05-22T12:30:47Z (x days ago)  ---  36eba8db-4f6f-45bc-99f5-a66d9332ad3d  2026-06-30T01:02:21Z (x days ago)  2026-06-30T01:02:23Z (x days ago)  
        49  e0cdfa19-1d01-48b5-bc78-cb4785b20bc6  hana:hdi-shared       9be55a43-72bd-41b5-b33e-3aeb1f432ce0  true    2026-05-19T14:36:04Z (x days ago)  2026-05-19T14:36:04Z (x days ago)  ---  714dbdae-4615-455c-8a56-2d3d53f3e00f  2026-06-30T01:02:44Z (x days ago)  2026-06-30T01:02:54Z (x days ago)  
        50  e0cdfa19-1d01-48b5-bc78-cb4785b20bc6  objectstore:standard  6c0e4f10-5c61-4830-8ac2-2be2d8947747  true    2026-05-19T14:40:28Z (x days ago)  2026-05-19T14:40:28Z (x days ago)  ---  f424e51f-2e75-4c12-bcf8-fcca3253ab49  2026-06-30T01:02:44Z (x days ago)  2026-06-30T01:02:46Z (x days ago)  
        51  ed99fc2a-b367-4fc6-8918-5547e2e655a7  hana:hdi-shared       a56a9023-fe64-43ba-991d-50ed9395f2e8  true    2025-11-27T08:35:57Z (x days ago)  2025-11-27T08:35:57Z (x days ago)  ---  d9b7b53b-2041-44a0-858a-355155ca6a78  2026-06-30T01:02:31Z (x days ago)  2026-06-30T01:02:41Z (x days ago)  
        52  ed99fc2a-b367-4fc6-8918-5547e2e655a7  objectstore:standard  66da3e8b-eee4-456b-8aac-750c797c6d6d  true    2025-11-27T08:40:12Z (x days ago)  2025-11-27T08:40:12Z (x days ago)  ---  8f47c739-f841-4087-8b6d-7b195300a64a  2026-06-30T01:02:31Z (x days ago)  2026-06-30T01:02:33Z (x days ago)  
        53  fe2e319f-68cd-450f-8a02-d726dac64b35  hana:hdi-shared       639793df-096a-470b-8ef1-c7aec9bd048f  true    2025-12-02T12:44:02Z (x days ago)  2025-12-02T12:44:02Z (x days ago)  ---  f40678ea-9039-42fc-a003-8530f5649521  2026-06-30T01:02:32Z (x days ago)  2026-06-30T01:02:42Z (x days ago)  
        54  fe2e319f-68cd-450f-8a02-d726dac64b35  objectstore:standard  9e57fd34-309e-4ce2-9603-8371372d6c80  true    2025-12-02T12:48:39Z (x days ago)  2025-12-02T12:48:39Z (x days ago)  ---  6495c3c5-a9e1-4b52-95d1-5977847bf674  2026-06-30T01:02:33Z (x days ago)  2026-06-30T01:02:34Z (x days ago)  
        55  ffc185ec-3f22-48d5-9940-102ec4e62411  objectstore:standard  12fac650-6d22-4759-bb28-5e23628bbd8b  true    2026-01-15T10:11:57Z (x days ago)  2026-01-15T10:11:57Z (x days ago)  ---  3b5c13b4-d315-4a05-ae51-967fb4258107  2026-06-30T01:02:34Z (x days ago)  2026-06-30T01:02:36Z (x days ago)  
        56  t0                                    hana:hdi-shared       6e96ba0f-d345-43ef-a5be-b7d0de85d58b  true    2023-01-30T20:19:09Z (x days ago)  2023-01-30T20:19:09Z (x days ago)  ---  6b6a252b-fa87-478d-924f-3310557b82d5  2026-06-30T01:02:01Z (x days ago)  2026-06-30T01:02:11Z (x days ago)  "
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
        "tenant_id                             service_plan          instance_id                           usable       binding_id                          
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  hana:hdi-shared       cd0dd852-4045-4bff-82b5-909d0948c6fb  true    ---  3bc942d4-03f9-441a-9fae-1f16b2dc7957
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  objectstore:standard  61d42c22-f100-419b-83d9-f0d7caeeca57  true    ---  ba448bef-a29c-48fc-b638-596e42420258"
      `);
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
        
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_bindings?labels=tenant_id%3D5ecc7413-2b7e-414a-9496-ad4a61f6cccf 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_instances?labels=tenant_id%3D5ecc7413-2b7e-414a-9496-ad4a61f6cccf 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_offerings 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_plans 200 OK (88ms)"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("list filtered timestamps", async () => {
      await nock.back("svm-list-filtered.json", { before: beforeExpandSharedRefs });
      const output = await svm.serviceManagerList(await freshContext(), [testTenantId], [true, false]);
      expect(anonymizeListTimestamps(output)).toMatchInlineSnapshot(`
        "tenant_id                             service_plan          instance_id                           usable  created_on  updated_onbinding_id                            created_on  updated_on
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  hana:hdi-shared       cd0dd852-4045-4bff-82b5-909d0948c6fb  true    2022-04-26T18:05:44Z (x days ago)  2022-04-26T18:05:44Z (x days ago)  ---  3bc942d4-03f9-441a-9fae-1f16b2dc7957  2026-06-30T01:02:01Z (x days ago)  2026-06-30T01:02:11Z (x days ago)  
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  objectstore:standard  61d42c22-f100-419b-83d9-f0d7caeeca57  true    2024-06-26T09:03:37Z (x days ago)  2024-06-26T09:03:37Z (x days ago)  ---  ba448bef-a29c-48fc-b638-596e42420258  2026-06-30T01:02:06Z (x days ago)  2026-06-30T01:02:07Z (x days ago)  "
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
        
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_bindings 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_instances 200 OK (88ms)"
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
        
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_bindings?labels=tenant_id%3D5ecc7413-2b7e-414a-9496-ad4a61f6cccf 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_instances?labels=tenant_id%3D5ecc7413-2b7e-414a-9496-ad4a61f6cccf 200 OK (88ms)"
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

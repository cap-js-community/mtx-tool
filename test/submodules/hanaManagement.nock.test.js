"use strict";

const pathlib = require("path");
const nock = require("nock");

const { resetMakeOneTime } = require("../../src/shared/execution-control");
const { newContext } = require("../../src/context");
const hdi = require("../../src/submodules/hanaManagement");
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

describe("hdi nock tests", () => {
  afterEach(() => {
    LogRequestId.reset();
    resetMakeOneTime(hdi._._getServiceManager);
    resetMakeOneTime(hdi._._getHdiSharedPlanId);
    // eslint-disable-next-line jest/no-standalone-expect
    expect(nock.pendingMocks()).toEqual([]);
    nock.cleanAll();
  });

  test("request count", async () => {
    expect(collectRequestCount(require(`${nock.back.fixtures}/hdi-list.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 24,
        "GET https://service-manager.cfapps.sap.hana.ondemand.com:443": 4,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/hdi-list-filtered.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 24,
        "GET https://service-manager.cfapps.sap.hana.ondemand.com:443": 4,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/hdi-long-list.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 24,
        "GET https://service-manager.cfapps.sap.hana.ondemand.com:443": 4,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/hdi-long-list-filtered.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 24,
        "GET https://service-manager.cfapps.sap.hana.ondemand.com:443": 4,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
  });

  describe("list", () => {
    test("list basic", async () => {
      await nock.back("hdi-list.json", { before: beforeExpandSharedRefs });
      const output = await hdi.hdiList(await freshContext(), [], [false, false]);
      expect(output).toMatchInlineSnapshot(`
        "#   tenant_id                             db_tenant_id                          host                                           schema                                       usable
        1   0de2abab-9030-4524-9940-e5b37ac75d92  ea6bfebc-a2a7-4a0f-b893-c970face3cd6  service-manager-items-16-credentials-host:443  service-manager-items-16-credentials-schema  true  
        2   116b3ac3-6d84-4ed5-81be-0af4464a09b6  56c535b2-bc3a-44f5-96c8-3ae1054f455c  service-manager-items-26-credentials-host:443  service-manager-items-26-credentials-schema  true  
        3   1bbe07b0-4de1-4cdb-830d-49b0ddf20b53  7758e957-e3a9-418f-9e2b-50bd492cefa6  service-manager-items-22-credentials-host:443  service-manager-items-22-credentials-schema  true  
        4   1cc0aa7f-f77e-4038-9ab0-48ae43ed3c7a  1d031371-1b20-4363-b1f9-473d21e6dd2a  service-manager-items-44-credentials-host:443  service-manager-items-44-credentials-schema  true  
        5   4c0909b1-a84e-4763-a26e-532fdb9e40fa  8a633bdf-bd76-43ee-8414-74f8095a05c3  service-manager-items-3-credentials-host:443   service-manager-items-3-credentials-schema   true  
        6   524ffdf2-8174-4b70-bc10-36bf458ab360  a1d78a19-0f96-4ac4-bd31-d532f1d68f92  service-manager-items-45-credentials-host:443  service-manager-items-45-credentials-schema  true  
        7   5ca3a561-93c7-4ce1-a911-ad9923120381  70e48010-a730-4e88-b1b0-6fab23adad01  service-manager-items-54-credentials-host:443  service-manager-items-54-credentials-schema  true  
        8   5d5ebba0-e1b9-44c3-989e-f274438c91ec  e9215dad-0d24-4bb5-a91b-e6e7ef7ed7d9  service-manager-items-51-credentials-host:443  service-manager-items-51-credentials-schema  true  
        9   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  cd0dd852-4045-4bff-82b5-909d0948c6fb  service-manager-items-0-credentials-host:443   service-manager-items-0-credentials-schema   true  
        10  663d2938-be50-44ab-92ca-538855eb594f  9915f7de-1cbd-447d-a315-35825f68be69  service-manager-items-11-credentials-host:443  service-manager-items-11-credentials-schema  true  
        11  73675fb3-0298-4cf3-8f86-a78c18392193  852bb033-afab-49d0-b827-4a3f32abe9ba  service-manager-items-19-credentials-host:443  service-manager-items-19-credentials-schema  true  
        12  79604d57-3933-4a66-81c2-a022413ec11d  1c61ab20-0ab1-41ce-8ae4-b7269d9513a4  service-manager-items-38-credentials-host:443  service-manager-items-38-credentials-schema  true  
        13  86ab464d-5770-46b4-b93d-292c1416c453  2e5b16d4-5379-47b5-a03d-d749777dadae  service-manager-items-24-credentials-host:443  service-manager-items-24-credentials-schema  true  
        14  899887a3-46a1-4370-b69a-d615f7420f08  6430d626-937c-47db-a961-e38f52c17ba0  service-manager-items-49-credentials-host:443  service-manager-items-49-credentials-schema  true  
        15  97b55bf7-a906-42ab-9176-3e86762dcdb7  eaf48f15-7d72-4a5b-8833-96a4b04dba8f  service-manager-items-41-credentials-host:443  service-manager-items-41-credentials-schema  true  
        16  9c418100-6318-4e8a-b4b2-1114f4f44aef  c1626f78-e2de-47ab-8674-efe747db2fe3  service-manager-items-10-credentials-host:443  service-manager-items-10-credentials-schema  true  
        17  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  8dbac1ec-7127-4bda-86a4-0ff02cfefd8d  service-manager-items-9-credentials-host:443   service-manager-items-9-credentials-schema   true  
        18  b46f4c09-e46e-432b-b837-0aad96d145f9  3e0696d7-6669-40ce-8bde-8eb71b227b15  service-manager-items-34-credentials-host:443  service-manager-items-34-credentials-schema  true  
        19  ba22b06c-b55f-4940-ae38-b92a5928c8a5  67a22c54-b5b7-4b96-bea1-0a2d38999def  service-manager-items-25-credentials-host:443  service-manager-items-25-credentials-schema  true  
        20  be884689-aad4-486e-b556-23fdcf266f6d  875d3ddf-1ede-41e1-b8af-134e418427a3  service-manager-items-14-credentials-host:443  service-manager-items-14-credentials-schema  true  
        21  cb9158ce-f8fd-441b-b443-17219e8f79fa  42ff43bd-14a7-41f7-b903-259235c1abcb  service-manager-items-1-credentials-host:443   service-manager-items-1-credentials-schema   true  
        22  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  fe81e5b0-6526-4237-95a4-19268049f779  service-manager-items-2-credentials-host:443   service-manager-items-2-credentials-schema   true  
        23  d91fb749-a148-479f-b29d-71b1b6a9309d  9e954752-5a2d-45fa-a809-e9707cedf2e5  service-manager-items-21-credentials-host:443  service-manager-items-21-credentials-schema  true  
        24  e0cdfa19-1d01-48b5-bc78-cb4785b20bc6  9be55a43-72bd-41b5-b33e-3aeb1f432ce0  service-manager-items-47-credentials-host:443  service-manager-items-47-credentials-schema  true  
        25  ed99fc2a-b367-4fc6-8918-5547e2e655a7  a56a9023-fe64-43ba-991d-50ed9395f2e8  service-manager-items-31-credentials-host:443  service-manager-items-31-credentials-schema  true  
        26  fe2e319f-68cd-450f-8a02-d726dac64b35  639793df-096a-470b-8ef1-c7aec9bd048f  service-manager-items-32-credentials-host:443  service-manager-items-32-credentials-schema  true  
        27  t0                                    6e96ba0f-d345-43ef-a5be-b7d0de85d58b  service-manager-items-4-credentials-host:443   service-manager-items-4-credentials-schema   true  "
      `);
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
        
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_bindings 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_instances?service_plan_id=1b702f36-bd66-4fad-b4d8-75cf0a0b8347 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_offerings?name=hana 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_plans?service_offering_id=8c3922c9-fcbd-469e-9393-2d941400f2c1&name=hdi-shared 200 OK (88ms)"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("list timestamps", async () => {
      await nock.back("hdi-list.json", { before: beforeExpandSharedRefs });
      const output = await hdi.hdiList(await freshContext(), [], [true, false]);
      expect(anonymizeListTimestamps(output)).toMatchInlineSnapshot(`
        "#   tenant_id                             db_tenant_id                          host                                           schema                                       usable  created_on  updated_on
        1   0de2abab-9030-4524-9940-e5b37ac75d92  ea6bfebc-a2a7-4a0f-b893-c970face3cd6  service-manager-items-16-credentials-host:443  service-manager-items-16-credentials-schema  true    2025-04-04T07:45:52Z (x days ago)  2025-04-04T07:45:52Z (x days ago)  
        2   116b3ac3-6d84-4ed5-81be-0af4464a09b6  56c535b2-bc3a-44f5-96c8-3ae1054f455c  service-manager-items-26-credentials-host:443  service-manager-items-26-credentials-schema  true    2025-10-27T13:43:30Z (x days ago)  2025-10-27T13:43:30Z (x days ago)  
        3   1bbe07b0-4de1-4cdb-830d-49b0ddf20b53  7758e957-e3a9-418f-9e2b-50bd492cefa6  service-manager-items-22-credentials-host:443  service-manager-items-22-credentials-schema  true    2025-09-19T08:54:05Z (x days ago)  2025-09-19T08:54:05Z (x days ago)  
        4   1cc0aa7f-f77e-4038-9ab0-48ae43ed3c7a  1d031371-1b20-4363-b1f9-473d21e6dd2a  service-manager-items-44-credentials-host:443  service-manager-items-44-credentials-schema  true    2026-04-17T16:18:11Z (x days ago)  2026-04-17T16:18:11Z (x days ago)  
        5   4c0909b1-a84e-4763-a26e-532fdb9e40fa  8a633bdf-bd76-43ee-8414-74f8095a05c3  service-manager-items-3-credentials-host:443   service-manager-items-3-credentials-schema   true    2023-09-05T14:19:48Z (x days ago)  2023-09-05T14:19:48Z (x days ago)  
        6   524ffdf2-8174-4b70-bc10-36bf458ab360  a1d78a19-0f96-4ac4-bd31-d532f1d68f92  service-manager-items-45-credentials-host:443  service-manager-items-45-credentials-schema  true    2026-05-18T11:04:24Z (x days ago)  2026-05-18T11:04:24Z (x days ago)  
        7   5ca3a561-93c7-4ce1-a911-ad9923120381  70e48010-a730-4e88-b1b0-6fab23adad01  service-manager-items-54-credentials-host:443  service-manager-items-54-credentials-schema  true    2026-06-19T09:38:23Z (x days ago)  2026-06-19T09:38:23Z (x days ago)  
        8   5d5ebba0-e1b9-44c3-989e-f274438c91ec  e9215dad-0d24-4bb5-a91b-e6e7ef7ed7d9  service-manager-items-51-credentials-host:443  service-manager-items-51-credentials-schema  true    2026-06-08T05:32:39Z (x days ago)  2026-06-08T05:32:39Z (x days ago)  
        9   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  cd0dd852-4045-4bff-82b5-909d0948c6fb  service-manager-items-0-credentials-host:443   service-manager-items-0-credentials-schema   true    2022-04-26T18:05:44Z (x days ago)  2022-04-26T18:05:44Z (x days ago)  
        10  663d2938-be50-44ab-92ca-538855eb594f  9915f7de-1cbd-447d-a315-35825f68be69  service-manager-items-11-credentials-host:443  service-manager-items-11-credentials-schema  true    2024-09-11T07:33:25Z (x days ago)  2024-09-11T07:33:25Z (x days ago)  
        11  73675fb3-0298-4cf3-8f86-a78c18392193  852bb033-afab-49d0-b827-4a3f32abe9ba  service-manager-items-19-credentials-host:443  service-manager-items-19-credentials-schema  true    2025-05-22T12:08:28Z (x days ago)  2025-05-22T12:08:28Z (x days ago)  
        12  79604d57-3933-4a66-81c2-a022413ec11d  1c61ab20-0ab1-41ce-8ae4-b7269d9513a4  service-manager-items-38-credentials-host:443  service-manager-items-38-credentials-schema  true    2026-01-15T10:43:40Z (x days ago)  2026-01-15T10:43:40Z (x days ago)  
        13  86ab464d-5770-46b4-b93d-292c1416c453  2e5b16d4-5379-47b5-a03d-d749777dadae  service-manager-items-24-credentials-host:443  service-manager-items-24-credentials-schema  true    2025-09-23T14:24:15Z (x days ago)  2025-09-23T14:24:15Z (x days ago)  
        14  899887a3-46a1-4370-b69a-d615f7420f08  6430d626-937c-47db-a961-e38f52c17ba0  service-manager-items-49-credentials-host:443  service-manager-items-49-credentials-schema  true    2026-05-20T05:23:16Z (x days ago)  2026-05-20T05:23:16Z (x days ago)  
        15  97b55bf7-a906-42ab-9176-3e86762dcdb7  eaf48f15-7d72-4a5b-8833-96a4b04dba8f  service-manager-items-41-credentials-host:443  service-manager-items-41-credentials-schema  true    2026-03-12T14:50:46Z (x days ago)  2026-03-12T14:50:46Z (x days ago)  
        16  9c418100-6318-4e8a-b4b2-1114f4f44aef  c1626f78-e2de-47ab-8674-efe747db2fe3  service-manager-items-10-credentials-host:443  service-manager-items-10-credentials-schema  true    2024-11-27T06:50:22Z (x days ago)  2024-11-27T06:50:22Z (x days ago)  
        17  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  8dbac1ec-7127-4bda-86a4-0ff02cfefd8d  service-manager-items-9-credentials-host:443   service-manager-items-9-credentials-schema   true    2024-07-05T11:19:53Z (x days ago)  2024-07-05T11:19:53Z (x days ago)  
        18  b46f4c09-e46e-432b-b837-0aad96d145f9  3e0696d7-6669-40ce-8bde-8eb71b227b15  service-manager-items-34-credentials-host:443  service-manager-items-34-credentials-schema  true    2025-12-22T02:15:53Z (x days ago)  2025-12-22T02:15:53Z (x days ago)  
        19  ba22b06c-b55f-4940-ae38-b92a5928c8a5  67a22c54-b5b7-4b96-bea1-0a2d38999def  service-manager-items-25-credentials-host:443  service-manager-items-25-credentials-schema  true    2025-09-25T10:03:52Z (x days ago)  2025-09-25T10:03:52Z (x days ago)  
        20  be884689-aad4-486e-b556-23fdcf266f6d  875d3ddf-1ede-41e1-b8af-134e418427a3  service-manager-items-14-credentials-host:443  service-manager-items-14-credentials-schema  true    2024-12-09T03:50:22Z (x days ago)  2024-12-09T03:50:22Z (x days ago)  
        21  cb9158ce-f8fd-441b-b443-17219e8f79fa  42ff43bd-14a7-41f7-b903-259235c1abcb  service-manager-items-1-credentials-host:443   service-manager-items-1-credentials-schema   true    2022-09-05T12:11:41Z (x days ago)  2022-09-05T12:11:41Z (x days ago)  
        22  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  fe81e5b0-6526-4237-95a4-19268049f779  service-manager-items-2-credentials-host:443   service-manager-items-2-credentials-schema   true    2024-03-19T16:53:23Z (x days ago)  2024-03-19T16:53:23Z (x days ago)  
        23  d91fb749-a148-479f-b29d-71b1b6a9309d  9e954752-5a2d-45fa-a809-e9707cedf2e5  service-manager-items-21-credentials-host:443  service-manager-items-21-credentials-schema  true    2025-05-22T12:27:03Z (x days ago)  2025-05-22T12:27:03Z (x days ago)  
        24  e0cdfa19-1d01-48b5-bc78-cb4785b20bc6  9be55a43-72bd-41b5-b33e-3aeb1f432ce0  service-manager-items-47-credentials-host:443  service-manager-items-47-credentials-schema  true    2026-05-19T14:36:04Z (x days ago)  2026-05-19T14:36:04Z (x days ago)  
        25  ed99fc2a-b367-4fc6-8918-5547e2e655a7  a56a9023-fe64-43ba-991d-50ed9395f2e8  service-manager-items-31-credentials-host:443  service-manager-items-31-credentials-schema  true    2025-11-27T08:35:57Z (x days ago)  2025-11-27T08:35:57Z (x days ago)  
        26  fe2e319f-68cd-450f-8a02-d726dac64b35  639793df-096a-470b-8ef1-c7aec9bd048f  service-manager-items-32-credentials-host:443  service-manager-items-32-credentials-schema  true    2025-12-02T12:44:02Z (x days ago)  2025-12-02T12:44:02Z (x days ago)  
        27  t0                                    6e96ba0f-d345-43ef-a5be-b7d0de85d58b  service-manager-items-4-credentials-host:443   service-manager-items-4-credentials-schema   true    2023-01-30T20:19:09Z (x days ago)  2023-01-30T20:19:09Z (x days ago)  "
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("list json", async () => {
      await nock.back("hdi-list.json", { before: beforeExpandSharedRefs });
      const output = await hdi.hdiList(await freshContext(), [], [true, true]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("list filtered basic", async () => {
      await nock.back("hdi-list-filtered.json", { before: beforeExpandSharedRefs });
      const output = await hdi.hdiList(await freshContext(), [testTenantId], [false, false]);
      expect(output).toMatchInlineSnapshot(`
        "tenant_id                             db_tenant_id                          host                                          schema                                      usable
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  cd0dd852-4045-4bff-82b5-909d0948c6fb  service-manager-items-0-credentials-host:443  service-manager-items-0-credentials-schema  true  "
      `);
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
        
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_bindings?labels=tenant_id%3D5ecc7413-2b7e-414a-9496-ad4a61f6cccf 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_instances?service_plan_id=1b702f36-bd66-4fad-b4d8-75cf0a0b8347&labels=tenant_id%3D5ecc7413-2b7e-414a-9496-ad4a61f6cccf 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_offerings?name=hana 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_plans?service_offering_id=8c3922c9-fcbd-469e-9393-2d941400f2c1&name=hdi-shared 200 OK (88ms)"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("list filtered timestamps", async () => {
      await nock.back("hdi-list-filtered.json", { before: beforeExpandSharedRefs });
      const output = await hdi.hdiList(await freshContext(), [testTenantId], [true, false]);
      expect(anonymizeListTimestamps(output)).toMatchInlineSnapshot(`
        "tenant_id                             db_tenant_id                          host                                          schema                                      usable  created_on  updated_on
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  cd0dd852-4045-4bff-82b5-909d0948c6fb  service-manager-items-0-credentials-host:443  service-manager-items-0-credentials-schema  true    2022-04-26T18:05:44Z (x days ago)  2022-04-26T18:05:44Z (x days ago)  "
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("list filtered json", async () => {
      await nock.back("hdi-list-filtered.json", { before: beforeExpandSharedRefs });
      const output = await hdi.hdiList(await freshContext(), [testTenantId], [true, true]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });
  });

  describe("long list", () => {
    test("long list basic", async () => {
      await nock.back("hdi-long-list.json", { before: beforeExpandSharedRefs });
      const output = await hdi.hdiLongList(await freshContext(), [], [false, false]);
      expect(output).toMatchSnapshot();
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
        
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_bindings 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_instances?service_plan_id=1b702f36-bd66-4fad-b4d8-75cf0a0b8347 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_offerings?name=hana 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_plans?service_offering_id=8c3922c9-fcbd-469e-9393-2d941400f2c1&name=hdi-shared 200 OK (88ms)"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("long list revealed", async () => {
      await nock.back("hdi-long-list.json", { before: beforeExpandSharedRefs });
      const output = await hdi.hdiLongList(await freshContext(), [], [false, true]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("long list json", async () => {
      await nock.back("hdi-long-list.json", { before: beforeExpandSharedRefs });
      const output = await hdi.hdiLongList(await freshContext(), [], [true, true]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("long list filtered basic", async () => {
      await nock.back("hdi-long-list-filtered.json", { before: beforeExpandSharedRefs });
      const output = await hdi.hdiLongList(await freshContext(), [testTenantId], [false, false]);
      expect(output).toMatchSnapshot();
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
        
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_bindings?labels=tenant_id%3D5ecc7413-2b7e-414a-9496-ad4a61f6cccf 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_instances?service_plan_id=1b702f36-bd66-4fad-b4d8-75cf0a0b8347&labels=tenant_id%3D5ecc7413-2b7e-414a-9496-ad4a61f6cccf 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_offerings?name=hana 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v2/service_plans?service_offering_id=8c3922c9-fcbd-469e-9393-2d941400f2c1&name=hdi-shared 200 OK (88ms)"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("long list filtered revealed", async () => {
      await nock.back("hdi-long-list-filtered.json", { before: beforeExpandSharedRefs });
      const output = await hdi.hdiLongList(await freshContext(), [testTenantId], [false, true]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("long list filtered json", async () => {
      await nock.back("hdi-long-list-filtered.json", { before: beforeExpandSharedRefs });
      const output = await hdi.hdiLongList(await freshContext(), [testTenantId], [true, true]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });
  });
});

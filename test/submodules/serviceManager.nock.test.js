"use strict";

const pathlib = require("path");
const nock = require("nock");

const { newContext } = require("../../src/context");
const svm = require("../../src/submodules/serviceManager");
const { outputFromLoggerPartitionFetch, anonymizeListTimestamps, collectRequestCount } = require("../test-util/static");

nock.back.fixtures = pathlib.resolve(`${__dirname}/../../test-nock-record/__nock-fixtures__`);
nock.back.setMode("lockdown");

jest.mock("../../src/shared/static", () => require("../__mocks/sharedNockPlayback/static"));

const { Logger: MockLogger } = require("../../src/shared/logger");
const mockLogger = MockLogger.getInstance();
jest.mock("../../src/shared/logger", () => require("../__mocks/shared/logger"));

const testTenantId = "5ecc7413-2b7e-414a-9496-ad4a61f6cccf";

const freshContext = async () => await newContext({ usePersistedCache: false, isReadonlyCommand: false });

describe("svm nock tests", () => {
  afterEach(() => {
    svm._._reset();
    nock.restore();
  });

  test("request count", async () => {
    expect(collectRequestCount(require(`${nock.back.fixtures}/svm-list.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 5,
        "GET https://service-manager.cfapps.sap.hana.ondemand.com:443": 4,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/svm-list-filtered.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 5,
        "GET https://service-manager.cfapps.sap.hana.ondemand.com:443": 4,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/svm-long-list.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 5,
        "GET https://service-manager.cfapps.sap.hana.ondemand.com:443": 4,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/svm-long-list-filtered.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 5,
        "GET https://service-manager.cfapps.sap.hana.ondemand.com:443": 4,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
  });

  describe("list", () => {
    test("list basic", async () => {
      await nock.back("svm-list.json");
      const output = await svm.serviceManagerList(await freshContext(), [], [false, false]);
      expect(output).toMatchInlineSnapshot(`
        "#   tenant_id                             service_plan          instance_id                           ready       binding_id                            ready
        1   0de2abab-9030-4524-9940-e5b37ac75d92  hana:hdi-shared       ea6bfebc-a2a7-4a0f-b893-c970face3cd6  true   ---  5fdf130c-d3bb-431a-a3f2-55b3e0b0fdb7  true 
        2   0de2abab-9030-4524-9940-e5b37ac75d92  objectstore:standard  899f36fe-1bf3-4d95-8ae3-cdd4722c2832  true   ---  5092e27f-e837-4e1b-b681-5e1bc1275e85  true 
        3   4c0909b1-a84e-4763-a26e-532fdb9e40fa  hana:hdi-shared       8a633bdf-bd76-43ee-8414-74f8095a05c3  true   ---  39d0c7d7-b444-4f59-899c-425533bd91bb  true 
        4   4c0909b1-a84e-4763-a26e-532fdb9e40fa  objectstore:standard  ca87508f-b17a-4f9e-84c5-8b974eec9488  true   ---  5c16bdc3-0b84-46af-81b1-ba384f6038d8  true 
        5   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  hana:hdi-shared       cd0dd852-4045-4bff-82b5-909d0948c6fb  true   ---  6c8c6ec8-669d-4353-b991-b191363ec918  true 
        6   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  objectstore:standard  61d42c22-f100-419b-83d9-f0d7caeeca57  true   ---  d0f5c5f2-55d2-46ef-9c00-0de11e8ca5f3  true 
        7   663d2938-be50-44ab-92ca-538855eb594f  hana:hdi-shared       9915f7de-1cbd-447d-a315-35825f68be69  true   ---  67ece526-e010-4e39-b5d3-64f93a55d991  true 
        8   663d2938-be50-44ab-92ca-538855eb594f  objectstore:standard  25c4c0ca-a01a-4534-bf34-842fb6e27c71  true   ---  0dd631e5-d24e-47c2-a02b-96117888daa9  true 
        9   6917dfd6-7590-4033-af2a-140b75263b0d  hana:hdi-shared       1ca8835a-b286-4458-867a-ef9391b9c9d1  true   ---  6d330674-bbf9-4da7-a47f-7e2762da2e89  true 
        10  6917dfd6-7590-4033-af2a-140b75263b0d  objectstore:standard  63573bae-79f2-4026-ba58-61f3503282a2  true   ---  fb5f4410-1fdf-4bc9-bff1-8f001062f7f5  true 
        11  6a067783-ea1b-4dab-a368-ce0657e17a92  hana:hdi-shared       4749d53e-57b5-4ff6-9c4f-549b046ffbfb  true   ---  e5d40f16-6437-4c4c-b1dd-db103cd2911c  true 
        12  6a067783-ea1b-4dab-a368-ce0657e17a92  objectstore:standard  547acf7f-9b5e-4ac7-ac16-34de713a4b16  true   ---  b1dd64f3-6488-4725-bf28-eec8c63c090c  true 
        13  73675fb3-0298-4cf3-8f86-a78c18392193  hana:hdi-shared       852bb033-afab-49d0-b827-4a3f32abe9ba  true   ---  aa5e94b4-5acd-4699-9b8a-ef19904cc060  true 
        14  73675fb3-0298-4cf3-8f86-a78c18392193  objectstore:standard  66654db4-834b-4ae5-9a53-0e0fbabd42d1  true   ---  53251797-1a41-4069-aa5b-2c92e4332284  true 
        15  9c418100-6318-4e8a-b4b2-1114f4f44aef  hana:hdi-shared       c1626f78-e2de-47ab-8674-efe747db2fe3  true   ---  d1087a8b-e2e6-4b6a-9479-7b85118d7acc  true 
        16  9c418100-6318-4e8a-b4b2-1114f4f44aef  objectstore:standard  164c212e-b0e9-4ec9-9259-3abbd753cb21  true   ---  e1a18d6f-c2d9-49cc-ac2b-d00a2ac9d6ab  true 
        17  a1c320ff-b7f8-48d8-a20d-b44e92f69e65  hana:hdi-shared       c1654fd6-fd1c-4953-92a8-eda4bbdf8b6d  true   ---  22774038-9265-4917-bab8-0c479b54845e  true 
        18  a1c320ff-b7f8-48d8-a20d-b44e92f69e65  objectstore:standard  2b9e0e64-a9da-49f3-bb4f-e3d1dfcbab93  true   ---  561a7505-8e46-4e52-bb9f-84b7fea3fa7e  true 
        19  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  hana:hdi-shared       8dbac1ec-7127-4bda-86a4-0ff02cfefd8d  true   ---  6229defe-ade0-4792-95d9-db944033d5be  true 
        20  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  objectstore:standard  a66e6ae9-72dd-4689-851a-f2b33bfb8ff9  true   ---  cd89575d-b1c9-4c03-9566-efb7375958e4  true 
        21  be884689-aad4-486e-b556-23fdcf266f6d  hana:hdi-shared       875d3ddf-1ede-41e1-b8af-134e418427a3  true   ---  15e52f40-95d2-4186-a75b-0f49ff5c9060  true 
        22  be884689-aad4-486e-b556-23fdcf266f6d  objectstore:standard  f92f8e3e-f813-46b1-9846-c582de2b7982  true   ---  2fb7bd46-9180-41f2-8b44-e1f19734779f  true 
        23  cb9158ce-f8fd-441b-b443-17219e8f79fa  hana:hdi-shared       42ff43bd-14a7-41f7-b903-259235c1abcb  true   ---  50a07db9-da3b-4ec5-8545-521c06bf244c  true 
        24  cb9158ce-f8fd-441b-b443-17219e8f79fa  objectstore:standard  ce93990a-885f-482b-a3e4-f5b55fa65e77  true   ---  c1c3a027-31e0-435c-bf57-3743a8411b17  true 
        25  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  hana:hdi-shared       fe81e5b0-6526-4237-95a4-19268049f779  true   ---  25d85ee0-a9d5-42be-a1e9-b58dbc81b85b  true 
        26  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  objectstore:standard  af9af05c-808b-4ada-a775-6c78854ad466  true   ---  bc107798-3369-4472-a311-8d332231dd2a  true 
        27  d91fb749-a148-479f-b29d-71b1b6a9309d  hana:hdi-shared       9e954752-5a2d-45fa-a809-e9707cedf2e5  true   ---  7efbe76d-04d5-44be-abcf-fdaa3f34de26  true 
        28  d91fb749-a148-479f-b29d-71b1b6a9309d  objectstore:standard  57944233-590b-416d-93fd-399cabcb30b8  true   ---  4a37ea17-4d9f-40e2-9b8a-89ec5694ee82  true 
        29  dde70ec5-983d-4848-b50c-fb2cdac7d359  hana:hdi-shared       c08efd29-58bf-428c-97c3-e0028a1f2c31  true   ---  fca37521-d305-45bc-898b-9d45f872b180  true 
        30  dde70ec5-983d-4848-b50c-fb2cdac7d359  objectstore:standard  ed30757e-d140-4441-87e8-fc2cb9c1298d  true   ---  2cd90a2b-d0f3-46cc-9319-e5d98a14ef6a  true 
        31  t0                                    hana:hdi-shared       6e96ba0f-d345-43ef-a5be-b7d0de85d58b  true   ---  cd46a818-714b-4f58-8517-9a5265a7a7f7  true "
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
      await nock.back("svm-list.json");
      const output = await svm.serviceManagerList(await freshContext(), [], [true, false]);
      expect(anonymizeListTimestamps(output)).toMatchInlineSnapshot(`
        "#   tenant_id                             service_plan          instance_id                           ready  created_on  updated_onbinding_id                            ready  created_on  updated_on
        1   0de2abab-9030-4524-9940-e5b37ac75d92  hana:hdi-shared       ea6bfebc-a2a7-4a0f-b893-c970face3cd6  true   2025-04-04T07:45:52Z (x days ago)  2025-04-04T07:46:02Z (x days ago)  ---  5fdf130c-d3bb-431a-a3f2-55b3e0b0fdb7  true   2025-04-04T07:46:04Z (x days ago)  2025-04-04T07:46:15Z (x days ago)  
        2   0de2abab-9030-4524-9940-e5b37ac75d92  objectstore:standard  899f36fe-1bf3-4d95-8ae3-cdd4722c2832  true   2025-04-04T07:49:33Z (x days ago)  2025-04-04T07:50:09Z (x days ago)  ---  5092e27f-e837-4e1b-b681-5e1bc1275e85  true   2025-06-04T19:48:57Z (x days ago)  2025-06-04T19:48:58Z (x days ago)  
        3   4c0909b1-a84e-4763-a26e-532fdb9e40fa  hana:hdi-shared       8a633bdf-bd76-43ee-8414-74f8095a05c3  true   2023-09-05T14:19:48Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  ---  39d0c7d7-b444-4f59-899c-425533bd91bb  true   2024-02-07T11:37:49Z (x days ago)  2024-02-07T11:37:59Z (x days ago)  
        4   4c0909b1-a84e-4763-a26e-532fdb9e40fa  objectstore:standard  ca87508f-b17a-4f9e-84c5-8b974eec9488  true   2024-06-21T06:50:45Z (x days ago)  2024-07-12T20:16:51Z (x days ago)  ---  5c16bdc3-0b84-46af-81b1-ba384f6038d8  true   2025-06-04T19:48:51Z (x days ago)  2025-06-04T19:48:53Z (x days ago)  
        5   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  hana:hdi-shared       cd0dd852-4045-4bff-82b5-909d0948c6fb  true   2022-04-26T18:05:44Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  ---  6c8c6ec8-669d-4353-b991-b191363ec918  true   2024-02-15T09:29:17Z (x days ago)  2024-02-15T09:29:27Z (x days ago)  
        6   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  objectstore:standard  61d42c22-f100-419b-83d9-f0d7caeeca57  true   2024-06-26T09:03:37Z (x days ago)  2024-07-12T20:15:50Z (x days ago)  ---  d0f5c5f2-55d2-46ef-9c00-0de11e8ca5f3  true   2025-06-04T19:48:51Z (x days ago)  2025-06-04T19:48:53Z (x days ago)  
        7   663d2938-be50-44ab-92ca-538855eb594f  hana:hdi-shared       9915f7de-1cbd-447d-a315-35825f68be69  true   2024-09-11T07:33:25Z (x days ago)  2024-09-11T07:33:35Z (x days ago)  ---  67ece526-e010-4e39-b5d3-64f93a55d991  true   2024-09-11T07:33:37Z (x days ago)  2024-09-11T07:33:48Z (x days ago)  
        8   663d2938-be50-44ab-92ca-538855eb594f  objectstore:standard  25c4c0ca-a01a-4534-bf34-842fb6e27c71  true   2024-09-11T07:37:20Z (x days ago)  2024-09-11T07:37:56Z (x days ago)  ---  0dd631e5-d24e-47c2-a02b-96117888daa9  true   2025-06-04T19:48:54Z (x days ago)  2025-06-04T19:48:55Z (x days ago)  
        9   6917dfd6-7590-4033-af2a-140b75263b0d  hana:hdi-shared       1ca8835a-b286-4458-867a-ef9391b9c9d1  true   2024-06-26T10:26:33Z (x days ago)  2024-09-06T06:20:04Z (x days ago)  ---  6d330674-bbf9-4da7-a47f-7e2762da2e89  true   2024-09-06T06:29:42Z (x days ago)  2024-09-06T06:29:52Z (x days ago)  
        10  6917dfd6-7590-4033-af2a-140b75263b0d  objectstore:standard  63573bae-79f2-4026-ba58-61f3503282a2  true   2025-03-18T07:15:38Z (x days ago)  2025-03-18T07:16:14Z (x days ago)  ---  fb5f4410-1fdf-4bc9-bff1-8f001062f7f5  true   2025-06-04T19:48:57Z (x days ago)  2025-06-04T19:48:58Z (x days ago)  
        11  6a067783-ea1b-4dab-a368-ce0657e17a92  hana:hdi-shared       4749d53e-57b5-4ff6-9c4f-549b046ffbfb  true   2025-01-17T07:27:43Z (x days ago)  2025-01-17T07:27:53Z (x days ago)  ---  e5d40f16-6437-4c4c-b1dd-db103cd2911c  true   2025-01-17T07:27:55Z (x days ago)  2025-01-17T07:28:05Z (x days ago)  
        12  6a067783-ea1b-4dab-a368-ce0657e17a92  objectstore:standard  547acf7f-9b5e-4ac7-ac16-34de713a4b16  true   2025-01-17T07:31:50Z (x days ago)  2025-01-17T07:32:26Z (x days ago)  ---  b1dd64f3-6488-4725-bf28-eec8c63c090c  true   2025-06-04T19:48:55Z (x days ago)  2025-06-04T19:48:56Z (x days ago)  
        13  73675fb3-0298-4cf3-8f86-a78c18392193  hana:hdi-shared       852bb033-afab-49d0-b827-4a3f32abe9ba  true   2025-05-22T12:08:28Z (x days ago)  2025-05-22T12:08:38Z (x days ago)  ---  aa5e94b4-5acd-4699-9b8a-ef19904cc060  true   2025-05-22T12:08:40Z (x days ago)  2025-05-22T12:08:51Z (x days ago)  
        14  73675fb3-0298-4cf3-8f86-a78c18392193  objectstore:standard  66654db4-834b-4ae5-9a53-0e0fbabd42d1  true   2025-05-22T12:12:16Z (x days ago)  2025-05-22T12:12:52Z (x days ago)  ---  53251797-1a41-4069-aa5b-2c92e4332284  true   2025-06-04T19:48:57Z (x days ago)  2025-06-04T19:48:58Z (x days ago)  
        15  9c418100-6318-4e8a-b4b2-1114f4f44aef  hana:hdi-shared       c1626f78-e2de-47ab-8674-efe747db2fe3  true   2024-11-27T06:50:22Z (x days ago)  2024-11-27T06:50:32Z (x days ago)  ---  d1087a8b-e2e6-4b6a-9479-7b85118d7acc  true   2024-11-27T06:50:34Z (x days ago)  2024-11-27T06:50:44Z (x days ago)  
        16  9c418100-6318-4e8a-b4b2-1114f4f44aef  objectstore:standard  164c212e-b0e9-4ec9-9259-3abbd753cb21  true   2024-11-27T06:54:41Z (x days ago)  2024-11-27T06:55:17Z (x days ago)  ---  e1a18d6f-c2d9-49cc-ac2b-d00a2ac9d6ab  true   2025-06-04T19:48:54Z (x days ago)  2025-06-04T19:48:55Z (x days ago)  
        17  a1c320ff-b7f8-48d8-a20d-b44e92f69e65  hana:hdi-shared       c1654fd6-fd1c-4953-92a8-eda4bbdf8b6d  true   2025-01-29T08:00:40Z (x days ago)  2025-01-29T08:00:51Z (x days ago)  ---  22774038-9265-4917-bab8-0c479b54845e  true   2025-01-29T08:00:53Z (x days ago)  2025-01-29T08:01:03Z (x days ago)  
        18  a1c320ff-b7f8-48d8-a20d-b44e92f69e65  objectstore:standard  2b9e0e64-a9da-49f3-bb4f-e3d1dfcbab93  true   2025-01-29T08:04:39Z (x days ago)  2025-01-29T08:05:15Z (x days ago)  ---  561a7505-8e46-4e52-bb9f-84b7fea3fa7e  true   2025-06-04T19:48:56Z (x days ago)  2025-06-04T19:48:58Z (x days ago)  
        19  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  hana:hdi-shared       8dbac1ec-7127-4bda-86a4-0ff02cfefd8d  true   2024-07-05T11:19:53Z (x days ago)  2024-07-05T11:20:04Z (x days ago)  ---  6229defe-ade0-4792-95d9-db944033d5be  true   2024-07-05T11:20:06Z (x days ago)  2024-07-05T11:20:16Z (x days ago)  
        20  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  objectstore:standard  a66e6ae9-72dd-4689-851a-f2b33bfb8ff9  true   2024-07-05T20:24:38Z (x days ago)  2024-07-12T20:17:23Z (x days ago)  ---  cd89575d-b1c9-4c03-9566-efb7375958e4  true   2025-06-04T19:48:51Z (x days ago)  2025-06-04T19:48:53Z (x days ago)  
        21  be884689-aad4-486e-b556-23fdcf266f6d  hana:hdi-shared       875d3ddf-1ede-41e1-b8af-134e418427a3  true   2024-12-09T03:50:22Z (x days ago)  2024-12-09T03:50:32Z (x days ago)  ---  15e52f40-95d2-4186-a75b-0f49ff5c9060  true   2024-12-09T03:50:34Z (x days ago)  2024-12-09T03:50:44Z (x days ago)  
        22  be884689-aad4-486e-b556-23fdcf266f6d  objectstore:standard  f92f8e3e-f813-46b1-9846-c582de2b7982  true   2024-12-09T03:54:45Z (x days ago)  2024-12-09T03:55:21Z (x days ago)  ---  2fb7bd46-9180-41f2-8b44-e1f19734779f  true   2025-06-04T19:48:54Z (x days ago)  2025-06-04T19:48:56Z (x days ago)  
        23  cb9158ce-f8fd-441b-b443-17219e8f79fa  hana:hdi-shared       42ff43bd-14a7-41f7-b903-259235c1abcb  true   2022-09-05T12:11:41Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  ---  50a07db9-da3b-4ec5-8545-521c06bf244c  true   2024-02-07T11:37:49Z (x days ago)  2024-02-07T11:37:59Z (x days ago)  
        24  cb9158ce-f8fd-441b-b443-17219e8f79fa  objectstore:standard  ce93990a-885f-482b-a3e4-f5b55fa65e77  true   2024-06-21T06:11:31Z (x days ago)  2024-07-12T20:16:20Z (x days ago)  ---  c1c3a027-31e0-435c-bf57-3743a8411b17  true   2025-06-04T19:48:51Z (x days ago)  2025-06-04T19:48:53Z (x days ago)  
        25  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  hana:hdi-shared       fe81e5b0-6526-4237-95a4-19268049f779  true   2024-03-19T16:53:23Z (x days ago)  2024-03-19T16:53:33Z (x days ago)  ---  25d85ee0-a9d5-42be-a1e9-b58dbc81b85b  true   2024-03-19T16:53:36Z (x days ago)  2024-03-19T16:53:46Z (x days ago)  
        26  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  objectstore:standard  af9af05c-808b-4ada-a775-6c78854ad466  true   2024-06-19T10:16:54Z (x days ago)  2024-07-12T20:15:18Z (x days ago)  ---  bc107798-3369-4472-a311-8d332231dd2a  true   2025-06-04T19:48:51Z (x days ago)  2025-06-04T19:48:53Z (x days ago)  
        27  d91fb749-a148-479f-b29d-71b1b6a9309d  hana:hdi-shared       9e954752-5a2d-45fa-a809-e9707cedf2e5  true   2025-05-22T12:27:03Z (x days ago)  2025-05-22T12:27:13Z (x days ago)  ---  7efbe76d-04d5-44be-abcf-fdaa3f34de26  true   2025-05-22T12:27:16Z (x days ago)  2025-05-22T12:27:26Z (x days ago)  
        28  d91fb749-a148-479f-b29d-71b1b6a9309d  objectstore:standard  57944233-590b-416d-93fd-399cabcb30b8  true   2025-05-22T12:30:47Z (x days ago)  2025-05-22T12:31:23Z (x days ago)  ---  4a37ea17-4d9f-40e2-9b8a-89ec5694ee82  true   2025-06-04T19:48:57Z (x days ago)  2025-06-04T19:48:59Z (x days ago)  
        29  dde70ec5-983d-4848-b50c-fb2cdac7d359  hana:hdi-shared       c08efd29-58bf-428c-97c3-e0028a1f2c31  true   2024-07-09T08:39:06Z (x days ago)  2024-07-09T08:39:17Z (x days ago)  ---  fca37521-d305-45bc-898b-9d45f872b180  true   2024-07-09T08:39:19Z (x days ago)  2024-07-09T08:39:29Z (x days ago)  
        30  dde70ec5-983d-4848-b50c-fb2cdac7d359  objectstore:standard  ed30757e-d140-4441-87e8-fc2cb9c1298d  true   2024-07-09T20:17:00Z (x days ago)  2024-07-12T20:17:52Z (x days ago)  ---  2cd90a2b-d0f3-46cc-9319-e5d98a14ef6a  true   2025-06-04T19:48:54Z (x days ago)  2025-06-04T19:48:55Z (x days ago)  
        31  t0                                    hana:hdi-shared       6e96ba0f-d345-43ef-a5be-b7d0de85d58b  true   2023-01-30T20:19:09Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  ---  cd46a818-714b-4f58-8517-9a5265a7a7f7  true   2024-02-07T11:37:49Z (x days ago)  2024-02-07T11:37:59Z (x days ago)  "
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("list json", async () => {
      await nock.back("svm-list.json");
      const output = await svm.serviceManagerList(await freshContext(), [], [true, true]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("list filtered basic", async () => {
      await nock.back("svm-list-filtered.json");
      const output = await svm.serviceManagerList(await freshContext(), [testTenantId], [false, false]);
      expect(output).toMatchInlineSnapshot(`
        "tenant_id                             service_plan          instance_id                           ready       binding_id                            ready
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  hana:hdi-shared       cd0dd852-4045-4bff-82b5-909d0948c6fb  true   ---  6c8c6ec8-669d-4353-b991-b191363ec918  true 
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  objectstore:standard  61d42c22-f100-419b-83d9-f0d7caeeca57  true   ---  d0f5c5f2-55d2-46ef-9c00-0de11e8ca5f3  true "
      `);
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
        
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_bindings?labelQuery=tenant_id%20eq%20'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_instances?labelQuery=tenant_id%20eq%20'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_offerings 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_plans 200 OK (88ms)"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("list filtered timestamps", async () => {
      await nock.back("svm-list-filtered.json");
      const output = await svm.serviceManagerList(await freshContext(), [testTenantId], [true, false]);
      expect(anonymizeListTimestamps(output)).toMatchInlineSnapshot(`
        "tenant_id                             service_plan          instance_id                           ready  created_on  updated_onbinding_id                            ready  created_on  updated_on
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  hana:hdi-shared       cd0dd852-4045-4bff-82b5-909d0948c6fb  true   2022-04-26T18:05:44Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  ---  6c8c6ec8-669d-4353-b991-b191363ec918  true   2024-02-15T09:29:17Z (x days ago)  2024-02-15T09:29:27Z (x days ago)  
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  objectstore:standard  61d42c22-f100-419b-83d9-f0d7caeeca57  true   2024-06-26T09:03:37Z (x days ago)  2024-07-12T20:15:50Z (x days ago)  ---  d0f5c5f2-55d2-46ef-9c00-0de11e8ca5f3  true   2025-06-04T19:48:51Z (x days ago)  2025-06-04T19:48:53Z (x days ago)  "
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("list filtered json", async () => {
      await nock.back("svm-list-filtered.json");
      const output = await svm.serviceManagerList(await freshContext(), [testTenantId], [true, true]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });
  });

  describe("long list", () => {
    test("long list basic", async () => {
      await nock.back("svm-long-list.json");
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
      await nock.back("svm-long-list.json");
      const output = await svm.serviceManagerLongList(await freshContext(), [], [false, true]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("long list json", async () => {
      await nock.back("svm-long-list.json");
      const output = await svm.serviceManagerLongList(await freshContext(), [], [true, true]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("long list filtered basic", async () => {
      await nock.back("svm-long-list-filtered.json");
      const output = await svm.serviceManagerLongList(await freshContext(), [testTenantId], [false, false]);
      expect(output).toMatchSnapshot();
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
        
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_bindings?labelQuery=tenant_id%20eq%20'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_instances?labelQuery=tenant_id%20eq%20'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("long list filtered revealed", async () => {
      await nock.back("svm-long-list-filtered.json");
      const output = await svm.serviceManagerLongList(await freshContext(), [testTenantId], [false, true]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("long list filtered json", async () => {
      await nock.back("svm-long-list-filtered.json");
      const output = await svm.serviceManagerLongList(await freshContext(), [testTenantId], [true, true]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });
  });
});

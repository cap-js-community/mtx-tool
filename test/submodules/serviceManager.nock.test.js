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

const {
  _: { LogRequestId },
} = require("../../src/shared/request");

const testTenantId = "5ecc7413-2b7e-414a-9496-ad4a61f6cccf";

const freshContext = async () => await newContext({ usePersistedCache: false, isReadonlyCommand: false });

describe("svm nock tests", () => {
  afterEach(() => {
    LogRequestId.reset();
    svm._._reset();
    nock.restore();
  });

  test("request count", async () => {
    expect(collectRequestCount(require(`${nock.back.fixtures}/svm-list.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 20,
        "GET https://service-manager.cfapps.sap.hana.ondemand.com:443": 4,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/svm-list-filtered.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 20,
        "GET https://service-manager.cfapps.sap.hana.ondemand.com:443": 4,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/svm-long-list.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 20,
        "GET https://service-manager.cfapps.sap.hana.ondemand.com:443": 4,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/svm-long-list-filtered.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 20,
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
        1   0de2abab-9030-4524-9940-e5b37ac75d92  hana:hdi-shared       ea6bfebc-a2a7-4a0f-b893-c970face3cd6  true   ---  e794530a-ae1d-4f9e-9f1b-79d98d3d3680  true 
        2   0de2abab-9030-4524-9940-e5b37ac75d92  objectstore:standard  899f36fe-1bf3-4d95-8ae3-cdd4722c2832  true   ---  ecfad3ec-2537-4220-9505-0356501bd570  true 
        3   116b3ac3-6d84-4ed5-81be-0af4464a09b6  hana:hdi-shared       56c535b2-bc3a-44f5-96c8-3ae1054f455c  true   ---  06be48fa-77c5-4954-a0bd-11a3677fcd6c  true 
        4   116b3ac3-6d84-4ed5-81be-0af4464a09b6  objectstore:standard  adcba256-b5ef-4e7d-b8c5-5ea5e9c808f9  true   ---  16fda6b1-e0ff-4479-8447-d5ce53b282d5  true 
        5   1bbe07b0-4de1-4cdb-830d-49b0ddf20b53  hana:hdi-shared       7758e957-e3a9-418f-9e2b-50bd492cefa6  true   ---  7757ab37-b4bb-4f4a-9d5d-ceeb798fe1c3  true 
        6   1bbe07b0-4de1-4cdb-830d-49b0ddf20b53  objectstore:standard  c18d7de5-195f-4967-8470-3a6438a23e24  true   ---  04ac7bd5-ba71-477e-9013-c32aeb61fa21  true 
        7   3af21e38-10cc-45e3-976f-1463f1d63879  objectstore:standard  5b846327-36b7-4c55-b0fb-88abb38f23dc  true   ---  7db5de1e-172e-4202-8c63-f45c06105bc0  true 
        8   4a5bcd5e-733d-4865-8f05-91937b680d4c  hana:hdi-shared       2745f250-454b-4882-b7f1-1cd4549b8160  true   ---  6faedd5b-cb10-48a7-b3c4-cdd92e072449  true 
        9   4a5bcd5e-733d-4865-8f05-91937b680d4c  objectstore:standard  d82f3141-9797-44f3-876f-d1f8c192c4d3  true   ---  51742a85-c77e-49d3-9acd-03ee5ca705ae  true 
        10  4c0909b1-a84e-4763-a26e-532fdb9e40fa  hana:hdi-shared       8a633bdf-bd76-43ee-8414-74f8095a05c3  true   ---  cb3c4e0c-8ab1-414e-8450-0ad5ef5c2122  true 
        11  4c0909b1-a84e-4763-a26e-532fdb9e40fa  objectstore:standard  ca87508f-b17a-4f9e-84c5-8b974eec9488  true   ---  ad801a98-ef83-4346-9c34-0d9bac1eb27c  true 
        12  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  hana:hdi-shared       cd0dd852-4045-4bff-82b5-909d0948c6fb  true   ---  5cd1cf69-244a-444f-9201-c81f3a7b55ed  true 
        13  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  objectstore:standard  61d42c22-f100-419b-83d9-f0d7caeeca57  true   ---  7eeee4c0-90d6-4f4e-aead-6d19eb3433f5  true 
        14  663d2938-be50-44ab-92ca-538855eb594f  hana:hdi-shared       9915f7de-1cbd-447d-a315-35825f68be69  true   ---  11c9c484-0bb4-4571-bd8b-5691a7f780f8  true 
        15  663d2938-be50-44ab-92ca-538855eb594f  objectstore:standard  25c4c0ca-a01a-4534-bf34-842fb6e27c71  true   ---  69206aca-3af6-4cb5-8dcc-66d349d8abcb  true 
        16  73675fb3-0298-4cf3-8f86-a78c18392193  hana:hdi-shared       852bb033-afab-49d0-b827-4a3f32abe9ba  true   ---  15b9d67c-0b54-40ae-a21f-43071d590010  true 
        17  73675fb3-0298-4cf3-8f86-a78c18392193  objectstore:standard  66654db4-834b-4ae5-9a53-0e0fbabd42d1  true   ---  1e4cc861-15a2-47a6-b71b-2c72b5d5610c  true 
        18  79604d57-3933-4a66-81c2-a022413ec11d  hana:hdi-shared       1c61ab20-0ab1-41ce-8ae4-b7269d9513a4  true   ---  21cdd623-ad99-4e68-99bc-a598c9561dd8  true 
        19  79604d57-3933-4a66-81c2-a022413ec11d  objectstore:standard  411fac3d-9b5c-4fec-93ba-59fbc905c6cf  true   ---  828cc188-14e0-406c-99d9-4f2be149e3c9  true 
        20  86ab464d-5770-46b4-b93d-292c1416c453  hana:hdi-shared       2e5b16d4-5379-47b5-a03d-d749777dadae  true   ---  a2b6bf86-912d-4941-9566-7daffd87b52b  true 
        21  86ab464d-5770-46b4-b93d-292c1416c453  objectstore:standard  54699da7-b092-4e4b-9429-b0df4770c2b2  true   ---  dec8a52c-fd16-4bce-85ef-0f11e4f1c4cd  true 
        22  9c418100-6318-4e8a-b4b2-1114f4f44aef  hana:hdi-shared       c1626f78-e2de-47ab-8674-efe747db2fe3  true   ---  96906cb7-f01c-48e9-bae9-38179efc46f5  true 
        23  9c418100-6318-4e8a-b4b2-1114f4f44aef  objectstore:standard  164c212e-b0e9-4ec9-9259-3abbd753cb21  true   ---  5760647f-c278-4fc1-8078-69ac59f74a0a  true 
        24  a1c320ff-b7f8-48d8-a20d-b44e92f69e65  hana:hdi-shared       c1654fd6-fd1c-4953-92a8-eda4bbdf8b6d  true   ---  546cfe25-2158-4e28-baf1-90781bb7f224  true 
        25  a1c320ff-b7f8-48d8-a20d-b44e92f69e65  objectstore:standard  2b9e0e64-a9da-49f3-bb4f-e3d1dfcbab93  true   ---  66bb0db8-a108-4df6-b33e-4fd46ab447b4  true 
        26  ad91dbba-5c90-436d-8cd8-63b3fb88cf6a  objectstore:standard  500011f3-9dd7-483b-bcc6-b9a87bc27fbe  true   ---  6f84fbd8-0e67-4269-9c4b-089a6a15e9ed  true 
        27  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  hana:hdi-shared       8dbac1ec-7127-4bda-86a4-0ff02cfefd8d  true   ---  3b2210f6-b4e6-4247-9f4a-83a1785c6e43  true 
        28  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  objectstore:standard  a66e6ae9-72dd-4689-851a-f2b33bfb8ff9  true   ---  d06200fb-9fdc-4bc7-b9a3-642feef58b24  true 
        29  b46f4c09-e46e-432b-b837-0aad96d145f9  objectstore:standard  2240055d-5306-43e7-a0c2-8623eff8e538  true   ---  3f6dfd43-11d4-4ac4-a013-89bac8e6c80d  true 
        30  b46f4c09-e46e-432b-b837-0aad96d145f9  hana:hdi-shared       3e0696d7-6669-40ce-8bde-8eb71b227b15  true   ---  79002136-3f92-4381-ae17-8eead3bebc69  true 
        31  ba22b06c-b55f-4940-ae38-b92a5928c8a5  hana:hdi-shared       67a22c54-b5b7-4b96-bea1-0a2d38999def  true   ---  3b792bae-f42d-4bfd-a2a0-272ecfd7cd7e  true 
        32  ba22b06c-b55f-4940-ae38-b92a5928c8a5  objectstore:standard  2db8caf7-fcac-4b9d-abf2-38683639d2b1  true   ---  7341539c-1545-4169-8c83-be5ec2b63362  true 
        33  be884689-aad4-486e-b556-23fdcf266f6d  hana:hdi-shared       875d3ddf-1ede-41e1-b8af-134e418427a3  true   ---  8c89a7ea-f9d2-4565-ad95-51686255feb7  true 
        34  be884689-aad4-486e-b556-23fdcf266f6d  objectstore:standard  f92f8e3e-f813-46b1-9846-c582de2b7982  true   ---  2c2336f3-7917-4f92-b47b-2f724cfde20c  true 
        35  cb9158ce-f8fd-441b-b443-17219e8f79fa  hana:hdi-shared       42ff43bd-14a7-41f7-b903-259235c1abcb  true   ---  8a167edb-e272-4113-9a52-337af9f2159c  true 
        36  cb9158ce-f8fd-441b-b443-17219e8f79fa  objectstore:standard  ce93990a-885f-482b-a3e4-f5b55fa65e77  true   ---  5b6fbf5c-3da9-489c-b97f-9df42717a344  true 
        37  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  hana:hdi-shared       fe81e5b0-6526-4237-95a4-19268049f779  true   ---  816ff910-eb56-4f81-951f-a1b8c8139386  true 
        38  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  objectstore:standard  af9af05c-808b-4ada-a775-6c78854ad466  true   ---  d361ebec-c24f-43a5-8161-5ef3bf892ed8  true 
        39  d91fb749-a148-479f-b29d-71b1b6a9309d  hana:hdi-shared       9e954752-5a2d-45fa-a809-e9707cedf2e5  true   ---  544a9b18-172a-4dd0-a380-44d1377b524c  true 
        40  d91fb749-a148-479f-b29d-71b1b6a9309d  objectstore:standard  57944233-590b-416d-93fd-399cabcb30b8  true   ---  4d0858c1-7660-4856-88f2-293f83b41925  true 
        41  ed99fc2a-b367-4fc6-8918-5547e2e655a7  hana:hdi-shared       a56a9023-fe64-43ba-991d-50ed9395f2e8  true   ---  c3617029-b42e-4acf-bffa-afa46a46499f  true 
        42  ed99fc2a-b367-4fc6-8918-5547e2e655a7  objectstore:standard  66da3e8b-eee4-456b-8aac-750c797c6d6d  true   ---  3acd8ec1-4966-4900-8f99-36da8c15c7b9  true 
        43  fe2e319f-68cd-450f-8a02-d726dac64b35  hana:hdi-shared       639793df-096a-470b-8ef1-c7aec9bd048f  true   ---  aeae9204-42e2-4754-a10f-2c7f03077ebe  true 
        44  fe2e319f-68cd-450f-8a02-d726dac64b35  objectstore:standard  9e57fd34-309e-4ce2-9603-8371372d6c80  true   ---  52b0a3f5-fc71-4d7b-a411-1dd564d582f8  true 
        45  ffc185ec-3f22-48d5-9940-102ec4e62411  objectstore:standard  12fac650-6d22-4759-bb28-5e23628bbd8b  true   ---  0e2e32f2-6160-4f6e-8989-d7a36886aed1  true 
        46  t0                                    hana:hdi-shared       6e96ba0f-d345-43ef-a5be-b7d0de85d58b  true   ---  21e527e8-2fca-4c05-9b76-2cd0f3e07cdb  true "
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
        1   0de2abab-9030-4524-9940-e5b37ac75d92  hana:hdi-shared       ea6bfebc-a2a7-4a0f-b893-c970face3cd6  true   2025-04-04T07:45:52Z (x days ago)  2025-04-04T07:46:02Z (x days ago)  ---  e794530a-ae1d-4f9e-9f1b-79d98d3d3680  true   2026-01-28T00:28:29Z (x days ago)  2026-01-28T00:28:40Z (x days ago)  
        2   0de2abab-9030-4524-9940-e5b37ac75d92  objectstore:standard  899f36fe-1bf3-4d95-8ae3-cdd4722c2832  true   2025-04-04T07:49:33Z (x days ago)  2025-04-04T07:50:09Z (x days ago)  ---  ecfad3ec-2537-4220-9505-0356501bd570  true   2026-01-28T00:28:31Z (x days ago)  2026-01-28T00:28:33Z (x days ago)  
        3   116b3ac3-6d84-4ed5-81be-0af4464a09b6  hana:hdi-shared       56c535b2-bc3a-44f5-96c8-3ae1054f455c  true   2025-10-27T13:43:30Z (x days ago)  2025-10-27T13:43:40Z (x days ago)  ---  06be48fa-77c5-4954-a0bd-11a3677fcd6c  true   2026-01-28T00:28:43Z (x days ago)  2026-01-28T00:28:53Z (x days ago)  
        4   116b3ac3-6d84-4ed5-81be-0af4464a09b6  objectstore:standard  adcba256-b5ef-4e7d-b8c5-5ea5e9c808f9  true   2025-10-29T09:18:13Z (x days ago)  2025-10-29T09:18:49Z (x days ago)  ---  16fda6b1-e0ff-4479-8447-d5ce53b282d5  true   2026-01-28T00:28:46Z (x days ago)  2026-01-28T00:28:47Z (x days ago)  
        5   1bbe07b0-4de1-4cdb-830d-49b0ddf20b53  hana:hdi-shared       7758e957-e3a9-418f-9e2b-50bd492cefa6  true   2025-09-19T08:54:05Z (x days ago)  2025-09-19T08:54:15Z (x days ago)  ---  7757ab37-b4bb-4f4a-9d5d-ceeb798fe1c3  true   2026-01-28T00:28:37Z (x days ago)  2026-01-28T00:28:48Z (x days ago)  
        6   1bbe07b0-4de1-4cdb-830d-49b0ddf20b53  objectstore:standard  c18d7de5-195f-4967-8470-3a6438a23e24  true   2025-10-29T09:22:49Z (x days ago)  2025-10-29T09:23:25Z (x days ago)  ---  04ac7bd5-ba71-477e-9013-c32aeb61fa21  true   2026-01-28T00:28:48Z (x days ago)  2026-01-28T00:28:50Z (x days ago)  
        7   3af21e38-10cc-45e3-976f-1463f1d63879  objectstore:standard  5b846327-36b7-4c55-b0fb-88abb38f23dc  true   2026-01-15T09:23:02Z (x days ago)  2026-01-15T09:23:38Z (x days ago)  ---  7db5de1e-172e-4202-8c63-f45c06105bc0  true   2026-01-28T00:28:52Z (x days ago)  2026-01-28T00:28:53Z (x days ago)  
        8   4a5bcd5e-733d-4865-8f05-91937b680d4c  hana:hdi-shared       2745f250-454b-4882-b7f1-1cd4549b8160  true   2025-07-02T09:06:21Z (x days ago)  2025-07-02T09:06:31Z (x days ago)  ---  6faedd5b-cb10-48a7-b3c4-cdd92e072449  true   2026-01-28T00:28:37Z (x days ago)  2026-01-28T00:28:47Z (x days ago)  
        9   4a5bcd5e-733d-4865-8f05-91937b680d4c  objectstore:standard  d82f3141-9797-44f3-876f-d1f8c192c4d3  true   2025-10-29T09:22:49Z (x days ago)  2025-10-29T09:23:40Z (x days ago)  ---  51742a85-c77e-49d3-9acd-03ee5ca705ae  true   2026-01-28T00:28:47Z (x days ago)  2026-01-28T00:28:49Z (x days ago)  
        10  4c0909b1-a84e-4763-a26e-532fdb9e40fa  hana:hdi-shared       8a633bdf-bd76-43ee-8414-74f8095a05c3  true   2023-09-05T14:19:48Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  ---  cb3c4e0c-8ab1-414e-8450-0ad5ef5c2122  true   2026-01-28T00:28:15Z (x days ago)  2026-01-28T00:28:25Z (x days ago)  
        11  4c0909b1-a84e-4763-a26e-532fdb9e40fa  objectstore:standard  ca87508f-b17a-4f9e-84c5-8b974eec9488  true   2024-06-21T06:50:45Z (x days ago)  2024-07-12T20:16:51Z (x days ago)  ---  ad801a98-ef83-4346-9c34-0d9bac1eb27c  true   2026-01-28T00:28:18Z (x days ago)  2026-01-28T00:28:19Z (x days ago)  
        12  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  hana:hdi-shared       cd0dd852-4045-4bff-82b5-909d0948c6fb  true   2022-04-26T18:05:44Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  ---  5cd1cf69-244a-444f-9201-c81f3a7b55ed  true   2026-01-28T00:28:15Z (x days ago)  2026-01-28T00:28:25Z (x days ago)  
        13  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  objectstore:standard  61d42c22-f100-419b-83d9-f0d7caeeca57  true   2024-06-26T09:03:37Z (x days ago)  2024-07-12T20:15:50Z (x days ago)  ---  7eeee4c0-90d6-4f4e-aead-6d19eb3433f5  true   2026-01-28T00:28:19Z (x days ago)  2026-01-28T00:28:21Z (x days ago)  
        14  663d2938-be50-44ab-92ca-538855eb594f  hana:hdi-shared       9915f7de-1cbd-447d-a315-35825f68be69  true   2024-09-11T07:33:25Z (x days ago)  2024-09-11T07:33:35Z (x days ago)  ---  11c9c484-0bb4-4571-bd8b-5691a7f780f8  true   2026-01-28T00:28:25Z (x days ago)  2026-01-28T00:28:35Z (x days ago)  
        15  663d2938-be50-44ab-92ca-538855eb594f  objectstore:standard  25c4c0ca-a01a-4534-bf34-842fb6e27c71  true   2024-09-11T07:37:20Z (x days ago)  2024-09-11T07:37:56Z (x days ago)  ---  69206aca-3af6-4cb5-8dcc-66d349d8abcb  true   2026-01-28T00:28:25Z (x days ago)  2026-01-28T00:28:27Z (x days ago)  
        16  73675fb3-0298-4cf3-8f86-a78c18392193  hana:hdi-shared       852bb033-afab-49d0-b827-4a3f32abe9ba  true   2025-05-22T12:08:28Z (x days ago)  2025-05-22T12:08:38Z (x days ago)  ---  15b9d67c-0b54-40ae-a21f-43071d590010  true   2026-01-28T00:28:33Z (x days ago)  2026-01-28T00:28:43Z (x days ago)  
        17  73675fb3-0298-4cf3-8f86-a78c18392193  objectstore:standard  66654db4-834b-4ae5-9a53-0e0fbabd42d1  true   2025-05-22T12:12:16Z (x days ago)  2025-05-22T12:12:52Z (x days ago)  ---  1e4cc861-15a2-47a6-b71b-2c72b5d5610c  true   2026-01-28T00:28:36Z (x days ago)  2026-01-28T00:28:37Z (x days ago)  
        18  79604d57-3933-4a66-81c2-a022413ec11d  hana:hdi-shared       1c61ab20-0ab1-41ce-8ae4-b7269d9513a4  true   2026-01-15T10:43:40Z (x days ago)  2026-01-15T10:43:51Z (x days ago)  ---  21cdd623-ad99-4e68-99bc-a598c9561dd8  true   2026-01-28T00:28:53Z (x days ago)  2026-01-28T00:29:03Z (x days ago)  
        19  79604d57-3933-4a66-81c2-a022413ec11d  objectstore:standard  411fac3d-9b5c-4fec-93ba-59fbc905c6cf  true   2026-01-15T10:47:52Z (x days ago)  2026-01-15T10:48:31Z (x days ago)  ---  828cc188-14e0-406c-99d9-4f2be149e3c9  true   2026-01-28T00:28:53Z (x days ago)  2026-01-28T00:28:54Z (x days ago)  
        20  86ab464d-5770-46b4-b93d-292c1416c453  hana:hdi-shared       2e5b16d4-5379-47b5-a03d-d749777dadae  true   2025-09-23T14:24:15Z (x days ago)  2025-09-23T14:24:27Z (x days ago)  ---  a2b6bf86-912d-4941-9566-7daffd87b52b  true   2026-01-28T00:28:38Z (x days ago)  2026-01-28T00:28:48Z (x days ago)  
        21  86ab464d-5770-46b4-b93d-292c1416c453  objectstore:standard  54699da7-b092-4e4b-9429-b0df4770c2b2  true   2025-10-29T09:22:49Z (x days ago)  2025-10-29T09:24:01Z (x days ago)  ---  dec8a52c-fd16-4bce-85ef-0f11e4f1c4cd  true   2026-01-28T00:28:48Z (x days ago)  2026-01-28T00:28:49Z (x days ago)  
        22  9c418100-6318-4e8a-b4b2-1114f4f44aef  hana:hdi-shared       c1626f78-e2de-47ab-8674-efe747db2fe3  true   2024-11-27T06:50:22Z (x days ago)  2024-11-27T06:50:32Z (x days ago)  ---  96906cb7-f01c-48e9-bae9-38179efc46f5  true   2026-01-28T00:28:25Z (x days ago)  2026-01-28T00:28:36Z (x days ago)  
        23  9c418100-6318-4e8a-b4b2-1114f4f44aef  objectstore:standard  164c212e-b0e9-4ec9-9259-3abbd753cb21  true   2024-11-27T06:54:41Z (x days ago)  2024-11-27T06:55:17Z (x days ago)  ---  5760647f-c278-4fc1-8078-69ac59f74a0a  true   2026-01-28T00:28:25Z (x days ago)  2026-01-28T00:28:27Z (x days ago)  
        24  a1c320ff-b7f8-48d8-a20d-b44e92f69e65  hana:hdi-shared       c1654fd6-fd1c-4953-92a8-eda4bbdf8b6d  true   2025-01-29T08:00:40Z (x days ago)  2025-01-29T08:00:51Z (x days ago)  ---  546cfe25-2158-4e28-baf1-90781bb7f224  true   2026-01-28T00:28:27Z (x days ago)  2026-01-28T00:28:37Z (x days ago)  
        25  a1c320ff-b7f8-48d8-a20d-b44e92f69e65  objectstore:standard  2b9e0e64-a9da-49f3-bb4f-e3d1dfcbab93  true   2025-01-29T08:04:39Z (x days ago)  2025-01-29T08:05:15Z (x days ago)  ---  66bb0db8-a108-4df6-b33e-4fd46ab447b4  true   2026-01-28T00:28:28Z (x days ago)  2026-01-28T00:28:29Z (x days ago)  
        26  ad91dbba-5c90-436d-8cd8-63b3fb88cf6a  objectstore:standard  500011f3-9dd7-483b-bcc6-b9a87bc27fbe  true   2025-12-11T03:43:21Z (x days ago)  2025-12-11T03:43:57Z (x days ago)  ---  6f84fbd8-0e67-4269-9c4b-089a6a15e9ed  true   2026-01-28T00:28:50Z (x days ago)  2026-01-28T00:28:51Z (x days ago)  
        27  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  hana:hdi-shared       8dbac1ec-7127-4bda-86a4-0ff02cfefd8d  true   2024-07-05T11:19:53Z (x days ago)  2024-07-05T11:20:04Z (x days ago)  ---  3b2210f6-b4e6-4247-9f4a-83a1785c6e43  true   2026-01-28T00:28:21Z (x days ago)  2026-01-28T00:28:31Z (x days ago)  
        28  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  objectstore:standard  a66e6ae9-72dd-4689-851a-f2b33bfb8ff9  true   2024-07-05T20:24:38Z (x days ago)  2024-07-12T20:17:23Z (x days ago)  ---  d06200fb-9fdc-4bc7-b9a3-642feef58b24  true   2026-01-28T00:28:25Z (x days ago)  2026-01-28T00:28:26Z (x days ago)  
        29  b46f4c09-e46e-432b-b837-0aad96d145f9  objectstore:standard  2240055d-5306-43e7-a0c2-8623eff8e538  true   2025-12-19T02:15:12Z (x days ago)  2025-12-19T02:15:48Z (x days ago)  ---  3f6dfd43-11d4-4ac4-a013-89bac8e6c80d  true   2026-01-28T00:28:50Z (x days ago)  2026-01-28T00:28:52Z (x days ago)  
        30  b46f4c09-e46e-432b-b837-0aad96d145f9  hana:hdi-shared       3e0696d7-6669-40ce-8bde-8eb71b227b15  true   2025-12-22T02:15:53Z (x days ago)  2025-12-22T02:16:04Z (x days ago)  ---  79002136-3f92-4381-ae17-8eead3bebc69  true   2026-01-28T00:28:51Z (x days ago)  2026-01-28T00:29:01Z (x days ago)  
        31  ba22b06c-b55f-4940-ae38-b92a5928c8a5  hana:hdi-shared       67a22c54-b5b7-4b96-bea1-0a2d38999def  true   2025-09-25T10:03:52Z (x days ago)  2025-09-25T10:04:03Z (x days ago)  ---  3b792bae-f42d-4bfd-a2a0-272ecfd7cd7e  true   2026-01-28T00:28:40Z (x days ago)  2026-01-28T00:28:50Z (x days ago)  
        32  ba22b06c-b55f-4940-ae38-b92a5928c8a5  objectstore:standard  2db8caf7-fcac-4b9d-abf2-38683639d2b1  true   2025-10-29T09:22:49Z (x days ago)  2025-10-29T09:23:25Z (x days ago)  ---  7341539c-1545-4169-8c83-be5ec2b63362  true   2026-01-28T00:28:48Z (x days ago)  2026-01-28T00:28:49Z (x days ago)  
        33  be884689-aad4-486e-b556-23fdcf266f6d  hana:hdi-shared       875d3ddf-1ede-41e1-b8af-134e418427a3  true   2024-12-09T03:50:22Z (x days ago)  2024-12-09T03:50:32Z (x days ago)  ---  8c89a7ea-f9d2-4565-ad95-51686255feb7  true   2026-01-28T00:28:26Z (x days ago)  2026-01-28T00:28:37Z (x days ago)  
        34  be884689-aad4-486e-b556-23fdcf266f6d  objectstore:standard  f92f8e3e-f813-46b1-9846-c582de2b7982  true   2024-12-09T03:54:45Z (x days ago)  2024-12-09T03:55:21Z (x days ago)  ---  2c2336f3-7917-4f92-b47b-2f724cfde20c  true   2026-01-28T00:28:27Z (x days ago)  2026-01-28T00:28:28Z (x days ago)  
        35  cb9158ce-f8fd-441b-b443-17219e8f79fa  hana:hdi-shared       42ff43bd-14a7-41f7-b903-259235c1abcb  true   2022-09-05T12:11:41Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  ---  8a167edb-e272-4113-9a52-337af9f2159c  true   2026-01-28T00:28:15Z (x days ago)  2026-01-28T00:28:25Z (x days ago)  
        36  cb9158ce-f8fd-441b-b443-17219e8f79fa  objectstore:standard  ce93990a-885f-482b-a3e4-f5b55fa65e77  true   2024-06-21T06:11:31Z (x days ago)  2024-07-12T20:16:20Z (x days ago)  ---  5b6fbf5c-3da9-489c-b97f-9df42717a344  true   2026-01-28T00:28:16Z (x days ago)  2026-01-28T00:28:18Z (x days ago)  
        37  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  hana:hdi-shared       fe81e5b0-6526-4237-95a4-19268049f779  true   2024-03-19T16:53:23Z (x days ago)  2024-03-19T16:53:33Z (x days ago)  ---  816ff910-eb56-4f81-951f-a1b8c8139386  true   2026-01-28T00:28:15Z (x days ago)  2026-01-28T00:28:25Z (x days ago)  
        38  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  objectstore:standard  af9af05c-808b-4ada-a775-6c78854ad466  true   2024-06-19T10:16:54Z (x days ago)  2024-07-12T20:15:18Z (x days ago)  ---  d361ebec-c24f-43a5-8161-5ef3bf892ed8  true   2026-01-28T00:28:15Z (x days ago)  2026-01-28T00:28:16Z (x days ago)  
        39  d91fb749-a148-479f-b29d-71b1b6a9309d  hana:hdi-shared       9e954752-5a2d-45fa-a809-e9707cedf2e5  true   2025-05-22T12:27:03Z (x days ago)  2025-05-22T12:27:13Z (x days ago)  ---  544a9b18-172a-4dd0-a380-44d1377b524c  true   2026-01-28T00:28:36Z (x days ago)  2026-01-28T00:28:46Z (x days ago)  
        40  d91fb749-a148-479f-b29d-71b1b6a9309d  objectstore:standard  57944233-590b-416d-93fd-399cabcb30b8  true   2025-05-22T12:30:47Z (x days ago)  2025-05-22T12:31:23Z (x days ago)  ---  4d0858c1-7660-4856-88f2-293f83b41925  true   2026-01-28T00:28:37Z (x days ago)  2026-01-28T00:28:38Z (x days ago)  
        41  ed99fc2a-b367-4fc6-8918-5547e2e655a7  hana:hdi-shared       a56a9023-fe64-43ba-991d-50ed9395f2e8  true   2025-11-27T08:35:57Z (x days ago)  2025-11-27T08:36:08Z (x days ago)  ---  c3617029-b42e-4acf-bffa-afa46a46499f  true   2026-01-28T00:28:49Z (x days ago)  2026-01-28T00:28:59Z (x days ago)  
        42  ed99fc2a-b367-4fc6-8918-5547e2e655a7  objectstore:standard  66da3e8b-eee4-456b-8aac-750c797c6d6d  true   2025-11-27T08:40:12Z (x days ago)  2025-11-27T08:40:48Z (x days ago)  ---  3acd8ec1-4966-4900-8f99-36da8c15c7b9  true   2026-01-28T00:28:49Z (x days ago)  2026-01-28T00:28:50Z (x days ago)  
        43  fe2e319f-68cd-450f-8a02-d726dac64b35  hana:hdi-shared       639793df-096a-470b-8ef1-c7aec9bd048f  true   2025-12-02T12:44:02Z (x days ago)  2025-12-02T12:44:14Z (x days ago)  ---  aeae9204-42e2-4754-a10f-2c7f03077ebe  true   2026-01-28T00:28:49Z (x days ago)  2026-01-28T00:28:59Z (x days ago)  
        44  fe2e319f-68cd-450f-8a02-d726dac64b35  objectstore:standard  9e57fd34-309e-4ce2-9603-8371372d6c80  true   2025-12-02T12:48:39Z (x days ago)  2025-12-02T12:49:15Z (x days ago)  ---  52b0a3f5-fc71-4d7b-a411-1dd564d582f8  true   2026-01-28T00:28:50Z (x days ago)  2026-01-28T00:28:51Z (x days ago)  
        45  ffc185ec-3f22-48d5-9940-102ec4e62411  objectstore:standard  12fac650-6d22-4759-bb28-5e23628bbd8b  true   2026-01-15T10:11:57Z (x days ago)  2026-01-15T10:12:33Z (x days ago)  ---  0e2e32f2-6160-4f6e-8989-d7a36886aed1  true   2026-01-28T00:28:52Z (x days ago)  2026-01-28T00:28:53Z (x days ago)  
        46  t0                                    hana:hdi-shared       6e96ba0f-d345-43ef-a5be-b7d0de85d58b  true   2023-01-30T20:19:09Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  ---  21e527e8-2fca-4c05-9b76-2cd0f3e07cdb  true   2026-01-28T00:28:15Z (x days ago)  2026-01-28T00:28:25Z (x days ago)  "
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
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  hana:hdi-shared       cd0dd852-4045-4bff-82b5-909d0948c6fb  true   ---  5cd1cf69-244a-444f-9201-c81f3a7b55ed  true 
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  objectstore:standard  61d42c22-f100-419b-83d9-f0d7caeeca57  true   ---  7eeee4c0-90d6-4f4e-aead-6d19eb3433f5  true "
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
      await nock.back("svm-list-filtered.json");
      const output = await svm.serviceManagerList(await freshContext(), [testTenantId], [true, false]);
      expect(anonymizeListTimestamps(output)).toMatchInlineSnapshot(`
        "tenant_id                             service_plan          instance_id                           ready  created_on  updated_onbinding_id                            ready  created_on  updated_on
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  hana:hdi-shared       cd0dd852-4045-4bff-82b5-909d0948c6fb  true   2022-04-26T18:05:44Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  ---  5cd1cf69-244a-444f-9201-c81f3a7b55ed  true   2026-01-28T00:28:15Z (x days ago)  2026-01-28T00:28:25Z (x days ago)  
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  objectstore:standard  61d42c22-f100-419b-83d9-f0d7caeeca57  true   2024-06-26T09:03:37Z (x days ago)  2024-07-12T20:15:50Z (x days ago)  ---  7eeee4c0-90d6-4f4e-aead-6d19eb3433f5  true   2026-01-28T00:28:19Z (x days ago)  2026-01-28T00:28:21Z (x days ago)  "
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
        
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_bindings?labelQuery=tenant_id+eq+'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_instances?labelQuery=tenant_id+eq+'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)"
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

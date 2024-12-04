"use strict";

const pathlib = require("path");
const nock = require("nock");

const { newContext } = require("../src/context");
const hdi = require("../src/submodules/hanaManagement");
const { outputFromLoggerPartitionFetch, anonymizeListTimestamps, collectScopeCount } = require("./util/static");

nock.back.fixtures = pathlib.resolve(`${__dirname}/../test-nock-record/__nock-fixtures__`);
nock.back.setMode("lockdown");

jest.mock("../src/shared/static", () => require("./__mocks/sharedNockPlayback/static"));

const { Logger: MockLogger } = require("../src/shared/logger");
const mockLogger = MockLogger.getInstance();
jest.mock("../src/shared/logger", () => require("./__mocks/shared/logger"));

const testTenantId = "5ecc7413-2b7e-414a-9496-ad4a61f6cccf";

const freshContext = async () => await newContext({ usePersistedCache: false, isReadonlyCommand: false });

describe("hdi tests", () => {
  afterEach(() => {
    hdi._._reset();
    nock.restore();
  });

  test("request count", async () => {
    expect(collectScopeCount(require(`${nock.back.fixtures}/hdi-list.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 5,
        "GET https://service-manager.cfapps.sap.hana.ondemand.com:443": 3,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectScopeCount(require(`${nock.back.fixtures}/hdi-list-filtered.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 5,
        "GET https://service-manager.cfapps.sap.hana.ondemand.com:443": 3,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectScopeCount(require(`${nock.back.fixtures}/hdi-long-list.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 5,
        "GET https://service-manager.cfapps.sap.hana.ondemand.com:443": 3,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectScopeCount(require(`${nock.back.fixtures}/hdi-long-list-filtered.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 5,
        "GET https://service-manager.cfapps.sap.hana.ondemand.com:443": 3,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
  });

  describe("hdi list", () => {
    test("hdi list basic", async () => {
      await nock.back("hdi-list.json");
      const output = await hdi.hdiList(await freshContext(), [], [false, false]);
      expect(output).toMatchInlineSnapshot(`
        "#   tenant_id                             db_tenant_id                          host                                           schema                                       ready
        1   288393a7-972c-4fa8-acfd-12299c4db374  03500242-e7a0-4799-8432-cfd72472d0d8  service-manager-items-0-credentials-host:443   service-manager-items-0-credentials-schema   true 
        2   4c0909b1-a84e-4763-a26e-532fdb9e40fa  8a633bdf-bd76-43ee-8414-74f8095a05c3  service-manager-items-2-credentials-host:443   service-manager-items-2-credentials-schema   true 
        3   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  cd0dd852-4045-4bff-82b5-909d0948c6fb  service-manager-items-4-credentials-host:443   service-manager-items-4-credentials-schema   true 
        4   663d2938-be50-44ab-92ca-538855eb594f  9915f7de-1cbd-447d-a315-35825f68be69  service-manager-items-9-credentials-host:443   service-manager-items-9-credentials-schema   true 
        5   6917dfd6-7590-4033-af2a-140b75263b0d  1ca8835a-b286-4458-867a-ef9391b9c9d1  service-manager-items-8-credentials-host:443   service-manager-items-8-credentials-schema   true 
        6   9c418100-6318-4e8a-b4b2-1114f4f44aef  c1626f78-e2de-47ab-8674-efe747db2fe3  service-manager-items-10-credentials-host:443  service-manager-items-10-credentials-schema  true 
        7   ae2dc112-9745-4f5e-8feb-79ebdc0094bd  8dbac1ec-7127-4bda-86a4-0ff02cfefd8d  service-manager-items-6-credentials-host:443   service-manager-items-6-credentials-schema   true 
        8   cb9158ce-f8fd-441b-b443-17219e8f79fa  42ff43bd-14a7-41f7-b903-259235c1abcb  service-manager-items-1-credentials-host:443   service-manager-items-1-credentials-schema   true 
        9   cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  fe81e5b0-6526-4237-95a4-19268049f779  service-manager-items-5-credentials-host:443   service-manager-items-5-credentials-schema   true 
        10  dde70ec5-983d-4848-b50c-fb2cdac7d359  c08efd29-58bf-428c-97c3-e0028a1f2c31  service-manager-items-7-credentials-host:443   service-manager-items-7-credentials-schema   true 
        11  t0                                    6e96ba0f-d345-43ef-a5be-b7d0de85d58b  service-manager-items-3-credentials-host:443   service-manager-items-3-credentials-schema   true "
      `);
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_bindings?labelQuery=service_plan_id%20eq%20'1b702f36-bd66-4fad-b4d8-75cf0a0b8347' 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_instances?fieldQuery=service_plan_id%20eq%20'1b702f36-bd66-4fad-b4d8-75cf0a0b8347' 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_plans?fieldQuery=name%20eq%20'hdi-shared' 200 OK (88ms)"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("hdi list timestamps", async () => {
      await nock.back("hdi-list.json");
      const output = await hdi.hdiList(await freshContext(), [], [true, false]);
      expect(anonymizeListTimestamps(output)).toMatchInlineSnapshot(`
        "#   tenant_id                             db_tenant_id                          host                                           schema                                       ready  created_on  updated_on
        1   288393a7-972c-4fa8-acfd-12299c4db374  03500242-e7a0-4799-8432-cfd72472d0d8  service-manager-items-0-credentials-host:443   service-manager-items-0-credentials-schema   true   2024-01-05T07:51:54Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  
        2   4c0909b1-a84e-4763-a26e-532fdb9e40fa  8a633bdf-bd76-43ee-8414-74f8095a05c3  service-manager-items-2-credentials-host:443   service-manager-items-2-credentials-schema   true   2023-09-05T14:19:48Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  
        3   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  cd0dd852-4045-4bff-82b5-909d0948c6fb  service-manager-items-4-credentials-host:443   service-manager-items-4-credentials-schema   true   2022-04-26T18:05:44Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  
        4   663d2938-be50-44ab-92ca-538855eb594f  9915f7de-1cbd-447d-a315-35825f68be69  service-manager-items-9-credentials-host:443   service-manager-items-9-credentials-schema   true   2024-09-11T07:33:25Z (x days ago)  2024-09-11T07:33:35Z (x days ago)  
        5   6917dfd6-7590-4033-af2a-140b75263b0d  1ca8835a-b286-4458-867a-ef9391b9c9d1  service-manager-items-8-credentials-host:443   service-manager-items-8-credentials-schema   true   2024-06-26T10:26:33Z (x days ago)  2024-09-06T06:20:04Z (x days ago)  
        6   9c418100-6318-4e8a-b4b2-1114f4f44aef  c1626f78-e2de-47ab-8674-efe747db2fe3  service-manager-items-10-credentials-host:443  service-manager-items-10-credentials-schema  true   2024-11-27T06:50:22Z (x days ago)  2024-11-27T06:50:32Z (x days ago)  
        7   ae2dc112-9745-4f5e-8feb-79ebdc0094bd  8dbac1ec-7127-4bda-86a4-0ff02cfefd8d  service-manager-items-6-credentials-host:443   service-manager-items-6-credentials-schema   true   2024-07-05T11:19:53Z (x days ago)  2024-07-05T11:20:04Z (x days ago)  
        8   cb9158ce-f8fd-441b-b443-17219e8f79fa  42ff43bd-14a7-41f7-b903-259235c1abcb  service-manager-items-1-credentials-host:443   service-manager-items-1-credentials-schema   true   2022-09-05T12:11:41Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  
        9   cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  fe81e5b0-6526-4237-95a4-19268049f779  service-manager-items-5-credentials-host:443   service-manager-items-5-credentials-schema   true   2024-03-19T16:53:23Z (x days ago)  2024-03-19T16:53:33Z (x days ago)  
        10  dde70ec5-983d-4848-b50c-fb2cdac7d359  c08efd29-58bf-428c-97c3-e0028a1f2c31  service-manager-items-7-credentials-host:443   service-manager-items-7-credentials-schema   true   2024-07-09T08:39:06Z (x days ago)  2024-07-09T08:39:17Z (x days ago)  
        11  t0                                    6e96ba0f-d345-43ef-a5be-b7d0de85d58b  service-manager-items-3-credentials-host:443   service-manager-items-3-credentials-schema   true   2023-01-30T20:19:09Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  "
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("hdi list json", async () => {
      await nock.back("hdi-list.json");
      const output = await hdi.hdiList(await freshContext(), [], [true, true]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("hdi list filtered basic", async () => {
      await nock.back("hdi-list-filtered.json");
      const output = await hdi.hdiList(await freshContext(), [testTenantId], [false, false]);
      expect(output).toMatchInlineSnapshot(`
      "tenant_id                             db_tenant_id                          host                                          schema                                      ready
      5ecc7413-2b7e-414a-9496-ad4a61f6cccf  cd0dd852-4045-4bff-82b5-909d0948c6fb  service-manager-items-0-credentials-host:443  service-manager-items-0-credentials-schema  true "
    `);
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_bindings?labelQuery=service_plan_id%20eq%20'1b702f36-bd66-4fad-b4d8-75cf0a0b8347'%20and%20tenant_id%20eq%20'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_instances?fieldQuery=service_plan_id%20eq%20'1b702f36-bd66-4fad-b4d8-75cf0a0b8347'&labelQuery=tenant_id%20eq%20'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_plans?fieldQuery=name%20eq%20'hdi-shared' 200 OK (88ms)"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("hdi list filtered timestamps", async () => {
      await nock.back("hdi-list-filtered.json");
      const output = await hdi.hdiList(await freshContext(), [testTenantId], [true, false]);
      expect(anonymizeListTimestamps(output)).toMatchInlineSnapshot(`
      "tenant_id                             db_tenant_id                          host                                          schema                                      ready  created_on  updated_on
      5ecc7413-2b7e-414a-9496-ad4a61f6cccf  cd0dd852-4045-4bff-82b5-909d0948c6fb  service-manager-items-0-credentials-host:443  service-manager-items-0-credentials-schema  true   2022-04-26T18:05:44Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  "
    `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("hdi list filtered json", async () => {
      await nock.back("hdi-list-filtered.json");
      const output = await hdi.hdiList(await freshContext(), [testTenantId], [true, true]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });
  });

  describe("hdi long list", () => {
    test("hdi long list basic", async () => {
      await nock.back("hdi-long-list.json");
      const output = await hdi.hdiLongList(await freshContext(), [], [false, false]);
      expect(output).toMatchSnapshot();
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_bindings?labelQuery=service_plan_id%20eq%20'1b702f36-bd66-4fad-b4d8-75cf0a0b8347' 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_instances?fieldQuery=service_plan_id%20eq%20'1b702f36-bd66-4fad-b4d8-75cf0a0b8347' 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_plans?fieldQuery=name%20eq%20'hdi-shared' 200 OK (88ms)"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("hdi long list revealed", async () => {
      await nock.back("hdi-long-list.json");
      const output = await hdi.hdiLongList(await freshContext(), [], [false, true]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("hdi long list json", async () => {
      await nock.back("hdi-long-list.json");
      const output = await hdi.hdiLongList(await freshContext(), [], [true, true]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("hdi long list filtered basic", async () => {
      await nock.back("hdi-long-list-filtered.json");
      const output = await hdi.hdiLongList(await freshContext(), [testTenantId], [false, false]);
      expect(output).toMatchSnapshot();
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_bindings?labelQuery=service_plan_id%20eq%20'1b702f36-bd66-4fad-b4d8-75cf0a0b8347'%20and%20tenant_id%20eq%20'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_instances?fieldQuery=service_plan_id%20eq%20'1b702f36-bd66-4fad-b4d8-75cf0a0b8347'&labelQuery=tenant_id%20eq%20'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)
        GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_plans?fieldQuery=name%20eq%20'hdi-shared' 200 OK (88ms)"
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("hdi long list filtered revealed", async () => {
      await nock.back("hdi-long-list-filtered.json");
      const output = await hdi.hdiLongList(await freshContext(), [testTenantId], [false, true]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("hdi long list filtered json", async () => {
      await nock.back("hdi-long-list-filtered.json");
      const output = await hdi.hdiLongList(await freshContext(), [testTenantId], [true, true]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });
  });
});

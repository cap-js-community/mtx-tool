"use strict";

/**
 * Using Nock
 *
 * RECORDING:
 * NOCK_MODE=record npm t -- --updateSnapshot
 *
 * PLAYBACK:
 * npm t
 */

const pathlib = require("path");
const nock = require("nock");

const { newContext } = require("../src/context");
const hdi = require("../src/submodules/hanaManagement");
const { anonymizeNock } = require("./util/anonymizeNock");
const { outputFromLoggerPartitionFetch, anonymizeListTimestamps } = require("./util/static");

// https://github.com/nock/nock#modes
const NOCK_MODE = {
  RECORD: "record",
  PLAYBACK: "playback",
};

const nockBack = nock.back;
nockBack.fixtures = pathlib.join(__dirname, "__nock-fixtures__");
nockBack.setMode(process.env.NOCK_MODE === NOCK_MODE.RECORD ? "update" : "lockdown");

jest.mock("../src/shared/static", () =>
  process.env.NOCK_MODE === NOCK_MODE.RECORD
    ? jest.requireActual("../src/shared/static")
    : require("./__mocks/sharedNockPlayback/static")
);
process.env.NOCK_MODE === NOCK_MODE.RECORD && jest.setTimeout(240000);

const testTenantId = "5ecc7413-2b7e-414a-9496-ad4a61f6cccf";

let loggerSpy = {
  info: jest.spyOn(console, "log").mockImplementation(),
  error: jest.spyOn(console, "error").mockImplementation(),
};
const freshContext = async () => await newContext({ usePersistedCache: false, isReadonlyCommand: false });

describe("hdi tests", () => {
  beforeAll(async () => {});

  afterEach(() => {
    nock.restore();
    jest.clearAllMocks();
  });

  test("hdi list and longlist", async () => {
    const { nockDone } = await nockBack("hdi-list.json", { afterRecord: anonymizeNock });

    const hdiListOutput = await hdi.hdiList(await freshContext(), [], [true]);
    expect(anonymizeListTimestamps(hdiListOutput)).toMatchInlineSnapshot(`
      "#  tenant_id                             db_tenant_id                          host                                          schema                                      ready  created_on  updated_on
      1  288393a7-972c-4fa8-acfd-12299c4db374  03500242-e7a0-4799-8432-cfd72472d0d8  service-manager-items-3-credentials-host:443  service-manager-items-3-credentials-schema  true   2024-01-05T07:51:54Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  
      2  4c0909b1-a84e-4763-a26e-532fdb9e40fa  8a633bdf-bd76-43ee-8414-74f8095a05c3  service-manager-items-5-credentials-host:443  service-manager-items-5-credentials-schema  true   2023-09-05T14:19:48Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  
      3  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  cd0dd852-4045-4bff-82b5-909d0948c6fb  service-manager-items-7-credentials-host:443  service-manager-items-7-credentials-schema  true   2022-04-26T18:05:44Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  
      4  6917dfd6-7590-4033-af2a-140b75263b0d  0a017fb4-f4ae-408a-9d79-6e866e51fb00  service-manager-items-0-credentials-host:443  service-manager-items-0-credentials-schema  true   2022-04-28T07:57:50Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  
      5  848a0f14-792d-4bd2-821c-7c6280780ca3  c1a94550-08a6-4771-ae15-cc7ae0f0cf82  service-manager-items-1-credentials-host:443  service-manager-items-1-credentials-schema  true   2023-08-08T14:41:54Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  
      6  cb9158ce-f8fd-441b-b443-17219e8f79fa  42ff43bd-14a7-41f7-b903-259235c1abcb  service-manager-items-4-credentials-host:443  service-manager-items-4-credentials-schema  true   2022-09-05T12:11:41Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  
      7  dde70ec5-983d-4848-b50c-fb2cdac7d359  57175b0d-f1cb-447e-a720-bbd1199993e4  service-manager-items-2-credentials-host:443  service-manager-items-2-credentials-schema  true   2023-06-21T08:34:19Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  
      8  t0                                    6e96ba0f-d345-43ef-a5be-b7d0de85d58b  service-manager-items-6-credentials-host:443  service-manager-items-6-credentials-schema  true   2023-01-30T20:19:09Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  "
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_instances 200 OK (88ms)
      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_bindings 200 OK (88ms)"
    `);
    loggerSpy.info.mockClear();
    expect(await hdi.hdiList(await freshContext(), [], [false])).toMatchInlineSnapshot(`
      "#  tenant_id                             db_tenant_id                          host                                          schema                                      ready
      1  288393a7-972c-4fa8-acfd-12299c4db374  03500242-e7a0-4799-8432-cfd72472d0d8  service-manager-items-3-credentials-host:443  service-manager-items-3-credentials-schema  true 
      2  4c0909b1-a84e-4763-a26e-532fdb9e40fa  8a633bdf-bd76-43ee-8414-74f8095a05c3  service-manager-items-5-credentials-host:443  service-manager-items-5-credentials-schema  true 
      3  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  cd0dd852-4045-4bff-82b5-909d0948c6fb  service-manager-items-7-credentials-host:443  service-manager-items-7-credentials-schema  true 
      4  6917dfd6-7590-4033-af2a-140b75263b0d  0a017fb4-f4ae-408a-9d79-6e866e51fb00  service-manager-items-0-credentials-host:443  service-manager-items-0-credentials-schema  true 
      5  848a0f14-792d-4bd2-821c-7c6280780ca3  c1a94550-08a6-4771-ae15-cc7ae0f0cf82  service-manager-items-1-credentials-host:443  service-manager-items-1-credentials-schema  true 
      6  cb9158ce-f8fd-441b-b443-17219e8f79fa  42ff43bd-14a7-41f7-b903-259235c1abcb  service-manager-items-4-credentials-host:443  service-manager-items-4-credentials-schema  true 
      7  dde70ec5-983d-4848-b50c-fb2cdac7d359  57175b0d-f1cb-447e-a720-bbd1199993e4  service-manager-items-2-credentials-host:443  service-manager-items-2-credentials-schema  true 
      8  t0                                    6e96ba0f-d345-43ef-a5be-b7d0de85d58b  service-manager-items-6-credentials-host:443  service-manager-items-6-credentials-schema  true "
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_instances 200 OK (88ms)
      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_bindings 200 OK (88ms)"
    `);
    loggerSpy.info.mockClear();
    expect(await hdi.hdiLongList(await freshContext(), [], [true])).toMatchSnapshot();
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_instances 200 OK (88ms)
      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_bindings 200 OK (88ms)"
    `);

    nockDone();
    expect(loggerSpy.error.mock.calls).toHaveLength(0);
  });

  test("hdi list and longlist filtered", async () => {
    const { nockDone } = await nockBack("hdi-list-filtered.json", { afterRecord: anonymizeNock });

    const hdiListOutput = await hdi.hdiList(await freshContext(), [testTenantId], [true]);
    expect(anonymizeListTimestamps(hdiListOutput)).toMatchInlineSnapshot(`
      "tenant_id                             db_tenant_id                          host                                          schema                                      ready  created_on  updated_on
      5ecc7413-2b7e-414a-9496-ad4a61f6cccf  cd0dd852-4045-4bff-82b5-909d0948c6fb  service-manager-items-0-credentials-host:443  service-manager-items-0-credentials-schema  true   2022-04-26T18:05:44Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  "
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_instances?labelQuery=tenant_id%20eq%20'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)
      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_bindings?labelQuery=tenant_id%20eq%20'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)"
    `);
    loggerSpy.info.mockClear();
    expect(await hdi.hdiList(await freshContext(), [testTenantId], [false])).toMatchInlineSnapshot(`
      "tenant_id                             db_tenant_id                          host                                          schema                                      ready
      5ecc7413-2b7e-414a-9496-ad4a61f6cccf  cd0dd852-4045-4bff-82b5-909d0948c6fb  service-manager-items-0-credentials-host:443  service-manager-items-0-credentials-schema  true "
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_instances?labelQuery=tenant_id%20eq%20'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)
      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_bindings?labelQuery=tenant_id%20eq%20'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)"
    `);
    loggerSpy.info.mockClear();
    expect(await hdi.hdiLongList(await freshContext(), [testTenantId], [true])).toMatchSnapshot();
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_instances?labelQuery=tenant_id%20eq%20'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)
      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_bindings?labelQuery=tenant_id%20eq%20'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)"
    `);

    nockDone();
    expect(loggerSpy.error.mock.calls).toHaveLength(0);
  });
});

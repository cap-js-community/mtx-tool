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
      "#   tenant_id                             db_tenant_id                          host                                           schema                                       ready  created_on  updated_on
      1   00000000-0000-4000-8000-000000000001  6a7dee0c-14a4-4374-9999-82d8b24162ab  service-manager-items-10-credentials-host:443  service-manager-items-10-credentials-schema  true   2024-03-14T14:53:42Z (x days ago)  2024-03-14T14:53:52Z (x days ago)  
      2   288393a7-972c-4fa8-acfd-12299c4db374  03500242-e7a0-4799-8432-cfd72472d0d8  service-manager-items-2-credentials-host:443   service-manager-items-2-credentials-schema   true   2024-01-05T07:51:54Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  
      3   34d6259c-41bc-4f6b-8220-018ace187813  9b5bcd55-b22a-4c53-b18d-ab408d7943be  service-manager-items-9-credentials-host:443   service-manager-items-9-credentials-schema   true   2024-03-14T14:18:27Z (x days ago)  2024-03-14T14:18:37Z (x days ago)  
      4   4c0909b1-a84e-4763-a26e-532fdb9e40fa  8a633bdf-bd76-43ee-8414-74f8095a05c3  service-manager-items-4-credentials-host:443   service-manager-items-4-credentials-schema   true   2023-09-05T14:19:48Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  
      5   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  cd0dd852-4045-4bff-82b5-909d0948c6fb  service-manager-items-6-credentials-host:443   service-manager-items-6-credentials-schema   true   2022-04-26T18:05:44Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  
      6   6917dfd6-7590-4033-af2a-140b75263b0d  0a017fb4-f4ae-408a-9d79-6e866e51fb00  service-manager-items-0-credentials-host:443   service-manager-items-0-credentials-schema   true   2022-04-28T07:57:50Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  
      7   848a0f14-792d-4bd2-821c-7c6280780ca3  c1a94550-08a6-4771-ae15-cc7ae0f0cf82  service-manager-items-1-credentials-host:443   service-manager-items-1-credentials-schema   true   2023-08-08T14:41:54Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  
      8   b2b8f8e2-3d36-4b8f-92de-a6d68d81790f  ac896f46-6d15-432a-81bc-68e792d7070b  service-manager-items-8-credentials-host:443   service-manager-items-8-credentials-schema   true   2024-03-14T13:32:03Z (x days ago)  2024-03-14T13:32:14Z (x days ago)  
      9   cb9158ce-f8fd-441b-b443-17219e8f79fa  42ff43bd-14a7-41f7-b903-259235c1abcb  service-manager-items-3-credentials-host:443   service-manager-items-3-credentials-schema   true   2022-09-05T12:11:41Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  
      10  dde70ec5-983d-4848-b50c-fb2cdac7d359  88270385-1de5-4d40-8ff9-544fcea38df7  service-manager-items-7-credentials-host:443   service-manager-items-7-credentials-schema   true   2024-02-23T15:35:27Z (x days ago)  2024-02-23T15:35:37Z (x days ago)  
      11  t0                                    6e96ba0f-d345-43ef-a5be-b7d0de85d58b  service-manager-items-5-credentials-host:443   service-manager-items-5-credentials-schema   true   2023-01-30T20:19:09Z (x days ago)  2024-02-07T11:36:53Z (x days ago)  "
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_plans?fieldQuery=name%20eq%20'hdi-shared' 200 OK (88ms)
      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_instances?fieldQuery=service_plan_id%20eq%20'1b702f36-bd66-4fad-b4d8-75cf0a0b8347' 200 OK (88ms)
      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_bindings?labelQuery=service_plan_id%20eq%20'1b702f36-bd66-4fad-b4d8-75cf0a0b8347' 200 OK (88ms)"
    `);
    loggerSpy.info.mockClear();
    expect(await hdi.hdiList(await freshContext(), [], [false])).toMatchInlineSnapshot(`
      "#   tenant_id                             db_tenant_id                          host                                           schema                                       ready
      1   00000000-0000-4000-8000-000000000001  6a7dee0c-14a4-4374-9999-82d8b24162ab  service-manager-items-10-credentials-host:443  service-manager-items-10-credentials-schema  true 
      2   288393a7-972c-4fa8-acfd-12299c4db374  03500242-e7a0-4799-8432-cfd72472d0d8  service-manager-items-2-credentials-host:443   service-manager-items-2-credentials-schema   true 
      3   34d6259c-41bc-4f6b-8220-018ace187813  9b5bcd55-b22a-4c53-b18d-ab408d7943be  service-manager-items-9-credentials-host:443   service-manager-items-9-credentials-schema   true 
      4   4c0909b1-a84e-4763-a26e-532fdb9e40fa  8a633bdf-bd76-43ee-8414-74f8095a05c3  service-manager-items-4-credentials-host:443   service-manager-items-4-credentials-schema   true 
      5   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  cd0dd852-4045-4bff-82b5-909d0948c6fb  service-manager-items-6-credentials-host:443   service-manager-items-6-credentials-schema   true 
      6   6917dfd6-7590-4033-af2a-140b75263b0d  0a017fb4-f4ae-408a-9d79-6e866e51fb00  service-manager-items-0-credentials-host:443   service-manager-items-0-credentials-schema   true 
      7   848a0f14-792d-4bd2-821c-7c6280780ca3  c1a94550-08a6-4771-ae15-cc7ae0f0cf82  service-manager-items-1-credentials-host:443   service-manager-items-1-credentials-schema   true 
      8   b2b8f8e2-3d36-4b8f-92de-a6d68d81790f  ac896f46-6d15-432a-81bc-68e792d7070b  service-manager-items-8-credentials-host:443   service-manager-items-8-credentials-schema   true 
      9   cb9158ce-f8fd-441b-b443-17219e8f79fa  42ff43bd-14a7-41f7-b903-259235c1abcb  service-manager-items-3-credentials-host:443   service-manager-items-3-credentials-schema   true 
      10  dde70ec5-983d-4848-b50c-fb2cdac7d359  88270385-1de5-4d40-8ff9-544fcea38df7  service-manager-items-7-credentials-host:443   service-manager-items-7-credentials-schema   true 
      11  t0                                    6e96ba0f-d345-43ef-a5be-b7d0de85d58b  service-manager-items-5-credentials-host:443   service-manager-items-5-credentials-schema   true "
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_instances?fieldQuery=service_plan_id%20eq%20'1b702f36-bd66-4fad-b4d8-75cf0a0b8347' 200 OK (88ms)
      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_bindings?labelQuery=service_plan_id%20eq%20'1b702f36-bd66-4fad-b4d8-75cf0a0b8347' 200 OK (88ms)"
    `);
    loggerSpy.info.mockClear();
    expect(await hdi.hdiLongList(await freshContext(), [], [true])).toMatchSnapshot();
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_instances?fieldQuery=service_plan_id%20eq%20'1b702f36-bd66-4fad-b4d8-75cf0a0b8347' 200 OK (88ms)
      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_bindings?labelQuery=service_plan_id%20eq%20'1b702f36-bd66-4fad-b4d8-75cf0a0b8347' 200 OK (88ms)"
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

      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_instances?fieldQuery=service_plan_id%20eq%20'1b702f36-bd66-4fad-b4d8-75cf0a0b8347'&labelQuery=tenant_id%20eq%20'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)
      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_bindings?labelQuery=service_plan_id%20eq%20'1b702f36-bd66-4fad-b4d8-75cf0a0b8347'%20and%20tenant_id%20eq%20'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)"
    `);
    loggerSpy.info.mockClear();
    expect(await hdi.hdiList(await freshContext(), [testTenantId], [false])).toMatchInlineSnapshot(`
      "tenant_id                             db_tenant_id                          host                                          schema                                      ready
      5ecc7413-2b7e-414a-9496-ad4a61f6cccf  cd0dd852-4045-4bff-82b5-909d0948c6fb  service-manager-items-0-credentials-host:443  service-manager-items-0-credentials-schema  true "
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_instances?fieldQuery=service_plan_id%20eq%20'1b702f36-bd66-4fad-b4d8-75cf0a0b8347'&labelQuery=tenant_id%20eq%20'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)
      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_bindings?labelQuery=service_plan_id%20eq%20'1b702f36-bd66-4fad-b4d8-75cf0a0b8347'%20and%20tenant_id%20eq%20'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)"
    `);
    loggerSpy.info.mockClear();
    expect(await hdi.hdiLongList(await freshContext(), [testTenantId], [true])).toMatchSnapshot();
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_instances?fieldQuery=service_plan_id%20eq%20'1b702f36-bd66-4fad-b4d8-75cf0a0b8347'&labelQuery=tenant_id%20eq%20'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)
      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_bindings?labelQuery=service_plan_id%20eq%20'1b702f36-bd66-4fad-b4d8-75cf0a0b8347'%20and%20tenant_id%20eq%20'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)"
    `);

    nockDone();
    expect(loggerSpy.error.mock.calls).toHaveLength(0);
  });
});

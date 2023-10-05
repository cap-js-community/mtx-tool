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
      "#  tenant_id                                         host                                          schema                                      ready  created_on  updated_on
      1  5ecc7413-2b7e-414a-9496-ad4a61f6cccf              service-manager-items-4-credentials-host:443  service-manager-items-4-credentials-schema  true   2022-04-26T18:05:44Z (x days ago)  2022-04-26T18:05:45Z (x days ago)  
      2  6917dfd6-7590-4033-af2a-140b75263b0d              service-manager-items-8-credentials-host:443  service-manager-items-8-credentials-schema  true   2022-04-28T07:57:50Z (x days ago)  2022-04-28T07:58:00Z (x days ago)  
      3  7b20408e-3fe0-4ade-aa2e-ad97baac72e8              service-manager-items-0-credentials-host:443  service-manager-items-0-credentials-schema  true   2022-04-26T18:05:24Z (x days ago)  2022-04-26T18:05:24Z (x days ago)  
      4  cb9158ce-f8fd-441b-b443-17219e8f79fa              service-manager-items-7-credentials-host:443  service-manager-items-7-credentials-schema  true   2022-09-05T12:11:41Z (x days ago)  2022-09-05T12:11:52Z (x days ago)  
      5  TENANT-5ecc7413-2b7e-414a-9496-ad4a61f6cccf-META  service-manager-items-2-credentials-host:443  service-manager-items-2-credentials-schema  true   2022-04-26T18:05:46Z (x days ago)  2022-04-26T18:05:47Z (x days ago)  
      6  TENANT-6917dfd6-7590-4033-af2a-140b75263b0d-META  service-manager-items-5-credentials-host:443  service-manager-items-5-credentials-schema  true   2022-04-28T07:57:50Z (x days ago)  2022-04-28T07:58:00Z (x days ago)  
      7  TENANT-7b20408e-3fe0-4ade-aa2e-ad97baac72e8-META  service-manager-items-3-credentials-host:443  service-manager-items-3-credentials-schema  true   2022-04-26T18:05:22Z (x days ago)  2022-04-26T18:05:23Z (x days ago)  
      8  TENANT-cb9158ce-f8fd-441b-b443-17219e8f79fa-META  service-manager-items-6-credentials-host:443  service-manager-items-6-credentials-schema  true   2022-09-05T12:11:42Z (x days ago)  2022-09-05T12:11:52Z (x days ago)  
      9  __META__                                          service-manager-items-1-credentials-host:443  service-manager-items-1-credentials-schema  true   2022-04-26T18:05:16Z (x days ago)  2022-04-26T18:05:16Z (x days ago)  "
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      
      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_instances 200 OK (88ms)
      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_bindings 200 OK (88ms)"
    `);
    loggerSpy.info.mockClear();
    expect(await hdi.hdiList(await freshContext(), [], [false])).toMatchInlineSnapshot(`
      "#  tenant_id                                         host                                          schema                                      ready
      1  5ecc7413-2b7e-414a-9496-ad4a61f6cccf              service-manager-items-4-credentials-host:443  service-manager-items-4-credentials-schema  true 
      2  6917dfd6-7590-4033-af2a-140b75263b0d              service-manager-items-8-credentials-host:443  service-manager-items-8-credentials-schema  true 
      3  7b20408e-3fe0-4ade-aa2e-ad97baac72e8              service-manager-items-0-credentials-host:443  service-manager-items-0-credentials-schema  true 
      4  cb9158ce-f8fd-441b-b443-17219e8f79fa              service-manager-items-7-credentials-host:443  service-manager-items-7-credentials-schema  true 
      5  TENANT-5ecc7413-2b7e-414a-9496-ad4a61f6cccf-META  service-manager-items-2-credentials-host:443  service-manager-items-2-credentials-schema  true 
      6  TENANT-6917dfd6-7590-4033-af2a-140b75263b0d-META  service-manager-items-5-credentials-host:443  service-manager-items-5-credentials-schema  true 
      7  TENANT-7b20408e-3fe0-4ade-aa2e-ad97baac72e8-META  service-manager-items-3-credentials-host:443  service-manager-items-3-credentials-schema  true 
      8  TENANT-cb9158ce-f8fd-441b-b443-17219e8f79fa-META  service-manager-items-6-credentials-host:443  service-manager-items-6-credentials-schema  true 
      9  __META__                                          service-manager-items-1-credentials-host:443  service-manager-items-1-credentials-schema  true "
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
      "tenant_id                             host                                          schema                                      ready  created_on  updated_on
      5ecc7413-2b7e-414a-9496-ad4a61f6cccf  service-manager-items-0-credentials-host:443  service-manager-items-0-credentials-schema  true   2022-04-26T18:05:44Z (x days ago)  2022-04-26T18:05:45Z (x days ago)  "
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      
      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_instances?labelQuery=tenant_id%20eq%20'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)
      GET https://service-manager.cfapps.sap.hana.ondemand.com/v1/service_bindings?labelQuery=tenant_id%20eq%20'5ecc7413-2b7e-414a-9496-ad4a61f6cccf' 200 OK (88ms)"
    `);
    loggerSpy.info.mockClear();
    expect(await hdi.hdiList(await freshContext(), [testTenantId], [false])).toMatchInlineSnapshot(`
      "tenant_id                             host                                          schema                                      ready
      5ecc7413-2b7e-414a-9496-ad4a61f6cccf  service-manager-items-0-credentials-host:443  service-manager-items-0-credentials-schema  true "
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

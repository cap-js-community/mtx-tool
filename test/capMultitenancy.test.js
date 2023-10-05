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
const cds = require("../src/submodules/capMultitenancy");
const { anonymizeNock } = require("./util/anonymizeNock");
const { outputFromLoggerPartitionFetch } = require("./util/static");

// https://github.com/nock/nock#modes
const NOCK_MODE = {
  RECORD: "record",
  PLAYBACK: "playback",
};

const nockBack = nock.back;
nockBack.fixtures = pathlib.join(__dirname, "__nock-fixtures__");
nockBack.setMode(process.env.NOCK_MODE === NOCK_MODE.RECORD ? "update" : "lockdown");

jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  writeFile: jest.fn((filename, data, cb) => cb()),
}));

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

describe("cds tests", () => {
  beforeAll(async () => {});

  afterEach(() => {
    nock.restore();
    jest.clearAllMocks();
  });

  test("cds list and longlist", async () => {
    const { nockDone } = await nockBack("cds-list.json", { afterRecord: anonymizeNock });

    expect(await cds.cdsList(await freshContext(), [])).toMatchInlineSnapshot(`
      "#  subscribedTenantId                    subscribedSubdomain   subscriptionAppName  eventType
      1  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  skyfin-company        afc-dev              UPDATE   
      2  6917dfd6-7590-4033-af2a-140b75263b0d  skyfin-debug-company  afc-dev              UPDATE   
      3  7b20408e-3fe0-4ade-aa2e-ad97baac72e8  skyfin                                     CREATE   
      4  cb9158ce-f8fd-441b-b443-17219e8f79fa  skysand               afc-dev              UPDATE   "
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      using legacy cds-mtx apis, consider upgrading to cds-mtxs
      
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/mtx/v1/provisioning/tenant 200 OK (88ms)"
    `);
    loggerSpy.info.mockClear();
    expect(await cds.cdsLongList(await freshContext(), [])).toMatchInlineSnapshot(`
      "[
        {
          "subscribedSubdomain": "skyfin",
          "eventType": "CREATE",
          "subscribedTenantId": "7b20408e-3fe0-4ade-aa2e-ad97baac72e8",
          "subscribedSubaccountId": null,
          "subscriptionAppName": null,
          "dbDescriminator": "71836508-e02b-4a5b-88a2-4dd482f6de70.hna0.canary-eu10.hanacloud.ondemand.com:443"
        },
        {
          "subscriptionAppName": "afc-dev",
          "subscriptionAppId": "afc-dev!t5874",
          "subscribedTenantId": "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
          "subscribedSubaccountId": "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
          "providerSubaccountId": "7b20408e-3fe0-4ade-aa2e-ad97baac72e8",
          "subscribedZoneId": "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
          "subscribedSubdomain": "skyfin-company",
          "subscribedLicenseType": "SAPDEV",
          "subscribedCrmId": "",
          "subscriptionAppPlan": "standard",
          "subscriptionAppAmount": 1,
          "userId": "APPLICATION_OWNER",
          "globalAccountGUID": "011b4e7a-43b5-4f63-819a-9b1e46ab23b6",
          "eventType": "UPDATE",
          "dbDescriminator": "71836508-e02b-4a5b-88a2-4dd482f6de70.hna0.canary-eu10.hanacloud.ondemand.com:443"
        },
        {
          "subscriptionAppName": "afc-dev",
          "subscriptionAppId": "afc-dev!t5874",
          "subscribedTenantId": "cb9158ce-f8fd-441b-b443-17219e8f79fa",
          "subscribedSubaccountId": "b07cc881-e90b-4c18-82c4-94aad87c2bb9",
          "providerSubaccountId": "7b20408e-3fe0-4ade-aa2e-ad97baac72e8",
          "subscribedZoneId": "cb9158ce-f8fd-441b-b443-17219e8f79fa",
          "subscribedSubdomain": "skysand",
          "subscribedLicenseType": "SAPDEV",
          "subscribedCrmId": "",
          "userId": "APPLICATION_OWNER",
          "globalAccountGUID": "011b4e7a-43b5-4f63-819a-9b1e46ab23b6",
          "eventType": "UPDATE",
          "dbDescriminator": "fa8a6cbe-1cdc-4dea-84cf-877c09b0f651.hna0.canary-eu10.hanacloud.ondemand.com:443"
        },
        {
          "subscriptionAppName": "afc-dev",
          "subscriptionAppId": "afc-dev!t5874",
          "subscribedTenantId": "6917dfd6-7590-4033-af2a-140b75263b0d",
          "subscribedSubaccountId": "6917dfd6-7590-4033-af2a-140b75263b0d",
          "providerSubaccountId": "7b20408e-3fe0-4ade-aa2e-ad97baac72e8",
          "subscribedZoneId": "6917dfd6-7590-4033-af2a-140b75263b0d",
          "subscribedSubdomain": "skyfin-debug-company",
          "subscribedLicenseType": "SAPDEV",
          "subscribedCrmId": "",
          "subscriptionAppPlan": "standard",
          "subscriptionAppAmount": 1,
          "userId": "APPLICATION_OWNER",
          "globalAccountGUID": "011b4e7a-43b5-4f63-819a-9b1e46ab23b6",
          "eventType": "UPDATE",
          "dbDescriminator": "fa8a6cbe-1cdc-4dea-84cf-877c09b0f651.hna0.canary-eu10.hanacloud.ondemand.com:443"
        }
      ]"
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/mtx/v1/provisioning/tenant 200 OK (88ms)"
    `);

    nockDone();
    expect(loggerSpy.error.mock.calls).toHaveLength(0);
  });

  test("cds list and longlist filtered", async () => {
    const { nockDone } = await nockBack("cds-list-filtered.json", { afterRecord: anonymizeNock });

    expect(await cds.cdsList(await freshContext(), [testTenantId])).toMatchInlineSnapshot(`
      "subscribedTenantId                    subscribedSubdomain  subscriptionAppName  eventType
      5ecc7413-2b7e-414a-9496-ad4a61f6cccf  skyfin-company       afc-dev              UPDATE   "
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/mtx/v1/provisioning/tenant/5ecc7413-2b7e-414a-9496-ad4a61f6cccf 200 OK (88ms)"
    `);
    loggerSpy.info.mockClear();
    expect(await cds.cdsLongList(await freshContext(), [testTenantId])).toMatchInlineSnapshot(`
      "[
        {
          "subscriptionAppName": "afc-dev",
          "subscriptionAppId": "afc-dev!t5874",
          "subscribedTenantId": "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
          "subscribedSubaccountId": "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
          "providerSubaccountId": "7b20408e-3fe0-4ade-aa2e-ad97baac72e8",
          "subscribedZoneId": "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
          "subscribedSubdomain": "skyfin-company",
          "subscribedLicenseType": "SAPDEV",
          "subscribedCrmId": "",
          "subscriptionAppPlan": "standard",
          "subscriptionAppAmount": 1,
          "userId": "APPLICATION_OWNER",
          "globalAccountGUID": "011b4e7a-43b5-4f63-819a-9b1e46ab23b6",
          "eventType": "UPDATE"
        }
      ]"
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/mtx/v1/provisioning/tenant/5ecc7413-2b7e-414a-9496-ad4a61f6cccf 200 OK (88ms)"
    `);

    nockDone();
    expect(loggerSpy.error.mock.calls).toHaveLength(0);
  });

  test("cds upgrade tenant and auto-upgrade", async () => {
    const { nockDone } = await nockBack("cds-upgrade-tenant.json", { afterRecord: anonymizeNock });

    expect(await cds.cdsUpgradeTenant(await freshContext(), [testTenantId], [true])).toMatchInlineSnapshot(`undefined`);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      started upgrade on server with jobId b2dc8918-dc2b-4af2-b866-a42da5e588ae polling interval 15sec
      polled status RUNNING for jobId b2dc8918-dc2b-4af2-b866-a42da5e588ae
      polled status RUNNING for jobId b2dc8918-dc2b-4af2-b866-a42da5e588ae
      polled status RUNNING for jobId b2dc8918-dc2b-4af2-b866-a42da5e588ae
      polled status RUNNING for jobId b2dc8918-dc2b-4af2-b866-a42da5e588ae
      polled status FINISHED for jobId b2dc8918-dc2b-4af2-b866-a42da5e588ae
      #  tenantId                              status   message  logfile                                                      
      1  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  SUCCESS           cds-upgrade-buildlog-5ecc7413-2b7e-414a-9496-ad4a61f6cccf.txt
      
      
      POST https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/mtx/v1/model/asyncUpgrade 200 OK (88ms)
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/mtx/v1/model/status/b2dc8918-dc2b-4af2-b866-a42da5e588ae 200 OK (88ms)
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/mtx/v1/model/status/b2dc8918-dc2b-4af2-b866-a42da5e588ae 200 OK (88ms)
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/mtx/v1/model/status/b2dc8918-dc2b-4af2-b866-a42da5e588ae 200 OK (88ms)
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/mtx/v1/model/status/b2dc8918-dc2b-4af2-b866-a42da5e588ae 200 OK (88ms)
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/mtx/v1/model/status/b2dc8918-dc2b-4af2-b866-a42da5e588ae 200 OK (88ms)"
    `);
    loggerSpy.info.mockClear();
    expect(await cds.cdsUpgradeTenant(await freshContext(), [testTenantId], [false])).toMatchInlineSnapshot(
      `undefined`
    );
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      started upgrade on server with jobId 221692fa-9c7a-4bc3-9b51-5fc262c8c177 polling interval 15sec
      polled status RUNNING for jobId 221692fa-9c7a-4bc3-9b51-5fc262c8c177
      polled status RUNNING for jobId 221692fa-9c7a-4bc3-9b51-5fc262c8c177
      polled status RUNNING for jobId 221692fa-9c7a-4bc3-9b51-5fc262c8c177
      polled status RUNNING for jobId 221692fa-9c7a-4bc3-9b51-5fc262c8c177
      polled status FINISHED for jobId 221692fa-9c7a-4bc3-9b51-5fc262c8c177
      #  tenantId                              status   message  logfile                                                      
      1  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  SUCCESS           cds-upgrade-buildlog-5ecc7413-2b7e-414a-9496-ad4a61f6cccf.txt
      
      
      POST https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/mtx/v1/model/asyncUpgrade 200 OK (88ms)
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/mtx/v1/model/status/221692fa-9c7a-4bc3-9b51-5fc262c8c177 200 OK (88ms)
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/mtx/v1/model/status/221692fa-9c7a-4bc3-9b51-5fc262c8c177 200 OK (88ms)
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/mtx/v1/model/status/221692fa-9c7a-4bc3-9b51-5fc262c8c177 200 OK (88ms)
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/mtx/v1/model/status/221692fa-9c7a-4bc3-9b51-5fc262c8c177 200 OK (88ms)
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/mtx/v1/model/status/221692fa-9c7a-4bc3-9b51-5fc262c8c177 200 OK (88ms)"
    `);
    nockDone();
    expect(loggerSpy.error.mock.calls).toHaveLength(0);
  });

  test("cds upgrade all", async () => {
    const { nockDone } = await nockBack("cds-upgrade-all.json", { afterRecord: anonymizeNock });

    expect(await cds.cdsUpgradeAll(await freshContext(), null, [false])).toMatchInlineSnapshot(`undefined`);
    // NOTE: since the upgrades happen in parallel the order of the "status" logs is not predictable
    const infoCallsFiltered = loggerSpy.info.mock.calls.filter(
      ([entry]) =>
        !entry ||
        (!entry.startsWith("polled status") && !(entry.startsWith("GET") && entry.includes("/v1/model/status/")))
    );
    expect(outputFromLoggerPartitionFetch(infoCallsFiltered)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      splitting tenants across 2 app instances of 'afc-mtx' as follows:
      instance 1: processing tenants 5ecc7413-2b7e-414a-9496-ad4a61f6cccf, 6917dfd6-7590-4033-af2a-140b75263b0d
      instance 2: processing tenants 7b20408e-3fe0-4ade-aa2e-ad97baac72e8, cb9158ce-f8fd-441b-b443-17219e8f79fa
      
      started upgrade on server with jobId 7ddfb04c-b498-4408-a1f6-582ceae21a39 polling interval 15sec
      started upgrade on server with jobId 16e66c46-602c-48f2-af9c-a53795570fb2 polling interval 15sec
      #  tenantId                              status   message  logfile                                                      
      1  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  SUCCESS           cds-upgrade-buildlog-5ecc7413-2b7e-414a-9496-ad4a61f6cccf.txt
      2  6917dfd6-7590-4033-af2a-140b75263b0d  SUCCESS           cds-upgrade-buildlog-6917dfd6-7590-4033-af2a-140b75263b0d.txt
      
      #  tenantId                              status   message  logfile                                                      
      1  7b20408e-3fe0-4ade-aa2e-ad97baac72e8  SUCCESS           cds-upgrade-buildlog-7b20408e-3fe0-4ade-aa2e-ad97baac72e8.txt
      2  cb9158ce-f8fd-441b-b443-17219e8f79fa  SUCCESS           cds-upgrade-buildlog-cb9158ce-f8fd-441b-b443-17219e8f79fa.txt
      
      
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/mtx/v1/provisioning/tenant 200 OK (88ms)
      POST https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/mtx/v1/model/asyncUpgrade 200 OK (88ms)
      POST https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/mtx/v1/model/asyncUpgrade 200 OK (88ms)"
    `);
    nockDone();
    expect(loggerSpy.error.mock.calls).toHaveLength(0);
  });
});

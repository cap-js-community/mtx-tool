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
const { outputFromLoggerPartitionFetch, anonymizeListTimestamps } = require("./util/static");

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

    const cdsListOutput = await cds.cdsList(await freshContext(), [], [true]);
    expect(anonymizeListTimestamps(cdsListOutput)).toMatchInlineSnapshot(`
"#  subscribedTenantId                    subscribedSubdomain   subscriptionAppName  eventType  created_on  updated_on
1  4c0909b1-a84e-4763-a26e-532fdb9e40fa  hw6-apps-eu10         afc-dev              CREATE                           
2  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  skyfin-company        afc-dev              UPDATE                           
3  6917dfd6-7590-4033-af2a-140b75263b0d  skyfin-debug-company  afc-dev              UPDATE                           
4  848a0f14-792d-4bd2-821c-7c6280780ca3  saas-starter-eu-10    afc-dev              CREATE                           
5  cb9158ce-f8fd-441b-b443-17219e8f79fa  skysand               afc-dev              UPDATE                           
6  dde70ec5-983d-4848-b50c-fb2cdac7d359  skyfin-test-3         afc-dev              CREATE                           "
`);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
"targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
using cds-mtxs apis

GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/saas-provisioning/tenant 200 OK (88ms)"
`);
    loggerSpy.info.mockClear();
    expect(await cds.cdsList(await freshContext(), [], [false])).toMatchInlineSnapshot(`
"#  subscribedTenantId                    subscribedSubdomain   subscriptionAppName  eventType
1  4c0909b1-a84e-4763-a26e-532fdb9e40fa  hw6-apps-eu10         afc-dev              CREATE   
2  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  skyfin-company        afc-dev              UPDATE   
3  6917dfd6-7590-4033-af2a-140b75263b0d  skyfin-debug-company  afc-dev              UPDATE   
4  848a0f14-792d-4bd2-821c-7c6280780ca3  saas-starter-eu-10    afc-dev              CREATE   
5  cb9158ce-f8fd-441b-b443-17219e8f79fa  skysand               afc-dev              UPDATE   
6  dde70ec5-983d-4848-b50c-fb2cdac7d359  skyfin-test-3         afc-dev              CREATE   "
`);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
"targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/saas-provisioning/tenant 200 OK (88ms)"
`);
    loggerSpy.info.mockClear();
    expect(await cds.cdsLongList(await freshContext(), [])).toMatchSnapshot();
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
"targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/saas-provisioning/tenant 200 OK (88ms)"
`);

    nockDone();
    expect(loggerSpy.error.mock.calls).toHaveLength(0);
  });

  test("cds list and longlist filtered", async () => {
    const { nockDone } = await nockBack("cds-list-filtered.json", { afterRecord: anonymizeNock });

    const cdsListOutput = await cds.cdsList(await freshContext(), [testTenantId], [true]);
    expect(anonymizeListTimestamps(cdsListOutput)).toMatchInlineSnapshot(`
"subscribedTenantId                    subscribedSubdomain  subscriptionAppName  eventType  created_on  updated_on
5ecc7413-2b7e-414a-9496-ad4a61f6cccf  skyfin-company       afc-dev              UPDATE                           "
`);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
"targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/saas-provisioning/tenant/5ecc7413-2b7e-414a-9496-ad4a61f6cccf 200 OK (88ms)"
`);
    loggerSpy.info.mockClear();
    expect(await cds.cdsList(await freshContext(), [testTenantId], [false])).toMatchInlineSnapshot(`
      "subscribedTenantId                    subscribedSubdomain  subscriptionAppName  eventType
      5ecc7413-2b7e-414a-9496-ad4a61f6cccf  skyfin-company       afc-dev              UPDATE   "
    `);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
"targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/saas-provisioning/tenant/5ecc7413-2b7e-414a-9496-ad4a61f6cccf 200 OK (88ms)"
`);
    loggerSpy.info.mockClear();
    expect(await cds.cdsLongList(await freshContext(), [testTenantId])).toMatchInlineSnapshot(`
"[
  {
    "subscribedTenantId": "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
    "subscriptionAppName": "afc-dev",
    "subscriptionAppId": "afc-dev!t5874",
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
    "createdAt": null,
    "modifiedAt": null
  }
]"
`);
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
"targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/saas-provisioning/tenant/5ecc7413-2b7e-414a-9496-ad4a61f6cccf 200 OK (88ms)"
`);

    nockDone();
    expect(loggerSpy.error.mock.calls).toHaveLength(0);
  });

  test("cds upgrade tenant and auto-upgrade", async () => {
    const { nockDone } = await nockBack("cds-upgrade-tenant.json", { afterRecord: anonymizeNock });

    expect(await cds.cdsUpgradeTenant(await freshContext(), [testTenantId], [true])).toBeUndefined();
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
"targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
started upgrade on server with jobId e85db10b-c269-4897-bd78-dde0d36f72cc polling interval 15sec
polled status RUNNING for jobId e85db10b-c269-4897-bd78-dde0d36f72cc
polled status RUNNING for jobId e85db10b-c269-4897-bd78-dde0d36f72cc
polled status FINISHED for jobId e85db10b-c269-4897-bd78-dde0d36f72cc
#  tenantId                              status    message
1  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  FINISHED         


POST https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/saas-provisioning/upgrade 202 Accepted (88ms)
GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='e85db10b-c269-4897-bd78-dde0d36f72cc') 200 OK (88ms)
GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='e85db10b-c269-4897-bd78-dde0d36f72cc') 200 OK (88ms)
GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='e85db10b-c269-4897-bd78-dde0d36f72cc') 200 OK (88ms)
GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollTask(ID='1e91c895-73d8-4ef1-80a0-8cd6efd46add') 200 OK (88ms)"
`);
    loggerSpy.info.mockClear();
    expect(await cds.cdsUpgradeTenant(await freshContext(), [testTenantId], [false])).toBeUndefined();
    expect(outputFromLoggerPartitionFetch(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
"targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
started upgrade on server with jobId 00e7cfd9-b5aa-4485-b6c7-ab79b8f08e0c polling interval 15sec
polled status RUNNING for jobId 00e7cfd9-b5aa-4485-b6c7-ab79b8f08e0c
polled status FINISHED for jobId 00e7cfd9-b5aa-4485-b6c7-ab79b8f08e0c
#  tenantId                              status    message
1  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  FINISHED         


POST https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/saas-provisioning/upgrade 202 Accepted (88ms)
GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='00e7cfd9-b5aa-4485-b6c7-ab79b8f08e0c') 200 OK (88ms)
GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='00e7cfd9-b5aa-4485-b6c7-ab79b8f08e0c') 200 OK (88ms)
GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollTask(ID='48b5f3d2-5803-43f2-84ae-c785bf1cc26e') 200 OK (88ms)"
`);
    nockDone();
    expect(loggerSpy.error.mock.calls).toHaveLength(0);
  });

  test("cds upgrade all", async () => {
    const { nockDone } = await nockBack("cds-upgrade-all.json", { afterRecord: anonymizeNock });

    expect(await cds.cdsUpgradeAll(await freshContext(), null, [false])).toBeUndefined();
    // NOTE: since the upgrades happen in parallel the order of the "status" logs is not predictable
    const infoCallsFiltered = loggerSpy.info.mock.calls.filter(
      ([entry]) =>
        !entry ||
        (!entry.startsWith("polled status") && !(entry.startsWith("GET") && entry.includes("/v1/model/status/")))
    );
    expect(outputFromLoggerPartitionFetch(infoCallsFiltered)).toMatchInlineSnapshot(`
"targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
started upgrade on server with jobId 83499cfe-548a-4245-9eae-f25aa06d879c polling interval 15sec
#  tenantId                              status    message
1  4c0909b1-a84e-4763-a26e-532fdb9e40fa  FINISHED         
2  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  FINISHED         
3  6917dfd6-7590-4033-af2a-140b75263b0d  FINISHED         
4  848a0f14-792d-4bd2-821c-7c6280780ca3  FINISHED         
5  cb9158ce-f8fd-441b-b443-17219e8f79fa  FINISHED         
6  dde70ec5-983d-4848-b50c-fb2cdac7d359  FINISHED         


POST https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/saas-provisioning/upgrade 202 Accepted (88ms)
GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='83499cfe-548a-4245-9eae-f25aa06d879c') 200 OK (88ms)
GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='83499cfe-548a-4245-9eae-f25aa06d879c') 200 OK (88ms)
GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='83499cfe-548a-4245-9eae-f25aa06d879c') 200 OK (88ms)
GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='83499cfe-548a-4245-9eae-f25aa06d879c') 200 OK (88ms)
GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='83499cfe-548a-4245-9eae-f25aa06d879c') 200 OK (88ms)
GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollTask(ID='e0ae628f-e637-4d5a-a7d6-9c4e36522ed5') 200 OK (88ms)
GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollTask(ID='6a2da1cd-b1d7-4a87-aae7-5dc28a4766fe') 200 OK (88ms)
GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollTask(ID='f97f130d-6f0f-4951-8097-5a765e964072') 200 OK (88ms)
GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollTask(ID='50212773-e588-41f7-a036-bd4d8a8ed24f') 200 OK (88ms)
GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollTask(ID='290cca19-0cc0-4eae-8f0c-53dee69c13fe') 200 OK (88ms)
GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollTask(ID='d9f83193-2860-4a1b-a0d9-1f763c5ded4d') 200 OK (88ms)"
`);
    nockDone();
    expect(loggerSpy.error.mock.calls).toHaveLength(0);
  });
});

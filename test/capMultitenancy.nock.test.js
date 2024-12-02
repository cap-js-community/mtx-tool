"use strict";

const pathlib = require("path");
const nock = require("nock");

const { newContext } = require("../src/context");
const cds = require("../src/submodules/capMultitenancy");
const { outputFromLoggerPartitionFetch, anonymizeListTimestamps } = require("./util/static");

nock.back.fixtures = pathlib.resolve(`${__dirname}/../test-nock-record/__nock-fixtures__`);
nock.back.setMode("lockdown");

jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  writeFile: jest.fn((filename, data, cb) => cb()),
}));

jest.mock("../src/shared/static", () => require("./__mocks/sharedNockPlayback/static"));

const { Logger: MockLogger } = require("../src/shared/logger");
const mockLogger = MockLogger.getInstance();
jest.mock("../src/shared/logger", () => require("./__mocks/shared/logger"));

const testTenantId = "5ecc7413-2b7e-414a-9496-ad4a61f6cccf";

const freshContext = async () => await newContext({ usePersistedCache: false, isReadonlyCommand: false });

describe("cds tests", () => {
  afterEach(() => {
    cds._._reset();
    nock.restore();
    jest.clearAllMocks();
  });

  test("cds list and longlist", async () => {
    const { nockDone } = await nock.back("cds-list.json", { afterRecord: anonymizeNock });

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
    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      using cds-mtxs apis

      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/saas-provisioning/tenant 200 OK (88ms)"
    `);
    mockLogger.info.mockClear();
    expect(await cds.cdsList(await freshContext(), [], [false])).toMatchInlineSnapshot(`
      "#  subscribedTenantId                    subscribedSubdomain   subscriptionAppName  eventType
      1  4c0909b1-a84e-4763-a26e-532fdb9e40fa  hw6-apps-eu10         afc-dev              CREATE   
      2  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  skyfin-company        afc-dev              UPDATE   
      3  6917dfd6-7590-4033-af2a-140b75263b0d  skyfin-debug-company  afc-dev              UPDATE   
      4  848a0f14-792d-4bd2-821c-7c6280780ca3  saas-starter-eu-10    afc-dev              CREATE   
      5  cb9158ce-f8fd-441b-b443-17219e8f79fa  skysand               afc-dev              UPDATE   
      6  dde70ec5-983d-4848-b50c-fb2cdac7d359  skyfin-test-3         afc-dev              CREATE   "
    `);
    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/saas-provisioning/tenant 200 OK (88ms)"
    `);
    mockLogger.info.mockClear();
    expect(await cds.cdsLongList(await freshContext(), [])).toMatchSnapshot();
    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/saas-provisioning/tenant 200 OK (88ms)"
    `);

    nockDone();
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });

  test("cds list and longlist filtered", async () => {
    const { nockDone } = await nock.back("cds-list-filtered.json", { afterRecord: anonymizeNock });

    const cdsListOutput = await cds.cdsList(await freshContext(), [testTenantId], [true]);
    expect(anonymizeListTimestamps(cdsListOutput)).toMatchInlineSnapshot(`
      "subscribedTenantId                    subscribedSubdomain  subscriptionAppName  eventType  created_on  updated_on
      5ecc7413-2b7e-414a-9496-ad4a61f6cccf  skyfin-company       afc-dev              UPDATE                           "
    `);
    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/saas-provisioning/tenant/5ecc7413-2b7e-414a-9496-ad4a61f6cccf 200 OK (88ms)"
    `);
    mockLogger.info.mockClear();
    expect(await cds.cdsList(await freshContext(), [testTenantId], [false])).toMatchInlineSnapshot(`
      "subscribedTenantId                    subscribedSubdomain  subscriptionAppName  eventType
      5ecc7413-2b7e-414a-9496-ad4a61f6cccf  skyfin-company       afc-dev              UPDATE   "
    `);
    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/saas-provisioning/tenant/5ecc7413-2b7e-414a-9496-ad4a61f6cccf 200 OK (88ms)"
    `);
    mockLogger.info.mockClear();
    expect(await cds.cdsLongList(await freshContext(), [testTenantId])).toMatchInlineSnapshot(`
      [
        {
          "createdAt": null,
          "eventType": "UPDATE",
          "globalAccountGUID": "011b4e7a-43b5-4f63-819a-9b1e46ab23b6",
          "modifiedAt": null,
          "providerSubaccountId": "7b20408e-3fe0-4ade-aa2e-ad97baac72e8",
          "subscribedCrmId": "",
          "subscribedLicenseType": "SAPDEV",
          "subscribedSubaccountId": "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
          "subscribedSubdomain": "skyfin-company",
          "subscribedTenantId": "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
          "subscribedZoneId": "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
          "subscriptionAppAmount": 1,
          "subscriptionAppId": "afc-dev!t5874",
          "subscriptionAppName": "afc-dev",
          "subscriptionAppPlan": "standard",
          "userId": "APPLICATION_OWNER",
        },
      ]
    `);
    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/saas-provisioning/tenant/5ecc7413-2b7e-414a-9496-ad4a61f6cccf 200 OK (88ms)"
    `);

    nockDone();
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });

  test("cds upgrade tenant and auto-upgrade", async () => {
    await nock.back("cds-upgrade-tenant.json");
    expect(await cds.cdsUpgradeTenant(await freshContext(), [testTenantId], [true])).toBeUndefined();
    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      started upgrade on server with jobId e85db10b-c269-4897-bd78-dde0d36f72cc polling interval 15sec
      job e85db10b-c269-4897-bd78-dde0d36f72cc is RUNNING with tasks queued/running: 0/1 | failed/finished: 0/0
      job e85db10b-c269-4897-bd78-dde0d36f72cc is RUNNING with tasks queued/running: 0/1 | failed/finished: 0/0
      job e85db10b-c269-4897-bd78-dde0d36f72cc is FINISHED with tasks queued/running: 0/0 | failed/finished: 0/1
      #  tenantId                              status    message
      1  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  FINISHED         

      POST https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/saas-provisioning/upgrade 202 Accepted (88ms)
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='e85db10b-c269-4897-bd78-dde0d36f72cc') 200 OK (88ms)
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='e85db10b-c269-4897-bd78-dde0d36f72cc') 200 OK (88ms)
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='e85db10b-c269-4897-bd78-dde0d36f72cc') 200 OK (88ms)"
    `);
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });

  test("cds upgrade all", async () => {
    await nock.back("cds-upgrade-all.json");
    expect(await cds.cdsUpgradeAll(await freshContext(), null, [false])).toBeUndefined();

    // NOTE: since the upgrades happen in parallel the order of the "status" logs is not predictable
    const infoCallsFiltered = mockLogger.info.mock.calls.filter(
      ([entry]) =>
        !entry ||
        (!entry.startsWith("polled status") && !(entry.startsWith("GET") && entry.includes("/v1/model/status/")))
    );
    expect(outputFromLoggerPartitionFetch(infoCallsFiltered)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      started upgrade on server with jobId 83499cfe-548a-4245-9eae-f25aa06d879c polling interval 15sec
      job 83499cfe-548a-4245-9eae-f25aa06d879c is RUNNING with tasks queued/running: 1/5 | failed/finished: 0/0
      job 83499cfe-548a-4245-9eae-f25aa06d879c is RUNNING with tasks queued/running: 1/4 | failed/finished: 0/1
      job 83499cfe-548a-4245-9eae-f25aa06d879c is RUNNING with tasks queued/running: 0/1 | failed/finished: 0/5
      job 83499cfe-548a-4245-9eae-f25aa06d879c is RUNNING with tasks queued/running: 0/1 | failed/finished: 0/5
      job 83499cfe-548a-4245-9eae-f25aa06d879c is FINISHED with tasks queued/running: 0/0 | failed/finished: 0/6
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
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='83499cfe-548a-4245-9eae-f25aa06d879c') 200 OK (88ms)"
    `);
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });
});

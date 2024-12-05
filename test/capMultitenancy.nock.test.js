"use strict";

const pathlib = require("path");
const nock = require("nock");

const { newContext } = require("../src/context");
const cds = require("../src/submodules/capMultitenancy");
const { outputFromLoggerPartitionFetch, anonymizeListTimestamps, collectRequestCount } = require("./util/static");

nock.back.fixtures = pathlib.resolve(`${__dirname}/../test-nock-record/__nock-fixtures__`);
nock.back.setMode("lockdown");

jest.mock("../src/shared/static", () => require("./__mocks/sharedNockPlayback/static"));

const { Logger: MockLogger } = require("../src/shared/logger");
const mockLogger = MockLogger.getInstance();
jest.mock("../src/shared/logger", () => require("./__mocks/shared/logger"));

const testTenantId = "5ecc7413-2b7e-414a-9496-ad4a61f6cccf";

const freshContext = async () => await newContext({ usePersistedCache: false, isReadonlyCommand: false });

describe("cds nock tests", () => {
  afterEach(() => {
    nock.restore();
  });

  test("request count", async () => {
    expect(collectRequestCount(require(`${nock.back.fixtures}/cds-list.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 9,
        "GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 1,
        "HEAD https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/cds-list-filtered.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 9,
        "GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 1,
        "HEAD https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/cds-long-list.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 9,
        "GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 1,
        "HEAD https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/cds-long-list-filtered.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 9,
        "GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 1,
        "HEAD https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/cds-upgrade-all.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 9,
        "GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 9,
        "HEAD https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/cds-upgrade-tenant.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 9,
        "GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 3,
        "HEAD https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
  });

  describe("cds list", () => {
    test("cds list basic", async () => {
      await nock.back("cds-list.json");
      const output = await cds.cdsList(await freshContext(), [], [false, false]);
      expect(output).toMatchInlineSnapshot(`
        "#   subscribedTenantId                    subscribedSubdomain    subscriptionAppName  eventType
        1   288393a7-972c-4fa8-acfd-12299c4db374  nga-dev-eu10-uofvpsx0  afc-dev              UPDATE   
        2   4c0909b1-a84e-4763-a26e-532fdb9e40fa  hw6-apps-eu10          afc-dev              UPDATE   
        3   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  skyfin-company         afc-dev              UPDATE   
        4   663d2938-be50-44ab-92ca-538855eb594f  skyfin-workzone        afc-dev              CREATE   
        5   6917dfd6-7590-4033-af2a-140b75263b0d  skyfin-debug-company   afc-dev              UPDATE   
        6   9c418100-6318-4e8a-b4b2-1114f4f44aef  skyfin-booster         afc-dev              CREATE   
        7   ae2dc112-9745-4f5e-8feb-79ebdc0094bd  skyfin-sap-start       afc-dev              UPDATE   
        8   cb9158ce-f8fd-441b-b443-17219e8f79fa  skysand                afc-dev              UPDATE   
        9   cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  jyd-dev-apps-eu10      afc-dev              UPDATE   
        10  dde70ec5-983d-4848-b50c-fb2cdac7d359  skyfin-test-3          afc-dev              UPDATE   "
      `);
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

        GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/saas-provisioning/tenant 200 OK (88ms)"
      `);
      expect(mockLogger.error.mock.calls).toHaveLength(0);
    });

    test("cds list timestamped", async () => {
      await nock.back("cds-list.json");
      const output = await cds.cdsList(await freshContext(), [], [true, false]);
      expect(anonymizeListTimestamps(output)).toMatchInlineSnapshot(`
        "#   subscribedTenantId                    subscribedSubdomain    subscriptionAppName  eventType  created_on  updated_on
        1   288393a7-972c-4fa8-acfd-12299c4db374  nga-dev-eu10-uofvpsx0  afc-dev              UPDATE     2024-01-05T07:56:20Z (x days ago)  2024-08-09T10:14:57Z (x days ago)  
        2   4c0909b1-a84e-4763-a26e-532fdb9e40fa  hw6-apps-eu10          afc-dev              UPDATE                                          2024-08-09T22:18:18Z (x days ago)  
        3   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  skyfin-company         afc-dev              UPDATE                                          2024-08-09T22:11:20Z (x days ago)  
        4   663d2938-be50-44ab-92ca-538855eb594f  skyfin-workzone        afc-dev              CREATE     2024-09-11T07:37:19Z (x days ago)  2024-09-11T07:37:19Z (x days ago)  
        5   6917dfd6-7590-4033-af2a-140b75263b0d  skyfin-debug-company   afc-dev              UPDATE     2024-06-26T10:31:05Z (x days ago)  2024-08-09T04:17:02Z (x days ago)  
        6   9c418100-6318-4e8a-b4b2-1114f4f44aef  skyfin-booster         afc-dev              CREATE     2024-11-27T06:54:40Z (x days ago)  2024-11-27T06:54:40Z (x days ago)  
        7   ae2dc112-9745-4f5e-8feb-79ebdc0094bd  skyfin-sap-start       afc-dev              UPDATE     2024-07-05T11:24:00Z (x days ago)  2024-08-08T04:10:14Z (x days ago)  
        8   cb9158ce-f8fd-441b-b443-17219e8f79fa  skysand                afc-dev              UPDATE                                          2024-08-09T12:27:04Z (x days ago)  
        9   cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  jyd-dev-apps-eu10      afc-dev              UPDATE     2024-03-19T16:57:50Z (x days ago)  2024-08-09T06:53:28Z (x days ago)  
        10  dde70ec5-983d-4848-b50c-fb2cdac7d359  skyfin-test-3          afc-dev              UPDATE     2024-07-09T08:43:19Z (x days ago)  2024-08-10T01:56:42Z (x days ago)  "
      `);
      expect(mockLogger.error.mock.calls).toHaveLength(0);
    });

    test("cds list json", async () => {
      await nock.back("cds-list.json");
      const output = await cds.cdsList(await freshContext(), [], [false, true]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error.mock.calls).toHaveLength(0);
    });

    test("cds list filtered basic", async () => {
      await nock.back("cds-list-filtered.json");
      const output = await cds.cdsList(await freshContext(), [testTenantId], [false, false]);
      expect(output).toMatchInlineSnapshot(`
        "subscribedTenantId                    subscribedSubdomain  subscriptionAppName  eventType
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  skyfin-company       afc-dev              UPDATE   "
      `);
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

        GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/saas-provisioning/tenant/5ecc7413-2b7e-414a-9496-ad4a61f6cccf 200 OK (88ms)"
      `);
      expect(mockLogger.error.mock.calls).toHaveLength(0);
    });

    test("cds list filtered timestamped", async () => {
      await nock.back("cds-list-filtered.json");
      const output = await cds.cdsList(await freshContext(), [testTenantId], [true, false]);
      expect(anonymizeListTimestamps(output)).toMatchInlineSnapshot(`
        "subscribedTenantId                    subscribedSubdomain  subscriptionAppName  eventType  created_on  updated_on
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  skyfin-company       afc-dev              UPDATE                 2024-08-09T22:11:20Z (x days ago)  "
      `);
      expect(mockLogger.error.mock.calls).toHaveLength(0);
    });

    test("cds list filtered json", async () => {
      await nock.back("cds-list-filtered.json");
      const output = await cds.cdsList(await freshContext(), [testTenantId], [false, true]);
      expect(output).toMatchSnapshot();
      expect(mockLogger.error.mock.calls).toHaveLength(0);
    });
  });

  describe("cds long list", () => {
    test("cds long list basic/json", async () => {
      await nock.back("cds-long-list.json");
      const output = await cds.cdsLongList(await freshContext(), []);
      expect(output).toMatchSnapshot();
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

        GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/saas-provisioning/tenant 200 OK (88ms)"
      `);
      expect(mockLogger.error.mock.calls).toHaveLength(0);
    });

    test("cds long list filtered basic/json", async () => {
      await nock.back("cds-long-list-filtered.json");
      const output = await cds.cdsLongList(await freshContext(), [testTenantId]);
      expect(output).toMatchSnapshot();
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"

        GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/saas-provisioning/tenant/5ecc7413-2b7e-414a-9496-ad4a61f6cccf 200 OK (88ms)"
      `);
      expect(mockLogger.error.mock.calls).toHaveLength(0);
    });
  });

  test("cds upgrade tenant and auto-upgrade", async () => {
    await nock.back("cds-upgrade-tenant.json");
    expect(await cds.cdsUpgradeTenant(await freshContext(), [testTenantId], [true])).toBeUndefined();
    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      started upgrade on server with jobId 8de6330c-6b52-40b0-86eb-10e0447f0c97 polling interval 15sec
      job 8de6330c-6b52-40b0-86eb-10e0447f0c97 is RUNNING with tasks queued/running: 0/1 | failed/finished: 0/0
      job 8de6330c-6b52-40b0-86eb-10e0447f0c97 is RUNNING with tasks queued/running: 0/1 | failed/finished: 0/0
      job 8de6330c-6b52-40b0-86eb-10e0447f0c97 is FINISHED with tasks queued/running: 0/0 | failed/finished: 0/1
      #  tenantId                              status    message
      1  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  FINISHED         

      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='8de6330c-6b52-40b0-86eb-10e0447f0c97') 200 OK (88ms)
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='8de6330c-6b52-40b0-86eb-10e0447f0c97') 200 OK (88ms)
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='8de6330c-6b52-40b0-86eb-10e0447f0c97') 200 OK (88ms)
      POST https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/saas-provisioning/upgrade 202 Accepted (88ms)"
    `);
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });

  test("cds upgrade all", async () => {
    await nock.back("cds-upgrade-all.json");
    expect(await cds.cdsUpgradeAll(await freshContext(), null, [false])).toBeUndefined();
    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      started upgrade on server with jobId d8c2f77d-5e86-48d7-a877-caebc8aba8ff polling interval 15sec
      job d8c2f77d-5e86-48d7-a877-caebc8aba8ff is RUNNING with tasks queued/running:  0/ 4 | failed/finished:  0/ 0
      job d8c2f77d-5e86-48d7-a877-caebc8aba8ff is RUNNING with tasks queued/running:  0/ 4 | failed/finished:  0/ 0
      job d8c2f77d-5e86-48d7-a877-caebc8aba8ff is RUNNING with tasks queued/running:  0/ 3 | failed/finished:  0/ 3
      job d8c2f77d-5e86-48d7-a877-caebc8aba8ff is RUNNING with tasks queued/running:  0/ 3 | failed/finished:  0/ 4
      job d8c2f77d-5e86-48d7-a877-caebc8aba8ff is RUNNING with tasks queued/running:  0/ 3 | failed/finished:  0/ 4
      job d8c2f77d-5e86-48d7-a877-caebc8aba8ff is RUNNING with tasks queued/running:  0/ 3 | failed/finished:  0/ 7
      job d8c2f77d-5e86-48d7-a877-caebc8aba8ff is RUNNING with tasks queued/running:  0/ 3 | failed/finished:  0/ 7
      job d8c2f77d-5e86-48d7-a877-caebc8aba8ff is RUNNING with tasks queued/running:  0/ 3 | failed/finished:  0/ 7
      job d8c2f77d-5e86-48d7-a877-caebc8aba8ff is FINISHED with tasks queued/running:  0/ 0 | failed/finished:  0/10
      #   tenantId                              status    message
      1   288393a7-972c-4fa8-acfd-12299c4db374  FINISHED         
      2   4c0909b1-a84e-4763-a26e-532fdb9e40fa  FINISHED         
      3   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  FINISHED         
      4   663d2938-be50-44ab-92ca-538855eb594f  FINISHED         
      5   6917dfd6-7590-4033-af2a-140b75263b0d  FINISHED         
      6   9c418100-6318-4e8a-b4b2-1114f4f44aef  FINISHED         
      7   ae2dc112-9745-4f5e-8feb-79ebdc0094bd  FINISHED         
      8   cb9158ce-f8fd-441b-b443-17219e8f79fa  FINISHED         
      9   cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  FINISHED         
      10  dde70ec5-983d-4848-b50c-fb2cdac7d359  FINISHED         

      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='d8c2f77d-5e86-48d7-a877-caebc8aba8ff') 200 OK (88ms)
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='d8c2f77d-5e86-48d7-a877-caebc8aba8ff') 200 OK (88ms)
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='d8c2f77d-5e86-48d7-a877-caebc8aba8ff') 200 OK (88ms)
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='d8c2f77d-5e86-48d7-a877-caebc8aba8ff') 200 OK (88ms)
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='d8c2f77d-5e86-48d7-a877-caebc8aba8ff') 200 OK (88ms)
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='d8c2f77d-5e86-48d7-a877-caebc8aba8ff') 200 OK (88ms)
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='d8c2f77d-5e86-48d7-a877-caebc8aba8ff') 200 OK (88ms)
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='d8c2f77d-5e86-48d7-a877-caebc8aba8ff') 200 OK (88ms)
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='d8c2f77d-5e86-48d7-a877-caebc8aba8ff') 200 OK (88ms)
      POST https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/saas-provisioning/upgrade 202 Accepted (88ms)"
    `);
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });
});

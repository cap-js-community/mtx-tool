"use strict";

const pathlib = require("path");
const nock = require("nock");

const { newContext } = require("../../src/context");
const cds = require("../../src/submodules/capMultitenancy");
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

describe("cds nock tests", () => {
  afterEach(() => {
    LogRequestId.reset();
    nock.restore();
  });

  test("request count", async () => {
    expect(collectRequestCount(require(`${nock.back.fixtures}/cds-list.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 9,
        "GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/cds-list-filtered.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 9,
        "GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/cds-long-list.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 9,
        "GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/cds-long-list-filtered.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 9,
        "GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/cds-upgrade-all.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 9,
        "GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/cds-upgrade-tenant.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 9,
        "GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 1,
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
        "#   tenantId                              subdomain                       appName      commercialAppName  eventType
        1   0de2abab-9030-4524-9940-e5b37ac75d92  skyfin-task-model-management    afc-dev      afc-dev            CREATE   
        2   1bbe07b0-4de1-4cdb-830d-49b0ddf20b53  skyfin-ias-test                 afc-dev-sms  afc-dev            CREATE   
        3   4a5bcd5e-733d-4865-8f05-91937b680d4c  afc-402500-c22wco6t             afc-dev      afc-dev            CREATE   
        4   4c0909b1-a84e-4763-a26e-532fdb9e40fa  hw6-apps-eu10                   afc-dev      afc-dev            UPDATE   
        5   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  skyfin-company                  afc-dev-sms  afc-dev            CREATE   
        6   663d2938-be50-44ab-92ca-538855eb594f  skyfin-workzone                 afc-dev      afc-dev            CREATE   
        7   6a067783-ea1b-4dab-a368-ce0657e17a92  skyfin-test                     afc-dev      afc-dev            CREATE   
        8   73675fb3-0298-4cf3-8f86-a78c18392193  i050811sapdev2-myafc-bybooster  afc-dev      afc-dev            CREATE   
        9   86ab464d-5770-46b4-b93d-292c1416c453  acra-dev-eu10-afc               afc-dev      afc-dev            CREATE   
        10  9c418100-6318-4e8a-b4b2-1114f4f44aef  skyfin-booster                  afc-dev      afc-dev            CREATE   
        11  a1c320ff-b7f8-48d8-a20d-b44e92f69e65  tk02r4qx17c7dqhv                afc-dev      afc-dev            CREATE   
        12  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  skyfin-sap-start                afc-dev      afc-dev            UPDATE   
        13  ba22b06c-b55f-4940-ae38-b92a5928c8a5  v20t58n-51jq8hrq                afc-dev      afc-dev            CREATE   
        14  be884689-aad4-486e-b556-23fdcf266f6d  test-afc-g2bup7lj               afc-dev      afc-dev            CREATE   
        15  cb9158ce-f8fd-441b-b443-17219e8f79fa  skysand                         afc-dev      afc-dev            UPDATE   
        16  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  jyd-dev-apps-eu10               afc-dev      afc-dev            UPDATE   
        17  d91fb749-a148-479f-b29d-71b1b6a9309d  afctest1                        afc-dev      afc-dev            CREATE   "
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
        "#   tenantId                              subdomain                       appName      commercialAppName  eventType  created_on  updated_on
        1   0de2abab-9030-4524-9940-e5b37ac75d92  skyfin-task-model-management    afc-dev      afc-dev            CREATE     2025-04-04T07:49:32Z (x days ago)  2025-04-04T07:49:32Z (x days ago)  
        2   1bbe07b0-4de1-4cdb-830d-49b0ddf20b53  skyfin-ias-test                 afc-dev-sms  afc-dev            CREATE     2025-09-19T08:58:06Z (x days ago)  2025-09-19T09:16:02Z (x days ago)  
        3   4a5bcd5e-733d-4865-8f05-91937b680d4c  afc-402500-c22wco6t             afc-dev      afc-dev            CREATE     2025-07-02T09:10:17Z (x days ago)  2025-07-02T09:10:17Z (x days ago)  
        4   4c0909b1-a84e-4763-a26e-532fdb9e40fa  hw6-apps-eu10                   afc-dev      afc-dev            UPDATE                                          2024-08-09T22:18:18Z (x days ago)  
        5   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  skyfin-company                  afc-dev-sms  afc-dev            CREATE                                          2025-09-18T09:24:38Z (x days ago)  
        6   663d2938-be50-44ab-92ca-538855eb594f  skyfin-workzone                 afc-dev      afc-dev            CREATE     2024-09-11T07:37:19Z (x days ago)  2024-09-11T07:37:19Z (x days ago)  
        7   6a067783-ea1b-4dab-a368-ce0657e17a92  skyfin-test                     afc-dev      afc-dev            CREATE     2025-01-17T07:31:49Z (x days ago)  2025-01-17T07:31:49Z (x days ago)  
        8   73675fb3-0298-4cf3-8f86-a78c18392193  i050811sapdev2-myafc-bybooster  afc-dev      afc-dev            CREATE     2025-05-22T12:12:15Z (x days ago)  2025-05-22T12:12:15Z (x days ago)  
        9   86ab464d-5770-46b4-b93d-292c1416c453  acra-dev-eu10-afc               afc-dev      afc-dev            CREATE     2025-09-23T14:28:13Z (x days ago)  2025-09-23T14:28:13Z (x days ago)  
        10  9c418100-6318-4e8a-b4b2-1114f4f44aef  skyfin-booster                  afc-dev      afc-dev            CREATE     2024-11-27T06:54:40Z (x days ago)  2024-11-27T06:54:40Z (x days ago)  
        11  a1c320ff-b7f8-48d8-a20d-b44e92f69e65  tk02r4qx17c7dqhv                afc-dev      afc-dev            CREATE     2025-01-29T08:04:38Z (x days ago)  2025-01-29T08:04:38Z (x days ago)  
        12  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  skyfin-sap-start                afc-dev      afc-dev            UPDATE     2024-07-05T11:24:00Z (x days ago)  2024-08-08T04:10:14Z (x days ago)  
        13  ba22b06c-b55f-4940-ae38-b92a5928c8a5  v20t58n-51jq8hrq                afc-dev      afc-dev            CREATE     2025-09-25T10:07:34Z (x days ago)  2025-09-25T10:07:34Z (x days ago)  
        14  be884689-aad4-486e-b556-23fdcf266f6d  test-afc-g2bup7lj               afc-dev      afc-dev            CREATE     2024-12-09T03:54:44Z (x days ago)  2024-12-09T03:54:44Z (x days ago)  
        15  cb9158ce-f8fd-441b-b443-17219e8f79fa  skysand                         afc-dev      afc-dev            UPDATE                                          2024-08-09T12:27:04Z (x days ago)  
        16  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  jyd-dev-apps-eu10               afc-dev      afc-dev            UPDATE     2024-03-19T16:57:50Z (x days ago)  2024-08-09T06:53:28Z (x days ago)  
        17  d91fb749-a148-479f-b29d-71b1b6a9309d  afctest1                        afc-dev      afc-dev            CREATE     2025-05-22T12:30:46Z (x days ago)  2025-05-22T12:30:46Z (x days ago)  "
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
        "tenantId                              subdomain       appName      commercialAppName  eventType
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  skyfin-company  afc-dev-sms  afc-dev            CREATE   "
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
        "tenantId                              subdomain       appName      commercialAppName  eventType  created_on  updated_on
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  skyfin-company  afc-dev-sms  afc-dev            CREATE                 2025-09-18T09:24:38Z (x days ago)  "
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
      started upgrade on server with jobId f744b04f-df01-42e8-8559-bdbb77e074c4 polling interval 15sec
      job f744b04f-df01-42e8-8559-bdbb77e074c4 is FINISHED with tasks queued/running: 0/0 | failed/finished: 0/1
      #  tenantId                              status    message  log                                                 
      1  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  FINISHED           cds-upgrade-5ecc7413-2b7e-414a-9496-ad4a61f6cccf.txt
      
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='f744b04f-df01-42e8-8559-bdbb77e074c4') 200 OK (88ms)
      POST https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/saas-provisioning/upgrade 202 Accepted (88ms)"
    `);
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });

  test("cds upgrade all", async () => {
    await nock.back("cds-upgrade-all.json");
    expect(await cds.cdsUpgradeAll(await freshContext(), null, [false, false])).toBeUndefined();
    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      started upgrade on server with jobId 9e3562f1-c128-4ff4-9708-3c454b0f800b polling interval 15sec
      job 9e3562f1-c128-4ff4-9708-3c454b0f800b is FINISHED with tasks queued/running:  0/ 0 | failed/finished:  0/17
      #   tenantId                              status    message  log                                                 
      1   0de2abab-9030-4524-9940-e5b37ac75d92  FINISHED           cds-upgrade-0de2abab-9030-4524-9940-e5b37ac75d92.txt
      2   1bbe07b0-4de1-4cdb-830d-49b0ddf20b53  FINISHED           cds-upgrade-1bbe07b0-4de1-4cdb-830d-49b0ddf20b53.txt
      3   4a5bcd5e-733d-4865-8f05-91937b680d4c  FINISHED           cds-upgrade-4a5bcd5e-733d-4865-8f05-91937b680d4c.txt
      4   4c0909b1-a84e-4763-a26e-532fdb9e40fa  FINISHED           cds-upgrade-4c0909b1-a84e-4763-a26e-532fdb9e40fa.txt
      5   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  FINISHED           cds-upgrade-5ecc7413-2b7e-414a-9496-ad4a61f6cccf.txt
      6   663d2938-be50-44ab-92ca-538855eb594f  FINISHED           cds-upgrade-663d2938-be50-44ab-92ca-538855eb594f.txt
      7   6a067783-ea1b-4dab-a368-ce0657e17a92  FINISHED           cds-upgrade-6a067783-ea1b-4dab-a368-ce0657e17a92.txt
      8   73675fb3-0298-4cf3-8f86-a78c18392193  FINISHED           cds-upgrade-73675fb3-0298-4cf3-8f86-a78c18392193.txt
      9   86ab464d-5770-46b4-b93d-292c1416c453  FINISHED           cds-upgrade-86ab464d-5770-46b4-b93d-292c1416c453.txt
      10  9c418100-6318-4e8a-b4b2-1114f4f44aef  FINISHED           cds-upgrade-9c418100-6318-4e8a-b4b2-1114f4f44aef.txt
      11  a1c320ff-b7f8-48d8-a20d-b44e92f69e65  FINISHED           cds-upgrade-a1c320ff-b7f8-48d8-a20d-b44e92f69e65.txt
      12  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  FINISHED           cds-upgrade-ae2dc112-9745-4f5e-8feb-79ebdc0094bd.txt
      13  ba22b06c-b55f-4940-ae38-b92a5928c8a5  FINISHED           cds-upgrade-ba22b06c-b55f-4940-ae38-b92a5928c8a5.txt
      14  be884689-aad4-486e-b556-23fdcf266f6d  FINISHED           cds-upgrade-be884689-aad4-486e-b556-23fdcf266f6d.txt
      15  cb9158ce-f8fd-441b-b443-17219e8f79fa  FINISHED           cds-upgrade-cb9158ce-f8fd-441b-b443-17219e8f79fa.txt
      16  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  FINISHED           cds-upgrade-cf528063-6a43-4bf2-8ccc-ca4e6d75d88e.txt
      17  d91fb749-a148-479f-b29d-71b1b6a9309d  FINISHED           cds-upgrade-d91fb749-a148-479f-b29d-71b1b6a9309d.txt
      
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='9e3562f1-c128-4ff4-9708-3c454b0f800b') 200 OK (88ms)
      POST https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/saas-provisioning/upgrade 202 Accepted (88ms)"
    `);
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });
});

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
        "GET https://api.cf.sap.hana.ondemand.com:443": 24,
        "GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/cds-list-filtered.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 24,
        "GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/cds-long-list.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 24,
        "GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/cds-long-list-filtered.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 24,
        "GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/cds-upgrade-all.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 24,
        "GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com:443": 1,
        "POST https://skyfin.authentication.cert.sap.hana.ondemand.com:443": 1,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/cds-upgrade-tenant.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 24,
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
        "#   tenantId                              subdomain                       appName      eventType
        1   0de2abab-9030-4524-9940-e5b37ac75d92  skyfin-task-model-management    afc-dev      CREATE   
        2   116b3ac3-6d84-4ed5-81be-0af4464a09b6  skyfin-onboarding-test          afc-dev-sms  CREATE   
        3   1bbe07b0-4de1-4cdb-830d-49b0ddf20b53  skyfin-ias-test                 afc-dev-sms  CREATE   
        4   4a5bcd5e-733d-4865-8f05-91937b680d4c  afc-402500-c22wco6t             afc-dev      CREATE   
        5   4c0909b1-a84e-4763-a26e-532fdb9e40fa  hw6-apps-eu10                   afc-dev      UPDATE   
        6   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  skyfin-company                  afc-dev-sms  CREATE   
        7   663d2938-be50-44ab-92ca-538855eb594f  skyfin-workzone                 afc-dev      CREATE   
        8   73675fb3-0298-4cf3-8f86-a78c18392193  i050811sapdev2-myafc-bybooster  afc-dev      CREATE   
        9   79604d57-3933-4a66-81c2-a022413ec11d  skyfin-booster-ias              afc-dev-sms  CREATE   
        10  86ab464d-5770-46b4-b93d-292c1416c453  acra-dev-eu10-afc               afc-dev      CREATE   
        11  9c418100-6318-4e8a-b4b2-1114f4f44aef  skyfin-booster                  afc-dev      CREATE   
        12  a1c320ff-b7f8-48d8-a20d-b44e92f69e65  tk02r4qx17c7dqhv                afc-dev      CREATE   
        13  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  skyfin-sap-start                afc-dev      UPDATE   
        14  b46f4c09-e46e-432b-b837-0aad96d145f9  zwqh6y1-3gxwtj3l                afc-dev      CREATE   
        15  ba22b06c-b55f-4940-ae38-b92a5928c8a5  v20t58n-51jq8hrq                afc-dev      CREATE   
        16  be884689-aad4-486e-b556-23fdcf266f6d  test-afc-g2bup7lj               afc-dev      CREATE   
        17  cb9158ce-f8fd-441b-b443-17219e8f79fa  skysand                         afc-dev      UPDATE   
        18  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  jyd-dev-apps-eu10               afc-dev      UPDATE   
        19  d91fb749-a148-479f-b29d-71b1b6a9309d  afctest1                        afc-dev      CREATE   
        20  ed99fc2a-b367-4fc6-8918-5547e2e655a7  afc-e2e                         afc-dev      CREATE   
        21  fe2e319f-68cd-450f-8a02-d726dac64b35  sky-major-tom-fin               afc-dev      CREATE   "
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
        "#   tenantId                              subdomain                       appName      eventType  created_on  updated_on
        1   0de2abab-9030-4524-9940-e5b37ac75d92  skyfin-task-model-management    afc-dev      CREATE     2025-04-04T07:49:32Z (x days ago)  2025-04-04T07:49:32Z (x days ago)  
        2   116b3ac3-6d84-4ed5-81be-0af4464a09b6  skyfin-onboarding-test          afc-dev-sms  CREATE     2025-10-27T13:47:49Z (x days ago)  2025-10-27T14:38:49Z (x days ago)  
        3   1bbe07b0-4de1-4cdb-830d-49b0ddf20b53  skyfin-ias-test                 afc-dev-sms  CREATE     2025-09-19T08:58:06Z (x days ago)  2025-09-19T09:16:02Z (x days ago)  
        4   4a5bcd5e-733d-4865-8f05-91937b680d4c  afc-402500-c22wco6t             afc-dev      CREATE     2025-07-02T09:10:17Z (x days ago)  2025-07-02T09:10:17Z (x days ago)  
        5   4c0909b1-a84e-4763-a26e-532fdb9e40fa  hw6-apps-eu10                   afc-dev      UPDATE                                          2024-08-09T22:18:18Z (x days ago)  
        6   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  skyfin-company                  afc-dev-sms  CREATE                                          2025-09-18T09:24:38Z (x days ago)  
        7   663d2938-be50-44ab-92ca-538855eb594f  skyfin-workzone                 afc-dev      CREATE     2024-09-11T07:37:19Z (x days ago)  2024-09-11T07:37:19Z (x days ago)  
        8   73675fb3-0298-4cf3-8f86-a78c18392193  i050811sapdev2-myafc-bybooster  afc-dev      CREATE     2025-05-22T12:12:15Z (x days ago)  2025-05-22T12:12:15Z (x days ago)  
        9   79604d57-3933-4a66-81c2-a022413ec11d  skyfin-booster-ias              afc-dev-sms  CREATE     2026-01-15T10:47:51Z (x days ago)  2026-01-15T10:48:00Z (x days ago)  
        10  86ab464d-5770-46b4-b93d-292c1416c453  acra-dev-eu10-afc               afc-dev      CREATE     2025-09-23T14:28:13Z (x days ago)  2025-09-23T14:28:13Z (x days ago)  
        11  9c418100-6318-4e8a-b4b2-1114f4f44aef  skyfin-booster                  afc-dev      CREATE     2024-11-27T06:54:40Z (x days ago)  2024-11-27T06:54:40Z (x days ago)  
        12  a1c320ff-b7f8-48d8-a20d-b44e92f69e65  tk02r4qx17c7dqhv                afc-dev      CREATE     2025-01-29T08:04:38Z (x days ago)  2025-01-29T08:04:38Z (x days ago)  
        13  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  skyfin-sap-start                afc-dev      UPDATE     2024-07-05T11:24:00Z (x days ago)  2024-08-08T04:10:14Z (x days ago)  
        14  b46f4c09-e46e-432b-b837-0aad96d145f9  zwqh6y1-3gxwtj3l                afc-dev      CREATE     2025-12-22T02:19:58Z (x days ago)  2025-12-22T02:19:58Z (x days ago)  
        15  ba22b06c-b55f-4940-ae38-b92a5928c8a5  v20t58n-51jq8hrq                afc-dev      CREATE     2025-09-25T10:07:34Z (x days ago)  2025-09-25T10:07:34Z (x days ago)  
        16  be884689-aad4-486e-b556-23fdcf266f6d  test-afc-g2bup7lj               afc-dev      CREATE     2024-12-09T03:54:44Z (x days ago)  2024-12-09T03:54:44Z (x days ago)  
        17  cb9158ce-f8fd-441b-b443-17219e8f79fa  skysand                         afc-dev      UPDATE                                          2024-08-09T12:27:04Z (x days ago)  
        18  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  jyd-dev-apps-eu10               afc-dev      UPDATE     2024-03-19T16:57:50Z (x days ago)  2024-08-09T06:53:28Z (x days ago)  
        19  d91fb749-a148-479f-b29d-71b1b6a9309d  afctest1                        afc-dev      CREATE     2025-05-22T12:30:46Z (x days ago)  2025-05-22T12:30:46Z (x days ago)  
        20  ed99fc2a-b367-4fc6-8918-5547e2e655a7  afc-e2e                         afc-dev      CREATE     2025-11-27T08:40:11Z (x days ago)  2025-11-27T08:40:11Z (x days ago)  
        21  fe2e319f-68cd-450f-8a02-d726dac64b35  sky-major-tom-fin               afc-dev      CREATE     2025-12-02T12:48:37Z (x days ago)  2025-12-02T12:48:37Z (x days ago)  "
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
        "tenantId                              subdomain       appName      eventType
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  skyfin-company  afc-dev-sms  CREATE   "
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
        "tenantId                              subdomain       appName      eventType  created_on  updated_on
        5ecc7413-2b7e-414a-9496-ad4a61f6cccf  skyfin-company  afc-dev-sms  CREATE                 2025-09-18T09:24:38Z (x days ago)  "
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
      started upgrade on server with jobId 45ae508f-1dc2-4e76-979e-f0ec4be69bf1 polling interval 15sec
      job 45ae508f-1dc2-4e76-979e-f0ec4be69bf1 is FINISHED with tasks queued/running: 0/0 | failed/finished: 0/1
      #  tenantId                              status    message  log                                                 
      1  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  FINISHED           cds-upgrade-5ecc7413-2b7e-414a-9496-ad4a61f6cccf.txt
      
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='45ae508f-1dc2-4e76-979e-f0ec4be69bf1') 200 OK (88ms)
      POST https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/saas-provisioning/upgrade 202 Accepted (88ms)"
    `);
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });

  test("cds upgrade all", async () => {
    await nock.back("cds-upgrade-all.json");
    expect(await cds.cdsUpgradeAll(await freshContext(), null, [false, false])).toBeUndefined();
    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "targeting cf api https://api.cf.sap.hana.ondemand.com / org "skyfin" / space "dev"
      started upgrade on server with jobId 67b2e829-8164-4ee0-9f3a-9fd3d6963aa5 polling interval 15sec
      job 67b2e829-8164-4ee0-9f3a-9fd3d6963aa5 is FINISHED with tasks queued/running:  0/ 0 | failed/finished:  0/21
      #   tenantId                              status    message  log                                                 
      1   0de2abab-9030-4524-9940-e5b37ac75d92  FINISHED           cds-upgrade-0de2abab-9030-4524-9940-e5b37ac75d92.txt
      2   116b3ac3-6d84-4ed5-81be-0af4464a09b6  FINISHED           cds-upgrade-116b3ac3-6d84-4ed5-81be-0af4464a09b6.txt
      3   1bbe07b0-4de1-4cdb-830d-49b0ddf20b53  FINISHED           cds-upgrade-1bbe07b0-4de1-4cdb-830d-49b0ddf20b53.txt
      4   4a5bcd5e-733d-4865-8f05-91937b680d4c  FINISHED           cds-upgrade-4a5bcd5e-733d-4865-8f05-91937b680d4c.txt
      5   4c0909b1-a84e-4763-a26e-532fdb9e40fa  FINISHED           cds-upgrade-4c0909b1-a84e-4763-a26e-532fdb9e40fa.txt
      6   5ecc7413-2b7e-414a-9496-ad4a61f6cccf  FINISHED           cds-upgrade-5ecc7413-2b7e-414a-9496-ad4a61f6cccf.txt
      7   663d2938-be50-44ab-92ca-538855eb594f  FINISHED           cds-upgrade-663d2938-be50-44ab-92ca-538855eb594f.txt
      8   73675fb3-0298-4cf3-8f86-a78c18392193  FINISHED           cds-upgrade-73675fb3-0298-4cf3-8f86-a78c18392193.txt
      9   79604d57-3933-4a66-81c2-a022413ec11d  FINISHED           cds-upgrade-79604d57-3933-4a66-81c2-a022413ec11d.txt
      10  86ab464d-5770-46b4-b93d-292c1416c453  FINISHED           cds-upgrade-86ab464d-5770-46b4-b93d-292c1416c453.txt
      11  9c418100-6318-4e8a-b4b2-1114f4f44aef  FINISHED           cds-upgrade-9c418100-6318-4e8a-b4b2-1114f4f44aef.txt
      12  a1c320ff-b7f8-48d8-a20d-b44e92f69e65  FINISHED           cds-upgrade-a1c320ff-b7f8-48d8-a20d-b44e92f69e65.txt
      13  ae2dc112-9745-4f5e-8feb-79ebdc0094bd  FINISHED           cds-upgrade-ae2dc112-9745-4f5e-8feb-79ebdc0094bd.txt
      14  b46f4c09-e46e-432b-b837-0aad96d145f9  FINISHED           cds-upgrade-b46f4c09-e46e-432b-b837-0aad96d145f9.txt
      15  ba22b06c-b55f-4940-ae38-b92a5928c8a5  FINISHED           cds-upgrade-ba22b06c-b55f-4940-ae38-b92a5928c8a5.txt
      16  be884689-aad4-486e-b556-23fdcf266f6d  FINISHED           cds-upgrade-be884689-aad4-486e-b556-23fdcf266f6d.txt
      17  cb9158ce-f8fd-441b-b443-17219e8f79fa  FINISHED           cds-upgrade-cb9158ce-f8fd-441b-b443-17219e8f79fa.txt
      18  cf528063-6a43-4bf2-8ccc-ca4e6d75d88e  FINISHED           cds-upgrade-cf528063-6a43-4bf2-8ccc-ca4e6d75d88e.txt
      19  d91fb749-a148-479f-b29d-71b1b6a9309d  FINISHED           cds-upgrade-d91fb749-a148-479f-b29d-71b1b6a9309d.txt
      20  ed99fc2a-b367-4fc6-8918-5547e2e655a7  FINISHED           cds-upgrade-ed99fc2a-b367-4fc6-8918-5547e2e655a7.txt
      21  fe2e319f-68cd-450f-8a02-d726dac64b35  FINISHED           cds-upgrade-fe2e319f-68cd-450f-8a02-d726dac64b35.txt
      
      GET https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='67b2e829-8164-4ee0-9f3a-9fd3d6963aa5') 200 OK (88ms)
      POST https://skyfin-dev-afc-mtx.cfapps.sap.hana.ondemand.com/-/cds/saas-provisioning/upgrade 202 Accepted (88ms)"
    `);
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });
});

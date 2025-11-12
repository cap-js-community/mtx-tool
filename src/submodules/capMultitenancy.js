"use strict";

const {
  isUUID,
  isDashedWord,
  sleep,
  tableList,
  tryJsonParse,
  resolveTenantArg,
  balancedSplit,
  formatTimestampsWithRelativeDays,
  isObject,
  parseIntWithFallback,
  writeTextAsync,
} = require("../shared/static");
const { assert, assertAll } = require("../shared/error");
const { request } = require("../shared/request");
const { Logger } = require("../shared/logger");
const { limiter } = require("../shared/funnel");

const ENV = Object.freeze({
  CDS_CONCURRENCY: "MTX_CDS_CONCURRENCY",
  CDS_FREQUENCY: "MTX_CDS_FREQUENCY",
});

const CDS_UPGRADE_APP_INSTANCE = 0;
const CDS_UPGRADE_LOG_DOWNLOAD_CONCURRENCY = 3;
const CDS_REQUEST_CONCURRENCY_FALLBACK = 10;
const CDS_JOB_POLL_FREQUENCY_FALLBACK = 15000;
const CDS_CHANGE_TIMEOUT = 30 * 60 * 1000;
const CDS_CHANGE_TIMEOUT_TEXT = "30min";

const JOB_STATUS = Object.freeze({
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  FAILED: "FAILED",
  FINISHED: "FINISHED",
});
const TASK_STATUS = JOB_STATUS;

const logger = Logger.getInstance();
const cdsRequestConcurrency = parseIntWithFallback(process.env[ENV.CDS_CONCURRENCY], CDS_REQUEST_CONCURRENCY_FALLBACK);
const cdsPollFrequency = parseIntWithFallback(process.env[ENV.CDS_FREQUENCY], CDS_JOB_POLL_FREQUENCY_FALLBACK);

const _cdsTenants = async (context, tenant) => {
  const { subdomain: filterSubdomain, tenantId: filterTenantId } = resolveTenantArg(tenant);
  filterSubdomain && assert(isDashedWord(filterSubdomain), `argument "${filterSubdomain}" is not a valid subdomain`);

  const {
    cfRouteUrl,
    cfService: { credentials },
  } = await context.getCdsInfo();

  const token = await context.getCachedUaaTokenFromCredentials(credentials);
  const _getTenantRequestOptionsPathname = () =>
    filterTenantId ? `/-/cds/saas-provisioning/tenant/${filterTenantId}` : "/-/cds/saas-provisioning/tenant";
  const response = await request({
    url: cfRouteUrl,
    pathname: _getTenantRequestOptionsPathname(),
    auth: { token },
  });
  const resultRaw = await response.json();
  let result = Array.isArray(resultRaw) ? resultRaw : [resultRaw];
  if (filterSubdomain) {
    result = result.filter(({ subscribedSubdomain }) => subscribedSubdomain === filterSubdomain);
  }
  return result;
};

const cdsList = async (context, [tenant], [doTimestamps, doJsonOutput]) => {
  const tenants = await _cdsTenants(context, tenant);

  if (doJsonOutput) {
    return tenants;
  }

  const nowDate = new Date();
  const headerRow = ["tenantId", "subdomain", "appName", "eventType"];
  doTimestamps && headerRow.push("created_on", "updated_on");

  const tenantRow = (tenant) => {
    const row = [
      tenant.subscribedTenantId,
      tenant.subscriber?.subaccountSubdomain ?? tenant.subscribedSubdomain,
      tenant.rootApplication?.appName ?? tenant.subscriptionAppName ?? "",
      tenant.eventType,
    ];
    doTimestamps && row.push(...formatTimestampsWithRelativeDays([tenant.createdAt, tenant.modifiedAt], nowDate));
    return row;
  };
  const table = tenants && tenants.length ? [headerRow].concat(tenants.map(tenantRow)) : null;
  return tableList(table, { withRowNumber: !tenant });
};

const cdsLongList = async (context, [tenant]) => {
  return await _cdsTenants(context, tenant);
};

const _cdsOnboard = async (context, tenantId, metadata = {}) => {
  const {
    cfRouteUrl,
    cfService: { credentials },
  } = await context.getCdsInfo();
  const token = await context.getCachedUaaTokenFromCredentials(credentials);
  await request({
    method: "PUT",
    url: cfRouteUrl,
    pathname: `/-/cds/saas-provisioning/tenant/${tenantId}`,
    auth: { token },
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...metadata, eventType: "CREATE" }),
  });
};

const cdsOnboardTenant = async (context, [tenantId, rawMetadata]) => {
  let metadata;
  assert(isUUID(tenantId), "TENANT_ID is not a uuid", tenantId);
  if (rawMetadata) {
    metadata = tryJsonParse(rawMetadata);
    assert(isObject(metadata), "METADATA is not a JSON object");
    logger.info("using onboarding metadata: %O", metadata);
  }
  return _cdsOnboard(context, tenantId, metadata);
};

const _cdsUpgradeLogFilepath = (tenantId) => `cds-upgrade-${tenantId}.txt`;

const _safeMaterializeJson = async (response, description) => {
  const responseText = await response.text();
  const responseData = tryJsonParse(responseText);
  assert(responseData, "%s response failed\n%s", description, responseText);
  return responseData;
};

const _getTaskSummary = (tasks) =>
  tasks.reduce(
    (accumulator, { status }) => {
      switch (status) {
        case TASK_STATUS.QUEUED: {
          accumulator[0]++;
          break;
        }
        case TASK_STATUS.RUNNING: {
          accumulator[1]++;
          break;
        }
        case TASK_STATUS.FAILED: {
          accumulator[2]++;
          break;
        }
        case TASK_STATUS.FINISHED: {
          accumulator[3]++;
          break;
        }
      }
      return accumulator;
    },
    [0, 0, 0, 0]
  );

const _cdsUpgradeMtxs = async (
  context,
  { tenants = ["*"], doAutoUndeploy = false, appInstance = CDS_UPGRADE_APP_INSTANCE } = {}
) => {
  if (tenants.length === 0) {
    return;
  }
  const autoUndeployOptions = { options: { _: { hdi: { deploy: { auto_undeploy: true } } } } };
  const {
    cfAppGuid,
    cfRouteUrl,
    cfService: { credentials },
    cfSsh,
  } = await context.getCdsInfo();

  const upgradeResponse = await request({
    method: "POST",
    url: cfRouteUrl,
    pathname: "/-/cds/saas-provisioning/upgrade",
    auth: { token: await context.getCachedUaaTokenFromCredentials(credentials) },
    headers: {
      "Content-Type": "application/json",
      "X-Cf-App-Instance": `${cfAppGuid}:${appInstance}`,
      Prefer: "respond-async",
    },
    body: JSON.stringify({ tenants, ...(doAutoUndeploy && autoUndeployOptions) }),
  });
  const upgradeResponseData = await _safeMaterializeJson(upgradeResponse, "upgrade");
  const jobId = upgradeResponseData.ID;
  logger.info("started upgrade on server with jobId %s polling interval %isec", jobId, cdsPollFrequency / 1000);
  const upgradeTenantEntries = upgradeResponseData.tenants && Object.entries(upgradeResponseData.tenants);
  assert(upgradeTenantEntries, "no tenants found in response for upgrade\n%j", upgradeResponseData);
  const countLength = String(upgradeTenantEntries.length).length;

  let pollJobResponseData;
  let lastTaskSummary;
  let lastTimeOfChange;
  let hasChangeTimeout = false;

  while (true) {
    await sleep(cdsPollFrequency);
    const pollJobResponse = await request({
      url: cfRouteUrl,
      pathname: `/-/cds/jobs/pollJob(ID='${jobId}')`,
      auth: { token: await context.getCachedUaaTokenFromCredentials(credentials) },
    });
    pollJobResponseData = await _safeMaterializeJson(pollJobResponse, "poll job");

    const { status, tasks } = pollJobResponseData || {};
    assert(status, "no status retrieved for jobId %s", jobId);
    const taskSummary = _getTaskSummary(tasks ?? []);
    const [queued, running, failed, finished] = taskSummary.map((count) => String(count).padStart(countLength));
    logger.info(
      "job %s is %s with tasks queued/running: %s/%s | failed/finished: %s/%s",
      jobId,
      status,
      queued,
      running,
      failed,
      finished
    );
    if (status !== JOB_STATUS.RUNNING) {
      break;
    }

    const currentTime = Date.now();
    if (!lastTaskSummary || lastTaskSummary.some((value, index) => taskSummary[index] !== value)) {
      lastTimeOfChange = currentTime;
    }
    lastTaskSummary = taskSummary;
    if (lastTimeOfChange && currentTime - lastTimeOfChange >= CDS_CHANGE_TIMEOUT) {
      hasChangeTimeout = true;
      break;
    }
  }

  const { tasks } = pollJobResponseData || {};
  const taskMap = (tasks ?? []).reduce((accumulator, task) => {
    const { ID } = task;
    accumulator[ID] = task;
    return accumulator;
  }, {});

  let hasError = false;
  const table = [["tenantId", "status", "message", "log"]].concat(
    await limiter(CDS_UPGRADE_LOG_DOWNLOAD_CONCURRENCY, upgradeTenantEntries, async ([tenantId, { ID: taskId }]) => {
      const { status, error } = taskMap[taskId];
      hasError ||= !status || error;

      let logfile;
      // NOTE: we need to be resilient here for the case that the app is not ssh enabled.
      try {
        const [stdout] = await cfSsh({
          command: `cat app/logs/${tenantId}.log || exit 0`,
          appInstance,
          logged: false,
        });
        if (stdout) {
          logfile = _cdsUpgradeLogFilepath(tenantId);
          await writeTextAsync(logfile, stdout);
        }
      } catch (err) {} // eslint-disable-line no-empty
      return [tenantId, status, error ?? "", logfile ?? ""];
    })
  );

  logger.info(tableList(table));
  assert(!hasError, "error happened during tenant upgrade");
  assert(!hasChangeTimeout, "no task progress after %s", CDS_CHANGE_TIMEOUT_TEXT);
};

const _cdsUpgrade = async (context, options) => await _cdsUpgradeMtxs(context, options);

const cdsUpgradeTenant = async (context, [tenantId], [doAutoUndeploy]) => {
  assert(isUUID(tenantId), "TENANT_ID is not a uuid", tenantId);
  return await _cdsUpgrade(context, { tenants: [tenantId], doAutoUndeploy });
};

const cdsUpgradeAll = async (context, _, [doAutoUndeploy, doFirstInstance]) => {
  const { cfAppName, cfProcess } = await context.getCdsInfo();
  const appInstances = cfProcess && cfProcess.instances;

  if (doFirstInstance || !appInstances || appInstances <= 1) {
    return await _cdsUpgrade(context, { doAutoUndeploy });
  }

  // NOTE: we sort by tenantId to get a stable pseudo-random order
  const tenantIds = (await _cdsTenants(context)).map(({ subscribedTenantId }) => subscribedTenantId).sort();
  const tenantIdParts = balancedSplit(tenantIds, appInstances);

  logger.info("splitting tenants across %i app instances of '%s' as follows:", appInstances, cfAppName);
  for (let i = 0; i < appInstances; i++) {
    if (tenantIdParts[i].length) {
      logger.info("instance %i: processing tenants %s", i + 1, tenantIdParts[i].join(", "));
    } else {
      logger.info("instance %i: not processing tenants", i + 1);
    }
  }
  logger.info();

  await assertAll("problems occurred during tenant upgrade")(
    tenantIdParts.map(
      async (tenants, appInstance) => await _cdsUpgrade(context, { tenants, doAutoUndeploy, appInstance })
    )
  );
};

const _cdsOffboard = async (context, tenantId) => {
  const {
    cfRouteUrl,
    cfService: { credentials },
  } = await context.getCdsInfo();
  const token = await context.getCachedUaaTokenFromCredentials(credentials);
  await request({
    method: "DELETE",
    url: cfRouteUrl,
    pathname: `/-/cds/saas-provisioning/tenant/${tenantId}`,
    auth: { token },
  });
};

const cdsOffboardTenant = async (context, [tenantId]) => {
  assert(isUUID(tenantId), "TENANT_ID is not a uuid", tenantId);
  return _cdsOffboard(context, tenantId);
};

const cdsOffboardAll = async (context) => {
  const tenants = await _cdsTenants(context);
  await limiter(
    cdsRequestConcurrency,
    tenants,
    async ({ subscribedTenantId }) => await _cdsOffboard(context, subscribedTenantId)
  );
};

module.exports = {
  JOB_STATUS,
  TASK_STATUS,

  cdsList,
  cdsLongList,
  cdsOnboardTenant,
  cdsUpgradeTenant,
  cdsUpgradeAll,
  cdsOffboardTenant,
  cdsOffboardAll,
};

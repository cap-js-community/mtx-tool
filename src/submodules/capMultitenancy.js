"use strict";

const { promisify } = require("util");
const { writeFile } = require("fs");
const {
  ENV,
  isUUID,
  isDashedWord,
  sleep,
  tableList,
  tryJsonParse,
  resolveTenantArg,
  balancedSplit,
  limiter,
  formatTimestampsWithRelativeDays,
  isObject,
  parseIntWithFallback,
} = require("../shared/static");
const { assert, assertAll } = require("../shared/error");
const { request } = require("../shared/request");
const { Logger } = require("../shared/logger");

const CDS_UPGRADE_APP_INSTANCE = 0;
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
const writeFileAsync = promisify(writeFile);
const cdsRequestConcurrency = parseIntWithFallback(process.env[ENV.CDS_CONCURRENCY], CDS_REQUEST_CONCURRENCY_FALLBACK);
const cdsPollFrequency = parseIntWithFallback(process.env[ENV.CDS_FREQUENCY], CDS_JOB_POLL_FREQUENCY_FALLBACK);

const _isMtxs = async (context) => {
  if (_isMtxs._result === undefined) {
    const { cfRouteUrl } = await context.getCdsInfo();
    const response = await request({
      method: "HEAD",
      url: cfRouteUrl,
      pathname: `/-/cds/saas-provisioning`,
      logged: false,
      checkStatus: false,
    });
    const result = response.status !== 404;
    _isMtxs._result = result;
    if (result) {
      logger.info("using cds-mtxs apis");
    } else {
      logger.info("using legacy cds-mtx apis, consider upgrading to cds-mtxs");
    }
  }
  return _isMtxs._result;
};

const _cdsTenants = async (context, tenant) => {
  const isMtxs = await _isMtxs(context);
  const { subdomain: filterSubdomain, tenantId: filterTenantId } = resolveTenantArg(tenant);
  filterSubdomain && assert(isDashedWord(filterSubdomain), `argument "${filterSubdomain}" is not a valid subdomain`);

  const { cfRouteUrl } = await context.getCdsInfo();

  const _getTenantRequestOptionsPathname = () => {
    if (isMtxs) {
      return filterTenantId ? `/-/cds/saas-provisioning/tenant/${filterTenantId}` : "/-/cds/saas-provisioning/tenant";
    } else {
      return filterTenantId ? `/mtx/v1/provisioning/tenant/${filterTenantId}` : "/mtx/v1/provisioning/tenant";
    }
  };
  const response = await request({
    url: cfRouteUrl,
    pathname: _getTenantRequestOptionsPathname(),
    auth: { token: await context.getCachedUaaToken() },
  });
  const resultRaw = await response.json();
  let result = Array.isArray(resultRaw) ? resultRaw : [resultRaw];
  if (filterSubdomain) {
    result = result.filter(({ subscribedSubdomain }) => subscribedSubdomain === filterSubdomain);
  }
  return result;
};

const cdsList = async (context, [tenant], [doTimestamps]) => {
  const headerRow = ["subscribedTenantId", "subscribedSubdomain", "subscriptionAppName", "eventType"];
  doTimestamps && headerRow.push("created_on", "updated_on");
  const nowDate = new Date();

  const tenantRow = (tenant) => {
    const row = [
      tenant.subscribedTenantId,
      tenant.subscribedSubdomain,
      tenant.subscriptionAppName || "",
      tenant.eventType,
    ];
    doTimestamps && row.push(...formatTimestampsWithRelativeDays([tenant.createdAt, tenant.modifiedAt], nowDate));
    return row;
  };
  const tenants = await _cdsTenants(context, tenant);
  const table = tenants && tenants.length ? [headerRow].concat(tenants.map(tenantRow)) : null;
  return tableList(table, { withRowNumber: !tenant });
};

const cdsLongList = async (context, [tenant], [doJsonOutput]) => {
  const data = await _cdsTenants(context, tenant);
  return JSON.stringify(data, null, 2);
};

const _cdsOnboard = async (context, tenantId, metadata = {}) => {
  const { cfRouteUrl } = await context.getCdsInfo();
  await request({
    method: "PUT",
    url: cfRouteUrl,
    pathname: (await _isMtxs(context))
      ? `/-/cds/saas-provisioning/tenant/${tenantId}`
      : `/mtx/v1/provisioning/tenant/${tenantId}`,
    auth: { token: await context.getCachedUaaToken() },
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

const _cdsUpgradeBuildLogFilepath = (tenantId) => `cds-upgrade-buildlog-${tenantId}.txt`;

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
  const { cfAppGuid, cfRouteUrl } = await context.getCdsInfo();
  const upgradeResponse = await request({
    method: "POST",
    url: cfRouteUrl,
    pathname: "/-/cds/saas-provisioning/upgrade",
    auth: { token: await context.getCachedUaaToken() },
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
      auth: { token: await context.getCachedUaaToken() },
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
    if (!lastTaskSummary || lastTaskSummary.some((index, value) => taskSummary[index] !== value)) {
      const currentTime = Date.now();
      if (currentTime - (lastTimeOfChange ?? currentTime) >= CDS_CHANGE_TIMEOUT) {
        hasChangeTimeout = true;
        break;
      }
      lastTimeOfChange = currentTime;
    }

    if (status !== JOB_STATUS.RUNNING) {
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
  const table = [["tenantId", "status", "message"]].concat(
    upgradeTenantEntries.map(([tenantId, { ID: taskId }]) => {
      const { status, error } = taskMap[taskId];
      hasError ||= !status || error;
      return [tenantId, status, error || ""];
    })
  );

  logger.info(tableList(table));
  assert(!hasError, "error happened during tenant upgrade");
  assert(!hasChangeTimeout, "no task progress after %s", CDS_CHANGE_TIMEOUT_TEXT);
};

const _cdsUpgradeMtx = async (
  context,
  { tenants = ["all"], doAutoUndeploy = false, appInstance = CDS_UPGRADE_APP_INSTANCE } = {}
) => {
  if (tenants.length === 0) {
    return;
  }
  const autoUndeployOptions = { autoUndeploy: true };
  const { cfAppGuid, cfRouteUrl } = await context.getCdsInfo();
  const upgradeResponse = await request({
    method: "POST",
    url: cfRouteUrl,
    pathname: "/mtx/v1/model/asyncUpgrade",
    auth: { token: await context.getCachedUaaToken() },
    headers: {
      "Content-Type": "application/json",
      "X-Cf-App-Instance": `${cfAppGuid}:${appInstance}`,
    },
    body: JSON.stringify({ tenants, ...(doAutoUndeploy && autoUndeployOptions) }),
  });
  const upgradeResponseData = await _safeMaterializeJson(upgradeResponse, "upgrade");
  const jobId = upgradeResponseData.jobID;
  logger.info("started upgrade on server with jobId %s polling interval %isec", jobId, cdsPollFrequency / 1000);

  let pollJobResponseData;

  while (true) {
    await sleep(cdsPollFrequency);
    const pollJobResponse = await request({
      url: cfRouteUrl,
      pathname: `/mtx/v1/model/status/${jobId}`,
      auth: { token: await context.getCachedUaaToken() },
    });
    pollJobResponseData = await _safeMaterializeJson(pollJobResponse, "poll job");

    const { status } = pollJobResponseData || {};
    assert(status, "no status retrieved for jobId %s", jobId);
    logger.info("job %s is %s", jobId, status);

    if (status !== JOB_STATUS.RUNNING) {
      break;
    }
  }

  const { error, result } = pollJobResponseData || {};
  assert(!error, "upgrade tenant failed\n%j", error);
  const resultTenantEntries = result.tenants && Object.entries(result.tenants);
  assert(resultTenantEntries, "no tenants found in result\n%j", result);

  const failedTenants = [];
  const table = [["tenantId", "status", "message", "logfile"]].concat(
    await Promise.all(
      resultTenantEntries.map(async ([tenantId, { status, message, buildLogs }]) => {
        let logfile = "";
        if (buildLogs) {
          logfile = _cdsUpgradeBuildLogFilepath(tenantId);
          await writeFileAsync(logfile, buildLogs);
        }
        if (status !== "SUCCESS") {
          failedTenants.push(tenantId);
        }
        return [tenantId, status, message, logfile];
      })
    )
  );
  logger.info(tableList(table));
  assert(failedTenants.length === 0, "upgrade tenant not successful for", failedTenants.join(", "));
};

const _cdsUpgrade = async (context, options) =>
  (await _isMtxs(context)) ? await _cdsUpgradeMtxs(context, options) : await _cdsUpgradeMtx(context, options);

const cdsUpgradeTenant = async (context, [tenantId], [doAutoUndeploy]) => {
  assert(isUUID(tenantId), "TENANT_ID is not a uuid", tenantId);
  return await _cdsUpgrade(context, { tenants: [tenantId], doAutoUndeploy });
};

const cdsUpgradeAll = async (context, _, [doAutoUndeploy]) => {
  const { cfAppName, cfProcess } = await context.getCdsInfo();
  const appInstances = cfProcess && cfProcess.instances;

  if (!appInstances || appInstances <= 1) {
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
  const { cfRouteUrl } = await context.getCdsInfo();
  await request({
    method: "DELETE",
    url: cfRouteUrl,
    pathname: (await _isMtxs(context))
      ? `/-/cds/saas-provisioning/tenant/${tenantId}`
      : `/mtx/v1/provisioning/tenant/${tenantId}`,
    auth: { token: await context.getCachedUaaToken() },
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
  cdsList,
  cdsLongList,
  cdsOnboardTenant,
  cdsUpgradeTenant,
  cdsUpgradeAll,
  cdsOffboardTenant,
  cdsOffboardAll,
};

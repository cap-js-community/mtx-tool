"use strict";

const { promisify } = require("util");
const { writeFile } = require("fs");
const {
  isUUID,
  isDashedWord,
  sleep,
  tableList,
  tryJsonParse,
  resolveTenantArg,
  balancedSplit,
  limiter,
} = require("../shared/static");
const { assert, assertAll } = require("../shared/error");
const { request, requestTry } = require("../shared/request");

const writeFileAsync = promisify(writeFile);
const POLL_FREQUENCY = 15000;
const CDS_UPGRADE_APP_INSTANCE = 0;
const CDS_OFFBOARD_CONCURRENCY = 5;

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
      console.log("using cds-mtxs apis");
    } else {
      console.log("using legacy cds-mtx apis, consider upgrading to cds-mtxs");
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
    auth: { token: await context.getUaaToken() },
  });
  const resultRaw = await response.json();
  let result = Array.isArray(resultRaw) ? resultRaw : [resultRaw];
  if (filterSubdomain) {
    result = result.filter(({ subscribedSubdomain }) => subscribedSubdomain === filterSubdomain);
  }
  return result;
};

const cdsList = async (context, [tenant]) => {
  const tenants = await _cdsTenants(context, tenant);
  const table =
    tenants && tenants.length
      ? [["subscribedTenantId", "subscribedSubdomain", "subscriptionAppName", "eventType"]].concat(
          tenants.map(({ subscribedTenantId, subscribedSubdomain, subscriptionAppName, eventType }) => [
            subscribedTenantId,
            subscribedSubdomain,
            subscriptionAppName || "",
            eventType,
          ])
        )
      : null;
  return tableList(table, { withRowNumber: !tenant });
};

const cdsLongList = async (context, [tenant]) => {
  const data = await _cdsTenants(context, tenant);
  return JSON.stringify(data, null, 2);
};

const _cdsOnboard = async (context, tenantId, subdomain) => {
  const { cfRouteUrl } = await context.getCdsInfo();
  await request({
    method: "PUT",
    url: cfRouteUrl,
    pathname: (await _isMtxs(context))
      ? `/-/cds/saas-provisioning/tenant/${tenantId}`
      : `/mtx/v1/provisioning/tenant/${tenantId}`,
    auth: { token: await context.getUaaToken() },
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ subscribedSubdomain: subdomain, eventType: "CREATE" }),
  });
};

const cdsOnboardTenant = async (context, [tenantId, subdomain]) => {
  assert(isUUID(tenantId), "TENANT_ID is not a uuid", tenantId);
  assert(isDashedWord(subdomain), "SUBDOMAIN is not a valid subdomain", subdomain);
  return _cdsOnboard(context, tenantId, subdomain);
};

const _cdsUpgradeBuildLogFilepath = (tenantId) => `cds-upgrade-buildlog-${tenantId}.txt`;

const _safeMaterializeJson = async (response, description) => {
  const responseText = await response.text();
  const responseData = tryJsonParse(responseText);
  assert(responseData, "%s response failed\n%s", description, responseText);
  return responseData;
};

const _cdsUpgrade = async (
  context,
  { tenants, doAutoUndeploy = false, appInstance = CDS_UPGRADE_APP_INSTANCE } = {}
) => {
  const isMtxs = await _isMtxs(context);
  if (tenants === undefined) {
    tenants = isMtxs ? ["*"] : ["all"];
  }
  if (isMtxs && doAutoUndeploy) {
    console.warn("warning: cds-mtxs does not support auto-undeploy yet");
  }

  if (tenants.length === 0) {
    return;
  }
  const { cfAppGuid, cfRouteUrl } = await context.getCdsInfo();
  const upgradeResponse = await request({
    method: "POST",
    url: cfRouteUrl,
    pathname: isMtxs ? "/-/cds/saas-provisioning/upgrade" : "/mtx/v1/model/asyncUpgrade",
    auth: { token: await context.getUaaToken() },
    headers: {
      "Content-Type": "application/json",
      "X-Cf-App-Instance": `${cfAppGuid}:${appInstance}`,
      ...(isMtxs && { Prefer: "respond-async" }),
    },
    body: JSON.stringify({ tenants, ...(doAutoUndeploy && { autoUndeploy: true }) }),
  });
  const upgradeResponseData = await _safeMaterializeJson(upgradeResponse, "upgrade");
  const jobId = isMtxs ? upgradeResponseData.ID : upgradeResponseData.jobID;
  console.log("started upgrade on server with jobId %s polling interval %isec", jobId, POLL_FREQUENCY / 1000);

  while (true) {
    await sleep(POLL_FREQUENCY);
    const pollJobResponse = await requestTry({
      checkStatus: false,
      url: cfRouteUrl,
      pathname: isMtxs ? `/-/cds/jobs/pollJob(ID='${jobId}')` : `/mtx/v1/model/status/${jobId}`,
      auth: { token: await context.getUaaToken() },
      headers: {
        "X-Cf-App-Instance": `${cfAppGuid}:${appInstance}`,
      },
    });
    const pollJobResponseData = await _safeMaterializeJson(pollJobResponse, "poll job");

    const { status } = pollJobResponseData || {};
    console.log("polled status %s for jobId %s", status, jobId);
    if (status !== "RUNNING") {
      if (isMtxs) {
        const tenants = upgradeResponseData.tenants;
        assert(tenants, "no tenants found in response for upgrade\n%j", upgradeResponseData);
        let allSuccess = true;
        const table = [["tenantId", "status", "message"]].concat(
          await Promise.all(
            Object.entries(tenants).map(async ([tenantId, { ID: taskId }]) => {
              const pollTaskResponse = await requestTry({
                checkStatus: false,
                url: cfRouteUrl,
                pathname: `/-/cds/jobs/pollTask(ID='${taskId}')`,
                auth: { token: await context.getUaaToken() },
                headers: {
                  "X-Cf-App-Instance": `${cfAppGuid}:${appInstance}`,
                },
              });
              const pollTaskResponseData = await _safeMaterializeJson(pollTaskResponse, "poll task");
              const { status, error } = pollTaskResponseData || {};
              allSuccess &= !error;
              return [tenantId, status, error || ""];
            })
          )
        );
        console.log(tableList(table) + "\n");
        assert(allSuccess, "upgrade tenant failed");
      } else {
        const { error, result } = pollJobResponseData || {};
        assert(!error, "upgrade tenant failed\n%j", error);
        const { tenants } = result;
        assert(tenants, "no tenants found in result\n%j", result);

        const failedTenants = [];
        const table = [["tenantId", "status", "message", "logfile"]].concat(
          await Promise.all(
            Object.entries(tenants).map(async ([tenantId, { status, message, buildLogs }]) => {
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
        console.log(tableList(table) + "\n");
        assert(failedTenants.length === 0, "upgrade tenant not successful for", failedTenants.join(", "));
      }
      break;
    }
  }
};

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

  console.log("splitting tenants across %i app instances of '%s' as follows:", appInstances, cfAppName);
  for (let i = 0; i < appInstances; i++) {
    if (tenantIdParts[i].length) {
      console.log("instance %i: processing tenants %s", i + 1, tenantIdParts[i].join(", "));
    } else {
      console.log("instance %i: not processing tenants", i + 1);
    }
  }
  console.log();

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
    auth: { token: await context.getUaaToken() },
  });
};

const cdsOffboardTenant = async (context, [tenantId]) => {
  assert(isUUID(tenantId), "TENANT_ID is not a uuid", tenantId);
  return _cdsOffboard(context, tenantId);
};

const cdsOffboardAll = async (context) => {
  const tenants = await _cdsTenants(context);
  await limiter(
    CDS_OFFBOARD_CONCURRENCY,
    tenants.map(({ subscribedTenantId }) => [subscribedTenantId]),
    async (subscribedTenantId) => await _cdsOffboard(context, subscribedTenantId)
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

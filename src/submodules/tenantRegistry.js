/**
 * This is a wrapper for APIs of the saas-registry
 * - https://help.sap.com/viewer/65de2977205c403bbc107264b8eccf4b/Cloud/en-US/ed08c7dcb35d4082936c045e7d7b3ecd.html
 * - https://int.controlcenter.ondemand.com/index.html#/knowledge_center/articles/f239e5501a534b64ab5f8dde9bd83c53
 * - https://saas-manager.cfapps.sap.hana.ondemand.com/api#/
 */
"use strict";

const {
  isUUID,
  isDashedWord,
  sleep,
  tableList,
  formatTimestampsWithRelativeDays,
  resolveTenantArg,
} = require("../shared/static");
const { assert } = require("../shared/error");
const { request } = require("../shared/request");
const { getUaaTokenFromCredentials } = require("../shared/oauth");

const REGISTRY_PAGE_SIZE = 200;
const POLL_FREQUENCY = 10000;
const TENANT_SUBSCRIBED_STATE = "SUBSCRIBED";

const _registrySubscriptionsPaged = async (context, tenant) => {
  const { subdomain: filterSubdomain, tenantId: filterTenantId } = resolveTenantArg(tenant);
  filterSubdomain && assert(isDashedWord(filterSubdomain), `argument "${filterSubdomain}" is not a valid subdomain`);

  const {
    cfService: { credentials },
  } = await context.getRegInfo();
  const { saas_registry_url, appName } = credentials;
  const token = await getUaaTokenFromCredentials(credentials);

  let subscriptions = [];
  let pageIndex = 0;
  while (true) {
    const response = await request({
      url: saas_registry_url,
      pathname: "/saas-manager/v1/application/subscriptions",
      query: {
        appName,
        ...(filterTenantId && { tenantId: filterTenantId }),
        size: REGISTRY_PAGE_SIZE,
        page: ++pageIndex,
      },
      auth: { token },
    });
    const { subscriptions: pageSubscriptions, morePages } = await response.json();
    subscriptions = subscriptions.concat(pageSubscriptions);
    if (!morePages) {
      break;
    }
  }

  if (filterSubdomain) {
    subscriptions = subscriptions.filter(({ subdomain }) => subdomain === filterSubdomain);
  }

  return { subscriptions };
};

const registryListSubscriptions = async (context, [tenant], [doTimestamps]) => {
  const { subscriptions } = await _registrySubscriptionsPaged(context, tenant);
  const headerRow = ["consumerTenantId", "globalAccountId", "subdomain", "plan", "state", "url"];
  doTimestamps && headerRow.push("created_on", "updated_on");
  const nowDate = new Date();
  const subscriptionMap = ({
    consumerTenantId,
    globalAccountId,
    subdomain,
    code,
    state,
    url,
    createdOn,
    changedOn,
  }) => {
    const row = [consumerTenantId, globalAccountId, subdomain, code, state, url];
    doTimestamps && row.push(...formatTimestampsWithRelativeDays([createdOn, changedOn], nowDate));
    return row;
  };
  const table = subscriptions && subscriptions.length ? [headerRow].concat(subscriptions.map(subscriptionMap)) : null;
  return tableList(table, { withRowNumber: !tenant });
};

const registryLongListSubscriptions = async (context, [tenant]) => {
  const data = await _registrySubscriptionsPaged(context, tenant);
  return JSON.stringify(data, null, 2);
};

const registryServiceConfig = async (context) => {
  const {
    cfService: {
      credentials: { appUrls },
    },
  } = await context.getRegInfo();
  return JSON.stringify(JSON.parse(appUrls), null, 2);
};

const _registryJobPoll = async (context, location, { token: _token = null, skipFirst = false } = {}) => {
  const {
    cfService: { credentials },
  } = await context.getRegInfo();
  const { saas_registry_url } = credentials;
  const token = _token || (await getUaaTokenFromCredentials(credentials));
  while (true) {
    if (!skipFirst) {
      await sleep(POLL_FREQUENCY);
      skipFirst = false;
    }
    const response = await request({
      url: saas_registry_url,
      pathname: location,
      auth: { token },
    });
    const responseBody = await response.json();
    const { state } = responseBody;
    if (!state || state === "SUCCEEDED" || state === "FAILED") {
      return JSON.stringify(responseBody, null, 2);
    }
  }
};

const registryJob = async (context, [jobId]) => {
  assert(isUUID(jobId), "JOB_ID is not a uuid", jobId);
  return _registryJobPoll(context, `/api/v2.0/jobs/${jobId}`, { skipFirst: true });
};

// https://help.sap.com/viewer/65de2977205c403bbc107264b8eccf4b/Cloud/en-US/4a8b63678cf24d5b8b36bd1957391ce3.html
// https://help.sap.com/viewer/65de2977205c403bbc107264b8eccf4b/Cloud/en-US/9c4f927011db4bd0a53b23a1b33b36d0.html
const _registryCall = async (context, tenantId, method, skipApps = null) => {
  assert(isUUID(tenantId), "TENANT_ID is not a uuid", tenantId);
  const {
    cfService: { credentials },
  } = await context.getRegInfo();
  const { saas_registry_url } = credentials;
  const token = await getUaaTokenFromCredentials(credentials);
  const response = await request({
    method,
    url: saas_registry_url,
    pathname: `/saas-manager/v1/application/tenants/${tenantId}/subscriptions`,
    ...(skipApps && { query: { noCallbacksAppNames: skipApps } }),
    auth: { token },
  });

  const [location] = response.headers.raw().location;
  const responseText = await response.text();
  console.log("response: %s", responseText);
  console.log("polling job %s with interval %isec", location, POLL_FREQUENCY / 1000);

  return _registryJobPoll(context, location, { token });
};

const _registryUpdateAllDependencies = async (context) => {
  const { subscriptions } = await _registrySubscriptionsPaged(context);
  const result = [];
  // NOTE: we do this serially, so the logging output is understandable for users and the endpoint is not overloaded
  for (const { consumerTenantId } of subscriptions.filter(({ state }) => state === TENANT_SUBSCRIBED_STATE)) {
    result.push(await _registryCall(context, consumerTenantId, "PATCH"));
  }
  return result;
};

const registryUpdateDependencies = async (context, [tenantId]) => _registryCall(context, tenantId, "PATCH");

const registryUpdateAllDependencies = async (context) => _registryUpdateAllDependencies(context);

const registryOffboardSubscription = async (context, [tenantId]) => _registryCall(context, tenantId, "DELETE");

const registryOffboardSubscriptionSkip = async (context, [tenantId, skipApps]) =>
  _registryCall(context, tenantId, "DELETE", skipApps);

module.exports = {
  registryListSubscriptions,
  registryLongListSubscriptions,
  registryServiceConfig,
  registryJob,
  registryUpdateDependencies,
  registryUpdateAllDependencies,
  registryOffboardSubscription,
  registryOffboardSubscriptionSkip,
};

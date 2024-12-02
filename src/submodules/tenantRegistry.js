/**
 * This is a wrapper for APIs of the saas-registry
 * - https://help.sap.com/viewer/65de2977205c403bbc107264b8eccf4b/Cloud/en-US/ed08c7dcb35d4082936c045e7d7b3ecd.html
 * - https://int.controlcenter.ondemand.com/index.html#/knowledge_center/articles/f239e5501a534b64ab5f8dde9bd83c53
 * - https://saas-manager.cfapps.sap.hana.ondemand.com/api (Application Operations)
 * - https://saas-manager.cfapps.sap.hana.ondemand.com/api?scope=saas-registry-service (Service Operations)
 */
"use strict";

const {
  ENV,
  isUUID,
  isDashedWord,
  sleep,
  tableList,
  dateDiffInDays,
  formatTimestampsWithRelativeDays,
  resolveTenantArg,
  limiter,
  parseIntWithFallback,
} = require("../shared/static");
const { assert } = require("../shared/error");
const { request } = require("../shared/request");
const { Logger } = require("../shared/logger");

const REGISTRY_PAGE_SIZE = 200;
const REGISTRY_JOB_POLL_FREQUENCY_FALLBACK = 15000;
const REGISTRY_REQUEST_CONCURRENCY_FALLBACK = 10;
const JOB_STATE = Object.freeze({
  STARTED: "STARTED",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
});
const SUBSCRIPTION_STATE = Object.freeze({
  SUBSCRIBED: "SUBSCRIBED",
  UPDATE_FAILED: "UPDATE_FAILED",
});
const UPDATABLE_STATES = [SUBSCRIPTION_STATE.SUBSCRIBED, SUBSCRIPTION_STATE.UPDATE_FAILED];

const logger = Logger.getInstance();

const regRequestConcurrency = parseIntWithFallback(
  process.env[ENV.REG_CONCURRENCY],
  REGISTRY_REQUEST_CONCURRENCY_FALLBACK
);
const regPollFrequency = parseIntWithFallback(process.env[ENV.REG_FREQUENCY], REGISTRY_JOB_POLL_FREQUENCY_FALLBACK);

const _registrySubscriptionsPaged = async (context, { tenant, onlyFailed, onlyStale, onlyUpdatable } = {}) => {
  const { subdomain: filterSubdomain, tenantId: filterTenantId } = resolveTenantArg(tenant);
  filterSubdomain && assert(isDashedWord(filterSubdomain), `argument "${filterSubdomain}" is not a valid subdomain`);

  const {
    cfService: { plan, credentials },
  } = await context.getRegInfo();
  const { saas_registry_url, appName } = credentials;

  let subscriptions = [];
  let page = 1;
  const token = await context.getCachedUaaTokenFromCredentials(credentials);
  const query = {
    appName,
    ...(filterTenantId && { tenantId: filterTenantId }),
    ...(plan === "service" && { includeIndirectSubscriptions: true }),
    size: REGISTRY_PAGE_SIZE,
  };
  while (true) {
    const response = await request({
      url: saas_registry_url,
      pathname: `/saas-manager/v1/${plan}/subscriptions`,
      query: {
        ...query,
        page: page++,
      },
      headers: { Accept: "application/json" },
      auth: { token },
    });
    const { subscriptions: pageSubscriptions, morePages } = await response.json();
    subscriptions = subscriptions.concat(pageSubscriptions);
    if (!morePages) {
      break;
    }
  }

  subscriptions = subscriptions.filter(
    ({ state, subdomain, changedOn }) =>
      (!filterSubdomain || subdomain === filterSubdomain) &&
      (!onlyFailed || state === SUBSCRIPTION_STATE.UPDATE_FAILED) &&
      (!onlyUpdatable || UPDATABLE_STATES.includes(state)) &&
      (!onlyStale || dateDiffInDays(new Date(changedOn), new Date()) > 0)
  );

  return { subscriptions };
};

const registryListSubscriptions = async (
  context,
  [tenant],
  [doTimestamps, doJsonOutput, doOnlyStale, doOnlyFailed]
) => {
  const subscriptionInfos = await _registrySubscriptionsPaged(context, {
    tenant,
    onlyStale: doOnlyStale,
    onlyFailed: doOnlyFailed,
  });
  const { subscriptions } = subscriptionInfos;

  if (doJsonOutput) {
    return subscriptionInfos;
  }

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
    const row = [consumerTenantId, globalAccountId, subdomain, code ?? "", state, url];
    doTimestamps && row.push(...formatTimestampsWithRelativeDays([createdOn, changedOn], nowDate));
    return row;
  };
  const table = subscriptions && subscriptions.length ? [headerRow].concat(subscriptions.map(subscriptionMap)) : null;
  return tableList(table, { withRowNumber: !tenant });
};

const registryLongListSubscriptions = async (context, [tenant], [, doOnlyStale, doOnlyFailed]) => {
  return await _registrySubscriptionsPaged(context, { tenant, onlyStale: doOnlyStale, onlyFailed: doOnlyFailed });
};

const registryServiceConfig = async (context) => {
  const {
    cfService: {
      credentials: { appUrls },
    },
  } = await context.getRegInfo();
  return JSON.parse(appUrls);
};

const _registryJobPoll = async (context, location, { skipFirst = false } = {}) => {
  const {
    cfService: { credentials },
  } = await context.getRegInfo();
  const { saas_registry_url } = credentials;
  while (true) {
    if (!skipFirst) {
      await sleep(regPollFrequency);
      skipFirst = false;
    }
    const token = await context.getCachedUaaTokenFromCredentials(credentials);
    const response = await request({
      url: saas_registry_url,
      pathname: location,
      headers: { Accept: "application/json" },
      auth: { token },
    });
    const responseBody = await response.json();
    const { state } = responseBody;
    assert(state, "got job poll response without state\n%j", responseBody);
    if (state !== JOB_STATE.STARTED) {
      return responseBody;
    }
  }
};

const registryJob = async (context, [jobId]) => {
  assert(isUUID(jobId), "JOB_ID is not a uuid", jobId);
  return await _registryJobPoll(context, `/api/v2.0/jobs/${jobId}`, { skipFirst: true });
};

const _registryCallForTenant = async (
  context,
  subscription,
  method,
  {
    noCallbacksAppNames,
    updateApplicationURL,
    skipUnchangedDependencies,
    skipUpdatingDependencies,
    doJobPoll = true,
  } = {}
) => {
  const { consumerTenantId: tenantId, subscriptionGUID: subscriptionId } = subscription;
  const {
    cfService: { plan, credentials },
  } = await context.getRegInfo();
  const { saas_registry_url } = credentials;
  const query =
    plan === "service"
      ? {}
      : {
          ...(noCallbacksAppNames && { noCallbacksAppNames }),
          ...(updateApplicationURL && { updateApplicationURL }),
          ...(skipUnchangedDependencies && { skipUnchangedDependencies }),
          ...(skipUpdatingDependencies && { skipUpdatingDependencies }),
        };
  const pathname =
    plan === "service"
      ? `/saas-manager/v1/${plan}/subscriptions/${subscriptionId}`
      : `/saas-manager/v1/${plan}/tenants/${tenantId}/subscriptions`;
  const token = await context.getCachedUaaTokenFromCredentials(credentials);
  let response;
  try {
    response = await request({
      method,
      url: saas_registry_url,
      pathname,
      ...(Object.keys(query).length !== 0 && { query }),
      auth: { token },
    });
  } catch (err) {
    return { tenantId, state: JOB_STATE.FAILED, message: err.message };
  }

  if (!doJobPoll) {
    // NOTE: with checkStatus being true by default, the above request only returns for successful changes
    return { tenantId, state: JOB_STATE.SUCCEEDED };
  }
  const [location] = response.headers.raw().location;
  const responseText = await response.text();
  logger.info("response: %s", responseText);
  logger.info("polling job %s with interval %isec", location, regPollFrequency / 1000);

  const jobResult = await _registryJobPoll(context, location);

  return { tenantId, jobId: jobResult.id, state: jobResult.state };
};

const _registryCall = async (context, method, tenantId, options) => {
  let results;
  if (tenantId) {
    assert(isUUID(tenantId), "TENANT_ID is not a uuid", tenantId);
    const { subscriptions } = await _registrySubscriptionsPaged(context, {
      tenant: tenantId,
    });
    assert(subscriptions.length >= 1, "could not find tenant %s", tenantId);
    results = [await _registryCallForTenant(context, subscriptions[0], method, options)];
  } else {
    const { onlyStaleSubscriptions, onlyFailedSubscriptions } = options ?? {};
    const { subscriptions } = await _registrySubscriptionsPaged(context, {
      onlyFailed: onlyFailedSubscriptions,
      onlyStale: onlyStaleSubscriptions,
      onlyUpdatable: true,
    });
    results = await limiter(
      regRequestConcurrency,
      subscriptions,
      async (subscription) => await _registryCallForTenant(context, subscription, method, options)
    );
  }
  assert(Array.isArray(results), "got invalid results from registry %s call with %j", method, options);
  logger.info(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
  assert(
    results.every(({ state }) => state === JOB_STATE.SUCCEEDED),
    "registry %s failed for some tenant",
    method
  );
};

const registryUpdateDependencies = async (context, [tenantId], [doSkipUnchanged]) =>
  await _registryCall(context, "PATCH", tenantId, { skipUnchangedDependencies: doSkipUnchanged });

const registryUpdateAllDependencies = async (context, _, [doSkipUnchanged, doOnlyStale, doOnlyFailed]) =>
  await _registryCall(context, "PATCH", undefined, {
    skipUnchangedDependencies: doSkipUnchanged,
    onlyStaleSubscriptions: doOnlyStale,
    onlyFailedSubscriptions: doOnlyFailed,
  });

const registryUpdateApplicationURL = async (context, [tenantId], [doOnlyStale, doOnlyFailed]) =>
  await _registryCall(context, "PATCH", tenantId, {
    updateApplicationURL: true,
    skipUpdatingDependencies: true,
    doJobPoll: false,
    onlyStaleSubscriptions: doOnlyStale,
    onlyFailedSubscriptions: doOnlyFailed,
  });
const registryOffboardSubscription = async (context, [tenantId]) => await _registryCall(context, "DELETE", tenantId);

const registryOffboardSubscriptionSkip = async (context, [tenantId, skipApps]) =>
  await _registryCall(context, "DELETE", tenantId, { noCallbacksAppNames: skipApps });

module.exports = {
  registryListSubscriptions,
  registryLongListSubscriptions,
  registryServiceConfig,
  registryJob,
  registryUpdateDependencies,
  registryUpdateAllDependencies,
  registryUpdateApplicationURL,
  registryOffboardSubscription,
  registryOffboardSubscriptionSkip,
};

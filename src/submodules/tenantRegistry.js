/**
 * APIs of the saas-registry
 * - https://help.sap.com/viewer/65de2977205c403bbc107264b8eccf4b/Cloud/en-US/ed08c7dcb35d4082936c045e7d7b3ecd.html
 * - https://int.controlcenter.ondemand.com/index.html#/knowledge_center/articles/f239e5501a534b64ab5f8dde9bd83c53
 * - https://saas-manager.cfapps.sap.hana.ondemand.com/api (Application Operations) [our case]
 * - https://saas-manager.cfapps.sap.hana.ondemand.com/api?scope=saas-registry-service (Service Operations) [not supported anymore]
 *
 * APIs of the subscription-manager
 * - https://int.api.hana.ondemand.com/api/APISubscriptionManagerService/resource/IAS_Subscription_Operations_for_Providers_or_Systems
 */
"use strict";

const {
  isUUID,
  isDashedWord,
  sleep,
  tableList,
  dateDiffInDays,
  dateDiffInSeconds,
  formatTimestampsWithRelativeDays,
  resolveTenantArg,
  parseIntWithFallback,
} = require("../shared/static");
const { assert, fail } = require("../shared/error");
const { request } = require("../shared/request");
const { Logger } = require("../shared/logger");
const { limiter } = require("../shared/funnel");

const ENV = Object.freeze({
  REG_CONCURRENCY: "MTX_REG_CONCURRENCY",
  REG_FREQUENCY: "MTX_REG_FREQUENCY",
});

const HTTP_ACCEPTED = 202;

const REGISTRY_PAGE_SIZE = 200;
const REGISTRY_JOB_POLL_FREQUENCY_FALLBACK = 15000;
const REGISTRY_REQUEST_CONCURRENCY_FALLBACK = 6;

const SUBSCRIPTION_POLL_IS_SUCCESS = Symbol("IS_SUCCESS");
const JOB_STATE = Object.freeze({
  STARTED: "STARTED",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
});
const SUBSCRIPTION_STATE = Object.freeze({
  IN_PROCESS: "IN_PROCESS",
  SUBSCRIBED: "SUBSCRIBED",
  SUBSCRIBE_FAILED: "SUBSCRIBE_FAILED",
  UPDATE_FAILED: "UPDATE_FAILED",
});
const SUBSCRIPTION_SOURCE = Object.freeze({
  SUBSCRIPTION_MANAGER: "SUBSCRIPTION_MANAGER",
  SAAS_REGISTRY: "SAAS_REGISTRY",
});
const UPDATABLE_STATES = [SUBSCRIPTION_STATE.SUBSCRIBED, SUBSCRIPTION_STATE.UPDATE_FAILED];

const logger = Logger.getInstance();

const regRequestConcurrency = parseIntWithFallback(
  process.env[ENV.REG_CONCURRENCY],
  REGISTRY_REQUEST_CONCURRENCY_FALLBACK
);
const regPollFrequency = parseIntWithFallback(process.env[ENV.REG_FREQUENCY], REGISTRY_JOB_POLL_FREQUENCY_FALLBACK);

const _callSms = async (context, reqOptions) => {
  const credentials = (await context.getSmsInfo()).cfService.credentials;
  const token = await context.getCachedUaaTokenFromCredentials(credentials);
  return await request({
    ...reqOptions,
    url: credentials.subscription_manager_url,
    auth: { token },
  });
};

const _callReg = async (context, reqOptions) => {
  const credentials = (await context.getRegInfo()).cfService.credentials;
  const token = await context.getCachedUaaTokenFromCredentials(credentials);
  return await request({
    ...reqOptions,
    url: credentials.saas_registry_url,
    auth: { token },
  });
};

const _call = async (context, source, reqOptions) => {
  switch (source) {
    case SUBSCRIPTION_SOURCE.SUBSCRIPTION_MANAGER: {
      return await _callSms(context, reqOptions);
    }
    case SUBSCRIPTION_SOURCE.SAAS_REGISTRY: {
      return await _callReg(context, reqOptions);
    }
  }
};

const _getSubscriptionsPage = async (context, source, { filterTenantId, reqOptions }) => {
  switch (source) {
    case SUBSCRIPTION_SOURCE.SUBSCRIPTION_MANAGER: {
      const credentials = (await context.getSmsInfo()).cfService.credentials;
      return await _callSms(context, {
        ...reqOptions,
        pathname: "/subscription-manager/v1/subscriptions",
        query: {
          ...reqOptions.query,
          appName: credentials.app_name,
          ...(filterTenantId && { app_tid: filterTenantId }),
        },
      });
    }
    case SUBSCRIPTION_SOURCE.SAAS_REGISTRY: {
      const credentials = (await context.getRegInfo()).cfService.credentials;
      return await _callReg(context, {
        ...reqOptions,
        pathname: "/saas-manager/v1/application/subscriptions",
        query: {
          ...reqOptions.query,
          appName: credentials.appName,
          ...(filterTenantId && { tenantId: filterTenantId }),
        },
      });
    }
  }
};

const _getSubscriptions = async (context, source, { filterTenantId }) => {
  let subscriptions = [];
  let page = 1;
  while (true) {
    const response = await _getSubscriptionsPage(context, source, {
      filterTenantId,
      reqOptions: {
        query: {
          size: REGISTRY_PAGE_SIZE,
          page: page++,
        },
        headers: { Accept: "application/json" },
      },
    });
    const { subscriptions: pageSubscriptions, morePages } = await response.json();
    subscriptions = subscriptions.concat(pageSubscriptions);
    if (!morePages) {
      return subscriptions;
    }
  }
};

const _normalizedSubscriptionFromSms = (subscription) => ({
  source: SUBSCRIPTION_SOURCE.SUBSCRIPTION_MANAGER,
  id: subscription.subscriptionGUID,
  tenantId: subscription.subscriber.app_tid,
  globalAccountId: subscription.subscriber.globalAccountId,
  subdomain: subscription.subscriber.subaccountSubdomain,
  appName: subscription.provider.appName,
  plan: subscription.subscriptionPlanName,
  state: subscription.subscriptionState,
  url: subscription.subscriptionUrl,
  createdOn: subscription.createdDate,
  updatedOn: subscription.modifiedDate,
});

const _normalizedSubscriptionFromReg = (subscription) => ({
  source: SUBSCRIPTION_SOURCE.SAAS_REGISTRY,
  id: subscription.subscriptionGUID,
  tenantId: subscription.consumerTenantId,
  globalAccountId: subscription.globalAccountId,
  subdomain: subscription.subdomain,
  appName: subscription.appName,
  plan: subscription.code,
  state: subscription.state,
  url: subscription.url,
  createdOn: subscription.createdOn,
  updatedOn: subscription.changedOn,
});

const _filterNormalizedSubscription = (
  normalizedSubscription,
  { filterSubdomain, onlyFailed, onlyUpdatable, onlyStale }
) =>
  (!filterSubdomain || normalizedSubscription.subdomain === filterSubdomain) &&
  (!onlyFailed || normalizedSubscription.state === SUBSCRIPTION_STATE.UPDATE_FAILED) &&
  (!onlyUpdatable || UPDATABLE_STATES.includes(normalizedSubscription.state)) &&
  (!onlyStale || dateDiffInDays(new Date(normalizedSubscription.updatedOn), new Date()) > 0);

const _getSubscriptionInfos = async (context, { tenant, onlyFailed, onlyStale, onlyUpdatable } = {}) => {
  assert(context.hasSmsInfo || context.hasRegInfo, "found no subscription-manager or saas-registry configuration");
  const { subdomain: filterSubdomain, tenantId: filterTenantId } = resolveTenantArg(tenant);
  filterSubdomain && assert(isDashedWord(filterSubdomain), `argument "${filterSubdomain}" is not a valid subdomain`);

  const [smsSubscriptionsUnfiltered, regSubscriptionsUnfiltered] = await Promise.all([
    context.hasSmsInfo ? _getSubscriptions(context, SUBSCRIPTION_SOURCE.SUBSCRIPTION_MANAGER, { filterTenantId }) : [],
    context.hasRegInfo ? _getSubscriptions(context, SUBSCRIPTION_SOURCE.SAAS_REGISTRY, { filterTenantId }) : [],
  ]);
  const smsSubscriptions = [];
  const regSubscriptions = [];
  const normalizedSubscriptions = [];

  for (const subscription of smsSubscriptionsUnfiltered) {
    const normalizedSubscription = _normalizedSubscriptionFromSms(subscription);
    if (
      _filterNormalizedSubscription(normalizedSubscription, { filterSubdomain, onlyFailed, onlyStale, onlyUpdatable })
    ) {
      smsSubscriptions.push(subscription);
      normalizedSubscriptions.push(normalizedSubscription);
    }
  }
  for (const subscription of regSubscriptionsUnfiltered) {
    const normalizedSubscription = _normalizedSubscriptionFromReg(subscription);
    if (
      _filterNormalizedSubscription(normalizedSubscription, { filterSubdomain, onlyFailed, onlyStale, onlyUpdatable })
    ) {
      regSubscriptions.push(subscription);
      normalizedSubscriptions.push(normalizedSubscription);
    }
  }

  return { smsSubscriptions, regSubscriptions, normalizedSubscriptions };
};

const registryListSubscriptions = async (
  context,
  [tenant],
  [doTimestamps, doJsonOutput, doOnlyStale, doOnlyFailed]
) => {
  const subscriptionInfos = await _getSubscriptionInfos(context, {
    tenant,
    onlyStale: doOnlyStale,
    onlyFailed: doOnlyFailed,
  });
  const { smsSubscriptions, regSubscriptions, normalizedSubscriptions } = subscriptionInfos;

  if (doJsonOutput) {
    return { smsSubscriptions, regSubscriptions };
  }

  const headerRow = [
    "consumerTenantId",
    "subscriptionId",
    "globalAccountId",
    "subdomain",
    "appName",
    "plan",
    "state",
    "url",
  ];
  doTimestamps && headerRow.push("created_on", "updated_on");
  const nowDate = new Date();
  const subscriptionMap = (normalizedSubscription) => {
    const row = [
      normalizedSubscription.tenantId,
      normalizedSubscription.id,
      normalizedSubscription.globalAccountId,
      normalizedSubscription.subdomain,
      normalizedSubscription.appName,
      normalizedSubscription.plan ?? "",
      normalizedSubscription.state,
      normalizedSubscription.url,
    ];
    doTimestamps &&
      row.push(
        ...formatTimestampsWithRelativeDays(
          [normalizedSubscription.createdOn, normalizedSubscription.updatedOn],
          nowDate
        )
      );
    return row;
  };
  const table =
    normalizedSubscriptions && normalizedSubscriptions.length
      ? [headerRow].concat(normalizedSubscriptions.map(subscriptionMap))
      : null;
  return tableList(table, { withRowNumber: !tenant });
};

const registryLongListSubscriptions = async (context, [tenant], [, doOnlyStale, doOnlyFailed]) => {
  const { smsSubscriptions, regSubscriptions } = await _getSubscriptionInfos(context, {
    tenant,
    onlyStale: doOnlyStale,
    onlyFailed: doOnlyFailed,
  });
  return { smsSubscriptions, regSubscriptions };
};

const registryServiceConfig = async (context) => {
  return {
    ...(context.hasSmsInfo && {
      smsServiceConfig: JSON.parse((await context.getSmsInfo()).cfService.credentials.app_urls),
    }),
    ...(context.hasRegInfo && {
      regServiceConfig: JSON.parse((await context.getRegInfo()).cfService.credentials.appUrls),
    }),
  };
};

const _callAndPollInner = async (context, source, reqOptions) => {
  const initialResponse = await _call(context, source, reqOptions);
  assert(
    initialResponse.statusCode === HTTP_ACCEPTED,
    "got unexpected response code for polling from %s",
    reqOptions.pathname
  );
  const [location] = initialResponse.headers.raw().location;
  assert(location, "missing location header for polling from %s", reqOptions.pathname);

  logger.info("polling subscription %s with interval %isec", location, regPollFrequency / 1000);

  while (true) {
    await sleep(regPollFrequency);
    const pollResponse = await _call(context, source, { pathname: location });
    let pollResponseBody = await pollResponse.json();

    switch (source) {
      case SUBSCRIPTION_SOURCE.SUBSCRIPTION_MANAGER: {
        const { subscriptionId, subscriptionState, subscriptionStateDetails } = pollResponseBody;
        assert(subscriptionState, "got subscription poll response without state\n%j", pollResponseBody);
        if (subscriptionState !== SUBSCRIPTION_STATE.IN_PROCESS) {
          return {
            subscriptionId,
            subscriptionState,
            ...(subscriptionStateDetails && { error: subscriptionStateDetails }),
            [SUBSCRIPTION_POLL_IS_SUCCESS]: subscriptionState === SUBSCRIPTION_STATE.SUBSCRIBED,
          };
        }
        break;
      }
      case SUBSCRIPTION_SOURCE.SAAS_REGISTRY: {
        const { id: jobId, state: jobState, error: err } = pollResponseBody;
        assert(jobState, "got subscription poll response without state\n%j", pollResponseBody);
        if (jobState !== JOB_STATE.STARTED) {
          return {
            jobId,
            jobState,
            ...(err && { error: err.message }),
            [SUBSCRIPTION_POLL_IS_SUCCESS]: jobState === JOB_STATE.SUCCEEDED,
          };
        }
        break;
      }
    }
  }
};

const _callAndPoll = async (context, source, tenantId, reqOptions) => {
  const startTime = new Date();
  let result;
  try {
    result = await _callAndPollInner(context, source, reqOptions);
  } catch (err) {
    result = {
      error: err.message,
      [SUBSCRIPTION_POLL_IS_SUCCESS]: false,
    };
  }
  return {
    tenantId,
    duration: `${dateDiffInSeconds(startTime, new Date()).toFixed(0)} sec`,
    ...result,
  };
};

const _registryStatePoll = async (context, { source, url, pathname, credentials }) => {
  logger.info("polling subscription %s with interval %isec", pathname, regPollFrequency / 1000);

  while (true) {
    await sleep(regPollFrequency);
    const token = await context.getCachedUaaTokenFromCredentials(credentials);
    const response = await request({
      url,
      pathname,
      headers: { Accept: "application/json" },
      auth: { token },
    });
    const responseBody = await response.json();
    switch (source) {
      case SUBSCRIPTION_SOURCE.SUBSCRIPTION_MANAGER: {
        const { subscriptionId, subscriptionState, subscriptionStateDetails } = responseBody;
        assert(subscriptionState, "got subscription poll response without state\n%j", responseBody);
        if (subscriptionState !== SUBSCRIPTION_STATE.IN_PROCESS) {
          return {
            subscriptionId,
            subscriptionState,
            ...(subscriptionStateDetails && { error: subscriptionStateDetails }),
            [SUBSCRIPTION_POLL_IS_SUCCESS]: subscriptionState === SUBSCRIPTION_STATE.SUBSCRIBED,
          };
        }
        break;
      }
      case SUBSCRIPTION_SOURCE.SAAS_REGISTRY: {
        const { id: jobId, state: jobState, error: err } = responseBody;
        assert(jobState, "got subscription poll response without state\n%j", responseBody);
        if (jobState !== JOB_STATE.STARTED) {
          return {
            jobId,
            jobState,
            ...(err && { error: err.message }),
            [SUBSCRIPTION_POLL_IS_SUCCESS]: jobState === JOB_STATE.SUCCEEDED,
          };
        }
        break;
      }
      default: {
        return fail("unknown subscription source %s", source);
      }
    }
  }
};

const _registryCallParts = async (
  context,
  subscription,
  { noCallbacksAppNames, updateApplicationURL, skipUnchangedDependencies, skipUpdatingDependencies }
) => {
  switch (subscription.source) {
    case SUBSCRIPTION_SOURCE.SUBSCRIPTION_MANAGER: {
      const credentials = (await context.getSmsInfo()).cfService.credentials;
      return {
        credentials,
        url: credentials.subscription_manager_url,
        pathname: `/subscription-manager/v1/subscriptions/${subscription.tenantId}`,
        query: {
          ...(noCallbacksAppNames && { noCallbacksAppNames }),
          ...(updateApplicationURL && { updateApplicationURL }),
          ...(skipUnchangedDependencies && { skipUnchangedDependencies }),
          ...(skipUpdatingDependencies && { skipUpdatingDependencies }),
        },
      };
    }
    case SUBSCRIPTION_SOURCE.SAAS_REGISTRY: {
      const credentials = (await context.getRegInfo()).cfService.credentials;
      return {
        credentials,
        url: credentials.saas_registry_url,
        pathname: `/saas-manager/v1/application/tenants/${subscription.tenantId}/subscriptions`,
        query: {
          ...(noCallbacksAppNames && { noCallbacksAppNames }),
          ...(updateApplicationURL && { updateApplicationURL }),
          ...(skipUnchangedDependencies && { skipUnchangedDependencies }),
          ...(skipUpdatingDependencies && { skipUpdatingDependencies }),
        },
      };
    }
    default: {
      return fail("unknown subscription source %s", subscription.source);
    }
  }
};

const _registryCallOldForTenant = async (context, subscription, method, options = {}) => {
  const { source, tenantId } = subscription;
  const { doJobPoll = true } = options;
  const { url, pathname, query, credentials } = await _registryCallParts(context, subscription, options);

  const token = await context.getCachedUaaTokenFromCredentials(credentials);
  const startTime = new Date();
  let response;
  try {
    response = await request({
      method,
      url,
      pathname,
      ...(Object.keys(query).length !== 0 && { query }),
      auth: { token },
    });
  } catch (err) {
    return { tenantId, error: err.message, [SUBSCRIPTION_POLL_IS_SUCCESS]: false };
  }

  if (!doJobPoll) {
    // NOTE: with checkStatus being true by default, the above request only returns for successful changes
    return { tenantId, [SUBSCRIPTION_POLL_IS_SUCCESS]: true };
  }
  const [location] = response.headers.raw().location;

  const result = await _registryStatePoll(context, {
    source,
    url,
    pathname: location,
    credentials,
  });
  return {
    tenantId,
    duration: `${dateDiffInSeconds(startTime, new Date()).toFixed(0)} sec`,
    ...result,
  };
};

const _registryCallOld = async (context, method, tenantId, options) => {
  let results;
  if (tenantId) {
    assert(isUUID(tenantId), "TENANT_ID is not a uuid", tenantId);
    const { normalizedSubscriptions: subscriptions } = await _getSubscriptionInfos(context, {
      tenant: tenantId,
    });
    assert(subscriptions.length >= 1, "could not find tenant %s", tenantId);
    results = [await _registryCallOldForTenant(context, subscriptions[0], method, options)];
  } else {
    const { onlyStaleSubscriptions, onlyFailedSubscriptions } = options ?? {};
    const { normalizedSubscriptions: subscriptions } = await _getSubscriptionInfos(context, {
      onlyFailed: onlyFailedSubscriptions,
      onlyStale: onlyStaleSubscriptions,
      onlyUpdatable: true,
    });
    results = await limiter(
      regRequestConcurrency,
      subscriptions,
      async (subscription) => await _registryCallOldForTenant(context, subscription, method, options)
    );
  }
  assert(Array.isArray(results), "got invalid results from registry %s call with %j", method, options);
  logger.info(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
  assert(
    results.every((pollResult) => pollResult[SUBSCRIPTION_POLL_IS_SUCCESS]),
    "registry %s failed for some tenants",
    method
  );
};

const registryUpdateDependencies = async (context, [tenantId], [doSkipUnchanged]) =>
  await _registryCallOld(context, "PATCH", tenantId, { skipUnchangedDependencies: doSkipUnchanged });

const registryUpdateAllDependencies = async (context, _, [doSkipUnchanged, doOnlyStale, doOnlyFailed]) =>
  await _registryCallOld(context, "PATCH", undefined, {
    skipUnchangedDependencies: doSkipUnchanged,
    onlyStaleSubscriptions: doOnlyStale,
    onlyFailedSubscriptions: doOnlyFailed,
  });

const registryUpdateApplicationURL = async (context, [tenantId], [doOnlyStale, doOnlyFailed]) =>
  await _registryCallOld(context, "PATCH", tenantId, {
    updateApplicationURL: true,
    skipUpdatingDependencies: true,
    doJobPoll: false,
    onlyStaleSubscriptions: doOnlyStale,
    onlyFailedSubscriptions: doOnlyFailed,
  });

const registryMigrate = async (context, [tenantId]) => {
  return await _callAndPoll(context, SUBSCRIPTION_SOURCE.SUBSCRIPTION_MANAGER, tenantId, {
    method: "PATCH",
    pathname: `/subscription-manager/v1/subscriptions/${tenantId}/moveFromSaasProvisioning`,
  });
};

const registryOffboardSubscription = async (context, [tenantId]) => await _registryCallOld(context, "DELETE", tenantId);

const registryOffboardSubscriptionSkip = async (context, [tenantId, skipApps]) =>
  await _registryCallOld(context, "DELETE", tenantId, { noCallbacksAppNames: skipApps });

module.exports = {
  registryListSubscriptions,
  registryLongListSubscriptions,
  registryServiceConfig,
  registryUpdateDependencies,
  registryUpdateAllDependencies,
  registryUpdateApplicationURL,
  registryMigrate,
  registryOffboardSubscription,
  registryOffboardSubscriptionSkip,
};

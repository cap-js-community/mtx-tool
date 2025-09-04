/**
 * This is a wrapper for APIs of the subscription-manager
 * https://int.api.hana.ondemand.com/api/APISubscriptionManagerService/resource/IAS_Subscription_Operations_for_Providers_or_Systems
 */
"use strict";

const { request } = require("../shared/request");

const _subscriptionManagerRequest = async (context, reqOptions = {}) => {
  const {
    cfService: { credentials },
  } = await context.getSmsInfo();
  const { subscription_manager_url: url, ias_service_instance_id: iasServiceInstanceId } = credentials;
  const auth = { token: await context.getCachedUaaTokenFromCredentials(credentials) };
  const response = await request({ url, auth, ...reqOptions });

  if (reqOptions.method) {
    return response;
  }
  // NOTE: no method here means GET and all service endpoints we use have this structure
  return (await response.json())?.items ?? [];
};

const _subscriptionManagerList = async (context, {}) => {
  const subscriptions = await _subscriptionManagerRequest(context, {
    pathname: "/subscription-manager/v1/subscriptions",
  });
  const i = 0;
};

const subscriptionManagerList = async (context, [tenant], [doTimestamps, doJsonOutput, doOnlyStale, doOnlyFailed]) =>
  await _subscriptionManagerList(context, { filterTenantId: tenantId, doTimestamps, doJsonOutput });

const subscriptionManagerLongList = async (context, [tenantId], [doTimestamps, doJsonOutput]) =>
  await _subscriptionManagerList(context, { filterTenantId: tenantId, doTimestamps, doJsonOutput });

module.exports = {
  subscriptionManagerList,
  subscriptionManagerLongList,
};

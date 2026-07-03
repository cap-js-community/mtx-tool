"use strict";

const packageInfo = require("../../package.json");
const { parseIntWithFallback, sleep } = require("./static");
const { assert, fail } = require("./error");
const { request } = require("./request");
const { makeOneTime } = require("./execution-control");

const ENV = Object.freeze({
  SVM_POLL_FREQUENCY: "MTX_SVM_POLL_FREQUENCY",
});

const HTTP_ACCEPTED = 202;

const SERVICE_MANAGER_POLL_FREQUENCY_FALLBACK = 6000;

const QUERY_TYPE = Object.freeze({
  FIELD: "field",
  LABEL: "label",
});

const OPERATION_STATE = Object.freeze({
  SUCCEEDED: "succeeded",
  FAILED: "failed",
});

const pollFrequency = parseIntWithFallback(
  process.env[ENV.SVM_POLL_FREQUENCY],
  SERVICE_MANAGER_POLL_FREQUENCY_FALLBACK
);

// NOTE: v2 encodes multiple label filters as one comma-separated `labels` query param
//   (e.g. `labels=tenant_id=abc,service_plan_id=xyz`) and non-label filters as plain query params.
const _buildQuery = (components) => {
  const labels = [];
  const query = {};
  for (const { predicate, type, key, value } of components) {
    if (!predicate) continue;
    if (type === QUERY_TYPE.LABEL) {
      labels.push(`${key}=${value}`);
    } else {
      query[key] = value;
    }
  }
  if (labels.length > 0) {
    query.labels = labels.join(",");
  }
  return Object.keys(query).length > 0 ? { query } : undefined;
};

// NOTE: service-manager v2 paginates via a Link header: </path?page_token=x>; rel="next"
const _parseLinkNextPageToken = (linkHeader) => {
  if (!linkHeader) return undefined;
  const match = /[<]([^>]+)[>]; rel="next"/.exec(linkHeader);
  if (!match || !match[1]) return undefined;
  return new URL(match[1], "http://x").searchParams.get("page_token");
};

class ServiceManager {
  #credentials;
  #getToken;
  #clientName;
  #clientVersion;
  #pollFrequency;

  constructor({ credentials, getToken } = {}) {
    assert(credentials?.sm_url, "ServiceManager requires credentials with sm_url");
    assert(typeof getToken === "function", "ServiceManager requires a getToken(credentials) function");
    this.#credentials = credentials;
    this.#getToken = getToken;
    this.#clientName = packageInfo.name;
    this.#clientVersion = packageInfo.version;
    this.#pollFrequency = pollFrequency;
  }

  async #requestBase(reqOptions = {}) {
    return await request({
      url: this.#credentials.sm_url,
      auth: { token: await this.#getToken(this.#credentials) },
      ...reqOptions,
      headers: {
        // NOTE: service-manager uses this client information for better consumption reporting and rate-limiting
        "Client-Name": this.#clientName,
        "Client-Version": this.#clientVersion,
        ...reqOptions?.headers,
      },
    });
  }

  async #requestPaginatedGet(reqOptions) {
    const pages = [];
    let pageToken;
    do {
      const response = await this.#requestBase({
        ...reqOptions,
        ...(pageToken && { query: { ...reqOptions?.query, page_token: pageToken } }),
      });
      const data = await response.json();
      pages.push(data?.items ?? []);
      pageToken = _parseLinkNextPageToken(response.headers.get("link"));
    } while (pageToken);
    return pages.flat();
  }

  async #requestWithPolling(reqOptions) {
    const response = await this.#requestBase(reqOptions);
    assert(
      response.status === HTTP_ACCEPTED,
      "got unexpected response code %i for polling from %s",
      response.status,
      reqOptions.pathname
    );
    const location = response.headers.get("location");
    assert(location, "missing location header for polling from %s", reqOptions.pathname);
    let operation;
    do {
      await sleep(this.#pollFrequency);
      const pollResponse = await this.#requestBase({ pathname: location });
      operation = await pollResponse.json();
    } while (operation.state !== OPERATION_STATE.SUCCEEDED && operation.state !== OPERATION_STATE.FAILED);
    if (operation.state === OPERATION_STATE.FAILED) {
      const detail = operation.error?.description ?? operation.error?.broker_error?.description ?? "";
      fail("service-manager operation failed for %s: %s", location, detail);
    }
    return operation;
  }

  #getOfferingsUnfiltered = makeOneTime(
    async () => await this.#requestPaginatedGet({ pathname: "/v2/service_offerings" })
  );

  async getOfferings({ filterOfferingName } = {}) {
    if (filterOfferingName) {
      return await this.#requestPaginatedGet({
        pathname: "/v2/service_offerings",
        ..._buildQuery([{ predicate: true, type: QUERY_TYPE.FIELD, key: "name", value: filterOfferingName }]),
      });
    }
    return await this.#getOfferingsUnfiltered();
  }

  #getPlansUnfiltered = makeOneTime(async () => await this.#requestPaginatedGet({ pathname: "/v2/service_plans" }));

  async getPlans({ filterPlanId, filterOfferingId, filterPlanName } = {}) {
    if (filterPlanId || filterOfferingId || filterPlanName) {
      return await this.#requestPaginatedGet({
        pathname: "/v2/service_plans",
        ..._buildQuery([
          { predicate: filterPlanId, type: QUERY_TYPE.FIELD, key: "id", value: filterPlanId },
          { predicate: filterOfferingId, type: QUERY_TYPE.FIELD, key: "service_offering_id", value: filterOfferingId },
          { predicate: filterPlanName, type: QUERY_TYPE.FIELD, key: "name", value: filterPlanName },
        ]),
      });
    }
    return await this.#getPlansUnfiltered();
  }

  async resolvePlanId({ offeringName, planName }) {
    assert(offeringName, "resolvePlanId requires offeringName");
    assert(planName, "resolvePlanId requires planName");
    const [offering] = await this.getOfferings({ filterOfferingName: offeringName });
    assert(offering?.id, `could not find service offering "${offeringName}"`);
    const [plan] = await this.getPlans({ filterOfferingId: offering.id, filterPlanName: planName });
    assert(plan?.id, `could not find service plan "${planName}" within offering "${offeringName}"`);
    return plan.id;
  }

  async #coercePlanId({ planId, offeringName, planName }) {
    if (planId) return planId;
    if (offeringName || planName) return await this.resolvePlanId({ offeringName, planName });
    return fail("could not resolve a service plan: pass planId or offeringName+planName");
  }

  async getInstances({ filterTenantId, filterPlanId } = {}) {
    return await this.#requestPaginatedGet({
      pathname: "/v2/service_instances",
      ..._buildQuery([
        { predicate: filterPlanId, type: QUERY_TYPE.FIELD, key: "service_plan_id", value: filterPlanId },
        { predicate: filterTenantId, type: QUERY_TYPE.LABEL, key: "tenant_id", value: filterTenantId },
      ]),
    });
  }

  async getBindings({ filterTenantId } = {}) {
    return await this.#requestPaginatedGet({
      pathname: "/v2/service_bindings",
      ..._buildQuery([{ predicate: filterTenantId, type: QUERY_TYPE.LABEL, key: "tenant_id", value: filterTenantId }]),
    });
  }

  async createInstance({ name, planId, offeringName, planName, tenantId, parameters, labels: extraLabels } = {}) {
    assert(name, "createInstance requires name");
    const resolvedPlanId = await this.#coercePlanId({ planId, offeringName, planName });
    const labels = {
      ...(tenantId && { tenant_id: [tenantId] }),
      ...extraLabels,
    };
    return await this.#requestWithPolling({
      method: "POST",
      pathname: "/v2/service_instances",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        service_plan_id: resolvedPlanId,
        ...(Object.keys(labels).length > 0 && { labels }),
        ...(parameters && { parameters }),
      }),
    });
  }

  async createBinding({ name, instanceId, planId, offeringName, planName, labels: extraLabels, parameters } = {}) {
    assert(name, "createBinding requires name");
    assert(instanceId, "createBinding requires instanceId");
    // NOTE: cds-mtxs relies on the service_plan_id label
    const resolvedPlanId = await this.#coercePlanId({ planId, offeringName, planName });
    // NOTE: service-manager sets the container_id and subaccount_id itself and will block requests that set these
    const labels = Object.fromEntries(
      Object.entries({
        ...extraLabels,
        service_plan_id: [resolvedPlanId],
      }).filter(([key]) => !["container_id", "subaccount_id"].includes(key))
    );
    return await this.#requestWithPolling({
      method: "POST",
      pathname: "/v2/service_bindings",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        service_instance_id: instanceId,
        ...(Object.keys(labels).length > 0 && { labels }),
        ...(parameters && { parameters }),
      }),
    });
  }

  async deleteInstance(instanceId) {
    assert(instanceId, "deleteInstance requires instanceId");
    return await this.#requestWithPolling({
      method: "DELETE",
      pathname: `/v2/service_instances/${instanceId}`,
    });
  }

  async deleteBinding(bindingId) {
    assert(bindingId, "deleteBinding requires bindingId");
    return await this.#requestWithPolling({
      method: "DELETE",
      pathname: `/v2/service_bindings/${bindingId}`,
    });
  }
}

module.exports = {
  ServiceManager,
  _: {
    _buildQuery,
    _parseLinkNextPageToken,
  },
};

"use strict";

const packageInfo = require("../../package.json");
const { parseIntWithFallback, randomString, sleep } = require("./static");
const { assert, fail } = require("./error");
const { request } = require("./request");
const { makeOneTime } = require("./execution-control");

const ENV = Object.freeze({
  SVM_POLL_FREQUENCY: "MTX_SVM_POLL_FREQUENCY",
});

const HTTP_ACCEPTED = 202;

const SERVICE_MANAGER_POLL_FREQUENCY_FALLBACK = 6000;

const SENSITIVE_FIELD_NAMES = ["uri"];
const SENSITIVE_FIELD_MARKERS = ["password", "key"];
const SENSITIVE_FIELD_HIDDEN_TEXT = "*** show with --reveal ***";

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

  // NOTE: v2 encodes multiple label filters as one comma-separated `labels` query param
  //   (e.g. `labels=tenant_id=abc,service_plan_id=xyz`) and non-label filters as plain query params.
  static #buildQuery(components) {
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

  // NOTE: service-manager v2 paginates via a Link header: </path?page_token=x>; rel="next"
  static #parseLinkNextPageToken(linkHeader) {
    if (!linkHeader) return undefined;
    const match = /[<]([^>]+)[>]; rel="next"/.exec(linkHeader);
    if (!match || !match[1]) return undefined;
    return new URL(match[1], "http://x").searchParams.get("page_token");
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
      pageToken = ServiceManager.#parseLinkNextPageToken(response.headers.get("link"));
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
        ...ServiceManager.#buildQuery([
          { predicate: true, type: QUERY_TYPE.FIELD, key: "name", value: filterOfferingName },
        ]),
      });
    }
    return await this.#getOfferingsUnfiltered();
  }

  #getPlansUnfiltered = makeOneTime(async () => await this.#requestPaginatedGet({ pathname: "/v2/service_plans" }));

  async getPlans({ filterPlanId, filterOfferingId, filterPlanName } = {}) {
    if (filterPlanId || filterOfferingId || filterPlanName) {
      return await this.#requestPaginatedGet({
        pathname: "/v2/service_plans",
        ...ServiceManager.#buildQuery([
          { predicate: filterPlanId, type: QUERY_TYPE.FIELD, key: "id", value: filterPlanId },
          { predicate: filterOfferingId, type: QUERY_TYPE.FIELD, key: "service_offering_id", value: filterOfferingId },
          { predicate: filterPlanName, type: QUERY_TYPE.FIELD, key: "name", value: filterPlanName },
        ]),
      });
    }
    return await this.#getPlansUnfiltered();
  }

  async getPlanInfo(offeringName, planName) {
    assert(offeringName, "getPlanInfo requires offeringName");
    assert(planName, "getPlanInfo requires planName");
    const [offering] = await this.getOfferings({ filterOfferingName: offeringName });
    assert(offering?.id, `could not find service offering "${offeringName}"`);
    const [plan] = await this.getPlans({ filterOfferingId: offering.id, filterPlanName: planName });
    assert(plan?.id, `could not find service plan "${planName}" within offering "${offeringName}"`);
    return { offeringId: offering.id, offeringName, planId: plan.id, planName };
  }

  async getInstances({ filterTenantId, filterPlanId, doEnsureUsable = false, doEnsureTenantLabel = false } = {}) {
    let instances = await this.#requestPaginatedGet({
      pathname: "/v2/service_instances",
      ...ServiceManager.#buildQuery([
        { predicate: filterPlanId, type: QUERY_TYPE.FIELD, key: "service_plan_id", value: filterPlanId },
        { predicate: filterTenantId, type: QUERY_TYPE.LABEL, key: "tenant_id", value: filterTenantId },
      ]),
    });
    if (doEnsureUsable) {
      // NOTE: we rely on service brokers to implement usable:
      //   https://github.com/cloudfoundry/servicebroker/blob/v2.17/spec.md#service-broker-errors
      instances = instances.filter((instance) => instance.usable);
    }
    if (doEnsureTenantLabel) {
      instances = instances.filter((instance) => instance.labels.tenant_id !== undefined);
    }
    return instances;
  }

  static #hideSensitiveDataInBinding(binding) {
    const fields = binding?.credentials ? Object.keys(binding.credentials) : [];
    for (const field of fields) {
      if (SENSITIVE_FIELD_MARKERS.some((marker) => field.includes(marker)) || SENSITIVE_FIELD_NAMES.includes(field)) {
        binding.credentials[field] = SENSITIVE_FIELD_HIDDEN_TEXT;
      }
    }
  }

  async getBindings({ filterTenantId, doEnsureTenantLabel = false, doAssertFoundSome = false, doReveal = false } = {}) {
    let bindings = await this.#requestPaginatedGet({
      pathname: "/v2/service_bindings",
      ...ServiceManager.#buildQuery([
        { predicate: filterTenantId, type: QUERY_TYPE.LABEL, key: "tenant_id", value: filterTenantId },
      ]),
    });
    if (doEnsureTenantLabel) {
      bindings = bindings.filter((binding) => binding.labels.tenant_id !== undefined);
    }
    if (doAssertFoundSome) {
      assert(
        bindings.length >= 1,
        filterTenantId
          ? `could not find service binding for tenant ${filterTenantId}`
          : "could not find any service bindings"
      );
    }
    if (!doReveal) {
      bindings.forEach(ServiceManager.#hideSensitiveDataInBinding);
    }
    return bindings;
  }

  async createInstance(planId, { name = randomString(32), tenantId, parameters, labels: extraLabels } = {}) {
    assert(planId, "createInstance requires planId");
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
        service_plan_id: planId,
        ...(Object.keys(labels).length > 0 && { labels }),
        ...(parameters && { parameters }),
      }),
    });
  }

  async createBinding(instanceId, planId, { name = randomString(32), labels: extraLabels, parameters } = {}) {
    assert(instanceId, "createBinding requires instanceId");
    assert(planId, "createBinding requires planId");
    // NOTE: cds-mtxs relies on the service_plan_id label
    // NOTE: service-manager sets the container_id and subaccount_id itself and will block requests that set these
    const labels = Object.fromEntries(
      Object.entries({
        ...extraLabels,
        service_plan_id: [planId],
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
  OPERATION_STATE,
  ServiceManager,
};

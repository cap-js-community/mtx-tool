"use strict";

const { assert } = require("./error");
const { request } = require("./request");

const SENSITIVE_FIELD_NAMES = ["url", "certificate"];
const SENSITIVE_FIELD_MARKERS = ["password", "key"];
const SENSITIVE_FIELD_HIDDEN_TEXT = "*** show with --reveal ***";

// NOTE: hana-multitenancy (Tenant Management Service v2) reports async operation progress via the operation's
//   status.state, which differs from the service-manager succeeded/failed states. Exported for the create/update/
//   delete helpers (and their polling) that will build on this module in a later step.
const OPERATION_STATE = Object.freeze({
  STARTING: "STARTING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  WAIT_FOR_USER_INPUT: "WAIT_FOR_USER_INPUT",
  DELETED: "DELETED",
});

const URL_BASE_PATH = "/tenants/v2/tenants";

class HanaMultitenancy {
  #credentials;
  #getToken;
  #baseUrl;

  constructor({ credentials, getToken } = {}) {
    assert(credentials?.baseurl, "HanaMultitenancy requires credentials with a baseurl");
    assert(credentials?.uaa, "HanaMultitenancy requires credentials with a uaa section");
    assert(typeof getToken === "function", "HanaMultitenancy requires a getToken(credentials) function");
    this.#credentials = credentials;
    this.#getToken = getToken;
    this.#baseUrl = /^https?:\/\//.test(credentials.baseurl) ? credentials.baseurl : `https://${credentials.baseurl}`;
  }

  async #requestBase(reqOptions = {}) {
    return await request({
      url: this.#baseUrl,
      auth: { token: await this.#getToken(this.#credentials.uaa) },
      ...reqOptions,
      headers: {
        Accept: "application/json",
        ...reqOptions?.headers,
      },
    });
  }

  async #requestPaginatedGet(reqOptions) {
    const pages = [];
    let skipToken;
    do {
      const response = await this.#requestBase({
        ...reqOptions,
        ...(skipToken && { query: { ...reqOptions?.query, $skiptoken: skipToken } }),
      });
      const data = await response.json();
      pages.push(data?.data ?? []);
      skipToken = data?.$skiptoken;
    } while (skipToken);
    return pages.flat();
  }

  static #buildExpand(components) {
    const expand = components.filter(({ predicate }) => predicate).map(({ value }) => value);
    return expand.length > 0 ? { $expand: expand.join(",") } : undefined;
  }

  async getTenants({ filterServiceInstanceId, filterQuery, doExpandContainers = false } = {}) {
    const query = {
      ...(filterServiceInstanceId && { serviceInstanceID: filterServiceInstanceId }),
      ...(filterQuery && { $filter: filterQuery }),
      ...HanaMultitenancy.#buildExpand([
        { predicate: doExpandContainers, value: "containers" },
        { predicate: doExpandContainers, value: "containers/credentials" },
      ]),
    };
    return await this.#requestPaginatedGet({
      pathname: URL_BASE_PATH,
      ...(Object.keys(query).length > 0 && { query }),
    });
  }

  async getContainers(tenantId, { filterQuery, doExpandCredentials = false } = {}) {
    assert(tenantId, "getContainers requires tenantId");
    const query = {
      ...(filterQuery && { $filter: filterQuery }),
      ...HanaMultitenancy.#buildExpand([{ predicate: doExpandCredentials, value: "credentials" }]),
    };
    const response = await this.#requestBase({
      pathname: `${URL_BASE_PATH}/${tenantId}/containers/`,
      ...(Object.keys(query).length > 0 && { query }),
    });
    const data = await response.json();
    return data?.data ?? [];
  }

  static #hideSensitiveDataInCredential(credential) {
    for (const field of Object.keys(credential)) {
      if (
        SENSITIVE_FIELD_MARKERS.some((marker) => field.toLowerCase().includes(marker)) ||
        SENSITIVE_FIELD_NAMES.includes(field)
      ) {
        credential[field] = SENSITIVE_FIELD_HIDDEN_TEXT;
      }
    }
  }

  async getCredentials(tenantId, containerId, { doReveal = false } = {}) {
    assert(tenantId, "getCredentials requires tenantId");
    assert(containerId, "getCredentials requires containerId");
    const response = await this.#requestBase({
      pathname: `${URL_BASE_PATH}/${tenantId}/containers/${containerId}/credentials`,
    });
    const data = await response.json();
    const credentials = data?.data ?? [];
    if (!doReveal) {
      credentials.forEach(HanaMultitenancy.#hideSensitiveDataInCredential);
    }
    return credentials;
  }
}

module.exports = {
  OPERATION_STATE,
  HanaMultitenancy,
};

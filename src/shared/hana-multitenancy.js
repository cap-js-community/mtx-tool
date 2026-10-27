"use strict";

const { assert } = require("./error");
const { request } = require("./request");

const SENSITIVE_FIELD_NAMES = [];
const SENSITIVE_FIELD_MARKERS = ["password", "key"];
const SENSITIVE_FIELD_HIDDEN_TEXT = "*** show with --reveal ***";

const TENANT_LABEL_KEY = "tenant_id";

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

  async getTenant(tenantId, { doExpandContainers = true, doExpandCredentials = true, doReveal = false } = {}) {
    assert(tenantId, "getTenant requires tenantId");
    const query = {
      ...(doExpandContainers &&
        !doExpandCredentials && {
          $expand: "containers",
        }),
      ...(doExpandContainers &&
        doExpandCredentials && {
          $expand: "containers/credentials",
        }),
    };
    const response = await this.#requestBase({
      pathname: `${URL_BASE_PATH}/${tenantId}`,
      ...(Object.keys(query).length > 0 && { query }),
    });
    const tenant = await response.json();

    if (doExpandCredentials && !doReveal) {
      for (const container of tenant.containers ?? []) {
        for (const credential of container.credentials ?? [])
          HanaMultitenancy.#hideSensitiveDataInCredential(credential);
      }
    }

    return tenant;
  }

  async getTenants({
    filterServiceInstanceId,
    filterContainerTenantId,
    doExpandContainers = false,
    doExpandCredentials = false,
    doEnsureContainer = false,
    doEnsureTenantLabel = false,
    doReveal = false,
  } = {}) {
    const query = {
      ...(filterServiceInstanceId && { serviceInstanceID: filterServiceInstanceId }),
      ...(filterContainerTenantId && {
        containerFilter: `hassubset(labels,["${TENANT_LABEL_KEY}=${filterContainerTenantId}"])`,
      }),
      ...(doExpandContainers &&
        !doExpandCredentials && {
          $expand: "containers",
        }),
      ...(doExpandContainers &&
        doExpandCredentials && {
          $expand: "containers/credentials",
        }),
    };
    let tenants = await this.#requestPaginatedGet({
      pathname: URL_BASE_PATH,
      ...(Object.keys(query).length > 0 && { query }),
    });

    if (doEnsureContainer) {
      tenants = tenants.filter((tenant) => tenant.containers?.length > 0);
    }

    if (doEnsureTenantLabel) {
      for (const tenant of tenants) {
        if (tenant.containers?.length > 0) {
          tenant.containers = tenant.containers.filter((container) =>
            container.labels?.some((label) => label.startsWith(`${TENANT_LABEL_KEY}=`))
          );
        }
      }
    }

    if (doExpandCredentials && !doReveal) {
      for (const tenant of tenants) {
        for (const container of tenant.containers ?? []) {
          for (const credential of container.credentials ?? [])
            HanaMultitenancy.#hideSensitiveDataInCredential(credential);
        }
      }
    }

    return tenants;
  }

  static fromSvmLabels(labels) {
    return labels
      ? Object.entries(labels).reduce((acc, [key, values]) => {
          if (!["container_id", "subaccount_id"].includes(key)) {
            acc.push(`${key}=${values.join(",")}`);
          }
          return acc;
        }, [])
      : labels;
  }

  async updateContainer(tenantId, containerId, { labels, tmsInstanceId } = {}) {
    assert(tenantId, "updateContainer requires tenantId");
    assert(containerId, "updateContainer requires containerId");
    const response = await this.#requestBase({
      method: "PATCH",
      pathname: `${URL_BASE_PATH}/${tenantId}/containers/${containerId}`,
      body: JSON.stringify({
        ...(labels && { labels }),
        ...(tmsInstanceId && { multitenancyInstanceID: tmsInstanceId }),
      }),
    });
    let result;
    switch (response.status) {
      case 200: {
        result = await response.json();
        break;
      }
      default: {
        result = await response.text();
      }
    }
    return result;
  }
}

module.exports = {
  TENANT_LABEL_KEY,
  HanaMultitenancy,
};

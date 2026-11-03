/**
 * This is a wrapper for the SAP HANA Cloud Multi-Tenancy REST API (TMS v2).
 * - https://api.sap.com/api/TenantAPI/overview
 *
 * It replaces service-manager as the source of HDI container credentials for applications that have
 * migrated their tenant databases to SAP HANA TMS v2:
 * - https://cap.cloud.sap/docs/guides/multitenancy/#sap-hana-tms-v2
 *
 * Only read access is implemented here, which is what the hdi list/long-list/tunnel commands need.
 * Create/delete of containers and credentials (POST/DELETE + async operation polling via
 * /tenants/v2/operations/{id}) is intentionally out of scope.
 */
"use strict";

const packageInfo = require("../../package.json");
const { assert } = require("./error");
const { request } = require("./request");

// NOTE: credential fields that must be hidden unless --reveal is passed
const SENSITIVE_FIELD_NAMES = ["password", "hdiPassword", "certificate"];
const SENSITIVE_FIELD_HIDDEN_TEXT = "*** show with --reveal ***";

// NOTE: cds-mtxs tags each tenant container with the BTP tenant_id as a "key=value" label, which is how
//   we map a BTP tenant id onto a TMS v2 container. See
//   https://cap.cloud.sap/docs/guides/multitenancy/#handle-sap-hana-tenants
const TENANT_ID_LABEL_KEY = "tenant_id";

// NOTE: expand values offered by the tenant search API. "containers/credentials" returns the full
//   credential fields (host/port/user/password/...) but is only accepted when the result is a single
//   record or scoped to one service instance.
const EXPAND = Object.freeze({
  CONTAINERS: "containers",
  CONTAINERS_CREDENTIALS: "containers/credentials",
});

const _hassubset = (key, value) => `hassubset(labels,["${key}=${value}"])`;

class TenantManagement {
  #apiUrl;
  #getToken;
  #credentials;
  #clientName;
  #clientVersion;

  constructor({ apiUrl, credentials, getToken } = {}) {
    assert(apiUrl, "TenantManagement requires an apiUrl");
    assert(typeof getToken === "function", "TenantManagement requires a getToken(credentials) function");
    this.#apiUrl = apiUrl;
    this.#credentials = credentials;
    this.#getToken = getToken;
    this.#clientName = packageInfo.name;
    this.#clientVersion = packageInfo.version;
  }

  async #requestBase(reqOptions = {}) {
    return await request({
      url: this.#apiUrl,
      auth: { token: await this.#getToken(this.#credentials) },
      ...reqOptions,
      headers: {
        Accept: "application/json",
        "Client-Name": this.#clientName,
        "Client-Version": this.#clientVersion,
        ...reqOptions?.headers,
      },
    });
  }

  // NOTE: the tenant search API paginates via a $skiptoken continuation token, which is returned at the
  //   top level of the response body under the same "$skiptoken" key and echoed back as a query param
  async #requestPaginatedGet(reqOptions) {
    const tenants = [];
    let skipToken;
    do {
      const response = await this.#requestBase({
        ...reqOptions,
        query: { ...reqOptions?.query, ...(skipToken && { $skiptoken: skipToken }) },
      });
      const data = await response.json();
      tenants.push(...(data?.data ?? []));
      skipToken = data?.["$skiptoken"] ?? undefined;
    } while (skipToken);
    return tenants;
  }

  static #hideSensitiveDataInCredential(credential) {
    for (const field of SENSITIVE_FIELD_NAMES) {
      if (credential[field] !== undefined) {
        credential[field] = SENSITIVE_FIELD_HIDDEN_TEXT;
      }
    }
  }

  static #hideSensitiveDataInTenants(tenants) {
    for (const tenant of tenants) {
      for (const container of tenant.containers ?? []) {
        for (const credential of container.credentials ?? []) {
          TenantManagement.#hideSensitiveDataInCredential(credential);
        }
      }
    }
  }

  // NOTE: cds-mtxs tags only the container (not the parent tenant) with the tenant_id label, so we filter
  //   on container labels via containerFilter. $expand=containers/credentials returns the full credential
  //   fields but is only accepted when the result is scoped (single record / service instance / filter).
  async getTenants({ filterTenantId, serviceInstanceID, withCredentials = false, doReveal = false } = {}) {
    const query = {
      $expand: withCredentials ? EXPAND.CONTAINERS_CREDENTIALS : EXPAND.CONTAINERS,
    };
    if (serviceInstanceID) {
      query.serviceInstanceID = serviceInstanceID;
    }
    if (filterTenantId) {
      query.containerFilter = _hassubset(TENANT_ID_LABEL_KEY, filterTenantId);
    }
    const tenants = await this.#requestPaginatedGet({ pathname: "/tenants/v2/tenants", query });
    if (!doReveal) {
      TenantManagement.#hideSensitiveDataInTenants(tenants);
    }
    return tenants;
  }
}

module.exports = {
  TENANT_ID_LABEL_KEY,
  TenantManagement,
};

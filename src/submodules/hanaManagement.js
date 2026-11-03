"use strict";

const {
  tableList,
  isPortFree,
  formatTimestampsWithRelativeDays,
  compareFor,
  clusterByKey,
} = require("../shared/static");
const { makeOneTime } = require("../shared/execution-control");
const { assert } = require("../shared/error");
const { Logger } = require("../shared/logger");
const { ServiceManager } = require("../shared/service-manager");
const { TenantManagement, TENANT_ID_LABEL_KEY } = require("../shared/tenant-management");

const TUNNEL_LOCAL_PORT = 30015;
const HDI_SHARED_SERVICE_OFFERING = "hana";
const HDI_SHARED_SERVICE_PLAN = "hdi-shared";

const logger = Logger.getInstance();

const isValidTenantId = (input) => input && /^[0-9a-z-_/]+$/i.test(input);

const compareForTenantId = compareFor((a) => a.labels.tenant_id[0].toUpperCase());

const _formatOutput = (output) =>
  JSON.stringify(Array.isArray(output) && output.length === 1 ? output[0] : output, null, 2);

const _getServiceManager = makeOneTime(async (context) => {
  const {
    cfBinding: { credentials },
  } = await context.getHdiInfo();
  return new ServiceManager({
    credentials,
    getToken: (credentials) => context.getCachedUaaTokenFromCredentials(credentials),
  });
});

const _getHdiSharedPlanId = makeOneTime(async (context) => {
  const svm = await _getServiceManager(context);
  const { planId } = await svm.getPlanInfo(HDI_SHARED_SERVICE_OFFERING, HDI_SHARED_SERVICE_PLAN);
  return planId;
});

// NOTE: when a hana tms (v2) app is configured, hdi container credentials are retrieved from the HANA
//   Cloud Multi-Tenancy REST API instead of service-manager. The tms binding carries a baseurl for the
//   api gateway and a uaa block used for the client-credentials / x509 token.
const _getTenantManagement = makeOneTime(async (context) => {
  const {
    cfBinding: {
      credentials: { baseurl, uaa },
    },
  } = await context.getHdiTmsInfo();
  assert(baseurl, "hana tms binding is missing baseurl");
  assert(uaa, "hana tms binding is missing uaa credentials");
  return new TenantManagement({
    apiUrl: baseurl.startsWith("http") ? baseurl : `https://${baseurl}`,
    credentials: uaa,
    getToken: (credentials) => context.getCachedUaaTokenFromCredentials(credentials),
  });
});

// NOTE: cds-mtxs tags tenants and containers with the BTP tenant_id as a "tenant_id=<id>" label
const _tenantIdFromLabels = (labels) => {
  for (const label of labels ?? []) {
    const [key, ...rest] = label.split("=");
    if (key === TENANT_ID_LABEL_KEY) {
      return rest.join("=");
    }
  }
  return undefined;
};

const _hdiInstances = async (context, { filterTenantId, doEnsureTenantLabel = true } = {}) => {
  const svm = await _getServiceManager(context);
  const filterPlanId = await _getHdiSharedPlanId(context);
  return await svm.getInstances({ filterTenantId, filterPlanId, doEnsureTenantLabel });
};

// NOTE: service-manager has no way to filter bindings by the underlying instance's service_plan_id, so we fetch by
//   tenant and rely on callers to intersect against hdi instances
const _hdiBindings = async (context, { filterTenantId, doReveal = false, doEnsureTenantLabel = true } = {}) => {
  const svm = await _getServiceManager(context);
  return await svm.getBindings({ filterTenantId, doEnsureTenantLabel, doReveal });
};

const _nextFreeSidPort = async () => {
  const maxPort = TUNNEL_LOCAL_PORT + 9900;
  for (let port = TUNNEL_LOCAL_PORT; port <= maxPort; port += 100) {
    if (await isPortFree(port)) {
      return port;
    }
  }
  return null;
};

const _hdiTunnelHanaCloudWarning = () => {
  logger.warning(
    "warning: detected port 443, which is used by HANA Cloud. SSH port forwarding, which is required for tunneling, will not work with HANA Cloud."
  );
};

const _filterBindingsForInstances = (bindings, instances) => {
  const instanceIds = new Set(instances.map((instance) => instance.id));
  return bindings.filter((binding) => instanceIds.has(binding.service_instance_id));
};

const _hdiTunnelCredentials = async (cfSsh, credentials, filterTenantId) => {
  const { host, port } = credentials[0];
  assert(
    credentials.slice(1).every((credential) => credential.host === host && credential.port === port),
    "found more than one host and port combination in credentials for tenant %s",
    filterTenantId
  );

  const localPort = await _nextFreeSidPort();
  if (localPort !== TUNNEL_LOCAL_PORT) {
    logger.warning("warning: using local port %i, because %i was not free", localPort, TUNNEL_LOCAL_PORT);
  }
  assert(localPort !== null, "could not find free sid port 3xx15");

  for (let credentialIndex = 0; credentialIndex < credentials.length; credentialIndex++) {
    const { host, port, url, user, password, schema, hdiUser, hdiPassword } = credentials[credentialIndex];
    const localUrl = url
      .replace(host, "localhost")
      .replace(":" + port, ":" + localPort)
      .replace("validateCertificate=true&", "validateCertificate=false&");
    const runtimeTable = [
      ["localUrl", localUrl],
      ["remoteUrl", url],
      ["user", user],
      ["password", password],
    ];
    const designtimeTable = [
      ["localUrl", localUrl.replace(schema, schema + "#DI")],
      ["remoteUrl", url.replace(schema, schema + "#DI")],
      ["user", hdiUser],
      ["password", hdiPassword],
    ];

    if (credentials.length > 1) {
      logger.info();
      logger.info("binding #%i", credentialIndex + 1);
    }
    logger.info();
    logger.info("runtime");
    logger.info(tableList(runtimeTable, { sortCol: null, noHeader: true, withRowNumber: false }));
    logger.info();
    logger.info("designtime");
    logger.info(tableList(designtimeTable, { sortCol: null, noHeader: true, withRowNumber: false }));
    logger.info();
  }

  if (port === "443") {
    _hdiTunnelHanaCloudWarning();
  }
  return cfSsh({ localPort, remotePort: port, remoteHostname: host });
};

const _hdiTunnel = async (context, filterTenantId, doReveal = false) => {
  const { cfSsh } = await context.getHdiInfo();
  const [instances, allBindings] = await Promise.all([
    _hdiInstances(context, { filterTenantId }),
    _hdiBindings(context, { filterTenantId, doReveal }),
  ]);
  const bindings = _filterBindingsForInstances(allBindings, instances);
  assert(bindings.length >= 1, "could not find hdi service binding for tenant %s", filterTenantId);
  assert(
    bindings.every((binding) => binding.credentials),
    "found binding without credentials for tenant %s",
    filterTenantId
  );

  // NOTE: service-manager binding credentials use hdi_user/hdi_password, which we normalize to the
  //   hdiUser/hdiPassword shape shared with the tenant-management path
  const credentials = bindings.map(({ credentials }) => ({
    ...credentials,
    hdiUser: credentials.hdi_user,
    hdiPassword: credentials.hdi_password,
  }));
  return await _hdiTunnelCredentials(cfSsh, credentials, filterTenantId);
};

const _hdiList = async (context, { filterTenantId, doTimestamps, doJsonOutput } = {}) => {
  const [instances, allBindings] = await Promise.all([
    _hdiInstances(context, { filterTenantId }),
    _hdiBindings(context, { filterTenantId }),
  ]);
  const bindings = _filterBindingsForInstances(allBindings, instances);

  if (doJsonOutput) {
    return { instances, bindings };
  }

  const bindingsByInstance = clusterByKey(bindings, "service_instance_id");
  instances.sort(compareForTenantId);

  const doShowDbTenantColumn = bindings.some((binding) => binding.credentials?.tenantId);
  const headerRow = ["tenant_id", "host", "schema", "usable"];
  doShowDbTenantColumn && headerRow.splice(1, 0, "db_tenant_id");
  doTimestamps && headerRow.push("created_on", "updated_on");
  const nowDate = new Date();
  const instanceMap = (instance) => {
    const [binding] = bindingsByInstance[instance.id] || [];
    const row = [
      instance.labels.tenant_id[0],
      binding ? binding.credentials?.host + ":" + binding.credentials?.port : "missing binding",
      binding ? binding.credentials?.schema : "",
      instance.usable,
    ];
    doShowDbTenantColumn && row.splice(1, 0, instance.id);
    doTimestamps &&
      row.push(
        // NOTE: we currently use instance.last_operation.updated_at in preference to instance.updated_at,
        //   because the top-level fields appears not to be filled correctly.
        ...formatTimestampsWithRelativeDays([instance.created_at, instance.last_operation?.updated_at], nowDate)
      );
    return row;
  };
  const table = instances && instances.length ? [headerRow].concat(instances.map(instanceMap)) : null;
  return tableList(table, { withRowNumber: !filterTenantId });
};

// NOTE: tenant-management can only expand full credentials (host/schema/...) when the result is a
//   single record (or scoped to one service instance), so we request credentials only when filtering
//   for a specific tenant. For the unfiltered list we show tenant_id and readiness, with host/schema
//   replaced by a placeholder and an explanatory footnote.
const TMS_CREDENTIAL_PLACEHOLDER = "*";
const TMS_CREDENTIAL_PLACEHOLDER_HINT =
  "* the HANA TMS v2 api only returns host/schema when scoped to one tenant, filter for a tenant id to see them";

// NOTE: the --json output of hdil/hdill is a stable contract consumed by downstream tooling that
//   predates tms v2 and expects the service-manager shape { instances, bindings }. The tms v2 api
//   returns a { tenants: [{ containers: [{ credentials: [...] }] }] } tree instead, so we map it back
//   onto the legacy shape here: one binding per container, credentials flattened from the single-element
//   array to an object, camelCase hdiUser/hdiPassword normalized back to snake_case hdi_user/hdi_password,
//   and labels rendered as the { tenant_id: ["<id>"] } object form. Human (non-json) output keeps the
//   richer tenants tree.
const _tmsTenantsToLegacyJson = (tenants) => {
  const instances = [];
  const bindings = [];
  for (const tenant of tenants ?? []) {
    for (const container of tenant.containers ?? []) {
      // NOTE: cds-mtxs tags the container (not the tenant) with the BTP tenant_id label
      const tenantId = _tenantIdFromLabels(container.labels) ?? tenant.id;
      const serviceInstanceId = container.serviceInstanceID ?? tenant.serviceInstanceID;
      const labels = { tenant_id: [tenantId] };
      instances.push({
        id: serviceInstanceId,
        labels,
        usable: container.status?.ready ?? false,
        created_at: container.createTimestamp,
      });
      for (const credential of container.credentials ?? []) {
        const { hdiUser, hdiPassword, ...rest } = credential;
        bindings.push({
          id: credential.id,
          service_instance_id: serviceInstanceId,
          labels,
          credentials: {
            ...rest,
            hdi_user: hdiUser,
            hdi_password: hdiPassword,
            tenantId,
          },
        });
      }
    }
  }
  return { instances, bindings };
};

const _hdiTmsList = async (context, { filterTenantId, doTimestamps, doJsonOutput } = {}) => {
  const tms = await _getTenantManagement(context);
  const withCredentials = Boolean(filterTenantId);
  const tenants = await tms.getTenants({ filterTenantId, withCredentials });

  if (doJsonOutput) {
    return _tmsTenantsToLegacyJson(tenants);
  }

  const rows = [];
  for (const tenant of tenants) {
    for (const container of tenant.containers ?? []) {
      // NOTE: cds-mtxs tags the container (not the tenant) with the BTP tenant_id label
      const tenantId = _tenantIdFromLabels(container.labels) ?? tenant.id;
      const [credential] = container.credentials ?? [];
      rows.push({
        tenantId,
        host: credential?.host
          ? `${credential.host}:${credential.port}`
          : withCredentials
            ? ""
            : TMS_CREDENTIAL_PLACEHOLDER,
        schema: credential?.schema ?? (withCredentials ? "" : TMS_CREDENTIAL_PLACEHOLDER),
        usable: container.status?.ready ?? false,
        createTimestamp: container.createTimestamp,
      });
    }
  }
  rows.sort(compareFor((row) => row.tenantId.toUpperCase()));

  const headerRow = ["tenant_id", "host", "schema", "usable"];
  doTimestamps && headerRow.push("created_on");
  const nowDate = new Date();
  const table = rows.length
    ? [headerRow].concat(
        rows.map((row) => {
          const out = [row.tenantId, row.host, row.schema, row.usable];
          doTimestamps && out.push(...formatTimestampsWithRelativeDays([row.createTimestamp], nowDate));
          return out;
        })
      )
    : null;
  const output = tableList(table, { withRowNumber: !filterTenantId });
  return table && !withCredentials ? `${output}\n\n${TMS_CREDENTIAL_PLACEHOLDER_HINT}` : output;
};

const _hdiTmsLongList = async (context, { filterTenantId, doJsonOutput, doReveal } = {}) => {
  const tms = await _getTenantManagement(context);
  const tenants = await tms.getTenants({ filterTenantId, withCredentials: Boolean(filterTenantId), doReveal });

  if (doJsonOutput) {
    return _tmsTenantsToLegacyJson(tenants);
  }
  return `
=== tenant${tenants.length === 1 ? "" : "s"} ===

${_formatOutput(tenants)}
`;
};

const _hdiTmsTunnel = async (context, filterTenantId, doReveal = false) => {
  const { cfSsh } = await context.getHdiTmsInfo();
  const tms = await _getTenantManagement(context);
  const tenants = await tms.getTenants({ filterTenantId, withCredentials: true, doReveal });

  const credentials = [];
  for (const tenant of tenants) {
    for (const container of tenant.containers ?? []) {
      for (const credential of container.credentials ?? []) {
        credentials.push(credential);
      }
    }
  }
  assert(credentials.length >= 1, "could not find hdi container credentials for tenant %s", filterTenantId);
  assert(
    credentials.every((credential) => credential.host && credential.port && credential.url),
    "found hdi container credential without connection details for tenant %s",
    filterTenantId
  );

  return await _hdiTunnelCredentials(cfSsh, credentials, filterTenantId);
};

const hdiList = async (context, [filterTenantId], [doTimestamps, doJsonOutput]) =>
  context.hasHdiTmsInfo
    ? await _hdiTmsList(context, { filterTenantId, doTimestamps, doJsonOutput })
    : await _hdiList(context, { filterTenantId, doTimestamps, doJsonOutput });

const _hdiLongList = async (context, { filterTenantId, doJsonOutput, doReveal } = {}) => {
  const [instances, allBindings] = await Promise.all([
    _hdiInstances(context, { filterTenantId, doEnsureTenantLabel: false }),
    _hdiBindings(context, { filterTenantId, doReveal, doEnsureTenantLabel: false }),
  ]);
  const bindings = _filterBindingsForInstances(allBindings, instances);

  if (doJsonOutput) {
    return { instances, bindings };
  }
  return `
=== container instance${instances.length === 1 ? "" : "s"} ===

${_formatOutput(instances)}

=== container binding${bindings.length === 1 ? "" : "s"} ===

${_formatOutput(bindings)}
`;
};

const hdiLongList = async (context, [filterTenantId], [doJsonOutput, doReveal]) =>
  context.hasHdiTmsInfo
    ? await _hdiTmsLongList(context, { filterTenantId, doJsonOutput, doReveal })
    : await _hdiLongList(context, { filterTenantId, doJsonOutput, doReveal });

const hdiTunnelTenant = async (context, [tenantId], [doReveal]) => {
  assert(isValidTenantId(tenantId), `argument "${tenantId}" is not a valid hdi tenant id`);
  return context.hasHdiTmsInfo
    ? await _hdiTmsTunnel(context, tenantId, doReveal)
    : await _hdiTunnel(context, tenantId, doReveal);
};

module.exports = {
  hdiList,
  hdiLongList,
  hdiTunnelTenant,

  _: {
    _getServiceManager,
    _getHdiSharedPlanId,
    _getTenantManagement,
  },
};

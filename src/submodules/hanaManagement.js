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

  const credentials = bindings.map(({ credentials }) => credentials);
  const { host, port } = credentials[0];
  assert(
    credentials.slice(1).every((binding) => binding.host === host && binding.port === port),
    "found more than one host and port combination in binding credentials for tenant %s",
    filterTenantId
  );

  const localPort = await _nextFreeSidPort();
  if (localPort !== TUNNEL_LOCAL_PORT) {
    logger.warning("warning: using local port %i, because %i was not free", localPort, TUNNEL_LOCAL_PORT);
  }
  assert(localPort !== null, "could not find free sid port 3xx15");

  for (let credentialIndex = 0; credentialIndex < credentials.length; credentialIndex++) {
    const {
      host,
      port,
      url,
      user,
      password,
      schema,
      hdi_user: hdiUser,
      hdi_password: hdiPassword,
    } = credentials[credentialIndex];
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

const hdiList = async (context, [filterTenantId], [doTimestamps, doJsonOutput]) =>
  await _hdiList(context, { filterTenantId, doTimestamps, doJsonOutput });

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
  await _hdiLongList(context, { filterTenantId, doJsonOutput, doReveal });

const hdiTunnelTenant = async (context, [tenantId], [doReveal]) => {
  assert(isValidTenantId(tenantId), `argument "${tenantId}" is not a valid hdi tenant id`);
  return await _hdiTunnel(context, tenantId, doReveal);
};

module.exports = {
  hdiList,
  hdiLongList,
  hdiTunnelTenant,

  _: {
    _getServiceManager,
    _getHdiSharedPlanId,
  },
};

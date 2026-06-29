"use strict";

const packageInfo = require("../../package.json");
const {
  tableList,
  isPortFree,
  formatTimestampsWithRelativeDays,
  compareFor,
  clusterByKey,
} = require("../shared/static");
const { makeOneTime } = require("../shared/execution-control");
const { assert } = require("../shared/error");
const { request } = require("../shared/request");
const { Logger } = require("../shared/logger");

const TUNNEL_LOCAL_PORT = 30015;
const SENSITIVE_FIELD_NAMES = ["password", "hdi_password"];
const SENSITIVE_FIELD_HIDDEN_TEXT = "*** show with --reveal ***";
const HDI_SHARED_SERVICE_OFFERING = "hana";
const HDI_SHARED_SERVICE_PLAN = "hdi-shared";

const QUERY_TYPE = {
  FIELD: "fieldQuery",
  LABEL: "labelQuery",
};

const logger = Logger.getInstance();

const isValidTenantId = (input) => input && /^[0-9a-z-_/]+$/i.test(input);

const compareForTenantId = compareFor((a) => a.labels.tenant_id[0].toUpperCase());

const _formatOutput = (output) =>
  JSON.stringify(Array.isArray(output) && output.length === 1 ? output[0] : output, null, 2);

const _hideSensitiveDataInBinding = (entry) => {
  const fields = entry?.credentials ? Object.keys(entry.credentials) : [];
  for (const field of fields) {
    if (SENSITIVE_FIELD_NAMES.includes(field)) {
      entry.credentials[field] = SENSITIVE_FIELD_HIDDEN_TEXT;
    }
  }
};

const _getQueryPart = (filters) =>
  Object.entries(filters)
    .reduce((acc, [key, value]) => {
      acc.push(`${key} eq '${value}'`);
      return acc;
    }, [])
    .join(" and ");

const _getQuery = (components) => {
  const partMap = components.reduce((acc, { predicate, type, key, value }) => {
    if (predicate) {
      if (!Object.prototype.hasOwnProperty.call(acc, type)) {
        acc[type] = { [key]: value };
      } else {
        acc[type][key] = value;
      }
    }
    return acc;
  }, {});
  const parts = Object.entries(partMap);
  return parts.length === 0
    ? undefined
    : parts.reduce(
        (acc, [type, filters]) => {
          acc["query"][type] = _getQueryPart(filters);
          return acc;
        },
        { query: {} }
      );
};

const _serviceManagerRequest = async (context, reqOptions = {}) => {
  const {
    cfBinding: { credentials },
  } = await context.getHdiInfo();
  const url = credentials.sm_url;
  const auth = { token: await context.getCachedUaaTokenFromCredentials(credentials) };
  const response = await request({
    url,
    auth,
    ...reqOptions,
    headers: {
      // NOTE: service-manager uses this client information for better consumption reporting and rate-limiting
      "Client-Name": packageInfo.name,
      "Client-Version": packageInfo.version,
      ...reqOptions?.headers,
    },
  });

  if (reqOptions.method) {
    return response;
  }
  // NOTE: no method here means GET and all service endpoints we use have this structure
  return (await response.json())?.items ?? [];
};

const _requestOfferings = makeOneTime(
  async (context, { filterServiceOfferingName } = {}) =>
    await _serviceManagerRequest(context, {
      pathname: "/v1/service_offerings",
      ..._getQuery([
        { predicate: filterServiceOfferingName, type: QUERY_TYPE.FIELD, key: "name", value: filterServiceOfferingName },
      ]),
    })
);

const _requestPlans = makeOneTime(
  async (context, { filterServiceOfferingId, filterServicePlanName } = {}) =>
    await _serviceManagerRequest(context, {
      pathname: "/v1/service_plans",
      ..._getQuery([
        {
          predicate: filterServiceOfferingId,
          type: QUERY_TYPE.FIELD,
          key: "service_offering_id",
          value: filterServiceOfferingId,
        },
        { predicate: filterServicePlanName, type: QUERY_TYPE.FIELD, key: "name", value: filterServicePlanName },
      ]),
    })
);

const _getHdiSharedPlanId = makeOneTime(async (context) => {
  const [offering] = await _requestOfferings(context, { filterServiceOfferingName: HDI_SHARED_SERVICE_OFFERING });
  assert(offering?.id, `could not find service offering with name ${HDI_SHARED_SERVICE_OFFERING}`);
  const [plan] = await _requestPlans(context, {
    filterServiceOfferingId: offering.id,
    filterServicePlanName: HDI_SHARED_SERVICE_PLAN,
  });
  assert(plan?.id, `could not find service plan with name ${HDI_SHARED_SERVICE_PLAN}`);
  return plan.id;
});

const _hdiInstances = async (context, { filterTenantId, doEnsureTenantLabel = true } = {}) => {
  const servicePlanId = await _getHdiSharedPlanId(context);
  let instances = await _serviceManagerRequest(context, {
    pathname: "/v1/service_instances",
    ..._getQuery([
      { predicate: true, type: QUERY_TYPE.FIELD, key: "service_plan_id", value: servicePlanId },
      { predicate: filterTenantId, type: QUERY_TYPE.LABEL, key: "tenant_id", value: filterTenantId },
    ]),
  });
  if (doEnsureTenantLabel) {
    instances = instances.filter((instance) => instance.labels.tenant_id !== undefined);
  }
  return instances;
};

// NOTE: service-manager has no way to filter bindings by the underlying instance's service_plan_id, so we fetch by
//   tenant and rely on callers to intersect against hdi instances
const _hdiBindings = async (context, { filterTenantId, doReveal = false, doEnsureTenantLabel = true } = {}) => {
  let bindings = await _serviceManagerRequest(context, {
    pathname: "/v1/service_bindings",
    ..._getQuery([{ predicate: filterTenantId, type: QUERY_TYPE.LABEL, key: "tenant_id", value: filterTenantId }]),
  });
  if (doEnsureTenantLabel) {
    bindings = bindings.filter((binding) => binding.labels.tenant_id !== undefined);
  }
  if (!doReveal) {
    bindings.forEach(_hideSensitiveDataInBinding);
  }
  return bindings;
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
  const headerRow = ["tenant_id", "host", "schema", "ready"];
  doShowDbTenantColumn && headerRow.splice(1, 0, "db_tenant_id");
  doTimestamps && headerRow.push("created_on", "updated_on");
  const nowDate = new Date();
  const instanceMap = (instance) => {
    const [binding] = bindingsByInstance[instance.id] || [];
    const row = [
      instance.labels.tenant_id[0],
      binding ? binding.credentials?.host + ":" + binding.credentials?.port : "missing binding",
      binding ? binding.credentials?.schema : "",
      binding ? instance.ready && binding.ready : "",
    ];
    doShowDbTenantColumn && row.splice(1, 0, instance.id);
    doTimestamps && row.push(...formatTimestampsWithRelativeDays([instance.created_at, instance.updated_at], nowDate));
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
    _requestOfferings,
    _requestPlans,
    _getHdiSharedPlanId,
  },
};

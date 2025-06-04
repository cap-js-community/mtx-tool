"use strict";

const {
  tableList,
  isPortFree,
  formatTimestampsWithRelativeDays,
  compareFor,
  makeOneTime,
  resetOneTime,
} = require("../shared/static");
const { assert } = require("../shared/error");
const { request } = require("../shared/request");
const { Logger } = require("../shared/logger");

const TUNNEL_LOCAL_PORT = 30015;
const HIDDEN_PASSWORD_TEXT = "*** show with --reveal ***";
const SENSITIVE_CREDENTIAL_FIELDS = ["password", "hdi_password"];
const HDI_SHARED_SERVICE_OFFERING = "hana";
const HDI_SHARED_SERVICE_PLAN = "hdi-shared";

const logger = Logger.getInstance();

const isValidTenantId = (input) => input && /^[0-9a-z-_/]+$/i.test(input);

const compareForServiceManagerTenantId = compareFor((a) => a.labels.tenant_id[0].toUpperCase());

const _formatOutput = (output) =>
  JSON.stringify(Array.isArray(output) && output.length === 1 ? output[0] : output, null, 2);

const _hidePasswordsInBindingOrInstance = (entry) => {
  for (let field of SENSITIVE_CREDENTIAL_FIELDS) {
    if (entry?.credentials?.[field]) {
      entry.credentials[field] = HIDDEN_PASSWORD_TEXT;
    }
  }
};

const _getQuery = (filters) =>
  Object.entries(filters)
    .reduce((acc, [key, value]) => {
      acc.push(`${key} eq '${value}'`);
      return acc;
    }, [])
    .join(" and ");

const _getServicePlanId = async (sm_url, token, serviceOfferingName, servicePlanName) => {
  const responseOfferings = await request({
    url: sm_url,
    pathname: "/v1/service_offerings",
    query: { fieldQuery: _getQuery({ name: serviceOfferingName }) },
    auth: { token },
  });
  const responseOfferingsData = (await responseOfferings.json()) || {};
  const serviceOfferingId = responseOfferingsData.items?.[0]?.id;
  assert(serviceOfferingId, `could not find service offering with name ${serviceOfferingName}`);
  const responsePlans = await request({
    url: sm_url,
    pathname: "/v1/service_plans",
    query: { fieldQuery: _getQuery({ service_offering_id: serviceOfferingId, name: servicePlanName }) },
    auth: { token },
  });
  const responsePlansData = (await responsePlans.json()) || {};
  const servicePlanId = responsePlansData.items?.[0]?.id;
  assert(servicePlanId, `could not find service plan with name ${servicePlanName}`);
  return servicePlanId;
};

const _getHdiSharedPlanId = makeOneTime(
  async (sm_url, token) => await _getServicePlanId(sm_url, token, HDI_SHARED_SERVICE_OFFERING, HDI_SHARED_SERVICE_PLAN)
);

const _hdiInstancesServiceManager = async (context, { filterTenantId, doEnsureTenantLabel = true } = {}) => {
  const {
    cfService: { credentials },
  } = await context.getHdiInfo();
  const { sm_url } = credentials;
  const token = await context.getCachedUaaTokenFromCredentials(credentials);
  const servicePlanId = await _getHdiSharedPlanId(sm_url, token);

  const response = await request({
    url: sm_url,
    pathname: "/v1/service_instances",
    query: {
      fieldQuery: _getQuery({ service_plan_id: servicePlanId }),
      ...(filterTenantId && { labelQuery: _getQuery({ tenant_id: filterTenantId }) }),
    },
    auth: { token },
  });
  const responseData = (await response.json()) || {};
  let instances = responseData.items || [];
  if (doEnsureTenantLabel) {
    instances = instances.filter((instance) => instance.labels.tenant_id !== undefined);
  }
  return instances;
};

const _hdiBindingsServiceManager = async (
  context,
  { filterTenantId, doReveal = false, doAssertFoundSome = false, doEnsureTenantLabel = true } = {}
) => {
  const {
    cfService: { credentials },
  } = await context.getHdiInfo();
  const { sm_url } = credentials;
  const token = await context.getCachedUaaTokenFromCredentials(credentials);
  const servicePlanId = await _getHdiSharedPlanId(sm_url, token);

  const getBindingsResponse = await request({
    url: sm_url,
    pathname: "/v1/service_bindings",
    query: {
      labelQuery: _getQuery({
        service_plan_id: servicePlanId,
        ...(filterTenantId && { tenant_id: filterTenantId }),
      }),
    },
    auth: { token },
  });
  const responseData = (await getBindingsResponse.json()) || {};
  let bindings = responseData.items || [];
  if (doEnsureTenantLabel) {
    bindings = bindings.filter((instance) => instance.labels.tenant_id !== undefined);
  }
  if (doAssertFoundSome) {
    if (filterTenantId) {
      assert(
        Array.isArray(bindings) && bindings.length >= 1,
        "could not find hdi service binding for tenant %s",
        filterTenantId
      );
    } else {
      assert(Array.isArray(bindings) && bindings.length >= 1, "could not find any hdi service bindings");
    }
  }
  if (!doReveal) {
    bindings.forEach(_hidePasswordsInBindingOrInstance);
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

const _hdiTunnel = async (context, filterTenantId, doReveal = false) => {
  const { cfSsh } = await context.getHdiInfo();
  const bindings = await _hdiBindingsServiceManager(context, { filterTenantId, doReveal, doAssertFoundSome: true });
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

const _getBindingsByInstance = (bindings) => {
  return bindings.reduce((result, binding) => {
    const instance_id = binding.service_instance_id;
    if (result[instance_id]) {
      result[instance_id].push(binding);
    } else {
      result[instance_id] = [binding];
    }
    return result;
  }, {});
};

const _hdiListServiceManager = async (context, { filterTenantId, doTimestamps, doJsonOutput } = {}) => {
  const [instances, bindings] = await Promise.all([
    _hdiInstancesServiceManager(context, { filterTenantId }),
    _hdiBindingsServiceManager(context, { filterTenantId }),
  ]);

  if (doJsonOutput) {
    return { instances, bindings };
  }

  const bindingsByInstance = _getBindingsByInstance(bindings);
  instances.sort(compareForServiceManagerTenantId);

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
    doShowDbTenantColumn && row.splice(1, 0, binding ? (binding.credentials?.tenantId ?? "") : "missing binding");
    doTimestamps && row.push(...formatTimestampsWithRelativeDays([instance.created_at, instance.updated_at], nowDate));
    return row;
  };
  const table = instances && instances.length ? [headerRow].concat(instances.map(instanceMap)) : null;
  return tableList(table, { withRowNumber: !filterTenantId });
};

const hdiList = async (context, [filterTenantId], [doTimestamps, doJsonOutput]) =>
  await _hdiListServiceManager(context, { filterTenantId, doTimestamps, doJsonOutput });

const _hdiLongListServiceManager = async (context, { filterTenantId, doJsonOutput, doReveal } = {}) => {
  const [instances, bindings] = await Promise.all([
    _hdiInstancesServiceManager(context, { filterTenantId, doEnsureTenantLabel: false }),
    _hdiBindingsServiceManager(context, { filterTenantId, doReveal, doEnsureTenantLabel: false }),
  ]);

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
  await _hdiLongListServiceManager(context, { filterTenantId, doJsonOutput, doReveal });

const hdiTunnelTenant = async (context, [tenantId], [doReveal]) => {
  assert(isValidTenantId(tenantId), `argument "${tenantId}" is not a valid hdi tenant id`);
  return await _hdiTunnel(context, tenantId, doReveal);
};

module.exports = {
  hdiList,
  hdiLongList,
  hdiTunnelTenant,

  _: {
    _reset() {
      resetOneTime(_getHdiSharedPlanId);
    },
  },
};

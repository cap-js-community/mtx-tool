"use strict";

const {
  tableList,
  isPortFree,
  formatTimestampsWithRelativeDays,
  compareFor,
  limiter,
  randomString,
  tryJsonParse,
  isObject,
  makeOneTime,
  parseIntWithFallback,
  resetOneTime,
} = require("../shared/static");
const { assert } = require("../shared/error");
const { request } = require("../shared/request");
const { Logger } = require("../shared/logger");

const ENV = Object.freeze({
  HDI_CONCURRENCY: "MTX_HDI_CONCURRENCY",
});

const TUNNEL_LOCAL_PORT = 30015;
const HIDDEN_PASSWORD_TEXT = "*** show with --reveal ***";
const SERVICE_MANAGER_REQUEST_CONCURRENCY_FALLBACK = 10;
const SERVICE_MANAGER_IDEAL_BINDING_COUNT = 1;
const SENSITIVE_CREDENTIAL_FIELDS = ["password", "hdi_password"];
const HDI_SHARED_SERVICE_OFFERING = "hana";
const HDI_SHARED_SERVICE_PLAN = "hdi-shared";

const logger = Logger.getInstance();

const hdiRequestConcurrency = parseIntWithFallback(
  process.env[ENV.HDI_CONCURRENCY],
  SERVICE_MANAGER_REQUEST_CONCURRENCY_FALLBACK
);

const isValidTenantId = (input) => input && /^[0-9a-z-_/]+$/i.test(input);

const compareForServiceManagerTenantId = compareFor((a) => a.labels.tenant_id[0].toUpperCase());
const compareForServiceManagerBindingUpdatedAtDesc = compareFor((a) => a.updated_at, true);

const _formatOutput = (output) =>
  JSON.stringify(Array.isArray(output) && output.length === 1 ? output[0] : output, null, 2);

const _hidePasswordsInBindingOrInstance = (entry) => {
  for (let field of SENSITIVE_CREDENTIAL_FIELDS) {
    if (entry?.credentials?.[field]) {
      entry.credentials[field] = HIDDEN_PASSWORD_TEXT;
    }
  }
};

const _createBindingServiceManager = async (
  sm_url,
  token,
  service_instance_id,
  tenant_id,
  service_plan_id,
  { name = randomString(32), parameters } = {}
) => {
  await request({
    method: "POST",
    url: sm_url,
    pathname: `/v1/service_bindings`,
    query: { async: false },
    auth: { token },
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      service_instance_id,
      labels: {
        managing_client_lib: ["instance-manager-client-lib"],
        tenant_id: [tenant_id],
        service_plan_id: [service_plan_id],
      },
      ...(parameters && { parameters }),
    }),
  });
};

const _createBindingServiceManagerFromBinding = async (sm_url, token, binding, options) =>
  await _createBindingServiceManager(
    sm_url,
    token,
    binding.service_instance_id,
    binding.labels.tenant_id[0],
    binding.labels.service_plan_id[0],
    options
  );
const _createBindingServiceManagerFromInstance = async (sm_url, token, instance, options) =>
  await _createBindingServiceManager(
    sm_url,
    token,
    instance.id,
    instance.labels.tenant_id[0],
    instance.service_plan_id,
    options
  );

const _deleteBindingServiceManager = async (sm_url, token, id) => {
  await request({
    method: "DELETE",
    url: sm_url,
    pathname: `/v1/service_bindings/${id}`,
    query: { async: false },
    auth: { token },
  });
};

const _deleteInstanceServiceManager = async (sm_url, token, id) => {
  await request({
    method: "DELETE",
    url: sm_url,
    pathname: `/v1/service_instances/${id}`,
    query: { async: false },
    auth: { token },
  });
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

const _hdiRebindBindingServiceManager = async (sm_url, token, binding, options) => {
  await _createBindingServiceManagerFromBinding(sm_url, token, binding, options);
  await _deleteBindingServiceManager(sm_url, token, binding.id);
};

const _hdiRebindTenantServiceManager = async (context, filterTenantId, parameters) => {
  const {
    cfService: { credentials },
  } = await context.getHdiInfo();
  const { sm_url } = credentials;
  const token = await context.getCachedUaaTokenFromCredentials(credentials);
  const bindings = await _hdiBindingsServiceManager(context, { filterTenantId, doAssertFoundSome: true });

  for (const binding of bindings) {
    await _hdiRebindBindingServiceManager(sm_url, token, binding, { parameters });
  }
};

const _hdiRebindAllServiceManager = async (context, parameters) => {
  const {
    cfService: { credentials },
  } = await context.getHdiInfo();
  const { sm_url } = credentials;
  const token = await context.getCachedUaaTokenFromCredentials(credentials);
  const bindings = await _hdiBindingsServiceManager(context);

  bindings.sort(compareForServiceManagerTenantId);

  const tenantIds = bindings.map(
    ({
      labels: {
        tenant_id: [tenant_id],
      },
    }) => tenant_id
  );
  logger.info("rebinding tenants %s", tenantIds.join(", "));

  await limiter(
    hdiRequestConcurrency,
    bindings,
    async (binding) => await _hdiRebindBindingServiceManager(sm_url, token, binding, { parameters })
  );
};

const _hdiRepairBindingsServiceManager = async (context, { instances, bindings, parameters } = {}) => {
  const {
    cfService: { credentials },
  } = await context.getHdiInfo();
  const { sm_url } = credentials;
  const token = await context.getCachedUaaTokenFromCredentials(credentials);

  instances = instances ?? (await _hdiInstancesServiceManager(context));
  bindings = bindings ?? (await _hdiBindingsServiceManager(context));
  const bindingsByInstance = _getBindingsByInstance(bindings);
  instances.sort(compareForServiceManagerTenantId);

  const changes = [];
  for (const instance of instances) {
    const tenantId = instance.labels.tenant_id[0];
    const instanceBindings = (bindingsByInstance[instance.id] || []).filter((binding) => binding.ready);
    instanceBindings.sort(compareForServiceManagerBindingUpdatedAtDesc);
    if (instanceBindings.length < SERVICE_MANAGER_IDEAL_BINDING_COUNT) {
      const missingBindingCount = SERVICE_MANAGER_IDEAL_BINDING_COUNT - instanceBindings.length;
      for (let i = 0; i < missingBindingCount; i++) {
        changes.push(async () => {
          await _createBindingServiceManagerFromInstance(sm_url, token, instance, { parameters });
          logger.info(
            "created %i missing binding%s for tenant %s",
            missingBindingCount,
            missingBindingCount === 1 ? "" : "s",
            tenantId
          );
        });
      }
    } else if (instanceBindings.length > SERVICE_MANAGER_IDEAL_BINDING_COUNT) {
      const ambivalentBindings = instanceBindings.slice(1);
      for (const { id } of ambivalentBindings) {
        changes.push(async () => {
          await _deleteBindingServiceManager(sm_url, token, id);
          logger.info(
            "deleted %i ambivalent binding%s for tenant %s",
            ambivalentBindings.length,
            ambivalentBindings.length === 1 ? "" : "s",
            tenantId
          );
        });
      }
    }
  }

  await limiter(hdiRequestConcurrency, changes, async (fn) => await fn());
  changes.length === 0 && logger.info("found exactly one binding for %i instances, all is well", instances.length);
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

const _hdiDeleteServiceManager = async (context, { filterTenantId } = {}) => {
  const {
    cfService: { credentials },
  } = await context.getHdiInfo();
  const { sm_url } = credentials;
  const token = await context.getCachedUaaTokenFromCredentials(credentials);
  // NOTE: deleting both the bindings and service instance best mimics the behavior of instance manager

  const bindings = await _hdiBindingsServiceManager(context, { filterTenantId });
  for (const { id } of bindings) {
    await _deleteBindingServiceManager(sm_url, token, id);
  }

  const instances = await _hdiInstancesServiceManager(context, { filterTenantId });
  for (const { id } of instances) {
    await _deleteInstanceServiceManager(sm_url, token, id);
  }
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

const _hdiListServiceManager = async (context, { filterTenantId, doJsonOutput, doTimestamps } = {}) => {
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
  await _hdiListServiceManager(context, { filterTenantId, doJsonOutput, doTimestamps });

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

const _hdiListRelationsServiceManager = async (context, { filterTenantId, doTimestamps, doJsonOutput }) => {
  const [instances, bindings] = await Promise.all([
    _hdiInstancesServiceManager(context, { filterTenantId }),
    _hdiBindingsServiceManager(context, { filterTenantId }),
  ]);
  const bindingsByInstance = _getBindingsByInstance(bindings);
  instances.sort(compareForServiceManagerTenantId);

  const nowDate = new Date();
  const headerRow = ["tenant_id", "instance_id", "", "binding_id", "ready"];
  doTimestamps && headerRow.push("created_on", "updated_on");
  const table = [headerRow];

  if (doJsonOutput) {
    return {
      instances: instances.map((instance) => {
        return { ...instance, bindings: bindingsByInstance[instance.id] };
      }),
    };
  }

  for (const instance of instances) {
    const instanceBindings = bindingsByInstance[instance.id];
    if (instanceBindings) {
      for (const [index, binding] of instanceBindings.entries()) {
        const row = [];
        if (index === 0) {
          row.push(
            instance.labels.tenant_id[0],
            instance.id,
            instanceBindings.length === 1 ? "---" : "-+-",
            binding.id,
            binding.ready
          );
        } else {
          row.push("", "", index === instanceBindings.length - 1 ? " \\-" : " |-", binding.id, binding.ready);
        }
        doTimestamps &&
          row.push(...formatTimestampsWithRelativeDays([binding.created_at, binding.updated_at], nowDate));
        table.push(row);
      }
    } else {
      table.push([instance.labels.tenant_id[0], instance.id, "-x"]);
    }
  }

  return tableList(table, { sortCol: null, withRowNumber: !filterTenantId });
};

const hdiListRelations = async (context, [tenantId], [doTimestamps, doJsonOutput]) =>
  await _hdiListRelationsServiceManager(context, { filterTenantId: tenantId, doTimestamps, doJsonOutput });

const hdiRebindTenant = async (context, [tenantId, rawParameters]) => {
  assert(isValidTenantId(tenantId), `argument "${tenantId}" is not a valid hdi tenant id`);
  const parameters = tryJsonParse(rawParameters);
  assert(!rawParameters || isObject(parameters), `argument "${rawParameters}" needs to be a valid JSON object`);
  return await _hdiRebindTenantServiceManager(context, tenantId, parameters);
};

const hdiRebindAll = async (context, [rawParameters]) => {
  const parameters = tryJsonParse(rawParameters);
  assert(!rawParameters || isObject(parameters), `argument "${rawParameters}" needs to be a valid JSON object`);
  return await _hdiRebindAllServiceManager(context, parameters);
};

const hdiRepairBindings = async (context, [rawParameters]) => {
  const parameters = tryJsonParse(rawParameters);
  assert(!rawParameters || isObject(parameters), `argument "${rawParameters}" needs to be a valid JSON object`);
  return await _hdiRepairBindingsServiceManager(context, { parameters });
};

const hdiTunnelTenant = async (context, [tenantId], [doReveal]) => {
  assert(isValidTenantId(tenantId), `argument "${tenantId}" is not a valid hdi tenant id`);
  return await _hdiTunnel(context, tenantId, doReveal);
};

const hdiDeleteTenant = async (context, [tenantId]) => {
  assert(isValidTenantId(tenantId), `argument "${tenantId}" is not a valid hdi tenant id`);
  return await _hdiDeleteServiceManager(context, { filterTenantId: tenantId });
};

const hdiDeleteAll = async (context) => await _hdiDeleteServiceManager(context);

const hdiEnableNative = async (context, [tenantId]) => {
  assert(!tenantId || isValidTenantId(tenantId), `argument "${tenantId}" is not a valid hdi tenant id`);

  const {
    cfService: { credentials },
  } = await context.getHdiInfo();
  const { sm_url } = credentials;
  const token = await context.getCachedUaaTokenFromCredentials(credentials);

  // get all instances and bindings
  const [instances, bindings] = await Promise.all([
    _hdiInstancesServiceManager(context, { filterTenantId: tenantId }),
    _hdiBindingsServiceManager(context, { filterTenantId: tenantId }),
  ]);

  // filter instances and bindings
  const migrationInstances = [];
  const alreadyMigratedTenants = [];
  await limiter(hdiRequestConcurrency, instances, async (instance) => {
    const parametersResponse = await request({
      url: sm_url,
      pathname: `/v1/service_instances/${instance.id}/parameters`,
      auth: { token },
      logged: false,
    });
    const parameters = await parametersResponse.json();
    if (parameters.enableTenant) {
      alreadyMigratedTenants.push(instance.labels.tenant_id[0]);
    } else {
      migrationInstances.push(instance);
    }
  });
  const migrationTenants = migrationInstances.map((instance) => instance.labels.tenant_id[0]);
  const migrationBindings = bindings.filter((binding) =>
    migrationInstances.some((instance) => instance.id === binding.service_instance_id)
  );

  if (alreadyMigratedTenants.length) {
    logger.info("skipping %i already enabled tenants", alreadyMigratedTenants.length);
  }
  if (migrationInstances.length && migrationTenants.length) {
    logger.info("enabling %i tenants %s", migrationTenants.length, migrationTenants.join(", "));
  } else {
    return;
  }

  // delete all bindings related to migration instances
  logger.info("deleting %i bindings to protect enablement", migrationBindings.length);
  await limiter(
    hdiRequestConcurrency,
    migrationBindings,
    async (binding) => await _deleteBindingServiceManager(sm_url, token, binding.id)
  );

  // send enable tenant patch request and poll until succeeded
  try {
    await limiter(hdiRequestConcurrency, migrationInstances, async (instance) => {
      const enableResponse = await request({
        method: "PATCH",
        url: sm_url,
        pathname: `/v1/service_instances/${instance.id}`,
        query: { async: false },
        auth: { token },
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parameters: {
            enableTenant: true,
          },
        }),
      });
      const checkData = await enableResponse.json();
      assert(
        checkData.last_operation?.state === "succeeded",
        "enable tenant operation was not marked succeeded\n%j",
        checkData
      );
    });
  } finally {
    // repair bindings for migrated tenants
    if (migrationInstances.length) {
      await _hdiRepairBindingsServiceManager(context, { instances: migrationInstances, bindings: [] });
    }
  }
};

module.exports = {
  hdiList,
  hdiLongList,
  hdiListRelations,
  hdiRebindTenant,
  hdiRebindAll,
  hdiRepairBindings,
  hdiTunnelTenant,
  hdiDeleteTenant,
  hdiDeleteAll,
  hdiEnableNative,

  _: {
    _reset() {
      resetOneTime(_getHdiSharedPlanId);
    },
  },
};

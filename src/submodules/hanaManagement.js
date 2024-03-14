"use strict";

const {
  ENV,
  tableList,
  isPortFree,
  formatTimestampsWithRelativeDays,
  compareFor,
  limiter,
  randomString,
  tryJsonParse,
  isObject,
} = require("../shared/static");
const { assert } = require("../shared/error");
const { request } = require("../shared/request");

const TUNNEL_LOCAL_PORT = 30015;
const HIDDEN_PASSWORD_TEXT = "*** show with --reveal ***";
const SERVICE_MANAGER_REQUEST_CONCURRENCY_FALLBACK = 10;
const SERVICE_MANAGER_IDEAL_BINDING_COUNT = 1;
const SENSITIVE_CREDENTIAL_FIELDS = ["password", "hdi_password"];
const HDI_SHARED = "hdi-shared";

const hdiRequestConcurrency = process.env[ENV.HDI_CONCURRENCY]
  ? parseInt(process.env[ENV.HDI_CONCURRENCY])
  : SERVICE_MANAGER_REQUEST_CONCURRENCY_FALLBACK;

const isValidTenantId = (input) => input && /^[0-9a-z-_/]+$/i.test(input);

const compareForInstanceManagerTenantId = compareFor((a) => a.tenant_id.toUpperCase());
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

const _isServiceManager = async (context) => {
  const {
    cfService: { plan, label },
  } = await context.getHdiInfo();
  return label === "service-manager" && plan === "container";
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

async function _deleteInstanceServiceManager(sm_url, token, id) {
  await request({
    method: "DELETE",
    url: sm_url,
    pathname: `/v1/service_instances/${id}`,
    query: { async: false },
    auth: { token },
  });
}

const _hdiInstancesServiceManager = async (context, { filterTenantId, doEnsureTenantLabel = true } = {}) => {
  const {
    cfService: { credentials },
  } = await context.getHdiInfo();
  const { sm_url } = credentials;
  const token = await context.getCachedUaaTokenFromCredentials(credentials);
  const servicePlanId = await _smGetServicePlanId(context, {filterName: HDI_SHARED});
  let query = {};
  if (filterTenantId) {
    query.labelQuery = `tenant_id eq '${filterTenantId}'`;
  }
  query.fieldQuery = `service_plan_id eq '${servicePlanId}'`;
  const response = await request({
    url: sm_url,
    pathname: "/v1/service_instances",
    query: query,
    auth: { token },
  });
  const responseData = (await response.json()) || {};
  let instances = responseData.items || [];
  if (doEnsureTenantLabel) {
    instances = instances.filter((instance) => instance.labels.tenant_id !== undefined);
  }
  return instances;
};

const _smGetServicePlanId = async (context, {filterName}) => {
  const {
    cfService: { credentials },
  } = await context.getHdiInfo();
  const { sm_url } = credentials;
  const token = await context.getCachedUaaTokenFromCredentials(credentials);
  const servicePlanResponse = await request({
    url: sm_url,
    pathname: "/v1/service_plans",
    ...(filterName && { query: { fieldQuery: `name eq '${filterName}'` } }),
    auth: { token },
  });

  const responseData = (await servicePlanResponse.json()) || {};
  let plans = responseData.items || [];
  assert(Array.isArray(plans) && plans.length == 1, `could not find service plan for ${filterName}`);
  assert(plans[0].id, `could not find id for service plan for ${filterName}`);
  return plans[0].id;
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
  const servicePlanId = await _smGetServicePlanId(context, {filterName: HDI_SHARED});
  let query = {};
  if (filterTenantId) {
    query.labelQuery = `tenant_id eq '${filterTenantId}'`;
  }
  query.labelQuery = (query.labelQuery ? query.labelQuery + " and " : "") + `service_plan_id eq '${servicePlanId}'`;
  const getBindingsResponse = await request({
    url: sm_url,
    pathname: "/v1/service_bindings",
    query: query,
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

const _hdiContainersInstanceManager = async (
  context,
  { filterTenantId, doReveal = false, doAssertFoundSome = false }
) => {
  const {
    cfService: {
      credentials: { get_managed_instance_url, get_all_managed_instances_url, user: username, password },
    },
  } = await context.getHdiInfo();
  const response = await request({
    url: filterTenantId
      ? get_managed_instance_url.replace("{tenant_id}", filterTenantId)
      : get_all_managed_instances_url,
    auth: { username, password },
  });
  let instances = (await response.json()) || [];
  if (doAssertFoundSome) {
    if (filterTenantId) {
      assert(
        Array.isArray(instances) && instances.length >= 1,
        "could not find managed instances for tenant %s",
        filterTenantId
      );
    } else {
      assert(Array.isArray(instances) && instances.length >= 1, "could not find any managed instances");
    }
  }
  if (!doReveal) {
    instances.forEach(_hidePasswordsInBindingOrInstance);
  }
  return instances;
};

async function _hdiRebindBindingServiceManager(sm_url, token, binding, options) {
  await _createBindingServiceManagerFromBinding(sm_url, token, binding, options);
  await _deleteBindingServiceManager(sm_url, token, binding.id);
}

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
  console.log("rebinding tenants %s", tenantIds.join(", "));

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
          console.log(
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
          console.log(
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
  changes.length === 0 && console.log("found exactly one binding for %i instances, all is well", instances.length);
};

const _hdiRebindTenantInstanceManager = async (context, tenantId) => {
  const {
    cfService: {
      credentials: { post_managed_instance_url, user: username, password },
    },
  } = await context.getHdiInfo();
  const response = await request({
    method: "PATCH",
    url: `${post_managed_instance_url.replace("{tenant_id}", tenantId)}/binding`,
    auth: { username, password },
  });
  return response.text();
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
  console.warn(
    "warning: detected port 443, which is used by HANA Cloud. SSH port forwarding, which is required for tunneling, will not work with HANA Cloud."
  );
};

const _hdiTunnel = async (context, filterTenantId, doReveal = false) => {
  const { cfSsh } = await context.getHdiInfo();
  const bindings = (await _isServiceManager(context))
    ? await _hdiBindingsServiceManager(context, { filterTenantId, doReveal, doAssertFoundSome: true })
    : await _hdiContainersInstanceManager(context, { filterTenantId, doReveal, doAssertFoundSome: true });
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
    console.warn("warning: using local port %i, because %i was not free", localPort, TUNNEL_LOCAL_PORT);
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
      console.log();
      console.log("binding #%i", credentialIndex + 1);
    }
    console.log();
    console.log("runtime");
    console.log(tableList(runtimeTable, { sortCol: null, noHeader: true, withRowNumber: false }));
    console.log();
    console.log("designtime");
    console.log(tableList(designtimeTable, { sortCol: null, noHeader: true, withRowNumber: false }));
    console.log();
  }

  if (port === "443") {
    _hdiTunnelHanaCloudWarning();
  }
  return cfSsh({ localPort, remotePort: port, remoteHostname: host });
};

const _hdiDeleteServiceManager = async (context, filterTenantId) => {
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

const _hdiDeleteInstanceManager = async (context, tenantId) => {
  const {
    cfService: {
      credentials: { delete_managed_instance_url, user: username, password },
    },
  } = await context.getHdiInfo();
  await request({
    method: "DELETE",
    url: delete_managed_instance_url.replace("{tenant_id}", tenantId),
    auth: { username, password },
  });
};

const _hdiDelete = async (context, ...args) =>
  (await _isServiceManager(context))
    ? _hdiDeleteServiceManager(context, ...args)
    : _hdiDeleteInstanceManager(context, ...args);

function _getBindingsByInstance(bindings) {
  return bindings.reduce((result, binding) => {
    const instance_id = binding.service_instance_id;
    if (result[instance_id]) {
      result[instance_id].push(binding);
    } else {
      result[instance_id] = [binding];
    }
    return result;
  }, {});
}

const hdiListServiceManager = async (context, filterTenantId, doTimestamps) => {
  const [instances, bindings] = await Promise.all([
    _hdiInstancesServiceManager(context, { filterTenantId }),
    _hdiBindingsServiceManager(context, { filterTenantId }),
  ]);

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
      instance.ready,
    ];
    doShowDbTenantColumn && row.splice(1, 0, binding ? binding.credentials?.tenantId ?? "" : "missing binding");
    doTimestamps && row.push(...formatTimestampsWithRelativeDays([instance.created_at, instance.updated_at], nowDate));
    return row;
  };
  const table = instances && instances.length ? [headerRow].concat(instances.map(instanceMap)) : null;
  return tableList(table, { withRowNumber: !filterTenantId });
};

const hdiListInstanceManager = async (context, filterTenantId, doTimestamps) => {
  const instances = await _hdiContainersInstanceManager(context, { filterTenantId });
  const headerRow = ["tenant_id", "host", "schema", "status"];
  doTimestamps && headerRow.push("created_on", "updated_on");
  const nowDate = new Date();
  const instanceMap = ({ tenant_id, credentials: { host, port, schema }, status, binding_created_on, updated_on }) => {
    const row = [tenant_id, host + ":" + port, schema, status];
    doTimestamps && row.push(...formatTimestampsWithRelativeDays([binding_created_on, updated_on], nowDate));
    return row;
  };
  const table = instances && instances.length ? [headerRow].concat(instances.map(instanceMap)) : null;
  return tableList(table, { withRowNumber: !filterTenantId });
};

const hdiList = async (context, [tenantId], [doTimestamps]) =>
  (await _isServiceManager(context))
    ? hdiListServiceManager(context, tenantId, doTimestamps)
    : hdiListInstanceManager(context, tenantId, doTimestamps);

const _hdiLongListServiceManager = async (context, filterTenantId, doReveal) => {
  const [instances, bindings] = await Promise.all([
    _hdiInstancesServiceManager(context, { filterTenantId, doEnsureTenantLabel: false }),
    _hdiBindingsServiceManager(context, { filterTenantId, doReveal, doEnsureTenantLabel: false }),
  ]);
  return `
=== container instance${instances.length === 1 ? "" : "s"} ===

${_formatOutput(instances)}

=== container binding${bindings.length === 1 ? "" : "s"} ===

${_formatOutput(bindings)}
`;
};

const hdiLongList = async (context, [filterTenantId], [doReveal]) =>
  (await _isServiceManager(context))
    ? await _hdiLongListServiceManager(context, filterTenantId, doReveal)
    : _formatOutput(await _hdiContainersInstanceManager(context, { filterTenantId, doReveal }));

const _hdiListRelationsServiceManager = async (context, filterTenantId, doTimestamps) => {
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

const hdiListRelations = async (context, [tenantId], [doTimestamps]) => {
  assert(await _isServiceManager(context), "list relations is only supported for service-manager");
  return _hdiListRelationsServiceManager(context, tenantId, doTimestamps);
};

const hdiRebindTenant = async (context, [tenantId, rawParameters]) => {
  assert(isValidTenantId(tenantId), `argument "${tenantId}" is not a valid hdi tenant id`);
  const parameters = tryJsonParse(rawParameters);
  assert(!rawParameters || isObject(parameters), `argument "${rawParameters}" needs to be a valid JSON object`);
  return (await _isServiceManager(context))
    ? await _hdiRebindTenantServiceManager(context, tenantId, parameters)
    : await _hdiRebindTenantInstanceManager(context, tenantId);
};

const hdiRebindAll = async (context, [rawParameters]) => {
  assert(await _isServiceManager(context), "rebind all is only supported for service-manager");
  const parameters = tryJsonParse(rawParameters);
  assert(!rawParameters || isObject(parameters), `argument "${rawParameters}" needs to be a valid JSON object`);
  return await _hdiRebindAllServiceManager(context, parameters);
};

const hdiRepairBindings = async (context, [rawParameters]) => {
  assert(await _isServiceManager(context), "repair bindings is only supported for service-manager");
  const parameters = tryJsonParse(rawParameters);
  assert(!rawParameters || isObject(parameters), `argument "${rawParameters}" needs to be a valid JSON object`);
  return await _hdiRepairBindingsServiceManager(context, { parameters });
};

const hdiTunnelTenant = async (context, [tenantId], [doReveal]) => {
  assert(isValidTenantId(tenantId), `argument "${tenantId}" is not a valid hdi tenant id`);
  return _hdiTunnel(context, tenantId, doReveal);
};

const hdiDeleteTenant = async (context, [tenantId]) => {
  assert(isValidTenantId(tenantId), `argument "${tenantId}" is not a valid hdi tenant id`);
  return await _hdiDelete(context, tenantId);
};

const hdiDeleteAllServiceManager = async (context) => {
  const {
    cfService: { credentials },
  } = await context.getHdiInfo();
  const { sm_url } = credentials;
  const token = await context.getCachedUaaTokenFromCredentials(credentials);
  const getBindingsResponse = await request({
    url: sm_url,
    pathname: "/v1/service_bindings",
    auth: { token },
  });
  const { items: bindings } = (await getBindingsResponse.json()) || {};
  assert(Array.isArray(bindings), "could not retrieve hdi service bindings");

  bindings.sort(compareForServiceManagerTenantId);

  // NOTE: we want to do this serially
  for (const binding of bindings) {
    const tenantId = binding.labels?.tenant_id?.[0];
    tenantId && (await _hdiDelete(context, tenantId));
  }
};

const hdiDeleteAllInstanceManager = async (context) => {
  const {
    cfService: {
      credentials: { get_all_managed_instances_url, user: username, password },
    },
  } = await context.getHdiInfo();
  const response = await request({
    url: get_all_managed_instances_url,
    auth: { username, password },
  });
  const containers = await response.json();

  containers.sort(compareForInstanceManagerTenantId);

  // NOTE: we want to do this serially
  for (const container of containers) {
    await _hdiDelete(context, container.tenant_id);
  }
};

const hdiDeleteAll = async (context) =>
  (await _isServiceManager(context)) ? hdiDeleteAllServiceManager(context) : hdiDeleteAllInstanceManager(context);

const hdiEnableNative = async (context, [tenantId]) => {
  assert(await _isServiceManager(context), "enable tenant is only supported for service-manager");
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
    console.log("skipping %i already enabled tenants", alreadyMigratedTenants.length);
  }
  if (migrationInstances.length && migrationTenants.length) {
    console.log("enabling %i tenants %s", migrationTenants.length, migrationTenants.join(", "));
  } else {
    return;
  }

  // delete all bindings related to migration instances
  console.log("deleting %i bindings to protect enablement", migrationBindings.length);
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
};

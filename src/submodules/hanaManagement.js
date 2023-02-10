"use strict";

const {
  isDashedWord,
  tableList,
  isPortFree,
  guardedAccess,
  formatTimestampsWithRelativeDays,
  compareFor,
  limiter,
  randomString,
  tryJsonParse,
  isObject,
} = require("../shared/static");
const { assert } = require("../shared/error");
const { request } = require("../shared/request");
const { getUaaTokenFromCredentials } = require("../shared/oauth");

const TUNNEL_LOCAL_PORT = 30015;
const HIDDEN_PASSWORD_TEXT = "*** show with --reveal ***";
const SERVICE_MANAGER_CONCURRENCY = 5;
const SERVICE_MANAGER_IDEAL_BINDING_COUNT = 1;
const SENSITIVE_CREDENTIAL_FIELDS = ["password", "hdi_password"];

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
    query: {
      async: false,
    },
    auth: { token },
    headers: {
      "Content-Type": "application/json",
    },
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
    query: {
      async: false,
    },
    auth: { token },
  });
};

async function _deleteInstanceServiceManager(sm_url, token, id) {
  await request({
    method: "DELETE",
    url: sm_url,
    pathname: `/v1/service_instances/${id}`,
    query: {
      async: false,
    },
    auth: { token },
  });
}

const _hdiInstancesServiceManager = async (context, { filterTenantId, doEnsureTenantLabel = true } = {}) => {
  const {
    cfService: { credentials },
  } = await context.getHdiInfo();
  const { sm_url } = credentials;
  const token = await getUaaTokenFromCredentials(credentials);
  const response = await request({
    url: sm_url,
    pathname: "/v1/service_instances",
    ...(filterTenantId && { query: { labelQuery: `tenant_id eq '${filterTenantId}'` } }),
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
  const token = await getUaaTokenFromCredentials(credentials);
  const getBindingsResponse = await request({
    url: sm_url,
    pathname: "/v1/service_bindings",
    ...(filterTenantId && { query: { labelQuery: `tenant_id eq '${filterTenantId}'` } }),
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
  const token = await getUaaTokenFromCredentials(credentials);
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
  const token = await getUaaTokenFromCredentials(credentials);
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
    SERVICE_MANAGER_CONCURRENCY,
    bindings.map((binding) => [sm_url, token, binding, { parameters }]),
    _hdiRebindBindingServiceManager
  );
};

const _hdiRepairBindingsServiceManager = async (context, parameters) => {
  const {
    cfService: { credentials },
  } = await context.getHdiInfo();
  const { sm_url } = credentials;
  const token = await getUaaTokenFromCredentials(credentials);

  const instances = await _hdiInstancesServiceManager(context);
  const bindings = await _hdiBindingsServiceManager(context);
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
        changes.push([
          async () => {
            await _createBindingServiceManagerFromInstance(sm_url, token, instance, { parameters });
            console.log(
              "created %i missing binding%s for tenant %s",
              missingBindingCount,
              missingBindingCount === 1 ? "" : "s",
              tenantId
            );
          },
        ]);
      }
    } else if (instanceBindings.length > SERVICE_MANAGER_IDEAL_BINDING_COUNT) {
      const ambivalentBindings = instanceBindings.slice(1);
      for (const { id } of ambivalentBindings) {
        changes.push([
          async () => {
            await _deleteBindingServiceManager(sm_url, token, id);
            console.log(
              "deleted %i ambivalent binding%s for tenant %s",
              ambivalentBindings.length,
              ambivalentBindings.length === 1 ? "" : "s",
              tenantId
            );
          },
        ]);
      }
    }
  }

  await limiter(SERVICE_MANAGER_CONCURRENCY, changes, async (fn) => await fn());
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
  const token = await getUaaTokenFromCredentials(credentials);
  // NOTE: deleting both the bindings and service instance best mimicks the behavior of instance manager

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
  const instances = await _hdiInstancesServiceManager(context, { filterTenantId });
  const bindings = await _hdiBindingsServiceManager(context, { filterTenantId });
  const bindingsByInstance = _getBindingsByInstance(bindings);
  instances.sort(compareForServiceManagerTenantId);

  const headerRow = ["tenant_id", "host", "schema", "ready"];
  doTimestamps && headerRow.push("created_on", "updated_on");
  const nowDate = new Date();
  const instanceMap = (instance) => {
    const [binding] = bindingsByInstance[instance.id] || [];
    const row = [
      instance.labels.tenant_id[0],
      binding ? binding.credentials.host + ":" + binding.credentials.port : "missing binding",
      binding ? binding.credentials.schema : "",
      instance.ready,
    ];
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
  const instances = await _hdiInstancesServiceManager(context, { filterTenantId, doEnsureTenantLabel: false });
  const bindings = await _hdiBindingsServiceManager(context, { filterTenantId, doReveal, doEnsureTenantLabel: false });
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
  const instances = await _hdiInstancesServiceManager(context, { filterTenantId });
  const bindings = await _hdiBindingsServiceManager(context, { filterTenantId });
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
  assert(isDashedWord(tenantId), `argument "${tenantId}" is not a valid hdi tenantId`);
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
  return await _hdiRepairBindingsServiceManager(context, parameters);
};

const hdiTunnelTenant = async (context, [tenantId], [doReveal]) => {
  assert(isDashedWord(tenantId), `argument "${tenantId}" is not a valid hdi tenantId`);
  return _hdiTunnel(context, tenantId, doReveal);
};

const hdiDeleteTenant = async (context, [tenantId]) => {
  assert(isDashedWord(tenantId), "TENANT_ID is not a dashed word", tenantId);
  return await _hdiDelete(context, tenantId);
};

const hdiDeleteAllServiceManager = async (context) => {
  const {
    cfService: { credentials },
  } = await context.getHdiInfo();
  const { sm_url } = credentials;
  const token = await getUaaTokenFromCredentials(credentials);
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
    const tenantId = guardedAccess(binding, "labels", "tenant_id", 0);
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

const _lazyCreateServiceBinding = async (tenant_id, sm_url, token) => {
  const { items: bindings } = await (
    await request({
      url: sm_url,
      pathname: `/v1/service_bindings`,
      query: { labelQuery: `tenant_id eq '${tenant_id}'` },
      auth: { token },
      headers: {
        "Content-Type": "application/json",
      },
      logged: false,
    })
  ).json();
  if (bindings.length > 0) {
    return "FOUND";
  }

  const { items: instances } = await (
    await request({
      url: sm_url,
      pathname: `/v1/service_instances`,
      query: { labelQuery: `tenant_id eq '${tenant_id}'` },
      auth: { token },
      headers: {
        "Content-Type": "application/json",
      },
      logged: false,
    })
  ).json();
  if (instances.length === 0) {
    console.error("error: found no service instances for tenant %s--skipping migration for this tenant", tenant_id);
    return "ERROR";
  }
  const [instance] = instances;

  await _createBindingServiceManagerFromInstance(sm_url, token, instance);
  return "BINDING_CREATED";
};

const hdiMigrateAll = async (context) => {
  const { cfEnvServices } = await context.getHdiInfo();
  const [serviceManager, instanceManager] = ["service-manager", "managed-hana"].map((name) => {
    const services = cfEnvServices[name];
    assert(Array.isArray(services), "could not find %s service binding", name);
    assert(services.length === 1, "found multiple %s service bindings, expected just one", name);
    return services[0];
  });

  const {
    credentials: { get_all_managed_instances_url, migrate_managed_instance_url, user: username, password },
  } = instanceManager;
  assert(
    migrate_managed_instance_url,
    "cannot find 'migrate_managed_instance_url' property on instance-manager service"
  );
  const { credentials } = serviceManager;
  const { sm_url } = credentials;
  const token = await getUaaTokenFromCredentials(credentials);

  const containers = await (
    await request({
      url: get_all_managed_instances_url,
      auth: { username, password },
    })
  ).json();

  containers.sort(compareForInstanceManagerTenantId);

  const headers = ["tenant_id", "instance_manager_migration_status", "service_manager_binding_status"];
  const table = [headers];

  // NOTE: we want to do this serially
  for (const { tenant_id, managed_binding_id } of containers) {
    let instance_manager_migration_status = "...";
    let service_manager_binding_status = "...";
    const response = await request({
      method: "POST",
      url: migrate_managed_instance_url
        .replace("{tenant_id}", tenant_id)
        .replace("{service-manager_container_id}", serviceManager.instance_guid),
      auth: { username, password },
      checkStatus: false,
    });
    if (!response.ok) {
      console.error("got bad response for tenant %s: %s", tenant_id, await response.text());
      instance_manager_migration_status = "FOUND";
    } else {
      const { migration_status } = await response.json();
      instance_manager_migration_status = migration_status;
    }

    service_manager_binding_status = await _lazyCreateServiceBinding(tenant_id, sm_url, token, managed_binding_id);

    table.push([tenant_id, instance_manager_migration_status, service_manager_binding_status]);
  }

  console.log();
  return tableList(table);
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
  hdiMigrateAll,
};

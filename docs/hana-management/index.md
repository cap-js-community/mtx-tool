---
layout: default
title: HANA Management
nav_order: 6
---

<!-- prettier-ignore-start -->
# HANA Management
{: .no_toc}
<!-- prettier-ignore-end -->

<!-- prettier-ignore -->
- TOC
{: toc}

## Summary

The HANA Management commands offer convenience for interacting with BTP's Service Manager service (technical name
`service-manager`). The now deprecated predecessor for Service Manager was named Instance Manager and is currently
still supported by MTX Tool.

The service manager is the third of three perspectives that MTX Tool offers on tenant information. This is the
lowest layer, the higher layers being [CAP Multitenancy]({{ site.baseurl }}/cap-multitenancy/) and still higher
[Tenant Registry]({{ site.baseurl }}/tenant-registry/). For an overview of the layers see
[Tenant Layers]({{ site.baseurl }}/tenant-registry/#summary).

For details and background information, please consult the official documentation:

- [https://help.sap.com/docs/SERVICEMANAGEMENT](https://help.sap.com/docs/SERVICEMANAGEMENT)
- API [https://service-manager.cfapps.eu10.hana.ondemand.com/swaggerui/swagger-ui.html](https://service-manager.cfapps.eu10.hana.ondemand.com/swaggerui/swagger-ui.html)
- HANA Service [https://help.sap.com/docs/HANA_SERVICE](https://help.sap.com/docs/HANA_SERVICE)
- HANA Cloud [https://help.sap.com/docs/SAP_S4HANA_CLOUD](https://help.sap.com/docs/SAP_S4HANA_CLOUD)

Commands for this area are:

```
   === hana management (hdi) ===
~  hdil   --hdi-list [TENANT_ID]                  list all hdi container instances
~  hdill  --hdi-long-list [TENANT_ID]             long list all hdi container instances and bindings
~  hdilr  --hdi-list-relations [TENANT_ID]        list all hdi container instance and binding relations
~  hditt  --hdi-tunnel-tenant TENANT_ID           open ssh tunnel to tenant db
   hdirt  --hdi-rebind-tenant TENANT_ID [PARAMS]  rebind tenant hdi container instances
   hdira  --hdi-rebind-all [PARAMS]               rebind all hdi container instances
          --hdi-repair-bindings [PARAMS]          create missing and delete ambiguous bindings
*         --hdi-delete-tenant TENANT_ID           delete hdi container instance and bindings for tenant
*         --hdi-delete-all                        delete all hdi container instances and bindings
          ...    [TENANT_ID]                      filter for tenant id
          ...    [PARAMS]                         create binding with custom parameters
          ...    --json                           list in json
          ...    --time                           list includes timestamps
          ...    --reveal                         show passwords

~  are read-only commands
*  are potentially _dangerous_ commands
```

## Environment

| environment variable  | effect                                                    |
| :-------------------- | :-------------------------------------------------------- |
| `MTX_HDI_APP`         | override configured app for `service-manager` accesses    |
| `MTX_HDI_CONCURRENCY` | change concurrency used for service calls (default is 10) |

## List and Long List

The list command `mtx hdil` is the most common entry point and will show a table of all hdi container bindings their
most useful associated information.

With the addition of the `--time` flag, the list will include both absolute and relative timestamps for creation
and the latest update.

If the provided information is insufficient or seems incomplete, then you can always fallback to the long list
`mtx hdill`, which will show the endpoint's full unparsed response data.

If you already know which tenant id you want the information for, then you can filter the list or long list, by
providing that information, e.g., `mtx hdill <tenant_id>`.

For automated processes, you can use the `--json` flag and consume the list data as JSON. With the
`--json` flag active, you will get the same data for `hdil` and `hdill`. For example, to get the ready state of
the all bindings, you use:

```
mtx hdil --json | jq '.bindings.[] | { binding: .id, ready: .ready }'
```

{: .info}
Note that due to the way `@sap/cds-mtx` works, the number of hdi 'tenants' does not correspond 1:1 with subscribed
subaccounts. Rather there are 2 hdi tenants for each subscribed subaccount, as well as one additional `__META__` hdi
tenant.

## Example for List

Here is an example of listing all container bindings:

![](hana-management-list.gif)

## List Instances and Bindings

The list instances command `mtx hdili` is designed to give you an overview of the instances in relationship to their
bindings. Instances represent acutal HDI containers in the SAP HANA database and bindings represent access credentials
for these containers. The most common situation you will have is that there is exactly one binding for each instance.

You can also have the case that an instance has several bindings or no bindings at all. This can happen, e.g., when
there are sporadic problems during key rotation and a binding is leaked. This listing will make it visually obvious
when these cases occur:

- One instance with one binding
  ```
  tenant_id  instance_id  ---  binding-id  ready_state
  ```
- One instance without binding (no access possible)
  ```
  tenant_id  instance_id  -x
  ```
- One instance with two bindings (access is ambivalent)
  ```
  tenant_id  instance_id  -+-  first-binding-id   ready_state
                           \-  second-binding-id  ready_state
  ```

## HDI Tunnel

The tunnel command `mtx hditt <tenant_id>` combines two purposes:

- it gives you the underlying connection info for the actual database host (named `remoteUrl`) and
- it uses ssh port forwarding to make the database port that exists within the running cf app container
  available as a local port (named `localUrl`).

The `remoteUrl` can be used if the database running the tenant container _whitelists the IP you are connecting
from_. These connection settings can for example be used in [DataGrip](https://www.jetbrains.com/datagrip/)
or [Idea Ultimate](https://www.jetbrains.com/idea/).

The `localUrl` can be used if the database running the tenant container _allows to skip certificate validation_,
which is broken by port forwarding to localhost. This is currently possible with HANA as a Service containers, but not
with HANA Cloud containers. The `localUrl` approach allows you to use the prominent Eclipse plugin
[SAP HANA Tools](https://tools.eu1.hana.ondemand.com/#hanatools) with the remote database. This plugin has various
advanced performance analysis functionalities.

For either case, MTX Tools gives connection details for two database schemas. Each HDI container is organized into a
_runtime schema_ with the actual data and a _designtime schema_, which contains metadata, for example to track schema
evolution.

{: .info}
By default MTX Tool hides passwords, to protect the user from revealing them inadvertantly in screen sharing sessions.
When you first set up connections and want to reveal the passwords, use the `--reveal` flag.

![](hana-management-tunnel.gif)

## HDI Rebind

The rebind commands `mtx hdirt <tenant_id>` and `mtx --hdi-rebind-all` will create a new binding and afterwards remove
the old binding for either a given hdi container or all hdi containers. This type of credential rotation is desirable
for increased security.

{: .warn}
Rebinding will invalidate current credentials, i.e, all applications that have them in memory need to either handle
this gracefully or be restarted.

Either rebind command allows you to pass arbitrary parameters to the service binding that gets created in service
manager. In other words, `mtx hdirt <tenant_id> '{"special":true}'` corresponds to

```
cf bind-service <service-manager> <hdi-shared service-instance of tenant_id> -c '{"special":true}'
```

## HDI Delete

The deletion commands are only sensible for cleanup after some mocking/testing purposes.

{: .warn}
In most cases, the BTP cockpit's subaccount _unsubscribe_ funcationality, or even
[Offboard Tenant]({{ site.baseurl }}/cap-multitenancy/#offboard-tenant), should be used instead.

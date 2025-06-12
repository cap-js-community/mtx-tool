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

The HANA Management commands offer convenience for interacting with HANA instances via BTP's Service Manager service
(technical name `service-manager`).

HANA Management is the third of three perspectives that MTX Tool offers on tenant information. This is the
lowest layer, the higher layers being [CAP Multitenancy]({{ site.baseurl }}/cap-multitenancy/) and still higher
[Tenant Registry]({{ site.baseurl }}/tenant-registry/). For an overview of the layers see
[Tenant Layers]({{ site.baseurl }}/tenant-registry/#summary).

A close cousin of this section is the [Service Manager]({{ site.baseurl }}/service-manager/). In it there are some
common interactions for all managed service instances and bindings, most notably credential rotation. This is
conceptually broader than just managed service instances that represent HDI containers.

For details and background information, please consult the official documentation:

- [https://help.sap.com/docs/SERVICEMANAGEMENT](https://help.sap.com/docs/SERVICEMANAGEMENT)
- API [https://service-manager.cfapps.eu10.hana.ondemand.com/swaggerui/swagger-ui.html](https://service-manager.cfapps.eu10.hana.ondemand.com/swaggerui/swagger-ui.html)
- HANA Service [https://help.sap.com/docs/HANA_SERVICE](https://help.sap.com/docs/HANA_SERVICE)
- HANA Cloud [https://help.sap.com/docs/SAP_S4HANA_CLOUD](https://help.sap.com/docs/SAP_S4HANA_CLOUD)

Commands for this area are:

```
   === hana management (hdi) ===
~  hdil   --hdi-list [TENANT_ID]         list all hdi container instances
~  hdill  --hdi-long-list [TENANT_ID]    long list all hdi container instances and bindings
~  hditt  --hdi-tunnel-tenant TENANT_ID  open ssh tunnel to tenant db
          ...    [TENANT_ID]             filter for tenant id
          ...    --json                  list in json
          ...    --time                  list includes timestamps
          ...    --reveal                show sensitive information

~  are read-only commands
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
providing that information, e.g. `mtx hdill <tenant_id>`.

For automated processes, you can use the `--json` flag and consume the list data as JSON. With the
`--json` flag active, you will get the same data for `hdil` and `hdill`. For example, to get the ready state of
the all bindings, you use:

```
mtx hdil --json | jq '.bindings.[] | { binding: .id, ready: .ready }'
```

{: .info}
Note that due to the way `@sap/cds-mtx` works, the number of hdi 'tenants' does not correspond 1:1 with subscribed
subaccounts. Rather there is an additional `t0` hdi tenant for multitenancy metadata.

## Example for List

Here is an example of listing all container bindings:

![](hana-management-list.gif)

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

For either case, MTX Tool gives connection details for two database schemas. Each HDI container is organized into a
_runtime schema_ with the actual data and a _design time schema_, which contains metadata, for example to track schema
evolution.

{: .info}
By default MTX Tool hides passwords, to protect the user from revealing them inadvertently in screen sharing sessions.
When you first set up connections and want to reveal the passwords, use the `--reveal` flag.

![](hana-management-tunnel.gif)

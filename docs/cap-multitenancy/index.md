---
layout: default
title: CAP Multitenancy
nav_order: 5
---

<!-- prettier-ignore-start -->
# CAP Multitenancy
{: .no_toc}
<!-- prettier-ignore-end -->

<!-- prettier-ignore -->
- TOC
{: toc}

## Summary

The CAP multitenancy commands offer convenience for interacting with CAP's multitenancy module (technical name
`@sap/cds-mtx`).

The registry is the second of three perspectives that MTX Tool offers on tenant information. This is the
middle layer, the higher layer is [Tenant Registry]({{ site.baseurl }}/tenant-registry/) and the lower layer is
[HANA Management]({{ site.baseurl }}/hana-management/). For an overview of the layers see
[Tenant Layers]({{ site.baseurl }}/tenant-registry/#summary).

For details and background information, please consult the official documentation:

- Capire [https://cap.cloud.sap](https://cap.cloud.sap)
- Subsection [Deployment/MTX APIs Reference](https://cap.cloud.sap/docs/guides/deployment/mtx-apis)
- Source Code [https://github.tools.sap/cap/cds-mtx](https://github.tools.sap/cap/cds-mtx)

Commands for this area are:

```
   === cap multitenancy (cds) ===
~  cdsl   --cds-list [TENANT]                       list all cds-mtx tenant names
~  cdsll  --cds-long-list [TENANT]                  long list all cds-mtx tenants
   cdsot  --cds-onboard-tenant TENANT_ID SUBDOMAIN  onboard specific tenant
   cdsut  --cds-upgrade-tenant TENANT_ID            upgrade specific tenant
   cdsua  --cds-upgrade-all                         upgrade all tenants
*         --cds-offboard-tenant TENANT_ID           offboard specific tenant
*         --cds-offboard-all                        offboard all tenants
          ...    [TENANT]                           filter list for tenant id or subdomain
          ...    --auto-undeploy                    upgrade with auto undeploy
          ...    --time                             list includes timestamps

~  are read-only commands
*  are potentially _dangerous_ commands
```

## List and Long List

The list command `mtx cdsl` is the most common entry point and will show a table of all subscribed subacconts with
their most useful associated information.

If the provided information is insufficient or seems incomplete, then you can always fallback to the long list
`mtx cdsll`, which will show the endpoint's full unparsed response data.

If you already know which subaccount or tenant id you want the information for, then you can filter the list or long
list, by providing that information, e.g., `mtx cdsl skyfin-company`.

## Example for List

Here is an example of listing all subscribed subacconts:

![](cap-multitenancy-list.gif)

## Onboard Tenant

With the `--cds-onboard-tenant` command, you can onboard a specific subaccount.

Be mindful that onboarding _only_ through CAP is usually not a good idea, since this will leave out the
[Tenant Registry]({{ site.baseurl }}/tenant-registry/) layer and so the onboarding cannot be associated with a real
BTP subaccount. This can be useful for testing or mocking purposes.

{: .warn}
In most cases, the BTP cockpit's subaccount _subscribe_ funcationality should be used instead.

## Upgrade Tenant

The `--cds-upgrade-tenant` and `--cds-upgrade-all` commands are required to propagate database changes that are already
part of the deployed app's CAP cds modelling to the tenant's actual database. So to realize a database change, you
change the cds model. Deploy the app with the new modelling and then trigger an upgrade on the app. You can do the
changes individually, for each tenant, or in bulk, for all tenants at once.

After running the upgrade, you will get a resulting status and a log file for each tenant. In case of an unsuccessful
upgrade, consult the associated log file for details.

The `--auto-undeploy` flag can be used for upgrade commands, in order to enable automatic undeploy of leftover hdi
artifacts. This is especially useful for project stages where the basic data model is still actively evolving a lot and
there is little to no customer data.

<!-- prettier-ignore-start -->
### Upgrade Tenant Scaling
{: .no_toc}
<!-- prettier-ignore-end -->

Running upgrade all on an app with _multiple instances_ will cause mtx to

- get a list of all tenant ids,
- sort them lexicographically, and
- divide them up equally between each app instance.

In this way, the division of labor is pseudo-random and each app instance should be unbiased towards, e.g., upgrading
all tenants running on the same database.

## Example for Upgrade Tenant

![](cap-multitenancy-upgrade-tenant.gif)

## Offboard Tenant

With the `--cds-offboard-tenant` command, you can offboard a specific subaccount and similarly with
`--cds-offboard-all`, you can offboard all subaccounts.

Be mindful that offboarding _only_ through CAP is usually not a good idea, since this will leave out the
[Tenant Registry]({{ site.baseurl }}/tenant-registry/) layer and so the offboarding is not visible to any associated
real BTP subaccount. This can be useful for testing or mocking purposes.

{: .warn}
In most cases, the BTP cockpit's subaccount _unsubscribe_ funcationality should be used instead.

---
layout: default
title: Service Manager
nav_order: 7
---

<!-- prettier-ignore-start -->
# Service Manager
{: .no_toc}
<!-- prettier-ignore-end -->

<!-- prettier-ignore -->
- TOC
{: toc}

## Summary

The service manager section is a close cousin of [HANA Management]({{ site.baseurl }}/hana-management/). While HANA
Management is concerned particularly with service instances representing HDI containers, here we treat all service
instances abstractly to perform common actions, usually on their bindings.

For details and background information, please consult the official documentation:

- [https://help.sap.com/docs/SERVICEMANAGEMENT](https://help.sap.com/docs/SERVICEMANAGEMENT)
- API [https://service-manager.cfapps.eu10.hana.ondemand.com/swaggerui/swagger-ui.html](https://service-manager.cfapps.eu10.hana.ondemand.com/swaggerui/swagger-ui.html)

Commands for this area are:

```
   === service manager (svm) ===
~  svml   --svm-list [TENANT_ID]                                  list all managed service instances and binding
~  svmll  --svm-long-list [TENANT_ID]                             long list all managed service instances and bindings
          --svm-repair-bindings SERVICE_PLAN [PARAMS]             repair missing and ambivalent service bindings
          --svm-fresh-bindings SERVICE_PLAN TENANT_ID [PARAMS]    create new service bindings
          --svm-refresh-bindings SERVICE_PLAN TENANT_ID [PARAMS]  delete and recreate service bindings
*         --svm-delete-bindings SERVICE_PLAN TENANT_ID            delete service bindings
*         --svm-delete SERVICE_PLAN TENANT_ID                     delete service instances and bindings
          ...    SERVICE_PLAN                                     filter for service plan with "offering:plan"
                                                                    or "all-services" for all
          ...    TENANT_ID                                        filter for tenant id or "all-tenants" for all
          ...    [PARAMS]                                         create binding with custom parameters
          ...    --json                                           list in json
          ...    --time                                           list includes timestamps
          ...    --reveal                                         show sensitive information

~  are read-only commands
*  are potentially _dangerous_ commands
```

## Environment

| environment variable  | effect                                                    |
| :-------------------- | :-------------------------------------------------------- |
| `MTX_SVM_CONCURRENCY` | change concurrency used for service calls (default is 10) |

## List

The list command `mtx svml` is designed to give you an overview of the instances in relationship to their bindings.
Service instances are some kind of managed service instance. For example, this could be an HDI container or an object
store. The corresponding bindings represent access credentials for these instances. In most cases, you will have exactly
one binding for each instance.

You can also have the case that an instance has several bindings or no bindings at all. This can happen, e.g. when
there are sporadic problems during credential rotation. This listing will make it visually obvious when these cases
occur:

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

## Repair Bindings

The repair command

```
mtx --svm-repair-bindings SERVICE_PLAN
```

will normalize all service instances, so that they have exactly one binding. Missing bindings are created and ambivalent
ones are removed. This happens either for a given service plan, e.g. `objectstore:standard`, or for `all-services`.

## Fresh or Refresh Bindings

The fresh and refresh commands

```
mtx --svm-fresh-bindings SERVICE_PLAN TENANT_ID
mtx --svm-refresh-bindings SERVICE_PLAN TENANT_ID
```

will create new bindings and, for refresh, also remove the current binding. Regular credential rotation is recommended
to increase security.

You can select which managed bindings you want to include with the following combinations:

| SERVICE_PLAN                        | TENANT_ID     | selects                                                       |
| :---------------------------------- | :------------ | :------------------------------------------------------------ |
| `all-services`                      | `all-tenants` | all managed bindings                                          |
| `all-services`                      | `<tenant-id>` | all managed bindings for a given tenant                       |
| `<service-offering>:<service-plan>` | `all-tenants` | all managed bindings for a given plan, e.g. `hana:hdi-shared` |
| `<service-offering>:<service-plan>` | `<tenant-id>` | all managed bindings for a given tenant and plan              |

{: .warn}
Refreshing will invalidate current credentials, i.e. all applications that have them in memory need to either handle
this gracefully or be restarted.

{: .info}
Fresh will not invalidate current credentials, but you should use the repair command for cleanup once the new
credentials are used in all relevant servers.

Both the fresh and refresh commands allow you to pass arbitrary parameters to the service binding that gets created in
service manager. In other words,

```
mtx --svm-fresh-bindings SERVICE_PLAN TENANT_ID '{"special":true}'
mtx --svm-refresh-bindings SERVICE_PLAN TENANT_ID '{"special":true}'
```

correspond to

```
cf bind-service <some-app> <service-instance matching tenant and service-plan> -c '{"special":true}'
```

## Delete Bindings and Delete

The deletion commands are only sensible for cleanup after some mocking/testing purposes. The syntax is similar to
[Refresh Bindings](#refresh-bindings).

Use

```
mtx --svm-delete-bindings SERVICE_PLAN TENANT_ID
```

to clean up just the bindings, or use

```
mtx --svm-delete SERVICE_PLAN TENANT_ID
```

to clean up both bindings and instances.

{: .info}
In most cases, the BTP cockpit's subaccount _unsubscribe_ functionality, or even
[Offboard Tenant]({{ site.baseurl }}/cap-multitenancy/#offboard-tenant), should be used instead.

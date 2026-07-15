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
~  svml   --svm-list [TENANT_ID]                                      list all service instances and bindings
~  svmll  --svm-long-list [TENANT_ID]                                 long list all service instances and bindings
          --svm-make-bindings-single SERVICE_PLAN TENANT_ID [PARAMS]  make service bindings 1-to-1
          --svm-make-bindings-double SERVICE_PLAN TENANT_ID [PARAMS]  make service bindings 1-to-2
*         --svm-delete-bindings SERVICE_PLAN TENANT_ID                delete service bindings
*         --svm-delete SERVICE_PLAN TENANT_ID                         delete service instances and bindings
          ...    SERVICE_PLAN                                         filter for service plan with "offering:plan"
                                                                        or "all-services" for all
          ...    TENANT_ID                                            filter for tenant id or "all-tenants" for all
          ...    [PARAMS]                                             create binding with custom parameters
          ...    --json                                               list in json
          ...    --time                                               list includes timestamps
          ...    --reveal                                             show sensitive information

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

## Normalize Bindings

The two make-bindings commands normalize service instances to a target number of bindings. They are _idempotent_:
running them repeatedly converges on the same state, which makes them safe to retry.

- `mtx --svm-make-bindings-single SERVICE_PLAN TENANT_ID` normalizes to exactly one binding per instance.
- `mtx --svm-make-bindings-double SERVICE_PLAN TENANT_ID` normalizes to exactly two bindings per instance.

In both cases, missing bindings are created and surplus bindings are removed until the target count is reached. Failed
bindings are always cleaned up. When surplus bindings are pruned, the most-recently-updated binding is kept and older
ones are removed. This ordering is what makes zero-downtime rotation possible: after a rolling restart applications
hold credentials from the most-recent binding, so pruning older bindings never invalidates in-use credentials.

You can select which managed instances you want to include with the following combinations:

| SERVICE_PLAN                        | TENANT_ID     | selects                                                        |
| :---------------------------------- | :------------ | :------------------------------------------------------------- |
| `all-services`                      | `all-tenants` | all managed instances                                          |
| `all-services`                      | `<tenant-id>` | all managed instances for a given tenant                       |
| `<service-offering>:<service-plan>` | `all-tenants` | all managed instances for a given plan, e.g. `hana:hdi-shared` |
| `<service-offering>:<service-plan>` | `<tenant-id>` | all managed instances for a given tenant and plan              |

The make-bindings commands allow you to pass arbitrary parameters to the service bindings that get created in service
manager. In other words,

```
mtx --svm-make-bindings-single SERVICE_PLAN TENANT_ID '{"special":true}'
```

corresponds to

```
cf bind-service <some-app> <service-instance matching tenant and service-plan> -c '{"special":true}'
```

{: .info}
Regular credential rotation is recommended to increase security. See
[Zero Downtime Credential Rotation](#zero-downtime-credential-rotation) for how to rotate credentials in productive
environments without invalidating in-use credentials.

## Delete Bindings and Delete

The deletion commands are only sensible for cleanup after some mocking/testing purposes. The syntax is similar to
[Normalize Bindings](#normalize-bindings).

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

## Zero Downtime Credential Rotation

In productive environments credentials must rotate without downtime. Rotation is a _five-step choreography_ of the two
idempotent make-bindings commands, so any step can be retried safely if it fails.

1.  _Rolling restart_ — converge all apps onto the most-recent binding.

2.  `mtx --svm-make-bindings-single SERVICE_PLAN TENANT_ID` — prune to one binding per instance.

3.  `mtx --svm-make-bindings-double SERVICE_PLAN TENANT_ID` — add the new binding. In-memory credentials stay valid.

4.  _Rolling restart_ — apps switch to the new binding.

5.  `mtx --svm-make-bindings-single SERVICE_PLAN TENANT_ID` — prune the old binding. Rotation is complete.

See [Blue-Green Deployment of Multitarget Applications](https://help.sap.com/docs/btp/sap-business-technology-platform/blue-green-deployment-of-multitarget-applications) for details.

{: .info}
If the fleet is already at one binding per instance, skip to step 3.

{: .warn}
For Service Manager APIs, rate limits are in place. API requests for credential rotation count in addition to the
regular calls to Service Manager APIs performed by your application. If the request limit is a concern, you should
use the `MTX_SVM_CONCURRENCY` env variable to limit concurrency.

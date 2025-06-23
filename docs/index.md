---
layout: home
title: Home
nav_order: 1
---

# MTX Tool

Multitenancy and Extensibility Tool is a cli to reduce operational overhead for multitenant Cloud Foundry applications, particularly in the areas user authentication, tenant registration, CAP multitenancy, and HANA container management.

## Content

| Area                                       | Purpose                                                          | Related                                                                                                |
| :----------------------------------------- | :--------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- |
| [Tool Setup](tool-setup)                   | initial, project, or ad-hoc setup                                |                                                                                                        |
| [User Authentication](user-authentication) | obtain and decode access tokens                                  | service:&nbsp;[xsuaa](https://services.tools.sap/#/perspective/services/service/SERVICE-92)            |
| [Tenant Registry](tenant-registry)         | list subscribed subaccounts and service dependencies             | service:&nbsp;[saas-registry](https://services.tools.sap/#/perspective/services/service/SERVICE-380)   |
| [CAP Multitenancy](cap-multitenancy)       | list, onboard, offboard, and upgrade tenants                     | library:&nbsp;[@sap/cds-mtx](https://github.tools.sap/cdx/cds-mtx)                                     |
| [HANA Management](hana-management)         | list and access hdi container                                    | service:&nbsp;[service-manager](https://services.tools.sap/#/perspective/services/service/SERVICE-324) |
| [Service Manager](service-manager)         | list, refresh, and delete managed service instances and bindings | service:&nbsp;[service-manager](https://services.tools.sap/#/perspective/services/service/SERVICE-324) |

<!--
| [Server Diagnostic](server-diagnostic)     | debugging runtime server instances                   |                                                                                                    |
-->

## Getting Started

Prerequisite is an installed [CF cli](https://github.com/cloudfoundry/cli) v8 or newer.

**Prepare**

```
npm install --global @cap-js-community/mtx-tool
mtx --setup
```

**Use, for example**

```
cf target -o <my-org> -s <my-space>
mtx regl
mtx hdil
```

## Pipelines

For pipelines, we recommend committing the setup configuration to your project and running MTX Tool on the pipeline
runner in the corresponding directory through npx with a stable version:

**In project**

```
mtx --setup-local
git add . && git commit -m "mtx-tool config"
```

**In pipeline, for example**

```
npx @cap-js-community/mtx-tool@0.10.1 --svm-repair-bindings all-services
npx @cap-js-community/mtx-tool@0.10.1 --svm-refresh-bindings all-services all-tenants
...
npx @cap-js-community/mtx-tool@0.10.1 --cds-upgrade-all
```

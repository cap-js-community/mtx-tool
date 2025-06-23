# MTX Tool

[![npm version](https://img.shields.io/npm/v/@cap-js-community/mtx-tool)](https://www.npmjs.com/package/@cap-js-community/mtx-tool)
[![monthly downloads](https://img.shields.io/npm/dm/@cap-js-community/mtx-tool)](https://www.npmjs.com/package/@cap-js-community/mtx-tool)
[![REUSE status](https://api.reuse.software/badge/github.com/cap-js-community/mtx-tool)](https://api.reuse.software/info/github.com/cap-js-community/mtx-tool)
[![Main CI](https://github.com/cap-js-community/mtx-tool/actions/workflows/main-ci.yml/badge.svg)](https://github.com/cap-js-community/mtx-tool/commits/main)

Multitenancy and Extensibility Tool is a cli to reduce operational overhead for multitenant Cloud Foundry applications, particularly in the areas user authentication, tenant registration, CAP multitenancy, and HANA container management.

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

## Features

MTX Tool is organized into contextual sections, each with several commands.

```
   === user authentication (uaa) ===
~  uaad   --uaa-decode TOKEN                                     decode JSON web token
~  uaac   --uaa-client [TENANT]                                  obtain uaa token for generic client
~  uaap   --uaa-passcode PASSCODE [TENANT]                       obtain uaa token for one-time passcode
~  uaau   --uaa-user USERNAME PASSWORD [TENANT]                  obtain uaa token for username password
~  uaasc  --uaa-service-client SERVICE [TENANT]                  obtain service token for generic client
~  uaasp  --uaa-service-passcode SERVICE PASSCODE [TENANT]       obtain service token for one-time passcode
~  uaasu  --uaa-service-user SERVICE USERNAME PASSWORD [TENANT]  obtain service token for username password
          ...    [TENANT]                                        obtain token for tenant, fallback to paas tenant
          ...    --json                                          output in json
          ...    --decode                                        decode result token
          ...    --userinfo                                      add detailed user info for passcode or username

   === tenant registry (reg) ===
~  regl   --registry-list [TENANT]                      list all subscribed subaccount names
~  regll  --registry-long-list [TENANT]                 long list all subscribed subaccounts
~  regs   --registry-service-config                     show registry service config
          --registry-update TENANT_ID                   update tenant dependencies
          --registry-update-all                         update dependencies for all subscribed tenants
          --registry-update-url [TENANT_ID]             update all subscribed application URL
*         --registry-offboard TENANT_ID                 offboard tenant subscription
*         --registry-offboard-skip TENANT_ID SKIP_APPS  offboard tenant subscription skipping apps
          ...    [TENANT]                               filter list for tenant id or subdomain
          ...    --json                                 list in json
          ...    --time                                 list includes timestamps
          ...    --skip-unchanged                       skip update for unchanged dependencies
          ...    --only-stale                           only update subscriptions that have not changed today
          ...    --only-failed                          only update subscriptions with UPDATE_FAILED state

   === cap multitenancy (cds) ===
~  cdsl   --cds-list [TENANT]                        list all cds-mtx tenant names
~  cdsll  --cds-long-list [TENANT]                   long list all cds-mtx tenants
   cdsot  --cds-onboard-tenant TENANT_ID [METADATA]  onboard specific tenant
   cdsut  --cds-upgrade-tenant TENANT_ID             upgrade specific tenant
   cdsua  --cds-upgrade-all                          upgrade all tenants
*         --cds-offboard-tenant TENANT_ID            offboard specific tenant
*         --cds-offboard-all                         offboard all tenants
          ...    [METADATA]                          onboard subscription metadata
          ...    [TENANT]                            filter list for tenant id or subdomain
          ...    --json                              list in json
          ...    --time                              list includes timestamps
          ...    --auto-undeploy                     upgrade with auto undeploy
          ...    --first-instance                    upgrade only through first app instance

   === hana management (hdi) ===
~  hdil   --hdi-list [TENANT_ID]         list all hdi container instances
~  hdill  --hdi-long-list [TENANT_ID]    long list all hdi container instances and bindings
~  hditt  --hdi-tunnel-tenant TENANT_ID  open ssh tunnel to tenant db
          ...    [TENANT_ID]             filter for tenant id
          ...    --json                  list in json
          ...    --time                  list includes timestamps
          ...    --reveal                show sensitive information

   === service manager (svm) ===
~  svml   --svm-list [TENANT_ID]                                  list all managed service instances and binding
~  svmll  --svm-long-list [TENANT_ID]                             long list all managed service instances and bindings
          --svm-repair-bindings SERVICE_PLAN [PARAMS]             repair missing and ambivalent service bindings
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

   === server diagnostic (srv) ===
~  srvenv  --server-env [APP_NAME]                            dump system environment
~  srvcrt  --server-certificates [APP_NAME] [APP_INSTANCE]    dump instance certificates
   srvd    --server-debug [APP_NAME] [APP_INSTANCE]           open ssh tunnel to debug port
           ...    [APP_NAME]                                  run server commands for a specific app
           ...    [APP_INSTANCE]                              tunnel to specific app instance, fallback to 0

~  are read-only commands
*  are potentially _dangerous_ commands
```

Adding `--force` to any _dangerous_ command will override the safeguard, use at your own risk.

## Peers

- [SAP BTP Command Line Interface](https://help.sap.com/docs/btp/btp-cli-command-reference/btp-cli-command-reference), [download](https://tools.hana.ondemand.com/#cloud-btpcli)
- [Service Manager Control command line tool](https://github.com/Peripli/service-manager-cli), will be archived Aug 2025

## Documentation

Head over to our [Documentation](https://cap-js-community.github.io/mtx-tool/) to learn more.

## Support, Feedback, Contributing

This project is open to feature requests/suggestions, bug reports etc. via [GitHub issues](https://github.com/cap-js-community/mtx-tool/issues). Contribution and feedback are encouraged and always welcome. For more information about how to contribute, the project structure, as well as additional contribution information, see our [Contribution Guidelines](CONTRIBUTING.md).

## Code of Conduct

We as members, contributors, and leaders pledge to make participation in our community a harassment-free experience for everyone. By participating in this project, you agree to abide by its [Code of Conduct](CODE_OF_CONDUCT.md) at all times.

## Licensing

Copyright 2023 SAP SE or an SAP affiliate company and mtx-tool contributors. Please see our [LICENSE](LICENSE) for copyright and license information. Detailed information including third-party components and their licensing/copyright information is available [via the REUSE tool](https://api.reuse.software/info/github.com/cap-js-community/mtx-tool).

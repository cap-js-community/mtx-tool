---
layout: home
title: Home
nav_order: 1
---

# MTX Tool

Multitenancy and Extensibility Tool is a cli to reduce operational overhead for multitenant Cloud Foundry applications, particularly in the areas user authentication, tenant registration, CAP multitenancy, and HANA container management.

## Install or Upgrade

Prerequisite is an installed [CF cli](https://github.com/cloudfoundry/cli) v7 or newer. The tool can be installed either globally or locally for a specific project.

```bash
# globally
npm install --global @cap-js-community/mtx-tool
# project local
npm install --save-dev @cap-js-community/mtx-tool
```

You can also not install the tool and use it ad-hoc.

```bash
# ad-hoc
npx @cap-js-community/mtx-tool
# ad-hoc with fixed version, e.g. for stable pipelines
npx @cap-js-community/mtx-tool@v0.8.7
```

## Content

| Area                                       | Purpose                                                    | Related                                                                                                |
| :----------------------------------------- | :--------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- |
| [Tool Setup](tool-setup)                   | initial, project, or ad-hoc setup                          |                                                                                                        |
| [User Authentication](user-authentication) | obtain and decode access tokens                            | service:&nbsp;[xsuaa](https://services.tools.sap/#/perspective/services/service/SERVICE-92)            |
| [Tenant Registry](tenant-registry)         | list subscribed subaccounts and service dependencies       | service:&nbsp;[saas-registry](https://services.tools.sap/#/perspective/services/service/SERVICE-380)   |
| [CAP Multitenancy](cap-multitenancy)       | list, onboard, offboard, and upgrade tenants               | library:&nbsp;[@sap/cds-mtx](https://github.tools.sap/cdx/cds-mtx)                                     |
| [HANA Management](hana-management)         | list, access, and delete hdi container instances, bindings | service:&nbsp;[service-manager](https://services.tools.sap/#/perspective/services/service/SERVICE-324) |

<!--
| [Server Diagnostic](server-diagnostic)     | debugging runtime server instances                   |                                                                                                    |
-->

## Quickstart

```
usage: mtx [command]

commands:
   h  -h  --help     show complete help
   v  -v  --version  show version

   === tool setup (set) ===
~  setl    --setup-list   list runtime config
   set     --setup        interactive setup for global config
   setcwd  --setup-local  interactive setup for local config
   setcc   --clean-cache  clean all app caches

   === user authentication (uaa) ===
~  uaad   --uaa-decode TOKEN                                     decode JSON web token
~  uaac   --uaa-client [TENANT]                                  obtain uaa token for generic client
~  uaap   --uaa-passcode PASSCODE [TENANT]                       obtain uaa token for one-time passcode
~  uaau   --uaa-user USERNAME PASSWORD [TENANT]                  obtain uaa token for username password
~  uaasc  --uaa-service-client SERVICE [TENANT]                  obtain service token for generic client
~  uaasp  --uaa-service-passcode SERVICE PASSCODE [TENANT]       obtain service token for one-time passcode
~  uaasu  --uaa-service-user SERVICE USERNAME PASSWORD [TENANT]  obtain service token for username password
          ...    [TENANT]                                        obtain token for tenant, fallback to paas tenant
          ...    --decode                                        decode result token
          ...    --json                                          result in json
          ...    --userinfo                                      add detailed user info for passcode or username

   === tenant registry (reg) ===
~  regl   --registry-list [TENANT]                      list all subscribed subaccount names
~  regll  --registry-long-list [TENANT]                 long list all subscribed subaccounts
~  regs   --registry-service-config                     show registry service config
~  regj   --registry-job JOB_ID                         show registry job
          --registry-update TENANT_ID                   update tenant dependencies
          --registry-update-all                         update dependencies for all subscribed tenants
          --registry-update-url [TENANT_ID]             update all subscribed application URL
*         --registry-offboard TENANT_ID                 offboard tenant subscription
*         --registry-offboard-skip TENANT_ID SKIP_APPS  offboard tenant subscription skipping apps
          ...    [TENANT]                               filter list for tenant id or subdomain
          ...    --time                                 list includes timestamps
          ...    --json                                 list in json
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
          ...    --auto-undeploy                     upgrade with auto undeploy
          ...    --time                              list includes timestamps
          ...    --json                              list in json

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
          ...    --reveal                         show passwords
          ...    --time                           list includes timestamps
          ...    --json                           list in json

   === server diagnostic (srv) ===
~  srv     --server-info                                      call server /info
~  srvd    --server-debug [APP_NAME] [APP_INSTANCE]           open ssh tunnel to port /info {debugPort}
~  srvenv  --server-env [APP_NAME]                            dump system environment
~  srvcrt  --server-certificates [APP_NAME] [APP_INSTANCE]    dump instance certificates
*          --server-start-debugger [APP_NAME] [APP_INSTANCE]  start debugger on server node process
           ...    [APP_NAME]                                  run server commands for a specific app
           ...    [APP_INSTANCE]                              tunnel to specific app instance, fallback to 0

~  are read-only commands
*  are potentially _dangerous_ commands
```

- adding `--force` to any _dangerous_ command will override the safeguard, use at your own risk
- `--registry-offboard-skip` apps to skip are comma separated without spaces
- `--registry-offboard-skip` can be used for app/services failing to offboard
- `--cds-offboard-tenant` and `--cds-offboard-all` will delete the related hdi containers
- `--hdi-rebind-tenant` will invalidate current credentials, i.e, all applications that have them in memory need to
  either handle this gracefully or be restarted
- `--server-start-debugger` will send SIGUSR1 to node process (requires ssh enabled on cf), which starts debugger _
  without restart_
- `TENANT` means you can enter either the subdomain or tenant id and both will work

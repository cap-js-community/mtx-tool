# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

<!-- order is REMOVED, CHANGED, ADDED, FIXED -->

## v0.10.2 - 2025-07-29

### CHANGED

- svm: new bindings inherit all labels from the underlying service instance.

- svm: new bindings always get a `service_plan_id` label, which is expected by `@sap/cds-mtxs`.

### ADDED

- [experimental] set env variable `MTX_CORRELATION=1` to log correlation information for service responses.
  we will show the first matching header of: `X-CorrelationId`, `X-Correlation-Id`, `X-Vcap-Request-Id`.

## v0.10.1 - 2025-06-23

### FIXED

- svm: `--svm-repair-bindings` and `--svm-refresh-bindings` will ignore instances with `ready: false`.

## v0.10.0 - 2025-06-11

⚠️ This release is potentially disruptive. We carved out the service-manager interactions from `hdi` into a new section
`svm`. Among other things, this allows us to handle credentials rotation for all managed service plans consistently, not
just for HANA containers.

| deprecated hdi command          | corresponding svm command                            |
| :------------------------------ | :--------------------------------------------------- |
| `--hdi-list-relations`          | `--svm-list`                                         |
| `--hdi-rebind-tenant TENANT_ID` | `--svm-refresh-bindings hana:hdi-shared TENANT_ID`   |
| `--hdi-rebind-all`              | `--svm-refresh-bindings hana:hdi-shared all-tenants` |
| `--hdi-repair-bindings`         | `--svm-repair-bindings hana:hdi-shared`              |
| `--hdi-delete-tenant TENANT_ID` | `--svm-delete hana:hdi-shared TENANT_ID`             |
| `--hdi-delete-all`              | `--svm-delete hana:hdi-shared all-tenants`           |

### REMOVED

- srv: command `--server-start-debugger` is not needed anymore, this happens implicitly now with `--server-debug`.

### CHANGED

- hdi: all binding manipulation commands have migrated to dedicated service-manager.

### ADDED

- svm: new dedicated command section for service-manager interactions (fixes #87).

- svm: coding that creates or deletes bindings has some built-in retries for temporary outages.

- cds: cds upgrade commands will download tenant deployment logs from cf app container.

### FIXED

- svm: `--svm-repair-bindings` command will now clean up bindings with `ready: false`.

## v0.9.4 - 2025-02-27

### Added

- cds: offer an optional flag `--first-instance` for `--cds-upgrade-all` that will cause all tenants to be processed by
  the first app instance only. this will make the upgrade less resource efficient, but resilient to auto-scaling.
  (fixes #104)

### Fixed

- hdi: change internal logic to identify the relevant service both by offering name `hana` and plan name `hdi-shared`.
  this takes one more request, but it's much cleaner. before, we had implicitly assumed that no other service offering
  uses the plan name `hdi-shared`.

## v0.9.3 - 2025-01-22

### Fixed

- srv: fix debug command type mixture bug where app instance argument was ignored

- srv: fix certificate dump command

## v0.9.2 - 2024-12-13

### Fixed

- cds: fix cds upgrade safety net for stalled upgrades

- the [whatwg-url](https://www.npmjs.com/package/whatwg-url) override did not reach users, because it only works
  locally. this should be fixed by using shrinkwrap.

## v0.9.0 - 2024-12-07

### Removed

- node v16 is no longer supported

- hdi: remove legacy instance manager code

- cds: remove legacy cds-mtx code

- reg: remove registry job command

- srv: remove server info command

### Changed

- marked `--server-start-debugger` as not dangerous

### Added

- established baseline test coverage

- hdi: list relations also gets the `--json` flag

### Fixed

- override [whatwg-url](https://www.npmjs.com/package/whatwg-url) to v14. this fixes a `punycode` incompatibility
  warning when using the commonjs variant of [node-fetch](https://www.npmjs.com/package/node-fetch) with node v21+.

- fix some internal context call queuing under parallel execution

- fix console output for `--server-start-debugger` and `--version`

## v0.8.8 - 2024-12-04

### Added

- reg/cds/hdi: the list and long list command gets a `--json` flag to produce json output (fixes #86)

- uaa: all uaa commands get a `--json` flag to produce json output

- code scanning with codeQL

### Fixed

- added node v22 to voters

- better separation for test request-replay recording and playback

- hdi: fixed logic for `ready` list column, such that it's false if either instance or binding is not ready

- srv: better resilience for apps with no buildpack

## v0.8.7 - 2024-07-23

### Added

- reg: new `--only-stale` and `--only-failed` filter options for most registry commands.
  stale here means that the last changed on day is older than the invocation day.

### Fixed

- reg: `--registry-update-all` is more resilient for failing calls

- better error message for users with access restrictions due to new btp space supporter role

## v0.8.6 - 2024-06-03

### Fixed

- cds: upgrade now fails with a non-zero error code if an underlying task fails

## v0.8.5 - 2024-05-15

### Changed

- reg: registry service calls now happen concurrently where appropriate similar to hdi and cds interactions.

### Added

- added environment variables to control polling frequency for interactions:

  | environment variable | effect                                                                               |
  | :------------------- | :----------------------------------------------------------------------------------- |
  | `MTX_CDS_FREQUENCY`  | change polling frequency milliseconds for server async job calls (default is 15000)  |
  | `MTX_REG_FREQUENCY`  | change polling frequency milliseconds for service async job calls (default is 15000) |

### Fixed

- reg: better error handling for registry updates

## v0.8.4 - 2024-05-01

### Fixed

- reg: fixed a paging bug where most registry commands had an infinite loop if more than 200 tenants are handled. (reported by @cgaillydetaurines)

## v0.8.3 - 2024-04-26

### Changed

- cds: tenant upgrade now logs progress of individual tasks (`@sap/cds-mtxs` uses one task per tenant) for every poll.
  the logs will look something like:
  ```
  GET https://my-server-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='d2f560dc-542c-4091-a632-919c941210b4') 200 OK (163ms)
  job d2f560dc-542c-4091-a632-919c941210b4 is RUNNING with tasks queued/running:  5/ 5 | failed/finished:  0/ 0
  GET https://my-server-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='d2f560dc-542c-4091-a632-919c941210b4') 200 OK (98ms)
  job d2f560dc-542c-4091-a632-919c941210b4 is RUNNING with tasks queued/running:  4/ 5 | failed/finished:  0/ 1
  GET https://my-server-mtx.cfapps.sap.hana.ondemand.com/-/cds/jobs/pollJob(ID='d2f560dc-542c-4091-a632-919c941210b4') 200 OK (98ms)
  job d2f560dc-542c-4091-a632-919c941210b4 is RUNNING with tasks queued/running:  1/ 4 | failed/finished:  0/ 5
  ...
  ```
- cds: tenant upgrade now tracks that task progress is still happening. if no progress is detected for 30 minutes, it
  will show the final status for each tenant and fail.

### Added

- uaa: some arguments can be passed in via environment variable instead of the commandline. this behavior is expected
  by Jenkins and Github Actions. for example, the following is now possible:
  ```
  UAA_USERNAME=user UAA_PASSWORD=pass mtx --uaa-user
  ```

### Fixed

- sensitive input arguments are now masked in the running console output

## v0.8.2 - 2024-03-15

### Fixed

- removed npm `postinstall` script

### Changed

- hdi: all accesses to service instances and bindings now filter for the service-plan `hdi-shared`. this change allows
  the service-manager to be used with other services, e.g. `redis-cache`, alongside HANA containers.

## v0.8.1 - 2024-03-05

### Fixed

- uaa: `uaasc`, `uaasp`, `uaasu` error handling and message with passcode url was improved.

### Changed

- reg: improved `regl` and `--registry-update` support for instances with `service` plan. (proposal and provisioning
  support by @andre68723)

## v0.8.0 - 2024-02-20

### Removed

- hdi: `--hdi-migrate-all` command is removed. Instance manager has been deprecated for a while, so migrations to
  service-manager have happened by now.

### Changed

- uaa: `uaas  --uaa-service` command has been renamed to `uaasc  --uaa-service-client`. This fits better with the
  pattern of new commands.

### Added

- uaa: new flexible commands, so that either the regular server or a trusted services can be accessed as a technical
  client, as a user with passcode, or as a user with username and password. (fixes #62 by @soccermax)

  ```
  uaac   --uaa-client [TENANT]                                  obtain uaa token for generic client
  uaap   --uaa-passcode PASSCODE [TENANT]                       obtain uaa token for one-time passcode
  uaau   --uaa-user USERNAME PASSWORD [TENANT]                  obtain uaa token for username password
  uaasc  --uaa-service-client SERVICE [TENANT]                  obtain service token for generic client
  uaasp  --uaa-service-passcode SERVICE PASSCODE [TENANT]       obtain service token for one-time passcode
  uaasu  --uaa-service-user SERVICE USERNAME PASSWORD [TENANT]  obtain service token for username password
  ```

### Fixed

- uaa: fix error with recommended passcode url when credential-type x509 is used. (fixes #59)

## v0.7.17 - 2024-01-24

### Changed

- cds: onboard now supports arbitrary subscription metadata
  https://cap-js-community.github.io/mtx-tool/cap-multitenancy/#onboard-tenant

## v0.7.16 - 2024-01-13

### Added

- srv: new functionality to dump certificates from app server (pr #53) contributed by @kkoile

### Changed

- srv: environment dump now exports VCAP_APPLICATION (pr #55) contributed by @kkoile

## v0.7.15 - 2023-12-21

### Added

- cds: added missing timestamp functionality (fixes #46)

- cds,hdi: allow users to control request concurrency with env variables `MTX_CDS_CONCURRENCY`, `MTX_HDI_CONCURRENCY`

### Changed

- cds,hdi: changed default request concurrency from 5 to 10

## v0.7.14 - 2023-10-20

### Added

- add response time to all logged requests

- reg: enable access for registry instances with `service` plan

### Fixed

- srv: fix debug command for case where uaa is not configured

## v0.7.13 - 2023-08-04

### Added

- reg: optional flag to skip unchanged dependencies for updates (fixes #38)

## v0.7.12 - 2023-07-24

### Added

- out of the box support for deploy with confidence "uuid-versioned" app suffixes (fixes #35)

## v0.7.11 - 2023-07-12

### Fixed

- cds: auto undeploy for mtxs (#34)

- hdi: allow hdi tenantIds to contain forward slash

- uaa: make uaa service token work with user provided services

## v0.7.10 - 2023-03-13

### Added

- reg: enable update subscribe apps' url (fixes #25) contributed by @jiangxin0503

### Fixed

- homogenize single and multi tenant registry calls

- change function signatures to avoid null parameters

- reg: common enum for registry response states

## v0.7.9 - 2023-02-23

### Fixed

- respect uaa-token expiry (fixes #22)

- code cleanup

## v0.7.8 - 2023-02-17

### Fixed

- documented `--force` arg for scripts (relates to #20)

- reg: `--registry-update-all` now retries tenants with previously failed updates

## v0.7.7 - 2023-02-10

### Added

- uaa: expose uaa userinfo (fixes #13)

### Fixed

- hdi: fix access problems for hdi containers with no associated tenant

- srv: allow server-start-debugger to pass an app instance

## v0.7.6 - 2023-02-01

### Added

- first external release

### Fixed

- cds: mtxs cds-upgrade error did not cause a non-zero error code

## v0.7.5 - 2023-01-12

### Added

- cds: support cds-mtxs

### Fixed

- better pagination for cf requests

- reg: support enforced pagination in saas-registry api

## v0.7.4 - 2022-12-14

### Added

- hdi: new command `--hdi-list-relations` to show mapping of service-manager containers to their bindings. makes it
  easy to see if some containers have too many or no binding, or conversely, if some bindings have no container.

- hdi: new command `--hdi-repair-bindings` to harmonize service-manager containers and bindings, so they are 1-to-1

### Fixed

- hdi: add service manager instance information to hdi long list

- hdi: allow `--hdi-rebind-*` to create new bindings with custom parameters

## v0.7.3 - 2022-10-28

### Fixed

- hdi: rebind all tenants with one command

- hdi: hdi list instances and bindings separately

## v0.7.2 - 2022-10-19

### Changed

- rollback required engine to node v14 npm v6.14.
  Note: support for node v14 will end shortly after the official end of life 2023-04-30.

## v0.7.1 - 2022-10-17

### Added

- upgrade required engines to node v16 and npm v8

### Fixed

- cds: fixes cds-upgrade-all bug where number of tenants is below number of app instances

- cds: update docs with tenant upgrade scaling info

## v0.6.2 - 2022-10-13

### Added

- cds: cds-upgrade-all is now spreads the load across app instances

### Fixed

- rework internal error handling

- reorganize some internal reuse functions

## v0.6.1 - 2022-07-01

### Fixed

- hana cloud cannot tunnel warning for combination of `hditt` and port 443

## v0.6.0 - 2022-07-01

### Removed

- various dedicated paas commands for reg/cds/hdi areas have been removed.
  provider subaccount should not be treated specially here.

### Changed

- uaa: combined logically similar commands:
  - `uaap` and `uaas` become `uaac`,
  - `uaac` and `uaasc` become `uaap`

- srv: `srvda` app_instance_id argument is now optional and defaults to zero

### Fixed

- `regl`/`regll`, `cdsl`/`cdsll`, `hdil`/`hdill` all allow filters

- uaa: `uaac` can handle both subdomain and tenant id

- updates for tests and documentation related to new command line interfaces

## v0.5.49 - 2022-06-27

### Fixed

- use cf oauth-token instead of cf curl for better testability

- testing reg/cds/hdi with nock and anonymize playback files

- better status reporting for failed requests

- reg: make registry tenant update serial

- uaa: allow uaa code to handle tenantId

## v0.5.48 - 2022-06-09

### Added

- rename repo to btp-tools-mtx

## v0.5.47 - 2022-05-25

### Added

- cds: switch to manual control of auto undeploy

### Fixed

- cds: handle some tenant upgrade errors better

## v0.5.45 - 2022-05-10

### Fixed

- uaa: allow 32-char passcode length

## v0.5.44 - 2022-03-10

### Fixed

- hdi: bugfix in `hditp` / `hditt` where tunnel is not opened correctly

## v0.5.43 - 2022-03-08

### Fixed

- hdi: work properly with multiple service-bindings to a single (hdi) service-instance

- resilience with respect to missing cfRouteDomain

## v0.5.42 - 2022-01-28

### Added

- support for x509 enabled uaa bindings

- allow readonly commands for apps with `-live` suffix

## v0.5.41 - 2022-01-21

### Added

- hdi: separate hdi tunnel information into runtime and design time user

### Fixed

- better error handling in cf curl

- hdi: missing await for delete hdi tenant with service manager

## v0.5.40 - 2021-11-15

### Fixed

- change order in cf target log to api/org/space

- cds: write cds upgrade buildlog

- hdi: expect service-manager first

- hdi: change order in hdil so that tenant_id is leading and gets sorted

- hdi: enhance hdil with host information for multi-db environments

- srv: bugfix for --server-debug-app

## v0.5.39 - 2021-10-26

### Added

- support for blue-green projects

## v0.5.38 - 2021-10-20

### Added

- switch to minimal engine node 12 for eslint 8

- hdi: new command `--hdi-migrate-all` to migrate hdi containers from instance-manager to service-manager

### Fixed

- hdi: fix tablelist in `hdit*`

## v0.5.37 - 2021-09-01

### Added

- reg: new registry-update-all command

- srv: new server-debug-app command
-
- allow `--force` flag to override danger guard

### Fixed

- reg: add global account id to regl

- tablelist with row numbers by default

## v0.5.36 - 2021-07-12

### Added

- add cds-onboard-tenant

### Fixed

- proper handling when `err.message` is undefined

## v0.5.35 - 2021-06-14

### Added

- server start debugger feature

### Fixed

- uaa tests

- tablelist handles sorting on columns where values are undefined

## v0.5.34 - 2021-05-20

### Added

- allow uaa service-plan broker

- registry-list and hdi-list with optional timestamps (new `--time` flag)

### Fixed

- show cf target with org/space/api before danger-guard

- more user input validation for pass arguments and flag arguments

- extend tests with pass argument consistency validation

## v0.5.33 - 2021-04-28

### Fixed

- hdi: can now rebind hdi-container for credential rotation

## v0.5.32 - 2021-03-30

### Added

- documentation for service manager support

### Fixed

- reg: more relevant information extracted for regl

- bugfix for uaad

## v0.5.31 - 2021-03-11

### Added

- hdi: service-manager support

### Fixed

- uaa: more resilient way to get service tokens

## v0.5.30 - 2021-03-07

### Added

- moved repo to cds-community

## v0.5.29 - 2021-03-04

### Added

- uaa: added saas service token feature

## v0.5.28 - 2020-11-25

### Fixed

- hdi: automatically use next free sid port for hdi tunnel

## v0.5.27 - 2020-11-20

### Added

- reg: added registry update dependencies

### Fixed

- reg: rewrote registry offboard subscription for skipping multiple apps

- spawned subprocesses get cleaned up on SIGINT/SIGTERM

## v0.5.26 - 2020-11-12

### Fixed

- better handling of the case when an app has no route

- better text for hidden passwords

## v0.5.25 - 2020-11-09

### Fixed

- fix regression for buildpack location in CF V3 API

## v0.5.24 - 2020-08-30

### Added

- switch to CAPI v3
  https://v3-apidocs.cloudfoundry.org/version/3.91.0/

### Fixed

- add app-version check to cache

## v0.5.23 - 2020-08-30

### Fixed

- cds: second pass on error-handling for cds-upgrade

## v0.5.22 - 2020-08-30

### Fixed

- mark long-list commands as uncommon

- cds: fix error-handling during cds upgrade polling

## v0.5.21 - 2020-08-22

### Added

- add flagArgs like `--decode` (for `uaa`) and `--reveal` (for `hdi`)

### Fixed

- passwords are now confidential by default

- decrease cache gap to 12 hours to enable a quicker discovery for changes

- show partial outputs for sub-exec failures

## v0.5.20 - 2020-06-03

### Fixed

- cds: more resilient upgrade-tenant

## v0.5.19 - 2020-05-25

### Fixed

- cds: failing upgrade-tenant should cause a non-zero error code

## v0.5.18 - 2020-05-25

### Added

- srv: add command to extract env information

### Fixed

- cds: increase polling time to 20sec

- cds: fix instance for upgrades and use capitalized headers consistently

## v0.5.17 - 2020-05-18

### Added

- srv: add app-instance-index to openTunnel

### Fixed

- srv: get debugPort through /info and add instance information

- srv: better handling of dynamic buildpacks from Github

- srv: better handling for openTunnel without passing appInstanceIndex

## v0.5.16 - 2020-05-15

### Added

- initial release

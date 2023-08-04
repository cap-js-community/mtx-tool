# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

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

- cds: mtxs cds-upgrade error did not cause a non-zero exit code

## v0.7.5 - 2023-01-12

### Added

- cds: support cds-mtxs

### Fixed

- better pagination for cf requests

- reg: support enforced pagination in saas-registry api

## v0.7.4 - 2022-12-14

### Added

- hdi: new command `--hdi-list-relations` to show mapping of service-manager containers to their bindings.
  makes it easy to see if some containers have too many or no binding, or conversely, if some bindings have no container.

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

- cds: failing upgrade-tenant should cause a non-zero errorcode

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

# MTX Tool

[![npm version](https://img.shields.io/npm/v/@cap-js-community/mtx-tool)](https://www.npmjs.com/package/@cap-js-community/mtx-tool)
[![monthly downloads](https://img.shields.io/npm/dm/@cap-js-community/mtx-tool)](https://www.npmjs.com/package/@cap-js-community/mtx-tool)
[![REUSE status](https://api.reuse.software/badge/github.com/cap-js-community/mtx-tool)](https://api.reuse.software/info/github.com/cap-js-community/mtx-tool)
[![Main CI](https://github.com/cap-js-community/mtx-tool/actions/workflows/main-ci.yml/badge.svg)](https://github.com/cap-js-community/mtx-tool/commits/main)

Multitenancy and Extensibility Tool is a cli to reduce operational overhead for multitenant Cloud Foundry applications, particularly in the areas user authentication, tenant registration, CAP multitenancy, and HANA container management.

## Getting Started

**Setup:**

- prerequisite is an installed [CF cli](https://github.com/cloudfoundry/cli) v8 or newer
- `npm install --global @cap-js-community/mtx-tool`
- `mtx --setup`

**Usage:**

- target cf space `cf target -o <my-org> -s <my-space>`
- common tasks:
  - list all subscribed tenants
    `mtx --registry-list`
  - list all HANA HDI containers
    `mtx --hdi-list`
  - run cds schema evolution for all tenants
    `mtx --cds-upgrade-all`
  - update service dependencies for all tenants
    `mtx --registry-update-all`
  - list cds tenants
    `mtx --cds-list`
  - debug running app
    `mtx --server-debug <my-app>`

We recommend running the tool via `npx`:

```bash
# ad-hoc
npx @cap-js-community/mtx-tool
# ad-hoc with fixed version, e.g. for stable pipelines
npx @cap-js-community/mtx-tool@0.10.0
```

Alternatively, the tool can be installed either globally or locally for a specific project.

```bash
# globally
npm install --global @cap-js-community/mtx-tool
# project local
npm install --save-dev @cap-js-community/mtx-tool
```

## Documentation

Head over to our [Documentation](https://cap-js-community.github.io/mtx-tool/) to learn more.

## Support, Feedback, Contributing

This project is open to feature requests/suggestions, bug reports etc. via [GitHub issues](https://github.com/cap-js-community/mtx-tool/issues). Contribution and feedback are encouraged and always welcome. For more information about how to contribute, the project structure, as well as additional contribution information, see our [Contribution Guidelines](CONTRIBUTING.md).

## Code of Conduct

We as members, contributors, and leaders pledge to make participation in our community a harassment-free experience for everyone. By participating in this project, you agree to abide by its [Code of Conduct](CODE_OF_CONDUCT.md) at all times.

## Licensing

Copyright 2023 SAP SE or an SAP affiliate company and mtx-tool contributors. Please see our [LICENSE](LICENSE) for copyright and license information. Detailed information including third-party components and their licensing/copyright information is available [via the REUSE tool](https://api.reuse.software/info/github.com/cap-js-community/mtx-tool).

# Nock Record and Playback Testing

Recorded HTTP interactions for the playback tests under `test/submodules/`.

The "record" suite here talks to real upstream services (CF API, service-manager, saas-registry, ...) and saves each HTTP call to `__nock-fixtures__/<fixture>.json`. The "playback" suite under `test/submodules/` re-uses those fixtures via `nock.back` in `lockdown` mode, so the main test suite is fully offline and deterministic.

This README documents how the two halves fit together and the project-specific bits that aren't standard nock.

## Layout

```
test-nock-record/
  __nock-fixtures__/         per-test recorded interactions
    <fixture>.json           one file per recording test
    shared/                  canonical copies of payloads
  __snapshots__/             jest snapshots for the recording tests
  util/
    anonymizeAndTrim.js      record-side post-processor (afterRecord hook)
    sharedFixtures.js        $nockRef collapse/expand + playback `before` hook
  <area>.nock.test.js        recording tests (run on demand, not in CI)
```

Playback tests live under `test/submodules/<area>.nock.test.js` and read fixtures from the path above.

## Recording vs playback

|                          | Recording                                | Playback                       |
| ------------------------ | ---------------------------------------- | ------------------------------ |
| Jest config              | `jest-nock-record.config.js`             | `jest.config.js`               |
| `nock.back.setMode(...)` | `"update"` (writes fresh fixtures)       | `"lockdown"` (no real network) |
| Entrypoint               | `npm run test:record[:area[:case]]`      | `npm test` (default jest run)  |
| Needs CF login           | Yes — uses your real `~/.cf/config.json` | No                             |

Recording rewrites the fixture every time, so a recording run is destructive. CI only runs playback.

## The `$nockRef` mechanism

The CF API forces every fixture that touches an app to also pull the full `/v3/service_plans?include=service_offering` catalogue. That payload is ~510 KB and is semantically identical across every fixture in the suite. Storing it 27 times is wasteful, so we factor it out:

1. On record, `anonymizeAndTrim` (the `afterRecord` hook) trims the catalogue down to the fields the production code actually reads (`guid`, `name`, the `service_offering` relationship), then runs `collapseSharedRefs` to replace the trimmed paged calls with a single sentinel entry:

   ```json
   { "$nockRef": "service_plans" }
   ```

   The first time this happens for a new shared key, the canonical payload is written to `__nock-fixtures__/shared/<key>.json`; subsequent records reuse it.

2. On playback, the test passes `before: beforeExpandSharedRefs` to `nock.back`. The hook walks the loaded defs, swaps every `$nockRef` stub back for the full set of calls in `shared/<key>.json`, and lets nock build interceptors from the result.

Adding more shared payloads is a matter of dropping a new entry into `SHARED_ENTRIES` in `util/sharedFixtures.js`. Anything matched by `match(call)` gets collapsed; multi-call entries (`isMultiCall: true`) collapse all paged calls into a single sentinel.

## Anonymization

`util/anonymizeAndTrim.js` strips credentials, hostnames, GUIDs that leak account info, etc. before the fixture lands on disk. It is hooked into every recording test via:

```js
const { nockDone } = await nock.back("foo.json", { afterRecord: anonymizeAndTrim });
```

It dispatches on `(scope, path)` patterns and throws on an unmatched scope so that new upstream calls can't silently leak into a recording. When adding a new endpoint, extend the pattern table at the bottom of `anonymizeAndTrim.js`.

The same module also applies semantic trims (e.g. the service_plans field reduction) before the $nockRef collapse step.

## Playback recipe

Every `<area>.nock.test.js` under `test/submodules/` does the same three things:

```js
const nock = require("nock");
const { beforeExpandSharedRefs } = require("../../test-nock-record/util/sharedFixtures");

nock.back.fixtures = pathlib.resolve(`${__dirname}/../../test-nock-record/__nock-fixtures__`);
nock.back.setMode("lockdown");

// inside each test:
await nock.back("foo.json", { before: beforeExpandSharedRefs });
```

The `before` hook is explicit at every call site — there is no module-level monkey-patching of `nock.back`. Pass extra options inline if a test needs them.

## Re-recording

```bash
npm run test:record              # everything
npm run test:record:reg          # just the saas-registry recordings
```

Recording requires:

- a logged-in `cf` session (`cf login`) pointing at the canary org used by these tests
- network access to the CF API + the saas services backing this app

After recording, run the playback suite (`npm test`) to confirm the fixtures still drive the production code paths correctly.

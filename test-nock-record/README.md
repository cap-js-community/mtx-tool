# Nock Record and Playback Testing

Recorded HTTP interactions for the playback tests under `test/submodules/`.

The "record" suite here talks to real upstream services (CF API, service-manager, saas-registry, ...) and saves each HTTP call to `__nock-fixtures__/<fixture>.json`. The "playback" suite under `test/submodules/` re-uses those fixtures via `nock.back` in `lockdown` mode, so the main test suite is fully offline and deterministic.

This README documents how the two halves fit together and the project-specific bits that aren't standard nock.

## Layout

```
test-nock-record/
  __nock-fixtures__/         per-test recorded interactions
    <fixture>.json           one file per recording test
    shared/<key>.json        canonical copies of payloads shared across fixtures
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

Some upstream responses are large and repeat across many fixtures. The clearest example: every test that touches an app pulls the full CF `/v3/service_plans?include=service_offering` catalogue (3 pages, ~510 KB after anonymization) via `_cfServiceInfoMaps` in `src/context.js`. Storing it once per fixture is wasteful, so we factor it out:

1. On record, `anonymizeAndTrim` (the `afterRecord` hook) first trims known-large payloads down to the fields production code actually reads (e.g. service_plans → `guid`, `name`, the `service_offering` relationship), then runs `collapseSharedRefs`. That replaces each **contiguous run** of calls matching a `SHARED_ENTRIES` entry with a single sentinel at the position the run began:

   ```json
   { "$nockRef": "service_plans" }
   ```

   A later, non-contiguous match becomes its own sentinel, so the order of unmatched calls relative to the sentinel positions is preserved.

   The canonical payload for each `<key>` lives at `__nock-fixtures__/shared/<key>.json` and is a plain array of nock-defs — same shape as a per-test fixture.

2. On playback, the test passes `before: beforeExpandSharedRefs` to `nock.back`. The hook walks the loaded defs, swaps every `$nockRef` stub back for the full set of calls in `shared/<key>.json`, and lets nock build interceptors from the result.

Adding more shared payloads is a matter of dropping a new entry into `SHARED_ENTRIES` in `util/sharedFixtures.js`. Each entry has just two fields: `key` (filename stem) and `matcher(call)` (returns true for calls that should be lifted out).

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

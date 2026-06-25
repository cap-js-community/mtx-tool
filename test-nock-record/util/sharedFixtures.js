"use strict";

// Shared nock-fixture library.
//
// Some upstream calls are
// semantically identical across nearly all fixture files. Storing the same
// large payload bloats the repo for no
// reason. Instead, we store one canonical copy in __nock-fixtures__/shared/<ref>.json
// and reference it from per-test fixtures with a top-level sentinel call:
//
//   { "$nockRef": "cf-service-plans", "count": 3, "repetition": 1 }
//
// `count` is the length of the canonical sequence stored in shared/<ref>.json.
// `repetition` is how many times that sequence appeared contiguously in the
// original recording. The subsequence the sentinel stands for has length
// `count * repetition`.
//
// When a shared resource exists in several variants (e.g. one binding-list per
// CF app), the sentinel `<ref>` is built as `<key>--<variant>`, which maps to
// `shared/<key>--<variant>.json`:
//
//   { "$nockRef": "cf-binding-list--<app_guid>", "count": 1, "repetition": 2 }
//
// On record:  collapseSharedRefs(calls) replaces matching runs with sentinels.
// On replay:  expandSharedRefs(defs) re-inflates sentinels back into full defs.
//
// A SHARED_ENTRIES entry describes one shared sequence of upstream calls:
//   - key:           filename prefix; the ref is `<key>` or `<key>--<variant>`
//   - matcher(call): returns true if a recorded call belongs to this resource
//   - variant(call): (optional) returns a string identifying which variant of
//                    the resource this call represents
//
// Every shared json file has the same shape: a flat array of recorded nock-defs
// — the same shape as a per-test fixture, holding the calls that were lifted
// out.

const pathlib = require("path");
const fs = require("fs");

const SHARED_DIR = pathlib.resolve(__dirname, "..", "__nock-fixtures__", "shared");
const NOCK_REF_KEY = "$nockRef";
const VARIANT_SEPARATOR = "--";

const _CF_API_SCOPE = /https:\/\/api\.cf\.[a-z]+\.hana\.ondemand\.com:443/;
const _CF_SERVICE_PLANS_PATH = /^\/v3\/service_plans(\?|$)/;
const _CF_APPS_LIST_PATH = /^\/v3\/apps\?space_guids=/;
const _CF_BINDING_LIST_PATH = /^\/v3\/service_credential_bindings\?app_guids=([0-9a-f-]+)/;

const SHARED_ENTRIES = [
  {
    key: "cf-service-plans",
    matcher: (call) =>
      _CF_API_SCOPE.test(call.scope) && call.method === "GET" && _CF_SERVICE_PLANS_PATH.test(call.path),
  },
  {
    key: "cf-apps-list",
    matcher: (call) => _CF_API_SCOPE.test(call.scope) && call.method === "GET" && _CF_APPS_LIST_PATH.test(call.path),
  },
  {
    key: "cf-binding-list",
    matcher: (call) => _CF_API_SCOPE.test(call.scope) && call.method === "GET" && _CF_BINDING_LIST_PATH.test(call.path),
    variant: (call) => call.path.match(_CF_BINDING_LIST_PATH)[1],
  },
];

const _refOf = (entry, call) => (entry.variant ? `${entry.key}${VARIANT_SEPARATOR}${entry.variant(call)}` : entry.key);

const _sharedCache = new Map();

const _readShared = (ref) => {
  if (!_sharedCache.has(ref)) {
    const file = pathlib.join(SHARED_DIR, `${ref}.json`);
    _sharedCache.set(ref, JSON.parse(fs.readFileSync(file, "utf8")));
  }
  return _sharedCache.get(ref);
};

const _writeShared = (ref, calls) => {
  fs.mkdirSync(SHARED_DIR, { recursive: true });
  const file = pathlib.join(SHARED_DIR, `${ref}.json`);
  fs.writeFileSync(file, JSON.stringify(calls, null, 4) + "\n");
};

// Replace matching call(s) in a recorded fixture with $nockRef sentinel(s).
// Only contiguous runs of matches collapse: a run of consecutive calls sharing
// the same ref is folded into one sentinel. The sentinel records `count` (the
// length of the canonical shared sequence) and `repetition` (how many times
// that sequence appeared back-to-back in the recording). A later, non-contiguous
// match becomes its own sentinel, so the overall order of unmatched calls
// relative to sentinel positions is preserved.
//
// The shared file for every encountered ref must already exist on disk — this
// step does not write it. The run length must be a positive integer multiple
// of the canonical length, otherwise the recording disagrees with the shared
// library and we throw.
const collapseSharedRefs = (calls) => {
  const result = [];
  let pendingRef = null;
  let pendingRun = [];
  const flushPending = () => {
    if (pendingRef === null) {
      return;
    }
    const canonical = _readShared(pendingRef);
    if (pendingRun.length % canonical.length !== 0) {
      throw new Error(
        `$nockRef "${pendingRef}": recorded run of ${pendingRun.length} call(s) is not a multiple of ` +
          `the canonical shared sequence (${canonical.length} call(s))`
      );
    }
    result.push({
      [NOCK_REF_KEY]: pendingRef,
      count: canonical.length,
      repetition: pendingRun.length / canonical.length,
    });
    pendingRef = null;
    pendingRun = [];
  };
  for (const call of calls) {
    const entry = SHARED_ENTRIES.find((e) => e.matcher(call));
    const ref = entry ? _refOf(entry, call) : null;
    if (ref !== null && ref === pendingRef) {
      pendingRun.push(call);
      continue;
    }
    flushPending();
    if (ref !== null) {
      pendingRef = ref;
      pendingRun = [call];
    } else {
      result.push(call);
    }
  }
  flushPending();
  return result;
};

// Inverse of collapseSharedRefs: walk loaded defs and re-inflate sentinels.
// `count` must equal the shared array's length; the canonical sequence is
// replayed `repetition` times.
const expandSharedRefs = (defs) =>
  defs.reduce((acc, def) => {
    if (def && typeof def === "object" && Object.prototype.hasOwnProperty.call(def, NOCK_REF_KEY)) {
      const ref = def[NOCK_REF_KEY];
      const calls = _readShared(ref);
      const { count, repetition } = def;
      if (count !== calls.length) {
        throw new Error(
          `$nockRef "${ref}" sentinel declares count=${count} but shared file holds ${calls.length} call(s)`
        );
      }
      if (!Number.isInteger(repetition) || repetition <= 0) {
        throw new Error(`$nockRef "${ref}" sentinel has invalid repetition=${repetition} (must be a positive integer)`);
      }
      for (let i = 0; i < repetition; i++) {
        acc = acc.concat(calls);
      }
    } else {
      acc.push(def);
    }
    return acc;
  }, []);

// Hook usable directly as nock.back({ before }).
// We change defs in-place here.
const beforeExpandSharedRefs = (_def, _index, defs) => {
  if (defs?.__sharedExpanded) {
    return;
  }
  const expanded = expandSharedRefs(defs);
  defs.length = 0;
  for (const d of expanded) {
    defs.push(d);
  }
  Object.defineProperty(defs, "__sharedExpanded", { value: true });
};

module.exports = {
  SHARED_DIR,
  NOCK_REF_KEY,
  VARIANT_SEPARATOR,
  SHARED_ENTRIES,
  collapseSharedRefs,
  expandSharedRefs,
  beforeExpandSharedRefs,
  _: {
    _readShared,
    _writeShared,
  },
};

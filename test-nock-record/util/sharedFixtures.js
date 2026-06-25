"use strict";

// Shared nock-fixture library.
//
// Some upstream calls are
// semantically identical across nearly all fixture files. Storing the same
// large payload bloats the repo for no
// reason. Instead, we store one canonical copy in __nock-fixtures__/shared/<ref>.json
// and reference it from per-test fixtures with a top-level sentinel call:
//
//   { "$nockRef": "cf-service-plans" }
//
// When a shared resource exists in several variants (e.g. one binding-list per
// CF app), the sentinel `<ref>` is built as `<key>--<variant>`, which maps to
// `shared/<key>--<variant>.json`:
//
//   { "$nockRef": "cf-binding-list--<app_guid>" }
//
// The sentinel replaces a contiguous run of matching calls in the recorded
// fixture; on replay it re-expands to the full set of calls from shared/.
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
// the same entry (and, if `variant` is set, the same variant) is folded into
// one sentinel at the position where the run began. The sentinel records
// `count` when the run had more than one call so playback can reinflate the
// exact request stream. A later, non-contiguous match becomes its own sentinel,
// so the overall order of unmatched calls relative to sentinel positions is
// preserved.
const collapseSharedRefs = (calls) => {
  const result = [];
  let prevRef = null;
  for (const call of calls) {
    const entry = SHARED_ENTRIES.find((e) => e.matcher(call));
    if (!entry) {
      result.push(call);
      prevRef = null;
      continue;
    }
    const ref = _refOf(entry, call);
    if (ref === prevRef) {
      // extend the current run by bumping the count on the most recent sentinel
      const sentinel = result[result.length - 1];
      sentinel.count = (sentinel.count || 1) + 1;
      continue;
    }
    result.push({ [NOCK_REF_KEY]: ref });
    prevRef = ref;
  }
  return result;
};

// Inverse of collapseSharedRefs: walk loaded defs and re-inflate sentinels.
const expandSharedRefs = (defs) =>
  defs.reduce((acc, def) => {
    if (def && typeof def === "object" && Object.prototype.hasOwnProperty.call(def, NOCK_REF_KEY)) {
      const calls = _readShared(def[NOCK_REF_KEY]);
      const count = def.count || 1;
      for (let i = 0; i < count; i++) {
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

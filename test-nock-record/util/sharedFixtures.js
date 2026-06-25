"use strict";

// Shared nock-fixture library.
//
// Some upstream responses (notably the full CF /v3/service_plans catalogue,
// pulled in for every test by _cfServiceInfoMaps in src/context.js) are
// semantically identical across nearly all fixture files. Storing the same
// large payload 28 times in __nock-fixtures__/*.json bloats the repo for no
// reason. Instead we store one canonical copy in __nock-fixtures__/shared/<key>.json
// and reference it from per-test fixtures with a tiny sentinel response:
//
//   { "response": { "$nockRef": "service_plans" } }
//
// On record:  collapseSharedRefs(calls) replaces matching calls with sentinels.
// On replay:  expandSharedRefs(defs) re-inflates sentinels back into full defs
//             before nock.define turns them into interceptors.
//
// A "shared entry" describes one logical upstream resource:
//   - key:      filename stem under __nock-fixtures__/shared/<key>.json
//   - match(call): true if this call corresponds to that resource
//   - expand(stubCall, sharedEntries): produces the full call(s) to register;
//                                      returns a single call OR an array (some
//                                      resources are paged and one stub stands
//                                      in for multiple defs).
//
// The shared json file format is whatever expand() can consume — typically the
// raw recorded call(s) themselves, so the on-disk representation is just the
// nock-defs that were lifted out.

const pathlib = require("path");
const fs = require("fs");

const SHARED_DIR = pathlib.resolve(__dirname, "..", "__nock-fixtures__", "shared");
const NOCK_REF_KEY = "$nockRef";

const _isServicePlansCall = (call) =>
  /https:\/\/api\.cf\.[a-z]+\.hana\.ondemand\.com:443/.test(call.scope) &&
  call.method === "GET" &&
  /^\/v3\/service_plans(\?|$)/.test(call.path);

// One entry per logical shared resource.
// For each entry, calls matched by `match` are lifted out of per-test fixtures
// into a canonical copy at __nock-fixtures__/shared/<key>.json and replaced
// in-place with a sentinel `{ "$nockRef": <key> }`.
const SHARED_ENTRIES = [
  {
    key: "service_plans",
    matcher: _isServicePlansCall,
  },
];

const _readShared = (key) => {
  const file = pathlib.join(SHARED_DIR, `${key}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
};

const _writeShared = (key, calls) => {
  fs.mkdirSync(SHARED_DIR, { recursive: true });
  const file = pathlib.join(SHARED_DIR, `${key}.json`);
  fs.writeFileSync(file, JSON.stringify(calls, null, 4) + "\n");
};

// Replace matching call(s) in a recorded fixture with $nockRef sentinel(s).
// Only contiguous runs of matches collapse: a run of consecutive calls matching
// the same shared entry is folded into one sentinel at the position where the
// run began. A later, non-contiguous match becomes its own sentinel, so the
// overall order of unmatched calls relative to the sentinel positions is
// preserved.
const collapseSharedRefs = (calls) => {
  const result = [];
  let prevEntry = null;
  for (const call of calls) {
    const entry = SHARED_ENTRIES.find((e) => e.matcher(call));
    if (!entry) {
      result.push(call);
      prevEntry = null;
      continue;
    }
    if (entry === prevEntry) {
      continue; // drop trailing matches in the same contiguous run
    }
    result.push({ [NOCK_REF_KEY]: entry.key });
    prevEntry = entry;
  }
  return result;
};

// Inverse of collapseSharedRefs: walk loaded defs and re-inflate sentinels.
const expandSharedRefs = (defs) =>
  defs.reduce((acc, def) => {
    if (def && typeof def === "object" && Object.prototype.hasOwnProperty.call(def, NOCK_REF_KEY)) {
      acc = acc.concat(_readShared(def[NOCK_REF_KEY]));
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
  SHARED_ENTRIES,
  collapseSharedRefs,
  expandSharedRefs,
  beforeExpandSharedRefs,
  _: {
    _readShared,
    _writeShared,
  },
};

"use strict";
const { pathToFileURL } = require("url");
const path = require("path");

// node-fetch v3 is ESM-only. jest 30's synchronous require(ESM) needs Node >=24.9, so on
// Node 20 we lazy-import the real module and expose a CJS wrapper with fetch's signature.
// Resolve the real entry by file URL so jest's moduleNameMapper (^node-fetch$) does not
// re-map this import back to the shim.
// TODO: remove this shim and the moduleNameMapper entry once tests run on Node >=24.9.
const realEntry = path.join(__dirname, "..", "..", "node_modules", "node-fetch", "src", "index.js");
const realUrl = pathToFileURL(realEntry).href;

let _fetchPromise;
const fetchlib = (...args) => {
  _fetchPromise ??= import(realUrl).then((m) => m.default);
  return _fetchPromise.then((fetch) => fetch(...args));
};

module.exports = { default: fetchlib };

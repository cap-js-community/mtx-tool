"use strict";

const urllib = require("url");
const fetchlib = require("node-fetch");

const fetch = async ({
  // https://nodejs.org/docs/latest-v10.x/api/url.html
  url,
  protocol,
  host,
  hostname,
  path,
  pathname,
  search,
  query,
  hash,
  // https://github.com/node-fetch/node-fetch#options
  method,
  headers,
  body,
  redirect,
  agent,
  // custom
  auth,
  logged = true,
  checkStatus = true,
}) => {
  if (path && !pathname && !search) {
    const searchIndex = path.indexOf("?");
    if (searchIndex === -1) {
      pathname = path;
    } else {
      pathname = path.slice(0, searchIndex);
      search = path.slice(searchIndex);
    }
  }
  const _url = urllib.format({
    ...urllib.parse(url),
    ...(protocol && { protocol }),
    ...(host && { host }),
    ...(hostname && { hostname }),
    ...(pathname && { pathname }),
    ...(search && { search }),
    ...(query && { query }),
    ...(hash && { hash }),
  });
  const _basicAuthHeader =
    auth &&
    Object.prototype.hasOwnProperty.call(auth, "username") &&
    Object.prototype.hasOwnProperty.call(auth, "password")
      ? "Basic " + Buffer.from(auth.username + ":" + auth.password).toString("base64")
      : null;
  const _bearerAuthHeader = auth && Object.prototype.hasOwnProperty.call(auth, "token") ? "Bearer " + auth.token : null;
  const _authHeader = _basicAuthHeader || _bearerAuthHeader;
  const _method = method || "GET";
  const startTime = Date.now();
  const response = await fetchlib(_url, {
    method: _method,
    headers: {
      ...headers,
      ...(_authHeader && { Authorization: _authHeader }),
    },
    ...(agent && { agent }),
    ...(body && { body }),
    ...(redirect && { redirect }),
  });
  if (logged) {
    console.log(`${_method} ${_url} ${response.status} ${response.statusText} (${Date.now() - startTime}ms)`);
  }
  if (checkStatus) {
    if (!response.ok) {
      throw new Error(`got bad response ${response.status} from ${_url}\n${await response.text()}`);
    }
  }
  return response;
};

module.exports = fetch;

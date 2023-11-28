"use strict";

const urllib = require("url");

const { sleep } = require("./static");
const { fail } = require("./error");

const _request = async ({
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
  // https://developer.mozilla.org/en-US/docs/Web/API/fetch
  method,
  headers,
  body,
  redirect,
  dispatcher,
  // custom
  auth,
  agent, // legacy alias for dispatcher
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

  const _dispatcher = dispatcher || agent;

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
  const response = await fetch(_url, {
    method: _method,
    headers: {
      ...headers,
      ...(_authHeader && { Authorization: _authHeader }),
    },
    ...(_dispatcher && { dispatcher: _dispatcher }),
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

const request = async (options) => {
  try {
    return await _request(options);
  } catch (err) {
    fail(err.message);
  }
};

const requestTry = async (options) => {
  try {
    return await _request(options);
  } catch (err) {
    console.error(err.message);
    return null;
  }
};

const requestRetry = async (options, tries = 10, timeout = 3000) => {
  for (let i = 0; i < tries; i++) {
    try {
      return await _request(options);
    } catch (err) {
      console.error(err.message);
      await sleep(timeout);
    }
  }
  return null;
};

module.exports = {
  request,
  requestTry,
  requestRetry,
};

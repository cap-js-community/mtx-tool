"use strict";

const urllib = require("url");
const fetchlib = require("node-fetch");

const { sleep } = require("./static");
const { fail } = require("./error");

const TOO_MANY_POLL_FREQUENCIES = [6000, 120000, 24000, 48000]; // SUM = 90000
const STOP_SLEEPING_TIME = -1;
const SLEEP_TIMES = [].concat(TOO_MANY_POLL_FREQUENCIES, [STOP_SLEEPING_TIME]); // -1 is to stop sleeping

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
  const _options = {
    method: _method,
    headers: {
      ...headers,
      ...(_authHeader && { Authorization: _authHeader }),
    },
    ...(agent && { agent }),
    ...(body && { body }),
    ...(redirect && { redirect }),
  };

  let response;
  for (const sleepTime of SLEEP_TIMES) {
    const startTime = Date.now();
    response = await fetchlib(_url, _options);
    if (response.status !== 429 || sleepTime === STOP_SLEEPING_TIME) {
      if (logged) {
        console.log(`${_method} ${_url} ${response.status} ${response.statusText} (${Date.now() - startTime}ms)`);
      }
      break;
    }
    if (logged) {
      console.log(
        `${_method} ${_url} ${response.status} ${response.statusText} (${Date.now() - startTime}ms) retrying in ${sleepTime / 1000}sec`
      );
    }
    await sleep(sleepTime);
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

module.exports = {
  request,
};

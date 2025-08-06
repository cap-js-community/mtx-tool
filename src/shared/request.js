"use strict";

const urllib = require("url");
const fetchlib = require("node-fetch");
const crypto = require("crypto");

const { sleep } = require("./static");
const { fail } = require("./error");
const { Logger } = require("./logger");

const HTTP_TOO_MANY_REQUESTS = 429;
// NOTE: These times add up to 90sec in total and give an exponential falloff
const RETRY_POLL_FREQUENCIES = [6000, 12000, 24000, 48000];
const RETRY_STOP_MARKER = -1;
const RETRY_SLEEP_TIMES = [].concat(RETRY_POLL_FREQUENCIES, [RETRY_STOP_MARKER]);

const ENV = Object.freeze({
  CORRELATION: "MTX_CORRELATION",
});

const HEADER = Object.freeze({
  CORRELATION_ID_CAMEL_CASE: "X-CorrelationId",
  CORRELATION_ID: "X-Correlation-Id",
  REQUEST_ID: "X-Request-Id",
  VCAP_REQUEST_ID: "X-Vcap-Request-Id",
});

const CORRELATION_HEADERS_RECEIVER_PRECEDENCE = [
  HEADER.CORRELATION_ID_CAMEL_CASE,
  HEADER.CORRELATION_ID,
  HEADER.REQUEST_ID,
  HEADER.VCAP_REQUEST_ID,
];

const RETRY_MODE = Object.freeze({
  OFF: "OFF",
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS", // 429
  ALL_SERVER_ERROR: "ALL_SERVER_ERROR", // 5xx
  ALL_FAILED: "ALL_FAILED", // >= 400
});

const logger = Logger.getInstance();

const _doStopRetry = (mode, response) => {
  switch (mode) {
    case RETRY_MODE.OFF:
      return true;
    case RETRY_MODE.TOO_MANY_REQUESTS:
      return response.status !== HTTP_TOO_MANY_REQUESTS;
    case RETRY_MODE.ALL_FAILED:
      return response.ok;
    default:
      throw new Error("unknown retry mode");
  }
};

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
  retryMode = RETRY_MODE.TOO_MANY_REQUESTS,
  showCorrelation = process.env[ENV.CORRELATION],
  correlationId = crypto.randomUUID(),
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
      [HEADER.CORRELATION_ID_CAMEL_CASE]: correlationId,
      [HEADER.CORRELATION_ID]: correlationId,
    },
    ...(agent && { agent }),
    ...(body && { body }),
    ...(redirect && { redirect }),
  };

  let response;
  for (const sleepTime of RETRY_SLEEP_TIMES) {
    const startTime = Date.now();
    response = await fetchlib(_url, _options);
    const responseTime = Date.now() - startTime;
    const doStopRetry = sleepTime === RETRY_STOP_MARKER || _doStopRetry(retryMode, response);
    if (logged) {
      const correlationHeader = CORRELATION_HEADERS_RECEIVER_PRECEDENCE.find((header) => response.headers.has(header));
      const logParts = [
        `${_method} ${_url} ${response.status} ${response.statusText}`,
        ...(showCorrelation
          ? [`(${responseTime}ms, ${correlationHeader}: ${response.headers.get(correlationHeader)})`]
          : [`(${responseTime}ms)`]),
        ...(doStopRetry ? [] : [`retrying in ${sleepTime / 1000}sec`]),
      ];
      logger.info(logParts.join(" "));
    }
    if (doStopRetry) {
      break;
    }
    await sleep(sleepTime);
  }

  if (checkStatus && !response.ok) {
    throw new Error(`got bad response ${response.status} from ${_url}\n${await response.text()}`);
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
  RETRY_MODE,
  request,
};

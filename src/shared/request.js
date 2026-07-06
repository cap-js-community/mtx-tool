"use strict";

const fetchlib = require("node-fetch");
const crypto = require("crypto");

const { sleep } = require("./static");
const { fail } = require("./error");
const { Logger } = require("./logger");

const HTTP_TOO_MANY_REQUESTS = 429;
// NOTE: With 5 attempts and 6sec base, the times add up to 90sec in total.
//   the final attempt is always stopped and does not add the associated sleep time.
const RETRY_SLEEP_BASE = 6000;
const RETRY_MAX_ATTEMPTS = 5;
const RETRY_AFTER_HEADER = "Retry-After";
// NOTE: cap Retry-After to keep a misbehaving server from stalling us indefinitely
const RETRY_AFTER_MAX_MS = 5 * 60 * 1000;

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

// TODO: most 4xx responses should not trigger retries
const RETRY_MODE = Object.freeze({
  OFF: "OFF",
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS", // 429
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

const _retryFixedSleepTime = (attempt) => RETRY_SLEEP_BASE * Math.pow(2, attempt);

// Parse a Retry-After header value per RFC 9110 / MDN: either a non-negative integer
// number of seconds (delta-seconds), or an HTTP-date. Returns milliseconds to wait,
// or null when absent, malformed, non-positive, or beyond RETRY_AFTER_MAX_MS.
const _parseRetryAfter = (headerValue, nowMs = Date.now()) => {
  if (typeof headerValue !== "string") {
    return null;
  }
  const trimmed = headerValue.trim();
  if (!trimmed) {
    return null;
  }
  let waitMs;
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return null;
    }
    waitMs = seconds * 1000;
  } else {
    const dateMs = Date.parse(trimmed);
    if (!Number.isFinite(dateMs)) {
      return null;
    }
    waitMs = dateMs - nowMs;
    if (waitMs <= 0) {
      return null;
    }
  }
  return Math.min(waitMs, RETRY_AFTER_MAX_MS);
};

const _getRetryHeaderSleepTime = (response) => _parseRetryAfter(response.headers?.get?.(RETRY_AFTER_HEADER));

class LogRequestId {
  static #id = 0;

  static next() {
    return ++this.#id < 100 ? ("0" + this.#id).slice(-2) : String(this.#id);
  }

  static reset() {
    this.#id = 0;
  }
}

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

  const _url = new URL(url || "http://localhost");
  if (protocol) {
    _url.protocol = protocol;
  }
  if (host) {
    _url.host = host;
  }
  if (hostname) {
    _url.hostname = hostname;
  }
  if (pathname) {
    _url.pathname = pathname;
  }
  if (search) {
    _url.search = search;
  }
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      _url.searchParams.set(key, value);
    }
  }
  if (hash) {
    _url.hash = hash;
  }

  const _basicAuthHeader =
    auth &&
    Object.prototype.hasOwnProperty.call(auth, "username") &&
    Object.prototype.hasOwnProperty.call(auth, "password")
      ? "Basic " + Buffer.from(auth.username + ":" + auth.password).toString("base64")
      : null;
  const _bearerAuthHeader = auth && Object.prototype.hasOwnProperty.call(auth, "token") ? "Bearer " + auth.token : null;
  const _authHeader = _basicAuthHeader || _bearerAuthHeader;
  const _method = method || "GET";
  const _correlationId = _method !== "GET" && crypto.randomUUID();
  const _correlationHeaders = _method !== "GET" && {
    [HEADER.CORRELATION_ID_CAMEL_CASE]: _correlationId,
    [HEADER.CORRELATION_ID]: _correlationId,
  };
  const _options = {
    method: _method,
    headers: {
      ...headers,
      ..._correlationHeaders,
      ...(_authHeader && { Authorization: _authHeader }),
    },
    ...(agent && { agent }),
    ...(body && { body }),
    ...(redirect && { redirect }),
  };

  let response;
  let logRequestId;
  for (let attempt = 0; attempt < RETRY_MAX_ATTEMPTS; attempt++) {
    const startTime = Date.now();
    response = await fetchlib(_url, _options);
    const responseTime = Date.now() - startTime;

    const isLastAttempt = attempt === RETRY_MAX_ATTEMPTS - 1;
    const doStopRetry = _doStopRetry(retryMode, response) || isLastAttempt;
    const retryHeaderSleepTime = doStopRetry ? null : _getRetryHeaderSleepTime(response);
    const retryFixedSleepTime = doStopRetry ? null : _retryFixedSleepTime(attempt);
    const sleepTime = retryHeaderSleepTime ?? retryFixedSleepTime;
    if (logged) {
      const doLogAttempt = attempt > 0 || !doStopRetry;
      const correlationHeader = CORRELATION_HEADERS_RECEIVER_PRECEDENCE.find((header) => response.headers.has(header));
      logRequestId ??= doLogAttempt && LogRequestId.next();
      const retryLogPart = doStopRetry
        ? []
        : [
            retryHeaderSleepTime !== null
              ? `retrying in ${sleepTime / 1000}sec (Retry-After)`
              : `retrying in ${sleepTime / 1000}sec`,
          ];
      const logParts = [
        ...(doLogAttempt ? [`[req-${logRequestId} ${attempt + 1}/${RETRY_MAX_ATTEMPTS}]`] : []),
        `${_method} ${decodeURI(_url.href)} ${response.status} ${response.statusText}`,
        ...(showCorrelation
          ? [`(${responseTime}ms, ${correlationHeader}: ${response.headers.get(correlationHeader)})`]
          : [`(${responseTime}ms)`]),
        ...retryLogPart,
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
  _: {
    LogRequestId,
    _parseRetryAfter,
  },
};

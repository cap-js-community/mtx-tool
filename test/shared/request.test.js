"use strict";

jest.mock("crypto", () => require("../__mocks/shared/crypto"));
const mockFetchLib = require("node-fetch");
jest.mock("node-fetch", () => jest.fn());

const { Logger: MockLogger } = require("../../src/shared/logger");
const mockLogger = MockLogger.getInstance();
jest.mock("../../src/shared/logger", () => require("../__mocks/shared/logger"));

const mockStatic = require("../../src/shared/static");
jest.mock("../../src/shared/static", () => ({
  sleep: jest.fn(),
}));

const {
  request,
  RETRY_MODE,
  _: { LogRequestId, _parseRetryAfter },
} = require("../../src/shared/request");

const { outputFromLogger, MockHeaders } = require("../test-util/static");

const baseOkResponse = {
  headers: new MockHeaders(),
  ok: true,
  status: 200,
  statusText: "OK",
};

const baseBadRequestResponse = {
  headers: new MockHeaders(),
  ok: false,
  status: 400,
  statusText: "Bad Request",
  text() {
    return "failure reason";
  },
};

const baseTooManyRequestsResponse = {
  headers: new MockHeaders(),
  ok: false,
  status: 429,
  statusText: "Too Many Requests",
  text() {
    return "too many requests";
  },
};

const outputFromLoggerWithTimestamps = (calls) => outputFromLogger(calls).replace(/\(\d+ms\)/g, "(88ms)");

describe("request tests", () => {
  beforeEach(() => {
    LogRequestId.reset();
  });

  test("basic ok", async () => {
    mockFetchLib.mockReturnValueOnce(baseOkResponse);
    await request({ url: "https://fake-server.com", pathname: "/path" });
    expect(mockFetchLib.mock.calls).toMatchSnapshot();
    expect(outputFromLoggerWithTimestamps(mockLogger.info.mock.calls)).toMatchInlineSnapshot(
      `"GET https://fake-server.com/path 200 OK (88ms)"`
    );
  });

  test("basic bad request", async () => {
    mockFetchLib.mockReturnValueOnce(baseBadRequestResponse);
    await expect(request({ url: "https://fake-server.com", pathname: "/path" })).rejects.toMatchInlineSnapshot(`
            [Error: got bad response 400 from https://fake-server.com/path
            failure reason]
          `);
    expect(mockFetchLib.mock.calls).toMatchSnapshot();
    expect(outputFromLoggerWithTimestamps(mockLogger.info.mock.calls)).toMatchInlineSnapshot(
      `"GET https://fake-server.com/path 400 Bad Request (88ms)"`
    );
  });

  test("basic retry 120 requests", async () => {
    const n = 120;
    let promises = [];
    for (let i = 0; i < n; i++) {
      mockFetchLib.mockReturnValueOnce(baseTooManyRequestsResponse);
    }
    for (let i = 0; i < n; i++) {
      mockFetchLib.mockReturnValueOnce(baseOkResponse);
    }
    for (let i = 0; i < n; i++) {
      promises.push(request({ checkStatus: false, url: "https://fake-server.com", pathname: "/path" }));
    }
    await Promise.all(promises);
    expect(outputFromLoggerWithTimestamps(mockLogger.info.mock.calls)).toMatchSnapshot();
  });

  test("bad request unchecked", async () => {
    mockFetchLib.mockReturnValueOnce(baseBadRequestResponse);
    await expect(
      request({ url: "https://fake-server.com", pathname: "/path", checkStatus: false })
    ).resolves.toBeDefined();
    expect(mockFetchLib.mock.calls).toMatchSnapshot();
  });

  test("ok with no logging", async () => {
    mockFetchLib.mockReturnValueOnce(baseOkResponse);
    await request({ url: "https://fake-server.com", pathname: "/path", logged: false });
    expect(mockFetchLib.mock.calls).toMatchSnapshot();
    expect(mockLogger.info).toHaveBeenCalledTimes(0);
  });

  test("ok with basic auth", async () => {
    mockFetchLib.mockReturnValueOnce(baseOkResponse);
    await request({
      url: "https://fake-server.com",
      pathname: "/path",
      auth: { username: "username", password: "test-password" },
    });
    expect(mockFetchLib.mock.calls).toMatchSnapshot();
  });

  test("ok with bearer auth", async () => {
    mockFetchLib.mockReturnValueOnce(baseOkResponse);
    await request({ url: "https://fake-server.com", pathname: "/path", auth: { token: "test-token" } });
    expect(mockFetchLib.mock.calls).toMatchSnapshot();
  });

  test("ok with lots of options", async () => {
    mockFetchLib.mockReturnValueOnce(baseOkResponse);
    await request({
      url: "",
      protocol: "https",
      hostname: "server",
      pathname: "/path",
      query: { hello: "world", foo: "bar" },
      hash: "#hashed",
      redirect: true,
    });
    expect(mockFetchLib.mock.calls).toMatchSnapshot();
    expect(outputFromLoggerWithTimestamps(mockLogger.info.mock.calls)).toMatchInlineSnapshot(
      `"GET https://server/path?hello=world&foo=bar#hashed 200 OK (88ms)"`
    );
  });

  test("handling too many requests with falloff", async () => {
    const busyResponseFactory = (index) =>
      Promise.resolve({
        index,
        headers: new MockHeaders(),
        status: 429,
        statusText: "Too Many Requests",
        text: () => Promise.resolve("too many requests, try again later"),
      });
    const responseCount = 5;
    const fakeResponses = Array.from({ length: responseCount }).map((_, i) => busyResponseFactory(i));
    for (const fakeResponse of fakeResponses) {
      mockFetchLib.mockReturnValueOnce(fakeResponse);
    }

    const responsePromise = request({ url: "https://fake-server.com" });

    await expect(responsePromise).rejects.toMatchInlineSnapshot(`
            [Error: got bad response 429 from https://fake-server.com/
            too many requests, try again later]
          `);
    expect(mockStatic.sleep.mock.calls).toMatchInlineSnapshot(`
      [
        [
          6000,
        ],
        [
          12000,
        ],
        [
          24000,
        ],
        [
          48000,
        ],
      ]
    `);

    expect(mockFetchLib).toHaveBeenCalledTimes(responseCount);
    expect(outputFromLoggerWithTimestamps(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "[req-01 1/5] GET https://fake-server.com/ 429 Too Many Requests (88ms) retrying in 6sec
      [req-01 2/5] GET https://fake-server.com/ 429 Too Many Requests (88ms) retrying in 12sec
      [req-01 3/5] GET https://fake-server.com/ 429 Too Many Requests (88ms) retrying in 24sec
      [req-01 4/5] GET https://fake-server.com/ 429 Too Many Requests (88ms) retrying in 48sec
      [req-01 5/5] GET https://fake-server.com/ 429 Too Many Requests (88ms)"
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });

  test("retry mode off", async () => {
    mockFetchLib.mockReturnValueOnce(baseTooManyRequestsResponse);
    await expect(request({ url: "https://fake-server.com", pathname: "/path", retryMode: RETRY_MODE.OFF })).rejects
      .toMatchInlineSnapshot(`
            [Error: got bad response 429 from https://fake-server.com/path
            too many requests]
          `);
    mockFetchLib.mockReturnValueOnce(baseBadRequestResponse);
    await expect(request({ url: "https://fake-server.com", pathname: "/path", retryMode: RETRY_MODE.OFF })).rejects
      .toMatchInlineSnapshot(`
            [Error: got bad response 400 from https://fake-server.com/path
            failure reason]
          `);
    mockFetchLib.mockReturnValueOnce(baseOkResponse);
    await expect(request({ url: "https://fake-server.com", pathname: "/path", retryMode: RETRY_MODE.OFF })).resolves
      .toMatchInlineSnapshot(`
            {
              "headers": MockHeaders {},
              "ok": true,
              "status": 200,
              "statusText": "OK",
            }
          `);
    expect(mockFetchLib).toHaveBeenCalledTimes(3);
    expect(outputFromLoggerWithTimestamps(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "GET https://fake-server.com/path 429 Too Many Requests (88ms)
      GET https://fake-server.com/path 400 Bad Request (88ms)
      GET https://fake-server.com/path 200 OK (88ms)"
    `);
  });

  test("retry mode too many requests", async () => {
    mockFetchLib.mockReturnValueOnce(baseTooManyRequestsResponse);
    mockFetchLib.mockReturnValueOnce(baseTooManyRequestsResponse);
    mockFetchLib.mockReturnValueOnce(baseOkResponse);
    await expect(
      request({ url: "https://fake-server.com", pathname: "/path", retryMode: RETRY_MODE.TOO_MANY_REQUESTS })
    ).resolves.toMatchInlineSnapshot(`
            {
              "headers": MockHeaders {},
              "ok": true,
              "status": 200,
              "statusText": "OK",
            }
          `);
    mockFetchLib.mockReturnValueOnce(baseBadRequestResponse);
    await expect(
      request({ url: "https://fake-server.com", pathname: "/path", retryMode: RETRY_MODE.TOO_MANY_REQUESTS })
    ).rejects.toMatchInlineSnapshot(`
            [Error: got bad response 400 from https://fake-server.com/path
            failure reason]
          `);
    mockFetchLib.mockReturnValueOnce(baseOkResponse);
    await expect(
      request({ url: "https://fake-server.com", pathname: "/path", retryMode: RETRY_MODE.TOO_MANY_REQUESTS })
    ).resolves.toMatchInlineSnapshot(`
            {
              "headers": MockHeaders {},
              "ok": true,
              "status": 200,
              "statusText": "OK",
            }
          `);
    expect(mockFetchLib).toHaveBeenCalledTimes(5);
    expect(outputFromLoggerWithTimestamps(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "[req-01 1/5] GET https://fake-server.com/path 429 Too Many Requests (88ms) retrying in 6sec
      [req-01 2/5] GET https://fake-server.com/path 429 Too Many Requests (88ms) retrying in 12sec
      [req-01 3/5] GET https://fake-server.com/path 200 OK (88ms)
      GET https://fake-server.com/path 400 Bad Request (88ms)
      GET https://fake-server.com/path 200 OK (88ms)"
    `);
  });

  test("retry mode all", async () => {
    mockFetchLib.mockReturnValueOnce(baseTooManyRequestsResponse);
    mockFetchLib.mockReturnValueOnce(baseTooManyRequestsResponse);
    mockFetchLib.mockReturnValueOnce(baseOkResponse);
    await expect(request({ url: "https://fake-server.com", pathname: "/path", retryMode: RETRY_MODE.ALL_FAILED }))
      .resolves.toMatchInlineSnapshot(`
            {
              "headers": MockHeaders {},
              "ok": true,
              "status": 200,
              "statusText": "OK",
            }
          `);
    mockFetchLib.mockReturnValueOnce(baseBadRequestResponse);
    mockFetchLib.mockReturnValueOnce(baseBadRequestResponse);
    mockFetchLib.mockReturnValueOnce(baseOkResponse);
    await expect(request({ url: "https://fake-server.com", pathname: "/path", retryMode: RETRY_MODE.ALL_FAILED }))
      .resolves.toMatchInlineSnapshot(`
            {
              "headers": MockHeaders {},
              "ok": true,
              "status": 200,
              "statusText": "OK",
            }
          `);
    mockFetchLib.mockReturnValueOnce(baseOkResponse);
    await expect(request({ url: "https://fake-server.com", pathname: "/path", retryMode: RETRY_MODE.ALL_FAILED }))
      .resolves.toMatchInlineSnapshot(`
            {
              "headers": MockHeaders {},
              "ok": true,
              "status": 200,
              "statusText": "OK",
            }
          `);
    expect(mockFetchLib).toHaveBeenCalledTimes(7);
    expect(outputFromLoggerWithTimestamps(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "[req-01 1/5] GET https://fake-server.com/path 429 Too Many Requests (88ms) retrying in 6sec
      [req-01 2/5] GET https://fake-server.com/path 429 Too Many Requests (88ms) retrying in 12sec
      [req-01 3/5] GET https://fake-server.com/path 200 OK (88ms)
      [req-02 1/5] GET https://fake-server.com/path 400 Bad Request (88ms) retrying in 6sec
      [req-02 2/5] GET https://fake-server.com/path 400 Bad Request (88ms) retrying in 12sec
      [req-02 3/5] GET https://fake-server.com/path 200 OK (88ms)
      GET https://fake-server.com/path 200 OK (88ms)"
    `);
  });

  test("retry mode invalid", async () => {
    mockFetchLib.mockReturnValueOnce(baseOkResponse);
    await expect(
      request({ url: "https://fake-server.com", pathname: "/path", retryMode: "invalid-mode" })
    ).rejects.toMatchInlineSnapshot(`[Error: unknown retry mode]`);
    expect(mockFetchLib).toHaveBeenCalledTimes(1);
  });

  test("fetch throws exception", async () => {
    mockFetchLib.mockImplementationOnce(() => {
      throw new Error("fetch failed");
    });
    await expect(request({ url: "https://fake-server.com" })).rejects.toMatchInlineSnapshot(`[Error: fetch failed]`);
  });

  test("ok with all options flipped", async () => {
    mockFetchLib.mockReturnValueOnce(baseOkResponse);
    await request({
      url: "https://fake-server.com",
      pathname: "/path",
      checkStatus: true,
      logged: true,
      redirect: false,
    });
    expect(mockFetchLib).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    expect(outputFromLoggerWithTimestamps(mockLogger.info.mock.calls)).toMatchInlineSnapshot(
      `"GET https://fake-server.com/path 200 OK (88ms)"`
    );
  });

  describe("_parseRetryAfter", () => {
    // NOTE: pinned "now" so HTTP-date cases stay deterministic
    const nowMs = Date.parse("2026-01-01T00:00:00Z");
    const secondsInFuture = (n) => new Date(nowMs + n * 1000).toUTCString();

    test.each([
      ["integer seconds", "10", 10_000],
      ["integer seconds with surrounding whitespace", "  30  ", 30_000],
      ["http-date in the future", secondsInFuture(45), 45_000],
      ["cap enforced on huge integer", "99999", 5 * 60 * 1000],
      ["cap enforced on far-future http-date", secondsInFuture(60 * 60), 5 * 60 * 1000],
    ])("valid: %s", (_desc, input, expected) => {
      expect(_parseRetryAfter(input, nowMs)).toBe(expected);
    });

    test.each([
      ["undefined", undefined],
      ["null", null],
      ["number instead of string", 10],
      ["empty string", ""],
      ["only whitespace", "   "],
      ["zero seconds", "0"],
      ["negative-looking (not delta-seconds per RFC, falls to date parse)", "-5"],
      ["garbage", "soon"],
      ["http-date in the past", "Wed, 21 Oct 1970 07:28:00 GMT"],
      ["http-date exactly now", new Date(nowMs).toUTCString()],
    ])("invalid: %s", (_desc, input) => {
      expect(_parseRetryAfter(input, nowMs)).toBeNull();
    });
  });

  test("Retry-After header overrides fixed backoff on 429", async () => {
    mockStatic.sleep.mockClear();
    const withRetryAfter = (value) => ({
      ...baseTooManyRequestsResponse,
      headers: new Headers([["Retry-After", value]]),
    });
    mockFetchLib.mockReturnValueOnce(withRetryAfter("3"));
    mockFetchLib.mockReturnValueOnce(withRetryAfter("7"));
    mockFetchLib.mockReturnValueOnce(baseOkResponse);

    await request({ url: "https://fake-server.com", pathname: "/path" });

    expect(mockStatic.sleep.mock.calls).toMatchInlineSnapshot(`
      [
        [
          3000,
        ],
        [
          7000,
        ],
      ]
    `);
    expect(outputFromLoggerWithTimestamps(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "[req-01 1/5] GET https://fake-server.com/path 429 Too Many Requests (88ms) retrying in 3sec
      [req-01 2/5] GET https://fake-server.com/path 429 Too Many Requests (88ms) retrying in 7sec
      [req-01 3/5] GET https://fake-server.com/path 200 OK (88ms)"
    `);
  });

  test("invalid Retry-After falls back to fixed backoff", async () => {
    mockStatic.sleep.mockClear();
    const withRetryAfter = (value) => ({
      ...baseTooManyRequestsResponse,
      headers: new Headers([["Retry-After", value]]),
    });
    mockFetchLib.mockReturnValueOnce(withRetryAfter("garbage"));
    mockFetchLib.mockReturnValueOnce(withRetryAfter(""));
    mockFetchLib.mockReturnValueOnce(baseOkResponse);

    await request({ url: "https://fake-server.com", pathname: "/path" });

    expect(mockStatic.sleep.mock.calls).toMatchInlineSnapshot(`
      [
        [
          6000,
        ],
        [
          12000,
        ],
      ]
    `);
  });

  test("Retry-After is not consulted when we would not retry", async () => {
    mockStatic.sleep.mockClear();
    const bad500WithRetryAfter = {
      ...baseBadRequestResponse,
      status: 500,
      statusText: "Internal Server Error",
      headers: new Headers([["Retry-After", "120"]]),
    };
    const headerGetSpy = jest.spyOn(bad500WithRetryAfter.headers, "get");
    mockFetchLib.mockReturnValueOnce(bad500WithRetryAfter);

    // NOTE: retryMode TOO_MANY_REQUESTS stops on 500 (not 429), so no retry and no header lookup
    await expect(request({ url: "https://fake-server.com", pathname: "/path" })).rejects.toBeDefined();

    expect(mockStatic.sleep).not.toHaveBeenCalled();
    expect(headerGetSpy).not.toHaveBeenCalledWith("Retry-After");
  });
});

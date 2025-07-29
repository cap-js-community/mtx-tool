"use strict";
const mockFetchLib = require("node-fetch");
jest.mock("node-fetch", () => jest.fn());

const { Logger: MockLogger } = require("../../src/shared/logger");
const mockLogger = MockLogger.getInstance();
jest.mock("../../src/shared/logger", () => require("../__mocks/shared/logger"));

const mockStatic = require("../../src/shared/static");
jest.mock("../../src/shared/static", () => ({
  sleep: jest.fn(),
}));

const { request, RETRY_MODE } = require("../../src/shared/request");

const { outputFromLogger } = require("../test-util/static");

const baseOkResponse = {
  headers: new Headers(),
  ok: true,
  status: 200,
  statusText: "OK",
};

const baseBadRequestResponse = {
  headers: new Headers(),
  ok: false,
  status: 400,
  statusText: "Bad Request",
  text() {
    return "failure reason";
  },
};

const baseTooManyRequestsResponse = {
  headers: new Headers(),
  ok: false,
  status: 429,
  statusText: "Too Many Requests",
  text() {
    return "too many requests";
  },
};

const outputFromLoggerWithTimestamps = (calls) => outputFromLogger(calls).replace(/\(\d+ms\)/g, "(88ms)");

describe("request tests", () => {
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
        headers: new Headers(),
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
      "GET https://fake-server.com/ 429 Too Many Requests (88ms) retrying in 6sec
      GET https://fake-server.com/ 429 Too Many Requests (88ms) retrying in 12sec
      GET https://fake-server.com/ 429 Too Many Requests (88ms) retrying in 24sec
      GET https://fake-server.com/ 429 Too Many Requests (88ms) retrying in 48sec
      GET https://fake-server.com/ 429 Too Many Requests (88ms)"
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
              "headers": Headers {},
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
              "headers": Headers {},
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
              "headers": Headers {},
              "ok": true,
              "status": 200,
              "statusText": "OK",
            }
          `);
    expect(mockFetchLib).toHaveBeenCalledTimes(5);
    expect(outputFromLoggerWithTimestamps(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "GET https://fake-server.com/path 429 Too Many Requests (88ms) retrying in 6sec
      GET https://fake-server.com/path 429 Too Many Requests (88ms) retrying in 12sec
      GET https://fake-server.com/path 200 OK (88ms)
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
              "headers": Headers {},
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
              "headers": Headers {},
              "ok": true,
              "status": 200,
              "statusText": "OK",
            }
          `);
    mockFetchLib.mockReturnValueOnce(baseOkResponse);
    await expect(request({ url: "https://fake-server.com", pathname: "/path", retryMode: RETRY_MODE.ALL_FAILED }))
      .resolves.toMatchInlineSnapshot(`
            {
              "headers": Headers {},
              "ok": true,
              "status": 200,
              "statusText": "OK",
            }
          `);
    expect(mockFetchLib).toHaveBeenCalledTimes(7);
    expect(outputFromLoggerWithTimestamps(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "GET https://fake-server.com/path 429 Too Many Requests (88ms) retrying in 6sec
      GET https://fake-server.com/path 429 Too Many Requests (88ms) retrying in 12sec
      GET https://fake-server.com/path 200 OK (88ms)
      GET https://fake-server.com/path 400 Bad Request (88ms) retrying in 6sec
      GET https://fake-server.com/path 400 Bad Request (88ms) retrying in 12sec
      GET https://fake-server.com/path 200 OK (88ms)
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
});

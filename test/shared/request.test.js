"use strict";
const { request } = require("../../src/shared/request");

const mockFetchLib = require("node-fetch");
jest.mock("node-fetch", () => jest.fn());

const { Logger: MockLogger } = require("../../src/shared/logger");
const { outputFromLogger } = require("../test-util/static");
const mockLogger = MockLogger.getInstance();
jest.mock("../../src/shared/logger", () => require("../__mocks/shared/logger"));

const baseOkResponse = {
  ok: true,
  status: 200,
  statusText: "OK",
};

const baseBadRequestResponse = {
  ok: false,
  status: 400,
  statusText: "Bad Request",
  text() {
    return "failure reason";
  },
};

describe("request", () => {
  test("basic ok", async () => {
    mockFetchLib.mockReturnValueOnce(baseOkResponse);
    await request({ url: "https://server", pathname: "/path" });
    expect(mockFetchLib.mock.calls).toMatchSnapshot();
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(
      `"GET https://server/path 200 OK (0ms)"`
    );
  });

  test("basic bad request", async () => {
    mockFetchLib.mockReturnValueOnce(baseBadRequestResponse);
    await expect(request({ url: "https://server", pathname: "/path" })).rejects.toMatchInlineSnapshot(`
            [Error: got bad response 400 from https://server/path
            failure reason]
          `);
    expect(mockFetchLib.mock.calls).toMatchSnapshot();
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(
      `"GET https://server/path 400 Bad Request (0ms)"`
    );
  });

  test("bad request unchecked", async () => {
    mockFetchLib.mockReturnValueOnce(baseBadRequestResponse);
    await request({ url: "https://server", pathname: "/path", checkStatus: false });
    expect(mockFetchLib.mock.calls).toMatchSnapshot();
    expect(outputFromLogger(mockLogger.info.mock.calls)).toMatchInlineSnapshot(
      `"GET https://server/path 400 Bad Request (0ms)"`
    );
  });

  test("ok with no logging", async () => {
    mockFetchLib.mockReturnValueOnce(baseOkResponse);
    await request({ url: "https://server", pathname: "/path", logged: false });
    expect(mockFetchLib.mock.calls).toMatchSnapshot();
    expect(mockLogger.info).toHaveBeenCalledTimes(0);
  });

  test("ok with basic auth", async () => {
    mockFetchLib.mockReturnValueOnce(baseOkResponse);
    await request({ url: "https://server", pathname: "/path", auth: { username: "username", password: "password" } });
    expect(mockFetchLib.mock.calls).toMatchSnapshot();
  });

  test("ok with bearer auth", async () => {
    mockFetchLib.mockReturnValueOnce(baseOkResponse);
    await request({ url: "https://server", pathname: "/path", auth: { token: "token" } });
    expect(mockFetchLib.mock.calls).toMatchSnapshot();
  });
});

"use strict";

jest.mock("node-fetch", () => jest.fn());
jest.mock("../../src/shared/static", () => ({
  sleep: jest.fn(),
}));
const mockFetchLib = require("node-fetch");
const mockShared = require("../../src/shared/static");

const { request } = require("../../src/shared/request");

let loggerSpy = {
  info: jest.spyOn(console, "log").mockImplementation(),
  error: jest.spyOn(console, "error").mockImplementation(),
};

const options = {
  url: "https://fake.com",
};

const normalizeMockCallTimings = (calls) => calls.map((call) => call.map((args) => args.replace(/\d+ms/g, "xms")));

describe("request tests", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("handling too many requests with falloff", async () => {
    const busyResponseFactory = (index) =>
      Promise.resolve({
        index,
        status: 429,
        statusText: "Too Many Requests",
        text: () => Promise.resolve("too many requests, try again later"),
      });
    const responseCount = 5;
    const fakeResponses = Array.from({ length: responseCount }).map((_, i) => busyResponseFactory(i));
    for (const fakeResponse of fakeResponses) {
      mockFetchLib.mockReturnValueOnce(fakeResponse);
    }

    const responsePromise = request(options);

    await expect(responsePromise).rejects.toMatchInlineSnapshot(`
            [Error: got bad response 429 from https://fake.com/
            too many requests, try again later]
          `);
    expect(mockShared.sleep.mock.calls).toMatchInlineSnapshot(`
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
    expect(normalizeMockCallTimings(loggerSpy.info.mock.calls)).toMatchInlineSnapshot(`
      [
        [
          "GET https://fake.com/ 429 Too Many Requests (xms) retrying in 6sec",
        ],
        [
          "GET https://fake.com/ 429 Too Many Requests (xms) retrying in 12sec",
        ],
        [
          "GET https://fake.com/ 429 Too Many Requests (xms) retrying in 24sec",
        ],
        [
          "GET https://fake.com/ 429 Too Many Requests (xms) retrying in 48sec",
        ],
        [
          "GET https://fake.com/ 429 Too Many Requests (xms)",
        ],
      ]
    `);
    expect(loggerSpy.error).toHaveBeenCalledTimes(0);
  });
});

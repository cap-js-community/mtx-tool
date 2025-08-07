"use strict";
const util = require("util");
const { partition } = require("../../src/shared/static");

const outputFromLogger = (calls) => calls.map((args) => util.format(...args)).join("\n");

const outputFromLoggerPartitionFetch = (calls) => {
  const inputLogLines = outputFromLogger(calls).split("\n");
  const [fetchLogLines, logLines] = partition(inputLogLines, (line) =>
    /^(?:GET|POST|PATCH|DELETE) https:\/\//i.test(line)
  );
  const fetchLogLinesWithMockTimestamp = fetchLogLines.map((line) => line.replace(/\(\d+ms\)/g, "(88ms)"));
  fetchLogLinesWithMockTimestamp.sort(); // NOTE: this is inherently unstable otherwise
  return [...logLines, "", ...fetchLogLinesWithMockTimestamp].join("\n");
};

const anonymizeListTimestamps = (output) =>
  output
    .replace(/created_on *updated_on */g, "created_on  updated_on")
    .replace(/\(\d+ days? ago\) */g, "(x days ago)  ");

const collectRequestCount = (requests) =>
  requests.reduce((acc, request) => {
    const key = `${request.method} ${request.scope}`;
    if (!acc[key]) {
      acc[key] = 0;
    }
    acc[key]++;
    return acc;
  }, {});

const collectRequestMockCalls = (mockFn) =>
  mockFn.mock.calls.map(([{ method, url, pathname, query, body }]) =>
    [
      [
        method ?? "GET",
        url,
        pathname,
        ...(query ? [util.formatWithOptions({ breakLength: Infinity }, "%O", query)] : []),
      ].join(" "),
      ...(body ? [util.formatWithOptions({ breakLength: Infinity }, "%O", body)] : []),
    ].join("\n")
  );

class MockHeaders {
  constructor() {}
  get() {}
  has() {}
}

module.exports = {
  outputFromLogger,
  outputFromLoggerPartitionFetch,
  anonymizeListTimestamps,
  collectRequestCount,
  collectRequestMockCalls,
  MockHeaders,
};

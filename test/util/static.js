"use strict";
const { format } = require("util");
const { partition } = require("../../src/shared/static");

const outputFromLogger = (calls) => calls.map((args) => format(...args)).join("\n");

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

module.exports = {
  outputFromLogger,
  outputFromLoggerPartitionFetch,
  anonymizeListTimestamps,
};

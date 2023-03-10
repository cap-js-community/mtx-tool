"use strict";
const { format } = require("util");
const { partition } = require("../../src/shared/static");

const outputFromLogger = (calls) => calls.map((args) => format(...args)).join("\n");

const outputFromLoggerPartitionFetch = (calls) => {
  const inputLogLines = outputFromLogger(calls).split("\n");
  const [fetchLogLines, logLines] = partition(inputLogLines, (line) =>
    /^(?:GET|POST|PATCH|DELETE) https:\/\//i.test(line)
  );
  return [...logLines, "", ...fetchLogLines].join("\n");
};

module.exports = {
  outputFromLogger,
  outputFromLoggerPartitionFetch,
};

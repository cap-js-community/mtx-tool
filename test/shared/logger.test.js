"use strict";

const loggerModule = require("../../src/shared/logger");
const { LEVEL, Logger } = loggerModule;

const processStreamSpy = {
  stdout: jest.spyOn(process.stdout, "write").mockReturnValue(),
  stderr: jest.spyOn(process.stderr, "write").mockReturnValue(),
};

let logger;

const cleanupLogCalls = (spyFn) =>
  spyFn.mock.calls[0][0]
    .replace(/(?<=\n)\s+at.*?\n/g, "") // stacktrace
    .replace(/\n$/g, ""); // final newline

describe("logger test", () => {
  beforeEach(() => {
    loggerModule._._reset();
    logger = Logger.getInstance();
  });

  test("logger info", async () => {
    logger.info("text info");
    expect(processStreamSpy.stdout).toHaveBeenCalledTimes(1);
    expect(processStreamSpy.stderr).toHaveBeenCalledTimes(0);
    expect(cleanupLogCalls(processStreamSpy.stdout)).toMatchInlineSnapshot(`"text info"`);
  });

  test("logger warning", async () => {
    logger.warning("text warning");
    expect(processStreamSpy.stdout).toHaveBeenCalledTimes(1);
    expect(processStreamSpy.stderr).toHaveBeenCalledTimes(0);
    expect(cleanupLogCalls(processStreamSpy.stdout)).toMatchInlineSnapshot(`"text warning"`);
  });

  test("logger error", async () => {
    logger.error("text error");
    expect(processStreamSpy.stdout).toHaveBeenCalledTimes(0);
    expect(processStreamSpy.stderr).toHaveBeenCalledTimes(1);
    expect(cleanupLogCalls(processStreamSpy.stderr)).toMatchInlineSnapshot(`"text error"`);
  });

  test("logger debug is off by default", async () => {
    logger.debug("text debug");
    expect(processStreamSpy.stdout).toHaveBeenCalledTimes(0);
    expect(processStreamSpy.stderr).toHaveBeenCalledTimes(0);
  });

  test("logger trace is off by default", async () => {
    logger.trace("text trace");
    expect(processStreamSpy.stdout).toHaveBeenCalledTimes(0);
    expect(processStreamSpy.stderr).toHaveBeenCalledTimes(0);
  });

  test("logger with no arg results in empty string", async () => {
    logger.info();
    expect(processStreamSpy.stdout).toHaveBeenCalledTimes(1);
    expect(processStreamSpy.stderr).toHaveBeenCalledTimes(0);
    expect(cleanupLogCalls(processStreamSpy.stdout)).toMatchInlineSnapshot(`""`);
  });

  test("logger can handle format strings", async () => {
    logger.info("text %O %s %j", { a: "b" }, "hello", { b: "a:" });
    expect(processStreamSpy.stdout).toHaveBeenCalledTimes(1);
    expect(processStreamSpy.stderr).toHaveBeenCalledTimes(0);
    expect(cleanupLogCalls(processStreamSpy.stdout)).toMatchInlineSnapshot(`"text { a: 'b' } hello {"b":"a:"}"`);
  });

  test("logger can handle errors as first arg", async () => {
    logger.error(new Error("my error"));
    expect(processStreamSpy.stdout).toHaveBeenCalledTimes(0);
    expect(processStreamSpy.stderr).toHaveBeenCalledTimes(1);
    expect(cleanupLogCalls(processStreamSpy.stderr)).toMatchInlineSnapshot(`"Error: my error"`);
  });

  test("setMaxLevel to error disables info", async () => {
    logger.setMaxLevel(LEVEL.ERROR);
    logger.info("text info");
    logger.warning("text warning");
    logger.error("text error");
    expect(processStreamSpy.stdout).toHaveBeenCalledTimes(0);
    expect(processStreamSpy.stderr).toHaveBeenCalledTimes(1);
    expect(cleanupLogCalls(processStreamSpy.stderr)).toMatchInlineSnapshot(`"text error"`);
  });
});

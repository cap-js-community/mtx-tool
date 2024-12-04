"use strict";

const { ENV, LEVEL, FORMAT, Logger } = require("../../src/shared/logger");

const processStreamSpy = {
  stdout: jest.spyOn(process.stdout, "write"),
  stderr: jest.spyOn(process.stderr, "write"),
};

let logger;

describe("logger test", () => {
  beforeEach(() => {
    Logger._reset();
    redisWrapperMock._reset();
    envMock._reset();
    toggles = new FeatureToggles({ redisKey, redisChannel, refreshMessage });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("check text format logging for invalid fallback values during initialization", async () => {
    featureTogglesModule._._setLogger(new Logger(layer, { format: FORMAT.TEXT }));
    const error = new Error("bad validator");
    const validator = jest.fn().mockRejectedValue(error);

    toggles.registerFeatureValueValidation(FEATURE.B, validator);
    await toggles.initializeFeatures({ config: mockConfig });

    expect(processStreamSpy.stdout.mock.calls.map(cleanupTextLogCalls)).toMatchInlineSnapshot(`
      [
        [
          "88:88:88.888 | WARN | /test | FeatureTogglesError: found invalid fallback values during initialization
      {
        validationErrors: '[{"featureKey":"test/feature_b","errorMessage":"registered validator \\\\"{0}\\\\" failed for value \\\\"{1}\\\\" with error {2}","errorMessageValues":["mockConstructor",1,"bad validator"]}]'
      }",
        ],
        [
          "88:88:88.888 | INFO | /test | finished initialization with 9 feature toggles (9 runtime, 0 file, 0 auto) using CF_REDIS",
        ],
      ]
    `);
    expect(processStreamSpy.stderr.mock.calls.map(cleanupTextLogCalls)).toMatchInlineSnapshot(`
      [
        [
          "88:88:88.888 | ERROR | /test | FeatureTogglesError: error during registered validator: bad validator
      caused by: Error: bad validator
      {
        validator: 'mockConstructor',
        featureKey: 'test/feature_b',
        value: 1
      }",
        ],
      ]
    `);
  });

  test("check json logging for invalid fallback values during initialization", async () => {
    featureTogglesModule._._setLogger(new Logger(layer, { format: FORMAT.JSON }));
    const error = new Error("bad validator");
    const validator = jest.fn().mockRejectedValue(error);

    toggles.registerFeatureValueValidation(FEATURE.B, validator);
    await toggles.initializeFeatures({ config: mockConfig });

    const logStderrCalls = processStreamSpy.stderr.mock.calls.map(cleanupJsonLogCalls);
    const logStdoutCalls = processStreamSpy.stdout.mock.calls.map(cleanupJsonLogCalls);
    expect(logStderrCalls).toMatchInlineSnapshot(`
      [
        [
          "{"level":"error","msg":"FeatureTogglesError: error during registered validator: bad validator\\ncaused by: Error: bad validator\\n{\\n  validator: 'mockConstructor',\\n  featureKey: 'test/feature_b',\\n  value: 1\\n}","type":"log","layer":"/test"}",
        ],
      ]
    `);
    expect(logStdoutCalls).toMatchInlineSnapshot(`
      [
        [
          "{"level":"warn","msg":"FeatureTogglesError: found invalid fallback values during initialization\\n{\\n  validationErrors: '[{\\"featureKey\\":\\"test/feature_b\\",\\"errorMessage\\":\\"registered validator \\\\\\\\\\"{0}\\\\\\\\\\" failed for value \\\\\\\\\\"{1}\\\\\\\\\\" with error {2}\\",\\"errorMessageValues\\":[\\"mockConstructor\\",1,\\"bad validator\\"]}]'\\n}","type":"log","layer":"/test"}",
        ],
        [
          "{"level":"info","msg":"finished initialization with 9 feature toggles (9 runtime, 0 file, 0 auto) using CF_REDIS","type":"log","layer":"/test"}",
        ],
      ]
    `);
    const [registerValidatorError] = logStderrCalls.map(([log]) => JSON.parse(log));
    const [initializeError] = logStdoutCalls.map(([log]) => JSON.parse(log));
    expect(registerValidatorError.msg).toContain("bad validator");
    expect(initializeError.msg).toContain("invalid");
  });

  describe("logger v2", () => {
    test("info with text format and no layer", async () => {
      logger = new Logger("", { format: FORMAT.TEXT });
      logger.info("some info");
      expect(processStreamSpy.stdout.mock.calls.map(cleanupTextLogCalls)[0]).toMatchInlineSnapshot(`
        [
          "88:88:88.888 | INFO | some info",
        ]
      `);
      expect(processStreamSpy.stdout.mock.calls.length).toBe(1);
    });

    test("info with text", async () => {
      logger = new Logger(layer, { format: FORMAT.JSON });
      logger.info("some info");
      expect(processStreamSpy.stdout.mock.calls.map(cleanupJsonLogCalls)[0]).toMatchInlineSnapshot(`
        [
          "{"level":"info","msg":"some info","type":"log","layer":"/test"}",
        ]
      `);
      expect(processStreamSpy.stdout.mock.calls.length).toBe(1);
    });

    test("info with text format", async () => {
      logger = new Logger(layer, { format: FORMAT.TEXT });
      logger.info("some info");
      expect(processStreamSpy.stdout.mock.calls.map(cleanupTextLogCalls)[0]).toMatchInlineSnapshot(`
        [
          "88:88:88.888 | INFO | /test | some info",
        ]
      `);
      expect(processStreamSpy.stdout.mock.calls.length).toBe(1);
    });

    test("info on cf defaults to json format", async () => {
      envMock.isOnCf = true;
      logger = new Logger(layer);
      logger.info("some info");
      expect(processStreamSpy.stdout.mock.calls.map(cleanupJsonLogCalls)[0]).toMatchInlineSnapshot(`
        [
          "{"level":"info","msg":"some info","type":"log","layer":"/test"}",
        ]
      `);
      expect(processStreamSpy.stdout.mock.calls.length).toBe(1);
    });

    test("make sure env log level WARN is respected", async () => {
      process.env[ENV.LOG_LEVEL] = " warn ";
      logger = new Logger(layer, { maxLevel: LEVEL.TRACE });
      logger.trace("some trace");
      logger.debug("some debug");
      logger.info("some info");
      expect(processStreamSpy.stdout.mock.calls.length).toBe(0);
      expect(processStreamSpy.stderr.mock.calls.length).toBe(0);
      logger.warning("some warning");
      expect(processStreamSpy.stdout.mock.calls.map(cleanupTextLogCalls)[0]).toMatchInlineSnapshot(`
        [
          "88:88:88.888 | WARN | /test | some warning",
        ]
      `);
      expect(processStreamSpy.stdout.mock.calls.length).toBe(1);
      expect(processStreamSpy.stderr.mock.calls.length).toBe(0);
      processStreamSpy.stdout.mockClear();
      logger.error("some error");
      expect(processStreamSpy.stderr.mock.calls.map(cleanupTextLogCalls)[0]).toMatchInlineSnapshot(`
        [
          "88:88:88.888 | ERROR | /test | some error",
        ]
      `);
      expect(processStreamSpy.stdout.mock.calls.length).toBe(0);
      expect(processStreamSpy.stderr.mock.calls.length).toBe(1);
      Reflect.deleteProperty(process.env, ENV.LOG_LEVEL);
    });

    test("make sure env log level ERROR is respected", async () => {
      process.env[ENV.LOG_LEVEL] = " err ";
      logger = new Logger(layer, { maxLevel: LEVEL.TRACE });
      logger.trace("some trace");
      logger.debug("some debug");
      logger.info("some info");
      logger.warning("some warning");
      expect(processStreamSpy.stdout.mock.calls.length).toBe(0);
      expect(processStreamSpy.stderr.mock.calls.length).toBe(0);
      logger.error("some error");
      expect(processStreamSpy.stderr.mock.calls.map(cleanupTextLogCalls)[0]).toMatchInlineSnapshot(`
        [
          "88:88:88.888 | ERROR | /test | some error",
        ]
      `);
      expect(processStreamSpy.stdout.mock.calls.length).toBe(0);
      expect(processStreamSpy.stderr.mock.calls.length).toBe(1);
      Reflect.deleteProperty(process.env, ENV.LOG_LEVEL);
    });

    test("error basic usage", async () => {
      logger = new Logger(layer, { format: FORMAT.JSON });
      logger.error(new VError("bla error"));
      expect(processStreamSpy.stderr.mock.calls.map(cleanupJsonLogCalls)[0]).toMatchInlineSnapshot(`
        [
          "{"level":"error","msg":"VError: bla error","type":"log","layer":"/test"}",
        ]
      `);
      expect(processStreamSpy.stderr.mock.calls.length).toBe(1);
    });

    test("error with children", async () => {
      const logger = new Logger(layer, { format: FORMAT.JSON });
      const childLogger = logger.child({ isChild: true });
      const siblingLogger = logger.child({ isSibling: true });
      const childChildLogger = childLogger.child({ isChildChild: true });
      let i = 0;

      logger.info("base");
      expect(processStreamSpy.stdout.mock.calls.map(cleanupJsonLogCalls)[i++]).toMatchInlineSnapshot(`
        [
          "{"level":"info","msg":"base","type":"log","layer":"/test"}",
        ]
      `);
      childLogger.info("child");
      expect(processStreamSpy.stdout.mock.calls.map(cleanupJsonLogCalls)[i++]).toMatchInlineSnapshot(`
        [
          "{"isChild":true,"level":"info","msg":"child","type":"log","layer":"/test"}",
        ]
      `);
      siblingLogger.info("sibling");
      expect(processStreamSpy.stdout.mock.calls.map(cleanupJsonLogCalls)[i++]).toMatchInlineSnapshot(`
        [
          "{"isSibling":true,"level":"info","msg":"sibling","type":"log","layer":"/test"}",
        ]
      `);
      childChildLogger.info("child child");
      expect(processStreamSpy.stdout.mock.calls.map(cleanupJsonLogCalls)[i++]).toMatchInlineSnapshot(`
        [
          "{"isChild":true,"isChildChild":true,"level":"info","msg":"child child","type":"log","layer":"/test"}",
        ]
      `);
      expect(processStreamSpy.stdout.mock.calls.length).toBe(i);
    });
  });
});

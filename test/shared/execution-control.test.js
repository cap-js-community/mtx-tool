"use strict";

const { promisify, format } = require("util");

const {
  makeOneTime,
  resetMakeOneTime,
  makeExclusiveCoalescing,
  makeExclusiveQueueing,
} = require("../../src/shared/execution-control");

const sleep = promisify(setTimeout);

describe("executionControl", () => {
  let executionLog;
  const n = 3;
  const m = 2;
  const runner = async (index) => {
    executionLog.push(format("started %d", index));
    await sleep(10);
    executionLog.push(format("finished %d", index));
    return format("result %d", index);
  };

  beforeEach(() => {
    executionLog = [];
  });

  test("non-exclusive", async () => {
    const resultsPrimary = await Promise.all(Array.from({ length: n }, (_, i) => runner(i + 1)));

    const resultsSecondary = await Promise.all(Array.from({ length: m }, (_, i) => runner(n + i + 1)));
    expect(resultsPrimary).toMatchInlineSnapshot(`
      [
        "result 1",
        "result 2",
        "result 3",
      ]
    `);
    expect(resultsSecondary).toMatchInlineSnapshot(`
      [
        "result 4",
        "result 5",
      ]
    `);
    expect(executionLog).toMatchInlineSnapshot(`
      [
        "started 1",
        "started 2",
        "started 3",
        "finished 1",
        "finished 2",
        "finished 3",
        "started 4",
        "started 5",
        "finished 4",
        "finished 5",
      ]
    `);
  });

  test("makeExclusiveQueueing", async () => {
    const exclusiveRunner = makeExclusiveQueueing(runner);
    const resultsPrimary = await Promise.all(Array.from({ length: n }, (_, i) => exclusiveRunner(i + 1)));

    const resultsSecondary = await Promise.all(Array.from({ length: m }, (_, i) => exclusiveRunner(n + i + 1)));
    expect(resultsPrimary).toMatchInlineSnapshot(`
      [
        "result 1",
        "result 2",
        "result 3",
      ]
    `);
    expect(resultsSecondary).toMatchInlineSnapshot(`
      [
        "result 4",
        "result 5",
      ]
    `);
    expect(executionLog).toMatchInlineSnapshot(`
      [
        "started 1",
        "finished 1",
        "started 2",
        "finished 2",
        "started 3",
        "finished 3",
        "started 4",
        "finished 4",
        "started 5",
        "finished 5",
      ]
    `);
  });

  test("makeExclusiveCoalescing", async () => {
    const exclusiveRunner = makeExclusiveCoalescing(runner);
    const resultsPrimary = await Promise.all(Array.from({ length: n }, (_, i) => exclusiveRunner(i + 1)));

    const resultsSecondary = await Promise.all(Array.from({ length: m }, (_, i) => exclusiveRunner(n + i + 1)));
    expect(resultsPrimary).toMatchInlineSnapshot(`
      [
        "result 1",
        "result 1",
        "result 1",
      ]
    `);
    expect(resultsSecondary).toMatchInlineSnapshot(`
      [
        "result 4",
        "result 4",
      ]
    `);
    expect(executionLog).toMatchInlineSnapshot(`
      [
        "started 1",
        "finished 1",
        "started 4",
        "finished 4",
      ]
    `);
  });

  test("makeOneTime", async () => {
    const exclusiveRunner = makeOneTime(runner);
    const resultsPrimary = await Promise.all(Array.from({ length: n }, (_, i) => exclusiveRunner(i + 1)));

    const resultsSecondary = await Promise.all(Array.from({ length: m }, (_, i) => exclusiveRunner(n + i + 1)));
    expect(resultsPrimary).toMatchInlineSnapshot(`
      [
        "result 1",
        "result 1",
        "result 1",
      ]
    `);
    expect(resultsSecondary).toMatchInlineSnapshot(`
      [
        "result 1",
        "result 1",
      ]
    `);
    expect(executionLog).toMatchInlineSnapshot(`
      [
        "started 1",
        "finished 1",
      ]
    `);
  });

  test("makeOneTime retries on error", async () => {
    let callCount = 0;
    const failOnceRunner = async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("first call fails");
      }
      return format("result %d", callCount);
    };
    const exclusiveRunner = makeOneTime(failOnceRunner);

    await expect(exclusiveRunner()).rejects.toThrow("first call fails");
    const result = await exclusiveRunner();
    expect(result).toBe("result 2");
    expect(callCount).toBe(2);
  });

  test("resetMakeOneTime", async () => {
    const exclusiveRunner = makeOneTime(runner);
    const firstResult = await exclusiveRunner(1);
    expect(firstResult).toBe("result 1");

    resetMakeOneTime(exclusiveRunner);
    const secondResult = await exclusiveRunner(2);
    expect(secondResult).toBe("result 2");
    expect(executionLog).toMatchInlineSnapshot(`
      [
        "started 1",
        "finished 1",
        "started 2",
        "finished 2",
      ]
    `);
  });
});

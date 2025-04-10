"use strict";

const { Funnel, FunnelQueue, limiter } = require("../../src/shared/funnel");

// a simple helper to delay execution
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Funnel", () => {
  test("should execute a simple callback and return its result", async () => {
    const funnel = new Funnel(2);
    const result = await funnel.enqueue(() => 42);
    expect(result).toBe(42);
  });

  test("should enforce capacity limit and run callbacks sequentially when capacity is exceeded", async () => {
    // set a capacity limit of 2
    const funnel = new Funnel(2);
    let currentConcurrent = 0;
    let maxConcurrent = 0;

    // an async task that increases the current count,
    // delays for a bit, then decreases the count
    const task = async () => {
      currentConcurrent++;
      if (currentConcurrent > maxConcurrent) {
        maxConcurrent = currentConcurrent;
      }
      // simulate async work
      await delay(50);
      currentConcurrent--;
      return 1;
    };

    // start three tasks. Because capacity is 2, at most 2 tasks should run concurrently.
    const p1 = funnel.enqueue(task);
    const p2 = funnel.enqueue(task);
    const p3 = funnel.enqueue(task);

    // wait for all tasks to complete
    await Promise.all([p1, p2, p3]);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  test("should propagate errors while still restoring capacity", async () => {
    const funnel = new Funnel(1);

    // first enqueue a callback that throws an error.
    const errorCallback = () => {
      throw new Error("Test error");
    };

    // capture the rejection and check error message
    await expect(funnel.enqueue(errorCallback)).rejects.toThrow("Test error");

    // after a rejection, capacity should be restored so we can run another task.
    const successCallback = () => 99;
    const result = await funnel.enqueue(successCallback);
    expect(result).toBe(99);
  });
});

describe("FunnelQueue", () => {
  test("should return results in calling order when dequeueAll is called", async () => {
    const funnelQueue = new FunnelQueue(2);

    // enqueue three tasks that resolve to different values with slight delays
    funnelQueue.enqueue(async () => {
      await delay(20);
      return "first";
    });
    funnelQueue.enqueue(async () => {
      await delay(10);
      return "second";
    });
    funnelQueue.enqueue(() => "third"); // synchronous function

    const results = await funnelQueue.dequeueAll();
    expect(results).toEqual(["first", "second", "third"]);
  });

  test("should throw an error from dequeueAll if any task rejects", async () => {
    const funnelQueue = new FunnelQueue(2);

    funnelQueue.enqueue(() => "ok");
    funnelQueue.enqueue(() => {
      throw new Error("failure");
    });
    funnelQueue.enqueue(() => "not reached");

    await expect(funnelQueue.dequeueAll()).rejects.toThrow("failure");
  });
});

describe("limiter", () => {
  test("should process all payloads with a given concurrency limit", async () => {
    const payloads = [1, 2, 3, 4, 5];
    // simple iterator that doubles the payload after a short delay
    const iterator = async (payload) => {
      await delay(10);
      return payload * 2;
    };

    const results = await limiter(2, payloads, iterator);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  test("should reject if the iterator throws an error", async () => {
    const payloads = [1, 2, 3];
    const iterator = async (payload) => {
      await delay(10);
      if (payload === 2) {
        throw new Error("iterator failure");
      }
      return payload;
    };

    await expect(limiter(2, payloads, iterator)).rejects.toThrow("iterator failure");
  });
});

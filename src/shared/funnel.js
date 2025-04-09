"use strict";

class Funnel {
  /**
   * Creates a new Funnel instance with the specified capacity limit.
   * @param {number} limit - The maximum capacity of the funnel. Will be set to at least 1.
   */
  constructor(limit) {
    limit = Math.max(1, limit);
    // NOTE: freeCapacity is a number representing the additional load the funnel can take
    this.__freeCapacity = limit;
    // NOTE: runningPromises are throw-disabled variants of promises active in the funnel
    this.__runningPromises = [];
    // NOTE: queue are the currently enqueued callback promises in calling order in their original, potentially
    //   throwing form
    this.__queue = [];
  }

  async _enqueue(callback, load = 1) {
    load = Math.max(1, load);
    // NOTE: the second condition here means we allow overbooking if the funnel is empty
    while (this.__freeCapacity < load && this.__runningPromises.length) {
      await Promise.race(this.__runningPromises);
    }

    // NOTE: in order for the above limit check to work properly, the capacity decrease needs to happen before the
    //   callback promise is kicked off.
    this.__freeCapacity -= load;
    const callbackPromise =
      callback.constructor.name === "AsyncFunction" ? callback() : Promise.resolve().then(() => callback());

    const runningPromise = callbackPromise
      .catch(() => {})
      .finally(() => {
        this.__runningPromises.splice(this.__runningPromises.indexOf(runningPromise), 1);
        this.__freeCapacity += load;
      });
    this.__runningPromises.push(runningPromise);

    return await callbackPromise;
  }

  /**
   * Enqueues a callback function to be executed when capacity becomes available.
   * @param {Function} callback - The (async) callback function to execute.
   * @param {number} [load] - The capacity load of this callback. Defaults to 1 and is set to at least 1.
   */
  async enqueue(callback, load) {
    const enqueuePromise = this._enqueue(callback, load);
    this.__queue.push(enqueuePromise);
  }

  /**
   * Waits for the processing of all currently enqueued callbacks and returns their results in calling order, when all
   * have completed. Clears the current queue in the process.
   * @returns {Promise<Array>} A promise that resolves with the results of all enqueued callbacks.
   */
  async dequeueAll() {
    const currentQueue = this.__queue;
    this.__queue = [];

    const results = await Promise.allSettled(currentQueue);
    const rejected = results.find(({ status }) => status === "rejected");
    if (rejected) {
      throw rejected.reason;
    }
    return results.map(({ value }) => value);
  }
}

/**
 * Defines a promise that resolves when all payloads are processed by the iterator, but limits
 * the number concurrent executions.
 *
 * @param limit     number of concurrent executions
 * @param payloads  array where each element is an array of arguments passed to the iterator
 * @param iterator  (async) function to process a payload
 * @returns {Promise<[]>} promise for an array of iterator results
 */
const limiter = async (limit, payloads, iterator) => {
  const funnel = new Funnel(limit);
  payloads.forEach((payload) => funnel.enqueue(async () => await iterator(payload)));
  return await funnel.dequeueAll();
};

module.exports = { Funnel, limiter };

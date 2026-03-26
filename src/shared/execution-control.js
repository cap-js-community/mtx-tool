"use strict";

/**
 * Wraps an async function so that it is invoked only once. The first call executes
 * the callback and caches the resulting promise; all subsequent calls return the
 * same cached result. If the callback rejects, the cached result is cleared so
 * that the next invocation retries. Use this for one-time initialization such as
 * creating a shared client or reading a config file.
 *
 * Call `resetMakeOneTime(wrappedFn)` to clear the cached result so the next
 * invocation re-executes the callback.
 *
 * @param {Function} cb - Async function to wrap.
 * @returns {Function} Wrapped function that executes `cb` at most once.
 */
const makeOneTime = (cb) => {
  const oneTimeCb = async (...args) => {
    if (!Object.prototype.hasOwnProperty.call(oneTimeCb, "__result")) {
      oneTimeCb.__result = Promise.resolve(cb(...args)).catch((err) => {
        Reflect.deleteProperty(oneTimeCb, "__result");
        throw err;
      });
    }
    return await oneTimeCb.__result;
  };
  return oneTimeCb;
};

/**
 * Resets a `makeOneTime`-wrapped function so that the next call re-executes the
 * original callback. Intended for use in tests to restore a clean state between
 * test cases.
 *
 * @param {Function} oneTimeFn - A function previously returned by `makeOneTime`.
 */
const resetMakeOneTime = (oneTimeFn) => {
  Reflect.deleteProperty(oneTimeFn, "__result");
};

/**
 * Wraps an async function so that only one execution can be in-flight at a time.
 * If the wrapped function is called while a previous call is still running, the
 * concurrent call coalesces, it awaits and resolves to the same result as the
 * original caller. Once the running call settles, the next call will execute
 * normally.
 *
 * Use this to guard periodic or event-driven work where overlapping runs would
 * be wasteful or harmful, for example a polling handler that should not stack up.
 *
 * @param {Function} cb - Async function to wrap.
 * @returns {Function} Wrapped function that coalesces concurrent invocations.
 */
const makeExclusiveCoalescing = (cb) => {
  const coalescingCb = async (...args) => {
    if (!Object.prototype.hasOwnProperty.call(coalescingCb, "__runningPromise")) {
      coalescingCb.__runningPromise = Promise.resolve(cb(...args)).finally(() => {
        Reflect.deleteProperty(coalescingCb, "__runningPromise");
      });
    }
    return await coalescingCb.__runningPromise;
  };
  return coalescingCb;
};

/**
 * Wraps an async function so that only one execution can be in-flight at a time.
 * If the wrapped function is called while a previous call is still running, the
 * concurrent call is queued and will execute with its own arguments once the
 * current call (and any earlier queued calls) have settled. Each caller receives
 * its own result.
 *
 * Use this when each call must run but concurrent execution would cause conflicts,
 * for example sequential writes to a shared resource.
 *
 * @param {Function} cb - Async function to wrap.
 * @returns {Function} Wrapped function that queues concurrent invocations.
 */
const makeExclusiveQueueing = (cb) => {
  const queueingCb = async (...args) => {
    const chain = queueingCb.__chain ?? Promise.resolve();
    const currentPromise = chain.then(() => cb(...args));
    queueingCb.__chain = currentPromise.catch(() => {});
    return await currentPromise;
  };
  return queueingCb;
};

module.exports = {
  makeOneTime,
  resetMakeOneTime,
  makeExclusiveCoalescing,
  makeExclusiveQueueing,
};

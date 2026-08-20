"use strict";

const RESULT = Symbol("result");
const RUNNING_PROMISE = Symbol("runningPromise");
const CHAIN = Symbol("chain");

/**
 * Wraps an async function so that it is invoked only once. The first call executes
 * the callback and caches the resulting promise; all subsequent calls return the
 * same cached result. If the callback rejects, the cached result is cleared so
 * that the next invocation retries. Use this for one-time initialization such as
 * creating a shared client or reading a config file.
 *
 * The cached result is stashed on the wrapped function itself. Each call to
 * makeOneTime returns its own wrapper, so distinct callbacks never collide — and a
 * per-instance class field (`getX = makeOneTime(...)`) yields a fresh wrapper per
 * instance, giving each instance its own one-time result.
 *
 * Call `resetMakeOneTime(wrappedFn)` to clear the cached result so the next
 * invocation re-executes the callback.
 *
 * @template {Function} F
 * @param {F} cb - Async function to wrap.
 * @returns {F} Wrapped function that executes `cb` at most once.
 */
const makeOneTime = (cb) => {
  const oneTimeCb = async (...args) => {
    if (!Object.prototype.hasOwnProperty.call(oneTimeCb, RESULT)) {
      oneTimeCb[RESULT] = Promise.resolve(cb(...args)).catch((err) => {
        Reflect.deleteProperty(oneTimeCb, RESULT);
        throw err;
      });
    }
    return await oneTimeCb[RESULT];
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
  Reflect.deleteProperty(oneTimeFn, RESULT);
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
 * @template {Function} F
 * @param {F} cb - Async function to wrap.
 * @returns {F} Wrapped function that coalesces concurrent invocations.
 */
const makeExclusiveCoalescing = (cb) => {
  const coalescingCb = async (...args) => {
    if (!Object.prototype.hasOwnProperty.call(coalescingCb, RUNNING_PROMISE)) {
      coalescingCb[RUNNING_PROMISE] = Promise.resolve(cb(...args)).finally(() => {
        Reflect.deleteProperty(coalescingCb, RUNNING_PROMISE);
      });
    }
    return await coalescingCb[RUNNING_PROMISE];
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
 * @template {Function} F
 * @param {F} cb - Async function to wrap.
 * @returns {F} Wrapped function that queues concurrent invocations.
 */
const makeExclusiveQueueing = (cb) => {
  const queueingCb = async (...args) => {
    const chain = queueingCb[CHAIN] ?? Promise.resolve();
    const currentPromise = chain.then(() => cb(...args));
    queueingCb[CHAIN] = currentPromise.catch(() => {});
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

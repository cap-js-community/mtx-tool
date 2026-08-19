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
 * By default, the cached result is stashed on the wrapped function itself. Pass a
 * `target` object to stash it there instead — useful to keep the one-time state
 * off the callback, or to memoize against a stable object (for example `this` in a
 * class) when the wrapped function is recreated.
 *
 * Call `resetMakeOneTime(wrappedFn)` — or `resetMakeOneTime(target)` when a target
 * was given — to clear the cached result so the next invocation re-executes.
 *
 * @param {Function} cb - Async function to wrap.
 * @param {object} [target] - Object that holds the cached result; defaults to the wrapped function.
 * @returns {Function} Wrapped function that executes `cb` at most once.
 */
const makeOneTime = (cb, target) => {
  const oneTimeCb = async (...args) => {
    const store = target ?? oneTimeCb;
    if (!Object.prototype.hasOwnProperty.call(store, RESULT)) {
      store[RESULT] = Promise.resolve(cb(...args)).catch((err) => {
        Reflect.deleteProperty(store, RESULT);
        throw err;
      });
    }
    return await store[RESULT];
  };
  return oneTimeCb;
};

/**
 * Resets a `makeOneTime`-wrapped function, or the target it was given, so that the
 * next call re-executes the original callback. Works on either since both stash
 * the cached result under the same symbol. Intended for use in tests to restore a
 * clean state between test cases.
 *
 * @param {Function|object} oneTimeTarget - A `makeOneTime` wrapped function, or the
 *   `target` passed to `makeOneTime`.
 */
const resetMakeOneTime = (oneTimeTarget) => {
  Reflect.deleteProperty(oneTimeTarget, RESULT);
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
 * @param {Function} cb - Async function to wrap.
 * @returns {Function} Wrapped function that queues concurrent invocations.
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

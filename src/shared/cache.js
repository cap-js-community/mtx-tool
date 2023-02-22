"use strict";

const DEFAULT_SEPARATOR = "##";
const DEFAULT_EXPIRING_GAP = 500; // 0.5 seconds

class LazyCache {
  constructor({ separator = DEFAULT_SEPARATOR } = {}) {
    this.__data = Object.create(null);
    this.__separator = separator;
  }
  _separator() {
    return this.__separator;
  }
  _data() {
    return this.__data;
  }
  _key(keyOrKeys) {
    return Array.isArray(keyOrKeys) ? keyOrKeys.join(this.__separator) : keyOrKeys;
  }
  has(keyOrKeys) {
    return Object.prototype.hasOwnProperty.call(this.__data, this._key(keyOrKeys));
  }
  get(keyOrKeys) {
    return this.__data[this._key(keyOrKeys)];
  }
  set(keyOrKeys, value) {
    this.__data[this._key(keyOrKeys)] = value;
    return this;
  }
  setCb(keyOrKeys, callback, ...args) {
    const resultOrPromise = callback(...args);
    return this.set(
      keyOrKeys,
      resultOrPromise instanceof Promise
        ? resultOrPromise.catch((err) => {
            this.delete(keyOrKeys);
            return Promise.reject(err);
          })
        : resultOrPromise
    );
  }
  getSetCb(keyOrKeys, callback, ...args) {
    const key = this._key(keyOrKeys);
    if (!this.has(key)) {
      this.setCb(key, callback, ...args);
    }
    return this.get(key);
  }
  count() {
    return Object.keys(this.__data).length;
  }
  delete(keyOrKeys) {
    Reflect.deleteProperty(this.__data, this._key(keyOrKeys));
    return this;
  }
  clear() {
    this.__data = Object.create(null);
  }
}

module.exports = {
  DEFAULT_SEPARATOR,
  LazyCache,
};

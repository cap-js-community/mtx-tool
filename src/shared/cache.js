"use strict";

const DEFAULT_SEPARATOR = "##";
const DEFAULT_EXPIRATION_GAP = 500; // 0.5 seconds

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

class ExpiringLazyCache extends LazyCache {
  constructor({ separator = DEFAULT_SEPARATOR, expirationGap = DEFAULT_EXPIRATION_GAP } = {}) {
    super({ separator });
    this.__expirationGap = expirationGap;
  }
  _expiringGap() {
    return this.__expirationGap;
  }
  _isValid(expiration, currentTime) {
    return expiration && (currentTime ?? Date.now()) + this.__expirationGap <= expiration;
  }
  has(keyOrKeys, currentTime) {
    if (!super.has(keyOrKeys)) {
      return false;
    }
    const [expiration] = super.get(keyOrKeys) ?? [];
    return this._isValid(expiration, currentTime);
  }
  get(keyOrKeys, currentTime) {
    const [expiration, value] = super.get(keyOrKeys) ?? [];
    return this._isValid(expiration, currentTime) ? value : null;
  }
  set(keyOrKeys, expiration, value) {
    return super.set(keyOrKeys, [expiration, value]);
  }

  setCb(keyOrKeys, expirationExtractor, valueExtractor, callback, ...args) {
    const resultOrPromise = callback(...args);
    if (!(resultOrPromise instanceof Promise)) {
      return this.set(keyOrKeys, expirationExtractor(resultOrPromise), valueExtractor(resultOrPromise));
    }
    return this.set(
      keyOrKeys,
      Infinity,
      resultOrPromise
        .catch((err) => {
          this.delete(keyOrKeys);
          return Promise.reject(err);
        })
        .then((result) => {
          const expiration = expirationExtractor(result);
          const value = valueExtractor(result);
          this.set(keyOrKeys, expiration, value);
          return value;
        })
    );
  }

  getSetCb(keyOrKeys, currentTime, expirationExtractor, valueExtractor, callback, ...args) {
    const key = this._key(keyOrKeys);
    if (!this.has(key, currentTime) || !super.has(key)) {
      this.setCb(key, expirationExtractor, valueExtractor, callback, ...args);
      const [, value] = super.get(key);
      return value;
    }
    return this.get(key, currentTime);
  }
}

module.exports = {
  DEFAULT_EXPIRATION_GAP,
  DEFAULT_SEPARATOR,
  LazyCache,
  ExpiringLazyCache,
};

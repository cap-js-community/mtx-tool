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
  async _dataSettled() {
    return await Object.entries(this.__data).reduce(async (result, [key, value]) => {
      (await result)[key] = await value;
      return result;
    }, Promise.resolve({}));
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
  setCb(keyOrKeys, callback) {
    const resultOrPromise = callback();
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
  getSetCb(keyOrKeys, callback) {
    const key = this._key(keyOrKeys);
    if (!this.has(key)) {
      this.setCb(key, callback);
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
  _isValid(expiration, currentTime = Date.now()) {
    return expiration && currentTime + this.__expirationGap <= expiration;
  }
  has(keyOrKeys, currentTime = Date.now()) {
    if (!super.has(keyOrKeys)) {
      return false;
    }
    const [expiration] = super.get(keyOrKeys) ?? [];
    return this._isValid(expiration, currentTime);
  }
  get(keyOrKeys, currentTime = Date.now()) {
    const [expiration, value] = super.get(keyOrKeys) ?? [];
    return this._isValid(expiration, currentTime) ? value : undefined;
  }
  set(keyOrKeys, expiration, value) {
    return super.set(keyOrKeys, [expiration, value]);
  }

  static _extract(result, expirationExtractor, valueExtractor) {
    return expirationExtractor && valueExtractor ? [expirationExtractor(result), valueExtractor(result)] : result;
  }

  setCb(keyOrKeys, callback, { expirationExtractor, valueExtractor } = {}) {
    const resultOrPromise = callback();
    if (!(resultOrPromise instanceof Promise)) {
      const [expiration, value] = ExpiringLazyCache._extract(resultOrPromise, expirationExtractor, valueExtractor);
      return this.set(keyOrKeys, expiration, value);
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
          const [expiration, value] = ExpiringLazyCache._extract(result, expirationExtractor, valueExtractor);
          this.set(keyOrKeys, expiration, value);
          return value;
        })
    );
  }

  getSetCb(keyOrKeys, callback, { currentTime = Date.now(), expirationExtractor, valueExtractor } = {}) {
    const key = this._key(keyOrKeys);
    if (!this.has(key, currentTime) || !super.has(key)) {
      this.setCb(key, callback, { expirationExtractor, valueExtractor });
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

"use strict";

const sharedError = jest.requireActual("../../../src/shared/error");

module.exports = Object.fromEntries(
  Object.getOwnPropertyNames(sharedError).map((key) => {
    return [key, jest.fn(sharedError[key].bind(sharedError))];
  })
);

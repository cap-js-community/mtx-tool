"use strict";

const sharedStatic = jest.requireActual("../../../src/shared/static");

module.exports = Object.fromEntries(
  Object.getOwnPropertyNames(sharedStatic).map((key) => {
    return [key, jest.fn(sharedStatic[key].bind(sharedStatic))];
  })
);

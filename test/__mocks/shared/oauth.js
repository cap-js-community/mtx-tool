"use strict";

const sharedOAuth = jest.requireActual("../../../src/shared/oauth");

module.exports = Object.fromEntries(
  Object.getOwnPropertyNames(sharedOAuth).map((key) => {
    return [key, jest.fn(sharedOAuth[key].bind(sharedOAuth))];
  })
);

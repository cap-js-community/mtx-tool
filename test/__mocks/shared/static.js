"use strict";

const sharedStatic = jest.requireActual("../../../src/shared/static");

module.exports = Object.entries(sharedStatic).reduce((acc, [key, value]) => {
  if (typeof value === "function") {
    acc[key] = jest.fn(value.bind(sharedStatic));
  } else {
    acc[key] = value;
  }
  return acc;
}, {});

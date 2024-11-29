"use strict";

const { LEVEL } = jest.requireActual("../../../src/shared/logger");

class MockLogger {
  constructor() {}
  static getInstance() {
    if (!MockLogger.__instance) {
      MockLogger.__instance = new MockLogger();
    }
    return MockLogger.__instance;
  }
  info = jest.fn();
  warnings = jest.fn();
  error = jest.fn();
  setMaxLevel = jest.fn();
}

module.exports = { LEVEL, Logger: MockLogger };

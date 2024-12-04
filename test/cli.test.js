"use strict";

const { Logger: MockLogger } = require("../src/shared/logger");
const mockLogger = MockLogger.getInstance();
jest.mock("../src/shared/logger", () => require("./__mocks/shared/logger"));

const mockNewContext = jest.fn();
jest.mock("../src/context", () => ({
  newContext: mockNewContext,
}));

const { cli } = require("../src/cli");
const { APP_CLI_OPTIONS, USAGE } = require("../src/cliOptions");

const PAAS_CLIENT_TOKEN =
  "eyJhbGciOiJSUzI1NiIsImprdSI6Imh0dHBzOi8vc2t5ZmluLmF1dGhlbnRpY2F0aW9uLnNhcC5oYW5hLm9uZGVtYW5kLmNvbS90b2tlbl9rZXlzIiwia2lkIjoia2V5LWlkLTEiLCJ0eXAiOiJKV1QifQ.eyJqdGkiOiI1NDlhYmVlZWFjYzY0OWY2OGFmNTg5Y2FmZTMzYTJjNiIsImV4dF9hdHRyIjp7ImVuaGFuY2VyIjoiWFNVQUEiLCJzdWJhY2NvdW50aWQiOiI3YjIwNDA4ZS0zZmUwLTRhZGUtYWEyZS1hZDk3YmFhYzcyZTgiLCJ6ZG4iOiJza3lmaW4ifSwic3ViIjoic2ItYWZjLWRldiF0NTg3NCIsImF1dGhvcml0aWVzIjpbInVhYS5yZXNvdXJjZSIsImFmYy1kZXYhdDU4NzQubXRkZXBsb3ltZW50IiwiYWZjLWRldiF0NTg3NC5tdGNhbGxiYWNrIl0sInNjb3BlIjpbInVhYS5yZXNvdXJjZSIsImFmYy1kZXYhdDU4NzQubXRkZXBsb3ltZW50IiwiYWZjLWRldiF0NTg3NC5tdGNhbGxiYWNrIl0sImNsaWVudF9pZCI6InNiLWFmYy1kZXYhdDU4NzQiLCJjaWQiOiJzYi1hZmMtZGV2IXQ1ODc0IiwiYXpwIjoic2ItYWZjLWRldiF0NTg3NCIsImdyYW50X3R5cGUiOiJjbGllbnRfY3JlZGVudGlhbHMiLCJyZXZfc2lnIjoiYWI1OTRmNDMiLCJpYXQiOjE2MjE1MTQzNTksImV4cCI6MTYyMTU1NzU1OSwiaXNzIjoiaHR0cDovL3NreWZpbi5sb2NhbGhvc3Q6ODA4MC91YWEvb2F1dGgvdG9rZW4iLCJ6aWQiOiI3YjIwNDA4ZS0zZmUwLTRhZGUtYWEyZS1hZDk3YmFhYzcyZTgiLCJhdWQiOlsidWFhIiwic2ItYWZjLWRldiF0NTg3NCIsImFmYy1kZXYhdDU4NzQiXX0.u5LbQ7T01RNOwovupuLqi2xv9Sq8QPizY1k9MB4iNTnE6PrEacVaYhZFjBGuqRU6RDjIdfB1drzSGm1MwtrRAYkwWthu9YAfgHVanujXpjkD6NOE6J4sMfmJoy7e9BewJwPZ6l8k6G_Jqnm-9vURMlzjXRXqr1UyAVxlcqc4ZMikVc-25_XvYJKgp_qnbX1kBUwxECeTWtIB80SbroCgbGMwKCck58JyLr2RrZ4ZEPApeE-rWXFGDPtpmECzPRRl2aptA2Nur3fdl5g8Sqih5i_sSmIWMeoeViMVAgbbTZ-graNzcWB8yHri8UNZVihcl5cRAXH9Gvw4kNcYhSxP-Q";

const processExitSpy = jest.spyOn(process, "exit").mockReturnValue();

const uaaUserCallbackSpy = jest.spyOn(APP_CLI_OPTIONS.UAA_USER, "callback").mockReturnValue();
const uaaServiceUserCallbackSpy = jest.spyOn(APP_CLI_OPTIONS.UAA_SERVICE_USER, "callback").mockReturnValue();

const mockUsername = "freddy";
const mockPassword = "is_ready";
const mockService = "command_and_control";
const mockTenant = "troll_tenant";

describe("cli tests", () => {
  test("help", async () => {
    await cli(["--help"]);
    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    expect(mockLogger.info.mock.calls[0][0]).toBe(USAGE);
    expect(processExitSpy).toHaveBeenCalledTimes(0);
  });

  test("version", async () => {
    await cli(["--version"]);
    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    expect(mockLogger.info.mock.calls[0][0]).toMatch(/\w+ v\d+\.\d+\.\d+/);
    expect(processExitSpy).toHaveBeenCalledTimes(0);
  });

  test("force flag bypasses validation", async () => {
    await cli(["--uaa-decode", PAAS_CLIENT_TOKEN, "--force"]);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
    expect(processExitSpy).toHaveBeenCalledTimes(0);
  });

  test("uaa user with too few variables", async () => {
    await cli(["--uaa-user", mockUsername]);
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.error.mock.calls[0]).toMatchSnapshot();
    expect(processExitSpy).toHaveBeenCalledTimes(1);
    expect(processExitSpy).toHaveBeenCalledWith(-1);
  });

  test("uaa user with too many variables", async () => {
    await cli(["--uaa-user", mockUsername, mockPassword, mockTenant, mockService]);
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.error.mock.calls[0]).toMatchSnapshot();
    expect(processExitSpy).toHaveBeenCalledTimes(1);
    expect(processExitSpy).toHaveBeenCalledWith(-1);
  });

  test.each([
    ["uaa user with username password", ["--uaa-user", mockUsername, mockPassword], uaaUserCallbackSpy],
    [
      "uaa user with username password tenant",
      ["--uaa-user", mockUsername, mockPassword, mockTenant],
      uaaUserCallbackSpy,
    ],
    [
      "uaa service user with service username password",
      ["--uaa-service-user", mockService, mockUsername, mockPassword],
      uaaServiceUserCallbackSpy,
    ],
    [
      "uaa service user with service username password tenant",
      ["--uaa-service-user", mockService, mockUsername, mockPassword, mockTenant],
      uaaServiceUserCallbackSpy,
    ],
  ])("%s", async (_, args, callbackSpy) => {
    await cli(args);
    expect(callbackSpy).toHaveBeenCalledTimes(1);
    expect(callbackSpy.mock.calls[0]).toMatchSnapshot();
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    expect(mockLogger.info.mock.calls[0]).toMatchSnapshot();
  });

  test.each([
    ["uaa user via env", ["--uaa-user"], uaaUserCallbackSpy],
    ["uaa user via env with tenant", ["--uaa-user", mockTenant], uaaUserCallbackSpy],
    ["uaa service user via env with service", ["--uaa-service-user", mockService], uaaServiceUserCallbackSpy],
    [
      "uaa service user via env with service tenant",
      ["--uaa-service-user", mockService, mockTenant],
      uaaServiceUserCallbackSpy,
    ],
  ])("%s", async (_, args, callbackSpy) => {
    const envBackup = Object.assign({}, process.env);
    process.env.UAA_USERNAME = mockUsername;
    process.env.UAA_PASSWORD = mockPassword;
    await cli(args);
    process.env = envBackup;
    expect(callbackSpy).toHaveBeenCalledTimes(1);
    expect(callbackSpy.mock.calls[0]).toMatchSnapshot();
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    expect(mockLogger.info.mock.calls[0]).toMatchSnapshot();
  });
});

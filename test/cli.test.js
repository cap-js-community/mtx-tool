"use strict";

const { Logger: MockLogger } = require("../src/shared/logger");
const mockLogger = MockLogger.getInstance();
jest.mock("../src/shared/logger", () => require("./__mocks/shared/logger"));

const mockNewContext = jest.fn();
jest.mock("../src/context", () => ({
  newContext: mockNewContext,
}));

const { cli } = require("../src/cli");
const { APP_CLI_OPTIONS } = require("../src/cliOptions");

const processExitSpy = jest.spyOn(process, "exit").mockReturnValue();

const uaaUserCallbackSpy = jest.spyOn(APP_CLI_OPTIONS.UAA_USER, "callback").mockReturnValue();
const uaaServiceUserCallbackSpy = jest.spyOn(APP_CLI_OPTIONS.UAA_SERVICE_USER, "callback").mockReturnValue();

const mockUsername = "freddy";
const mockPassword = "is_ready";
const mockService = "command_and_control";
const mockTenant = "troll_tenant";

describe("cli tests", () => {
  afterEach(() => {
    jest.clearAllMocks();
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

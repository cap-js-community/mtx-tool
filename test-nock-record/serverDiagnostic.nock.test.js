"use strict";

jest.mock("../src/shared/static", () => {
  const staticlib = jest.requireActual("../src/shared/static");
  return {
    ...staticlib,
    writeTextSync: jest.fn(),
  };
});

const pathlib = require("path");
const nock = require("nock");

const { newContext } = require("../src/context");
const srv = require("../src/submodules/serverDiagnostic");
const { anonymizeNock } = require("./util/anonymizeNock");

nock.back.fixtures = pathlib.resolve(`${__dirname}/__nock-fixtures__`);
nock.back.setMode("update");

jest.setTimeout(300000); // 5 min

const { Logger } = require("../src/shared/logger");
const errorLoggerSpy = jest.spyOn(Logger.getInstance(), "error");

const freshContext = async () => await newContext({ usePersistedCache: false, isReadonlyCommand: false });

describe("srv nock", () => {
  afterEach(() => {
    nock.restore();
  });

  test("record srv env default", async () => {
    const { nockDone } = await nock.back("srv-env-default.json", { afterRecord: anonymizeNock });
    await srv.serverEnvironment(await freshContext(), []);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });

  test("record srv env custom-app", async () => {
    const { nockDone } = await nock.back("srv-env-custom.json", { afterRecord: anonymizeNock });
    await srv.serverEnvironment(await freshContext(), ["afc-frontend"]);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });

  test("record srv certificates default", async () => {
    const { nockDone } = await nock.back("srv-cert-default.json", { afterRecord: anonymizeNock });
    await srv.serverCertificates(await freshContext(), []);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });

  test("record srv certificates custom", async () => {
    const { nockDone } = await nock.back("srv-cert-custom.json", { afterRecord: anonymizeNock });
    await srv.serverCertificates(await freshContext(), ["afc-frontend", "0"]);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });
});

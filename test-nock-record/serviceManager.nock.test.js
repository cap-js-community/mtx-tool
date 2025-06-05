"use strict";

const pathlib = require("path");
const nock = require("nock");

const { newContext } = require("../src/context");
const svm = require("../src/submodules/serviceManager");
const { anonymizeNock } = require("./util/anonymizeNock");

nock.back.fixtures = pathlib.resolve(`${__dirname}/__nock-fixtures__`);
nock.back.setMode("update");

jest.setTimeout(240000);

const { Logger } = require("../src/shared/logger");
const errorLoggerSpy = jest.spyOn(Logger.getInstance(), "error");

const testTenantId = "5ecc7413-2b7e-414a-9496-ad4a61f6cccf";

const freshContext = async () => await newContext({ usePersistedCache: false, isReadonlyCommand: false });

describe("svm nock", () => {
  afterEach(() => {
    svm._._reset();
    nock.restore();
  });

  test("record svm list basic", async () => {
    const { nockDone } = await nock.back("hdi-list.json", { afterRecord: anonymizeNock });
    await svm.serviceManagerList(await freshContext(), [], [false, false]);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });

  test("record svm list filtered", async () => {
    const { nockDone } = await nock.back("hdi-list-filtered.json", { afterRecord: anonymizeNock });
    await svm.serviceManagerList(await freshContext(), [testTenantId], [false, false]);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });

  test("record svm long list basic", async () => {
    const { nockDone } = await nock.back("hdi-long-list.json", { afterRecord: anonymizeNock });
    await svm.serviceManagerList(await freshContext(), [], [false, false]);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });

  test("record svm long list filtered", async () => {
    const { nockDone } = await nock.back("hdi-long-list-filtered.json", { afterRecord: anonymizeNock });
    await svm.serviceManagerList(await freshContext(), [testTenantId], [false, false]);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });
});

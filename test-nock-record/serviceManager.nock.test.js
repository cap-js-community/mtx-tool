"use strict";

const pathlib = require("path");
const nock = require("nock");

const { newContext } = require("../src/context");
const svm = require("../src/submodules/serviceManager");
const { trimAndAnonymize } = require("./util/trimAndAnonymize");

nock.back.fixtures = pathlib.resolve(`${__dirname}/__nock-fixtures__`);
nock.back.setMode("update");

jest.setTimeout(300000); // 5 min

const { Logger } = require("../src/shared/logger");
const { resetMakeOneTime } = require("../src/shared/execution-control");
const errorLoggerSpy = jest.spyOn(Logger.getInstance(), "error");

const testTenantId = "5ecc7413-2b7e-414a-9496-ad4a61f6cccf";

const freshContext = async () => await newContext({ usePersistedCache: false, isReadonlyCommand: false });

describe("svm nock", () => {
  afterEach(() => {
    resetMakeOneTime(svm._._requestOfferings);
    resetMakeOneTime(svm._._requestPlans);
    nock.restore();
  });

  test("record svm list basic", async () => {
    const { nockDone } = await nock.back("svm-list.json", { afterRecord: trimAndAnonymize });
    await svm.serviceManagerList(await freshContext(), [], [false, false]);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });

  test("record svm list filtered", async () => {
    const { nockDone } = await nock.back("svm-list-filtered.json", { afterRecord: trimAndAnonymize });
    await svm.serviceManagerList(await freshContext(), [testTenantId], [false, false]);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });

  test("record svm long list basic", async () => {
    const { nockDone } = await nock.back("svm-long-list.json", { afterRecord: trimAndAnonymize });
    await svm.serviceManagerLongList(await freshContext(), [], [false, false]);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });

  test("record svm long list filtered", async () => {
    const { nockDone } = await nock.back("svm-long-list-filtered.json", { afterRecord: trimAndAnonymize });
    await svm.serviceManagerLongList(await freshContext(), [testTenantId], [false, false]);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });
});

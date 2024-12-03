"use strict";

const pathlib = require("path");
const nock = require("nock");

const { newContext } = require("../src/context");
const hdi = require("../src/submodules/hanaManagement");
const { anonymizeNock } = require("./util/anonymizeNock");

nock.back.fixtures = pathlib.resolve(`${__dirname}/__nock-fixtures__`);
nock.back.setMode("update");

jest.setTimeout(240000);

const { Logger } = require("../src/shared/logger");
const errorLoggerSpy = jest.spyOn(Logger.getInstance(), "error");

const testTenantId = "5ecc7413-2b7e-414a-9496-ad4a61f6cccf";

const freshContext = async () => await newContext({ usePersistedCache: false, isReadonlyCommand: false });

describe("hdi nock", () => {
  afterEach(() => {
    hdi._._reset();
    nock.restore();
  });

  test("record hdi list basic", async () => {
    const { nockDone } = await nock.back("hdi-list.json", { afterRecord: anonymizeNock });
    await hdi.hdiList(await freshContext(), [], [false, false]);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });

  test("record hdi list filtered", async () => {
    const { nockDone } = await nock.back("hdi-list-filtered.json", { afterRecord: anonymizeNock });
    await hdi.hdiList(await freshContext(), [testTenantId], [false, false]);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });

  test("record hdi long list basic", async () => {
    const { nockDone } = await nock.back("hdi-long-list.json", { afterRecord: anonymizeNock });
    await hdi.hdiLongList(await freshContext(), [], [false, false]);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });

  test("record hdi long list filtered", async () => {
    const { nockDone } = await nock.back("hdi-long-list-filtered.json", { afterRecord: anonymizeNock });
    await hdi.hdiLongList(await freshContext(), [testTenantId], [false, false]);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });
});

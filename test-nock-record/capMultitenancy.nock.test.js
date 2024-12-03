"use strict";

const pathlib = require("path");
const nock = require("nock");

const { newContext } = require("../src/context");
const cds = require("../src/submodules/capMultitenancy");
const { anonymizeNock } = require("./util/anonymizeNock");

nock.back.fixtures = pathlib.resolve(`${__dirname}/__nock-fixtures__`);
nock.back.setMode("update");

jest.setTimeout(240000);

const { Logger } = require("../src/shared/logger");
const errorLoggerSpy = jest.spyOn(Logger.getInstance(), "error");

const testTenantId = "5ecc7413-2b7e-414a-9496-ad4a61f6cccf";

const freshContext = async () => await newContext({ usePersistedCache: false, isReadonlyCommand: false });

describe("cds tests", () => {
  afterEach(() => {
    cds._._reset();
    nock.restore();
  });

  test("cds list basic", async () => {
    const { nockDone } = await nock.back("cds-list.json", { afterRecord: anonymizeNock });
    await cds.cdsList(await freshContext(), [], [false, false]);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });

  test("cds list filtered", async () => {
    const { nockDone } = await nock.back("cds-list-filtered.json", { afterRecord: anonymizeNock });
    await cds.cdsList(await freshContext(), [testTenantId], [false, false]);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });

  test("cds long list basic", async () => {
    const { nockDone } = await nock.back("cds-long-list.json", { afterRecord: anonymizeNock });
    await cds.cdsLongList(await freshContext(), []);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });

  test("cds long list filtered", async () => {
    const { nockDone } = await nock.back("cds-long-list-filtered.json", { afterRecord: anonymizeNock });
    await cds.cdsLongList(await freshContext(), [testTenantId]);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });

  test("cds upgrade tenant and auto-undeploy", async () => {
    const { nockDone } = await nock.back("cds-upgrade-tenant.json", { afterRecord: anonymizeNock });
    await cds.cdsUpgradeTenant(await freshContext(), [testTenantId], [true]);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });

  test("cds upgrade all", async () => {
    const { nockDone } = await nock.back("cds-upgrade-all.json", { afterRecord: anonymizeNock });
    await cds.cdsUpgradeAll(await freshContext(), null, [false]);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });
});

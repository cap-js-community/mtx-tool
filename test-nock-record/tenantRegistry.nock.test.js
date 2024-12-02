"use strict";

const pathlib = require("path");
const nock = require("nock");

const { newContext } = require("../src/context");
const reg = require("../src/submodules/tenantRegistry");
const { anonymizeNock } = require("./util/anonymizeNock");

nock.back.fixtures = pathlib.resolve(`${__dirname}/__nock-fixtures__`);
nock.back.setMode("update");

jest.setTimeout(480000);

const { Logger } = require("../src/shared/logger");
const errorLoggerSpy = jest.spyOn(Logger.getInstance(), "error");

const testTenantId = "5ecc7413-2b7e-414a-9496-ad4a61f6cccf";

const freshContext = async () => await newContext({ usePersistedCache: false, isReadonlyCommand: false });

describe("reg tests", () => {
  afterEach(() => {
    nock.restore();
    jest.clearAllMocks();
  });

  test("record reg list basic", async () => {
    const { nockDone } = await nock.back("reg-list.json", { afterRecord: anonymizeNock });
    await reg.registryListSubscriptions(await freshContext(), [], [false, false, false, false]);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });

  test("record reg list filtered", async () => {
    const { nockDone } = await nock.back("reg-list-filtered.json", { afterRecord: anonymizeNock });
    await reg.registryListSubscriptions(await freshContext(), [testTenantId], [false, false, false, false]);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });

  test("record reg long list", async () => {
    const { nockDone } = await nock.back("reg-long-list.json", { afterRecord: anonymizeNock });
    await reg.registryLongListSubscriptions(await freshContext(), [], [false, false, false]);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });

  test("record reg long list filtered", async () => {
    const { nockDone } = await nock.back("reg-long-list-filtered.json", { afterRecord: anonymizeNock });
    await reg.registryLongListSubscriptions(await freshContext(), [], [false, false, false]);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });

  test("reg service config", async () => {
    const { nockDone } = await nock.back("reg-service-config.json", { afterRecord: anonymizeNock });
    await reg.registryServiceConfig(await freshContext());
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });

  test("reg update tenant", async () => {
    const { nockDone } = await nock.back("reg-update-tenant.json", { afterRecord: anonymizeNock });
    await reg.registryUpdateDependencies(await freshContext(), [testTenantId], []);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });

  test("reg update tenant all", async () => {
    const { nockDone } = await nock.back("reg-update-tenant-all.json", { afterRecord: anonymizeNock });
    await reg.registryUpdateAllDependencies(await freshContext(), undefined, []);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });

  test("reg update tenant application url all", async () => {
    const { nockDone } = await nock.back("reg-update-tenant-app-url-all.json", { afterRecord: anonymizeNock });
    await reg.registryUpdateApplicationURL(await freshContext(), [], []);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });

  test("reg update tenant application url with tenant", async () => {
    const { nockDone } = await nock.back("req-update-tenant-app-url.json", { afterRecord: anonymizeNock });
    await reg.registryUpdateApplicationURL(await freshContext(), [testTenantId], []);
    nockDone();
    expect(errorLoggerSpy).toHaveBeenCalledTimes(0);
  });
});

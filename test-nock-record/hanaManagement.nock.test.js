"use strict";

const pathlib = require("path");
const nock = require("nock");

const { newContext } = require("../src/context");
const hdi = require("../src/submodules/hanaManagement");
const { anonymizeNock } = require("./util/anonymizeNock");

nock.back.fixtures = pathlib.resolve(`${__dirname}/__nock-fixtures__`);
nock.back.setMode("update");

const { Logger: MockLogger } = require("../src/shared/logger");
const mockLogger = MockLogger.getInstance();
jest.mock("../src/shared/logger", () => require("../test/__mocks/shared/logger"));

jest.setTimeout(240000);

const testTenantId = "5ecc7413-2b7e-414a-9496-ad4a61f6cccf";

const freshContext = async () => await newContext({ usePersistedCache: false, isReadonlyCommand: false });

describe("hdi nock", () => {
  beforeEach(() => {
    nock.restore();
    hdi._._reset();
    jest.clearAllMocks();
  });

  test("record hdi list", async () => {
    const { nockDone } = await nock.back("hdi-list.json", { afterRecord: anonymizeNock });
    await hdi.hdiList(await freshContext(), [], [true, false]);
    nockDone();
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });

  test("record hdi list filtered", async () => {
    const { nockDone } = await nock.back("hdi-list-filtered.json", { afterRecord: anonymizeNock });
    await hdi.hdiList(await freshContext(), [testTenantId], [true, false]);
    nockDone();
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });

  test("record hdi long list", async () => {
    const { nockDone } = await nock.back("hdi-long-list.json", { afterRecord: anonymizeNock });
    await hdi.hdiLongList(await freshContext(), [], [false, true]);
    nockDone();
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });

  test("record hdi long list filtered", async () => {
    const { nockDone } = await nock.back("hdi-long-list-filtered.json", { afterRecord: anonymizeNock });
    await hdi.hdiLongList(await freshContext(), [testTenantId], [false, true]);
    nockDone();
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });
});

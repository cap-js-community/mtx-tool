"use strict";

/**
 * TODO the recording and playback "tests" should be split up.
 * The recording needs the reset the modules for each file to work around "makeOneTime" style functions
 * that keep state and make requests superfluous.
 */

const pathlib = require("path");
const nock = require("nock");

const { newContext } = require("../src/context");
const hdi = require("../src/submodules/hanaManagement");
const { anonymizeNock } = require("./util/anonymizeNock");

const nockBack = nock.back;
nockBack.fixtures = pathlib.join(__dirname, "__nock-fixtures__");
nockBack.setMode("update");

const { Logger: MockLogger } = require("../src/shared/logger");
const mockLogger = MockLogger.getInstance();
jest.mock("../src/shared/logger", () => require("../test/__mocks/shared/logger"));

jest.setTimeout(240000);

const testTenantId = "5ecc7413-2b7e-414a-9496-ad4a61f6cccf";

const freshContext = async () => await newContext({ usePersistedCache: false, isReadonlyCommand: false });

describe("hdi nock", () => {
  beforeEach(() => {
    nock.restore();
    hdi._._resetGetHdiSharedPlanId();
    jest.clearAllMocks();
  });

  test("record hdi list", async () => {
    const { nockDone } = await nockBack("hdi-list.json", { afterRecord: anonymizeNock });
    await hdi.hdiList(await freshContext(), [], [true, false]);
    nockDone();
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });

  test("record hdi list filtered", async () => {
    const { nockDone } = await nockBack("hdi-list-filtered.json", { afterRecord: anonymizeNock });
    await hdi.hdiList(await freshContext(), [testTenantId], [true, false]);
    nockDone();
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });

  test("record hdi long list", async () => {
    const { nockDone } = await nockBack("hdi-long-list.json", { afterRecord: anonymizeNock });
    await hdi.hdiLongList(await freshContext(), [], [false, true]);
    nockDone();
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });

  test("record hdi long list filtered", async () => {
    const { nockDone } = await nockBack("hdi-long-list-filtered.json", { afterRecord: anonymizeNock });
    await hdi.hdiLongList(await freshContext(), [testTenantId], [false, true]);
    nockDone();
    expect(mockLogger.error.mock.calls).toHaveLength(0);
  });
});

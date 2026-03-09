"use strict";

const pathlib = require("path");
const nock = require("nock");

const { newContext } = require("../../src/context");
const srv = require("../../src/submodules/serverDiagnostic");
const { collectRequestCount } = require("../test-util/static");

nock.back.fixtures = pathlib.resolve(`${__dirname}/../../test-nock-record/__nock-fixtures__`);
nock.back.setMode("lockdown");

const mockStatic = require("../../src/shared/static");
jest.mock("../../src/shared/static", () => require("../__mocks/sharedNockPlayback/static"));

const { Logger: MockLogger } = require("../../src/shared/logger");
const mockLogger = MockLogger.getInstance();
jest.mock("../../src/shared/logger", () => require("../__mocks/shared/logger"));

const freshContext = async () => await newContext({ usePersistedCache: false, isReadonlyCommand: false });

describe("srv nock tests", () => {
  afterEach(() => {
    nock.restore();
  });

  test("request count", async () => {
    expect(collectRequestCount(require(`${nock.back.fixtures}/srv-env-default.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 21,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/srv-env-custom.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 21,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/srv-cert-default.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 20,
      }
    `);
    expect(collectRequestCount(require(`${nock.back.fixtures}/srv-cert-custom.json`))).toMatchInlineSnapshot(`
      {
        "GET https://api.cf.sap.hana.ondemand.com:443": 17,
      }
    `);
  });

  describe("srv env", () => {
    test("default", async () => {
      await nock.back("srv-env-default.json");
      await expect(srv.serverEnvironment(await freshContext(), [])).resolves.toBeUndefined();
      expect(mockStatic.writeTextSync).toHaveBeenCalledTimes(1);
      expect(mockStatic.writeTextSync.mock.calls[0]).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("custom", async () => {
      await nock.back("srv-env-custom.json");
      await expect(srv.serverEnvironment(await freshContext(), ["afc-frontend"])).resolves.toBeUndefined();
      expect(mockStatic.writeTextSync).toHaveBeenCalledTimes(1);
      expect(mockStatic.writeTextSync.mock.calls[0]).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });
  });

  describe("srv cert", () => {
    test("default", async () => {
      await nock.back("srv-cert-default.json");
      await expect(srv.serverCertificates(await freshContext(), [])).resolves.toBeUndefined();
      expect(mockStatic.writeTextSync).toHaveBeenCalledTimes(2);
      expect(mockStatic.writeTextSync.mock.calls[0]).toMatchSnapshot();
      expect(mockStatic.writeTextSync.mock.calls[1]).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("custom instance 0", async () => {
      await nock.back("srv-cert-custom.json");
      await expect(srv.serverCertificates(await freshContext(), ["afc-frontend", "0"])).resolves.toBeUndefined();
      expect(mockStatic.writeTextSync).toHaveBeenCalledTimes(2);
      expect(mockStatic.writeTextSync.mock.calls[0]).toMatchSnapshot();
      expect(mockStatic.writeTextSync.mock.calls[1]).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("custom instance 1", async () => {
      await nock.back("srv-cert-custom.json");
      await expect(srv.serverCertificates(await freshContext(), ["afc-frontend", "1"])).resolves.toBeUndefined();
      expect(mockStatic.writeTextSync).toHaveBeenCalledTimes(2);
      expect(mockStatic.writeTextSync.mock.calls[0]).toMatchSnapshot();
      expect(mockStatic.writeTextSync.mock.calls[1]).toMatchSnapshot();
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });
  });
});

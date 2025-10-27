"use strict";

const { format } = require("util");
const realStatic = jest.requireActual("../../../src/shared/static");

const mockCfConfig = {
  OrganizationFields: {
    GUID: "792854a5-6fa0-456f-bbe7-17a4400fad6c",
    Name: "skyfin",
  },
  SpaceFields: {
    GUID: "0215304c-3d6f-4f02-ae4f-a9bd6a9d46e9",
    Name: "dev",
  },
  Target: "https://api.cf.sap.hana.ondemand.com",
};

const mockRuntimeConfig = {
  uaaAppName: "afc-backend",
  regAppName: "afc-mtx",
  smsAppName: "afc-mtx",
  cdsAppName: "afc-mtx",
  hdiAppName: "afc-backend",
  srvAppName: "afc-backend",
};

module.exports = {
  ...realStatic,
  // mock file read and access
  tryReadJsonSync: jest.fn((filepath) => {
    if (filepath.endsWith("config.json")) {
      return mockCfConfig;
    } else if (filepath.endsWith(".mtxrc.json")) {
      return mockRuntimeConfig;
    } else if (filepath.endsWith(".mtxcache.json")) {
      return null;
    }
  }),
  tryAccessSync: jest.fn((filepath) => {
    if (filepath.endsWith(".mtxrc.json")) {
      return true;
    }
  }),
  writeTextSync: jest.fn(),
  writeTextAsync: jest.fn(),
  writeJsonSync: jest.fn(),
  writeJsonAsync: jest.fn(),
  // mock spawn
  spawnAsync: jest.fn(async (command, args) => {
    switch (`${command} ${args.join(" ")}`) {
      case "cf oauth-token":
        return ["bearer xxx"];
      default:
        return [format("%s %O", command, args)];
    }
  }),
  dateDiffInDays: jest.fn().mockReturnValue(0),
  dateDiffInSeconds: jest.fn().mockReturnValue(0),
  // speed up sleep
  sleep: jest.fn(),
};

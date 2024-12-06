"use strict";

const mockRequest = require("../../src/shared/request");
jest.mock("../../src/shared/request", () => ({
  request: jest.fn(),
}));

jest.mock("../../src/shared/static", () => {
  const staticLib = jest.requireActual("../../src/shared/static");
  return {
    ...staticLib,
    sleep: jest.fn(),
  };
});

const { Logger: MockLogger } = require("../../src/shared/logger");
const mockLogger = MockLogger.getInstance();
jest.mock("../../src/shared/logger", () => require("../__mocks/shared/logger"));

const cds = require("../../src/submodules/capMultitenancy");
const { outputFromLoggerPartitionFetch } = require("../test-util/static");

const fakeContext = {
  getCdsInfo: () => ({
    cfAppName: "app-mtx-name",
    cfAppGuid: "app-mtx-guid",
    cfRouteUrl: "route-url",
    cfProcess: { instances: 1 },
  }),
  getCachedUaaToken: () => "token",
  getCachedUaaTokenFromCredentials: () => "token",
};

describe("cds tests", () => {
  test("cds upgrade request fails", async () => {
    mockRequest.request.mockReturnValueOnce({
      text: () =>
        JSON.stringify({
          ID: "8fd6894a-91d6-4eed-b772-1be05b8ac6ed",
          createdAt: "2024-06-03T12:33:51.877Z",
          op: "upgrade",
          tenants: {
            "00000000-0000-4000-8000-000000000103": {
              ID: "aab16377-e8ce-4d30-b50a-f5ff657b6120",
            },
            "00000000-0000-4000-8000-000000000102": {
              ID: "7bad7b8a-febd-4897-9dfe-82850b552dae",
            },
            "00000000-0000-4000-8000-000000000101": {
              ID: "5496dbe8-6596-4d57-9b4b-c5ad4f8ba8de",
            },
            "5ecc7413-2b7e-414a-9496-ad4a61f6cccf": {
              ID: "6fa9f693-590b-446a-ae23-6c3b194cafaa",
            },
            "dde70ec5-983d-4848-b50c-fb2cdac7d359": {
              ID: "a1f37350-65a3-4e74-96cf-f38886268996",
            },
            "6917dfd6-7590-4033-af2a-140b75263b0d": {
              ID: "8735e793-ae88-45e5-b38d-c16d9ac435a5",
            },
          },
          tasks: {
            "00000000-0000-4000-8000-000000000101": {
              job_ID: "8fd6894a-91d6-4eed-b772-1be05b8ac6ed",
              ID: "5496dbe8-6596-4d57-9b4b-c5ad4f8ba8de",
              tenant: "00000000-0000-4000-8000-000000000101",
              op: "upgrade",
            },
            "00000000-0000-4000-8000-000000000102": {
              job_ID: "8fd6894a-91d6-4eed-b772-1be05b8ac6ed",
              ID: "7bad7b8a-febd-4897-9dfe-82850b552dae",
              tenant: "00000000-0000-4000-8000-000000000102",
              op: "upgrade",
            },
            "00000000-0000-4000-8000-000000000103": {
              job_ID: "8fd6894a-91d6-4eed-b772-1be05b8ac6ed",
              ID: "aab16377-e8ce-4d30-b50a-f5ff657b6120",
              tenant: "00000000-0000-4000-8000-000000000103",
              op: "upgrade",
            },
            "5ecc7413-2b7e-414a-9496-ad4a61f6cccf": {
              job_ID: "8fd6894a-91d6-4eed-b772-1be05b8ac6ed",
              ID: "6fa9f693-590b-446a-ae23-6c3b194cafaa",
              tenant: "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
              op: "upgrade",
            },
            "6917dfd6-7590-4033-af2a-140b75263b0d": {
              job_ID: "8fd6894a-91d6-4eed-b772-1be05b8ac6ed",
              ID: "8735e793-ae88-45e5-b38d-c16d9ac435a5",
              tenant: "6917dfd6-7590-4033-af2a-140b75263b0d",
              op: "upgrade",
            },
            "dde70ec5-983d-4848-b50c-fb2cdac7d359": {
              job_ID: "8fd6894a-91d6-4eed-b772-1be05b8ac6ed",
              ID: "a1f37350-65a3-4e74-96cf-f38886268996",
              tenant: "dde70ec5-983d-4848-b50c-fb2cdac7d359",
              op: "upgrade",
            },
          },
        }),
    });

    mockRequest.request.mockReturnValueOnce({
      text: () =>
        JSON.stringify({
          ID: "8fd6894a-91d6-4eed-b772-1be05b8ac6ed",
          op: "upgrade",
          error: null,
          status: "FAILED",
          tasks: [
            {
              ID: "5496dbe8-6596-4d57-9b4b-c5ad4f8ba8de",
              status: "FAILED",
              tenant: "00000000-0000-4000-8000-000000000101",
              error: "HDI deployment failed with exit code 1",
            },
            {
              ID: "7bad7b8a-febd-4897-9dfe-82850b552dae",
              status: "FAILED",
              tenant: "00000000-0000-4000-8000-000000000102",
              error: "HDI deployment failed with exit code 1",
            },
            {
              ID: "aab16377-e8ce-4d30-b50a-f5ff657b6120",
              status: "FAILED",
              tenant: "00000000-0000-4000-8000-000000000103",
              error: "HDI deployment failed with exit code 1",
            },
            {
              ID: "6fa9f693-590b-446a-ae23-6c3b194cafaa",
              status: "FAILED",
              tenant: "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
              error: "HDI deployment failed with exit code 1",
            },
            {
              ID: "8735e793-ae88-45e5-b38d-c16d9ac435a5",
              status: "FAILED",
              tenant: "6917dfd6-7590-4033-af2a-140b75263b0d",
              error: "HDI deployment failed with exit code 1",
            },
            {
              ID: "a1f37350-65a3-4e74-96cf-f38886268996",
              status: "FAILED",
              tenant: "dde70ec5-983d-4848-b50c-fb2cdac7d359",
              error: "HDI deployment failed with exit code 1",
            },
          ],
          tenants: {
            "00000000-0000-4000-8000-000000000101": {
              status: "FAILED",
              error: "HDI deployment failed with exit code 1",
            },
            "00000000-0000-4000-8000-000000000102": {
              status: "FAILED",
              error: "HDI deployment failed with exit code 1",
            },
            "00000000-0000-4000-8000-000000000103": {
              status: "FAILED",
              error: "HDI deployment failed with exit code 1",
            },
            "5ecc7413-2b7e-414a-9496-ad4a61f6cccf": {
              status: "FAILED",
              error: "HDI deployment failed with exit code 1",
            },
            "6917dfd6-7590-4033-af2a-140b75263b0d": {
              status: "FAILED",
              error: "HDI deployment failed with exit code 1",
            },
            "dde70ec5-983d-4848-b50c-fb2cdac7d359": {
              status: "FAILED",
              error: "HDI deployment failed with exit code 1",
            },
          },
        }),
    });

    await expect(cds.cdsUpgradeAll(fakeContext, [], [])).rejects.toMatchInlineSnapshot(
      `[Error: error happened during tenant upgrade]`
    );

    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "started upgrade on server with jobId 8fd6894a-91d6-4eed-b772-1be05b8ac6ed polling interval 15sec
      job 8fd6894a-91d6-4eed-b772-1be05b8ac6ed is FAILED with tasks queued/running: 0/0 | failed/finished: 6/0
      #  tenantId                              status  message                               
      1  00000000-0000-4000-8000-000000000101  FAILED  HDI deployment failed with exit code 1
      2  00000000-0000-4000-8000-000000000102  FAILED  HDI deployment failed with exit code 1
      3  00000000-0000-4000-8000-000000000103  FAILED  HDI deployment failed with exit code 1
      4  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  FAILED  HDI deployment failed with exit code 1
      5  6917dfd6-7590-4033-af2a-140b75263b0d  FAILED  HDI deployment failed with exit code 1
      6  dde70ec5-983d-4848-b50c-fb2cdac7d359  FAILED  HDI deployment failed with exit code 1
      "
    `);

    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });
});

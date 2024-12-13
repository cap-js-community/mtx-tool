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
const { JOB_STATUS, TASK_STATUS } = cds;

const { outputFromLoggerPartitionFetch } = require("../test-util/static");

const MINUTES_IN_MILLIS = 60 * 1000;

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

const mockJob = { ID: "8fd6894a-91d6-4eed-b772-1be05b8ac6ed", op: "upgrade" };
const mockJobTasks = [
  {
    ID: "5496dbe8-6596-4d57-9b4b-c5ad4f8ba8de",
    tenant: "00000000-0000-4000-8000-000000000101",
    op: "upgrade",
  },
  {
    ID: "7bad7b8a-febd-4897-9dfe-82850b552dae",
    tenant: "00000000-0000-4000-8000-000000000102",
    op: "upgrade",
  },
  {
    ID: "aab16377-e8ce-4d30-b50a-f5ff657b6120",
    tenant: "00000000-0000-4000-8000-000000000103",
    op: "upgrade",
  },
  {
    ID: "6fa9f693-590b-446a-ae23-6c3b194cafaa",
    tenant: "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
    op: "upgrade",
  },
  {
    ID: "8735e793-ae88-45e5-b38d-c16d9ac435a5",
    tenant: "6917dfd6-7590-4033-af2a-140b75263b0d",
    op: "upgrade",
  },
  {
    ID: "a1f37350-65a3-4e74-96cf-f38886268996",
    tenant: "dde70ec5-983d-4848-b50c-fb2cdac7d359",
    op: "upgrade",
  },
];

const mockInitialResponse = () => {
  return {
    ...mockJob,
    tenants: mockJobTasks.reduce((acc, entry) => {
      acc[entry.tenant] = { ID: entry.ID };
      return acc;
    }, {}),
    tasks: mockJobTasks.reduce((acc, entry) => {
      acc[entry.tenant] = { ...entry, job_ID: mockJob.ID };
      return acc;
    }, {}),
  };
};

const mockOngoingResponse = (jobStatus = JOB_STATUS.QUEUED, taskStatuses = []) => {
  taskStatuses = Array.from({ length: 6 }).map((_, i) => taskStatuses[i] ?? jobStatus);
  return {
    ...mockJob,
    status: jobStatus,
    error: null,
    tenants: mockJobTasks.reduce((acc, entry, i) => {
      acc[entry.tenant] = {
        ID: entry.ID,
        status: taskStatuses[i],
        ...(taskStatuses[i] === TASK_STATUS.FAILED && { error: "HDI deployment failed with exit code 1" }),
      };
      return acc;
    }, {}),
    tasks: mockJobTasks.map((entry, i) => ({
      ...entry,
      job_ID: mockJob.ID,
      status: taskStatuses[i],
      ...(taskStatuses[i] === TASK_STATUS.FAILED && { error: "HDI deployment failed with exit code 1" }),
    })),
  };
};

describe("cds tests", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  test("cds upgrade request fails", async () => {
    mockRequest.request.mockReturnValueOnce({
      text: () => JSON.stringify(mockInitialResponse()),
    });

    mockRequest.request.mockReturnValueOnce({
      text: () => JSON.stringify(mockOngoingResponse(JOB_STATUS.FAILED)),
    });

    await expect(cds.cdsUpgradeAll(fakeContext, [], [])).rejects.toMatchInlineSnapshot(
      `[Error: error happened during tenant upgrade]`
    );
    expect(mockRequest.request).toHaveBeenCalledTimes(2);
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

  test("cds upgrade fails after no change detected for 30min", async () => {
    mockRequest.request.mockReturnValueOnce({
      text: () => JSON.stringify(mockInitialResponse()),
    });
    mockRequest.request.mockReturnValueOnce({
      text: () => JSON.stringify(mockOngoingResponse(JOB_STATUS.RUNNING)),
    });
    mockRequest.request.mockImplementationOnce(() => {
      jest.advanceTimersByTime(15 * MINUTES_IN_MILLIS);
      return {
        text: () => JSON.stringify(mockOngoingResponse(JOB_STATUS.RUNNING)),
      };
    });
    mockRequest.request.mockImplementationOnce(() => {
      jest.advanceTimersByTime(15 * MINUTES_IN_MILLIS);
      return {
        text: () => JSON.stringify(mockOngoingResponse(JOB_STATUS.RUNNING)),
      };
    });

    await expect(cds.cdsUpgradeAll(fakeContext, [], [])).rejects.toMatchInlineSnapshot(
      `[Error: no task progress after 30min]`
    );
    expect(mockRequest.request).toHaveBeenCalledTimes(4);
    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "started upgrade on server with jobId 8fd6894a-91d6-4eed-b772-1be05b8ac6ed polling interval 15sec
      job 8fd6894a-91d6-4eed-b772-1be05b8ac6ed is RUNNING with tasks queued/running: 0/6 | failed/finished: 0/0
      job 8fd6894a-91d6-4eed-b772-1be05b8ac6ed is RUNNING with tasks queued/running: 0/6 | failed/finished: 0/0
      job 8fd6894a-91d6-4eed-b772-1be05b8ac6ed is RUNNING with tasks queued/running: 0/6 | failed/finished: 0/0
      #  tenantId                              status   message
      1  00000000-0000-4000-8000-000000000101  RUNNING         
      2  00000000-0000-4000-8000-000000000102  RUNNING         
      3  00000000-0000-4000-8000-000000000103  RUNNING         
      4  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  RUNNING         
      5  6917dfd6-7590-4033-af2a-140b75263b0d  RUNNING         
      6  dde70ec5-983d-4848-b50c-fb2cdac7d359  RUNNING         
      "
    `);
    expect(mockLogger.error).toHaveBeenCalledTimes(0);
  });
});

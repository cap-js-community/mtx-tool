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
    writeFileAsync: jest.fn(),
  };
});

const { Logger: MockLogger } = require("../../src/shared/logger");
const mockLogger = MockLogger.getInstance();
jest.mock("../../src/shared/logger", () => require("../__mocks/shared/logger"));

const cds = require("../../src/submodules/capMultitenancy");
const { JOB_STATUS, TASK_STATUS } = cds;

const { outputFromLoggerPartitionFetch } = require("../test-util/static");

const MINUTES_IN_MILLIS = 60 * 1000;

const mockCdsInfo = {
  cfAppName: "app-mtx-name",
  cfAppGuid: "app-mtx-guid",
  cfRouteUrl: "route-url",
  cfProcess: { instances: 1 },
  cfService: { label: "xsuaa", credentials: {} },
  cfSsh: jest.fn().mockReturnValue([]),
};

const mockCdsInfoMultiInstance = {
  ...mockCdsInfo,
  cfProcess: { instances: 2 },
};

const fakeContext = ({ isMultiInstance = false } = {}) => ({
  getCdsInfo: () => (isMultiInstance ? mockCdsInfoMultiInstance : mockCdsInfo),
  getCachedTokenFromAuthService: () => "token",
  getCachedUaaTokenFromCredentials: () => "token",
});

const mockTenants = [
  {
    subscribedTenantId: "00000000-0000-4000-8000-000000000101",
    subscribedSubdomain: "virtual001",
  },
  {
    subscribedTenantId: "00000000-0000-4000-8000-000000000102",
    subscribedSubdomain: "virtual002",
  },
  {
    subscribedTenantId: "00000000-0000-4000-8000-000000000103",
    subscribedSubdomain: "virtual003",
  },
  {
    subscribedTenantId: "5ecc7413-2b7e-414a-9496-ad4a61f6cccf",
    subscribedSubdomain: "skyfin-company",
  },
  {
    subscribedTenantId: "6917dfd6-7590-4033-af2a-140b75263b0d",
    subscribedSubdomain: "skyfin-debug-company",
  },
  {
    subscribedTenantId: "dde70ec5-983d-4848-b50c-fb2cdac7d359",
    subscribedSubdomain: "skyfin-test-3",
  },
];

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

const mockInitialResponse = ({ jobId: inputJobId, tenantIds } = {}) => {
  const jobId = inputJobId ?? mockJob.ID;
  const jobTasks = tenantIds ? mockJobTasks.filter((entry) => tenantIds.includes(entry.tenant)) : mockJobTasks;
  return {
    ...mockJob,
    ...(jobId && { ID: jobId }),
    tenants: jobTasks.reduce((acc, entry) => {
      acc[entry.tenant] = { ID: entry.ID };
      return acc;
    }, {}),
    tasks: jobTasks.reduce((acc, entry) => {
      acc[entry.tenant] = { ...entry, job_ID: jobId };
      return acc;
    }, {}),
  };
};

const mockOngoingResponse = ({ jobId: inputJobId, tenantIds, jobStatus = JOB_STATUS.QUEUED } = {}) => {
  const jobId = inputJobId ?? mockJob.ID;
  const jobTasks = tenantIds ? mockJobTasks.filter((entry) => tenantIds.includes(entry.tenant)) : mockJobTasks;
  const taskStatuses = Array.from({ length: jobTasks.length }).map(() => jobStatus);
  return {
    ...mockJob,
    ...(jobId && { ID: jobId }),
    status: jobStatus,
    error: null,
    tenants: jobTasks.reduce((acc, entry, i) => {
      acc[entry.tenant] = {
        ID: entry.ID,
        status: taskStatuses[i],
        ...(taskStatuses[i] === TASK_STATUS.FAILED && { error: "HDI deployment failed with exit code 1" }),
      };
      return acc;
    }, {}),
    tasks: jobTasks.map((entry, i) => ({
      ...entry,
      job_ID: jobId,
      status: taskStatuses[i],
      ...(taskStatuses[i] === TASK_STATUS.FAILED && { error: "HDI deployment failed with exit code 1" }),
    })),
  };
};

describe("cds tests", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  describe("upgrade distribution", () => {
    const jobIds = ["jobId-instance-0", "jobId-instance-1"];
    let jobIdIndexUpgrade;
    let jobIdIndexPolling;
    let tenantIdsByJobId;

    beforeEach(() => {
      jobIdIndexUpgrade = 0;
      jobIdIndexPolling = 0;
      tenantIdsByJobId = {};
    });

    const mockUpgradeResponse = (options) => {
      const jobId = jobIds[jobIdIndexUpgrade++];
      const { tenants: tenantIds } = JSON.parse(options.body);
      if (tenantIds.includes("*")) {
        return {
          text: () => JSON.stringify(mockInitialResponse({ jobId })),
        };
      } else {
        tenantIdsByJobId[jobId] = tenantIds;
        return {
          text: () => JSON.stringify(mockInitialResponse({ jobId, tenantIds })),
        };
      }
    };

    const mockJobPollResponse = () => {
      const jobId = jobIds[jobIdIndexPolling++];
      const tenantIds = tenantIdsByJobId[jobId];
      return {
        text: () => JSON.stringify(mockOngoingResponse({ jobId, tenantIds, jobStatus: JOB_STATUS.FINISHED })),
      };
    };

    test("does distribute by default", async () => {
      // GET /-/cds/saas-provisioning/tenant
      mockRequest.request.mockReturnValueOnce({
        json: () => mockTenants,
      });

      // first instance 0, second instance 1
      mockRequest.request.mockImplementationOnce(mockUpgradeResponse);
      mockRequest.request.mockImplementationOnce(mockUpgradeResponse);

      mockRequest.request.mockImplementationOnce(mockJobPollResponse);
      mockRequest.request.mockImplementationOnce(mockJobPollResponse);

      await expect(
        cds.cdsUpgradeAll(fakeContext({ isMultiInstance: true }), [], [false, false])
      ).resolves.toBeUndefined();
      expect(mockRequest.request).toHaveBeenCalledTimes(5);
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "splitting tenants across 2 app instances of 'app-mtx-name' as follows:
        instance 1: processing tenants 00000000-0000-4000-8000-000000000101, 00000000-0000-4000-8000-000000000102, 00000000-0000-4000-8000-000000000103
        instance 2: processing tenants 5ecc7413-2b7e-414a-9496-ad4a61f6cccf, 6917dfd6-7590-4033-af2a-140b75263b0d, dde70ec5-983d-4848-b50c-fb2cdac7d359
        
        started upgrade on server with jobId jobId-instance-0 polling interval 15sec
        started upgrade on server with jobId jobId-instance-1 polling interval 15sec
        job jobId-instance-0 is FINISHED with tasks queued/running: 0/0 | failed/finished: 0/3
        job jobId-instance-1 is FINISHED with tasks queued/running: 0/0 | failed/finished: 0/3
        #  tenantId                              status    message  log
        1  00000000-0000-4000-8000-000000000101  FINISHED              
        2  00000000-0000-4000-8000-000000000102  FINISHED              
        3  00000000-0000-4000-8000-000000000103  FINISHED              
        #  tenantId                              status    message  log
        1  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  FINISHED              
        2  6917dfd6-7590-4033-af2a-140b75263b0d  FINISHED              
        3  dde70ec5-983d-4848-b50c-fb2cdac7d359  FINISHED              
        "
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });

    test("does not distribute with first instance enabled", async () => {
      mockRequest.request.mockImplementationOnce(mockUpgradeResponse);
      mockRequest.request.mockImplementationOnce(mockJobPollResponse);

      await expect(
        cds.cdsUpgradeAll(fakeContext({ isMultiInstance: true }), [], [false, true])
      ).resolves.toBeUndefined();
      expect(mockRequest.request).toHaveBeenCalledTimes(2);
      expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
        "started upgrade on server with jobId jobId-instance-0 polling interval 15sec
        job jobId-instance-0 is FINISHED with tasks queued/running: 0/0 | failed/finished: 0/6
        #  tenantId                              status    message  log
        1  00000000-0000-4000-8000-000000000101  FINISHED              
        2  00000000-0000-4000-8000-000000000102  FINISHED              
        3  00000000-0000-4000-8000-000000000103  FINISHED              
        4  5ecc7413-2b7e-414a-9496-ad4a61f6cccf  FINISHED              
        5  6917dfd6-7590-4033-af2a-140b75263b0d  FINISHED              
        6  dde70ec5-983d-4848-b50c-fb2cdac7d359  FINISHED              
        "
      `);
      expect(mockLogger.error).toHaveBeenCalledTimes(0);
    });
  });

  test("cds upgrade request fails", async () => {
    mockRequest.request.mockReturnValueOnce({
      text: () => JSON.stringify(mockInitialResponse()),
    });

    mockRequest.request.mockReturnValueOnce({
      text: () => JSON.stringify(mockOngoingResponse({ jobStatus: JOB_STATUS.FAILED })),
    });

    await expect(cds.cdsUpgradeAll(fakeContext(), [], [])).rejects.toMatchInlineSnapshot(
      `[Error: error happened during tenant upgrade]`
    );
    expect(mockRequest.request).toHaveBeenCalledTimes(2);
    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "started upgrade on server with jobId 8fd6894a-91d6-4eed-b772-1be05b8ac6ed polling interval 15sec
      job 8fd6894a-91d6-4eed-b772-1be05b8ac6ed is FAILED with tasks queued/running: 0/0 | failed/finished: 6/0
      #  tenantId                              status  message                                 log
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
      text: () => JSON.stringify(mockOngoingResponse({ jobStatus: JOB_STATUS.RUNNING })),
    });
    mockRequest.request.mockImplementationOnce(() => {
      jest.advanceTimersByTime(15 * MINUTES_IN_MILLIS);
      return {
        text: () => JSON.stringify(mockOngoingResponse({ jobStatus: JOB_STATUS.RUNNING })),
      };
    });
    mockRequest.request.mockImplementationOnce(() => {
      jest.advanceTimersByTime(15 * MINUTES_IN_MILLIS);
      return {
        text: () => JSON.stringify(mockOngoingResponse({ jobStatus: JOB_STATUS.RUNNING })),
      };
    });

    await expect(cds.cdsUpgradeAll(fakeContext(), [], [])).rejects.toMatchInlineSnapshot(
      `[Error: no task progress after 30min]`
    );
    expect(mockRequest.request).toHaveBeenCalledTimes(4);
    expect(outputFromLoggerPartitionFetch(mockLogger.info.mock.calls)).toMatchInlineSnapshot(`
      "started upgrade on server with jobId 8fd6894a-91d6-4eed-b772-1be05b8ac6ed polling interval 15sec
      job 8fd6894a-91d6-4eed-b772-1be05b8ac6ed is RUNNING with tasks queued/running: 0/6 | failed/finished: 0/0
      job 8fd6894a-91d6-4eed-b772-1be05b8ac6ed is RUNNING with tasks queued/running: 0/6 | failed/finished: 0/0
      job 8fd6894a-91d6-4eed-b772-1be05b8ac6ed is RUNNING with tasks queued/running: 0/6 | failed/finished: 0/0
      #  tenantId                              status   message  log
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

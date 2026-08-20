/**
 * This encapsulates Cloud Foundry authentication and API access.
 * - authentication uses cf oauth-token
 * - API access targets the CF v3 API: https://v3-apidocs.cloudfoundry.org/
 */
"use strict";

const pathlib = require("path");
const os = require("os");

const { tryReadJsonSync, spawnAsync, sleep, safeUnshift, escapeRegExp, indexByKey } = require("./static");
const { makeOneTime } = require("./execution-control");
const { assert, fail } = require("./error");
const { request } = require("./request");
const { Logger } = require("./logger");
const { LazyCache } = require("./cache");

const CF_CLI_BIN = "cf";
const CF_HOME = process.env.CF_HOME || os.homedir();

const APP_SUFFIXES = ["", "-{UUID}", "-blue", "-green"];
const APP_SUFFIX_READONLY = "-live";

const CF_DEPLOYMENT_POLL_FREQUENCY = 5000; // 5 seconds
const CF_DEPLOYMENT_POLL_TIMEOUT = 600000; // 10 minutes per app
const CF_DEPLOYMENT_STATE_FINALIZED = "FINALIZED";
const CF_DEPLOYMENT_REASON_DEPLOYED = "DEPLOYED";

const logger = Logger.getInstance();

class CloudFoundry {
  static #singleton;

  target;

  #extraAppSuffixes;
  #appByNameCache = new LazyCache();

  constructor({ extraAppSuffixes = [] } = {}) {
    const cfConfig = CloudFoundry.#readCfConfig();
    this.#extraAppSuffixes = extraAppSuffixes;

    this.target = Object.freeze({
      api: cfConfig.Target,
      orgName: cfConfig.OrganizationFields.Name,
      orgGuid: cfConfig.OrganizationFields.GUID,
      spaceName: cfConfig.SpaceFields.Name,
      spaceGuid: cfConfig.SpaceFields.GUID,
    });
  }

  static getSingleton({ extraAppSuffixes } = {}) {
    if (!CloudFoundry.#singleton) {
      CloudFoundry.#singleton = new CloudFoundry({ extraAppSuffixes });
    }
    return CloudFoundry.#singleton;
  }

  static resetSingleton() {
    CloudFoundry.#singleton = undefined;
  }

  static async #run(command, ...args) {
    return await spawnAsync(command, args, {
      env: {
        PATH: process.env.PATH,
        CF_HOME,
      },
    });
  }

  static #readCfConfig() {
    const cfConfigPath = pathlib.join(CF_HOME, ".cf", "config.json");
    const cfConfig = tryReadJsonSync(cfConfigPath);
    assert(cfConfig, "could not open cf config in location", cfConfigPath);
    const { OrganizationFields, SpaceFields, Target } = cfConfig || {};
    if (
      !cfConfig ||
      !OrganizationFields ||
      !OrganizationFields.GUID ||
      !OrganizationFields.Name ||
      !SpaceFields ||
      !SpaceFields.GUID ||
      !SpaceFields.Name ||
      !Target
    ) {
      return fail("no cf org/space targeted");
    }
    logger.info(`targeting cf api ${Target} / org "${OrganizationFields.Name}" / space "${SpaceFields.Name}"`);
    return cfConfig;
  }

  // NOTE: fetch the token via `cf oauth-token` rather than reading config.AccessToken directly. The stored access token
  //   is short-lived and often stale; `cf oauth-token` transparently refreshes it via the CLI's refresh token.
  #getToken = makeOneTime(async () => {
    try {
      const [stdout, stderr] = await CloudFoundry.#run(CF_CLI_BIN, "oauth-token");
      assert(!stderr, "got stderr output from cf oauth-token\n%s", stderr);
      return stdout.trim();
    } catch (err) {
      return fail(
        "caught error during cf oauth-token\n%s",
        [err.message, err.stdout, err.stderr].filter((s) => s && s.length).join("\n")
      );
    }
  });

  async request(urlOrPath, { method, body, headers } = {}) {
    let url;
    if (urlOrPath.startsWith("/")) {
      assert(urlOrPath.startsWith("/v3"), "refusing cf request for non-v3 path %s", urlOrPath);
      url = this.target.api + urlOrPath;
    } else {
      url = urlOrPath;
    }
    try {
      const response = await request({
        url,
        ...(method && { method }),
        ...(body && { body }),
        headers: {
          Accept: "application/json",
          Authorization: await this.#getToken(),
          ...headers,
        },
        logged: false,
      });
      return await response.json();
    } catch (err) {
      return fail("caught error during cf request %s\n%s", url, err.message);
    }
  }

  async requestPaged(urlOrPath) {
    const resourcePages = [];
    const includedPagesByType = {};
    while (true) {
      const { pagination, resources, included } = await this.request(urlOrPath);
      if (resources) {
        resourcePages.push(resources);
      }
      if (included) {
        for (const [type, includedPage] of Object.entries(included)) {
          if (!includedPagesByType[type]) {
            includedPagesByType[type] = [];
          }
          includedPagesByType[type].push(includedPage);
        }
      }
      if (pagination && pagination.next && pagination.next.href) {
        urlOrPath = pagination.next.href;
      } else {
        break;
      }
    }
    for (const type of Object.keys(includedPagesByType)) {
      includedPagesByType[type] = includedPagesByType[type].flat();
    }
    return { resources: resourcePages.flat(), included: includedPagesByType };
  }

  async ssh(appName, { logged, localPort, remotePort, remoteHostname, appInstance, command } = {}) {
    const args = [CF_CLI_BIN, "ssh", appName];
    if (localPort !== undefined && localPort !== null && remotePort !== undefined && remotePort !== null) {
      args.push(
        "-L",
        localPort + ":" + (remoteHostname || "0.0.0.0") + ":" + remotePort,
        "--skip-remote-execution",
        "--disable-pseudo-tty"
      );
    }
    if (appInstance !== undefined && appInstance !== null) {
      args.push("--app-instance-index", appInstance);
    }
    if (command !== undefined && command !== null) {
      args.push("--command", command);
    }
    logged && logger.info("running", args.join(" "));
    try {
      const [stdout, stderr] = await CloudFoundry.#run(...args);
      logged && stderr && logger.error(stderr);
      logged && stdout && logger.info(stdout);
      return [stdout, stderr];
    } catch (err) {
      return fail(
        "caught error during cf ssh: %s",
        [err.message, err.stdout, err.stderr].filter((s) => s && s.length).join("\n")
      );
    }
  }

  getApps = makeOneTime(async () => {
    const { resources: cfApps } = await this.requestPaged(`/v3/apps?space_guids=${this.target.spaceGuid}`);
    return cfApps;
  });

  getServiceInfoMaps = makeOneTime(async () => {
    const { resources: cfServicePlans, included: cfServiceIncluded } = await this.requestPaged(
      `/v3/service_plans?include=service_offering`
    );
    return {
      cfServiceOfferingsById: indexByKey(cfServiceIncluded.service_offerings, "guid"),
      cfServicePlansById: indexByKey(cfServicePlans, "guid"),
    };
  });

  // NOTE: builds the ordered app-name candidates for a configured app, expanding the {UUID} template and the blue/green
  //   (and, for readonly commands, live) suffixes. Any extra suffixes from the tool context are mixed in front.
  //   The candidate order takes precedence over the cf apps order.
  #getAppNameCandidates(appName, { isReadonlyCommand = false } = {}) {
    const appSuffixes = safeUnshift(
      isReadonlyCommand ? [...APP_SUFFIXES, APP_SUFFIX_READONLY] : [...APP_SUFFIXES],
      ...this.#extraAppSuffixes
    );

    return appSuffixes.map((suffix) => {
      const label = appName + suffix;
      const isTemplate = /{UUID}/g.test(label);
      let regexp;
      if (isTemplate) {
        const [front, back] = label.split("{UUID}");
        regexp = new RegExp(
          escapeRegExp(front) +
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" +
            escapeRegExp(back)
        );
      }
      return {
        suffix,
        label,
        regexp,
      };
    });
  }

  async getAppByName(appName, { isReadonlyCommand = false } = {}) {
    // NOTE: cache keyed by appName only. The resolved app also depends on isReadonlyCommand, but the tool runs exactly
    //   one command per process, so the flag is constant for this singleton's lifetime and the cache cannot be poisoned.
    return await this.#appByNameCache.getSetCb(appName, async () => {
      const cfApps = await this.getApps();
      const appNameCandidates = this.#getAppNameCandidates(appName, { isReadonlyCommand });
      let cfApp;
      let cfAppSuffix;
      for (const { suffix, label, regexp } of appNameCandidates) {
        cfApp = regexp ? cfApps.find(({ name }) => regexp.test(name)) : cfApps.find(({ name }) => label === name);
        if (cfApp) {
          cfAppSuffix = suffix;
          break;
        }
      }

      assert(
        cfApp,
        `no cf app found for name "${appName}", tried candidates "${appNameCandidates.map(({ label }) => label)}"`
      );
      if (appName !== cfApp.name) {
        logger.info('using app "%s" based on suffix "%s"', cfApp.name, cfAppSuffix);
      }
      return cfApp;
    });
  }

  async getAppEnv(appName, { isReadonlyCommand = false } = {}) {
    const cfApp = await this.getAppByName(appName, { isReadonlyCommand });
    const cfEnv = await this.request(`/v3/apps/${cfApp.guid}/env`);
    const filePath = cfEnv.system_env_json?.VCAP_SERVICES_FILE_PATH;
    if (filePath) {
      assert(
        typeof filePath === "string" && /^\/[\w./-]+$/.test(filePath),
        'refusing to read VCAP_SERVICES_FILE_PATH: value "%s" is not a safe absolute path',
        filePath
      );
      const [stdout] = await this.ssh(cfApp.name, { command: `cat ${filePath}` });
      try {
        cfEnv.system_env_json.VCAP_SERVICES = JSON.parse(stdout);
      } catch (err) {
        return fail("caught error parsing VCAP_SERVICES_FILE_PATH content from cf ssh:\n%s", err.message);
      }
    }
    return cfEnv;
  }

  async getBoundApps(instanceId) {
    const [{ resources: cfBindings }, cfApps] = await Promise.all([
      this.requestPaged(`/v3/service_credential_bindings?service_instance_guids=${instanceId}&type=app`),
      this.getApps(),
    ]);
    const boundAppGuids = new Set(cfBindings.map((binding) => binding.relationships.app.data.guid));
    return cfApps.filter((cfApp) => boundAppGuids.has(cfApp.guid));
  }

  async rollingRestart(cfApp) {
    const deployment = await this.request(`/v3/deployments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        relationships: { app: { data: { guid: cfApp.guid } } },
        strategy: "rolling",
      }),
    });
    const deadline = Date.now() + CF_DEPLOYMENT_POLL_TIMEOUT;
    let current = deployment;
    while (current.status?.value !== CF_DEPLOYMENT_STATE_FINALIZED) {
      assert(Date.now() < deadline, 'rolling restart of app "%s" timed out', cfApp.name);
      await sleep(CF_DEPLOYMENT_POLL_FREQUENCY);
      current = await this.request(`/v3/deployments/${deployment.guid}`);
    }
    assert(
      current.status?.reason === CF_DEPLOYMENT_REASON_DEPLOYED,
      'rolling restart of app "%s" finished with reason %s',
      cfApp.name,
      current.status?.reason
    );
    logger.info('rolling restart of app "%s" completed', cfApp.name);
    return current;
  }
}

module.exports = {
  CloudFoundry,
};

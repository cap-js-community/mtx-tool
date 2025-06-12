/* eslint-disable jest/expect-expect */
// NOTE: the jest/expect-expect rule does not handle passing expect down into a function, which we want to do here
//   to have proper error messages
"use strict";

const { readFileSync } = require("fs");
const { join } = require("path");

const { USAGE, GENERIC_CLI_OPTIONS, APP_CLI_OPTIONS } = require("../src/cliOptions");

const appCliOptions = Object.values(APP_CLI_OPTIONS);

/*
 NOTE: Just internal consistency tests for now.
 */

describe("consistency tests", () => {
  test("readme pipelines version is up-to-date with leading changelog release", async () => {
    const readme = readFileSync(join(__dirname, "..", "README.md")).toString();
    const changelog = readFileSync(join(__dirname, "..", "CHANGELOG.md")).toString();
    const readmePipelines = /(## Pipelines\n\n[\s\S]*?)\n##/g.exec(readme)[1];

    const leadingChangelogVersion = changelog.match(/^## v(\d+\.\d+\.\d+) - \d\d\d\d-\d\d-\d\d/m)[1];
    const readmeVersions = [...readmePipelines.matchAll(/@cap-js-community\/mtx-tool@(\d+\.\d+\.\d+)/g)].map(
      (m) => m[1]
    );
    const uniqueReadmeVersions = Object.keys(readmeVersions.reduce((acc, v) => ((acc[v] = 1), acc), {}));

    expect(uniqueReadmeVersions.length).toEqual(1);
    expect(uniqueReadmeVersions[0]).toStrictEqual(leadingChangelogVersion);
  });

  test("readme sections match home docs", async () => {
    const readme = readFileSync(join(__dirname, "..", "README.md")).toString();
    const readmeGettingStarted = /(## Getting Started\n\n[\s\S]*?)(?:\n##|$)/.exec(readme)[1];
    const readmePipelines = /(## Pipelines\n\n[\s\S]*?)(?:\n##|$)/.exec(readme)[1];
    const readmeFeatures = /(## Features\n\n[\s\S]*?)(?:\n##|$)/.exec(readme)[1];
    const docs = readFileSync(join(__dirname, "..", "docs", "index.md")).toString();
    const docsGettingStarted = /(## Getting Started\n\n[\s\S]*?)(?:\n##|$)/.exec(docs)[1];
    const docsPipelines = /(## Pipelines\n\n[\s\S]*?)(?:\n##|$)/.exec(docs)[1];
    const docsFeatures = /(## Features\n\n[\s\S]*?)(?:\n##|$)/.exec(docs)[1];
    expect(readmeGettingStarted).toEqual(docsGettingStarted);
    expect(readmePipelines).toEqual(docsPipelines);
    expect(readmeFeatures).toEqual(docsFeatures);
  });

  test("documentation features / cli usage consistency check", async () => {
    const readme = readFileSync(join(__dirname, "..", "docs", "index.md")).toString();
    const readmeFeatures = /## Features\n\n[\s\S]*```\n([\s\S]*?)```/.exec(readme)[1];
    const cliFeatures = / {3}=== user authentication \(uaa\) ===[\s\S]*/.exec(USAGE)[0];
    expect(cliFeatures).toEqual(readmeFeatures);
  });

  const _validateOptions = (cliOptions, text, expect) => {
    const cliOptionsDangerous = cliOptions.filter((cliOption) => cliOption.danger);
    const cliOptionsReadonly = cliOptions.filter((cliOption) => cliOption.readonly);
    const cliOptionsOther = cliOptions.filter((cliOption) => !cliOption.danger && !cliOption.readonly);

    const usageOptionsLinesWithLegend = text.split("\n").filter(
      (line) =>
        line.length !== 0 && // empty
        !line.startsWith("   ==") && // section headers
        !/^ +\.\.\./.test(line) && // argument
        !/^ {40}/.test(line) // line continuation
    );

    const usageOptionsLines = usageOptionsLinesWithLegend
      .filter((line) => !line.startsWith("*  are") && !line.startsWith("~  are"))
      .map((line) => line.replace(/(.*--[a-z-]+)((?: [A-Z_[\]]+)*).*?$/, "$1$2")); // remove everything after last "word with dashes"

    const legendDangerous = usageOptionsLinesWithLegend.filter((line) => line.startsWith("*  are"));
    const legendReadonly = usageOptionsLinesWithLegend.filter((line) => line.startsWith("~  are"));

    expect(
      (cliOptionsDangerous.length === 0 && legendDangerous.length === 0) ||
        (cliOptionsDangerous.length !== 0 && legendDangerous.length !== 0)
    ).toBe(true);
    expect(
      (cliOptionsReadonly.length === 0 && legendReadonly.length === 0) ||
        (cliOptionsReadonly.length !== 0 && legendReadonly.length !== 0)
    ).toBe(true);

    const usageDangerousLines = usageOptionsLines
      .filter((line) => line.startsWith("*  "))
      .map((line) => line.replace(/^.{3}\s*(.*)/, "$1").replace(/ +-/, "  -"));
    const usageReadonlyLines = usageOptionsLines
      .filter((line) => line.startsWith("~  "))
      .map((line) => line.replace(/^.{3}\s*(.*)/, "$1").replace(/ +-/, "  -"));
    const usageOtherLines = usageOptionsLines
      .filter((line) => line.startsWith("   "))
      .map((line) => line.replace(/^.{3}\s*(.*)/, "$1").replace(/ +-/, "  -"));
    // same count, content, and order
    expect(usageOptionsLines.length).toEqual(
      usageDangerousLines.length + usageReadonlyLines.length + usageOtherLines.length
    );
    const expectedLine = ({ commandVariants, requiredPassArgs, optionalPassArgs }) =>
      commandVariants.join("  ") +
      (requiredPassArgs ? " " + requiredPassArgs.join(" ") : "") +
      (optionalPassArgs ? " [" + optionalPassArgs.join("] [") + "]" : "");
    expect(usageDangerousLines).toEqual(cliOptionsDangerous.map(expectedLine));
    expect(usageReadonlyLines).toEqual(cliOptionsReadonly.map(expectedLine));
    expect(usageOtherLines).toEqual(cliOptionsOther.map(expectedLine));
  };

  test("programmatic options/ cli usage consistency check", async () => {
    const cliOptions = [].concat(Object.values(GENERIC_CLI_OPTIONS), appCliOptions);
    const usageOptionsArea = /[\s\S]*commands:\s*\n([\s\S]+\S)/.exec(USAGE)[1];
    _validateOptions(cliOptions, usageOptionsArea, expect);
  });

  test("documentation areas / area cliOptions consistency check", async () => {
    const areas = [
      {
        commandPrefix: "uaa",
        readmePath: join(__dirname, "..", "docs", "user-authentication", "index.md"),
      },
      {
        commandPrefix: "reg",
        readmePath: join(__dirname, "..", "docs", "tenant-registry", "index.md"),
      },
      {
        commandPrefix: "cds",
        readmePath: join(__dirname, "..", "docs", "cap-multitenancy", "index.md"),
      },
      {
        commandPrefix: "hdi",
        readmePath: join(__dirname, "..", "docs", "hana-management", "index.md"),
      },
      {
        commandPrefix: "svm",
        readmePath: join(__dirname, "..", "docs", "service-manager", "index.md"),
      },
    ];

    for (const { commandPrefix, readmePath } of areas) {
      const cliOptions = appCliOptions.filter(
        ({ commandVariants }) =>
          commandVariants[0].startsWith(commandPrefix) || commandVariants[0].startsWith(`--${commandPrefix}`)
      );
      const readme = readFileSync(readmePath).toString();
      const readmeUsage = /Commands for this area are:\n\n```\n([\s\S]*?)```/g.exec(readme)[1];
      _validateOptions(cliOptions, readmeUsage, expect);
    }
  });
});

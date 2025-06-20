/* eslint-disable jest/expect-expect */
// NOTE: the jest/expect-expect rule does not handle passing expect down into a function, which we want to do here
//   to have proper error messages
"use strict";

const { readFileSync } = require("fs");
const { join } = require("path");

const { USAGE, GENERIC_COMMAND_INFOS, APP_COMMAND_INFOS } = require("../src/commands");

const appCommandInfos = Object.values(APP_COMMAND_INFOS);

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

  test("readme sections / home docs consistency check", async () => {
    const readme = readFileSync(join(__dirname, "..", "README.md")).toString();
    const readmeOpener = /(# MTX Tool\n\n[\s\S]*?)(?:\n##|$)/.exec(readme)[1];
    const readmeGettingStarted = /(## Getting Started\n\n[\s\S]*?)(?:\n##|$)/.exec(readme)[1];
    const readmePipelines = /(## Pipelines\n\n[\s\S]*?)(?:\n##|$)/.exec(readme)[1];
    const docs = readFileSync(join(__dirname, "..", "docs", "index.md")).toString();
    const docsOpener = /(# MTX Tool\n\n[\s\S]*?)(?:\n##|$)/.exec(docs)[1];
    const docsGettingStarted = /(## Getting Started\n\n[\s\S]*?)(?:\n##|$)/.exec(docs)[1];
    const docsPipelines = /(## Pipelines\n\n[\s\S]*?)(?:\n##|$)/.exec(docs)[1];
    const readmeOpenerWithoutBadges = readmeOpener.replace(/\[!\[[\s\S]*?\n\n/g, "");
    expect(readmeOpenerWithoutBadges).toEqual(docsOpener);
    expect(readmeGettingStarted).toEqual(docsGettingStarted);
    expect(readmePipelines).toEqual(docsPipelines);
  });

  test("readme features / usage consistency check", async () => {
    const readme = readFileSync(join(__dirname, "..", "README.md")).toString();
    const readmeFeatures = /## Features\n\n[\s\S]*```\n([\s\S]*?)```/.exec(readme)[1];
    const cliFeatures = / {3}=== user authentication \(uaa\) ===[\s\S]*/.exec(USAGE)[0];
    expect(cliFeatures).toEqual(readmeFeatures);
  });

  const _validateCommandInfos = (commandInfos, text, expect) => {
    const dangerousCommandInfos = commandInfos.filter((info) => info.danger);
    const readOnlyCommandInfos = commandInfos.filter((info) => info.readonly);
    const otherCommandInfos = commandInfos.filter((info) => !info.danger && !info.readonly);

    const usageLinesWithLegend = text.split("\n").filter(
      (line) =>
        line.length !== 0 && // empty
        !line.startsWith("   ==") && // section headers
        !/^ +\.\.\./.test(line) && // argument
        !/^ {40}/.test(line) // line continuation
    );

    const usageLines = usageLinesWithLegend
      .filter((line) => !line.startsWith("*  are") && !line.startsWith("~  are"))
      .map((line) => line.replace(/(.*--[a-z-]+)((?: [A-Z_[\]]+)*).*?$/, "$1$2")); // remove everything after last "word with dashes"

    const legendDangerous = usageLinesWithLegend.filter((line) => line.startsWith("*  are"));
    const legendReadonly = usageLinesWithLegend.filter((line) => line.startsWith("~  are"));

    expect(
      (dangerousCommandInfos.length === 0 && legendDangerous.length === 0) ||
        (dangerousCommandInfos.length !== 0 && legendDangerous.length !== 0)
    ).toBe(true);
    expect(
      (readOnlyCommandInfos.length === 0 && legendReadonly.length === 0) ||
        (readOnlyCommandInfos.length !== 0 && legendReadonly.length !== 0)
    ).toBe(true);

    const usageDangerousLines = usageLines
      .filter((line) => line.startsWith("*  "))
      .map((line) => line.replace(/^.{3}\s*(.*)/, "$1").replace(/ +-/, "  -"));
    const usageReadonlyLines = usageLines
      .filter((line) => line.startsWith("~  "))
      .map((line) => line.replace(/^.{3}\s*(.*)/, "$1").replace(/ +-/, "  -"));
    const usageOtherLines = usageLines
      .filter((line) => line.startsWith("   "))
      .map((line) => line.replace(/^.{3}\s*(.*)/, "$1").replace(/ +-/, "  -"));
    // same count, content, and order
    expect(usageLines.length).toEqual(usageDangerousLines.length + usageReadonlyLines.length + usageOtherLines.length);
    const expectedLine = ({ commandVariants, requiredPassArgs, optionalPassArgs }) =>
      commandVariants.join("  ") +
      (requiredPassArgs ? " " + requiredPassArgs.join(" ") : "") +
      (optionalPassArgs ? " [" + optionalPassArgs.join("] [") + "]" : "");
    expect(usageDangerousLines).toEqual(dangerousCommandInfos.map(expectedLine));
    expect(usageReadonlyLines).toEqual(readOnlyCommandInfos.map(expectedLine));
    expect(usageOtherLines).toEqual(otherCommandInfos.map(expectedLine));
  };

  test("all commands/ usage consistency check", async () => {
    const cliCommands = [].concat(Object.values(GENERIC_COMMAND_INFOS), appCommandInfos);
    const usageCommandArea = /[\s\S]*commands:\s*\n([\s\S]+\S)/.exec(USAGE)[1];
    _validateCommandInfos(cliCommands, usageCommandArea, expect);
  });

  test("documentation areas / app commands consistency check", async () => {
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
      const commandInfos = appCommandInfos.filter(
        ({ commandVariants }) =>
          commandVariants[0].startsWith(commandPrefix) || commandVariants[0].startsWith(`--${commandPrefix}`)
      );
      const readme = readFileSync(readmePath).toString();
      const readmeUsage = /Commands for this area are:\n\n```\n([\s\S]*?)```/g.exec(readme)[1];
      _validateCommandInfos(commandInfos, readmeUsage, expect);
    }
  });
});

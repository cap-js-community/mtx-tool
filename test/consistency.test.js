/* eslint-disable jest/expect-expect */
// NOTE: the jest/expect-expect rule does not handle passing expect down into a function, which we want to do here
//   to have proper error messages
"use strict";

const { readFileSync } = require("fs");
const { join } = require("path");

const { USAGE, GENERIC_CLI_OPTIONS, APP_CLI_OPTIONS } = require("../src/cliOptions");

const HIDDEN_COMMANDS = ["--hdi-enable-native"];
const appCliOptions = Object.values(APP_CLI_OPTIONS).filter((option) =>
  option.commandVariants.every((command) => !HIDDEN_COMMANDS.includes(command))
);

/*
 NOTE: Just internal consistency tests for now.
 */

describe("consistency tests", () => {
  test("readme version is up-to-date with latest changelog release", async () => {
    const readme = readFileSync(join(__dirname, "..", "README.md")).toString();
    const changelog = readFileSync(join(__dirname, "..", "CHANGELOG.md")).toString();
    const readmeInstall = /(## Install or Upgrade\n\n[\s\S]*?)\n##/g.exec(readme)[1];

    const changelogVersion = /^## v(\d+\.\d+\.\d+) - \d\d\d\d-\d\d-\d\d/gm.exec(changelog)[1];
    const readmeVersion = /@cap-js-community\/mtx-tool@(\d+\.\d+\.\d+)/g.exec(readmeInstall)[1];

    expect(readmeVersion).toEqual(changelogVersion);
  });

  test("readme install matches docs", async () => {
    const readme = readFileSync(join(__dirname, "..", "README.md")).toString();
    const readmeInstall = /(## Install or Upgrade\n\n[\s\S]*?)\n##/g.exec(readme)[1];
    const docs = readFileSync(join(__dirname, "..", "docs", "index.md")).toString();
    const docsInstall = /(## Install or Upgrade\n\n[\s\S]*?)\n##/g.exec(docs)[1];
    expect(readmeInstall).toEqual(docsInstall);
  });

  test("documentation quickstart usage / cli usage consistency check", async () => {
    const readme = readFileSync(join(__dirname, "..", "docs", "index.md")).toString();
    const readmeUsage = /## Quickstart\n\n```\n([\s\S]*?)```/g.exec(readme)[1];
    const cliUsage = USAGE.replace(/usage: (?:processChild|jest) \[command]/g, "usage: mtx [command]");
    expect(cliUsage).toEqual(readmeUsage);
  });

  const _validateOptions = (cliOptions, text, expect) => {
    const cliOptionsDangerous = cliOptions.filter((cliOption) => cliOption.danger);
    const cliOptionsReadonly = cliOptions.filter((cliOption) => cliOption.readonly);
    const cliOptionsOther = cliOptions.filter((cliOption) => !cliOption.danger && !cliOption.readonly);

    const usageOptionsLinesWithLegend = text
      .split("\n")
      .filter((line) => line.length !== 0 && !line.startsWith("   ==") && !/^ +\.\.\./.test(line));

    const usageOptionsLines = usageOptionsLinesWithLegend
      .filter((line) => !line.startsWith("*  are") && !line.startsWith("~  are"))
      .map((line) => line.replace(/(.*--[a-z-]+)((?: [A-Z_[\]]+)*).*?$/, "$1$2")); // remove everything after last "word with dashes"

    const legendDangerous = usageOptionsLinesWithLegend.filter((line) => line.startsWith("*  are"));
    const legendReadlonly = usageOptionsLinesWithLegend.filter((line) => line.startsWith("~  are"));

    expect(
      (cliOptionsDangerous.length === 0 && legendDangerous.length === 0) ||
        (cliOptionsDangerous.length !== 0 && legendDangerous.length !== 0)
    ).toBe(true);
    expect(
      (cliOptionsReadonly.length === 0 && legendReadlonly.length === 0) ||
        (cliOptionsReadonly.length !== 0 && legendReadlonly.length !== 0)
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

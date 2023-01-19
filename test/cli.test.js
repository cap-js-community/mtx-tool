/* eslint-disable jest/expect-expect */
// NOTE: the jest/expect-expect rule does not handle passing expect down into a function, which we want to do here
//   to have proper error messages
"use strict";

const { readFileSync } = require("fs");
const { join } = require("path");

const { USAGE, GENERIC_CLI_OPTIONS } = require("../src/cli");

const appCliOptions = require("../src/cliOptions");

/*
 NOTE: Just internal consistency tests for now.
 */

describe("cli tests", () => {
  test("documentation quickstart usage / cli usage consistency check", async () => {
    const readme = readFileSync(join(__dirname, "..", "docs", "index.md")).toString();
    const readmeUsage = /## Quickstart\n\n```\n([\s\S]*?)```/g.exec(readme)[1];
    const cliUsage = USAGE.replace(/usage: (?:processChild|jest) \[command]/g, "usage: mtx [command]");
    expect(cliUsage).toEqual(readmeUsage);
   process.exit(-1)
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
    const cliOptions = [].concat(Object.values(GENERIC_CLI_OPTIONS), Object.values(appCliOptions));
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
      const cliOptions = Object.values(appCliOptions).filter(
        ({ commandVariants }) =>
          commandVariants[0].startsWith(commandPrefix) || commandVariants[0].startsWith(`--${commandPrefix}`)
      );
      const readme = readFileSync(readmePath).toString();
      const readmeUsage = /Commands for this area are:\n\n```\n([\s\S]*?)```/g.exec(readme)[1];
      _validateOptions(cliOptions, readmeUsage, expect);
    }
  });
});

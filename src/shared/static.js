"use strict";

// NOTE: static here means we only allow imports from the node standard library

const readline = require("readline");
const {
  accessSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  constants: { R_OK },
} = require("fs");
const { writeFile: writeFileAsync } = require("fs/promises");
const net = require("net");
const childProcess = require("child_process");
const util = require("util");

const isUUID = (input) =>
  input && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input);
const isJWT = (input) => input && /^[0-9a-z-_.]+$/i.test(input);
const isDashedWord = (input) => input && /^[0-9a-z-_]+$/i.test(input);

const sleep = async (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const question = async (ask, prefill) =>
  new Promise((resolve, reject) => {
    const rli = readline.createInterface({
      terminal: true,
      input: process.stdin,
      output: process.stdout,
    });
    let result = "";
    rli.question(ask + " ", (answer) => {
      result = answer;
      rli.close();
    });
    rli.on("close", () => {
      resolve(result);
    });
    rli.on("SIGINT", (err) => {
      reject(err);
    });
    prefill && rli.write(prefill);
  });

const tryReadJsonSync = (filepath) => {
  try {
    const data = readFileSync(filepath, "utf8");
    return JSON.parse(data);
  } catch (err) {
    return null;
  }
};

const tryAccessSync = (filepath, mode = R_OK) => {
  try {
    accessSync(filepath, mode);
    return true;
  } catch (err) {
    return null;
  }
};

const tryJsonParse = (input) => {
  try {
    return JSON.parse(input);
  } catch (err) {
    return null;
  }
};

const writeTextSync = (filepath, data) => writeFileSync(filepath, data);

const writeTextAsync = async (filepath, data) => await writeFileAsync(filepath, data);

const writeJsonSync = (filepath, data) => writeFileSync(filepath, JSON.stringify(data, null, 2) + "\n");

const writeJsonAsync = async (filepath, data) => await writeFileAsync(filepath, JSON.stringify(data, null, 2) + "\n");

const deleteFileSync = (filepath) => unlinkSync(filepath);

/**
 * @typedef TableListOptions
 * @type options
 *
 * @property {number|null}  [sortCol]
 * @property {boolean}      [noHeader]
 * @property {boolean}      [withRowNumber]
 */
/**
 * @param rows
 * @param {TableListOptions} options
 */
const tableList = (rows, { sortCol = 0, noHeader = false, withRowNumber = true } = {}) => {
  if (!rows || !rows.length || !rows[0] || !rows[0].length) {
    return null;
  }

  const hasSortCol = Number.isInteger(sortCol);

  if (withRowNumber) {
    hasSortCol && sortCol++;
    if (noHeader) {
      rows = rows.map((row, index) => [String(index + 1)].concat(row));
    } else {
      rows = rows.map((row, index) => [String(index)].concat(row));
      rows[0][0] = "#";
    }
  }
  const columnCount = rows[0].length;
  const columnWidth = rows.reduce((result, row) => {
    row.forEach((cell, index) => {
      if (index < columnCount) {
        result[index] = Math.max(result[index], String(cell).length);
      }
    });
    return result;
  }, new Array(columnCount).fill(0));

  const header = noHeader ? [] : rows[0];
  let body = noHeader ? rows : rows.slice(1);

  if (hasSortCol && sortCol < columnCount) {
    body.sort((rowA, rowB) => {
      const cellA = rowA[sortCol] ? rowA[sortCol].toUpperCase() : "";
      const cellB = rowB[sortCol] ? rowB[sortCol].toUpperCase() : "";
      return cellA < cellB ? -1 : cellA > cellB ? 1 : 0;
    });
    if (withRowNumber) {
      body = body.map((row, index) => [String(index + 1)].concat(row.slice(1)));
    }
  }

  const sortedRows = noHeader ? rows : [header].concat(body);

  return sortedRows
    .map((row) =>
      row
        .slice(0, columnCount)
        .map((cell, columnIndex) => cell + " ".repeat(columnWidth[columnIndex] - String(cell).length))
        .join("  ")
    )
    .join("\n");
};

const orderedStringify = (value, replacer, space) => {
  const allKeys = Object.create(null);
  JSON.stringify(value, (k, v) => {
    allKeys[k] = null;
    return v;
  });
  return JSON.stringify(value, Object.keys(allKeys).sort(), space);
};

const partition = (array, isValid) =>
  array.reduce(
    (result, elem) => {
      isValid(elem) ? result[0].push(elem) : result[1].push(elem);
      return result;
    },
    [[], []]
  );

const spawnAsync = (command, args, options) =>
  new Promise((_resolve, _reject) => {
    const child = childProcess.spawn(command, args, {
      detached: false,
      stdio: "pipe",
      ...options,
    });
    const childCleanup = () => child.kill();
    process.on("SIGINT", childCleanup);
    process.on("SIGTERM", childCleanup);

    const bufferStdout = [];
    const bufferStderr = [];
    const reject = (err) => {
      err.stdout = Buffer.concat(bufferStdout).toString();
      err.stderr = Buffer.concat(bufferStderr).toString();
      process.removeListener("SIGINT", childCleanup);
      process.removeListener("SIGTERM", childCleanup);
      return _reject(err);
    };
    const resolve = () => {
      process.removeListener("SIGINT", childCleanup);
      process.removeListener("SIGTERM", childCleanup);
      return _resolve([Buffer.concat(bufferStdout).toString(), Buffer.concat(bufferStderr).toString()]);
    };

    child.stdout.on("data", (data) => bufferStdout.push(data));
    child.stderr.on("data", (data) => bufferStderr.push(data));
    child.on("error", (err) => reject(err));
    child.on("exit", (code, signal) => {
      if (signal) {
        return reject(new Error(util.format("termination signal %s", signal)));
      }
      if (code) {
        return reject(new Error(util.format("non-zero return code %i", code)));
      }
      return resolve();
    });
  });

const isPortFree = (port) =>
  new Promise((resolve, reject) => {
    const tester = net
      .createServer()
      .once("error", (err) => (err.code === "EADDRINUSE" ? resolve(false) : reject(err)))
      .once("listening", () => tester.once("close", () => resolve(true)).close())
      .listen(port, "127.0.0.1");
  });

const nextFreePort = async (port) => {
  for (; port <= 65535; port++) {
    if (await isPortFree(port)) {
      return port;
    }
  }
};

const dateDiffInDays = (from, to) => {
  const fromDate = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toDate = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.floor((toDate - fromDate) / 1000 / 60 / 60 / 24);
};

const dateDiffInSeconds = (from, to) => {
  const fromDate = Date.UTC(
    from.getFullYear(),
    from.getMonth(),
    from.getDate(),
    from.getHours(),
    from.getMinutes(),
    from.getSeconds()
  );
  const toDate = Date.UTC(
    to.getFullYear(),
    to.getMonth(),
    to.getDate(),
    to.getHours(),
    to.getMinutes(),
    to.getSeconds()
  );
  return Math.floor((toDate - fromDate) / 1000);
};

const formatTimestampWithRelativeDays = (input, nowDate = new Date()) => {
  if (!input) {
    return "";
  }
  const inputDate = new Date(input);
  const daysAgo = dateDiffInDays(inputDate, nowDate);
  const outputAbsolute = inputDate.toISOString().replace(/\.[0-9]{3}/, "");
  return `${outputAbsolute} (${daysAgo} ${daysAgo === 1 ? "day" : "days"} ago)`;
};

const formatTimestampsWithRelativeDays = (inputs, nowDate = new Date()) =>
  inputs.map((input) => formatTimestampWithRelativeDays(input, nowDate));

const compareFor =
  (cb, descending = false) =>
  (a, b) => {
    const aVal = cb(a);
    const bVal = cb(b);
    if (descending) {
      return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
    } else {
      return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    }
  };

const resolveTenantArg = (tenant) => (isUUID(tenant) ? { tenantId: tenant } : { subdomain: tenant });

const balancedSplit = (input, k) => {
  let result = [];
  const n = input.length;
  const l = Math.ceil(n / k);
  let part = [];
  for (let i = 0; i < n; i++) {
    part.push(input[i]);
    if (part.length >= l) {
      result.push(part);
      part = [];
    }
  }
  if (part.length) {
    result.push(part);
  }
  if (result.length < k) {
    result = result.concat(Array.from({ length: k - result.length }, () => []));
  }
  return result;
};

const CHAR_POINTS = Object.freeze({
  // 33 -- 47 are 15 symbols
  // 58 -- 64 are 7 symbols again
  // 91 -- 96 are 6 symbols again
  // 123 -- 126 are 4 symbols again
  SYMBOLS: [].concat(
    Array.from({ length: 15 }, (_, i) => i + 33),
    Array.from({ length: 7 }, (_, i) => i + 58),
    Array.from({ length: 6 }, (_, i) => i + 91),
    Array.from({ length: 4 }, (_, i) => i + 123)
  ),
  // 48 -- 57 are 10 numbers
  NUMBERS: Array.from({ length: 10 }, (_, i) => i + 48),
  // 65 -- 90 are 26 upper case letters
  UPPER_CASE_LETTERS: Array.from({ length: 26 }, (_, i) => i + 65),
  // 97 -- 122 are 26 lower case letters
  LOWER_CASE_LETTERS: Array.from({ length: 26 }, (_, i) => i + 97),
});

const randomString = (
  len,
  { doNumbers = true, doUpperCaseLetters = true, doLowerCaseLetters = true, doSymbols = false } = {}
) => {
  const alphabet = [].concat(
    doNumbers ? CHAR_POINTS.NUMBERS : [],
    doUpperCaseLetters ? CHAR_POINTS.UPPER_CASE_LETTERS : [],
    doLowerCaseLetters ? CHAR_POINTS.LOWER_CASE_LETTERS : [],
    doSymbols ? CHAR_POINTS.SYMBOLS : []
  );
  return alphabet.length === 0
    ? []
    : String.fromCharCode.apply(
        null,
        Array.from({ length: len }, () => alphabet[Math.floor(Math.random() * alphabet.length)])
      );
};

const isObject = (input) => input !== null && typeof input === "object";

const safeUnshift = (baseArray, ...args) => {
  baseArray.unshift(...args.filter((arg) => arg !== undefined));
  return baseArray;
};

const reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
const reHasRegExpChar = RegExp(reRegExpChar.source);

/**
 * Escapes the `RegExp` special characters "^", "$", "\", ".", "*", "+",
 * "?", "(", ")", "[", "]", "{", "}", and "|" in `input`.
 *
 * @see https://github.com/lodash/lodash/blob/master/escapeRegExp.js
 *
 * @param {string} input The string to escape.
 * @returns {string} Returns the escaped string.
 */
const escapeRegExp = (input) => {
  return input && reHasRegExpChar.test(input) ? input.replace(reRegExpChar, "\\$&") : input;
};

const makeOneTime = (cb) => {
  const oneTimeCb = async (...args) => {
    if (!Object.prototype.hasOwnProperty.call(oneTimeCb, "__result")) {
      oneTimeCb.__result = cb(...args);
    }
    return await oneTimeCb.__result;
  };
  return oneTimeCb;
};

const resetOneTime = (cb) => Reflect.deleteProperty(cb, "__result");

const parseIntWithFallback = (input, fallback) => {
  if (typeof input !== "string") {
    return fallback;
  }
  const result = parseInt(input);
  return isNaN(result) ? fallback : result;
};

const indexByKey = (dataObjects, key) =>
  dataObjects.reduce((result, dataObject) => {
    const identifier = dataObject[key];
    if (!Object.prototype.hasOwnProperty.call(result, identifier)) {
      result[identifier] = dataObject;
    }
    return result;
  }, {});

const clusterByKey = (dataObjects, key) =>
  dataObjects.reduce((result, dataObject) => {
    const identifier = dataObject[key];
    if (result[identifier]) {
      result[identifier].push(dataObject);
    } else {
      result[identifier] = [dataObject];
    }
    return result;
  }, {});

module.exports = {
  isPortFree,
  nextFreePort,
  isUUID,
  isJWT,
  isDashedWord,
  sleep,
  question,
  tryReadJsonSync,
  writeTextSync,
  writeTextAsync,
  writeJsonSync,
  writeJsonAsync,
  deleteFileSync,
  tryAccessSync,
  tryJsonParse,
  tableList,
  orderedStringify,
  compareFor,
  partition,
  spawnAsync,
  dateDiffInDays,
  dateDiffInSeconds,
  formatTimestampWithRelativeDays,
  formatTimestampsWithRelativeDays,
  resolveTenantArg,
  balancedSplit,
  randomString,
  isObject,
  safeUnshift,
  escapeRegExp,
  makeOneTime,
  resetOneTime,
  parseIntWithFallback,
  indexByKey,
  clusterByKey,
};

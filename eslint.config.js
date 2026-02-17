"use strict";

const js = require("@eslint/js");
const jestPlugin = require("eslint-plugin-jest");
const prettierConfig = require("eslint-config-prettier");
const globals = require("globals");

module.exports = [
  {
    ignores: ["node_modules/", ".idea/", "temp/", "docs/vendor/", "docs/_site/", ".mtxcache.json"],
  },
  js.configs.recommended,
  jestPlugin.configs["flat/recommended"],
  prettierConfig,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": ["error", { caughtErrors: "none" }],
      strict: ["error"],
      "no-console": ["error"],
      "no-constant-condition": ["error", { checkLoops: false }],
      // NOTE: the jest intended way of adding __mocks__ in the production code structure is not an option for me and this
      //   is the best alternative I could find.
      "jest/no-mocks-import": "off",
    },
  },
];

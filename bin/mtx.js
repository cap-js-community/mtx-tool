#!/usr/bin/env node
"use strict";

const { cli } = require("../src/cli");

cli(process.argv.slice(2));

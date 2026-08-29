#!/usr/bin/env node

import { runCLI } from '../src/cli.js';

const exitCode = await runCLI(process.argv.slice(2));
process.exitCode = exitCode;

#!/usr/bin/env node
import { runCli } from '../src/cli/program.js';

const status = await runCli(process.argv.slice(2));
process.exitCode = status;

#!/usr/bin/env node
// pivotkit: the command line of pivotkit-report (docs/reference/cli.md).
import { main } from "../src/cli.js";

process.exitCode = await main(process.argv.slice(2), { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr, env: process.env, cwd: process.cwd() });

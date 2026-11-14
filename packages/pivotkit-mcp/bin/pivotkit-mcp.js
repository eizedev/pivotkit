#!/usr/bin/env node
import { run } from "../src/runner.js";

const code = await run(process.argv.slice(2), { env: process.env, stdout: process.stdout, stderr: process.stderr });
if (code !== null) {
    process.exitCode = code;
}

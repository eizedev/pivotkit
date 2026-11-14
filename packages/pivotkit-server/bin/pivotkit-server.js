#!/usr/bin/env node
// pivotkit-server: the REST service, the MCP server and the command line in one (docs/reference/rest.md).
import { run } from "../src/runner.js";

const code = await run(process.argv.slice(2), { env: process.env, stdout: process.stdout, stderr: process.stderr, stdin: process.stdin, cwd: process.cwd() });
if (code !== null) {
    process.exitCode = code;
}

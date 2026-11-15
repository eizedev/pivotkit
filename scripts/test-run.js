// Runs a test command as one test run and fails when the run leaves a temporary directory behind:
//   node scripts/test-run.js <command> [args...]
// The run gets an id in PIVOTKIT_TEST_RUN (kept when an outer run already set it, so the root's
// `npm test` and each workspace's own are one run), which every process it starts inherits and
// tests/temp-dir.js puts into the name of each directory it makes. Afterwards only the directories
// with this run's id are counted: another run on the same machine, at the same time, does not count.
// What is left is named and removed, and the run fails. "node" runs this Node, "npm" the npm that
// started the script (npm_execpath), so it works without a shell on every system.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isMain } from "./is-main.js";
import { RUN_ENV, runPrefix } from "../tests/temp-dir.js";

/**
 * The entries of the temporary directory that carry the run's id.
 * @param {string} run
 * @param {string} [dir]
 */
export function leftovers(run, dir = tmpdir()) {
    const prefix = runPrefix(run);
    return readdirSync(dir).filter((name) => name.startsWith(prefix)).map((name) => join(dir, name));
}

/**
 * The program and arguments to start for a command: this Node for "node", the npm that started the
 * script for "npm" (where there is one), else the command as it is.
 * @param {string[]} command
 * @param {NodeJS.ProcessEnv} env
 * @returns {[string, string[], boolean]} program, arguments, whether it needs a shell
 */
function program([name, ...args], env) {
    if (name === "node") return [process.execPath, args, false];
    if (name === "npm" && env.npm_execpath) return [process.execPath, [env.npm_execpath, ...args], false];
    return [name, args, process.platform === "win32"];
}

/**
 * Runs the command as a test run; its exit code, or 1 when it left directories behind.
 * @param {string[]} command
 */
export function testRun(command) {
    if (command.length === 0) throw new Error("usage: node scripts/test-run.js <command> [args...]");
    const run = process.env[RUN_ENV] || randomBytes(6).toString("hex");
    runPrefix(run);
    const env = { ...process.env, [RUN_ENV]: run };
    const [file, args, shell] = program(command, env);
    const result = spawnSync(file, args, { stdio: "inherit", env, shell });
    if (result.error) throw result.error;
    let code = result.status ?? 1;
    const left = leftovers(run);
    if (left.length > 0) {
        process.stderr.write(`\nThe tests left ${left.length} temporary director${left.length === 1 ? "y" : "ies"} of run ${run} behind (make them with tempDir() of tests/temp-dir.js):\n${left.map((path) => `  ${path}\n`).join("")}`);
        for (const path of left) rmSync(path, { recursive: true, force: true, maxRetries: 3 });
        code ||= 1;
    }
    return code;
}

if (isMain(import.meta.url)) {
    process.exitCode = testRun(process.argv.slice(2));
}

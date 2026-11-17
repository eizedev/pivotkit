// Runs a test command as one test run and fails when the run leaves a temporary directory behind:
//   node scripts/test-run.js <command> [args...]
// The run gets an id in PIVOTKIT_TEST_RUN (kept when an outer run already set it, so the root's
// `npm test` and each workspace's own are one run), which every process it starts inherits and
// tests/temp-dir.js puts into the name of each directory it makes. Afterwards only the directories
// with this run's id are counted: another run on the same machine, at the same time, does not count.
// What is left is named and removed, and the run fails. "node" runs this Node, "npm" the npm that
// started the script (npm_execpath), so it works without a shell on every system. SIGTERM to this
// script goes on to the command (a CI runner or a supervisor may signal this process alone), SIGINT
// as well when no terminal sends it to both; the check runs once the command has ended, however it
// ended.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { isMain } from "./is-main.js";
import { RUN_ENV, runPrefix, sweptLog, tempRoot } from "../tests/temp-dir.js";

/**
 * The entries of the temporary directory that carry the run's id.
 * @param {string} run
 * @param {string} [dir]
 */
export function leftovers(run, dir = tempRoot()) {
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
 * The signals handed on to the command. SIGINT only without a terminal: a Ctrl-C there reaches the
 * whole foreground group, the command as well, and a second one could turn its graceful stop into a
 * forced one.
 * @param {boolean | undefined} terminal whether this script's input is a terminal
 * @returns {NodeJS.Signals[]}
 */
export const forwarded = (terminal) => (terminal ? ["SIGTERM"] : ["SIGINT", "SIGTERM"]);

/**
 * Runs the command as a test run; its exit code, 1 when a signal ended it, or 1 when it left
 * directories behind.
 * @param {string[]} command
 * @returns {Promise<number>}
 */
export async function testRun(command) {
    if (command.length === 0) throw new Error("usage: node scripts/test-run.js <command> [args...]");
    const run = process.env[RUN_ENV] || randomBytes(6).toString("hex");
    runPrefix(run);
    const env = { ...process.env, [RUN_ENV]: run };
    const [file, args, shell] = program(command, env);
    /** @type {import("node:child_process").ChildProcess | undefined} */
    let child;
    // kept until the check is done: a signal while it runs does not cut it short (kill() does
    // nothing once the command has ended)
    const forwards = forwarded(process.stdin.isTTY).map((signal) => /** @type {const} */ ([signal, () => child?.kill(signal)]));
    // not on Windows: no signal reaches this script alone there, and kill() would end the command at once
    if (process.platform !== "win32") for (const [signal, forward] of forwards) process.on(signal, forward);
    // a sweep of another process may remove this run's leftovers before the check: its log counts too
    const sweptBefore = sweptLog().length;
    let code = 1;
    try {
        code = await new Promise((resolve, reject) => {
            child = spawn(file, args, { stdio: "inherit", env, shell });
            child.once("error", reject);
            child.once("close", (status) => resolve(status ?? 1));
        });
    } finally {
        // also when the command could not start: whatever it made is still named and removed
        const left = leftovers(run);
        if (left.length > 0) {
            process.stderr.write(`\nThe tests left ${left.length} temporary director${left.length === 1 ? "y" : "ies"} of run ${run} behind (make them with tempDir() of tests/temp-dir.js):\n${left.map((path) => `  ${path}\n`).join("")}`);
            for (const path of left) rmSync(path, { recursive: true, force: true, maxRetries: 3 });
            code ||= 1;
        }
        const swept = sweptLog().slice(sweptBefore).split("\n").filter((name) => name.startsWith(runPrefix(run)));
        if (swept.length > 0) {
            process.stderr.write(`\nA sweep removed ${swept.length} temporary director${swept.length === 1 ? "y" : "ies"} of run ${run} that a killed process left behind:\n${swept.map((name) => `  ${name}\n`).join("")}`);
            code ||= 1;
        }
        for (const [signal, forward] of forwards) process.off(signal, forward);
    }
    return code;
}

if (isMain(import.meta.url)) {
    process.exitCode = await testRun(process.argv.slice(2));
}

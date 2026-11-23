// Child processes for the tests of tempDir() and scripts/test-run.js: a process that makes
// directories with tempDir(), and helpers to start and end one.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { RUN_ENV } from "./temp-dir.js";

export const HELPER = fileURLToPath(new URL("./temp-dir.js", import.meta.url));
export const TEST_RUN = fileURLToPath(new URL("../scripts/test-run.js", import.meta.url));

/** A run id of its own, so this test counts only what its children make. */
export const newRun = () => randomBytes(6).toString("hex");

/**
 * A Node process that makes two directories with tempDir() (one with a file in it), prints their
 * paths and then does `then`.
 * @param {string} then
 */
export const maker = (then) => `
    import { writeFileSync } from "node:fs";
    import { join } from "node:path";
    import { tempDir } from ${JSON.stringify(HELPER)};
    const a = tempDir("pivotkit-server-");
    writeFileSync(join(a, "out.csv"), "a,b\\n");
    console.log(JSON.stringify([a, tempDir("probe")]));
    ${then}
`;

export const runMaker = (then, run) => spawnSync(process.execPath, ["--input-type=module", "-e", maker(then)], { encoding: "utf8", env: { ...process.env, [RUN_ENV]: run } });

export const NO_SIGTERM = process.platform === "win32" && "Windows has no SIGTERM to catch: a killed process ends at once";

/**
 * Starts a process and waits for the first line it prints, as JSON (its "ready" line).
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} env
 * `ended` settles when the process exits, `closed` when its output is complete as well (a process it
 * started and left running can hold that open).
 * @returns {Promise<{ child: import("node:child_process").ChildProcess, first: any, output: () => string, ended: Promise<{ code: number | null, signal: string | null }>, closed: Promise<void> }>}
 */
export async function started(args, env) {
    const child = spawn(process.execPath, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stderr.on("data", (chunk) => (err += chunk));
    const ended = new Promise((resolve) => child.on("exit", (code, signal) => resolve({ code, signal })));
    const closed = new Promise((resolve) => child.on("close", () => resolve()));
    const first = await new Promise((resolve, reject) => {
        child.on("error", reject);
        child.stdout.on("data", (chunk) => {
            const ready = !out.includes("\n");
            out += chunk;
            if (ready && out.includes("\n")) resolve(JSON.parse(out.split("\n")[0]));
        });
        closed.then(() => reject(new Error(`ended before it was ready: ${out}${err}`)));
    });
    return { child, first, output: () => out + err, ended, closed };
}

/**
 * Ends a process that may already be gone.
 * @param {number} pid
 */
export function kill(pid) {
    try {
        process.kill(pid, "SIGKILL");
    } catch {
        // already gone
    }
}

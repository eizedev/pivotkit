// Runs the CLI as a user would: a spawned process with its arguments, stdin, working directory and
// environment, giving the exit code, stdout and stderr.
import { spawn } from "node:child_process";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const BIN = fileURLToPath(new URL("../bin/pivotkit.js", import.meta.url));

/**
 * @param {string[]} args
 * @param {{ cwd?: string, input?: string | Uint8Array, env?: Record<string, string>, timeout?: number }} [options]
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string, bytes: Buffer }>}
 */
export function run(args, { cwd, input, env = {}, timeout = 30_000 } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [BIN, ...args], { cwd, env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env }, stdio: ["pipe", "pipe", "pipe"] });
        const out = [];
        const err = [];
        const timer = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error(`pivotkit ${args.join(" ")} did not end within ${timeout} ms`));
        }, timeout);
        child.stdout.on("data", (c) => out.push(c));
        child.stderr.on("data", (c) => err.push(c));
        child.on("error", reject);
        child.on("close", (code) => {
            clearTimeout(timer);
            const bytes = Buffer.concat(out);
            resolve({ code, stdout: bytes.toString("utf8"), stderr: Buffer.concat(err).toString("utf8"), bytes });
        });
        child.stdin.end(input ?? "");
    });
}

/** A new empty directory (its real path: the system's temporary directory may be a link). */
export const tempDir = (prefix = "pivotkit-cli-") => realpathSync(mkdtempSync(join(tmpdir(), prefix)));

export const SALES_CSV = "Region,Product,Units,Date\nNorth,A,3,2026-01-05\nSouth,B,4,2026-09-01\nNorth,B,2,2026-10-01\nWest,A,5,2025-06-30\n";

export const BY_REGION = { format: "pivotkit-view", formatVersion: 2, name: "By region", view: { rows: ["Region"], values: [{ field: "Units", agg: "sum" }] } };

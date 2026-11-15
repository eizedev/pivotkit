// The one way the tests, probes, benchmarks and browser specs of this repository make a temporary
// directory: tempDir() makes it under the system's temporary directory and removes it again when
// the process ends (a test file under node --test, a probe, a Playwright worker), also after a
// failure. Every name starts with "pivotkit-" and, when PIVOTKIT_TEST_RUN is set
// (scripts/test-run.js sets it), the run's id: the run checks afterwards that it left none behind,
// without counting another run's directories on the same machine. tests/temp-dirs.test.js fails on
// a temporary directory made any other way.
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The environment variable that carries a test run's id to every process the run starts. */
export const RUN_ENV = "PIVOTKIT_TEST_RUN";

/**
 * Where the names of a run's directories start: "pivotkit-<run>-", or "pivotkit-" without a run.
 * @param {string | undefined} run
 */
export function runPrefix(run) {
    if (run !== undefined && run !== "" && !/^[A-Za-z0-9]+$/.test(run)) {
        throw new Error(`${RUN_ENV} must be letters and digits, not ${JSON.stringify(run)}`);
    }
    return run ? `pivotkit-${run}-` : "pivotkit-";
}

/** @type {Set<string>} */
const made = new Set();

/** Removes every directory tempDir() made in this process that is still there. */
export function removeTempDirs() {
    for (const dir of made) {
        try {
            // retries for Windows, where a file a child process just closed can still be busy
            rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
            made.delete(dir);
        } catch (error) {
            // never fail the process here: the run's check names what is left
            process.stderr.write(`could not remove the temporary directory ${dir}: ${error.message}\n`);
        }
    }
}

let watching = false;

/**
 * Removes the directories when the process ends: at its end or exit(), and on a signal that would
 * otherwise end it without the exit event (Ctrl-C, the timeout of a spawning test). A signal the
 * process handles itself (a server's graceful stop, Playwright's worker) is left to that handler,
 * whether it was added before or after the first tempDir(); the exit event removes the directories
 * once it is done. Only without such a handler does the signal end the process here, as it would
 * without one (exit code 128 + the signal's number).
 */
function watch() {
    if (watching) return;
    watching = true;
    process.on("exit", removeTempDirs);
    for (const [signal, number] of /** @type {const} */ ([["SIGINT", 2], ["SIGTERM", 15], ["SIGHUP", 1]])) {
        const end = () => {
            // counted when the signal comes, before the other listeners run: first in line, so a
            // once() listener has not removed itself yet
            if (process.listeners(signal).every((listener) => listener === end)) process.exit(128 + number);
        };
        process.prependListener(signal, end);
    }
}

/**
 * A new empty directory under the system's temporary directory, removed when the process ends. Its
 * real path as the system resolves it (realpathSync.native): the temporary directory may be a link
 * (macOS), and on Windows realpathSync keeps a short 8.3 name (C:\Users\RUNNER~1) where the file
 * handling has the long one.
 * @param {string} [label] what the directory is for, in its name ("pivotkit-server-" and "server" alike)
 */
export function tempDir(label = "test") {
    const name = label.replace(/^pivotkit-/, "").replace(/-$/, "");
    const dir = realpathSync.native(mkdtempSync(join(tmpdir(), `${runPrefix(process.env[RUN_ENV])}${name}-`)));
    made.add(dir);
    watch();
    return dir;
}

// The one way the tests, probes, benchmarks and browser specs of this repository make a temporary
// directory: tempDir() makes it under the system's temporary directory and removes it again when
// the process ends (a test file under node --test, a probe, a Playwright worker), also after a
// failure. Every name starts with "pivotkit-" and, when PIVOTKIT_TEST_RUN is set
// (scripts/test-run.js sets it), the run's id: the run checks afterwards that it left none behind,
// without counting another run's directories on the same machine. tests/temp-dirs.test.js fails on
// a temporary directory made any other way. A process that ends without its exit event (SIGKILL, a
// crash) cannot remove its directories: each name holds its process id, and the first tempDir() of
// any later process removes the directories of processes that are gone (#526).
import { mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs";
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

/** The owner's process id in a directory's name: "-p<pid>-" before mkdtemp's random part. */
const OWNER = /^pivotkit-.*-p(\d+)-[A-Za-z0-9]{6}$/;

/**
 * Whether a process is running (or exists under another user, which signal 0 may not reach).
 * @param {number} pid
 */
function running(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return /** @type {NodeJS.ErrnoException} */ (error).code === "EPERM";
    }
}

/**
 * Removes the directories whose process is gone without removing them (SIGKILL, a crash), of any
 * run. A directory of a running process stays, and so does one without a process id in its name.
 * @param {string} [dir] the temporary directory to look in
 */
export function removeOrphans(dir = tmpdir()) {
    /** @type {string[]} */
    const removed = [];
    for (const name of tempDirNames(dir)) {
        const pid = Number(OWNER.exec(name)?.[1] ?? 0);
        if (pid === 0 || pid === process.pid || running(pid)) continue;
        try {
            rmSync(join(dir, name), { recursive: true, force: true, maxRetries: 3 });
            removed.push(name);
        } catch {
            // another process may be removing it now; the next sweep tries again
        }
    }
    // said, so a run that kills its test processes is noticed although the guard finds nothing
    if (removed.length > 0) process.stderr.write(`removed ${removed.length} temporary director${removed.length === 1 ? "y" : "ies"} of ended processes: ${removed.join(", ")}\n`);
}

/**
 * The names in the temporary directory that tempDir() makes, of every run and process.
 * @param {string} [dir]
 */
export function tempDirNames(dir = tmpdir()) {
    return readdirSync(dir).filter((name) => name.startsWith("pivotkit-"));
}

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

/**
 * How long a signal handler of the process's own may take before the process ends anyway: a graceful
 * stop that never comes would otherwise keep it alive until it is killed.
 */
export const GRACE_MS = 5000;

let watching = false;

/**
 * Removes the directories when the process ends: at its end or exit(), and on a signal that would
 * otherwise end it without the exit event (Ctrl-C, the timeout of a spawning test). A signal the
 * process handles itself (a server's graceful stop, Playwright's worker) is left to that handler,
 * whether it was added before or after the first tempDir(); the exit event removes the directories
 * once it is done, and a handler that has not ended the process after GRACE_MS ends it here. Only without such a handler does the signal end the process here, as it would
 * without one (exit code 128 + the signal's number).
 */
function watch() {
    if (watching) return;
    watching = true;
    removeOrphans();
    process.on("exit", removeTempDirs);
    for (const [signal, number] of /** @type {const} */ ([["SIGINT", 2], ["SIGTERM", 15], ["SIGHUP", 1]])) {
        const end = () => {
            // counted when the signal comes, before the other listeners run: first in line, so a
            // once() listener has not removed itself yet
            if (process.listeners(signal).every((listener) => listener === end)) process.exit(128 + number);
            // the handler's stop has its time; unref'd, so a stop that ends the process is not held up
            setTimeout(() => process.exit(128 + number), GRACE_MS).unref();
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
    const dir = realpathSync.native(mkdtempSync(join(tmpdir(), `${runPrefix(process.env[RUN_ENV])}${name}-p${process.pid}-`)));
    made.add(dir);
    watch();
    return dir;
}

// CI's check that a test run leaves no directory of tempDir() behind (#526), of any run or process.
// test-run.js counts only its own run's directories. A process killed without its exit event, or
// started without the run's id, escapes that count. Its directories go with the next sweep of
// tests/temp-dir.js, which notes them in its log. So the check fails on two things: a pivotkit-*
// name that is new since `save`, and a line the sweep noted since `save`.
//   node scripts/temp-dirs.js save <file>
//   node scripts/temp-dirs.js check <file>    # exit code 1, with the names, when there are any
import { readFileSync, writeFileSync } from "node:fs";
import { isMain } from "./is-main.js";
import { sweptLog, tempDirNames } from "../tests/temp-dir.js";

/**
 * The names now that were not there before.
 * @param {string[]} before
 * @param {string[]} now
 */
export function newNames(before, now) {
    const old = new Set(before);
    return now.filter((name) => !old.has(name));
}


/**
 * What a run left: the new names, and the directories a sweep removed during the run.
 * @param {{ names: string[], swept: number }} before
 * @param {{ names: string[], swept: string }} now
 */
export function leftBehind(before, now) {
    const removed = now.swept.slice(before.swept).split("\n").filter(Boolean);
    return [...newNames(before.names, now.names), ...removed.map((name) => `${name} (removed by a sweep: its process was killed)`)];
}

if (isMain(import.meta.url)) {
    const [action, file] = process.argv.slice(2);
    if (action === "save" && file) {
        writeFileSync(file, JSON.stringify({ names: tempDirNames(), swept: sweptLog().length }));
    } else if (action === "check" && file) {
        const left = leftBehind(JSON.parse(readFileSync(file, "utf8")), { names: tempDirNames(), swept: sweptLog() });
        if (left.length > 0) {
            process.stderr.write(`The tests left ${left.length} temporary director${left.length === 1 ? "y" : "ies"} behind (make them with tempDir() of tests/temp-dir.js):\n${left.map((name) => `  ${name}\n`).join("")}`);
            process.exitCode = 1;
        }
    } else {
        process.stderr.write("usage: node scripts/temp-dirs.js save|check <file>\n");
        process.exitCode = 2;
    }
}

// CI's check that a test run leaves no directory of tempDir() behind (#526), of any run or process:
// test-run.js counts only its own run's, and a process killed without its exit event or started
// without the run's id escapes that count. Saves the pivotkit-* names of the temporary directory
// before the tests and names every new one afterwards:
//   node scripts/temp-dirs.js save <file>
//   node scripts/temp-dirs.js check <file>    # exit code 1 and the new names when there are any
import { readFileSync, writeFileSync } from "node:fs";
import { isMain } from "./is-main.js";
import { tempDirNames } from "../tests/temp-dir.js";

/**
 * The names now that were not there before.
 * @param {string[]} before
 * @param {string[]} now
 */
export function newNames(before, now) {
    const old = new Set(before);
    return now.filter((name) => !old.has(name));
}

if (isMain(import.meta.url)) {
    const [action, file] = process.argv.slice(2);
    if (action === "save" && file) {
        writeFileSync(file, JSON.stringify(tempDirNames()));
    } else if (action === "check" && file) {
        const left = newNames(JSON.parse(readFileSync(file, "utf8")), tempDirNames());
        if (left.length > 0) {
            process.stderr.write(`The tests left ${left.length} temporary director${left.length === 1 ? "y" : "ies"} behind (make them with tempDir() of tests/temp-dir.js):\n${left.map((name) => `  ${name}\n`).join("")}`);
            process.exitCode = 1;
        }
    } else {
        process.stderr.write("usage: node scripts/temp-dirs.js save|check <file>\n");
        process.exitCode = 2;
    }
}

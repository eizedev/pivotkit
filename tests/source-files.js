// The JavaScript and TypeScript files of this repository (.js, .mjs, .cjs, .jsx, .ts, .tsx and the like), for the tests that check a rule over all of them
// (tests/is-main.test.js, tests/temp-dirs.test.js).
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The repository's root directory. */
export const root = fileURLToPath(new URL("../", import.meta.url));

/**
 * The JavaScript and TypeScript files of this repository outside node_modules and build output.
 * @param {string} [dir]
 * @returns {string[]}
 */
export function sourceFiles(dir = root) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (["node_modules", "dist", "coverage", "site", ".git", "test-results", "playwright-report"].includes(entry.name)) return [];
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return sourceFiles(path);
        return /\.(c|m)?(j|t)sx?$/.test(entry.name) ? [path] : [];
    });
}

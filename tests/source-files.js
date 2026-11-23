// The repository's root, a walk of its files outside installs and build output, and its JavaScript
// and TypeScript files (.js, .mjs, .cjs, .jsx, .ts, .tsx and the like), for the checks that apply a
// rule to all of them.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The repository's root directory. */
export const root = fileURLToPath(new URL("../", import.meta.url));

/** The directories a walk skips: git's own, installs and build output. */
export const SKIPPED_DIRS = new Set(["node_modules", "dist", "coverage", "site", ".git", "test-results", "playwright-report"]);

/**
 * The files under `dir` whose name `keep` accepts, outside SKIPPED_DIRS, as full paths.
 * @param {string} dir
 * @param {(name: string) => boolean} keep
 * @returns {string[]}
 */
export function filesUnder(dir, keep) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (SKIPPED_DIRS.has(entry.name)) return [];
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return filesUnder(path, keep);
        return entry.isFile() && keep(entry.name) ? [path] : [];
    });
}

/**
 * The JavaScript and TypeScript files of this repository outside node_modules and build output.
 * @param {string} [dir]
 * @returns {string[]}
 */
export function sourceFiles(dir = root) {
    return filesUnder(dir, (name) => /\.(c|m)?(j|t)sx?$/.test(name));
}

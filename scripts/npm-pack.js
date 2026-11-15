// Reads what `npm pack --json --workspace <name>` prints, for scripts/check-pack.js and the release
// workflow's Pack step. npm 10 and 11 print an array of packages; npm 12 prints an object keyed by
// workspace name (#383). A prepack script can log lines to stdout before the JSON, so the JSON starts
// at the first line that is only `[` or `{` (npm pretty-prints it).
//
//   npm pack --workspace pivotkit-core --json | node scripts/npm-pack.js    # prints the tarball's file name
import { isMain } from "./is-main.js";

/**
 * The packages `npm pack --json` describes, in either shape.
 *
 * @param {string} stdout  what npm pack printed on stdout
 * @returns {Array<{ name: string, version: string, filename: string, files: Array<{ path: string }> }>}
 */
export function packEntries(stdout) {
    const start = stdout.search(/^[[{]\s*$/m);
    if (start === -1) throw new Error(`no JSON in the output of npm pack:\n${stdout}`);
    const parsed = JSON.parse(stdout.slice(start));
    // npm reports a failure with --json as { "error": { "code", "summary", "detail" } }
    if (!Array.isArray(parsed) && Object.hasOwn(parsed, "error")) {
        throw new Error(`npm pack failed: ${JSON.stringify(parsed.error)}`);
    }
    const entries = Array.isArray(parsed) ? parsed : Object.values(parsed);
    for (const entry of entries) {
        if (typeof entry?.filename !== "string" || !Array.isArray(entry.files)) {
            throw new Error(`not a package from npm pack: ${JSON.stringify(entry).slice(0, 200)}`);
        }
    }
    return entries;
}

/**
 * The tarball's file name of the one package npm pack made, checked to be a plain .tgz name: the
 * release workflow puts it into a path and uploads that file.
 * @param {string} stdout  what npm pack printed on stdout
 */
export function tarballName(stdout) {
    const entries = packEntries(stdout);
    if (entries.length !== 1) throw new Error(`expected one package from npm pack, got ${entries.length}`);
    const { filename } = entries[0];
    if (!/^[^/\\]+\.tgz$/.test(filename) || filename.startsWith(".")) throw new Error(`not a tarball's file name: ${JSON.stringify(filename)}`);
    return filename;
}

if (isMain(import.meta.url)) {
    let stdin = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (stdin += chunk));
    process.stdin.on("end", () => {
        try {
            console.log(tarballName(stdin));
        } catch (error) {
            console.error(/** @type {Error} */ (error).message);
            process.exitCode = 1;
        }
    });
}

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
    return Array.isArray(parsed) ? parsed : Object.values(parsed);
}

if (isMain(import.meta.url)) {
    let stdin = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (stdin += chunk));
    process.stdin.on("end", () => {
        const entries = packEntries(stdin);
        if (entries.length !== 1) throw new Error(`expected one package from npm pack, got ${entries.length}`);
        console.log(entries[0].filename);
    });
}

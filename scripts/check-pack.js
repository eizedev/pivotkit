// Checks what `npm pack` would publish for each workspace: the license, docs, sources and generated
// types are in, every path of the exports map is in, tests and tooling are out. Publishes nothing.
//
//   node scripts/check-pack.js                   every workspace of the root package.json
//   node scripts/check-pack.js pivotkit-core     only these
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isMain } from "./is-main.js";
import { packEntries } from "./npm-pack.js";

const root = new URL("../", import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));

/**
 * The workspaces to check: the ones named, or every workspace of the root package.json.
 * @param {string[]} names
 * @returns {string[]}
 */
export function workspacesToCheck(names) {
    return names.length ? names : readJson("package.json").workspaces.map((w) => w.split("/").pop());
}

/**
 * Every file path an exports map names, also under nested conditions
 * (`{ "import": { "types": ..., "default": ... } }`).
 * @param {string | Record<string, any> | null | undefined} target
 * @returns {string[]}
 */
export function exportPaths(target) {
    if (typeof target === "string") return [target];
    if (!target || typeof target !== "object") return [];
    return Object.values(target).flatMap(exportPaths);
}

// a package that bundles third-party code ships their license texts
const BUNDLED_LICENSES = { "pivotkit-element": ["dist/THIRD_PARTY_LICENSES.txt"], "pivotkit-xlsx": ["dist/index.js", "dist/THIRD_PARTY_LICENSES.txt"] };
const FORBIDDEN = /^(test|bench|scripts)\/|^tsconfig\.json$|^node_modules\//;

/**
 * Packs one workspace dry and says what is wrong with it.
 * @param {string} workspace
 * @returns {string[]} the problems; none when it is fine
 */
function checkWorkspace(workspace) {
    // prepack runs as part of this (types, LICENSE); the JSON goes to stdout after anything prepack logs there
    const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--workspace", workspace], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
    const [{ files, name, version }] = packEntries(out);
    const paths = new Set(files.map((f) => f.path));
    const pkg = readJson(`packages/${workspace}/package.json`);
    // a command-line package ships the files of its commands
    const binPaths = typeof pkg.bin === "string" ? [pkg.bin] : Object.values(pkg.bin ?? {});
    // the CLI ships its examples (pivotkit example): examples.json and every file it lists, a CSV gzipped
    const examples = workspace === "pivotkit-cli" ? readJson("packages/pivotkit-cli/examples/examples.json").examples : [];
    const exampleFiles = examples.length ? ["examples/examples.json", ...examples.flatMap((e) => e.files.map((f) => `examples/${f}${f.endsWith(".csv") ? ".gz" : ""}`))] : [];
    const required = ["LICENSE", "README.md", "CHANGELOG.md", "package.json", ...exportPaths(pkg.exports).map((p) => p.replace(/^\.\//, "")), ...binPaths.map((p) => p.replace(/^\.\//, "")), ...(BUNDLED_LICENSES[workspace] ?? []), ...exampleFiles];
    console.log(`${name}@${version}: ${paths.size} files`);
    // a package marked private cannot be published: npm publish stops with EPRIVATE
    const problems = pkg.private ? [`"private": true in package.json`] : [];
    const missing = required.filter((p) => !paths.has(p));
    const unwanted = [...paths].filter((p) => FORBIDDEN.test(p));
    if (missing.length) problems.push(`missing: ${missing.join(", ")}`);
    if (unwanted.length) problems.push(`unwanted: ${unwanted.join(", ")}`);
    return problems.map((problem) => `${workspace}: ${problem}`);
}

if (isMain(import.meta.url)) {
    const problems = workspacesToCheck(process.argv.slice(2)).flatMap(checkWorkspace);
    if (problems.length) {
        console.error(problems.join("\n"));
        process.exit(1);
    }
    console.log("ok: license, docs, sources and types are in; tests and tooling are out");
}

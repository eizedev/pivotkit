// Checks what `npm pack` would publish for a workspace: the license, docs, sources and generated
// types are in, every path of the exports map is in, tests and tooling are out. Publishes nothing.
//
//   node scripts/check-pack.js pivotkit-core
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const workspace = process.argv[2];
if (!workspace) {
    console.error("usage: node scripts/check-pack.js <workspace>");
    process.exit(2);
}
// prepack runs as part of this (types, LICENSE); its output goes to stderr, the JSON to stdout
const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--workspace", workspace], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
const [{ files, name, version }] = JSON.parse(out.slice(out.indexOf("[")));
const paths = new Set(files.map((f) => f.path));
const pkg = JSON.parse(readFileSync(new URL(`../packages/${workspace}/package.json`, import.meta.url), "utf8"));

const exportPaths = Object.values(pkg.exports).flatMap((target) => (typeof target === "string" ? [target] : Object.values(target)));
const required = ["LICENSE", "README.md", "CHANGELOG.md", "package.json", ...exportPaths.map((p) => p.replace(/^\.\//, ""))];
const forbidden = /^(test|bench|scripts)\/|^tsconfig\.json$|^node_modules\//;

const missing = required.filter((p) => !paths.has(p));
const unwanted = [...paths].filter((p) => forbidden.test(p));
console.log(`${name}@${version}: ${paths.size} files`);
if (missing.length || unwanted.length) {
    console.error(`missing: ${missing.join(", ") || "-"}\nunwanted: ${unwanted.join(", ") || "-"}`);
    process.exit(1);
}
console.log("ok: license, docs, sources and types are in; tests and tooling are out");

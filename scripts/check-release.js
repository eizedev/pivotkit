// Checks before a package of this repository is released (release.yml, the "build" job): every package
// of this repository it depends on at run time is released as it is in this commit. Its CHANGELOG has
// no entry under [Unreleased]; else the package was built and tested against code that npm does not
// have yet, and would fail at import against the published version (#206). Release that package first.
// With --published, each of them must also be on npm at the version in this repository (network), so
// the publish order of CONTRIBUTING.md is kept.
//
//   node scripts/check-release.js pivotkit-react [--published]
//
// pivotkit-element is not affected: it bundles the packages of this repository (devDependencies).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);

/**
 * The entries (lines starting with "- ") under "## [Unreleased]" of a CHANGELOG's text.
 * @param {string} changelog
 * @returns {string[]}
 */
export function unreleasedEntries(changelog) {
    const start = changelog.search(/^## \[Unreleased\]/m);
    if (start === -1) {
        return [];
    }
    const rest = changelog.slice(start).split("\n").slice(1);
    const end = rest.findIndex((line) => /^## /.test(line));
    return (end === -1 ? rest : rest.slice(0, end)).filter((line) => /^- /.test(line));
}

/**
 * The packages of this repository that `name` needs at run time (dependencies, peerDependencies).
 * @param {string} name
 * @param {(file: string) => string} read
 * @returns {string[]}
 */
function ownDependencies(name, read) {
    const workspaces = JSON.parse(read("package.json")).workspaces.map((w) => w.split("/").pop());
    const pkg = JSON.parse(read(`packages/${name}/package.json`));
    return Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies }).filter((dep) => workspaces.includes(dep));
}

/**
 * What stands against releasing `name`: each own run-time dependency with unreleased entries.
 * @param {string} name  a workspace, e.g. "pivotkit-react"
 * @param {(file: string) => string} read  reads a file relative to the repository root
 * @returns {string[]}
 */
export function releaseProblems(name, read) {
    return ownDependencies(name, read).flatMap((dep) => {
        const count = unreleasedEntries(read(`packages/${dep}/CHANGELOG.md`)).length;
        return count > 0 ? [`${name} depends on ${dep}, whose CHANGELOG has ${count} unreleased ${count === 1 ? "entry" : "entries"}: release ${dep} first (CONTRIBUTING.md, "Releasing")`] : [];
    });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const name = process.argv[2];
    if (!name) {
        console.error("usage: node scripts/check-release.js <workspace> [--published]");
        process.exit(2);
    }
    const read = (file) => readFileSync(new URL(file, root), "utf8");
    const problems = releaseProblems(name, read);
    if (process.argv.includes("--published")) {
        for (const dep of ownDependencies(name, read)) {
            const { version } = JSON.parse(read(`packages/${dep}/package.json`));
            let published = "";
            let error = "";
            try {
                published = execFileSync("npm", ["view", `${dep}@${version}`, "version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
            } catch (e) {
                error = String(e.stderr ?? e.message);
            }
            if (published === version) continue;
            if (error && !/E404/.test(error)) {
                problems.push(`${name}: npm could not tell whether ${dep} ${version} is published: ${error.trim().split("\n")[0]}`);
            } else {
                problems.push(`${name} depends on ${dep} ${version}, which is not on npm: publish ${dep} first (CONTRIBUTING.md, "Releasing")`);
            }
        }
    }
    for (const p of problems) console.error(p);
    process.exit(problems.length > 0 ? 1 : 0);
}

// The repository's release rules: every dependency pinned and this repository's own packages on caret
// ranges, check-release, the lock files of the examples and of React 19, the version statements of the
// docs, and no merge conflict marker. The workflows are tests/workflows.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { releaseProblems, unreleasedEntries } from "../scripts/check-release.js";
import { filesUnder } from "./source-files.js";
import { tempDir } from "./temp-dir.js";

const root = new URL("../", import.meta.url);

// The pinning rule: every dependency of a third party is one exact version (with the lock file); a
// package of this repository that another one depends on takes a caret range on its current version
// (in 0.x that spans patch versions only; a host shares one copy only when its own range overlaps).
// The lock file pins it in development.
// the workspaces of the root package.json, in build order: every package of this repository
const WORKSPACES = JSON.parse(readFileSync(new URL("package.json", root), "utf8")).workspaces;
const OWN = new Set(WORKSPACES.map((w) => w.split("/").pop()));

// The examples with an install of their own (examples/angular) link this repository's packages from
// packages/ (their built dist/), so they test what the repository has, not a release.
const LINKED = ["examples/angular/package.json"];

test("every dependency is pinned to an exact version; this repository's own packages take a caret range", () => {
    const manifests = ["package.json", ...WORKSPACES.map((w) => `${w}/package.json`), "tests/react19/package.json", ...LINKED];
    for (const file of manifests) {
        const pkg = JSON.parse(readFileSync(new URL(file, root), "utf8"));
        for (const section of ["dependencies", "devDependencies"]) {
            for (const [name, range] of Object.entries(pkg[section] ?? {})) {
                if (LINKED.includes(file) && OWN.has(name)) {
                    assert.equal(range, `file:../../packages/${name}`, `${file} ${section}.${name} is "${range}", not the package of this repository`);
                } else if (section === "dependencies" && OWN.has(name)) {
                    assert.match(range, /^\^\d+\.\d+\.\d+$/, `${file} ${section}.${name} is "${range}", not a caret range of an own package`);
                } else {
                    assert.match(range, /^\d+\.\d+\.\d+$/, `${file} ${section}.${name} is "${range}", not an exact version`);
                }
            }
        }
    }
});

/**
 * Whether a version is inside a caret range, as npm reads it: ^1.2.3 is 1.x from 1.2.3, ^0.2.3 is
 * 0.2.x from 0.2.3, ^0.0.3 is 0.0.3 alone. Plain x.y.z versions only, as this repository uses them.
 */
function caretSatisfies(range, version) {
    const [a, b, c] = range.replace(/^\^/, "").split(".").map(Number);
    const [x, y, z] = version.split(".").map(Number);
    const atLeast = x > a || (x === a && (y > b || (y === b && z >= c)));
    if (a > 0) return atLeast && x === a;
    if (b > 0) return atLeast && x === 0 && y === b;
    return x === 0 && y === 0 && z === c;
}

test("caretSatisfies reads caret ranges as npm does", () => {
    assert.equal(caretSatisfies("^0.1.0", "0.1.4"), true);
    assert.equal(caretSatisfies("^0.1.0", "0.2.0"), false);
    assert.equal(caretSatisfies("^0.0.1", "0.0.2"), false);
    assert.equal(caretSatisfies("^1.2.0", "1.9.0"), true);
    assert.equal(caretSatisfies("^1.2.0", "1.1.9"), false);
});

// publish order (RELEASING.md): a range of an own package must take the version in this
// repository, else npm would fetch another one from the registry instead of linking the workspace
test("every caret range on an own package is satisfied by the workspace version", () => {
    for (const name of OWN) {
        const pkg = JSON.parse(readFileSync(new URL(`packages/${name}/package.json`, root), "utf8"));
        for (const [dep, range] of Object.entries(pkg.dependencies ?? {})) {
            if (OWN.has(dep)) {
                const own = JSON.parse(readFileSync(new URL(`packages/${dep}/package.json`, root), "utf8"));
                assert.ok(caretSatisfies(range, own.version), `${name} needs ${dep}@${range}, the repository has ${own.version}`);
            }
        }
    }
});

/**
 * How the packages of this repository name each other, against their versions in this repository: a
 * run-time range (dependencies, peerDependencies) is exactly `^<version>`, a devDependency (bundled or
 * used by a test) exactly `<version>`. A range whose lowest version is older than the repository's
 * would let npm install a published version that lacks what the package imports (#206): a release
 * that raises pivotkit-core must raise every range on it in the same pull request.
 * @param {Record<string, any>} manifests  package.json of every workspace, by name
 * @returns {string[]}
 */
function ownRangeProblems(manifests) {
    const problems = [];
    for (const [name, pkg] of Object.entries(manifests)) {
        for (const section of ["dependencies", "peerDependencies", "devDependencies"]) {
            for (const [dep, range] of Object.entries(pkg[section] ?? {})) {
                if (!Object.hasOwn(manifests, dep)) continue;
                const wanted = section === "devDependencies" ? manifests[dep].version : `^${manifests[dep].version}`;
                if (range !== wanted) problems.push(`${name} ${section}.${dep} is "${range}", the repository has ${dep} ${manifests[dep].version}: write "${wanted}"`);
            }
        }
    }
    return problems;
}

test("ownRangeProblems finds a range or a devDependency left behind by a release", () => {
    const at = (version, deps = {}, devDeps = {}) => ({ version, dependencies: deps, devDependencies: devDeps });
    const consistent = { "pivotkit-core": at("0.5.0"), "pivotkit-react": at("0.5.0", { "pivotkit-core": "^0.5.0" }), "pivotkit-element": at("0.5.0", {}, { "pivotkit-core": "0.5.0" }) };
    assert.deepEqual(ownRangeProblems(consistent), []);
    // core raised to 0.5.0, react still on ^0.4.0: npm would install the published 0.4.x
    assert.equal(ownRangeProblems({ ...consistent, "pivotkit-react": at("0.5.0", { "pivotkit-core": "^0.4.0" }) }).length, 1);
    // core raised to a patch, the range still admits the older patch that lacks the fix
    assert.equal(ownRangeProblems({ ...consistent, "pivotkit-core": at("0.5.1") }).length, 2);
    // a bundled devDependency on the old version: npm would fetch it from the registry
    assert.equal(ownRangeProblems({ ...consistent, "pivotkit-element": at("0.5.0", {}, { "pivotkit-core": "0.4.0" }) }).length, 1);
    // a third-party dependency is not checked here
    assert.deepEqual(ownRangeProblems({ ...consistent, "pivotkit-react": at("0.5.0", { "pivotkit-core": "^0.5.0", fflate: "0.8.3" }) }), []);
});

// examples outside the workspaces that take pivotkit-core from npm, as a host does
const EXAMPLES_FROM_NPM = ["examples/reader-plugin/package.json"];

test("every package of this repository, and every example that takes it from npm, names the others at their version in this repository", () => {
    const manifests = Object.fromEntries([...OWN].map((name) => [name, JSON.parse(readFileSync(new URL(`packages/${name}/package.json`, root), "utf8"))]));
    assert.deepEqual(ownRangeProblems(manifests), []);
    for (const file of EXAMPLES_FROM_NPM) {
        const example = JSON.parse(readFileSync(new URL(file, root), "utf8"));
        assert.deepEqual(ownRangeProblems({ ...manifests, [file]: example }), [], file);
    }
});

test("check-release refuses a package whose own dependency has unreleased changes", () => {
    const files = {
        "package.json": JSON.stringify({ workspaces: ["packages/pivotkit-core", "packages/pivotkit-react", "packages/pivotkit-element"] }),
        "packages/pivotkit-react/package.json": JSON.stringify({ dependencies: { "pivotkit-core": "^0.5.0", fflate: "0.8.3" } }),
        "packages/pivotkit-element/package.json": JSON.stringify({ devDependencies: { "pivotkit-core": "0.5.0" } }),
        "packages/pivotkit-core/CHANGELOG.md": "# Changelog\n\n## [Unreleased]\n\n### Added\n\n- `chartPlan`\n\n## [0.4.0] - 2026-10-01\n\n- old\n"
    };
    const read = (file) => files[file];
    assert.equal(releaseProblems("pivotkit-react", read).length, 1);
    // pivotkit-element bundles core: a devDependency does not count
    assert.deepEqual(releaseProblems("pivotkit-element", read), []);
    files["packages/pivotkit-core/CHANGELOG.md"] = "# Changelog\n\n## [Unreleased]\n\n## [0.5.0] - 2026-11-20\n\n- `chartPlan`\n";
    assert.deepEqual(releaseProblems("pivotkit-react", read), []);
    assert.deepEqual(unreleasedEntries("## [Unreleased]\n\nFirst release.\n\n### Added\n\n- a\n- b\n"), ["- a", "- b"]);
});

// --published asks npm (`npm view <dep>@<version> version`). The test runs the script in a copy of
// a small repository, with a stub `npm` first on PATH that answers like the registry: the version for a
// published one, E404 (as npm 11 does for an unknown package or version) or a network error. No network.
// The script is run through a symlink to that directory, which its main guard must follow (else it
// checks nothing and exits 0).
test("check-release --published refuses a dependency that is not on npm and says when npm cannot tell", { skip: process.platform === "win32" && "the stub npm is a POSIX shell script; releases run on Linux" }, () => {
    const scratch = tempDir("check-release");
    const dir = join(scratch, "repository");
    const link = join(scratch, "link");
    const files = {
        "package.json": { type: "module", workspaces: ["packages/pivotkit-core", "packages/pivotkit-report", "packages/pivotkit-react"] },
        "packages/pivotkit-core/package.json": { name: "pivotkit-core", version: "0.6.0" },
        "packages/pivotkit-report/package.json": { name: "pivotkit-report", version: "0.3.1", dependencies: { "pivotkit-core": "^0.6.0" } },
        "packages/pivotkit-react/package.json": { name: "pivotkit-react", version: "0.6.2", dependencies: { "pivotkit-core": "^0.6.0", "pivotkit-report": "^0.3.1", fflate: "0.8.3" } }
    };
    for (const [file, json] of Object.entries(files)) {
        mkdirSync(join(dir, file, ".."), { recursive: true });
        writeFileSync(join(dir, file), JSON.stringify(json));
    }
    for (const pkg of ["pivotkit-core", "pivotkit-report"]) {
        writeFileSync(join(dir, "packages", pkg, "CHANGELOG.md"), "# Changelog\n\n## [Unreleased]\n\n## [0.1.0] - 2026-10-01\n\n- old\n");
    }
    mkdirSync(join(dir, "scripts"));
    for (const file of ["check-release.js", "is-main.js"]) {
        copyFileSync(new URL(`scripts/${file}`, root), join(dir, "scripts", file));
    }
    mkdirSync(join(dir, "bin"));
    // NPM_STUB_PUBLISHED: the published "<name>@<version>" (space-separated); NPM_STUB_OFFLINE=1: no registry
    writeFileSync(join(dir, "bin", "npm"), `#!/bin/sh
echo "$*" >> "${join(dir, "npm-calls.log")}"
test "$1 $3" = "view version" || { echo "unexpected npm call: $*" >&2; exit 99; }
if [ -n "$NPM_STUB_OFFLINE" ]; then echo "npm error code ENOTFOUND" >&2; echo "npm error network request failed" >&2; exit 1; fi
for p in $NPM_STUB_PUBLISHED; do
    if [ "$p" = "$2" ]; then echo "\${2##*@}"; exit 0; fi
done
echo "npm error code E404" >&2
echo "npm error 404 No match found for version \${2##*@}" >&2
exit 1
`);
    chmodSync(join(dir, "bin", "npm"), 0o755);
    symlinkSync(dir, link, "dir");
    const run = (env, ...args) => {
        rmSync(join(dir, "npm-calls.log"), { force: true });
        const result = spawnSync(process.execPath, [join(link, "scripts", "check-release.js"), "pivotkit-react", ...args], {
            encoding: "utf8",
            env: { ...process.env, PATH: `${join(dir, "bin")}${delimiter}${process.env.PATH}`, NPM_STUB_PUBLISHED: "", NPM_STUB_OFFLINE: "", ...env }
        });
        let calls = [];
        try {
            calls = readFileSync(join(dir, "npm-calls.log"), "utf8").trim().split("\n");
        } catch {
            // npm was not called
        }
        return { status: result.status, stderr: result.stderr, calls };
    };

    // both dependencies published at the versions of this commit: it passes, after asking for each
    let r = run({ NPM_STUB_PUBLISHED: "pivotkit-core@0.6.0 pivotkit-report@0.3.1" }, "--published");
    assert.equal(r.stderr, "");
    assert.equal(r.status, 0);
    assert.deepEqual(r.calls, ["view pivotkit-core@0.6.0 version", "view pivotkit-report@0.3.1 version"]);

    // pivotkit-report 0.3.1 is not on npm (only an older version is): refused, with the publish order
    r = run({ NPM_STUB_PUBLISHED: "pivotkit-core@0.6.0 pivotkit-report@0.3.0" }, "--published");
    assert.equal(r.status, 1);
    assert.equal(r.stderr, "pivotkit-react depends on pivotkit-report 0.3.1, which is not on npm: publish pivotkit-report first (RELEASING.md)\n");

    // npm cannot reach the registry: refused for each dependency, with npm's error, not as "not published"
    r = run({ NPM_STUB_PUBLISHED: "pivotkit-core@0.6.0 pivotkit-report@0.3.1", NPM_STUB_OFFLINE: "1" }, "--published");
    assert.equal(r.status, 1);
    assert.deepEqual(r.stderr.trim().split("\n"), [
        "pivotkit-react: npm could not tell whether pivotkit-core 0.6.0 is published: npm error code ENOTFOUND",
        "pivotkit-react: npm could not tell whether pivotkit-report 0.3.1 is published: npm error code ENOTFOUND"
    ]);

    // without --published, npm is not asked
    r = run({});
    assert.equal(r.status, 0);
    assert.deepEqual(r.calls, []);

    // an unreleased CHANGELOG entry is reported beside the npm check
    writeFileSync(join(dir, "packages", "pivotkit-core", "CHANGELOG.md"), "# Changelog\n\n## [Unreleased]\n\n- `chartPlan`\n");
    r = run({ NPM_STUB_PUBLISHED: "pivotkit-core@0.6.0 pivotkit-report@0.3.1" }, "--published");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /^pivotkit-react depends on pivotkit-core, whose CHANGELOG has 1 unreleased entry: release pivotkit-core first/);
});

// pivotkit-element bundles its own packages: they are build-time devDependencies, pinned to the
// version in this repository (npm links the workspace only when the version matches; else it would
// fetch the package from the registry)
test("pivotkit-element bundles the pivotkit-core and pivotkit-react of this repository", () => {
    const element = JSON.parse(readFileSync(new URL("packages/pivotkit-element/package.json", root), "utf8"));
    assert.deepEqual(Object.keys(element.dependencies ?? {}), [], "pivotkit-element has no runtime dependency: it bundles everything");
    for (const name of ["pivotkit-core", "pivotkit-react"]) {
        const own = JSON.parse(readFileSync(new URL(`packages/${name}/package.json`, root), "utf8"));
        assert.equal(element.devDependencies[name], own.version, `pivotkit-element devDependencies.${name}`);
    }
});

test("the React 19 check installs from its own lock file", () => {
    const lock = JSON.parse(readFileSync(new URL("tests/react19/package-lock.json", root), "utf8"));
    const pkg = JSON.parse(readFileSync(new URL("tests/react19/package.json", root), "utf8"));
    for (const name of ["react", "react-dom"]) {
        assert.match(lock.packages[`node_modules/${name}`].version, /^19\./);
        assert.equal(lock.packages[`node_modules/${name}`].version, pkg.devDependencies[name]);
    }
});

test("the Angular example installs from its own lock file, at the versions its package.json pins", () => {
    const lock = JSON.parse(readFileSync(new URL("examples/angular/package-lock.json", root), "utf8"));
    const pkg = JSON.parse(readFileSync(new URL("examples/angular/package.json", root), "utf8"));
    for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
        const entry = lock.packages[`node_modules/${name}`];
        assert.ok(entry, `${name} is missing from examples/angular/package-lock.json`);
        if (OWN.has(name)) {
            assert.deepEqual({ resolved: entry.resolved, link: entry.link }, { resolved: `../../packages/${name}`, link: true }, `${name} in the lock file`);
        } else {
            assert.equal(entry.version, version, `${name} in the lock file`);
        }
    }
});

// Docs and READMEs name no version of pivotkit as a fact about the present, so a release cannot leave
// one behind: no caret range of a pivotkit package. The statements that must name the current version
// are listed here, each with the package whose version it names, and in RELEASING.md's release steps.
const VERSION_STATEMENTS = [
    { file: "docs/compare.md", pattern: /^\| \*\*pivotkit\*\* \| [^|]+ \| pivotkit-core (\d+\.\d+\.\d+) on \d{4}-\d{2}-\d{2} \|/m, pkg: "pivotkit-core" },
    { file: "docs/reference/view-file.md", pattern: /"generator": \{ "name": "pivotkit-react", "version": "(\d+\.\d+\.\d+)" \}/, pkg: "pivotkit-react" },
    // the official plugins table: the pivotkit-core version pivotkit-xlsx needs (its caret range on core)
    { file: "docs/reference/plugins.md", pattern: /^\| <span id="pivotkit-xlsx"><\/span>.*\| (\d+\.\d+(?:\.\d+)?) \(plugin API \d+\) \|$/m, pkg: "pivotkit-core" }
];
const minorOf = (version) => version.split(".").slice(0, 2).join(".");

/**
 * Every AGENTS.md under `dir`, the root's and the nested ones of packages and folders, as paths
 * relative to `dir` with "/". git's list of tracked files where `dir` is a repository; without git
 * or .git (a source archive), a walk of the directory without installs and build output.
 * @param {string} dir
 */
function agentsFiles(dir) {
    // the ceiling keeps git from answering for a repository that only encloses dir
    const git = spawnSync("git", ["ls-files", "--", "AGENTS.md", "**/AGENTS.md"], { cwd: dir, encoding: "utf8", env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(dir) } });
    if (git.status === 0) return git.stdout.split("\n").filter(Boolean).sort();
    return filesUnder(dir, (name) => name === "AGENTS.md").map((path) => relative(dir, path).split(sep).join("/")).sort();
}

test("agentsFiles finds the nested AGENTS.md files in a copy without .git, outside build output", () => {
    const dir = tempDir("agents-files");
    for (const path of ["AGENTS.md", "packages/a/AGENTS.md", "node_modules/b/AGENTS.md", "packages/a/dist/AGENTS.md", "docs/README.md"]) {
        mkdirSync(join(dir, dirname(path)), { recursive: true });
        writeFileSync(join(dir, path), "# AGENTS.md\n");
    }
    assert.deepEqual(agentsFiles(dir), ["AGENTS.md", "packages/a/AGENTS.md"]);
});

/** The Markdown files a reader takes as the current state: READMEs, every AGENTS.md, CONTRIBUTING.md, RELEASING.md, SECURITY.md, docs/. */
function docFiles() {
    const agentFiles = agentsFiles(fileURLToPath(root));
    assert.ok(agentFiles.includes("AGENTS.md"), "found no AGENTS.md at the root");
    const files = ["README.md", ...agentFiles, "CONTRIBUTING.md", "RELEASING.md", "SECURITY.md", ...WORKSPACES.map((w) => `${w}/README.md`)];
    for (const entry of readdirSync(new URL("docs/", root), { recursive: true, withFileTypes: true })) {
        const path = `${entry.parentPath ?? entry.path}/${entry.name}`.slice(fileURLToPath(new URL("docs/", root)).length);
        if (entry.isFile() && entry.name.endsWith(".md") && !path.startsWith("playground")) files.push(`docs/${path}`);
    }
    return files;
}

test("docs and READMEs write no caret range of a pivotkit package; the version statements name the current minor", () => {
    for (const file of docFiles()) {
        const text = readFileSync(new URL(file, root), "utf8");
        const range = /"?pivotkit-[a-z]+"?:? *"?\^\d+\.\d+\.\d+|\^0\.[1-9]\d*\.\d+/.exec(text);
        assert.equal(range, null, `${file} writes the range ${range?.[0]}: write it without a version (\`^<version of pivotkit-core>\`, \`^0.y.z\`)`);
    }
    for (const { file, pattern, pkg } of VERSION_STATEMENTS) {
        const found = pattern.exec(readFileSync(new URL(file, root), "utf8"))?.[1];
        assert.ok(found, `${file}: the version statement is gone; update VERSION_STATEMENTS`);
        const { version } = JSON.parse(readFileSync(new URL(`packages/${pkg}/package.json`, root), "utf8"));
        assert.equal(minorOf(found), minorOf(version), `${file} names ${pkg} ${found}, the repository has ${version}: update it in the release pull request`);
    }
});

// The "Server in 5 minutes" and Kubernetes commands and the README's docker line are copied as they
// are: every image tag, release tag and PIVOTKIT_VERSION on the page names pivotkit-server's version
// in full, and so does the example version of the container examples (RELEASING.md, "Each release")
const IMAGE_VERSIONS = /ghcr\.io\/eizedev\/pivotkit:(\d+\.\d+\.\d+)|pivotkit-server@(\d+\.\d+\.\d+)|PIVOTKIT_VERSION\s*=\s*"?(\d+\.\d+\.\d+)|e\.g\. (\d+\.\d+\.\d+)/g;
test("server-in-5-minutes.md, kubernetes.md, the README and the container examples name pivotkit-server's current version everywhere, in full", () => {
    const { version } = JSON.parse(readFileSync(new URL("packages/pivotkit-server/package.json", root), "utf8"));
    const named = (file) => [...readFileSync(new URL(file, root), "utf8").matchAll(IMAGE_VERSIONS)].map((m) => [m[0], m[1] ?? m[2] ?? m[3] ?? m[4]]);
    const page = named("docs/getting-started/server-in-5-minutes.md");
    assert.ok(page.some(([m]) => m.startsWith("ghcr")) && page.some(([m]) => m.startsWith("pivotkit-server@")) && page.some(([m]) => m.includes("PIVOTKIT_VERSION")), `the page names no image tag, release tag or PIVOTKIT_VERSION: ${JSON.stringify(page)}`);
    // the Kubernetes page downloads the manifest of a release tag, never of main
    const kubernetes = named("docs/getting-started/kubernetes.md");
    assert.ok(kubernetes.some(([m]) => m.startsWith("pivotkit-server@")), `kubernetes.md names no release tag pivotkit-server@<version>: ${JSON.stringify(kubernetes)}`);
    assert.doesNotMatch(readFileSync(new URL("docs/getting-started/kubernetes.md", root), "utf8"), /eizedev\/pivotkit\/(blob\/)?main\/docker\//, "kubernetes.md takes a file of docker/ from main: name the release tag pivotkit-server@<version>");
    assert.ok(named("README.md").some(([m]) => m.startsWith("ghcr")), "the README's docker line names no image tag ghcr.io/eizedev/pivotkit:<version>");
    for (const file of ["docs/getting-started/server-in-5-minutes.md", "docs/getting-started/kubernetes.md", "README.md", "docker/compose.example.yml", "docker/compose.secrets.example.yml", "docker/kubernetes.example.yaml"]) {
        for (const [where, found] of named(file)) {
            assert.equal(found, version, `${file}: ${where} is not pivotkit-server ${version}: update it in the release pull request`);
        }
    }
});

// A merge that left its conflict markers in a file (a CHANGELOG is the usual one) is refused: the
// markers are lines of their own, so no text of the repository has them otherwise.
test("no tracked text file holds a merge conflict marker", () => {
    const found = spawnSync("git", ["grep", "-n", "-I", "-E", "^(<<<<<<<|>>>>>>>)( |$)|^=======$"], { cwd: fileURLToPath(root), encoding: "utf8" });
    // git grep: 0 found, 1 nothing found, more an error
    assert.ok(found.status === 0 || found.status === 1, `git grep failed: ${found.stderr}`);
    assert.equal(found.stdout, "", `conflict markers left by a merge:\n${found.stdout}`);
});

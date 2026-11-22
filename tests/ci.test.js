// The browser tests run in Playwright's container image (.github/workflows/ci.yml): its browsers belong
// to one Playwright version, which must be the version of @playwright/test the tests are run with.
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

test("the Playwright container image matches @playwright/test in package-lock.json", () => {
    const lock = JSON.parse(readFileSync(new URL("package-lock.json", root), "utf8"));
    const locked = lock.packages["node_modules/@playwright/test"].version;
    const ci = readFileSync(new URL(".github/workflows/ci.yml", root), "utf8");
    const images = [...ci.matchAll(/mcr\.microsoft\.com\/playwright:v([0-9][^-@\s]*)[^@\s]*@sha256:[0-9a-f]{64}/g)].map((m) => m[1]);
    assert.ok(images.length > 0, "no Playwright image pinned by tag and digest in ci.yml");
    for (const v of images) {
        assert.equal(v, locked, `ci.yml uses the Playwright image v${v}, package-lock.json has @playwright/test ${locked}: raise both together`);
    }
});

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

/** The text of a job of a workflow file: from "  <job>:" to the next job. */
function jobOf(file, job) {
    const text = readFileSync(new URL(file, root), "utf8");
    const start = text.indexOf(`\n  ${job}:\n`);
    assert.ok(start !== -1, `${file} has no job ${job}`);
    const next = text.slice(start + 1).search(/\n {2}[a-z-]+:\n/);
    return next === -1 ? text.slice(start) : text.slice(start, start + 1 + next);
}

// a process killed without its exit event, or a child that makes directories outside the run's id,
// leaves directories that test-run.js does not count: CI compares all pivotkit-* names around the
// tests (#526)
test("CI's test job fails when the tests leave any pivotkit-* directory in the temporary directory", () => {
    const job = jobOf(".github/workflows/ci.yml", "test");
    const save = job.indexOf("run: node scripts/temp-dirs.js save ");
    const tests = job.indexOf("run: npm run coverage");
    const repository = job.indexOf('run: node scripts/test-run.js node --test "tests/*.test.js"');
    const check = job.indexOf("run: node scripts/temp-dirs.js check ");
    assert.ok(save !== -1 && save < tests, "the names are saved before the tests");
    assert.ok(check > repository, "they are compared after the repository checks");
});

// npm audit signatures checks the registry signatures of what npm ci installed: the step right after
// the install, in CI's test job and in the release's build job
test("CI's test job and the release build verify the registry signatures right after npm ci", () => {
    for (const [file, job] of [[".github/workflows/ci.yml", "test"], [".github/workflows/release.yml", "build"]]) {
        const section = jobOf(file, job);
        const install = section.indexOf("run: npm ci --no-audit");
        const audit = section.indexOf("run: npm audit signatures");
        assert.ok(install !== -1 && audit > install, `${file} ${job}: npm audit signatures after npm ci`);
        assert.equal((section.slice(install, audit).match(/\n {6}- /g) ?? []).length, 1, `${file} ${job}: npm audit signatures is the step right after the install`);
    }
});

// the web component's size step runs on the Node major its size check names (zlibNote): that Node's
// bundled zlib gives the numbers CI checks against the budgets
test("CI measures the web component's size on the Node major pivotkit-element's build.js names", async () => {
    const { SIZE_NODE } = await import("../packages/pivotkit-element/build.js");
    const job = jobOf(".github/workflows/ci.yml", "test");
    const from = job.indexOf("- name: Web component size");
    const next = job.indexOf("- name:", from + 1);
    const step = job.slice(from, next === -1 ? undefined : next);
    assert.match(step, new RegExp(`if: matrix\\.node == '${SIZE_NODE}'`));
    assert.match(step, /^ {8}run: npm run size -w pivotkit-element$/m);
    assert.match(job, new RegExp(`node: \\[[^\\]]*"${SIZE_NODE}"`));
});

// a value that starts with "-" is read as an option: node -e ends the step with "bad option" (#660),
// and grep takes it for flags, so a check that the token is not on the log never fails. A workflow
// hands values to an inline node script through the environment and puts "--" or -e before a grep
// pattern taken from a variable. These are line checks: a script over several lines is not covered
test("no workflow passes a value that may start with \"-\" where a command reads options", () => {
    const dir = new URL(".github/workflows/", root);
    for (const file of readdirSync(dir).filter((name) => /\.ya?ml$/.test(name))) {
        const lines = readFileSync(new URL(file, dir), "utf8").split("\n");
        lines.forEach((line, i) => {
            if (/\bnode (-e|-p|--eval|--print)\b/.test(line)) assert.doesNotMatch(line, /process\.argv/, `${file}:${i + 1} reads process.argv in an inline node script`);
            const grep = /\bgrep((?:\s+-[A-Za-z]+)*)\s+"\$/.exec(line);
            if (grep) assert.match(grep[1], /-[A-Za-z]*e$/, `${file}:${i + 1} gives grep a pattern from a variable without -- or -e`);
        });
    }
});

// pivotkit-cli's file handling (junctions, drive letters, device names) and the whole of
// pivotkit-server (workers, output directory, download markers, listen, state, sign-in, secret
// files) are tested on Windows and macOS too, not only on Linux
test("CI runs pivotkit-cli's and pivotkit-server's tests on Windows and macOS", () => {
    const job = jobOf(".github/workflows/ci.yml", "platforms");
    assert.match(job, /runs-on: \$\{\{ matrix\.os \}\}/);
    assert.match(job, /os: windows-latest/);
    assert.match(job, /os: macos-latest/);
    assert.match(job, /run: npm test -w pivotkit-cli\n/);
    assert.match(job, /run: npm test -w pivotkit-server\n/);
});

test("the release workflow runs check-release for the tagged package before it packs", () => {
    const release = readFileSync(new URL(".github/workflows/release.yml", root), "utf8");
    const check = release.indexOf("node scripts/check-release.js");
    assert.ok(check !== -1, "release.yml does not run scripts/check-release.js");
    assert.ok(check < release.indexOf("npm pack --workspace"), "check-release runs after the pack");
});

/**
 * The steps of a job's text, each as its top-level keys and their text (a block value without its
 * indentation). A step starts at "      - ", whatever key comes first; comment lines are left out.
 * @param {string} job
 * @returns {Array<Record<string, string>>}
 */
function stepsOf(job) {
    const list = job.slice(job.indexOf("\n    steps:\n") + 1);
    return list
        .split(/\n {6}- /)
        .slice(1)
        .map((text) => {
            /** @type {Record<string, string>} */
            const keys = {};
            let key = "";
            for (const [i, line] of text.split("\n").entries()) {
                const top = i === 0 ? /^([\w-]+):\s?(.*)$/.exec(line) : /^ {8}([\w-]+):\s?(.*)$/.exec(line);
                if (top) {
                    key = top[1];
                    keys[key] = top[2] === "|" ? "" : top[2];
                } else if (!/^\s*(#.*)?$/.test(line)) {
                    keys[key] = `${keys[key] ? `${keys[key]}\n` : ""}${line.trim()}`;
                }
            }
            return keys;
        });
}

// A compromised dev dependency could change the packages during lint and tests (#506). So the
// build job packs and uploads the tarball first. Only the compilers and bundlers run before the
// pack: tsc for every workspace's declarations, and the package's own prepack. The publish job
// stages only a tarball with the integrity the Pack step recorded.
test("the release packs and uploads the tarball before lint and tests, and publish checks its integrity", () => {
    const steps = stepsOf(jobOf(".github/workflows/release.yml", "build"));
    const at = (test) => steps.findIndex(test);
    const signatures = at((step) => step.run === "npm audit signatures");
    const pack = at((step) => step.name === "Pack");
    const upload = at((step) => String(step.uses).startsWith("actions/upload-artifact@"));
    const checks = at((step) => String(step.run).includes("npm run lint"));
    assert.ok(signatures !== -1 && pack === signatures + 2, "the pack follows the install, its signature check and one step");
    // the pack step itself runs these commands and no other
    assert.deepEqual(steps[pack].run.split("\n"), [
        "set -o pipefail",
        'mkdir -p "$RUNNER_TEMP/pack"',
        'file="$(npm pack --workspace "$PACKAGE" --pack-destination "$RUNNER_TEMP/pack" --json | node scripts/npm-pack.js)"',
        'test -f "$RUNNER_TEMP/pack/$file"',
        'echo "file=$file" >> "$GITHUB_OUTPUT"',
        'echo "integrity=sha512-$(openssl dgst -sha512 -binary "$RUNNER_TEMP/pack/$file" | base64 -w0)" >> "$GITHUB_OUTPUT"'
    ]);
    assert.ok(upload === pack + 1, "the upload follows the pack");
    assert.ok(checks > upload, "lint, types and tests run after the upload");
    // the one step between the signature check and the pack, whatever form another one takes
    // (a run block, a run without a name, an action): only the declarations are built there
    assert.deepEqual(steps.slice(signatures + 1, pack), [{ name: "Types", run: "npm run types --workspaces --if-present" }]);
    // nothing changes how these two run: no env, working-directory, continue-on-error or if
    assert.deepEqual(Object.keys(steps[signatures]).sort(), ["name", "run"]);
    assert.deepEqual(Object.keys(steps[pack]).sort(), ["env", "id", "name", "run"]);
    assert.deepEqual(steps[pack].env, "PACKAGE: ${{ steps.package.outputs.name }}");
    assert.equal(steps[pack].id, "pack");
    const build = jobOf(".github/workflows/release.yml", "build");
    assert.match(build, /integrity: \$\{\{ steps\.pack\.outputs\.integrity \}\}/);
    const publish = jobOf(".github/workflows/release.yml", "publish");
    assert.match(publish, /INTEGRITY: \$\{\{ needs\.build\.outputs\.integrity \}\}/);
    const compare = publish.indexOf('test "$actual" = "$INTEGRITY"');
    assert.ok(compare !== -1, "the publish job compares the tarball's integrity with the recorded one");
    assert.ok(compare < publish.indexOf("npm stage publish"), "it compares before it stages");
});

test("every package of this repository is checked, packed and released", () => {
    const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
    const release = readFileSync(new URL(".github/workflows/release.yml", root), "utf8");
    for (const name of OWN) {
        assert.ok(pkg.scripts["pack:check"].includes(`check-pack.js ${name}`), `pack:check misses ${name}`);
        assert.ok(release.includes(`"${name}@*"`), `release.yml has no tag pattern for ${name}`);
        // the case of the tag check: "pivotkit-core|pivotkit-react|...) ;;"
        const accepted = /^\s*((?:pivotkit-[a-z]+\|?)+)\) ;;$/m.exec(release)?.[1].split("|") ?? [];
        assert.ok(accepted.includes(name), `release.yml does not accept a ${name} tag`);
    }
    // the docs site may be published by hand from a release tag of any package
    const docs = readFileSync(new URL(".github/workflows/docs.yml", root), "utf8");
    const tagPattern = new RegExp(/\^pivotkit-\([a-z|]+\)@[^\s"]+/.exec(docs)?.[0].replace(/\\\\/g, "\\") ?? "^$");
    for (const name of OWN) assert.ok(tagPattern.test(`${name}@1.2.3`), `docs.yml does not accept the tag ${name}@1.2.3`);
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

// The browser tests run as one job per engine, shard and React version, each well inside
// its timeout: the matrix covers every Playwright project on React 18 and 19, every shard of a project,
// and each job runs its own project and shard only. Playwright gives each shard the same number of
// tests; PWTEST_SHARD_WEIGHTS gives WebKit's shards other shares (#672). One weight per shard: another
// count makes Playwright throw. Each weight above zero, or a shard runs nothing.
test("the browser jobs cover every engine and every shard on React 18 and 19", () => {
    const ci = readFileSync(new URL(".github/workflows/ci.yml", root), "utf8");
    const config = readFileSync(new URL("playwright.config.js", root), "utf8");
    const projects = [...config.matchAll(/name: "(\w+)", use: \{ \.\.\.devices/g)].map((m) => m[1]);
    assert.deepEqual(projects, ["chromium", "firefox", "webkit"]);
    const job = ci.slice(ci.indexOf("\n  browser:"));
    assert.match(job, /react: \["18", "19"\]/);
    const lines = [...job.matchAll(/^ +- \{ browser: .*\}$/gm)].map((m) => m[0].trim());
    const targets = lines.map((line) => /^- \{ browser: (\w+), shard: (\d+), of: (\d+) \}$/.exec(line)).map((m, i) => {
        assert.ok(m, `a target the test cannot read: ${lines[i]}`);
        return { browser: m[1], shard: Number(m[2]), of: Number(m[3]) };
    });
    for (const browser of projects) {
        const shards = targets.filter((t) => t.browser === browser);
        assert.ok(shards.length > 0, `${browser} has no job`);
        assert.deepEqual(shards.map((t) => t.shard), Array.from({ length: shards[0].of }, (_, i) => i + 1), `${browser}: every shard once`);
        assert.ok(shards.every((t) => t.of === shards.length), `${browser}: shards of one size`);
    }
    assert.match(job, /npx playwright test --project=\$\{\{ matrix\.target\.browser \}\} --shard=\$\{\{ matrix\.target\.shard \}\}\/\$\{\{ matrix\.target\.of \}\}/);
    const weighted = /PWTEST_SHARD_WEIGHTS: \$\{\{ matrix\.target\.browser == '(\w+)' && '(\d+(?::\d+)*)' \|\| '' \}\}/.exec(job);
    assert.ok(weighted, "the test step gives WebKit's shards their weights");
    assert.equal(weighted[1], "webkit");
    const weights = weighted[2].split(":").map(Number);
    assert.equal(weights.length, targets.filter((t) => t.browser === "webkit").length, "one weight per WebKit shard");
    assert.ok(weights.every((w) => w > 0), "no shard without tests");
    const minutes = Number(/timeout-minutes: (\d+)/.exec(job)?.[1]);
    assert.ok(minutes > 0 && minutes <= 15, `browser job timeout ${minutes} minutes`);
});

// PWTEST_SHARD_WEIGHTS is not in Playwright's docs: an update that drops it would quietly bring back
// shards of equal test counts, so the installed Playwright must still read it
test("the installed Playwright still reads PWTEST_SHARD_WEIGHTS", () => {
    const cli = readFileSync(new URL("node_modules/playwright/lib/cli/testActions.js", root), "utf8");
    assert.match(cli, /process\.env\.PWTEST_SHARD_WEIGHTS/, "Playwright no longer reads PWTEST_SHARD_WEIGHTS: balance the WebKit shards in ci.yml another way (#672)");
});

// npm reads "dir/file.tgz" as the GitHub repository <owner>/<repo>; a local tarball needs ./ or /
test("the release workflow publishes the tarball by a path npm reads as a file", () => {
    const release = readFileSync(new URL(".github/workflows/release.yml", root), "utf8");
    const publishes = [...release.matchAll(/npm (?:stage )?publish\s+"?([^"\s]+)/g)].map((m) => m[1]);
    assert.ok(publishes.length > 0, "no npm stage publish in release.yml");
    for (const target of publishes) {
        assert.match(target, /^(\.\/|\/)/, `npm publish ${target}: start the path with ./`);
    }
});

// The trusted publisher on npm allows staging only (RELEASING.md): a plain npm publish
// would fail at release time, after the tag is pushed
test("the release workflow stages on npm and never publishes directly", () => {
    const release = readFileSync(new URL(".github/workflows/release.yml", root), "utf8");
    const commands = release.split("\n").filter((line) => !/^\s*#/.test(line)).join("\n");
    const stages = commands.split("\n").filter((line) => /npm stage publish /.test(line));
    assert.ok(stages.length > 0, "release.yml does not run npm stage publish");
    // --provenance asks for the attestation explicitly, so a run that cannot make one fails instead of
    // staging an unattested version; --ignore-scripts keeps lifecycle scripts away from the OIDC token
    for (const line of stages) {
        assert.match(line, /\s--provenance(\s|$)/, `npm stage publish without --provenance: ${line.trim()}`);
        assert.match(line, /\s--ignore-scripts(\s|$)/, `npm stage publish without --ignore-scripts: ${line.trim()}`);
        assert.match(line, /\s--access public(\s|$)/, `npm stage publish without --access public: ${line.trim()}`);
    }
    assert.doesNotMatch(commands.replaceAll("npm stage publish", ""), /npm\s+publish/, "release.yml runs npm publish: stage it instead");
    // no other registry command: a direct publish (any spacing), dist-tag, deprecate, unpublish,
    // version, or npx, which can fetch and run a package while the OIDC token is available
    const others = commands.split("\n").filter((line) => !/npm stage publish /.test(line))
        .filter((line) => /npm\s+(publish|dist-tag|deprecate|unpublish|version)\b|\bnpx\b/.test(line));
    assert.deepEqual(others.map((line) => line.trim()), [], "release.yml runs an npm registry command other than npm stage publish");
});

// The OIDC token exists only in the job that waits for the "npm" environment's reviewers, and only a
// pushed release tag starts the workflow (RELEASING.md)
test("the release workflow holds the OIDC token only behind the npm environment, on tags only", () => {
    const release = readFileSync(new URL(".github/workflows/release.yml", root), "utf8");
    const commands = release.split("\n").filter((line) => !/^\s*#/.test(line)).join("\n");
    // a top-level key's block: from "<key>:" to the next line that starts at column 0
    const topLevel = (key) => new RegExp(`^${key}:.*\\n((?:[ \\t].*\\n|\\n)*)`, "m").exec(commands + "\n")?.[1] ?? "";
    const jobsBlock = topLevel("jobs");
    const jobs = Object.fromEntries([...jobsBlock.matchAll(/^ {2}([\w-]+):\n((?:(?: {3,}.*)?\n)*)/gm)].map((m) => [m[1], m[2]]));
    assert.deepEqual(Object.keys(jobs).sort(), ["build", "publish"], "release.yml has other jobs than build and publish");
    assert.match(jobs.publish, /^ {4}environment: npm$/m, "the publish job does not wait for the npm environment");
    assert.match(jobs.publish, /^ {6}id-token: write$/m, "the publish job has no id-token: write");
    assert.doesNotMatch(jobs.build, /id-token/, "the build job runs the dependencies and must not get the OIDC token");
    assert.equal(commands.match(/id-token/g)?.length, 1, "id-token is granted outside the publish job");
    const on = topLevel("on");
    assert.deepEqual([...on.matchAll(/^ {2}([\w-]+):/gm)].map((m) => m[1]), ["push"], "release.yml runs on other events than push");
    assert.deepEqual([...on.matchAll(/^ {4}([\w-]+):/gm)].map((m) => m[1]), ["tags"], "release.yml runs on a push of something other than tags");
    assert.doesNotMatch(on, /pull_request|workflow_dispatch|workflow_call|workflow_run|schedule|release\b/, "release.yml runs on other events than a pushed tag");
    assert.match(commands, /^on:\s*$/m, "on: lists its events inline");
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

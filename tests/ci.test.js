// The browser tests run in Playwright's container image (.github/workflows/ci.yml): its browsers belong
// to one Playwright version, which must be the version of @playwright/test the tests are run with.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

// publish order core, react, element: a range of an own package must take the version in this
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

test("the own packages' caret ranges take the version of the package in this repository", () => {
    const core = JSON.parse(readFileSync(new URL("packages/pivotkit-core/package.json", root), "utf8"));
    const react = JSON.parse(readFileSync(new URL("packages/pivotkit-react/package.json", root), "utf8"));
    assert.equal(react.dependencies["pivotkit-core"], `^${core.version}`);
    const xlsx = JSON.parse(readFileSync(new URL("packages/pivotkit-xlsx/package.json", root), "utf8"));
    assert.equal(xlsx.dependencies["pivotkit-core"], `^${core.version}`);
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

// The browser tests run as one job per engine (WebKit in shards) and React version, each well inside
// its timeout: the matrix covers every Playwright project on React 18 and 19, every shard of a project,
// and each job runs its own project and shard only.
test("the browser jobs cover every engine and every shard on React 18 and 19", () => {
    const ci = readFileSync(new URL(".github/workflows/ci.yml", root), "utf8");
    const config = readFileSync(new URL("playwright.config.js", root), "utf8");
    const projects = [...config.matchAll(/name: "(\w+)", use: \{ \.\.\.devices/g)].map((m) => m[1]);
    assert.deepEqual(projects, ["chromium", "firefox", "webkit"]);
    const job = ci.slice(ci.indexOf("\n  browser:"));
    assert.match(job, /react: \["18", "19"\]/);
    const targets = [...job.matchAll(/- \{ browser: (\w+), shard: (\d+), of: (\d+) \}/g)].map((m) => ({ browser: m[1], shard: Number(m[2]), of: Number(m[3]) }));
    for (const browser of projects) {
        const shards = targets.filter((t) => t.browser === browser);
        assert.ok(shards.length > 0, `${browser} has no job`);
        assert.deepEqual(shards.map((t) => t.shard), Array.from({ length: shards[0].of }, (_, i) => i + 1), `${browser}: every shard once`);
        assert.ok(shards.every((t) => t.of === shards.length), `${browser}: shards of one size`);
    }
    assert.match(job, /npx playwright test --project=\$\{\{ matrix\.target\.browser \}\} --shard=\$\{\{ matrix\.target\.shard \}\}\/\$\{\{ matrix\.target\.of \}\}/);
    const minutes = Number(/timeout-minutes: (\d+)/.exec(job)?.[1]);
    assert.ok(minutes > 0 && minutes <= 15, `browser job timeout ${minutes} minutes`);
});

// npm reads "dir/file.tgz" as the GitHub repository <owner>/<repo>; a local tarball needs ./ or /
test("the release workflow publishes the tarball by a path npm reads as a file", () => {
    const release = readFileSync(new URL(".github/workflows/release.yml", root), "utf8");
    const publishes = [...release.matchAll(/npm publish\s+"?([^"\s]+)/g)].map((m) => m[1]);
    assert.ok(publishes.length > 0, "no npm publish in release.yml");
    for (const target of publishes) {
        assert.match(target, /^(\.\/|\/)/, `npm publish ${target}: start the path with ./`);
    }
});

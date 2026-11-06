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
const OWN = new Set(["pivotkit-core", "pivotkit-react", "pivotkit-element"]);

test("every dependency is pinned to an exact version; this repository's own packages take a caret range", () => {
    const manifests = ["package.json", "packages/pivotkit-core/package.json", "packages/pivotkit-react/package.json", "packages/pivotkit-element/package.json", "tests/react19/package.json"];
    for (const file of manifests) {
        const pkg = JSON.parse(readFileSync(new URL(file, root), "utf8"));
        for (const section of ["dependencies", "devDependencies"]) {
            for (const [name, range] of Object.entries(pkg[section] ?? {})) {
                if (section === "dependencies" && OWN.has(name)) {
                    assert.match(range, /^\^\d+\.\d+\.\d+$/, `${file} ${section}.${name} is "${range}", not a caret range of an own package`);
                } else {
                    assert.match(range, /^\d+\.\d+\.\d+$/, `${file} ${section}.${name} is "${range}", not an exact version`);
                }
            }
        }
    }
});

test("the own packages' caret ranges take the version of the package in this repository", () => {
    const core = JSON.parse(readFileSync(new URL("packages/pivotkit-core/package.json", root), "utf8"));
    const react = JSON.parse(readFileSync(new URL("packages/pivotkit-react/package.json", root), "utf8"));
    assert.equal(react.dependencies["pivotkit-core"], `^${core.version}`);
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

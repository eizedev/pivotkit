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

test("every dependency is pinned to an exact version", () => {
    const manifests = ["package.json", "packages/pivotkit-core/package.json", "packages/pivotkit-react/package.json"];
    for (const file of manifests) {
        const pkg = JSON.parse(readFileSync(new URL(file, root), "utf8"));
        for (const section of ["dependencies", "devDependencies"]) {
            for (const [name, range] of Object.entries(pkg[section] ?? {})) {
                assert.match(range, /^\d+\.\d+\.\d+$/, `${file} ${section}.${name} is "${range}", not an exact version`);
            }
        }
    }
});

// docs/compatibility.md states the lowest Node, browser, React and ECharts versions and the Node
// versions CI runs. They are part of the versioning promise (docs/versioning.md), so they must be the
// ones of package.json's engines, pivotkit-react's peer dependencies, docs/browser-support.md, the
// esbuild targets of the browser builds and .github/workflows/ci.yml. Every other page that names the
// lowest Node or the container image's Node names the same one as engines and docker/Dockerfile.
// Not covered: whether the code really runs in those lowest browsers (CI runs Playwright's current
// engines only), and the status column of the page, which the reviews check by hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { parse } from "yaml";
import { assertStates } from "./docs-facts.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const json = (path) => JSON.parse(read(path));
const page = () => read("docs/compatibility.md");

/** The rows "| Browser | From |" of a page's first table with that header, as [name, version]. */
function browserFloors(text) {
    const lines = text.split("\n");
    const start = lines.findIndex((l) => /^\| Browser \| From \|$/.test(l));
    assert.ok(start >= 0, "no table | Browser | From |");
    const rows = [];
    for (const line of lines.slice(start + 2)) {
        const cells = line.match(/^\| (.+) \| (.+) \|$/);
        if (!cells) break;
        rows.push([cells[1], cells[2]]);
    }
    return rows;
}

test("the compatibility page names the lowest Node version of every package's engines", () => {
    const packages = [json("package.json"), ...readdirSync(new URL("packages/", root)).map((name) => json(`packages/${name}/package.json`))];
    const ranges = new Set(packages.map((pkg) => pkg.engines?.node).filter(Boolean));
    assert.equal(ranges.size, 1, `one Node floor for every package, not ${[...ranges].join(", ")}`);
    const lowest = [...ranges][0].match(/^>=(\d+)$/)?.[1];
    assert.ok(lowest, `engines.node is ">=<major>", not ${[...ranges][0]}`);
    assertStates(page(), "docs/compatibility.md", `Node ${lowest} or later`);
});

test("the compatibility page names the Node versions CI tests", () => {
    const versions = parse(read(".github/workflows/ci.yml")).jobs.test.strategy.matrix.node;
    assert.ok(versions?.length, "ci.yml's test job has no node matrix");
    assertStates(page(), "docs/compatibility.md", "Linux", `Node ${versions.join(" and ")}`, "CI");
});

test("the compatibility page lists the browsers of browser-support.md from the same versions", () => {
    assert.deepEqual(browserFloors(page()), browserFloors(read("docs/browser-support.md")));
});

// the esbuild target's names for the rows of the browser table
const TARGET_OF = { "Chrome, Edge and other Chromium browsers": "chrome", Firefox: "firefox", Safari: "safari" };

test("the browser builds target the lowest browsers the compatibility page names", () => {
    const wanted = browserFloors(page()).map(([name, from]) => {
        assert.ok(Object.hasOwn(TARGET_OF, name), `no esbuild name for the row "${name}"`);
        return `${TARGET_OF[name]}${from}`;
    });
    for (const build of ["packages/pivotkit-react/build.js", "packages/pivotkit-xlsx/build.js"]) {
        const target = read(build).match(/^\s*target: \[(.+)\],?$/m);
        assert.ok(target, `${build} has no esbuild target`);
        const browsers = [...target[1].matchAll(/"([a-z]+[\d.]+)"/g)].map((m) => m[1]).filter((t) => !t.startsWith("es"));
        assert.deepEqual(browsers.sort(), [...wanted].sort(), `${build} targets other browsers than the page`);
    }
});

test("the compatibility page names pivotkit-react's React and ECharts ranges as package.json has them", () => {
    const peers = json("packages/pivotkit-react/package.json").peerDependencies;
    assertStates(page(), "docs/compatibility.md", "React", "pivotkit-react", `\`${peers.react}\``);
    assertStates(page(), "docs/compatibility.md", "ECharts", "pivotkit-react", `\`${peers.echarts}\``);
});

/** The Markdown files people read about installing pivotkit: the README files, the docs and the repository's guides. Changelogs and decision records keep history. */
function currentStateDocs() {
    const top = readdirSync(root).filter((name) => name.endsWith(".md"));
    const packages = readdirSync(new URL("packages/", root)).map((name) => `packages/${name}/README.md`);
    const docs = readdirSync(new URL("docs/", root), { recursive: true }).filter((path) => path.endsWith(".md") && path.split(/[\\/]/)[0] !== "decisions").map((path) => `docs/${path}`);
    const agents = ["docker/AGENTS.md", ...readdirSync(new URL("packages/", root)).map((name) => `packages/${name}/AGENTS.md`)];
    return [...top, ...packages, ...docs, ...agents].filter((path) => {
        try {
            read(path);
            return true;
        } catch {
            return false;
        }
    });
}

test("every page that names the lowest Node names the one of package.json's engines", () => {
    const lowest = json("package.json").engines.node.match(/^>=(\d+)$/)[1];
    const found = currentStateDocs().flatMap((path) => [...read(path).matchAll(/Node(?:\.js)?\s+(\d+)\s+or\s+later/g)].map((m) => [path, m]));
    assert.ok(found.some(([path]) => path === "README.md"), "README.md names no lowest Node");
    assert.deepEqual(found.filter(([, m]) => m[1] !== lowest).map(([path, m]) => `${path}: ${m[0]}`), [], `engines.node is >=${lowest}`);
});

test("every page that names the container image's Node names the Dockerfile's distroless base", () => {
    const dockerfile = read("docker/Dockerfile");
    const base = dockerfile.match(/^ARG RUNTIME_IMAGE=gcr\.io\/distroless\/nodejs(\d+)-/m)?.[1];
    assert.ok(base, "docker/Dockerfile has no distroless nodejs base");
    assert.equal(dockerfile.match(/^ARG BUILD_IMAGE=node:(\d+)-/m)?.[1], base, "the build image and the runtime image have different Node majors");
    const found = [...currentStateDocs(), "docker/Dockerfile"].flatMap((path) => [...read(path).matchAll(/distroless\s+Node\s+(\d+)/gi)].map((m) => [path, m]));
    assert.ok(found.some(([path]) => path === "docs/reference/container.md"), "docs/reference/container.md names no Node of the image");
    assert.deepEqual(found.filter(([, m]) => m[1] !== base).map(([path, m]) => `${path}: ${m[0]}`), [], `the image runs on distroless nodejs${base}`);
});

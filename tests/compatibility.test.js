// docs/compatibility.md states the lowest Node, browser, React and ECharts versions and the Node
// versions CI runs. They are part of the versioning promise (docs/versioning.md), so they must be the
// ones of package.json's engines, pivotkit-react's peer dependencies, docs/browser-support.md and
// .github/workflows/ci.yml.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

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
    assert.match(page(), new RegExp(`\\*\\*Node ${lowest} or later\\*\\*`));
});

test("the compatibility page names the Node versions CI tests", () => {
    const matrix = read(".github/workflows/ci.yml").match(/^\s+node: \[(.+)\]$/m);
    assert.ok(matrix, "ci.yml has no node matrix");
    const versions = [...matrix[1].matchAll(/"(\d+)"/g)].map((m) => m[1]);
    assert.match(page(), new RegExp(`^\\| Linux, Node ${versions.join(" and ")} \\| Tested in CI \\|`, "m"));
});

test("the compatibility page lists the browsers of browser-support.md from the same versions", () => {
    assert.deepEqual(browserFloors(page()), browserFloors(read("docs/browser-support.md")));
});

test("the compatibility page names pivotkit-react's React and ECharts ranges as package.json has them", () => {
    const peers = json("packages/pivotkit-react/package.json").peerDependencies;
    assert.match(page(), new RegExp(`^\\| React for pivotkit-react \\| \`${peers.react}\` \\|`, "m"));
    assert.match(page(), new RegExp(`^\\| Apache ECharts for pivotkit-react \\| \`${peers.echarts}\` \\|`, "m"));
});

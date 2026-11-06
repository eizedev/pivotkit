// The build (build.js) and what it ships: the shadow root's stylesheet, what a page loads first and
// what only on demand, the bundled React, the license file, and an import without a DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as esbuild from "esbuild";
import { ECHARTS_PARTS, bundledPackages, loadGroups, options } from "../build.js";
import { hostStyles } from "../src/host-css.js";

const pkgDir = new URL("../", import.meta.url);
const reactCss = await readFile(new URL("../../pivotkit-react/dist/styles.css", import.meta.url), "utf8");
const built = await esbuild.build({ ...options, write: false, logLevel: "silent" });
const inputsOf = (files) => files.flatMap((f) => Object.keys(built.metafile.outputs[f].inputs));

const uncommented = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** The selectors that end in .pk-root (with attributes, classes or pseudo-classes) and declare a token. */
function tokensOnRoot(css) {
    const out = [];
    for (const m of uncommented(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        for (const selector of m[1].split(",").map((s) => s.trim())) {
            if (/(^|[\s>+~])\.pk-root(\[[^\]]*\]|\.[\w-]+|:[\w-]+(\([^)]*\))?)*$/.test(selector) && /--pk-[\w-]+\s*:/.test(m[2])) {
                out.push(selector);
            }
        }
    }
    return out;
}

/** Every --pk-* token a rule list declares, by selector. */
function declared(css, selector) {
    const names = new Set();
    for (const m of uncommented(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (m[1].trim() === selector) {
            for (const d of m[2].matchAll(/(--pk-[\w-]+)\s*:/g)) {
                names.add(d[1]);
            }
        }
    }
    return names;
}

test("the shadow stylesheet declares every token on :host, none on .pk-root", () => {
    const css = hostStyles(reactCss);
    assert.doesNotMatch(css, /:where\(\.pk-root/);
    const light = declared(reactCss, ":where(.pk-root)");
    const dark = declared(reactCss, ":where(.pk-root[data-pk-theme=dark])");
    assert.ok(light.size > 40 && dark.size > 20, "the token rules of pivotkit-react were not found");
    const host = declared(css, ":host");
    const hostDark = declared(css, ':host([data-pk-theme="dark"])');
    for (const t of light) {
        assert.ok(host.has(t), `${t} is not declared on :host`);
    }
    for (const t of dark) {
        assert.ok(hostDark.has(t), `${t} is not declared on :host([data-pk-theme="dark"])`);
    }
    // a --pk-font set higher up the page does not reach the report
    assert.ok(host.has("--pk-font"));
    // a token is never declared on .pk-root itself, also not with an attribute or a class
    // (.pk-root[data-pk-size=medium]): it would hide the host's value
    assert.deepEqual(tokensOnRoot(css), []);
});

test("the token check catches a token on .pk-root with an attribute", () => {
    // the medium-width override pivotkit-react had: the check above must see such a rule
    assert.deepEqual(tokensOnRoot(`${hostStyles(reactCss)}.pk-root[data-pk-size="medium"]{--pk-panel-w:244px}`), ['.pk-root[data-pk-size="medium"]']);
});

test("the transform fails loudly when pivotkit-react's token rules change", () => {
    assert.throws(() => hostStyles(".pk-root { color: red; }"), /token rules changed/);
});

test("the ECharts parts are the ones pivotkit-react registers", async () => {
    const chart = await readFile(new URL("../../pivotkit-react/src/chart.jsx", import.meta.url), "utf8");
    const used = { "echarts/charts": [], "echarts/components": [], "echarts/renderers": [] };
    for (const m of chart.matchAll(/\b(charts|components|renderers)\.([A-Z]\w+)/g)) {
        used[`echarts/${m[1]}`].push(m[2]);
    }
    for (const [mod, names] of Object.entries(ECHARTS_PARTS)) {
        assert.deepEqual([...names].sort(), [...new Set(used[mod])].sort(), mod);
    }
});

test("a page loads React, the report and the core first; ECharts and the export only on demand", () => {
    const groups = Object.fromEntries(loadGroups(built.metafile).map((g) => [g.group, g.files]));
    const initial = inputsOf(groups.initial);
    for (const name of ["react-dom/cjs/react-dom.production.min.js", "react/cjs/react.production.min.js", "@dnd-kit/core/", "pivotkit-react/dist/index.js", "pivotkit-core/src/pivot.js", "src/element.js"]) {
        assert.ok(initial.some((i) => i.includes(name)), `${name} is not in the first load`);
    }
    for (const name of ["echarts/", "zrender/", "fflate/", "pivotkit-core/src/xlsx.js"]) {
        assert.ok(!initial.some((i) => i.includes(name)), `${name} is in the first load`);
    }
    // nothing of React's development builds
    assert.ok(!initial.some((i) => i.includes(".development.")));
    assert.ok(inputsOf(groups.chart).some((i) => i.includes("echarts/lib/chart/bar/")));
    assert.ok(!inputsOf(groups.chart).some((i) => i.includes("echarts/lib/chart/sankey/")), "chart types the report does not draw are bundled");
    assert.ok(inputsOf(groups.export).some((i) => i.includes("fflate/")));
});

test("the bundled React is 18.3.1, the one of the package's devDependencies", async () => {
    const pkg = JSON.parse(await readFile(new URL("package.json", pkgDir), "utf8"));
    assert.equal(pkg.devDependencies.react, "18.3.1");
    const reactDir = bundledPackages(built.metafile).find((d) => /node_modules[\\/]react$/.test(d));
    const reactPkg = JSON.parse(await readFile(new URL(`${reactDir}/package.json`, pkgDir), "utf8"));
    assert.equal(reactPkg.version, pkg.devDependencies.react);
});

test("the license file names every bundled package", async () => {
    const text = await readFile(new URL("dist/THIRD_PARTY_LICENSES.txt", pkgDir), "utf8");
    for (const dir of bundledPackages(built.metafile)) {
        const p = JSON.parse(await readFile(new URL(`${dir}/package.json`, pkgDir), "utf8"));
        assert.ok(text.includes(`${p.name} ${p.version} (${p.license})`), p.name);
    }
    assert.match(text, /Apache License/);
});

test("the built package imports in Node without a DOM and defines nothing there", async () => {
    const mod = await import("../dist/index.js");
    assert.deepEqual(Object.keys(mod).sort(), ["EVENTS", "PivotReportElement", "TAG", "define"]);
    assert.equal(mod.TAG, "pivot-report");
    const pkg = JSON.parse(await readFile(new URL("package.json", pkgDir), "utf8"));
    assert.equal(mod.PivotReportElement.version, pkg.version);
    assert.equal(mod.define("my-report"), undefined);
    const bare = await import("../dist/element.js");
    assert.equal(bare.PivotReportElement, mod.PivotReportElement);
});

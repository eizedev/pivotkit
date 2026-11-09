// The build (build.js) and what it ships: the shadow root's stylesheet, what a page loads first and
// what only on demand, the bundled React, the license file, and an import without a DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as esbuild from "esbuild";
import { bundledPackages, loadGroups, options } from "../build.js";
import { hostStyles } from "../src/host-css.js";
import { options as reactOptions } from "../../pivotkit-react/build.js";

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

test("the chart chunks hold the chart types pivotkit-react's echarts.js imports, no other", async () => {
    const parts = await readFile(new URL("../../pivotkit-react/src/echarts.js", import.meta.url), "utf8");
    const imported = [...parts.matchAll(/\b([A-Z]\w*)Chart\b/g)].map((m) => m[1].toLowerCase());
    const groups = Object.fromEntries(loadGroups(built.metafile).map((g) => [g.group, g.files]));
    // a chart type is in the bundle when its install.js is (echarts/core itself brings helpers of others)
    const drawn = new Set(inputsOf(groups.chart).flatMap((i) => /echarts[\\/]lib[\\/]chart[\\/](\w+)[\\/]install\.js$/.exec(i)?.[1] ?? []));
    assert.deepEqual([...drawn].sort(), [...new Set(imported)].sort());
    assert.deepEqual([...drawn].sort(), ["bar", "heatmap", "line", "pie"]);
});

test("a page loads React, the report and the core first; ECharts, the export and the menus only on demand", () => {
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
    // a view in a link: pivotkit-core/link with fflate, also only on demand
    assert.ok(inputsOf(groups.link).some((i) => i.includes("pivotkit-core/src/link.js")));
    assert.ok(inputsOf(groups.link).some((i) => i.includes("fflate/")));
    assert.ok(!initial.some((i) => i.includes("pivotkit-core/src/link.js")), "the link module is in the first load");
    // the menus' panels (chip menus, chart type, Options, Views, filter, drill-down) load on demand
    assert.ok(inputsOf(groups.menus).some((i) => i.includes("pivotkit-react/dist/menus.js")));
    assert.ok(!initial.some((i) => i.includes("pivotkit-react/dist/menus.js")), "the menus are in the first load");
    // the templates' reader (pivotkit-core/templates, for the browser store) comes with the menus
    assert.ok(inputsOf(groups.menus).some((i) => i.includes("pivotkit-core/src/templates.js")));
    assert.ok(!initial.some((i) => i.includes("pivotkit-core/src/templates.js")), "pivotkit-core/templates is in the first load");
});

test("the menus' German texts load only for a German report: neither in the first load nor in the menus", () => {
    const groups = Object.fromEntries(loadGroups(built.metafile).map((g) => [g.group, g.files]));
    const text = (files) => files.map((f) => built.outputFiles.find((o) => o.path.endsWith(f))?.text ?? "").join("");
    // "Anwenden" (Apply) is a menu text only German has; "Apply" its English one
    assert.ok(text(groups.texts).includes("Anwenden"), "the German texts' chunk lacks them");
    assert.ok(!text(groups.menus).includes("Anwenden"), "the German menu texts are in the menus");
    assert.ok(!text(groups.initial).includes("Anwenden"), "the German menu texts are in the first load");
    assert.ok(text(groups.menus).includes("Apply"), "the English menu texts are not in the menus");
    // the menus' sections (section.jsx) load with the menus, only their context (help.js) first
    assert.ok(text(groups.menus).includes('className:"pk-section-head"'));
    assert.ok(!text(groups.initial).includes('className:"pk-section-head"'), "the menus' sections are in the first load");
});

test("the plain words of a view's unused parts load only when a view has such parts", () => {
    const groups = Object.fromEntries(loadGroups(built.metafile).map((g) => [g.group, g.files]));
    const text = (files) => files.map((f) => built.outputFiles.find((o) => o.path.endsWith(f))?.text ?? "").join("");
    // a text of each language (English and German), in the chunk and nowhere else
    for (const words of ["the default colours are used", "die Standardfarben werden verwendet"]) {
        assert.ok(text(groups.unused).includes(words), `the unused parts' chunk lacks "${words}"`);
        for (const other of ["initial", "menus", "texts"]) {
            assert.ok(!text(groups[other]).includes(words), `"${words}" is in ${other}`);
        }
    }
    // the warning's frame is in the first load: its title before the texts arrive
    assert.ok(text(groups.initial).includes("parts of this view could not be used"));
});

test("what runs only after a click in a menu, or on a drawn chart, is not in the first load", async () => {
    // pivotkit-react's own build: which of its modules index.js loads first (the element bundles that dist/)
    const react = await esbuild.build({ ...reactOptions, write: false, metafile: true, logLevel: "silent" });
    const out = react.metafile.outputs;
    const key = (name) => Object.keys(out).find((k) => k.endsWith(`dist/${name}`));
    const closure = (start) => {
        const seen = new Set();
        const walk = (f) => {
            if (!seen.has(f)) {
                seen.add(f);
                out[f].imports.filter((i) => i.kind === "import-statement" && out[i.path]).forEach((i) => walk(i.path));
            }
        };
        walk(key(start));
        return new Set([...seen].flatMap((f) => Object.keys(out[f].inputs)));
    };
    const first = closure("index.js");
    const menus = closure("menus.js");
    const chart = closure("echarts.js");
    // the menus' view changes and the filter's summary, sharing (copy, download, load a view), the
    // drill-down's table; the chart's label layout comes with ECharts
    for (const [mod, group, name] of [["src/menu-ops.js", menus, "menus"], ["src/share-actions.js", menus, "menus"], ["src/drill-table.js", menus, "menus"], ["src/chart-layout.js", chart, "chart"]]) {
        assert.ok(group.has(mod), `${mod} is not in the ${name}`);
        assert.ok(!first.has(mod), `${mod} is in the first load`);
    }
    // texts only those show (menu-labels.js): Options' reasons and notes, the filter's rules, sharing's notes
    // (the words of a rule on names, "does not contain", are the chip's too, so they load first)
    const groups = Object.fromEntries(loadGroups(built.metafile).map((g) => [g.group, g.files]));
    const text = (files) => files.map((f) => built.outputFiles.find((o) => o.path.endsWith(f))?.text ?? "").join("");
    for (const words of ["Nothing is collapsed.", "{count} groups expanded", "Needs a field in Rows.", "Keep the {noun} for which all of these are true:", "Link copied", "View copied as JSON"]) {
        assert.ok(text(groups.menus).includes(words), `"${words}" is not in the menus`);
        assert.ok(!text(groups.initial).includes(words), `"${words}" is in the first load`);
    }
    // what stays first: the header sort's texts and its aria-sort (table.jsx renders it)
    assert.ok(text(groups.initial).includes("Sort by {value}: largest first"));
    assert.ok(text(groups.initial).includes('"aria-sort"'));
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
    // the entry without the definition has the same exports
    assert.deepEqual(Object.keys(bare).sort(), Object.keys(mod).sort());
    assert.equal(bare.EVENTS, mod.EVENTS);
});

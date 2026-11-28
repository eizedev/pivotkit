// The build (build.js) and what it ships: the shadow root's stylesheet, what a page loads first and
// what only on demand, the bundled React, the license file, and an import without a DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as esbuild from "esbuild";
import { CHUNK_GROUPS, SIZE_BUDGET_KIB, SIZE_NODE, bundledPackages, loadGroups, options, shadowStyleRuns, zlibNote } from "../build.js";
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
    assert.deepEqual([...drawn].sort(), ["bar", "heatmap", "line", "pie", "treemap"]);
});

test("every load group has a budget and every budget a group: SIZE_BUDGET_KIB is initial and CHUNK_GROUPS, in one order", () => {
    assert.deepEqual(Object.keys(SIZE_BUDGET_KIB), ["initial", ...CHUNK_GROUPS.map(([group]) => group)]);
});

test("a chunk loaded on demand that belongs to no load group fails the build instead of counting nowhere", () => {
    const metafile = /** @type {any} */ ({
        outputs: {
            "dist/index.js": { imports: [{ path: "dist/chunks/export-AAAA.js", kind: "dynamic-import" }, { path: "dist/chunks/charts2-BBBB.js", kind: "dynamic-import" }] },
            "dist/chunks/export-AAAA.js": { imports: [] },
            "dist/chunks/charts2-BBBB.js": { imports: [] }
        }
    });
    assert.throws(() => loadGroups(metafile), /dist\/chunks\/charts2-BBBB\.js loads on demand but belongs to no load group/);
    metafile.outputs["dist/index.js"].imports.pop();
    assert.deepEqual(Object.fromEntries(loadGroups(metafile).map((g) => [g.group, g.files])).export, ["dist/chunks/export-AAAA.js"]);
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
    // the "i" of the menus' sections (section.jsx) loads with the menus, only their context (help.js)
    // first; the groups themselves (popover.jsx: Group) are first load, as More draws its groups
    assert.ok(text(groups.menus).includes('className:"pk-setting-info"'));
    assert.ok(!text(groups.initial).includes('className:"pk-setting-info"'), "the menus' sections are in the first load");
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
    // drill-down's table; the chart's marks (with pivotkit-core/chart's label layout), its instance
    // with its events and each draw come with ECharts
    for (const [mod, group, name] of [["src/menu-ops.js", menus, "menus"], ["src/share-actions.js", menus, "menus"], ["src/drill-table.js", menus, "menus"], ["src/chart-decorate.js", chart, "chart"], ["src/chart-draw.js", chart, "chart"]]) {
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
    // pivotkit-core/chart (the chart's marks and label layout) and the ECharts option (chart.js, which
    // pivotkit-core's index.js re-exports too: build.js's barrelOff) load with the chart, never first
    for (const name of ["pivotkit-core/src/chart-style.js", "pivotkit-core/src/chart-layout.js", "pivotkit-core/src/chart.js"]) {
        assert.ok(inputsOf(groups.chart).some((i) => i.includes(name)), `${name} is not in the chart group`);
        assert.ok(!inputsOf(groups.initial).some((i) => i.includes(name)), `${name} is in the first load`);
    }
    // the view's description and its words (describe.js and describe-labels.js, which pivotkit-core's
    // index.js re-exports too: build.js's barrelOff) load with the HTML report; the Excel number
    // formats (excel-format.js) with the export
    for (const [name, group] of [["pivotkit-core/src/describe.js", "report"], ["pivotkit-core/src/describe-labels.js", "report"], ["pivotkit-core/src/excel-format.js", "export"]]) {
        assert.ok(inputsOf(groups[group]).some((i) => i.includes(name)), `${name} is not in the ${group} group`);
        assert.ok(!inputsOf(groups.initial).some((i) => i.includes(name)), `${name} is in the first load`);
    }
    // the chart data stays first: the chart's text alternative and the tips read it (chart-series.js)
    assert.ok(inputsOf(groups.initial).some((i) => i.includes("pivotkit-core/src/chart-series.js")), "chart-series.js is not in the first load");
    // what stays first: the header sort's texts and its aria-sort (table.jsx renders it)
    assert.ok(text(groups.initial).includes("Sort by {value}: largest first"));
    assert.ok(text(groups.initial).includes('"aria-sort"'));
});

test("a bundled import of toEChartsOption from pivotkit-core's index.js fails the build: the chart takes it from pivotkit-core/chart", async () => {
    // the element's options with one module in place of the entries
    const bundle = (contents) => esbuild.build({ ...options, entryPoints: undefined, splitting: false, outdir: undefined, stdin: { contents, resolveDir: new URL(".", pkgDir).pathname }, write: false, logLevel: "silent" });
    await assert.rejects(bundle('import { toEChartsOption } from "pivotkit-core"; console.log(toEChartsOption);'), /toEChartsOption/);
    const ok = await bundle('import { toEChartsOption } from "pivotkit-core/chart"; console.log(toEChartsOption);');
    assert.equal(ok.errors.length, 0);
});

test("only pivotkit-report gets describeView from pivotkit-core's index.js: a bundled import elsewhere fails the build", async () => {
    const bundle = (contents, resolveDir) => esbuild.build({ ...options, entryPoints: undefined, splitting: false, outdir: undefined, stdin: { contents, resolveDir }, write: false, metafile: true, logLevel: "silent" });
    await assert.rejects(bundle('import { describeView } from "pivotkit-core"; console.log(describeView);', new URL(".", pkgDir).pathname), /describeView/);
    // a namespace import too: esbuild only warns there, and the name would be undefined at run time
    await assert.rejects(bundle('import * as core from "pivotkit-core"; console.log(core.describeView);', new URL(".", pkgDir).pathname), /describeView/);
    await assert.rejects(bundle('import { DESCRIBE_LABELS } from "pivotkit-core"; console.log(DESCRIBE_LABELS);', new URL(".", pkgDir).pathname), /DESCRIBE_LABELS/);
    // pivotkit-report's own import, with the rest of the index, and one copy of each module
    const report = await bundle('import { render } from "pivotkit-report"; console.log(render);', new URL(".", pkgDir).pathname);
    const inputs = Object.keys(report.metafile.inputs);
    assert.equal(inputs.filter((i) => /pivotkit-core[\\/]src[\\/]describe\.js$/.test(i)).length, 1);
    assert.equal(inputs.filter((i) => /pivotkit-core[\\/]src[\\/]index\.js$/.test(i)).length, 1);
});

test("the size check says when its gzip sizes can differ from CI's", () => {
    const node = (version, shared) => ({ version, versions: { zlib: "1.3.2" }, config: { variables: { node_shared_zlib: shared } } });
    assert.deepEqual(zlibNote(node(`v${SIZE_NODE}.1.0`, false)), [`gzip level 9 with zlib 1.3.2, Node v${SIZE_NODE}.1.0`]);
    assert.match(zlibNote(node(`v${SIZE_NODE}.1.0`, true))[1], /system's zlib/);
    assert.match(zlibNote(node("v22.1.0", false))[1], /this is Node 22/);
});

test("the HTML report, the SVG and printing load on first use: pivotkit-report is no part of the first load or the menus", () => {
    const groups = Object.fromEntries(loadGroups(built.metafile).map((g) => [g.group, g.files]));
    for (const name of ["pivotkit-report/src/render.js", "pivotkit-report/src/template.js", "pivotkit-report/src/svg.js", "pivotkit-react/dist/chunks/report-run"]) {
        assert.ok(inputsOf(groups.report).some((i) => i.includes(name)), `${name} is not in the report group`);
        for (const other of ["initial", "menus"]) {
            assert.ok(!inputsOf(groups[other]).some((i) => i.includes(name)), `${name} is in ${other}`);
        }
    }
    // reading a print template's own CSS (a host's template only) is a chunk of its own, never loaded with the report
    assert.ok(inputsOf(groups.template).some((i) => i.includes("pivotkit-report/src/template-style.js")), "template-style.js is not a group of its own");
    for (const other of ["initial", "menus", "report", "export"]) {
        assert.ok(!inputsOf(groups[other]).some((i) => i.includes("pivotkit-report/src/template-style.js")), `template-style.js is in ${other}`);
    }
});

test("loading data (allow-import) loads on first use: the import UI, its texts and the readers are no part of the first load or the menus", () => {
    const groups = Object.fromEntries(loadGroups(built.metafile).map((g) => [g.group, g.files]));
    const text = (files) => files.map((f) => built.outputFiles.find((o) => o.path.endsWith(f))?.text ?? "").join("");
    for (const name of ["pivotkit-react/dist/import-ui.js", "pivotkit-core/src/import.js", "pivotkit-core/src/import-table.js", "pivotkit-core/src/import-csv.js", "pivotkit-core/src/import-json.js"]) {
        assert.ok(inputsOf(groups.import).some((i) => i.includes(name)), `${name} is not in the import group`);
        for (const other of ["initial", "menus"]) {
            assert.ok(!inputsOf(groups[other]).some((i) => i.includes(name)), `${name} is in ${other}`);
        }
    }
    // the dialog's and the notes' texts, English and German, come with it; the Data button's first
    for (const words of ["Back to original data", "Datenquelle", "empty rows were left out."]) {
        assert.ok(text(groups.import).includes(words), `"${words}" is not in the import group`);
        assert.ok(!text(groups.initial).includes(words), `"${words}" is in the first load`);
    }
    assert.ok(text(groups.initial).includes("Or load your own data"), "the empty report's line is not in the first load");
});

test("a report with server-url loads the server's code on first use: the rows' state, the request and the network code are no part of the first load", () => {
    const groups = Object.fromEntries(loadGroups(built.metafile).map((g) => [g.group, g.files]));
    const text = (files) => files.map((f) => built.outputFiles.find((o) => o.path.endsWith(f))?.text ?? "").join("");
    // use-server-rows.js, server-request.js and server-rows.js, by words only they hold
    for (const words of ["reading the server's rows failed", "server.getToken must be a function", "/api/v1/sources/records"]) {
        assert.ok(text(groups.server).includes(words), `"${words}" is not in the server group`);
        for (const other of ["initial", "menus"]) {
            assert.ok(!text(groups[other]).includes(words), `"${words}" is in ${other}`);
        }
    }
    // the console line of a report whose server code did not load (PivotReport.jsx ServerGate) stays first
    assert.ok(text(groups.initial).includes("the server's code did not load"), "the gate's message is not in the first load");
});

test("the import worker is one file next to dist/, without imports, where the element's code looks for it", async () => {
    const { workerOptions } = await import("../build.js");
    const worker = await esbuild.build({ ...workerOptions, write: false, metafile: true, logLevel: "silent" });
    assert.deepEqual(worker.outputFiles.map((f) => f.path.slice(f.path.indexOf("/dist/") + 1)), ["dist/import-worker.js"]);
    assert.deepEqual(Object.values(worker.metafile.outputs)[0].imports, [], "the worker imports a module");
    assert.ok(Object.keys(worker.metafile.inputs).some((i) => i.includes("pivotkit-core/src/import-csv.js")));
    // the element's code asks for "../import-worker.js" from its module: that module is in dist/chunks/
    const holder = built.outputFiles.filter((f) => f.text.includes('"../import-worker.js"'));
    assert.equal(holder.length, 1);
    assert.match(holder[0].path, /\/dist\/chunks\/[^/]+\.js$/);
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

// A bundler (Angular's esbuild, Vite, webpack) drops an import of a file that package.json's
// "sideEffects" leaves out. dist/index.js imports some chunks only for their effects ("import './x.js'"):
// each of them must be listed, else the host's build warns and may leave the chunk out.
test("every file dist/index.js imports for its effects is listed in sideEffects", async () => {
    const pkg = JSON.parse(await readFile(new URL("package.json", pkgDir), "utf8"));
    const listed = pkg.sideEffects.map((pattern) => new RegExp(`^${pattern.replace(/[.]/g, "\\.").replace(/\*/g, "[^/]*")}$`));
    const index = await readFile(new URL("dist/index.js", pkgDir), "utf8");
    const bare = [...index.matchAll(/import\s*"(\.\/[^"]+)"/g)].map((m) => `./dist/${m[1].slice(2)}`);
    assert.ok(bare.length > 0, "dist/index.js imports no file for its effects: the check would prove nothing");
    for (const file of bare) {
        assert.ok(listed.some((re) => re.test(file)), `${file} is imported by dist/index.js for its effects but not listed in sideEffects`);
    }
});

test("the German first-load texts and the tips' table are no part of the first load: each is a group of its own", () => {
    const groups = Object.fromEntries(loadGroups(built.metafile).map((g) => [g.group, g.files]));
    const text = (files) => files.map((f) => built.outputFiles.find((o) => o.path.endsWith(f))?.text ?? "").join("");
    // "Pivot-Bericht" is the report's name in German, "Pivot report" in English
    assert.ok(text(groups.lang).includes("Pivot-Bericht"), "the German texts' chunk lacks them");
    for (const other of ["initial", "menus", "texts", "tips"]) {
        assert.ok(!text(groups[other]).includes("Pivot-Bericht"), `the German first-load texts are in ${other}`);
    }
    assert.ok(text(groups.initial).includes("Pivot report"), "the English first-load texts are not in the first load");
    // the tips' table (src/tips.js: TIP_THRESHOLDS) loads after the first render; their state first
    assert.ok(inputsOf(groups.tips).some((i) => /pivotkit-react[\\/]dist[\\/]chunks[\\/]tips-/.test(i)), "the tips' table is not a group of its own");
    assert.ok(!text(groups.initial).includes("pieSlices: 7"), "the tips' table is in the first load");
    assert.ok(text(groups.tips).includes("pieSlices: 7") || text(groups.tips).includes("pieSlices:7"), "the tips' group lacks the table");
    // pivotkit-react's deferred.js (German at once) is not bundled, deferred-late.js is
    assert.ok(inputsOf(groups.initial).some((i) => i.endsWith("pivotkit-react/dist/deferred-late.js")));
    assert.ok(!Object.keys(built.metafile.inputs).some((i) => i.endsWith("pivotkit-react/dist/deferred.js")), "pivotkit-react's deferred.js is bundled");
});

test("the rules only the menus match load with the menus, in their place: first load and menus together are the whole stylesheet", async () => {
    const { joinStyles } = await import("../src/css-split.js");
    const groups = Object.fromEntries(loadGroups(built.metafile).map((g) => [g.group, g.files]));
    const text = (files) => files.map((f) => built.outputFiles.find((o) => o.path.endsWith(f))?.text ?? "").join("");
    const runs = await shadowStyleRuns();
    // a rule of the Filter level (.pk-summary-card) waits for the menus, the toolbar's buttons (.pk-btn) do not
    const has = (css, cls) => new RegExp(`\\.${cls}[{,.:>\\[ ]`).test(css);
    assert.ok(has(joinStyles(runs.first, null), "pk-btn"), "the buttons' rules are not in the first load's runs");
    assert.ok(!has(joinStyles(runs.first, null), "pk-summary-card"), "the Filter level's rules are in the first load's runs");
    assert.ok(has(text(groups.initial), "pk-btn"), "the buttons' rules are not in the first load");
    assert.ok(!has(text(groups.initial), "pk-summary-card"), "the Filter level's rules are in the first load");
    assert.ok(has(text(groups.menus), "pk-summary-card"), "the Filter level's rules are not in the menus");
    // put together they are pivotkit-react's stylesheet as the shadow root had it in one piece
    const { code } = await esbuild.transform(hostStyles(reactCss), { loader: "css", minify: true });
    assert.equal(runs.menus.length, runs.first.length - 1);
    assert.ok(joinStyles(runs.first, runs.menus) === code, "the runs put together are not the stylesheet");
});

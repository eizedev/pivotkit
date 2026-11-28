// Builds the package into dist/: ES modules that hold everything the element needs, React 18.3.1 and
// ReactDOM, pivotkit-react, pivotkit-core and @dnd-kit, so a page needs no bundler, no import map and
// no React of its own.
//
// - dist/index.js defines <pivot-report>; dist/element.js has the same exports and defines nothing.
// - ECharts and the XLSX/CSV export (pivotkit-core/export with fflate) are loaded on first use, from
//   chunks next to the entry (dist/chunks/), as pivotkit-react's dynamic imports ask for them. The
//   chart chunks hold only the parts of ECharts pivotkit-react's dist/echarts.js imports by name.
// - pivotkit-react's styles.css becomes a string with its tokens moved to :host (src/host-css.js).
// - dist/THIRD_PARTY_LICENSES.txt holds the license texts of every bundled package.
//
// pivotkit-react's dist/ is built first, from its own build options: the element bundles the package
// as it ships.
//
//   node build.js          build
//   node build.js --size   build, print the gzip size of what a page loads, fail above SIZE_BUDGET_KIB
import * as esbuild from "esbuild";
import { readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { options as reactOptions } from "../pivotkit-react/build.js";
import { thirdPartyLicenses } from "../../scripts/third-party-licenses.js";
export { bundledPackages } from "../../scripts/third-party-licenses.js";
import { hostStyles } from "./src/host-css.js";
import { splitStyles } from "./src/css-split.js";
import { isMain } from "../../scripts/is-main.js";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const pkg = JSON.parse(await readFile(join(here, "package.json"), "utf8"));

/**
 * The code pivotkit-react's menus load and nothing else does, and the rest of its code, as texts: the
 * classes each writes decide which rules load with the menus (src/css-split.js). From pivotkit-react's
 * own build, the dist/ the element bundles; the rest includes every other group loaded on demand, so a
 * rule that the import UI or the HTML report shares with the menus stays first.
 * @returns {Promise<{ first: string, menus: string }>}
 */
async function reactCode() {
    const react = await esbuild.build({ ...reactOptions, write: false, metafile: true, logLevel: "silent" });
    const out = react.metafile.outputs;
    const key = (name) => Object.keys(out).find((k) => k.endsWith(`dist/${name}`));
    const closure = (start) => {
        const seen = new Set();
        const walk = (f) => {
            if (f && !seen.has(f)) {
                seen.add(f);
                out[f].imports.filter((i) => i.kind === "import-statement" && out[i.path]).forEach((i) => walk(i.path));
            }
        };
        start.forEach((name) => walk(key(name)));
        return seen;
    };
    const before = closure(["index.js", "deferred-late.js"]);
    const menus = new Set([...closure(["menus.js"])].filter((f) => !before.has(f)));
    const text = (f) => react.outputFiles.find((o) => o.path.endsWith(f))?.text ?? "";
    const js = Object.keys(out).filter((f) => f.endsWith(".js"));
    return { first: js.filter((f) => !menus.has(f)).map(text).join("\n"), menus: [...menus].map(text).join("\n") };
}

/** The virtual module of the menus' rules (menuStyles). */
const MENU_STYLES = "pivotkit-element:menu-styles";

/** @type {Promise<{ first: string[], menus: string[] }> | undefined} */
let styleRuns;

/**
 * pivotkit-react/styles.css for the shadow root: its tokens moved to :host (src/host-css.js), minified,
 * in the runs of the first load and of the menus (src/css-split.js). Read from pivotkit-react's dist/,
 * once per process.
 */
export function shadowStyleRuns() {
    return (styleRuns ??= (async () => {
        const css = hostStyles(await readFile(join(here, "..", "pivotkit-react", "dist", "styles.css"), "utf8"));
        const { code } = await esbuild.transform(css, { loader: "css", minify: true });
        const { first, menus } = await reactCode();
        return splitStyles(code, first, menus);
    })());
}

/**
 * The stylesheet's modules: the first load's runs are pivotkit-react/styles.css; the menus' runs are a
 * module that pivotkit-react's dist/menus.js imports, so they arrive with the menus and never after them
 * (src/styles.js puts them in their place).
 */
const shadowStyles = {
    name: "shadow-styles",
    setup(build) {
        build.onLoad({ filter: /pivotkit-react[\\/]dist[\\/]styles\.css$/ }, async () => ({ contents: `export const first = ${JSON.stringify((await shadowStyleRuns()).first)};`, loader: "js" }));
        build.onResolve({ filter: new RegExp(`^${MENU_STYLES}$`) }, () => ({ path: MENU_STYLES, namespace: "menu-styles" }));
        build.onLoad({ filter: /.*/, namespace: "menu-styles" }, async () => ({ contents: `export const menus = ${JSON.stringify((await shadowStyleRuns()).menus)};`, loader: "js" }));
        build.onLoad({ filter: /pivotkit-react[\\/]dist[\\/]menus\.js$/ }, async (args) => ({
            contents: `${await readFile(args.path, "utf8")}\nimport { addMenuStyles } from ${JSON.stringify(join(here, "src", "styles.js"))};\nimport { menus as menuRuns } from "${MENU_STYLES}";\naddMenuStyles(menuRuns);\n`,
            loader: "js",
            resolveDir: dirname(args.path)
        }));
    }
};

/**
 * pivotkit-core's index.js without the re-exports that only chunks loaded on demand use. esbuild's
 * code splitting puts a file into the chunks of every entry whose static import records reach it. A
 * re-export (`export { x } from "./x.js"`) is such a record, whatever names the importer uses, and
 * "sideEffects": false does not change it. Tree shaking only drops a file nothing uses at all. So a
 * file only the chart or the HTML report uses would land in the first load: the first load imports
 * index.js, and index.js re-exports it. Nothing else holds these files there: no namespace import, no
 * `export *` outside REPORT_CORE.
 * - chart.js (toEChartsOption): the chart loads the option from pivotkit-core/chart instead
 *   (pivotkit-react's echarts.js, pivotkit-report's svg.js), so the option's code goes to the chart group.
 * - describe.js (describeView and the rest) and describe-labels.js (its English and German words):
 *   only pivotkit-report uses them. Its imports of "pivotkit-core" get the barrel with these lines
 *   (REPORT_CORE), which only the report's chunk reaches.
 * A bundled named or namespace import of these names from "pivotkit-core" anywhere else fails the
 * build (logOverride below); so does a change of the lines below. A dynamic import("pivotkit-core")
 * would not: none exists, keep it so.
 */
const BARREL_OFF = Object.freeze({
    chart: 'export { toEChartsOption } from "./chart.js";\n',
    report: 'export { describeSource, describeView, DESCRIBE_LIMITS } from "./describe.js";\nexport { DESCRIBE_LABELS, describeLabels } from "./describe-labels.js";\n'
});
const CORE_SRC = join(here, "..", "pivotkit-core", "src");
/** The virtual module pivotkit-report's imports of "pivotkit-core" resolve to: the barrel with BARREL_OFF.report. */
const REPORT_CORE = "pivotkit-element:report-core";
const barrelOff = {
    name: "barrel-off",
    setup(build) {
        build.onLoad({ filter: /pivotkit-core[\\/]src[\\/]index\.js$/ }, async (args) => {
            let code = await readFile(args.path, "utf8");
            for (const line of Object.values(BARREL_OFF)) {
                if (!code.includes(line)) {
                    throw new Error(`pivotkit-element build: pivotkit-core's index.js has no line ${JSON.stringify(line.trim())}`);
                }
                code = code.replace(line, "");
            }
            return { contents: code, loader: "js" };
        });
        build.onResolve({ filter: /^pivotkit-core$/ }, (args) => (/pivotkit-report[\\/]src[\\/]/.test(args.importer) ? { path: REPORT_CORE, namespace: "report-core" } : undefined));
        // resolved from pivotkit-core's src/, as index.js resolves its own lines
        build.onLoad({ filter: /.*/, namespace: "report-core" }, () => ({ contents: `export * from "pivotkit-core";\n${BARREL_OFF.report}`, loader: "js", resolveDir: CORE_SRC }));
    }
};

/**
 * pivotkit-react's dist/deferred-late.js in place of its dist/deferred.js (pivotkit-react's build.js
 * keeps that one a file of its own for this): the German first-load texts load before the first render
 * of a German report only, the tips' table after the first render. Both stay out of the first load.
 */
const DEFERRED_FILE = /pivotkit-react[\\/]dist[\\/]index\.js$/;
const deferredLate = {
    name: "deferred-late",
    setup(build) {
        build.onResolve({ filter: /^\.\/deferred\.js$/ }, (args) => (DEFERRED_FILE.test(args.importer) ? { path: join(dirname(args.importer), "deferred-late.js") } : undefined));
    }
};

/** @type {import("esbuild").BuildOptions} */
export const options = {
    absWorkingDir: here,
    entryPoints: { index: "src/index.js", element: "src/element.js" },
    outdir: "dist",
    bundle: true,
    splitting: true,
    chunkNames: "chunks/[name]-[hash]",
    format: "esm",
    platform: "browser",
    target: reactOptions.target,
    minify: true,
    define: { "process.env.NODE_ENV": '"production"', __PIVOTKIT_ELEMENT_VERSION__: JSON.stringify(pkg.version), __PIVOTKIT_IMPORT_WORKER__: JSON.stringify("../import-worker.js") },
    // the license texts go into one file (licenses() below), not into comments of the bundle
    legalComments: "none",
    metafile: true,
    plugins: [shadowStyles, barrelOff, deferredLate],
    // a namespace import of a name barrelOff removes would be undefined at run time: fail the build
    logOverride: { "import-is-undefined": "error" },
    logLevel: "warning"
};

/**
 * dist/import-worker.js: pivotkit-react's import worker with pivotkit-core's CSV and JSON readers in
 * one file, started by the element to read a file off the page (allow-import). A build of its own, so
 * the modules it shares with the report do not split the report's first load into more files; the
 * element's code, in dist/chunks/, finds it at ../import-worker.js (__PIVOTKIT_IMPORT_WORKER__).
 * @type {import("esbuild").BuildOptions}
 */
export const workerOptions = {
    ...options,
    entryPoints: { "import-worker": "../pivotkit-react/dist/import-worker.js" },
    splitting: false,
    plugins: [],
    metafile: false
};

/** The license and notice files of the bundled packages, as one text. */
async function licenses(metafile) {
    return thirdPartyLicenses(metafile, here,
        "pivotkit-element bundles the following packages. Their license texts follow; pivotkit-core,\n" +
        "pivotkit-react and pivotkit-report are part of pivotkit (MIT, see LICENSE).");
}

/**
 * The most a page may load per group, gzip, in KiB, as CI's official Node build measures it.
 * - The first load ("initial") is a hard line. A feature that needs room there makes it by moving
 *   something out of the first load. Only the maintainer raises it.
 * - The groups loaded later keep about 0.5 KiB above what CI measures.
 * - A change that takes a group over its budget raises it on purpose, with the measure and the reason
 *   in the commit. The commits that raised each budget: `git log -p -- build.js`.
 * - Before moving code out of the first load, measure a probe build with `--size`: more chunk files
 *   can make the first load larger.
 * `--size` fails above it.
 */
export const SIZE_BUDGET_KIB = { initial: 182.5, chart: 262.4, export: 13.7, link: 7.5, menus: 60.3, texts: 8.8, unused: 6.5, import: 23.9, report: 29.7, template: 3, lang: 6.2, tips: 1.8 };

/**
 * The load group of each chunk a page loads on demand, by its file name (esbuild's `[name]-[hash]`),
 * in the order of `SIZE_BUDGET_KIB`. `loadGroups` fails on a chunk that matches none.
 * @type {ReadonlyArray<[string, RegExp]>}
 */
export const CHUNK_GROUPS = Object.freeze([
    ["chart", /^echarts-/],
    ["export", /^export-/],
    ["link", /^link-/],
    ["menus", /^menus-/],
    ["texts", /^menu-texts-/],
    ["unused", /^unused-texts-/],
    ["import", /^import-(?:ui|csv|json)-/],
    ["report", /^report-run-/],
    ["template", /^template-style-/],
    ["lang", /^labels-[a-z]+-/],
    ["tips", /^tips-/]
]);

/**
 * What a page loads, from the build's metafile: the entry with its static imports ("initial"), and
 * each group of dynamic imports with what they add ("chart": ECharts, "export": XLSX and CSV, "link":
 * a view in a link, pivotkit-core/link with fflate's deflate and inflate, "menus": the menus' panels,
 * "texts": the menus' texts of a language besides English, "unused": the plain words of a view's
 * unused parts, English and every other language, "import": loading data with allow-import, the import
 * UI with its texts and pivotkit-core/import with its CSV and JSON readers, "report": the HTML report,
 * the chart as SVG and printing, pivotkit-report with ECharts' SVG renderer, beyond the chart group;
 * "template": pivotkit-report's reading of a print template's own CSS, which the element never loads;
 * "lang": the first load's texts of a language besides English, before a report in it renders;
 * "tips": the tips' table, right after the first render).
 * @param {import("esbuild").Metafile} metafile
 * @returns {{ group: string, files: string[] }[]}
 */
export function loadGroups(metafile) {
    const closure = (start, seen = new Set()) => {
        const walk = (file) => {
            if (seen.has(file)) {
                return;
            }
            seen.add(file);
            for (const imp of metafile.outputs[file]?.imports ?? []) {
                if (imp.kind === "import-statement") {
                    walk(imp.path);
                }
            }
        };
        start.forEach(walk);
        return seen;
    };
    const initial = closure(["dist/index.js"]);
    // dynamic imports of the first load and of the chunks they load (the menus load the export)
    const dynamic = [];
    const scan = (files) => {
        for (const f of files) {
            for (const i of metafile.outputs[f]?.imports ?? []) {
                if (i.kind === "dynamic-import" && !dynamic.includes(i.path)) {
                    dynamic.push(i.path);
                    scan(closure([i.path]));
                }
            }
        }
    };
    scan(initial);
    // a chunk loaded on demand that no pattern names fails the build: its bytes would count nowhere
    const groupOf = (file) => {
        const name = file.split(/[\\/]/).pop() ?? file;
        const found = CHUNK_GROUPS.find(([, pattern]) => pattern.test(name));
        if (!found) {
            throw new Error(`build.js: ${file} loads on demand but belongs to no load group; add it to CHUNK_GROUPS`);
        }
        return found[0];
    };
    const groups = [{ group: "initial", files: [...initial] }];
    for (const [name] of CHUNK_GROUPS) {
        const files = [...closure(dynamic.filter((f) => groupOf(f) === name))].filter((f) => !initial.has(f));
        groups.push({ group: name, files });
    }
    // the report always loads the chart first (ECharts draws its SVG): it counts what it adds to it
    const chart = new Set(groups.find((g) => g.group === "chart")?.files);
    const report = groups.find((g) => g.group === "report");
    if (report) {
        report.files = report.files.filter((f) => !chart.has(f));
    }
    // a print template's CSS is read after the report has loaded: it counts what it adds to both
    const template = groups.find((g) => g.group === "template");
    if (template && report) {
        const loaded = new Set([...chart, ...report.files]);
        template.files = template.files.filter((f) => !loaded.has(f));
    }
    return groups;
}

/**
 * The size of each load group, raw and gzip (level 9), in bytes.
 * @param {import("esbuild").Metafile} metafile
 */
async function sizes(metafile) {
    const out = [];
    for (const { group, files } of loadGroups(metafile)) {
        let raw = 0;
        let gzip = 0;
        for (const file of files) {
            const bytes = await readFile(join(here, file));
            raw += bytes.length;
            gzip += gzipSync(bytes, { level: 9 }).length;
        }
        out.push({ group, files: files.length, raw, gzip });
    }
    return out;
}

/** The Node major of CI's size step (.github/workflows/ci.yml; tests/workflows.test.js checks it). */
export const SIZE_NODE = "24";

/**
 * Which zlib measured the gzip sizes, and a warning when CI would measure other ones. CI runs the
 * size check on an official Node build, which compresses with the zlib bundled in Node. A Node built
 * against the system's zlib (Homebrew's, for one) compresses the same bytes differently: Homebrew's
 * Node 26 on a Mac measured the first load 0.6 KiB smaller than CI. Another Node major bundles
 * another zlib build. An official Node of SIZE_NODE gives CI's numbers.
 * @param {{ version: string, versions: { zlib?: string }, config: { variables: Record<string, unknown> } }} [node]  process, or a stand-in
 * @returns {string[]}
 */
export function zlibNote(node = process) {
    const line = `gzip level 9 with zlib ${node.versions.zlib}, Node ${node.version}`;
    const shared = Boolean(node.config.variables.node_shared_zlib);
    const major = node.version.replace(/^v/, "").split(".")[0];
    if (!shared && major === SIZE_NODE) {
        return [line];
    }
    const why = shared ? "this Node uses the system's zlib" : `this is Node ${major}`;
    return [line, `CI measures with an official Node ${SIZE_NODE} build and its bundled zlib; ${why}, so the sizes can differ from CI's.`];
}

if (isMain(import.meta.url)) {
    await esbuild.build(reactOptions);
    await rm(join(here, "dist"), { recursive: true, force: true });
    const result = await esbuild.build(options);
    await esbuild.build(workerOptions);
    await writeFile(join(here, "dist", "THIRD_PARTY_LICENSES.txt"), await licenses(result.metafile));
    if (process.argv.includes("--size")) {
        const kb = (n) => `${(n / 1024).toFixed(1)} KiB`;
        zlibNote().forEach((line) => console.log(line));
        let over = false;
        for (const { group, files, raw, gzip } of await sizes(result.metafile)) {
            const budget = SIZE_BUDGET_KIB[group];
            const fits = gzip / 1024 <= budget;
            over ||= !fits;
            console.log(`${group.padEnd(8)} ${String(files).padStart(3)} files ${kb(raw).padStart(11)} ${kb(gzip).padStart(11)} gzip  (budget ${budget} KiB${fits ? "" : ", OVER"})`);
        }
        if (over) {
            console.error("pivotkit-element: a load group is over its size budget (SIZE_BUDGET_KIB in build.js)");
            process.exit(1);
        }
    }
}

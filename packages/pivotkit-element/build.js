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
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { options as reactOptions } from "../pivotkit-react/build.js";
import { thirdPartyLicenses } from "../../scripts/third-party-licenses.js";
export { bundledPackages } from "../../scripts/third-party-licenses.js";
import { hostStyles } from "./src/host-css.js";

const here = new URL(".", import.meta.url).pathname;
const pkg = JSON.parse(await readFile(join(here, "package.json"), "utf8"));

/** pivotkit-react/styles.css as a JS string for the shadow root. */
const shadowStyles = {
    name: "shadow-styles",
    setup(build) {
        build.onLoad({ filter: /pivotkit-react[\\/]dist[\\/]styles\.css$/ }, async (args) => {
            const css = hostStyles(await readFile(args.path, "utf8"));
            const { code } = await esbuild.transform(css, { loader: "css", minify: true });
            return { contents: `export default ${JSON.stringify(code)};`, loader: "js" };
        });
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
    plugins: [shadowStyles],
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
 * The most a page may load per group, gzip, in KiB, one measurement on one Mac each time it was set.
 * Set at about 10 % over what was measured (initial 123.5, chart 200.3, export 7.7). Raised since, with
 * less headroom: initial to 138 for the tips and the field descriptions (134.8 measured), then to 152
 * for the chart's display settings with axis and group labels, sharing a view, the skeleton, the
 * clear buttons, the zone explanations, the help switches and the filter states (148.1 measured,
 * about 3 % headroom). fflate is a chunk the export and the link share: export 10 (9.3 measured),
 * link 7 (6.7 measured). The menus' panels (the chip menus, chart type, Options, Views, the filter
 * and the drill-down) load on demand, right after the report's first render (pivotkit-react's
 * menus.js, issue #34): with the view files, the explanations, Enlarge and Full screen the first load
 * is 151.2 measured, the menus 9.3 (budget 11). The texts only the menus show load with them
 * (pivotkit-react's menu-labels.js), which made room in the first load for the automatic chart type,
 * the field list's keys and the touch targets; then the explanations of the settings too (gzip on Node 24 measured the first
 * load 0.3 higher than on 22): first load 151.0 measured, the menus 13.8, their budget raised to 15
 * for the texts moved there. The Export menu with its texts and the export's work (export-run.js) then
 * moved out of the first load into the menus, with the copies of the table and the drill-down's
 * Enlarge and Export menu: first load 151.0 measured (no more than before), the menus 16.4, budget
 * 17.5; the export (now loaded from the menus, so the groups follow dynamic imports of the chunks
 * too) with the rows export, TSV and JSON 10.6, budget 11.5. Both load on demand, never first.
 * The templates (shared and my views, publish, the browser store with pivotkit-core/templates) load
 * with the menus, with the texts and actions of save and delete; the check of chartOptions and the
 * marks on the chart's option (chart-decorate.js with the tooltip) moved to the chart
 * (dist/echarts.js), which made room for the collapsible field list: first load 150.3 measured
 * (Node 26), the chart 203.5, the menus 18.9 with the Export menu and the templates both, budget 20
 * (about 5 % over). Save, Save as with its question before a name is replaced, New and the export's
 * entries off for an empty report brought the menus to 20.4 (first load 151.4), budget 21. The menus
 * load right after the first render, before a menu opens, so they count against every page that shows
 * a report; the first load stays at its budget. Sorting with a click on a table header (#55: the
 * header buttons, their state and the texts; the table renders first, so it cannot wait for the
 * menus) took the first load to 152.2 measured, budget 152.5. The menus' German texts then became a
 * chunk of their own, loaded with the menus for a German report only ("texts", 4.0 measured, budget
 * 4.5; a German page loads it on top of the menus), and the menus' sections moved out of the first
 * load into the menus (#73): first load 152.2, the menus 17.9 measured; the budgets stay as they were:
 * the menus' headroom was kept for the chip menu's sections (issue #57). With them (each setting in
 * one line, the folded sections' states, Reset menu sections) the menus are 18.9 measured, the first
 * load unchanged at 152.2 (the CSS they need stays in the one stylesheet; it was made smaller to fit),
 * so the menus' budget went down to 19.5. A review then gave the value condition a line of its own,
 * the menus a head row with the field's name and its "i", the folded titles their spoken ", changed"
 * and Reset menu sections its focus and status: 19.3 measured, CI some 0.3 more, budget 20.
 * Then what runs only after a click left the first load (#73): the menus' view changes and the
 * filter's summary (menu-ops.js), sharing's copy, download and load (share-actions.js), the
 * drill-down's table (drill-table.js) and the texts only those show went to the menus, the chart's
 * label layout (chart-layout.js) to the chart. Measured on a Mac: first load 147.8 (152.2 before),
 * chart 204.4, export 10.7, link 6.7, menus 22.8, German texts 4.4. Since then one rule for every
 * loaded group: the budget is 3 to 5 % above what CI measures (the Mac's number plus about 0.3),
 * rounded: chart 211, export 11.5, link 7.3, menus 24, texts 4.9. The first load is the exception:
 * every page pays it, so its budget stays about 1 KiB above what CI measures (149 over 148.1), and a
 * feature that needs more raises it on purpose.
 * A view's unused parts in plain words (#56): pivotkit-core's issues got a code and the texts' params
 * (0.6 KiB in the first load, the core is bundled whole) and the report the warning's frame (its
 * title, fold, live region and line layout, 0.5 KiB); the words themselves are the group "unused"
 * (English and German), loaded only when a view has such parts. First load 148.9 measured on a Mac
 * (CI about 149.2), so its budget went to 150. A review then capped the open warning at its first
 * lines with "Show N more", moved the focus after its x to what follows and told apart lines of one
 * name: first load 149.4 (CI about 149.7, within 150), "unused" 4.2 (CI about 4.5, budget 4.7).
 * The chip menus and Options in levels (a first level that says what is set, a level per topic, the
 * search over all levels, every choice at once; levels.jsx, menu-topics.js) took the menus to 27.6
 * measured on a Mac (CI about 27.9, budget 29) and their German texts to 4.7 (CI about 5.0, budget
 * 5.2); the levels' rules in the one stylesheet, less the folds and forms they replace, took the
 * first load from 149.5 to 149.6 (CI about 149.9), so its budget went to 151. Views in levels, no
 * folding anywhere and the review's findings (the Filter level's folded conditions, the search's
 * words, a format not offered, popovers that keep their side) took the menus to 28.5 (CI about 28.8,
 * budget 30) and their German texts to 4.8 (CI about 5.1, budget 5.3); the first load is 149.4 (the
 * folding's code and rules left it).
 * The filter rules (#89, #90): pivotkit-core's item comparisons and relative date ranges (the core
 * is bundled whole) and the chips' words for them ("last 5 years (2022–2026)", "from 2022", which the
 * first render shows) took the first load to 151.2 measured on a Mac (CI about 151.5), so its budget
 * went to 152.5; the Filter level's quick choices and rule editor took the menus to 31.7 (CI about
 * 32.0, budget 33.5), their German texts to 5.0 (CI about 5.3, budget 5.5) and the unused parts'
 * texts of the new issue codes to 4.5 (CI about 4.8, budget 5). The review's fixes (a rule on names
 * in words on the chip, so the label operators load first; the chip's cut rule; the field list's
 * touch hit areas) took the first load to 151.8 (CI about 152.1), budget 153.
 * The Filter level rebuilt (the summary card, quick choices with the data's share and the reference
 * date, Years combined, the tail of items left out, rules with an "i" and a result line, the item
 * picker): the core's anchor and source-day comparison and the chips' words for the data's share
 * ("last 2 years (2025; 2026 has no data)", "last 12 months to Dec 2025"), which the first render
 * shows, took the first load to 153.7 measured on a Mac (CI about 154.0), budget 155; the level
 * itself took the menus to 39.1 (CI about 39.4, budget 41) and their German texts to 6.2 (CI about
 * 6.5, budget 6.8).
 * The fixes of the PowerShell Universal test (#110-#115, #82, #83): popovers in the top layer with
 * Tab moved inside them, a name for every form field, the row label column measured once, the
 * identifier rule, the unused-parts warning for the host's view and its lines that follow the view
 * shown took the first load to 155.5 measured on a Mac (CI about 155.8), budget 157.
 * Start over (a menu of Reset and New with their reasons, first-load texts), the one group style of
 * every menu (popover.jsx's Group, first load as More draws its groups) and the toolbar's measured
 * overflow took the first load from 155.9 to 156.8 measured on a Mac; with pivotkit-core's readers
 * (#123) 157.4 (CI about 157.7), budget 158.5.
 * Loading data in the browser (#44, allow-import): the import UI, its texts and pivotkit-core/import
 * with its readers are the group "import", loaded on the first use of the Data menu, a drop or the
 * empty report's button: 19.1 measured on a Mac, then 19.8 with the review's fixes (a worker's
answers checked, a plugin's minimal table completed, failed sheets, the host's errors; CI about
20.1), budget 21. The first load keeps the
 * Data button, the drop handler, the data steps' state in the report, the empty report's line and the
 * rules of the overlay and the preview (one stylesheet): about 1.9 KiB more code, and 0.6 KiB more
 * because esbuild splits the modules the import UI shares with the first load into two more files,
 * each compressed on its own. First load 160.0 measured on a Mac (CI about 160.3), budget 161.5;
 * the menus 39.7 with the Data menu's panel, within 41.
 * View version 2 (#165): normalize() reads every view through migrate() from version 1, checks keys
 * inside each part with did-you-mean hints, folds text for the filters, and the report reads and
 * writes the new filter shape: first load 163.8 measured on a Mac; with the words of the new relative
 * ranges a chip shows for a loaded view (English and German, labels.js) 165.8, budget 167.5. The
 * plain words of a view's unused parts grow with the new issue codes: 5.1, budget 5.5. With the
 * describe, precision and ties steps, the cap on a view's issues and the check of long items the first
 * load is 167.7 measured on a Mac (CI about 0.3 more), budget 169; the unused words 5.4.
 * The Filter level edits what view version 2 can say: "does not begin with" and "does not end with",
 * "Also keep items without a value", a date's quick choices with a unit (This, Last, Next, Before the
 * last, the current period, rolling, counted from the first record or a date) under More choices,
 * Top items with the items tied with the last one: the menus from 40.0 to 41.8 measured on a Mac (CI
 * about 0.3 more), budget 43; the first load 168.0 (the chips' words for quarters, weeks and "this").
 * CI measures the first load about 0.5 more than a Mac, not 0.3: 168.8 in CI run 43332518926
 * (de76a55) against 168.3 on a Mac (#198). With the tip on column subtotals and its button (English
 * and German), the subtotal column's edge and title (#156) the first load is 168.6 on a Mac (CI about
 * 169.1), budget 170.5. The link is 7.2 on both, 0.1 below its old budget: 7.5.
 * The HTML report, the chart as SVG and printing (#165): pivotkit-report with ECharts' SVG renderer is
 * the group "report", loaded on the first of these exports, counted as what it adds to the chart group
 * it loads first: 19.9 measured on a Mac, budget 21. Two things go elsewhere because esbuild assigns a
 * module to the chunks of every entry whose imports reach it, even through a barrel module that only
 * re-exports it: zrender's SVG painter (ECharts' renderers barrel, shared with the chart) lands in the
 * chart group, 215.8 measured (204.4 before), budget 222.5; and pivotkit-core's describe.js (behind the
 * core's index.js) with chartPlan, now pivotkit-core's, in the first load: 170.0 measured (168.3 before),
 * budget 171.5. The Export menu's three entries and the report's export and print code took the menus
 * to 43.6 (42.3 before), budget 45. Together with the column subtotals' tip (#156) and the report's
 * closest() hints: first load 170.7 on a Mac (CI about 171.2), budget 172; menus 43.8; report 20.2.
 * `--size` fails above it; raise it on purpose, with the reason in the commit.
 */
export const SIZE_BUDGET_KIB = { initial: 172.5, chart: 222.5, export: 11.5, link: 7.5, menus: 45, texts: 6.8, unused: 5.5, import: 21, report: 21 };

/**
 * What a page loads, from the build's metafile: the entry with its static imports ("initial"), and
 * each group of dynamic imports with what they add ("chart": ECharts, "export": XLSX and CSV, "link":
 * a view in a link, pivotkit-core/link with fflate's deflate and inflate, "menus": the menus' panels,
 * "texts": the menus' texts of a language besides English, "unused": the plain words of a view's
 * unused parts, English and every other language, "import": loading data with allow-import, the import
 * UI with its texts and pivotkit-core/import with its CSV and JSON readers, "report": the HTML report,
 * the chart as SVG and printing, pivotkit-report with ECharts' SVG renderer, beyond the chart group).
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
    const groupOf = (file) =>
        /[\\/]echarts-[^\\/]+$/.test(file) ? "chart" : /[\\/]report-run-[^\\/]+$/.test(file) ? "report" : /[\\/]import-(?:ui|csv|json)-[^\\/]+$/.test(file) ? "import" : /[\\/]link-[^\\/]+$/.test(file) ? "link" : /[\\/]menus-[^\\/]+$/.test(file) ? "menus" : /[\\/]menu-texts-[^\\/]+$/.test(file) ? "texts" : /[\\/]unused-texts-[^\\/]+$/.test(file) ? "unused" : "export";
    const groups = [{ group: "initial", files: [...initial] }];
    for (const name of ["chart", "export", "link", "menus", "texts", "unused", "import", "report"]) {
        const files = [...closure(dynamic.filter((f) => groupOf(f) === name))].filter((f) => !initial.has(f));
        groups.push({ group: name, files });
    }
    // the report always loads the chart first (ECharts draws its SVG): it counts what it adds to it
    const chart = new Set(groups.find((g) => g.group === "chart")?.files);
    const report = groups.find((g) => g.group === "report");
    if (report) {
        report.files = report.files.filter((f) => !chart.has(f));
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

if (import.meta.url === `file://${process.argv[1]}`) {
    await esbuild.build(reactOptions);
    await rm(join(here, "dist"), { recursive: true, force: true });
    const result = await esbuild.build(options);
    await esbuild.build(workerOptions);
    await writeFile(join(here, "dist", "THIRD_PARTY_LICENSES.txt"), await licenses(result.metafile));
    if (process.argv.includes("--size")) {
        const kb = (n) => `${(n / 1024).toFixed(1)} KiB`;
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

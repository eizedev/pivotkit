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
 * pivotkit-core's index.js without its re-export of toEChartsOption. esbuild's code splitting puts a
 * file into the chunks of every entry whose static import records reach it. A re-export
 * (`export { x } from "./x.js"`) is such a record, whatever names the importer uses, and
 * "sideEffects": false does not change it. Tree shaking only drops a file nothing uses at all. So
 * chart.js, used by the chart, would land in the first load: the first load imports index.js, and
 * index.js re-exports chart.js. Nothing else holds it there: no namespace import, no `export *`.
 * The chart loads the option from pivotkit-core/chart instead (pivotkit-react's echarts.js,
 * pivotkit-report's svg.js), so the option's code goes to the chart group. A bundled import of
 * toEChartsOption from "pivotkit-core" then fails the build; so does a change of the line below.
 */
const BARREL_CHART_LINE = 'export { toEChartsOption } from "./chart.js";\n';
const chartOffBarrel = {
    name: "chart-off-barrel",
    setup(build) {
        build.onLoad({ filter: /pivotkit-core[\\/]src[\\/]index\.js$/ }, async (args) => {
            const code = await readFile(args.path, "utf8");
            if (!code.includes(BARREL_CHART_LINE)) {
                throw new Error(`pivotkit-element build: pivotkit-core's index.js has no line ${JSON.stringify(BARREL_CHART_LINE.trim())}`);
            }
            return { contents: code.replace(BARREL_CHART_LINE, ""), loader: "js" };
        });
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
    plugins: [shadowStyles, chartOffBarrel, deferredLate],
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
 * The chart's text size as a token (#221: textSize, the layout's fontSize, the room of title and legend
 * from the sizes, in pivotkit-core's chart option of the first load): 171.9 on a Mac (CI 172.5, at
 * the budget of 172.5), budget 173.
 * Bidi controls left out of the HTML report and the SVG (pivotkit-report) and the CSV and XLSX
 * (pivotkit-core): report 21.0 on a Mac (CI 21.1, 20.9 before), budget 21.5.
 * A view from field names (#253): the one walk over the places a view names a field
 * (pivotkit-core's mapFieldRefs, shared by viewFileFields of the first load and renameFields) and the
 * grouping names and identifier rule now in pivotkit-core: first load 172.9 on a Mac (172.5 before;
 * CI about 173.5), budget 174. The layout code itself stays out (its constants are marked pure).
 * The Filter level's rules (#203, #244, #245: one radio that takes the focus on a click, an emptied
 * value that takes its rule off, a second rule added while the first one waits): the menus 45.96 on a
 * Mac (45.87 before; CI 46.0, over the budget of 46 that had about 0.1 left), budget 47 (2 % above
 * CI, below the rule's 3 % to keep the menus in check).
 * After the encode issue codes (#261) main's first load is 173.36 on a Mac, about 173.95 in CI (CI
 * measured 174.0 for 173.4 on a Mac in run 43604441863): at the budget of 174 already. The element's
 * importWorkerUrl with its origin check (#194) adds about 0.2. Budget 175, about 1 KiB above what CI
 * measures, the first load's rule.
 * Years before 1 and after 9999 in the Filter level (#351: Years combined and its summary written as the
 * table writes years, the reference date's field for years after 9999, days compared by their ms; in
 * menu-ops.js, so the first load stays as it is): the menus 46.9 on a Mac (CI about 47.0, at the budget
 * of 47 after #339 and #355), budget 48 (2 % above CI, below the rule's 3 %).
 * The HTML report on a dark screen (#370): the dark rules under the root's data-pk-theme guard, for the
 * system's dark theme and for a root that asks for dark, and the colour scale's dark colour mixed by
 * one rule per half from each cell's place: report 21.9 on a Mac (21.6 before; CI 22.0, at the budget),
 * and with the template's colours for the chart (#369) about 22.1 to 22.3: budget 22.5.
 * A print template's own colours for the chart (#369): pivotkit-report reads and resolves a
 * template's CSS in a module of its own, template-style.js, loaded only for a template of the host's
 * (it imports nothing, so no module of the report becomes a chunk of its own); the element's Export
 * menu renders with the default template and never loads it: the group "template", 2.5 on a Mac,
 * budget 3, counted as what it adds to the report group. What stays in the report group (a token
 * that names another one followed, a heatmap colour ECharts cannot mix left out): report 21.9 on a
 * Mac (21.6 before); with the dark-screen rules (#370): 22.1 on a Mac, within 22.5.
 * When the data is from in the files (#331): the workbook's document property DataAsOf in
 * pivotkit-core's XLSX writer (its part, content type and relationship) took the export group to 12.0
 * on a Mac (11.7 before), budget 12.3; "Data as of" in the HTML report's details, its placeholder and
 * the check that the time exists took the report group to 22.7 on a Mac (22.3 before), budget 23
 * (both within the rule's 3 %).
 * The chart's grid margins (pivotkit-core's GRID_TOP and HEATMAP_GRID_BOTTOM, defined once and shared
 * by the first load's toEChartsOption and the chart's label layout) add 40 bytes to the first load:
 * a chunk cannot inline a constant another chunk imports. 174.38 to 174.41 on a Mac; CI measured
 * main at 175.0, so initial goes to 175.1.
 * Why CI measured more than a Mac (#546): Homebrew's Node uses the system's zlib, CI's official Node
 * the zlib bundled in it. An official Node 24 on a Mac measures what CI does (zlibNote, SIZE_NODE); the
 * numbers from here on are its. The ECharts option (pivotkit-core's chart.js, toEChartsOption) then
 * left the first load for the chart (chartOffBarrel): first load 175.1 to 173.4, chart 218.8 to
 * 220.8. The budgets stay.
 * Inline results that round as the view shows (#478): the report group carries the shown-number CSV and
 * JSON writer, 23.07 on a Mac with Homebrew's zlib; report goes to 23.3. The same writer is in the
 * export group (the browser's Table as CSV): CI measured 12.3 against 12.3; export goes to 12.6.
 * The HTML report's row count in plural forms and the rows its filters keep, with ROW_COUNT_TEXTS
 * and pluralForm shared with pivotkit-core (#547): report 23.0 with Homebrew's zlib (22.8 before);
 * with #478's writer 23.3, at that budget: report goes to 23.5.
 * The zoom slider, the legend toggle and 100 % stacks (#36): ECharts' slider component (dataZoom)
 * takes the chart group to 231.1 with Homebrew's zlib (221.5 before), and the slider's keyboard
 * control (#575, chart-legend.js zoomKeyProps) to 231.7. CI's zlib measured 232.5 on the merged
 * head (about 0.7 more than a Mac): chart goes to 233. It is a lazy group, loaded with the first chart. The
 * Display settings in levels (#106: chartTopics, the Axis, Tooltip, Series and Layout levels) with
 * the zoom slider, 100 % switch and series list take menus to 48.5 (47.6 before) and the German menu
 * texts to 7.3 (7.0): menus goes to 49, texts to 7.5. The first load grows 0.6 to 174.36 (the view
 * keys, a view file's newer keys, the legend's announcement); the zoom and legend logic stays in the
 * chart group (chart-legend.js).
 * A chart's reference lines (#48): ECharts' markLine component draws them, 5.9 KiB of the chart group
 * alone; with pivotkit-core's numbers, the checks with their reasons, the labels at their lines and
 * the tooltip's lines the chart group was 230.7 on a Mac before #36. MarkLine in a chunk of its own,
 * loaded with the first line, was measured too: esbuild split ECharts' shared modules into more
 * chunks, and the chart group grew with it; so markLine stays in the chart's chunk. The SVG draws
 * twice to place the labels at their lines: the report group 23.46 with Homebrew's zlib, budget 23.8.
 * With #36 merged, CI's zlib (an official Node 24.22.3) measures the two features adding up: the
 * chart group 222.2 before both, 231.4 with #48 alone, 232.5 with #36 alone, 241.6 with both (no
 * second copy of anything); budget 242.6. The menus with the Reference lines level 49.6, budget 50.5;
 * their German texts 7.6, budget 7.8.
 * The first load with both is 175.6 on CI's zlib (174.9 before #48): the view key, the rules of which
 * chart draws which line (0.17 of it) and the words of the lines. The rules cannot leave the first
 * load cleanly: the menus need them from pivotkit-core's main entry, and a new entry point would be
 * one more bare import for a host's import map. The maintainer raised the budget for 0.8.0, about
 * 0.5 KiB above CI: 176.1; the split of the first load is #546 (0.9.0).
 * Fixed colours, the share in the tooltip and the chart image on the clipboard (#54), measured
 * before #48 with Homebrew's zlib: the colours and the share in the chart's option take the chart
 * group 0.8 up; the colour beside each series, the share switch and Copy chart image take the menus
 * 1.3 and the German menu texts 0.2 up; two words for unused parts take unused to 5.5. The first
 * load grows 0.19 (the view's colours through the same list check as the hidden series, one memo for
 * chartOptions and colorMap); the report group gets render's colorMap and the light colour of a pair.
 * With #48 and #54 together, CI's zlib measures: initial 175.85, chart 242.45, menus 51.04, texts
 * 7.80, unused 5.53, report 23.70. The first load may grow in 0.8.0, its split is #546 (0.9.0):
 * initial goes to 176.4, CI's measure plus about 0.5 KiB; chart to 243.5, menus to 52, texts to 8,
 * unused to 6 and report to 24.
 * Row labels that keep their width while the table fits (#584): the table measures whether it fits
 * its box before the first paint (table.jsx fitLabels, label-room.js). CI's zlib measures the first
 * load at 176.5 (176.0 on main before): initial goes to 177, CI's measure plus about 0.5 KiB; its
 * split is #546 (0.9.0).
 * Tabs for Table and Chart, the zones' section with its heading row and "i", the always-present More
 * and the warning on label keys no longer shown (#580), together with #584: CI's zlib measures the
 * first load at 177.13; initial goes to 177.6, CI's measure plus about 0.5 KiB. The split is still
 * #546 (0.9.0).
 * The zones as shelves with "+ Add" in each zone (#581): the button, its focus and status after a
 * pick and the shelves' styles load first, the menu with the menus. CI's zlib measures the first
 * load at 177.9 (177.1 on main before) and the menus at 52.5 (51.7 before): initial goes to 178.4,
 * CI's measure plus about 0.5 KiB, and menus to 53. The review round adds the zone limits in "+ Add",
 * the empty report's open zones, the status line's repeat and the numbered repeated values: CI's
 * zlib measures the first load at 178.3, so initial goes to 178.8. The split is still #546 (0.9.0).
 * The date range in the footer and the years a grouping combines (#109): the first load gets the
 * date context (the axis titles, one year's items, the footer's range), the menus the Group level's
 * first line and its hints from the data. On top of #581, CI's zlib measures the first load at
 * 180.6 (178.3 before) and the menus at 53.6 (52.5 before): initial goes to 181 and menus to 54,
 * CI's measure plus about 0.5 KiB. The split of the first load is still #546 (0.9.0).
 * The split of the first load (#546). The first load's budget is a hard line at 181 KiB: a feature
 * that needs room there makes it by moving something out, not by raising the budget. Three parts left
 * it (pivotkit-react's deferred-late.js, src/css-split.js): the German first-load texts (group
 * "lang", 5.9 on CI's zlib, budget 6.2), loaded before a German report renders; the tips' table with
 * its conditions (group "tips", 2.4, budget 2.8), loaded after the first render; and the style rules
 * only the menus' code writes, which now load inside the menus' chunk. CI's zlib measures the first
 * load at 173.2 (180.9 before) and the menus at 56.9 (53.6 before). The menus carry the rules they
 * took over, so their budget goes to 57.5, CI's measure plus about 0.5 KiB.
 * `--size` fails above it; raise it on purpose, with the reason in the commit.
 */
export const SIZE_BUDGET_KIB = { initial: 181, chart: 243.5, export: 12.6, link: 7.5, menus: 57.5, texts: 8, unused: 6, import: 22, report: 24, template: 3, lang: 6.2, tips: 2.8 };

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
    const groupOf = (file) =>
        /[\\/]echarts-[^\\/]+$/.test(file) ? "chart" : /[\\/]report-run-[^\\/]+$/.test(file) ? "report" : /[\\/]template-style-[^\\/]+$/.test(file) ? "template" : /[\\/]import-(?:ui|csv|json)-[^\\/]+$/.test(file) ? "import" : /[\\/]link-[^\\/]+$/.test(file) ? "link" : /[\\/]menus-[^\\/]+$/.test(file) ? "menus" : /[\\/]menu-texts-[^\\/]+$/.test(file) ? "texts" : /[\\/]unused-texts-[^\\/]+$/.test(file) ? "unused" : /[\\/]labels-[a-z]+-[^\\/]+$/.test(file) ? "lang" : /[\\/]tips-[^\\/]+$/.test(file) ? "tips" : "export";
    const groups = [{ group: "initial", files: [...initial] }];
    for (const name of ["chart", "export", "link", "menus", "texts", "unused", "import", "report", "template", "lang", "tips"]) {
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

/** The Node major of CI's size step (.github/workflows/ci.yml; tests/ci.test.js checks it). */
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

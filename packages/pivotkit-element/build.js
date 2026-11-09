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
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { options as reactOptions } from "../pivotkit-react/build.js";
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
    define: { "process.env.NODE_ENV": '"production"', __PIVOTKIT_ELEMENT_VERSION__: JSON.stringify(pkg.version) },
    // the license texts go into one file (licenses() below), not into comments of the bundle
    legalComments: "none",
    metafile: true,
    plugins: [shadowStyles],
    logLevel: "warning"
};

/**
 * The package directories (node_modules/<name> or node_modules/@scope/<name>) of the bundled inputs.
 * @param {import("esbuild").Metafile} metafile
 */
export function bundledPackages(metafile) {
    const dirs = new Set();
    for (const input of Object.keys(metafile.inputs)) {
        const m = /^(.*node_modules[\\/](?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/.exec(input);
        if (m) {
            dirs.add(m[1]);
        }
    }
    return [...dirs].sort();
}

/** The license and notice files of the bundled packages, as one text. */
async function licenses(metafile) {
    const parts = [
        "pivotkit-element bundles the following packages. Their license texts follow; pivotkit-core and",
        "pivotkit-react are part of pivotkit (MIT, see LICENSE).",
        ""
    ];
    // one entry per name and version: tslib, say, is bundled from two directories
    const seen = new Set();
    for (const dir of bundledPackages(metafile)) {
        const abs = join(here, dir);
        const meta = JSON.parse(await readFile(join(abs, "package.json"), "utf8"));
        if (seen.has(`${meta.name}@${meta.version}`)) {
            continue;
        }
        seen.add(`${meta.name}@${meta.version}`);
        parts.push("=".repeat(78), `${meta.name} ${meta.version} (${meta.license})`, "=".repeat(78), "");
        // LICENSE, NOTICE and the like; a licenses/ directory (ECharts: code it took from d3) too
        const files = [];
        for (const entry of await readdir(abs, { withFileTypes: true })) {
            if (!/^(licen[cs]es?|notice|copying)/i.test(entry.name)) {
                continue;
            }
            if (entry.isFile()) {
                files.push(entry.name);
            } else if (entry.isDirectory()) {
                files.push(...(await readdir(join(abs, entry.name))).map((f) => join(entry.name, f)));
            }
        }
        if (files.length === 0) {
            throw new Error(`${meta.name}: no license file to bundle`);
        }
        for (const f of files.sort()) {
            parts.push(`--- ${f} ---`, "", (await readFile(join(abs, f), "utf8")).trim(), "");
        }
    }
    return parts.join("\n");
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
 * texts of the new issue codes to 4.5 (CI about 4.8, budget 5).
 * `--size` fails above it; raise it on purpose, with the reason in the commit.
 */
export const SIZE_BUDGET_KIB = { initial: 152.5, chart: 211, export: 11.5, link: 7.3, menus: 33.5, texts: 5.5, unused: 5 };

/**
 * What a page loads, from the build's metafile: the entry with its static imports ("initial"), and
 * each group of dynamic imports with what they add ("chart": ECharts, "export": XLSX and CSV, "link":
 * a view in a link, pivotkit-core/link with fflate's deflate and inflate, "menus": the menus' panels,
 * "texts": the menus' texts of a language besides English, "unused": the plain words of a view's
 * unused parts, English and every other language).
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
        /[\\/]echarts-[^\\/]+$/.test(file) ? "chart" : /[\\/]link-[^\\/]+$/.test(file) ? "link" : /[\\/]menus-[^\\/]+$/.test(file) ? "menus" : /[\\/]menu-texts-[^\\/]+$/.test(file) ? "texts" : /[\\/]unused-texts-[^\\/]+$/.test(file) ? "unused" : "export";
    const groups = [{ group: "initial", files: [...initial] }];
    for (const name of ["chart", "export", "link", "menus", "texts", "unused"]) {
        const files = [...closure(dynamic.filter((f) => groupOf(f) === name))].filter((f) => !initial.has(f));
        groups.push({ group: name, files });
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

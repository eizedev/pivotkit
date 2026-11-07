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
 * the field list's keys and the touch targets: first load 150.6 measured, the menus 12.9, their budget
 * raised to 14 for the texts moved there.
 * `--size` fails above it; raise it on purpose, with the reason in the commit.
 */
export const SIZE_BUDGET_KIB = { initial: 152, chart: 221, export: 10, link: 7, menus: 14 };

/**
 * What a page loads, from the build's metafile: the entry with its static imports ("initial"), and
 * each group of dynamic imports with what they add ("chart": ECharts, "export": XLSX and CSV, "link":
 * a view in a link, pivotkit-core/link with fflate's deflate and inflate, "menus": the menus' panels).
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
    const dynamic = [...initial].flatMap((f) => (metafile.outputs[f]?.imports ?? []).filter((i) => i.kind === "dynamic-import").map((i) => i.path));
    const groupOf = (file) => (/[\\/]echarts-[^\\/]+$/.test(file) ? "chart" : /[\\/]link-[^\\/]+$/.test(file) ? "link" : /[\\/]menus-[^\\/]+$/.test(file) ? "menus" : "export");
    const groups = [{ group: "initial", files: [...initial] }];
    for (const name of ["chart", "export", "link", "menus"]) {
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

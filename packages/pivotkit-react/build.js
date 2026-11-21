// Builds the package into dist/: index.js with the JSX compiled (React.createElement, so the host needs
// only `react` and `react-dom`, no JSX runtime), echarts.js (the parts of ECharts the chart uses,
// imported by name; index.js loads it on the first chart) and the stylesheet. React, ReactDOM,
// ECharts, pivotkit-core and dnd-kit stay imports: the host's bundler resolves them once.
//
//   node build.js            build
//   node build.js --watch    rebuild on change
import * as esbuild from "esbuild";
import { isMain } from "../../scripts/is-main.js";
import { fileURLToPath } from "node:url";

const pkg = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("./package.json", import.meta.url), "utf8"));
const externals = [...Object.keys(pkg.peerDependencies ?? {}), ...Object.keys(pkg.dependencies ?? {})];

/** chart.jsx's import("./echarts.js") stays an import of dist/echarts.js, a file of its own. */
const echartsFile = {
    name: "echarts-file",
    setup(build) {
        build.onResolve({ filter: /^\.\/echarts\.js$/ }, (args) => (args.kind === "dynamic-import" ? { path: "./echarts.js", external: true } : undefined));
    }
};

/**
 * PivotReport.jsx's import of "./deferred.js" stays an import of dist/deferred.js, a file of its own,
 * as echarts.js does: pivotkit-element's build bundles dist/deferred-late.js in its place, so German
 * texts and the tips' table load later there (src/deferred.js says what they are). PivotReport.jsx is
 * in dist/index.js, so the path is right from there.
 */
const deferredFile = {
    name: "deferred-file",
    setup(build) {
        build.onResolve({ filter: /^\.\/deferred\.js$/ }, (args) => (args.kind === "import-statement" && /PivotReport\.jsx$/.test(args.importer) ? { path: "./deferred.js", external: true } : undefined));
    }
};

/** @type {import("esbuild").BuildOptions} */
export const options = {
    absWorkingDir: fileURLToPath(new URL(".", import.meta.url)),
    // menus.js: the menus' panels, loaded on demand (lazy-menus.jsx); what it shares with index.js is
    // a chunk of its own (splitting), so both use one copy of each module (one React context each)
    // labels.js (the package's "./labels"): every text, for hosts; not part of the report's first load
    // menu-texts-de.js: the menus' German texts, loaded with the menus for a German report only
    // import-ui.js: loading data (allowImport), loaded on its first use (lazy-import.jsx)
    // import-worker.js: the module worker a host may start to read CSV and JSON off the page (importWorker)
    // deferred.js: German texts and the tips' table at once; deferred-late.js: the same loaded later,
    // for pivotkit-element (deferredFile)
    entryPoints: { index: "src/index.js", echarts: "src/echarts.js", menus: "src/menus.js", "menu-texts-de": "src/menu-labels-de.js", labels: "src/all-labels.js", "import-ui": "src/import-module.js", "import-worker": "src/import-worker.js", deferred: "src/deferred.js", "deferred-late": "src/deferred-late.js", styles: "src/styles.css" },
    outdir: "dist",
    splitting: true,
    chunkNames: "chunks/[name]-[hash]",
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2022", "chrome111", "firefox113", "safari16.4"],
    // the packages and their subpaths (echarts/core, react-dom/client, pivotkit-core/export)
    external: externals.flatMap((name) => [name, `${name}/*`]),
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    loader: { ".js": "jsx" },
    legalComments: "none",
    // the version for the view files' `generator` (src/version.js), from package.json
    define: { __PIVOTKIT_REACT_VERSION__: JSON.stringify(pkg.version) },
    plugins: [echartsFile, deferredFile],
    logLevel: "warning"
};

if (isMain(import.meta.url)) {
    if (process.argv.includes("--watch")) {
        const ctx = await esbuild.context(options);
        await ctx.watch();
        console.log("watching src/ for pivotkit-react");
    } else {
        await esbuild.build(options);
    }
}

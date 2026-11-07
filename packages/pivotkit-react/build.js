// Builds the package into dist/: index.js with the JSX compiled (React.createElement, so the host needs
// only `react` and `react-dom`, no JSX runtime), echarts.js (the parts of ECharts the chart uses,
// imported by name; index.js loads it on the first chart) and the stylesheet. React, ReactDOM,
// ECharts, pivotkit-core and dnd-kit stay imports: the host's bundler resolves them once.
//
//   node build.js            build
//   node build.js --watch    rebuild on change
import * as esbuild from "esbuild";

const pkg = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("./package.json", import.meta.url), "utf8"));
const externals = [...Object.keys(pkg.peerDependencies ?? {}), ...Object.keys(pkg.dependencies ?? {})];

/** chart.jsx's import("./echarts.js") stays an import of dist/echarts.js, a file of its own. */
const echartsFile = {
    name: "echarts-file",
    setup(build) {
        build.onResolve({ filter: /^\.\/echarts\.js$/ }, (args) => (args.kind === "dynamic-import" ? { path: "./echarts.js", external: true } : undefined));
    }
};

/** @type {import("esbuild").BuildOptions} */
export const options = {
    absWorkingDir: new URL(".", import.meta.url).pathname,
    // menus.js: the menus' panels, loaded on demand (lazy-menus.jsx); what it shares with index.js is
    // a chunk of its own (splitting), so both use one copy of each module (one React context each)
    entryPoints: { index: "src/index.js", echarts: "src/echarts.js", menus: "src/menus.js", styles: "src/styles.css" },
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
    plugins: [echartsFile],
    logLevel: "warning"
};

if (import.meta.url === `file://${process.argv[1]}`) {
    if (process.argv.includes("--watch")) {
        const ctx = await esbuild.context(options);
        await ctx.watch();
        console.log("watching src/ for pivotkit-react");
    } else {
        await esbuild.build(options);
    }
}

// Builds the package into dist/: one ES module with the JSX compiled (React.createElement, so the
// host needs only `react` and `react-dom`, no JSX runtime) and the stylesheet. React, ReactDOM,
// ECharts, pivotkit-core and dnd-kit stay imports: the host's bundler resolves them once.
//
//   node build.js            build
//   node build.js --watch    rebuild on change
import * as esbuild from "esbuild";

const pkg = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("./package.json", import.meta.url), "utf8"));
const externals = [...Object.keys(pkg.peerDependencies ?? {}), ...Object.keys(pkg.dependencies ?? {})];

/** @type {import("esbuild").BuildOptions} */
export const options = {
    absWorkingDir: new URL(".", import.meta.url).pathname,
    entryPoints: { index: "src/index.js", styles: "src/styles.css" },
    outdir: "dist",
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

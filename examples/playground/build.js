// Builds the playground into examples/playground/dist/: index.html, app.js and app.css, static files
// that open from any web server (GitHub Pages, a test container). The package is built first, and the
// playground imports it as a consumer does: "pivotkit-react" and "pivotkit-react/styles.css".
//
//   node examples/playground/build.js           build
//   node examples/playground/build.js --serve   build, watch and serve on http://localhost:5173
import * as esbuild from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { options as packageOptions } from "../../packages/pivotkit-react/build.js";

const here = new URL(".", import.meta.url).pathname;
const serve = process.argv.includes("--serve");
const port = Number(process.env.PORT ?? 5173);

/** @type {import("esbuild").BuildOptions} */
const options = {
    absWorkingDir: here,
    entryPoints: { app: "src/main.jsx" },
    outdir: "dist",
    bundle: true,
    format: "esm",
    splitting: true,
    chunkNames: "chunks/[name]-[hash]",
    platform: "browser",
    target: ["es2022", "chrome111", "firefox113", "safari16.4"],
    jsx: "automatic",
    minify: !serve,
    sourcemap: serve ? "inline" : false,
    define: { "process.env.NODE_ENV": JSON.stringify(serve ? "development" : "production") },
    legalComments: "none",
    logLevel: serve ? "info" : "warning"
};

await mkdir(`${here}dist`, { recursive: true });
await copyFile(`${here}index.html`, `${here}dist/index.html`);
if (serve) {
    const pkg = await esbuild.context(packageOptions);
    await pkg.watch();
    const ctx = await esbuild.context(options);
    await ctx.watch();
    const { hosts } = await ctx.serve({ servedir: `${here}dist`, port, host: "127.0.0.1" });
    console.log(`playground on http://${hosts[0] ?? "127.0.0.1"}:${port}/`);
} else {
    await esbuild.build(packageOptions);
    await esbuild.build(options);
}

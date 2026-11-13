// Builds the test pages into examples/playground/dist/pages/, next to the playground the browser
// tests serve:
//
// - host.html: pivotkit-react's own dist/index.js (and the dist/echarts.js and menus.js it loads), not bundled, with React, ReactDOM, dnd-kit,
//   pivotkit-core and ECharts as separate ES modules from an import map, as a host page that provides
//   React itself (PowerShell Universal) loads it. The page renders again every 200 ms with a new copy
//   of the rows and a controlled view.
// - shadow.html: the report inside a shadow root with its stylesheet linked there, as the web
//   component mounts it.
// - nav.html: the same host setup (React from the import map) next to a fixed navigation drawer and
//   an app bar with z-indexes above the report's, as PowerShell Universal draws its apps
//   (nav-shell.js; element-nav.html is the web component in that frame).
// - hydrate.html: the report rendered to HTML with react-dom/server and hydrated, with dismissed tips
//   in localStorage.
// - element-*.html: pages of the web component pivotkit-element (sources in element/), which loads
//   from dist/packages/pivotkit-element/dist/ as it ships (npm run build -w pivotkit-element first):
//   two elements, properties set before the definition, the package loaded twice, a strict CSP,
//   listener and observer counts, the <style> fallback, a page with its own React, the element next to
//   a fixed navigation (element-nav.html, nav-shell.js). The element example
//   (examples/element/) is copied to dist/examples/element/ next to it, at the same relative path as
//   in the repository.
// - xlsx.html: pivotkit-xlsx's dist/ reading a picked workbook under the element's strict CSP.
// - host.html?import: the host page with allowImport and pivotkit-xlsx from its dist/ (no worker: a
//   host like PowerShell Universal has none); element-import.html: the element loading data under the
//   strict CSP, with its own worker and pivotkit-xlsx's dist/ as a plugin.
//
// PIVOTKIT_REACT=19 takes React and ReactDOM from tests/react19 (npm ci --prefix tests/react19);
// the default is the React 18 of the workspace.
//
//   node tests/browser/pages/build.js
import * as esbuild from "esbuild";
import { copyFile, cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = fileURLToPath(new URL("../../../", import.meta.url));
const out = `${root}examples/playground/dist/pages/`;
const reactDir = process.env.PIVOTKIT_REACT === "19" ? `${root}tests/react19/` : root;
const req = createRequire(reactDir);

/** The React packages of the chosen version: their entry files. */
const real = { react: req.resolve("react"), "react-dom": req.resolve("react-dom"), "react-dom/client": req.resolve("react-dom/client") };

/**
 * React, ReactDOM and react-dom/client are CommonJS: an ES module in front of each names its exports,
 * so `import { useState } from "react"` works in the browser. Every ES import of them goes through it
 * (one React for everything); a require() inside React's own files goes to the real file.
 */
const reactShims = {
    name: "react-shims",
    setup(build) {
        build.onResolve({ filter: /^react(-dom(\/client)?)?$/ }, (args) =>
            args.kind === "require-call" ? { path: real[args.path] } : { path: args.path, namespace: "react-shim" }
        );
        build.onLoad({ filter: /.*/, namespace: "react-shim" }, (args) => {
            const names = Object.keys(req(real[args.path])).filter((n) => n !== "default" && /^[A-Za-z_$][\w$]*$/.test(n));
            return {
                contents: `import m from ${JSON.stringify(real[args.path])};\nexport default m;\nexport const { ${names.join(", ")} } = m;\n`,
                resolveDir: here
            };
        });
    }
};

/** Bare import -> file of the import map, shared by the vendor build and host.html. */
const VENDOR = {
    react: "react",
    "react-dom": "react-dom",
    "react-dom/client": "react-dom-client",
    "@dnd-kit/core": "dnd-kit-core",
    "@dnd-kit/sortable": "dnd-kit-sortable",
    "pivotkit-core": "pivotkit-core",
    "pivotkit-core/export": "pivotkit-core-export",
    "pivotkit-core/chart": "pivotkit-core-chart",
    "pivotkit-core/link": "pivotkit-core-link",
    "pivotkit-core/import": "pivotkit-core-import",
    "pivotkit-core/templates": "pivotkit-core-templates",
    "echarts/core": "echarts-core",
    "echarts/charts": "echarts-charts",
    "echarts/components": "echarts-components",
    "echarts/renderers": "echarts-renderers"
};

await mkdir(out, { recursive: true });
const common = { bundle: true, format: "esm", platform: "browser", target: ["es2022"], minify: true, legalComments: "none", logLevel: "warning", define: { "process.env.NODE_ENV": '"production"' } };

// every host dependency a separate file; what they share (React, dnd-kit's core) in shared chunks
await esbuild.build({
    ...common,
    absWorkingDir: root,
    entryPoints: Object.entries(VENDOR).map(([spec, name]) => ({ in: spec, out: name })),
    outdir: `${out}vendor`,
    splitting: true,
    chunkNames: "chunks/[name]-[hash]",
    plugins: [reactShims]
});
// the package as it ships: dist/index.js, the echarts.js and menus.js it loads next to it with the
// chunks they share (dist/chunks/), dist/styles.css, not rebuilt
await copyFile(`${root}packages/pivotkit-react/dist/index.js`, `${out}pivotkit-react.js`);
// (and every other entry of dist/: the German menu texts, the labels subpath), as a host serves dist/
for (const file of (await readdir(`${root}packages/pivotkit-react/dist/`)).filter((f) => f.endsWith(".js") && f !== "index.js")) {
    await copyFile(`${root}packages/pivotkit-react/dist/${file}`, `${out}${file}`);
}
await cp(`${root}packages/pivotkit-react/dist/chunks/`, `${out}chunks/`, { recursive: true });
await copyFile(`${root}packages/pivotkit-react/dist/styles.css`, `${out}pivotkit-react.css`);
// the host page's own code: every package left to the import map
await esbuild.build({ ...common, absWorkingDir: here, entryPoints: { host: "host.jsx", nav: "nav.jsx" }, outdir: out, jsx: "automatic", external: [...Object.keys(VENDOR), "pivotkit-react", "pivotkit-xlsx", "react/jsx-runtime"] });
// the shadow root page bundles its React like any app
await esbuild.build({ ...common, absWorkingDir: here, entryPoints: { shadow: "shadow.jsx", hydrate: "hydrate.jsx" }, outdir: out, jsx: "automatic", alias: { react: real.react.replace(/index\.js$/, ""), "react-dom": real["react-dom"].replace(/index\.js$/, "") } });

// pivotkit-xlsx as it ships for pages without a bundler (dist/), copied below
const importMap = { imports: { ...Object.fromEntries(Object.entries(VENDOR).map(([spec, name]) => [spec, `./vendor/${name}.js`])), "react/jsx-runtime": "./jsx-runtime.js", "pivotkit-react": "./pivotkit-react.js", "pivotkit-xlsx": "../packages/pivotkit-xlsx/dist/index.js" } };
// the automatic JSX runtime of the host page, on the host's React
await writeFile(`${out}jsx-runtime.js`, 'import React from "react";\nexport const Fragment = React.Fragment;\nexport const jsx = (type, props, key) => React.createElement(type, key === undefined ? props : { ...props, key });\nexport const jsxs = jsx;\n');
const page = (title, body) => `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>${title}</title>\n${body}\n</head>\n<body><div id="app"></div></body>\n</html>\n`;
await writeFile(`${out}host.html`, page("pivotkit host page", `<link rel="stylesheet" href="./pivotkit-react.css" />\n<script type="importmap">${JSON.stringify(importMap)}</script>\n<script type="module" src="./host.js"></script>`));
await writeFile(`${out}nav.html`, page("pivotkit next to a fixed navigation", `<link rel="stylesheet" href="./pivotkit-react.css" />\n<script type="importmap">${JSON.stringify(importMap)}</script>\n<script type="module" src="./nav.js"></script>`).replace('<div id="app"></div>', ""));
await writeFile(`${out}shadow.html`, page("pivotkit in a shadow root", '<script type="module" src="./shadow.js"></script>'));
await writeFile(`${out}hydrate.html`, page("pivotkit rendered on a server and hydrated", '<link rel="stylesheet" href="./pivotkit-react.css" />\n<script type="module" src="./hydrate.js"></script>'));

// the web component as it ships, the example next to it, and the element's test pages
const playground = `${root}examples/playground/dist/`;
await cp(`${root}packages/pivotkit-element/dist/`, `${playground}packages/pivotkit-element/dist/`, { recursive: true });
// a second copy at another URL, as a page that loads the package twice (element-twice.html) has it
await cp(`${root}packages/pivotkit-element/dist/`, `${out}element-copy/`, { recursive: true });
await mkdir(`${playground}examples/element/`, { recursive: true });
for (const file of ["index.html", "app.js", "example.css"]) {
    await copyFile(`${root}examples/element/${file}`, `${playground}examples/element/${file}`);
}
// pivotkit-xlsx as it ships (dist/: the descriptor and its chunks) and its page under a strict CSP
await cp(`${root}packages/pivotkit-xlsx/dist/`, `${playground}packages/pivotkit-xlsx/dist/`, { recursive: true });
for (const file of ["xlsx.html", "xlsx.js"]) {
    await copyFile(`${here}${file}`, `${out}${file}`);
}
const elementDir = `${here}element/`;
const sources = await readdir(elementDir);
// the React page leaves React to the import map; the others bundle their data
await esbuild.build({ ...common, absWorkingDir: elementDir, entryPoints: { "element-react": "react.jsx" }, outdir: out, jsx: "automatic", external: [...Object.keys(VENDOR), "react/jsx-runtime"] });
// classic scripts that run before any module: copied as they are
const CLASSIC = ["leaks.js", "no-constructable.js"];
const scripts = sources.filter((f) => f.endsWith(".js") && !CLASSIC.includes(f));
await esbuild.build({ ...common, absWorkingDir: elementDir, entryPoints: Object.fromEntries(scripts.map((f) => [`element-${f.replace(/\.js$/, "")}`, f])), outdir: out });
for (const file of CLASSIC) {
    await copyFile(`${elementDir}${file}`, `${out}element-${file}`);
}
for (const html of sources.filter((f) => f.endsWith(".html"))) {
    const text = (await readFile(`${elementDir}${html}`, "utf8")).replace("IMPORT_MAP", JSON.stringify({ imports: importMap.imports }));
    await writeFile(`${out}element-${html}`, text);
}

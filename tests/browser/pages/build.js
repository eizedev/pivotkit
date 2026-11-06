// Builds the test pages into examples/playground/dist/pages/, next to the playground the browser
// tests serve:
//
// - host.html: pivotkit-react's own dist/index.js, not bundled, with React, ReactDOM, dnd-kit,
//   pivotkit-core and ECharts as separate ES modules from an import map, as a host page that provides
//   React itself (PowerShell Universal) loads it. The page renders again every 200 ms with a new copy
//   of the rows and a controlled view.
// - shadow.html: the report inside a shadow root with its stylesheet linked there, as the web
//   component will mount it.
//
// PIVOTKIT_REACT=19 takes React and ReactDOM from tests/react19 (npm ci --prefix tests/react19);
// the default is the React 18 of the workspace.
//
//   node tests/browser/pages/build.js
import * as esbuild from "esbuild";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
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
// the package as it ships: dist/index.js and dist/styles.css, not rebuilt
await copyFile(`${root}packages/pivotkit-react/dist/index.js`, `${out}pivotkit-react.js`);
await copyFile(`${root}packages/pivotkit-react/dist/styles.css`, `${out}pivotkit-react.css`);
// the host page's own code: every package left to the import map
await esbuild.build({ ...common, absWorkingDir: here, entryPoints: { host: "host.jsx" }, outdir: out, jsx: "automatic", external: [...Object.keys(VENDOR), "pivotkit-react", "react/jsx-runtime"] });
// the shadow root page bundles its React like any app
await esbuild.build({ ...common, absWorkingDir: here, entryPoints: { shadow: "shadow.jsx" }, outdir: out, jsx: "automatic", alias: { react: real.react.replace(/index\.js$/, ""), "react-dom": real["react-dom"].replace(/index\.js$/, "") } });

const importMap = { imports: { ...Object.fromEntries(Object.entries(VENDOR).map(([spec, name]) => [spec, `./vendor/${name}.js`])), "react/jsx-runtime": "./jsx-runtime.js", "pivotkit-react": "./pivotkit-react.js" } };
// the automatic JSX runtime of the host page, on the host's React
await writeFile(`${out}jsx-runtime.js`, 'import React from "react";\nexport const Fragment = React.Fragment;\nexport const jsx = (type, props, key) => React.createElement(type, key === undefined ? props : { ...props, key });\nexport const jsxs = jsx;\n');
const page = (title, body) => `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>${title}</title>\n${body}\n</head>\n<body><div id="app"></div></body>\n</html>\n`;
await writeFile(`${out}host.html`, page("pivotkit host page", `<link rel="stylesheet" href="./pivotkit-react.css" />\n<script type="importmap">${JSON.stringify(importMap)}</script>\n<script type="module" src="./host.js"></script>`));
await writeFile(`${out}shadow.html`, page("pivotkit in a shadow root", '<script type="module" src="./shadow.js"></script>'));

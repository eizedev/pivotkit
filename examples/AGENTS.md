# examples

The root [AGENTS.md](../AGENTS.md) applies too.

## Playground (`playground/`)

```bash
npm run playground         # http://localhost:5173 with rebuilds
npm run build:playground   # dist/, the element, pivotkit-xlsx and the test pages
npm run docs:data          # fetch the real data sets again (network)
```

- Five real public data sets and three generated ones with a fixed seed.
- The real data are committed snapshots in `data/`. Each loads as its own chunk.
- `data/sources.js` holds the requests and the mapping to rows.
- `data/SOURCES.md` holds the licences and attribution.
- The page never calls the sources.
- Loading data is on. `?import=off` turns it off, as for a host without it.
- `validator.html` is the view file check the docs page `reference/view-file.md` embeds.

## Web component (`element/`)

- A plain HTML page with `<pivot-report>`, no build step.
- `npm run build:playground` copies it into the playground's `dist/examples/element/`.
- Serve it with `node examples/playground/serve.js`, then open `/examples/element/`.

## Angular (`angular/`)

```bash
npm run build -w pivotkit-element && npm run types   # first
npm ci --prefix examples/angular --ignore-scripts
npm run build --prefix examples/angular
npx playwright test -c examples/angular/playwright.config.js
```

- It has its own install and lock file. Angular's packages are pinned exactly.
- It takes `pivotkit-element` from `packages/` through `file:`.
- `allow-import` needs the element's `dist/import-worker.js`, copied as an asset in `angular.json`.
- CI builds it, fails on a build warning, and runs it in three browsers.
- `tests/ci.test.js` checks its pins and lock file.

## Print templates (`report-templates/`)

- Corporate is always light and sets every colour token. Minimal follows the system.
- People read and copy them. Keep them readable.
- `scripts/examples.js` copies them into the CLI's examples.
- `tests/browser/report-templates.spec.js` checks them in both schemes, on screen and in print.

## Reader plugin (`reader-plugin/`)

- A complete reader plugin to copy, for the docs page `reference/write-a-plugin.md`.
- `tests/reader-plugin.test.js` tests it.
- Its `package.json` takes pivotkit-core from npm. A release updates its range.

## Example files

- `node scripts/examples.js` writes the CLI's example files and `docs/assets/examples/`.
- Run it after a change of the view file format or a playground preset.

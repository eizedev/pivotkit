# AGENTS.md

pivotkit is a pivot report builder for the web (Excel's PivotTable is the reference) as three npm
packages in this repository with npm workspaces: the engine `pivotkit-core`, the React UI
`pivotkit-react` and the web component `pivotkit-element`; see [README.md](README.md). The workspaces
are listed in build order (core, react, element) in the root `package.json`: `npm run types` and the
builds depend on it.

## Layout

- `packages/pivotkit-core/` - the engine, built: plain JavaScript ES modules with JSDoc types, no UI,
  no framework. `src/` (one module per concern), `test/` (`node --test`, `test/types/` a TypeScript
  consumer), `bench/`. Public entry points: `src/index.js` and `src/export.js` (XLSX, CSV; the only
  importer of fflate); every other module is internal. The vocabulary of a view lives in tables:
  `AGGREGATORS` (aggregators.js), `DERIVED` (derive.js), `FILTERS` (filters.js), `SHOW_AS`
  (show-as.js); `CATALOG` (catalog.js) lists them for a UI.
- `packages/pivotkit-react/` - the React 18/19 UI on the core: `<PivotReport>`. JSX in `src/` with
  JSDoc types, built by esbuild (`build.js`) into `dist/` (JSX as `React.createElement`, every
  dependency left as an import) and `dist/styles.css`. React, ReactDOM and ECharts are peer
  dependencies the host provides (PowerShell Universal provides React 18.3.1 at runtime), never
  bundled; pivotkit-core and @dnd-kit stay bare imports the host's bundler (or import map) resolves.
  One module per concern: `PivotReport.jsx` wires the parts and defines `commit()`, which it passes to
  the zones, the chip menus, the filter and the toolbar; `use-view-history.js` (with the pure
  `view-history.js`) owns the view and its undo history, controlled or not; every view change is a
  pure function in `view-ops.js`; `chart-types.js` is the one table of chart types; `dnd.jsx` is the
  only importer of @dnd-kit, its pure logic in `dnd-moves.js`; `echarts.js` the only importer of
  echarts (by name, so a bundler keeps only the four chart types; `chart.jsx` loads it on the first
  chart and the build keeps it a file of its own, `dist/echarts.js`); `dom.js` the shadow-root-safe
  focus and Escape helpers; `labels.js` the texts (en, de); `styles.css` every `--pk-*` token. Logic that needs no DOM lives in `.js` modules; `test/` runs
  them with `node --test` (plus a server render of the built package and the contrast of the tokens);
  `test/types/` is a TypeScript consumer.
- `packages/pivotkit-element/` - the web component `<pivot-report>`: pivotkit-react in an open shadow
  root on a React 18.3.1 of its own, for hosts without React (Angular, PHP, plain HTML). `build.js`
  builds pivotkit-react's `dist/` first and bundles it with React, ReactDOM, pivotkit-core and
  @dnd-kit into `dist/` (ES modules, minified, production React); ECharts (only the parts
  pivotkit-react's `echarts.js` imports) and the export are chunks loaded on first use; it writes
  `dist/THIRD_PARTY_LICENSES.txt`. Every bundled package is a devDependency, the package has no
  runtime dependency. `src/element.js` is the element (properties, lifecycle, one React root per
  element), `src/props.js` the one table of attributes and how each maps to a property,
  `src/events.js` the events (`pivot-*`, `respondWith()`), `src/host-css.js` moves pivotkit-react's
  token rules to `:host`, `src/styles.js` adopts the stylesheet, `src/index.js` defines the tag.
  `src/global.d.ts` and `src/jsx.d.ts` (hand-written: JSDoc cannot augment globals or React's JSX)
  are copied into `types/` by `types.js`; only the public declarations ship (`files`). `npm run size`
  fails above `SIZE_BUDGET_KIB` in `build.js`.
  `test/` runs the pure modules, the build and a Node import with `node --test`.
- `examples/playground/` - the playground: generated data with a fixed seed, built by esbuild into
  static files (`dist/`), served by `serve.js`.
- `examples/element/` - a plain HTML page with `<pivot-report>`, no build step; `npm run
  build:playground` copies it to `examples/playground/dist/examples/element/`.
- `tests/browser/` - Playwright tests in Chromium, Firefox and WebKit of the playground and of
  `pages/` (a host page that loads `dist/index.js` with React from an import map and renders again
  all the time; a shadow root; the web component's pages in `pages/element/`: two elements, upgrade,
  loaded twice, strict CSP, listener counts, a page with its own React); CI runs them on React 18 and
  React 19 (`tests/react19/`, own lock file). `tests/ci.test.js` checks the pinning (Playwright image = locked `@playwright/test`, exact
  versions, caret ranges for this repository's own packages).
- `scripts/check-pack.js` - checks what `npm pack` would publish.

## Commands

```bash
npm ci                              # install all workspaces from the lock file
npm run lint                        # ESLint recommended rules and React's hook rules (as CI)
npm run types                       # tsc with checkJs, generated .d.ts, TypeScript consumer (as CI)
npm test                            # node --test in every workspace (as CI)
npm run coverage                    # the tests with a coverage report (as CI); pivotkit-react: its .js modules only
npm run pack:check                  # npm pack --dry-run of the three packages, checked (as CI)
npm run size -w pivotkit-element    # build the element and print what a page loads, gzip
npm run bench -w pivotkit-core      # engine timings for 2k, 4k and 100k rows
npm run playground                  # playground with rebuilds on http://localhost:5173
npm run test:browser                # build the playground, the element and the test pages, Playwright in three browsers (as CI)
PLAYGROUND_PORT=4195 npm run test:browser   # on another port, when 4173 is taken
PIVOTKIT_REACT=19 npm run test:browser   # the same on React 19 (npm ci --prefix tests/react19 first)
```

## Rules that matter here

- A view (report template) is user input: it holds names only. Field names, aggregators, formats and
  colours are resolved against fixed lists or the data's schema; never evaluate a string from a view
  as code, never use it as an object key without an own-property check. A view cannot run code, but
  it can ask for a lot of work: anything dense (rows x columns) counts its size against `LIMITS`
  before allocating and throws `PivotkitError` (`LIMIT_EXCEEDED`).
- Error model: a bad view never throws (normalize reports issues); a programmer error or a limit
  throws `PivotkitError` with a code.
- API convention: required inputs first, every optional setting in one trailing options object.
  Locale: view, then `options.locale`, then `"en-US"`; never the runtime's locale. Dates are wall
  clock; instants are read in `encode`'s `timeZone`, default `"UTC"`, never the machine's zone.
- Caches are bounded (`util.createCache`): derived columns and sort orders per data set
  (`LIMITS.cacheEntries`), Intl formatters in `intl.js`.
- Column names are matched case-insensitively; the data's own spelling is kept for display.
- `pivotkit-core` has no runtime dependency except `fflate` (zip for XLSX). The XLSX XML is written by
  hand; no SheetJS, no ExcelJS. The core builds plain ECharts option objects and does not import
  ECharts.
- Every third-party package is pinned to an exact version with the lock file; CI installs with
  `npm ci --ignore-scripts`. Exception: a package of this repository that another one depends on
  takes a caret range on its current version (`"pivotkit-core": "^0.1.0"` in pivotkit-react); the lock
  file still pins it in development. In 0.x a caret range spans patch versions only (`^0.1.0` is
  0.1.x), so a host that also uses pivotkit-core directly must use a version inside the range;
  npm shares one copy only when the ranges overlap. Chart wrapper packages have been hijacked on npm
  before: prefer a small own wrapper over a wrapper package.
- Exports must be safe to open: CSV text that a spreadsheet would run as a formula gets a leading `'`
  (the rule is in `src/csv.js`: tab or CR first, or `=` `@` after leading whitespace and control
  characters, or `+` `-` unless the text is a plain number or a number range); XLSX writes text as
  inline strings, never as formulas.
- Designed for up to about 100,000 rows: typed arrays, no per-row objects in hot loops. Run the
  benchmark before and after engine changes and compare with the baseline in the package README.
- The engine sources use only globals browsers and Node share (ESLint enforces it for `src/`).
- UI: text at least 14 px (`--pk-font-size`, `--pk-small`), controls at least 24 x 24 px
  (`--pk-target`), buttons with visible text (an icon alone only where the text is next to it), every
  action reachable by keyboard and by a menu (drag and drop is never the only way), focus kept or
  moved on purpose after every change, code that reads focus or clicks shadow-root safe (`dom.js`:
  the node's root, `composedPath()`), colours only from `--pk-*` tokens
  (both themes must pass `test/contrast.test.js`), animations through `--pk-duration` so
  `prefers-reduced-motion` turns them off. Layout follows the report's width (`data-pk-size`), not the
  window's. Check changes with screenshots in both themes at wide and narrow width.
- Browser tests fail on any console error or warning (`tests/browser/fixtures.js`).
- pivotkit-element: the shadow root is the boundary. No style of the page reaches in and none of
  the report's out, except the `--pk-*` tokens set on the element (declared on `:host` by
  `host-css.js`; never on `.pk-root` inside the element). Events are `pivot-*` CustomEvents that
  bubble and are composed. An attribute is added in `src/props.js` only; data and other objects stay
  properties; JSON attributes only for views. The element sets no global and touches no DOM when
  imported without `customElements`. The first load stays free of ECharts and the export
  (`test/build.test.js`).
- A host may render the report on every change of its own state: props compared by value
  (`labels`, `limits`), data by `dataKey`, the history kept across renders (`use-view-history.js`).
- Docs describe the current state; history belongs in each package's `CHANGELOG.md`, commits and pull
  requests. Conventional Commits with the package as scope (`feat(core): ...`).

## Do not

- Commit `node_modules/` or build output.
- Add a runtime dependency to `pivotkit-core`, or bundle React or ECharts into `pivotkit-react`
  (pivotkit-element is the package that bundles them).
- Add a UI framework or an animation library to `pivotkit-react`; it has its own CSS.
- Put secrets, host names or real data into code, examples or tests.

## Exceptions to the repository standards

Confirmed by the owner on 2026-11-06, each temporary:

- Brand assets (icon, README header, social preview): not generated yet in `eizedev/brand`; added when
  they are.
- Docs website (pivotkit.eize.dev): not built yet; follows with the React package. GitHub Pages needs
  the repository to be public on GitHub Free.
- Secret scanning, push protection, private vulnerability reporting and rulesets: not available while
  the repository is private on GitHub Free; switched on when it becomes public.

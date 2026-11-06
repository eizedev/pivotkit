# AGENTS.md

pivotkit is a pivot report builder for the web (Excel's PivotTable is the reference), planned as three
npm packages in this repository with npm workspaces: the engine `pivotkit-core` and the React UI
`pivotkit-react` exist, the web component follows; see [README.md](README.md).

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
  bundled. One module per concern: `PivotReport.jsx` owns the view and its history and is the only
  caller of `commit()`; every view change is a pure function in `view-ops.js`; `dnd.jsx` is the only
  importer of @dnd-kit; `chart.jsx` the only importer of echarts (lazy); `labels.js` the texts (en,
  de); `styles.css` every `--pk-*` token. `test/` runs with `node --test` (no DOM: pure logic, a server
  render of the built package, contrast of the tokens); `test/types/` is a TypeScript consumer.
- `examples/playground/` - the playground: generated data with a fixed seed, built by esbuild into
  static files (`dist/`), served by `serve.js`.
- `tests/browser/` - Playwright tests of the playground in Chromium, Firefox and WebKit;
  `tests/ci.test.js` checks the pinning (Playwright image = locked `@playwright/test`, exact versions).
- `packages/pivotkit-element/` - planned, not built yet: the web component `<pivot-report>`, bundling
  its own React for hosts without one (Angular, PHP, plain HTML).
- `scripts/check-pack.js` - checks what `npm pack` would publish.

## Commands

```bash
npm ci                              # install all workspaces from the lock file
npm run lint                        # ESLint, recommended rules only (as CI)
npm run types                       # tsc with checkJs, generated .d.ts, TypeScript consumer (as CI)
npm test                            # node --test in every workspace (as CI)
npm run coverage                    # the tests with a coverage report (as CI)
npm run pack:check                  # npm pack --dry-run of pivotkit-core and pivotkit-react, checked (as CI)
npm run bench -w pivotkit-core      # engine timings for 2k, 4k and 100k rows
npm run playground                  # playground with rebuilds on http://localhost:5173
npm run test:browser                # build the playground, Playwright in three browsers (as CI)
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
- Every package is pinned to an exact version with the lock file; CI installs with
  `npm ci --ignore-scripts`. Chart wrapper packages have been hijacked on npm before: prefer a small
  own wrapper over a wrapper package.
- Exports must be safe to open: CSV text that a spreadsheet would run as a formula gets a leading `'`
  (the rule is in `src/csv.js`: tab or CR first, or `=` `@` after leading whitespace and control
  characters, or `+` `-` unless the text is a plain number or a number range); XLSX writes text as
  inline strings, never as formulas.
- Designed for up to about 100,000 rows: typed arrays, no per-row objects in hot loops. Run the
  benchmark before and after engine changes and compare with the baseline in the package README.
- The engine sources use only globals browsers and Node share (ESLint enforces it for `src/`).
- UI: text at least 14 px (`--pk-font-size`), every action reachable by keyboard and by a menu (drag
  and drop is never the only way), every icon button with a label, colours only from `--pk-*` tokens
  (both themes must pass `test/contrast.test.js`), animations through `--pk-duration` so
  `prefers-reduced-motion` turns them off. Layout follows the report's width (`data-pk-size`), not the
  window's. Check changes with screenshots in both themes at wide and narrow width.
- Browser tests fail on any console error or warning (`tests/browser/fixtures.js`).
- Docs describe the current state; history belongs in each package's `CHANGELOG.md`, commits and pull
  requests. Conventional Commits with the package as scope (`feat(core): ...`).

## Do not

- Commit `node_modules/` or build output.
- Add a runtime dependency to `pivotkit-core`, or bundle React or ECharts into `pivotkit-react`.
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

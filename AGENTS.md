# AGENTS.md

pivotkit is a pivot report builder for the web (Excel's PivotTable is the reference) as three npm
packages in this repository with npm workspaces: the engine `pivotkit-core`, the React UI
`pivotkit-react` and the web component `pivotkit-element`; see [README.md](README.md). The workspaces
are listed in build order (core, react, element) in the root `package.json`: `npm run types` and the
builds depend on it.

## Layout

- `packages/pivotkit-core/` - the engine, built: plain JavaScript ES modules with JSDoc types, no UI,
  no framework. `src/` (one module per concern), `test/` (`node --test`, `test/types/` a TypeScript
  consumer), `bench/`. Public entry points: `src/index.js`, `src/export.js` (XLSX, CSV, TSV and JSON of a grid; `rows.js`: CSV and XLSX of source rows),
  `src/link.js` (a view as a link text: `encodeViewLink`, `decodeViewLink`, with the capped inflate of
  `src/inflate.js`), the two that import fflate, and `src/templates.js` (`parseTemplates`, a list of
  named views; `templatesFromSchema`, pivotkit's extension `x-pivotkit-views` of an OpenAPI document);
  every other module is internal. The vocabulary of a view lives in tables:
  `AGGREGATORS` (aggregators.js), `DERIVED` (derive.js), `FILTERS` (filters.js), `SHOW_AS`
  (show-as.js); `CATALOG` (catalog.js) lists them for a UI. `schema.js` reads field defaults from a JSON Schema or OpenAPI document (`fieldDefaultsFromSchema`). `view-file.js` is the view file, the one format a view is shared in (file, JSON, link): `toViewFile`, `fromViewFile`, `viewFileText`, `viewFileName`, `viewFileFields`; its JSON Schema is `schema/view-file-1.json` of the package (exported, shipped; `scripts/docs-demo.js` copies it to `docs/schema/` for the site; `tests/view-file-schema.test.js` keeps schema and writer in step).
- `packages/pivotkit-react/` - the React 18/19 UI on the core: `<PivotReport>`. JSX in `src/` with
  JSDoc types, built by esbuild (`build.js`) into `dist/` (JSX as `React.createElement`, every
  dependency left as an import) and `dist/styles.css`. React, ReactDOM and ECharts are peer
  dependencies the host provides (PowerShell Universal provides React 18.3.1 at runtime), never
  bundled; pivotkit-core and @dnd-kit stay bare imports the host's bundler (or import map) resolves.
  One module per concern: `PivotReport.jsx` wires the parts and defines `commit()`, which it passes to
  the zones, the chip menus, the filter and the toolbar; `use-view-history.js` (with the pure
  `view-history.js`) owns the view and its undo history, controlled or not (each step with the saved view it shows, its tag, so Undo and Redo move the view's name with it); every view change is a
  pure function in `view-ops.js`; `chart-types.js` is the one table of chart types; `tips.js` the one table of tips (id, condition, text, action; `tip-list.jsx` shows them); `field-info.js` cleans a host's field labels and descriptions (`info.jsx` the "i" and its popover); `chart-decorate.js` the report's marks on the chart's option (theme colours, axis labels, tooltip; loaded with ECharts through `echarts.js`), `chart-tooltip.js` builds the chart's tooltip as DOM nodes (no inline `style` attributes, so a strict CSP allows it); `chart-options.js` checks and merges the host's `chartOptions` (plain JSON only, and no ECharts option that is markup or an address; loaded with ECharts through `echarts.js`); `share.js` the link in the URL fragment, the tab's stored view and views loaded from a view file or JSON (all through normalize, what was dropped in plain words, what to ask before a view for other data is applied), and loads `pivotkit-core/link` on first use; `section.jsx` the menus' sections that fold (their state kept with the tips, `SECTIONS` in `tips.js`) and the one way to explain a setting, the "i" (`SettingInfo`, texts in `labels.settingInfo`); `use-big-result.js` Enlarge, Full screen and the report's least height; `version.js` the package's version (esbuild define in `build.js`) for the view files' `generator`; `clear-input.jsx` the one text field with an "×" every menu uses; `templates.js` the entries of the Views menu (the host's `templates` with their scope, then the browser store's), `view-store.js` the browser store (`templateStore="browser"`: the user's views in localStorage as view files, capped; loaded with the menus), `view-save.js` where Save (the loaded view under its name, a view of the browser store by its name and the data it names, or why not) and Save as (asking before a name is replaced) write (loaded with the menus), `storage.js` the one way to read, write and subscribe to localStorage (the tips and the browser store); `numbers.js` reads the numbers typed into a menu in the report's locale (every number field of a menu is a text field through it, never `type="number"`); `skeleton.jsx` the report while it waits (`loading`, a large first encode, a link being read); `dnd.jsx` is the
  only importer of @dnd-kit, its pure logic in `dnd-moves.js`; `echarts.js` the only importer of
  echarts (by name, so a bundler keeps only the four chart types; `chart.jsx` loads it on the first
  chart and the build keeps it a file of its own, `dist/echarts.js`); `dom.js` the shadow-root-safe
  focus and Escape helpers; `labels.js` the texts of the first load (en, de), `menu-labels.js` those only the menus show (loaded with them; a host's labels for them are kept aside by `resolveLabels` and merged by `menuLabels`), `all-labels.js` both as `LABELS`, the subpath export `pivotkit-react/labels`; `overflow.js` which toolbar buttons go into "More" (a fixed priority and the room each takes, not the texts); `rove.js` the arrow keys of the field list (one Tab stop); `use-export.js` the Export menu's entry point, `export-run.js` its work and `drill-export.js` the drill-down panel's exports (both load with the menus and start loading pivotkit-core/export when a menu that copies opens, so a copy happens in the click; every file and copy passes `onExport` first); `place.js` where a popover goes (next to its anchor; with `fill`, the filter and the chip menus, against the window's edge when it fits on neither side); `chart-types.js` also `chartPlan`, what an automatic chart (`chart.type: "auto"`) draws; `styles.css` every `--pk-*` token. Logic that needs no DOM lives in `.js` modules; `test/` runs
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
- `examples/playground/` - the playground: five real public data sets and three generated ones (fixed
  seed, any size, for tests and benchmarks), built by esbuild into static files (`dist/`), served by
  `serve.js`. The real data are committed snapshots in `data/` (`weather`, `countries`,
  `earthquakes`, `nobel`, `endoflife`), each loaded as its own chunk; `data/sources.js` holds the requests and the
  mapping from response to rows (used by `scripts/docs-data.js` and shown on the docs page
  `learn.md`), `data/SOURCES.md` the licences and attribution. The page never calls the sources.
- `examples/playground/validator.html` (`src/validator.js`) - the view file check the docs page
  `reference/view-file.md` embeds: pivotkit-core in the browser, nothing uploaded.
- `examples/element/` - a plain HTML page with `<pivot-report>`, no build step; `npm run
  build:playground` copies it to `examples/playground/dist/examples/element/`.
- `tests/browser/` - Playwright tests in Chromium, Firefox and WebKit of the playground and of
  `pages/` (a host page that loads `dist/index.js` with React from an import map and renders again
  all the time; a shadow root; the web component's pages in `pages/element/`: two elements, upgrade,
  loaded twice, strict CSP, listener counts, a page with its own React); CI runs them on React 18 and
  React 19 (`tests/react19/`, own lock file), one job per engine and React version. `tests/ci.test.js` checks the pinning (Playwright image = locked `@playwright/test`, exact
  versions, caret ranges for this repository's own packages).
- `scripts/check-pack.js` - checks what `npm pack` would publish.
- `docs/` - the documentation site (pivotkit.eize.dev): Zensical (`zensical.toml`) with the shared design
  of eizedev/brand (`docs-site/`), built and published by `.github/workflows/docs.yml`. Pages in
  Markdown, `docs/assets/icon.svg` from eizedev/brand, `docs/assets/screenshots/` taken by
  `scripts/docs-screenshots.js` from the playground. `docs/playground/` (the live demo, copied by
  `scripts/docs-demo.js`) and `docs/assets/site.css` (the design) are build output, not committed. The theme's
  repository link in the header asks api.github.com for the repository's stars, forks and latest
  release (cached by the theme in the reader's browser), as on the other eizedev sites. The
  package READMEs ship to npm: links from them to the site are absolute (`https://pivotkit.eize.dev/...`).
- `assets/` - icon, README header and social preview, generated in eizedev/brand (`pivotkit/`); changed
  there, never here.

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
npm run docs:data                   # fetch the real data sets once more into examples/playground/data/ (network)
npm run docs:demo                   # build the playground and copy it into docs/playground/ (the live demo)
npm run docs:screenshots            # build the playground and take docs/assets/screenshots/ again
curl -fsSo docs/assets/site.css https://raw.githubusercontent.com/eizedev/brand/main/docs-site/site.css
uvx zensical@<version from eizedev/brand docs-site/requirements.txt> serve   # the site on http://localhost:8000 (build --strict as CI)
```

## Rules that matter here

- A view (report template) is user input: it holds names only. Field names, aggregators, formats and
  colours are resolved against fixed lists or the data's schema; never evaluate a string from a view
  as code, never use it as an object key without an own-property check. A view cannot run code, but
  it can ask for a lot of work: whatever grows with the view counts against `LIMITS` before it is
  allocated, or while it grows, and throws `PivotkitError` (`LIMIT_EXCEEDED`): `encode` the rows
  (`rows`), `computePivot` its cell updates before it starts (`work`: rows x (row fields + 1) x
  (column fields + 1) x measures, an aggregator with `keepsValues` counted `KEEPS_VALUES_WEIGHT` times),
  the nodes of both key trees (`groups`) and the aggregated cells (`pivotCells`), `toGrid` and
  `toSeries` the dense rows x columns (`cells`). A new structure that
  grows with the data or the view gets a limit too; the core README ("Limits") says what each one
  counts and why its default is what it is.
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
  characters, or `+` `-` unless the text is a number as a locale writes it or a number range; the same guard for the clipboard copies); XLSX writes text as
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
- A host's field labels and descriptions (`fieldDefaults`) are optional extras: a field without them
  looks and works exactly as without `fieldDefaults` (no "i", no extra text, its own name); labels are
  display only, views keep field names. A schema is data: local `$ref`s only, nothing fetched, sizes
  capped (`SCHEMA_CAPS` in `schema.js`).
- Tips are rows of `TIPS` (`tips.js`): a pure condition, a text in every language, an optional
  action; at most `TIP_LIMIT` (one) show, the next queued by priority, in the flow above the result, never over it. A row that says the
  result is cut or empty is a `kind: "notice"`: always shown, not dismissible, outside the limit and
  the tips settings. Browser storage is read after the first render (`useSyncExternalStore` with a
  server snapshot), so server rendering and hydration match.
- Browser tests fail on any console error or warning (`tests/browser/fixtures.js`).
- pivotkit-element: the shadow root is the boundary. No style of the page reaches in and none of
  the report's out, except the `--pk-*` tokens set on the element (declared on `:host` by
  `host-css.js`; never on `.pk-root` inside the element). Events are `pivot-*` CustomEvents that
  bubble and are composed. An attribute is added in `src/props.js` only; data and other objects stay
  properties; JSON attributes only for views. The element sets no global and touches no DOM when
  imported without `customElements`. The first load stays free of ECharts, the export and the link
  module (`test/build.test.js`).
- A host may render the report on every change of its own state: props compared by value
  (`labels`, `limits`, the orders of `fieldDefaults`), data by `dataKey`, the history kept across
  renders (`use-view-history.js`).
- Docs describe the current state; history belongs in each package's `CHANGELOG.md`, commits and pull
  requests. A change that people see (a prop, an attribute, a view key, a menu) is also
  described on the documentation site (`docs/`); a change of the UI takes the screenshots again
  (`npm run docs:screenshots`). Conventional Commits with the package as scope (`feat(core): ...`).
- Every feature, also a small behaviour (what an "×" does, when a menu entry is disabled and why, what
  a status message says), is documented on the site, on its detail page. The site has two audiences:
  `docs/use/` is for the people who build reports (one page per task: what you do in two or three
  lines, then steps or a table, then the details, folded in `???` blocks where they are long; plain
  words, a prop name only in a "For developers" box), `docs/embed/`, `docs/getting-started/`,
  `docs/concepts/` and `docs/reference/` are for developers (a props table keeps one short line per
  prop; the full text goes into its section under "Props in detail"). `docs/features.md` is the
  feature list: one row per area that links to the pages, never a second copy of the behaviour; the
  start page `docs/index.md` keeps the short version for both audiences.
- Screenshots come in pairs, `<name>-light.png` and `<name>-dark.png` (`scripts/docs-screenshots.js`
  takes both), shown with `#only-light` and `#only-dark`. A page that moves keeps its address: a
  redirect in `zensical.toml` (`[project.plugins.redirects.redirect_maps]`, one entry per old section
  anchor too).
- A view that comes from outside the host's code (a link, pasted or loaded JSON, the tab's storage) is
  user input like any other: it passes `normalize()` against the data, its size is capped before it
  is decoded or parsed, and what was dropped is said in plain words. The host's `chartOptions` is
  checked as JSON (`chart-options.js`): nothing in it is run.

## Do not

- Commit `node_modules/` or build output.
- Add a runtime dependency to `pivotkit-core`, or bundle React or ECharts into `pivotkit-react`
  (pivotkit-element is the package that bundles them).
- Add a UI framework or an animation library to `pivotkit-react`; it has its own CSS.
- Put secrets, host names or real data into code, examples or tests; the one exception is the public
  data of `examples/playground/data/`, with its licence and attribution in `SOURCES.md`.

## Exceptions to the repository standards

Confirmed by the owner on 2026-11-06, each temporary:

- Docs website (pivotkit.eize.dev): built on every pull request, published only once the repository is
  public (GitHub Pages needs that on GitHub Free) and the repository variable `PAGES_ENABLED` is
  `true`.
- Secret scanning, push protection, private vulnerability reporting and rulesets: not available while
  the repository is private on GitHub Free; switched on when it becomes public.

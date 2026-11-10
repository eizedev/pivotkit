# AGENTS.md

pivotkit is a pivot report builder for the web (Excel's PivotTable is the reference) as npm
packages in this repository with npm workspaces: the engine `pivotkit-core`, the React UI
`pivotkit-react`, the web component `pivotkit-element` and the reader plugin `pivotkit-xlsx`; see
[README.md](README.md). The workspaces are listed in build order (core, react, element, xlsx) in the
root `package.json`: `npm run types` and the builds depend on it.

## Layout

- `packages/pivotkit-core/` - the engine, built: plain JavaScript ES modules with JSDoc types, no UI,
  no framework. `src/` (one module per concern), `test/` (`node --test`, `test/types/` a TypeScript
  consumer), `bench/`. Public entry points: `src/index.js`, `src/export.js` (XLSX, CSV, TSV and JSON of a grid; `rows.js`: CSV and XLSX of source rows),
  `src/link.js` (a view as a link text: `encodeViewLink`, `decodeViewLink`, with the capped inflate of
  `src/inflate.js`), the two that import fflate, and `src/templates.js` (`parseTemplates`, a list of
  named views; `templatesFromSchema`, pivotkit's extension `x-pivotkit-views` of an OpenAPI document),
  and `src/import.js` (`pivotkit-core/import`: `readFile`, `retype`, the reader plugin contract v1 with
  `validatePlugin`, `readerFor`, `loadReader`, the built-in `csvReader` and `jsonReader` whose code it
  loads on demand: `import-csv.js`, `import-json.js`, with `import-text.js` for encodings; the shared
  table every reader builds, `createTable` in `import-table.js`: header, names, cleaning, type
  inference, limits, notes `IMPORT_NOTE_CODES`); the main entry never reaches the import modules
  (`test/api.test.js`). `encode` takes rows or columnar data (`{ columns, types, data }`, one array per
  column); `test/import-fixtures/` holds real public exports with their sources and licences in
  `SOURCES.md`, kept byte for byte (`.gitattributes`);
  every other module is internal. The vocabulary of a view lives in tables:
  `AGGREGATORS` (aggregators.js), `DERIVED` (derive.js), `FILTERS` (filters.js), `SHOW_AS`
  (show-as.js); `CATALOG` (catalog.js) lists them for a UI. Every issue `normalize()` (view.js, filters.js) and `computePivot()` report has a `code` of `VIEW_ISSUE_CODES` (view.js) and the `params` a text needs; a new kind of issue is a new code there, its case in `test/issue-cases.js` and its texts in pivotkit-react's `unused-texts*.js`. `schema.js` reads field defaults from a JSON Schema or OpenAPI document (`fieldDefaultsFromSchema`). `view-file.js` is the view file, the one format a view is shared in (file, JSON, link): `toViewFile`, `fromViewFile`, `viewFileText`, `viewFileName`, `viewFileFields`; its JSON Schema is `schema/view-file-1.json` of the package (exported, shipped; `scripts/docs-demo.js` copies it to `docs/schema/` for the site; `tests/view-file-schema.test.js` keeps schema and writer in step).
- `packages/pivotkit-react/` - the React 18/19 UI on the core: `<PivotReport>`. JSX in `src/` with
  JSDoc types, built by esbuild (`build.js`) into `dist/` (JSX as `React.createElement`, every
  dependency left as an import) and `dist/styles.css`. React, ReactDOM and ECharts are peer
  dependencies the host provides (PowerShell Universal provides React 18.3.1 at runtime), never
  bundled; pivotkit-core and @dnd-kit stay bare imports the host's bundler (or import map) resolves.
  One module per concern: `PivotReport.jsx` wires the parts and defines `commit()`, which it passes to
  the zones, the chip menus, the filter and the toolbar; `use-view-history.js` (with the pure
  `view-history.js`) owns the view and its undo history, controlled or not (each step with the saved view it shows, its tag, so Undo and Redo move the view's name with it); every view change is a
  pure function in `view-ops.js` (those only the menus make, and the filter's summary, in `menu-ops.js`, loaded with the menus); `chart-types.js` is the one table of chart types; `tips.js` the one table of tips (id, condition, text, action; `tip-list.jsx` shows them); `unused.jsx` the warning above the result for a view's unused parts (a loaded view's or the host's; open the first time for a view, foldable; first load), `unused-keep.js` which of its lines still apply to the view shown (a line goes once its part is changed by hand), `unused-texts.js` each issue code in plain words with what it is about (English; imports nothing, it gets the names of fields and values from `unused.jsx`), `unused-texts-<lang>.js` another language's, both loaded on demand by `unused-load.js` (`UNUSED_TEXTS_OF`, the host's `labels.unused` merged there) only when a view has such parts; `field-info.js` cleans a host's field labels and descriptions (`info.jsx` the "i" and its popover) and holds the one rule for identifier fields (`fieldDefaultsFor`: a number field named ID, Nr, No, Number, Key or # is counted and shown as it is unless the host says otherwise); `chart-decorate.js` the report's marks on the chart's option (theme colours, axis labels, tooltip; loaded with ECharts through `echarts.js`), `chart-layout.js` how the chart lays out its labels for its size (with chart-decorate.js), `chart-tooltip.js` builds the chart's tooltip as DOM nodes (no inline `style` attributes, so a strict CSP allows it); `chart-options.js` checks and merges the host's `chartOptions` (plain JSON only, and no ECharts option that is markup or an address; loaded with ECharts through `echarts.js`); `share.js` the link in the URL fragment, the tab's stored view and views loaded from a view file or JSON (all through normalize, what to ask before a view for other data is applied), and loads `pivotkit-core/link` on first use; `share-actions.js` what the Views menu's sharing does (copy a link or the JSON, download, load; loaded with the menus); `drill.js` the rows behind a value (first load: `onCellClick` gets them in the click), `drill-table.js` the drill-down panel's table and title (loaded with the menus); `levels.jsx` the menus in levels (the chip menus, Options and Views: an ARIA menu as the first level, with what each topic holds, a topic's level in its place with Back, the search over all levels, every choice at once; `useAppliedText` and `useLater` for what is typed), their topics as data in `menu-topics.js` (one table per menu drives the first level, the levels and the search; a chip menu's choice is a pure view change, tested with `node --test`), both loaded with the menus; `filter-level.jsx` the Filter level of a field's menu (a date's quick choices, the values, the rules; the chip menus on Rows, Columns and in Filters) and `menu-fields.jsx` the form fields the levels share (a number typed, the measure a filter goes by), loaded with the menus; `section.jsx` a titled group of a menu's entries (the chart type, Export; no menu folds) and the one way to explain a setting, the "i" (`SettingInfo`, texts in `labels.settingInfo`), loaded with the menus; `help.js` their context (`HelpContext`, first load); `use-big-result.js` Enlarge, Full screen and the report's least height; `version.js` the package's version (esbuild define in `build.js`) for the view files' `generator`; `clear-input.jsx` the one text field with an "×" every menu uses; `templates.js` the entries of the Views menu (the host's `templates` with their scope, then the browser store's), `view-store.js` the browser store (`templateStore="browser"`: the user's views in localStorage as view files, capped; loaded with the menus), `view-save.js` where Save (the loaded view under its name, a view of the browser store by its name and the data it names, or why not) and Save as (asking before a name is replaced) write (loaded with the menus), `storage.js` the one way to read, write and subscribe to localStorage (the tips and the browser store); `numbers.js` reads the numbers typed into a menu in the report's locale (every number field of a menu is a text field through it, never `type="number"`); `skeleton.jsx` the report while it waits (`loading`, a large first encode, a link being read); `dnd.jsx` is the
  only importer of @dnd-kit, its pure logic in `dnd-moves.js`; `echarts.js` the only importer of
  echarts (by name, so a bundler keeps only the four chart types; `chart.jsx` loads it on the first
  chart and the build keeps it a file of its own, `dist/echarts.js`); `dom.js` the shadow-root-safe
  focus, Tab and Escape helpers and `useFormName` (every form field's name, unique per report instance); `labels.js` the texts of the first load (en, de), `menu-labels.js` the English ones only the menus show (loaded with them; a host's labels for them are kept aside by `resolveLabels` and merged by `menuLabels`), `menu-labels-de.js` the German ones, an entry and chunk of its own (`dist/menu-texts-de.js`) that `lazy-menus.jsx` loads with the menus for a German report only (the loaders per language in `menu-texts.js`; English stands in when the chunk fails), `all-labels.js` all of them as `LABELS`, the subpath export `pivotkit-react/labels`. A new language takes: its first-load texts in `labels.js`, added to `LABELS` there (the locale's language picks it); its menu texts in `src/menu-labels-<lang>.js`; its loader in `MENU_TEXTS_OF` (`menu-texts.js`); the entry `"menu-texts-<lang>"` in pivotkit-react's `build.js`; the texts of a view's unused parts in `src/unused-texts-<lang>.js` with its loader in `UNUSED_TEXTS_OF` (`unused-load.js`); all of them in `all-labels.js`; a row in `docs/reference/localisation.md`; and the element's `texts` and `unused` budgets in its `build.js` (each group sums every language's file). `test/menu-texts.test.js` and `test/unused.test.js` check the loaders and the keys; `overflow.js` which toolbar buttons go into "More" (a fixed priority and the room each takes, not the texts); `rove.js` the arrow keys of the field list (one Tab stop); `use-export.js` the Export menu's entry point, `export-run.js` its work and `drill-export.js` the drill-down panel's exports (both load with the menus and start loading pivotkit-core/export when a menu that copies opens, so a copy happens in the click; every file and copy passes `onExport` first); `place.js` where a popover goes (next to its anchor; with `fill`, the filter and the chip menus, against the window's edge when it fits on neither side); `popover.jsx` puts popovers and sheets into the browser's top layer (`popover="manual"`, `--pk-layer-z` without the Popover API); `chart-types.js` also `chartPlan`, what an automatic chart (`chart.type: "auto"`) draws; `styles.css` every `--pk-*` token. Logic that needs no DOM lives in `.js` modules; `test/` runs
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
  fails above `SIZE_BUDGET_KIB` in `build.js`. The first load holds only what the first render needs
  (the table with its header sort and `aria-sort`, the toolbar, the zones, the field list, the tips,
  the skeleton, drag and drop) and what a click outside a menu does at once (a commit and its status
  note, Undo, reading a link at the start); what runs after a click in a menu (a menu's panel, its
  texts, the parts of its sections, the view changes only menus make in `menu-ops.js`, sharing in
  `share-actions.js`, the drill-down's table in `drill-table.js`) goes into pivotkit-react's
  `menus.js`, and what only a drawn chart needs (`chart-decorate.js`, `chart-layout.js`) into
  `echarts.js`; the plain words of a view's unused parts (`unused-texts*.js`) are the group "unused", loaded only when a view has such parts. esbuild splits by file: a module that both load lands in the first load whole, so a
  menu-only function goes into a module of the menus, not next to first-load code. A text a menu
  alone shows goes into `menu-labels.js`; a text the first render shows stays in `labels.js`, so no
  report shows English first.
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
- `packages/pivotkit-xlsx/` - the reader plugin for Excel workbooks: `src/index.js` the descriptor
  (imports nothing), `src/reader.js` the reader (`read`, `sheets`): its own checks before parsing
  (`zip.js`: the ZIP directory against `archiveEntries` and `unpackedBytes`, parts unpacked into
  buffers of their stated size; `xml.js`: no `<!DOCTYPE`/`<!ENTITY`, the sheet's rows without a value
  left out while it streams; `workbook.js`: the sheets and their parts), then read-excel-file's
  `universal` entry on an uncompressed ZIP of only the needed parts (`createStoredZip`), so it starts
  no worker (a strict CSP blocks fflate's `blob:` workers), then pivotkit-core's `createTable`.
  `build.js` writes `dist/` (for pages without a bundler) with `THIRD_PARTY_LICENSES.txt`
  (`scripts/third-party-licenses.js`) and checks `SIZE_BUDGET_KIB`. `test/make-xlsx.js` generates the
  workbooks the tests read (none is committed), `test/bench.js` measures a 94,000-row workbook.
- `examples/reader-plugin/` - a complete reader plugin (JSON Lines) to copy, the example of the docs
  page `reference/write-a-plugin.md`; tested by `tests/reader-plugin.test.js`.
- `tests/browser/` - Playwright tests in Chromium, Firefox and WebKit of the playground and of
  `pages/` (a host page that loads `dist/index.js` with React from an import map and renders again
  all the time; a shadow root; `nav.html` next to a fixed navigation and app bar above the report's
  z-index, as PowerShell Universal draws its apps (`nav-shell.js`, helpers in `host-nav.js`); the web
  component's pages in `pages/element/`: two elements, upgrade, loaded twice, strict CSP, listener
  counts, a page with its own React, the element next to the fixed navigation; `xlsx.html`:
  pivotkit-xlsx's dist/ reading a picked workbook under the strict CSP); CI runs them on React 18 and
  React 19 (`tests/react19/`, own lock file), one job per engine and React version. `tests/ci.test.js` checks the pinning (Playwright image = locked `@playwright/test`, exact
  versions, caret ranges for this repository's own packages).
- `scripts/check-pack.js` - checks what `npm pack` would publish.
- `docs/` - the documentation site (pivotkit.eize.dev): Zensical (`zensical.toml`) with the shared design
  of eizedev/brand (`docs-site/`), built and published by `.github/workflows/docs.yml`. Pages in
  Markdown, `docs/assets/icon.svg` from eizedev/brand, `docs/assets/screenshots/` taken by
  `scripts/docs-screenshots.js` from the playground. `docs/playground/` (the live demo, copied by
  `scripts/docs-demo.js`) and `docs/assets/site.css` (the design) are build output, not committed. The theme's
  repository link in the header asks api.github.com for the repository's stars, forks and latest
  release (cached by the theme in the reader's browser), as on the other eizedev sites.
- `packages/*/README.md` - the npm package pages: short landing pages (what the package is, one
  screenshot, install with its peers, one example, a table of links into the site, the license).
  The install facts (command, peer ranges, the 0.x caret-range note, supported browsers and Node,
  serving the whole `dist/`) and the one example are repeated there on purpose and must match
  `package.json` and the site; everything else lives only on the site, so a fact added to a README
  belongs on its docs page instead. Links and images in them are absolute
  (`https://pivotkit.eize.dev/...`), since npm shows them outside the repository. The page paths and
  heading anchors they link to are a contract, since a published npm README cannot be changed:
  `scripts/check-readme-links.js` checks them against the built site in the docs workflow.
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
npm run size -w pivotkit-xlsx       # build pivotkit-xlsx's dist/, gzip of the plugin and its reader against the budget
npm run bench -w pivotkit-xlsx      # read time and memory of a generated 94,000-row workbook (-- --browser: Chromium too)
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
node scripts/check-readme-links.js site   # after `zensical build`: the READMEs' links to the site resolve (as CI)
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
  grows with the data or the view gets a limit too; `docs/concepts/limits.md` says what each one
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
  takes a caret range on its current version (`"pivotkit-core": "^0.3.0"` in pivotkit-react); the lock
  file still pins it in development. In 0.x a caret range spans patch versions only (`^0.3.0` is
  0.3.x), so a host that also uses pivotkit-core directly must use a version inside the range;
  npm shares one copy only when the ranges overlap. Chart wrapper packages have been hijacked on npm
  before: prefer a small own wrapper over a wrapper package.
- A loaded file is user input like a view: every reader counts what a file can make grow against
  `LIMITS` before the step it guards (the size before reading, an archive's directory before
  unpacking, rows and cells while reading), refuses what a table never needs (macros, `<!DOCTYPE`,
  encrypted or old binary workbooks) with what to do, never evaluates or fetches anything a file
  names, and builds its table with `createTable`, so names and values are cleaned the same for every
  format. A reader starts no worker of its own (a strict CSP blocks `blob:` workers). Errors are
  `INVALID_FILE` with `details.reason`, or `LIMIT_EXCEEDED` with `details.file`.
- Exports must be safe to open: CSV text that a spreadsheet would run as a formula gets a leading `'`
  (the rule is in `src/csv.js`: tab or CR first, or `=` `@` after leading whitespace and control
  characters, or `+` `-` unless the text is a number as a locale writes it or a number range; the same guard for the clipboard copies); XLSX writes text as
  inline strings, never as formulas.
- Designed for up to about 100,000 rows: typed arrays, no per-row objects in hot loops. Run the
  benchmark before and after engine changes and compare with the baseline in `docs/reference/core.md`
  (Performance).
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
  start page `docs/index.md` keeps the short version for both audiences. The package READMEs are
  short npm landing pages that link into the site and hold no details; a heading or anchor of the
  site that a README links to keeps its address (or gets a redirect), as for any page that moves.
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
- Put secrets, host names or real data into code, examples or tests; the exceptions are the public
  data of `examples/playground/data/` and the excerpts of public exports in
  `packages/pivotkit-core/test/import-fixtures/`, each with its licence and attribution in `SOURCES.md`.

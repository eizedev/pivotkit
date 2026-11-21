# pivotkit-react

The React 18/19 UI on the core: `<PivotReport>`. JSX in `src/` with JSDoc types.
The root [AGENTS.md](../../AGENTS.md) applies too.

## Commands

```bash
npm run build -w pivotkit-react     # dist/index.js and dist/styles.css (esbuild)
npm test -w pivotkit-react          # build, then node --test
npm run coverage -w pivotkit-react  # the .js modules only
npm run test:browser                # what needs a browser
```

Check a UI change in the playground: light and dark theme, wide and narrow.

## Build and dependencies

- esbuild writes JSX as `React.createElement`. The host needs `react` and `react-dom` only.
- React, ReactDOM and ECharts are peer dependencies. Never bundle them.
- PowerShell Universal provides React 18.3.1 at runtime. Keep React 18 working.
- pivotkit-core and @dnd-kit stay bare imports for the host's bundler or import map.
- `styles.css.d.ts` is committed. It is the `types` condition of the stylesheet export.

## Where things go

- `PivotReport.jsx` wires the parts and defines `commit()`.
- `use-view-history.js` owns the view and its undo history, controlled or not.
- Every view change is a pure function in `view-ops.js`.
- Changes only the menus make go into `menu-ops.js`, which loads with the menus.
- Logic that needs no DOM lives in `.js` modules, tested with `node --test`.

One module is the only place for each of these:

| Concern | Module |
| --- | --- |
| Chart types | `chart-types.js` |
| Tips | `tips.js` (`TIPS`) |
| Menu topics, levels and search | `menu-topics.js` |
| Toolbar overflow into "More" | `overflow.js` (`OVERFLOW_ORDER`, `MORE_GROUPS`) |
| Tabs Table and Chart with their settings | `view-tabs.jsx` |
| Explaining a setting (the "i") | `SettingInfo` in `section.jsx` |
| Searching the fields (field list, "+ Add") | `matchingFields` in `field-info.js` |
| The menu of "+ Add" in a zone | `add-menu.jsx`, loaded with the menus |
| Groups inside a menu | `Group` in `popover.jsx` |
| A text field with an "x" | `clear-input.jsx` |
| localStorage | `storage.js` |
| Numbers typed into a menu | `numbers.js`. Never `type="number"` |
| Importing @dnd-kit | `dnd.jsx` |
| Importing ECharts | `echarts.js`, by name, as its own chunk |
| Focus, Tab and Escape in a shadow root | `dom.js` |
| Unique form field names | `useFormName` in `dom.js` |
| Menu filters to core filters | `view-ops.js` (`ruleOp`, `opOf`, `pickFilter`) |

## First load and lazy chunks

The first load holds only what the first render needs. Everything else loads on use.

- A function only a menu uses goes into a menus module, not next to first-load code.
- esbuild splits by file. A module both load lands in the first load whole.
- A text only a menu shows goes into `menu-labels.js`.
- A text the first render shows stays in `labels.js`. No report may show English first.
- A menus module never imports `chart.jsx`. `export-run.js` gets `loadECharts` through its context.
- `echarts.js` brings pivotkit-core's `toEChartsOption`, from `pivotkit-core/chart`. `chart.jsx` never imports it.
- `PivotReport.jsx` imports `deferred.js` as a file of its own: German texts and the tips' table.
- pivotkit-element bundles `deferred-late.js` in its place. It loads them later.
- What the first render needs of the tips is in `tip-state.js`, not in `tips.js`.
- The notices (the result is cut or empty) are rows of `notices.js`, in the first load. A new one
  needs its id in `NOTICE_IDS` too.
- The import UI loads on first use through `lazy-import.js`.
- The HTML report, SVG and printing load on first use through `report-run.js`.
- pivotkit-element's `test/build.test.js` checks the split.

## Strict CSP

- No inline `style` attributes. The chart's tooltip is built as DOM nodes.
- Printing uses a frame sandboxed without scripts, filled as DOM (`print-frame.js`).
- `print()` runs inside the click. Do not await a promise that is not yet resolved.
- Opening the Export menu readies the print frame (`prepareExport` in `export-run.js`).
- Pointing at, pressing or focusing Print starts loading the report's modules.
- The print specs check this with `inClick` in all three engines.

## UI rules

- Follow principle 5 in [PRODUCT.md](../../PRODUCT.md#principles): frequent tasks visible and in few clicks, the rest one level deeper in the same menu pattern.
- Text at least 14 px. Controls at least 24 x 24 px (`--pk-target`).
- Buttons show visible text. An icon alone only where the text stands next to it.
- Every action works by keyboard and from a menu. Drag and drop is never the only way.
- Keep or move focus on purpose after every change.
- Code that reads focus or clicks must be shadow-root safe. Use `dom.js` and `composedPath()`.
- Animate only through `--pk-duration`, so `prefers-reduced-motion` turns it off.
- Layout follows the report's width (`data-pk-size`), not the window's.

## Theme tokens

Visual values come from `--pk-*` tokens. A host can then match its design without overriding selectors.

- Colours, font weights, radii, font families and ring geometry are tokens everywhere.
- Literals live only in the token blocks of `styles.css`: `:where(.pk-root)` and its dark theme.
- Styles set from code use tokens too: the chart, its tooltip, the table's label probe.
- Font sizes are `--pk-font-size`, `--pk-small`, a token built on them, or `em` of them.
- The printed report uses `--pk-print-size` and `--pk-print-small`, in pt.
- A new visual value gets a token. A literal becomes one when its rule is touched.
- Shapes such as `999px` pills, `50%` circles and `0` are not theme values.

### Checks and consumers

- Document each token in `docs/reference/theming.md`.
- `test/tokens.test.js` fails on literals. `test/contrast.test.js` checks both themes.
- The chart reads tokens through pivotkit-core's `chartThemeFrom` and `decorateOption`.
- Exports read the light tokens. The HTML report also takes the dark ones (`theme-tokens.js`).

## Behaviour rules

- A host may render the report on every change of its state.
- Compare props by value: `labels`, `limits`, `importLimits`, `fieldDefaults`.
- Compare data by `dataKey`.

### Field labels and outside input

- `fieldDefaults` are optional. A field without them looks and works as if there were none.
- Labels are display only. Views keep field names.
- A view from outside passes `normalize()` with pivotkit-core's `outsideLimits`.
- The host's `chartOptions` is checked as plain JSON (`chart-options.js`). Nothing in it runs.

### Exports and kept data

- Exporting source data (`exportData`) is off by default.
- The drill-down's copy and download follow `exportData`, or `drillDownExport` (`export-scope.js`).
- Every file and copy passes `onExport` first.
- Data loaded from a file is kept in memory only, per `storageKey` (`data-keep.js`).

## Tips

- A tip is one row of `TIPS`: a pure condition, a text in every language, an optional action.
- At most `TIP_LIMIT` (one) shows at a time, above the result, never over it.
- A row that says the result is cut or empty is `kind: "notice"`. It always shows.
- Read browser storage after the first render (`useSyncExternalStore` with a server snapshot).

## Adding a language

1. First-load texts in `src/labels-<lang>.js`, added in `deferred.js`, loaded in `deferred-late.js`.
2. Menu texts in `src/menu-labels-<lang>.js`.
3. Its loader in `MENU_TEXTS_OF` (`menu-texts.js`).
4. The entry `"menu-texts-<lang>"` in `build.js`.
5. Unused-part texts in `src/unused-texts-<lang>.js`, loader in `UNUSED_TEXTS_OF` (`unused-load.js`).
6. Import texts in `IMPORT_TEXTS` (`import-labels.js`).
7. All of them in `all-labels.js`.
8. A row in `docs/reference/localisation.md`.
9. pivotkit-element's `texts`, `unused` and `lang` budgets in its `build.js`.

`test/menu-texts.test.js` and `test/unused.test.js` check the loaders and keys.

## Tests

- `test/` runs the `.js` modules with `node --test`, plus a server render of the built package.
- `test/types/` is a TypeScript consumer.
- The `.jsx` components are covered by the browser tests in `tests/browser/`.

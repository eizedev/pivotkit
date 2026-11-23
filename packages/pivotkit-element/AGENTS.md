# pivotkit-element

The web component `<pivot-report>`: pivotkit-react in an open shadow root, on its own React 18.3.1.
It is for hosts without React, such as Angular, PHP or plain HTML.
The root [AGENTS.md](../../AGENTS.md) and [pivotkit-react's](../pivotkit-react/AGENTS.md) apply too.

## Commands

```bash
npm run build -w pivotkit-element   # pivotkit-react's dist first, then this dist/
npm test -w pivotkit-element        # build, then node --test
npm run types -w pivotkit-element
npm run size -w pivotkit-element    # what a page loads, gzip; fails above SIZE_BUDGET_KIB
```

The size check gives CI's numbers only on an official Node build of `SIZE_NODE`.
A Node with the system's zlib, such as Homebrew's, measures other sizes. The check says so.
A new zlib in a Node 24 release can move the numbers too, by up to about 0.6 KiB.

## Bundle

- `build.js` bundles React, ReactDOM, pivotkit-core, pivotkit-react and @dnd-kit into `dist/`.
- Every bundled package is an exact devDependency. The package has no runtime dependency.
- `build.js` writes `dist/THIRD_PARTY_LICENSES.txt` through `scripts/third-party-licenses.js`.
- `SIZE_BUDGET_KIB` in `build.js` sets a gzip budget for each load group.

## First load and groups

The first load holds only the first render and what a click outside a menu does at once.

- The first render: table, header sort, toolbar, zones, field list, notices, skeleton, drag and drop.
- A click outside a menu: a commit with its status note, Undo, reading a link at start.
- Work after a click in a menu goes into pivotkit-react's `menus.js`.
- What only a drawn chart needs goes into `echarts.js`.

### Later than in pivotkit-react

`build.js` bundles pivotkit-react's `dist/deferred-late.js` in place of its `dist/deferred.js`:

- Group "lang": the German first-load texts. Loaded before the first render of a German report only.
- Group "tips": the tips' table. Loaded right after the first render.
- The style rules only the menus' code writes load inside the menus' chunk (`src/css-split.js`).
- `src/styles.js` puts them back in their place, so the cascade is that of one stylesheet.

### Lazy groups

- Group "unused": the texts of a view's unused parts. Loaded only when a view has some.
- Group "import": loading data. Loaded on first use.
- Group "report": HTML report, SVG and printing. Loaded on first use.
- Group "template": print template CSS. The element never loads it.
- A module behind a barrel lands wherever any importer of the barrel loads it.
- So `chartOffBarrel` drops `toEChartsOption` from pivotkit-core's `index.js`. The chart takes it from `pivotkit-core/chart`.
- `dist/import-worker.js` is a separate build of one file (`workerOptions`).
- `test/build.test.js` checks all of this.

## Shadow root rules

- The shadow root is the boundary. No page style reaches in and no report style leaks out.
- The only exception is the `--pk-*` tokens set on the element.
- `host-css.js` declares them on `:host`, never on `.pk-root` inside the element.
- Events are `pivot-*` CustomEvents that bubble and are composed (`src/events.js`).
- An attribute or property lives in three places: its row in `src/props.js` (the table the element
  reads), its accessor with JSDoc in `src/element.js` (the public type), and its name in
  `src/jsx.d.ts`. The element's props for the report read it in `#props()`.
  `test/props-places.test.js` fails when one place is missing.
- Data and other objects stay properties. JSON attributes are only for views.
- The element sets no global and touches no DOM when imported without `customElements`.

## Types

- `src/global.d.ts` and `src/jsx.d.ts` are hand-written. JSDoc cannot augment globals or React's JSX.
- `types.js` copies them into `types/`. Only the public declarations ship.

## Tests

- `test/` runs the pure modules, the build and a Node import with `node --test`.
- The browser pages are in `tests/browser/pages/element/`.

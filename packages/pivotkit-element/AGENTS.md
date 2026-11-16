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

## Bundle

- `build.js` bundles React, ReactDOM, pivotkit-core, pivotkit-react and @dnd-kit into `dist/`.
- Every bundled package is an exact devDependency. The package has no runtime dependency.
- `build.js` writes `dist/THIRD_PARTY_LICENSES.txt` through `scripts/third-party-licenses.js`.
- `SIZE_BUDGET_KIB` in `build.js` sets the size budget per group.

## First load and groups

The first load holds only the first render and what a click outside a menu does at once.

- The first render: table, header sort, toolbar, zones, field list, tips, skeleton, drag and drop.
- A click outside a menu: a commit with its status note, Undo, reading a link at start.
- Work after a click in a menu goes into pivotkit-react's `menus.js`.
- What only a drawn chart needs goes into `echarts.js`.
- Group "unused": the texts of a view's unused parts. Loaded only when a view has some.
- Group "import": loading data. Loaded on first use.
- Group "report": HTML report, SVG and printing. Loaded on first use.
- Group "template": print template CSS. The element never loads it.
- A module behind a barrel lands wherever any importer of the barrel loads it.
- `dist/import-worker.js` is a separate build of one file (`workerOptions`).
- `test/build.test.js` checks all of this.

## Shadow root rules

- The shadow root is the boundary. No page style reaches in and no report style leaks out.
- The only exception is the `--pk-*` tokens set on the element.
- `host-css.js` declares them on `:host`, never on `.pk-root` inside the element.
- Events are `pivot-*` CustomEvents that bubble and are composed (`src/events.js`).
- Add an attribute only in `src/props.js`, the one table of attributes.
- Data and other objects stay properties. JSON attributes are only for views.
- The element sets no global and touches no DOM when imported without `customElements`.

## Types

- `src/global.d.ts` and `src/jsx.d.ts` are hand-written. JSDoc cannot augment globals or React's JSX.
- `types.js` copies them into `types/`. Only the public declarations ship.

## Tests

- `test/` runs the pure modules, the build and a Node import with `node --test`.
- The browser pages are in `tests/browser/pages/element/`.

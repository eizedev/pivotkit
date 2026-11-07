<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/header-dark.svg">
    <img src="assets/header-light.svg" alt="pivotkit" height="90">
  </picture>
</p>

Pivot report builder for the web: drag-and-drop fields, table and chart (Apache ECharts), templates as
JSON, native Excel export; as a JavaScript core, a React component and a web component.

![The pivot report: field list, the Filters, Columns, Rows and Values zones, and a table of revenue by region, country and category with subtotals](docs/assets/screenshots/report-light.png)

| | |
| --- | --- |
| Build | [![CI](https://github.com/eizedev/pivotkit/actions/workflows/ci.yml/badge.svg)](https://github.com/eizedev/pivotkit/actions/workflows/ci.yml) [![Docs site](https://github.com/eizedev/pivotkit/actions/workflows/docs.yml/badge.svg)](https://github.com/eizedev/pivotkit/actions/workflows/docs.yml) |
| Documentation | [pivotkit.eize.dev](https://pivotkit.eize.dev/): getting started, a guide for the people using the report, the API reference, a [live demo](https://pivotkit.eize.dev/demo/) and [Learn with real data](https://pivotkit.eize.dev/learn/) (weather, countries, earthquakes, Nobel laureates) |
| License | [![MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE) |

Version 0.1.0 of each package, on npm.

## Packages

| Package | What | Install |
| --- | --- | --- |
| [pivotkit-core](packages/pivotkit-core/) | The engine in plain JavaScript, no UI and no framework | `npm install pivotkit-core` |
| [pivotkit-react](packages/pivotkit-react/) | React 18/19 report builder: field list, drag and drop, table and chart, filters, templates, export; React and ECharts are provided by the host | `npm install pivotkit-react react react-dom echarts` |
| [pivotkit-element](packages/pivotkit-element/) | The report builder as the web component `<pivot-report>` with its own React, for Angular, PHP and plain HTML; ECharts loaded on the first chart | `npm install pivotkit-element` |

## Example

The report builder in React (try it in the [playground](examples/playground/)):

```jsx
import { PivotReport } from "pivotkit-react";
import "pivotkit-react/styles.css";

<PivotReport data={rows} defaultView={{ rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] }} onViewChange={save} />
```

The same as a web component, on a page without React (try it in the [example](examples/element/)):

```html
<script type="module" src="/assets/pivotkit-element/dist/index.js"></script>
<pivot-report locale="de-DE" default-view='{"rows":["Region"],"values":[{"field":"Sales","agg":"sum"}]}'></pivot-report>
<script type="module">
    const report = document.querySelector("pivot-report");
    report.data = rows;
    report.addEventListener("pivot-view-change", (e) => save(e.detail.view));
</script>
```

The engine without UI:

```js
import { encode, computePivot, toGrid } from "pivotkit-core";
import { toXlsx } from "pivotkit-core/export";

const data = encode(rows);                       // an array of objects
const result = computePivot(data, {
    rows: ["Region"],
    cols: ["Product"],
    values: [{ field: "Sales", agg: "sum", format: "currency:EUR" }]
});
const grid = toGrid(result);                     // cells with merges, totals and formatted text
const xlsx = toXlsx(grid);                       // Uint8Array
```

The view passed to `computePivot` is plain JSON: the same object is the saved template, the undo
step and what the UI edits. It is treated as user input: it cannot run code, and the limits in
`LIMITS` keep its memory use bounded. See [pivotkit-core](packages/pivotkit-core/) for the API, the
view, the limits and the export, and [pivotkit-react](packages/pivotkit-react/) for the component's
props, theming tokens and labels, and [pivotkit-element](packages/pivotkit-element/) for the
element's properties, events, theming, CSP and bundle size.

## Development

```bash
npm ci
npm run lint
npm run types                    # type check, generated .d.ts, TypeScript consumer test
npm test
npm run pack:check               # what npm pack would publish (all three packages)
npm run bench -w pivotkit-core
npm run playground               # the playground on http://localhost:5173
npm run docs:data                # fetch the playground's real data sets again (network)
npm run test:browser             # Playwright in Chromium, Firefox and WebKit: playground, host pages, shadow root, web component
PIVOTKIT_REACT=19 npm run test:browser   # the same on React 19 (after npm ci --prefix tests/react19)
```

Releasing is described in [CONTRIBUTING.md](CONTRIBUTING.md#releasing).

## License

[MIT](LICENSE). Charts are drawn with [Apache ECharts](https://echarts.apache.org/) (Apache-2.0).

# pivotkit

Pivot report builder for the web: drag-and-drop fields, table and chart (Apache ECharts), templates as
JSON, native Excel export; as a JavaScript core, a React component and a web component.

| | |
| --- | --- |
| Build | [![CI](https://github.com/eizedev/pivotkit/actions/workflows/ci.yml/badge.svg)](https://github.com/eizedev/pivotkit/actions/workflows/ci.yml) |
| License | [![MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE) |

Status: in development. Nothing is published to npm yet.

## Packages

| Package | What | Status |
| --- | --- | --- |
| [pivotkit-core](packages/pivotkit-core/) | The engine in plain JavaScript, no UI and no framework | in development |
| [pivotkit-react](packages/pivotkit-react/) | React 18/19 report builder: field list, drag and drop, table and chart, filters, templates, export; React and ECharts are provided by the host | in development |
| [pivotkit-element](packages/pivotkit-element/) | Web component `<pivot-report>` with its own React, for Angular, PHP and plain HTML | planned |

## Example

The report builder in React (try it in the [playground](examples/playground/)):

```jsx
import { PivotReport } from "pivotkit-react";
import "pivotkit-react/styles.css";

<PivotReport data={rows} defaultView={{ rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] }} onViewChange={save} />
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
props, theming tokens and labels.

## Development

```bash
npm ci
npm run lint
npm run types                    # type check, generated .d.ts, TypeScript consumer test
npm test
npm run pack:check               # what npm pack would publish
npm run bench -w pivotkit-core
npm run playground               # the playground on http://localhost:5173
npm run test:browser             # Playwright in Chromium, Firefox and WebKit: playground, host page, shadow root
PIVOTKIT_REACT=19 npm run test:browser   # the same on React 19 (after npm ci --prefix tests/react19)
```

Releasing is described in [CONTRIBUTING.md](CONTRIBUTING.md#releasing).

## License

[MIT](LICENSE). Charts are drawn with [Apache ECharts](https://echarts.apache.org/) (Apache-2.0).

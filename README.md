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
| [pivotkit-react](packages/pivotkit-react/) | React 18/19 report builder; React is provided by the host | planned |
| [pivotkit-element](packages/pivotkit-element/) | Web component `<pivot-report>` with its own React, for Angular, PHP and plain HTML | planned |

## Example

```js
import { encode, computePivot, toGrid, toXlsx } from "pivotkit-core";

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
step and what the UI edits. See [pivotkit-core](packages/pivotkit-core/) for the API and the view.

## Development

```bash
npm ci
npm run lint
npm test
npm run bench -w pivotkit-core
```

## License

[MIT](LICENSE). Charts are drawn with [Apache ECharts](https://echarts.apache.org/) (Apache-2.0).

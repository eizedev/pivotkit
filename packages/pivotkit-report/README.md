# pivotkit-report

Render [pivotkit](https://pivotkit.eize.dev/) views without a browser: a view over rows as an HTML
report to print or save as PDF, CSV, JSON, an Excel workbook (.xlsx) or the chart as SVG. The same
table and chart as the report on the screen, from pivotkit-core's engine and exporters; the print
template is HTML with `{{placeholders}}`, and everything filled into it is escaped. Runs in Node and
in the browser.

## Install

```bash
npm install pivotkit-report echarts
```

ES modules for Node 22 or later and browsers from Chrome 111, Firefox 113 and Safari 16.4. It depends
on pivotkit-core (a caret range on the minor version it was released with, see its `package.json`). ECharts (`>=6.1.0 <7`) is an optional peer dependency: only
the SVG and the chart of an HTML report need it, passed in as `options.echarts`. TypeScript
declarations are included.

## Example

```js
import { writeFile } from "node:fs/promises";
import * as echarts from "echarts";
import { render } from "pivotkit-report";

const view = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }], display: "chart" };
const result = await render(view, rows, { format: "html", echarts, now: "2026-11-13" });
if (!result.ok) console.warn(result.issues);   // a bad view never throws: its issues come back
await writeFile("report.html", result.body);  // Uint8Array; result.text for the text formats
```

## Where in the docs

| Topic | Page |
| --- | --- |
| Getting started: a complete script, rows in code and data files | [Getting started with reports](https://pivotkit.eize.dev/getting-started/report/) |
| `render()`, its options, formats, limits and errors | [pivotkit-report reference](https://pivotkit.eize.dev/reference/report/) |
| The print template and its placeholders | [Print template](https://pivotkit.eize.dev/reference/print-template/) |
| The command line on top of it | [pivotkit-cli](https://pivotkit.eize.dev/reference/cli/) |
| Changes | [CHANGELOG](https://github.com/eizedev/pivotkit/blob/main/packages/pivotkit-report/CHANGELOG.md) |

## License

[MIT](https://github.com/eizedev/pivotkit/blob/main/LICENSE)

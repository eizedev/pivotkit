---
title: pivotkit-report
description: Render a pivotkit view over rows without a browser - JSON, CSV, XLSX, an SVG chart or a printable HTML report from a template - in Node and in the browser, with the view's issues and the same table and chart as the report on screen.
---

# pivotkit-report

`pivotkit-report` runs a view over data and writes a file: an HTML report to print or save as PDF,
CSV, JSON, an Excel workbook (.xlsx) or the chart as SVG. It joins pivotkit-core's steps (the view
file, `normalize`, `computePivot`, `toGrid` and its exporters, `chartPlan` and the chart's marks), so
the table and the chart are the ones the report shows on the screen. It runs in Node and in the
browser; the [command line](cli.md) and the report's own Export menu
([HTML report, SVG, print](../use/export.md)) use it.

```bash
npm install pivotkit-report echarts
```

ECharts (`>=6.1.0 <7`) is an optional peer dependency: only the SVG and the chart of an HTML report
need it, and you pass the module in, so a page uses the copy it already has.

```js
import { writeFile } from "node:fs/promises";
import * as echarts from "echarts";
import { render } from "pivotkit-report";

const view = { rows: ["Region"], values: [{ field: "Units", agg: "sum" }], display: "chart" };
const result = await render(view, rows, { format: "html", echarts, now: "2026-11-13", locale: "de-DE" });
if (!result.ok) throw new Error(result.issues.map((i) => i.message).join("; "));   // a bad view never throws
await writeFile("report.html", result.body);   // Uint8Array, the whole file
```

## render(view, data, options)

`view` is a view, a [view file](view-file.md) or a template `{ name, view }`, as an object or JSON
text. `data` is rows, columnar data (`{ columns, types, data }`, what
[`readFile`](import.md) returns) or `encode()`'s result. It returns a promise of:

| Property | What it is |
| --- | --- |
| `format`, `mediaType`, `extension` | `"html"`, `"text/html;charset=utf-8"`, `"html"`, and so on. |
| `body` | The file as a `Uint8Array`; `null` with `strict` when the view has an error. |
| `text` | The body as text, for `json`, `csv`, `svg` and `html`. |
| `issues` | The view's issues ([`VIEW_ISSUES`](core.md)), then the report's own (`REPORT_ISSUE_CODES`). |
| `ok` | `false` when an issue has the severity `error`. |
| `summary` | `{ rows, columns, sourceRows, truncated }`: the table's body rows and columns, the data's rows, whether a part was cut. |
| `view` | The normalized view that was rendered. |

The whole body is built in memory; the [limits](../concepts/limits.md) keep it bounded.

### Options

| Option | Default | What it does |
| --- | --- | --- |
| `format` | `"html"` | `json`, `csv`, `xlsx`, `svg` or `html`. |
| `locale` | `"en-US"` | Numbers, dates and the report's words when the view names no locale. |
| `timeZone` | `"UTC"` | Of rows not encoded yet, and of the "generated" time. |
| `now` | the clock | The "today" of relative date filters and the generated time; fix it for the same bytes on every run. |
| `limits` | `LIMITS` | pivotkit-core's [limits](../concepts/limits.md). |
| `trusted` | `false` | The view is the host's own: its limits instead of `outsideLimits()`. |
| `strict` | `false` | No body when the view has an error. Without it the normalized view is rendered, as the report on screen does. |
| `labels`, `texts` | | pivotkit-core's texts (totals, value names) and the report's words around the table (`REPORT_TEXTS`, English and German). |
| `title`, `description`, `source` | the view file's name and description | The report's heading, its line below, and the data's name in the details. |
| `tokens` | the light theme | `--pk-*` colours, font weights, font sizes and corners over [`LIGHT_TOKENS`](theming.md), `WEIGHT_TOKENS` (`--pk-weight-normal` to `--pk-weight-bold`, the chart's title and group labels too), `SIZE_TOKENS` (the HTML report's font sizes: `--pk-font-size` 14 px, `--pk-small`, `--pk-report-title-size`, `--pk-print-size` and `--pk-print-small`, [theming](theming.md#report-font-sizes)) and `SHAPE_TOKENS` (`--pk-radius-card`, the chart card), and the chart's `--pk-chart-title-size`, `--pk-chart-text-size` and `--pk-radius-chart` in px (else 16 px, 14 px and 4 px): names and plain values only (a comment, a line break and `url(` anywhere, also in a quoted string, leave the token out), and no function but colours, `calc()`, `min()`, `max()`, `clamp()` and `var()`, so a token loads nothing (`url()` and `image-set()` are left out). A colour scale or data bars whose view names no colours take `--pk-scale-low`, `--pk-scale-mid` (when set) and `--pk-scale-high` (by default the heat tokens) and `--pk-chart-1` in the HTML report's table and in the workbook, when they are `#rgb` or `#rrggbb`. |
| `template` | `DEFAULT_TEMPLATE` | `html`: a [print template](print-template.md). |
| `chart` | `"auto"` | `html`: the chart above the table: `"auto"` when the view shows the chart, `true`, `false`. |
| `chartEmbed` | `"image"` | `html`: the chart as a `data:` image, or `"inline"` SVG. |
| `echarts` | | The ECharts module with its SVG renderer: `svg`, and `html` with a chart. |
| `size` | `{ width: 800, height: 480 }` | The chart's size in px, 100 to 8,000. |
| `tableCells` | 200,000 | `html`: the cells of the table at most; a larger one is cut after the last whole row and says so. |
| `bom` | `true` | `csv`: start with a byte order mark, so Excel reads the file as UTF-8. `false` for a program that reads the first header cell by its name. |

Any other option name is refused (`INVALID_OPTION`, with the closest name), so a misspelt one is not
ignored.

### Library and command line

| | `render()` | `pivotkit render` |
| --- | --- | --- |
| A view with an error | `ok: false`, body rendered | exit 1, nothing written (`--lenient` writes it, still exit 1) |
| A warning | in `issues` | stderr; exit 1 with `--strict` |
| Limits for the view | `outsideLimits()` unless `trusted` | `outsideLimits()` |
| A limit, a refused template | throws `PivotkitError` | exit 2 |

### Errors

A bad view never throws: its issues come back. `PivotkitError` is thrown for a wrong argument
(`INVALID_ARGUMENT`), a wrong option (`INVALID_OPTION` with `details.option`: an unknown `format`, a
`size` out of range, an unknown option, a `chart`, `chartEmbed`, `bom`, `strict` or `trusted` of a value it does not take, an SVG or `chart: true` without `echarts`, a `now` that is no date), a limit (`LIMIT_EXCEEDED`) and
a refused template (`INVALID_TEMPLATE`, see [print template](print-template.md)). The report's own
issues are warnings: `chartUnavailable` (a view that shows the chart, rendered as HTML with `chart`
`"auto"` and without `echarts`: the table is there, the chart is not; pass `strict` and check `ok`, or
pass `chart: true`, when the chart must be there), `tableCut`, `chartCut` (the first `REPORT_LIMITS.categories` categories, 50) and `viewFile`
(an error: the input is no view).

## The formats

| Format | Holds |
| --- | --- |
| `json` | pivotkit-core's [`toJson`](core.md): the header texts per column and each row's labels and values. |
| `csv` | [`toCsvBytes`](core.md): UTF-8 with a byte order mark, the locale's separator, formulas neutralized. |
| `xlsx` | [`toXlsx`](core.md): every number with its decimals and formats, the sheet named after the title. |
| `svg` | The chart as the screen draws it ([`chartPlan`](core.md), the theme's colours, the axis laid out for the size), the first 50 categories. |
| `html` | The report below. |

## The HTML report

The default template writes a page that loads and runs nothing: its Content-Security-Policy is the
first element of `<head>` (`default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri
'none'; form-action 'none'`), the chart is an image (`data:image/svg+xml`), and there is no script.

- **The table** as the screen shows it: merged headers and row labels, totals and subtotals shaded
  and bold, colour scales and data bars, a collapsed group marked "+". Numbers as the table writes
  them. No sorting buttons, toggles or drill-down: a report is read, not used.
- **The chart** above the table when the view shows the chart (`chart: "auto"`), kept whole on a
  page.
- **The details**: the source, the data's rows, the filters in words and the time it was generated.
- **On screen** light or dark after the reader's system; **on paper** always light, with 12 mm
  margins, the header row on every page, rows never split, landscape from 9 columns and a smaller
  font (7 pt) from 17. A table wider than a landscape page is cut by the browser: split the view, or
  export Excel.

## The chart as SVG

ECharts' server-side renderer (`echarts.init(null, null, { renderer: "svg", ssr: true })`, then
`renderToSVGString()`) draws it; `cleanSvg` then checks every element and attribute: only the elements
a chart draws, no event attribute, no link but to a fragment or a `data:` image, no unescaped text,
control characters left out, every `style` attribute turned into presentation attributes (so the SVG
also shows under a strict Content-Security-Policy). Anything else is refused with `PivotkitError`
(`details.reason`). Text from the data is never trusted to the renderer's escaping alone.

## Exports

`render`, `RENDER_FORMATS`, `REPORT_LIMITS` (`template`, `chartWidth`, `chartHeight`, `tableCells`,
`categories`), `REPORT_ISSUE_CODES`, `CHART_SIZE`, `cleanSvg`, `DEFAULT_TEMPLATE`, `REPORT_CSP`,
`REPORT_TEXTS`, `LIGHT_TOKENS`, `DARK_TOKENS`, `WEIGHT_TOKENS`, `SHAPE_TOKENS`, `SIZE_TOKENS`; `pivotkit-report/template`: `parseTemplate`,
`fillTemplate`, `escapeHtml`, `PLACEHOLDERS`, `ATTRIBUTES`, `TEMPLATE_LIMIT`
([print template](print-template.md)).

---
title: Getting started with reports without a browser
description: Install pivotkit-report, read a CSV file in Node, render a view over its rows to an HTML report, CSV, Excel or SVG, and handle the view's issues - a complete script to copy and run.
---

# Getting started with reports without a browser

`pivotkit-report` turns a [view](../concepts/views.md) and rows into a file, in Node or the browser:
an HTML report to print or save as PDF, CSV, JSON, an Excel workbook (.xlsx) or the chart as SVG. The
table and the chart are the ones the report shows on the screen. The [command line](cli.md) is built
on it; use this package when your own code makes the reports (a scheduled job, a server, a test).

## 1. Install { #install }

```bash
mkdir pivotkit-report-try && cd pivotkit-report-try
npm init -y && npm pkg set type=module
npm install pivotkit-report pivotkit-core echarts
```

ECharts is needed only for the chart (an SVG, or the chart of an HTML report); you pass the module in.
pivotkit-core reads data files (step 3); install the version pivotkit-report depends on, so the
project has one copy (`npm ls pivotkit-core` lists them).

## 2. Render rows you have in code { #rows-in-code }

`report.js`:

```js
import { writeFile } from "node:fs/promises";
import * as echarts from "echarts";
import { render } from "pivotkit-report";

const rows = [
    { Region: "North", Product: "A", Units: 3, Date: "2026-01-05" },
    { Region: "North", Product: "B", Units: 2, Date: "2026-02-01" },
    { Region: "South", Product: "A", Units: 4, Date: "2026-02-14" }
];
const view = { rows: ["Region"], cols: ["Product"], values: [{ field: "Units", agg: "sum" }] };

const result = await render(view, rows, { format: "html", echarts, now: "2026-11-13" });
if (!result.ok) {
    // a bad view never throws: its issues come back, each with a code and a message
    console.error(result.issues.map((i) => `${i.code}: ${i.message}`).join("\n"));
    process.exit(1);
}
await writeFile("report.html", result.body);
console.log(`report.html: ${result.summary.rows} rows x ${result.summary.columns} columns`);
```

```bash
node report.js      # then open report.html
```

`format` is `"html"`, `"csv"`, `"json"`, `"xlsx"` or `"svg"`; `body` is the file as bytes, `text`
the same as text for the text formats.

## 3. Render a data file and a view file { #files }

```bash
npx pivotkit-cli example      # sales.csv and two views in this directory, to try it with
```

The files the report downloads (**Views**, **Download view**; **Export**, **Source data**, **All rows
as CSV**) or the example files (`npx pivotkit-cli example`) work as they are. pivotkit-core reads the
CSV:

```js
import { readFile as readBytes, writeFile } from "node:fs/promises";
import { readFile } from "pivotkit-core/import";
import { render } from "pivotkit-report";

// readFile takes a File, as in the browser: in Node, wrap the bytes with their name
const bytes = await readBytes("sales.csv");
const table = await readFile(new File([bytes], "sales.csv"));
const viewFile = await readBytes("sales.pivotkit.json", "utf8");

const result = await render(viewFile, table, { format: "xlsx" });
if (!result.ok) throw new Error(result.issues.map((i) => i.message).join("; "));
await writeFile("sales.xlsx", result.body);
```

Excel workbooks are read with the plugin [pivotkit-xlsx](../reference/plugins.md):
`readFile(file, { plugins: [xlsxReader] })` with `import xlsxReader from "pivotkit-xlsx"`.

## Next

- Every option of `render()`, the formats, limits and issues: [pivotkit-report reference](../reference/report.md).
- Your own layout around the table: [print template](../reference/print-template.md).
- The views themselves, written by hand or by a program: [views](../concepts/views.md),
  [view file format](../reference/view-file.md).
- The same from a terminal or CI without writing code: [getting started with the command line](cli.md).

---
title: Compared with other pivot components
description: How pivotkit compares with Perspective, Graphic Walker, PivotTable.js and react-pivottable, AG Grid Enterprise, Flexmonster and WebDataRocks - what people and developers can do with each, from loading a file and filtering to Excel export, the rows behind a report and reports without a browser, with a source and the date for every cell.
---

# Compared with other pivot components

What people and developers can do with pivotkit and with six other pivot components, one row per
task, each cell linked to the page it comes from. pivotkit aims at people who know Excel's
PivotTable and at developers who put that report into their own application; the others choose
differently, and [where others are stronger](#where-others-are-stronger) says where.

## The short answer

Among the components below, pivotkit is the only one we found that combines a field list for people
without technical knowledge, loading their own CSV, JSON or Excel file in the report with a preview
(where the host turns it on; Excel with a plugin),
a switch between table and chart, views as JSON with a published JSON Schema, a native Excel export
that keeps the pivot layout, the rows behind the report as a file, and the same report rendered
without a browser by a library, a command line that checks views in CI, a REST service with a
container image and an MCP server for AI clients; it is MIT-licensed.

- **Perspective** is the strongest engine for large and live data, has no built-in Excel export (its
  FAQ says so) and streams live data.
- **Graphic Walker** is a chart builder first; it lets people upload a CSV or JSON file with a
  preview, and needs React 19.
- **Flexmonster** is a complete paid pivot tool: rules, top N, 13 languages, raw rows
  from its drill-through view; it exports in the browser (on a server through a headless browser).
- **AG Grid Enterprise** is a data grid with a paid pivot mode, server-side pivoting and 46 locales.
- **WebDataRocks** is free of charge but proprietary, capped at 1 MB of data.
- **PivotTable.js** has had no release since 2018; react-pivottable keeps its React wrapper current.

## What you can do

Checked on 2026-11-14 in each project's own documentation, README, wiki or npm entry; cells marked
¹ were checked on 2026-11-12 or 2026-11-13 and not again. "Not found" means not found in the pages
looked at, on that date; it is not proof of absence. Paid features say so. The table scrolls sideways
on a small screen.

| | pivotkit | Perspective | Graphic Walker | PivotTable.js / react-pivottable | AG Grid Enterprise | Flexmonster | WebDataRocks |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Drag fields into rows, columns, values | [Yes](use/fields.md#adding-fields) | [Yes](https://perspective-dev.github.io/guide/how_to/javascript/viewer.html) | [Yes](https://github.com/Kanaries/graphic-walker#readme) | [Rows, columns](https://github.com/nicolaskruchten/pivottable#readme) | [Yes (paid)](https://www.ag-grid.com/react-data-grid/tool-panel-columns/) | [Yes](https://www.flexmonster.com/user-interface/) | [Yes](https://www.webdatarocks.com/doc/js/field-list/) |
| Place a field without dragging | [Click or menu](use/fields.md#adding-fields) | [Not found](https://perspective-dev.github.io/guide/how_to/javascript/viewer.html) | [Not found](https://github.com/Kanaries/graphic-walker#readme) | [Not found](https://github.com/nicolaskruchten/pivottable#readme) | [Yes (paid)](https://www.ag-grid.com/react-data-grid/tool-panel-columns/) | [Partial: keyboard menu](https://www.flexmonster.com/doc/keyboard-navigation/) | [Not found](https://www.webdatarocks.com/doc/js/field-list/) |
| Load your own file in the report | [CSV, JSON; Excel with a plugin; preview, types, sheet; host turns it on](use/load-data.md) | [Not found](https://perspective-dev.github.io/guide/print.html) | [CSV, JSON; preview](https://github.com/Kanaries/graphic-walker#readme) | [Demo page only](https://github.com/nicolaskruchten/pivottable#readme) | [Partial (paid): .xlsx, no preview](https://www.ag-grid.com/react-data-grid/excel-import/) | [Partial: CSV, JSON](https://www.flexmonster.com/doc/csv-data-source/) | [Partial: CSV, JSON](https://www.webdatarocks.com/doc/js/csv-data-source/) |
| Filter by items, with search | [Yes, with row counts](use/filters.md#filter-by-values) | [Partial: in, not in](https://perspective-dev.github.io/guide/print.html) | [Yes](https://github.com/Kanaries/graphic-walker/releases/tag/v0.4.45) | [Yes](https://github.com/nicolaskruchten/pivottable/wiki/Parameters) | [Yes (paid)](https://www.ag-grid.com/react-data-grid/filter-set/) | [Yes](https://www.flexmonster.com/doc/filter-by-selection/) | [Yes](https://www.webdatarocks.com/doc/js/fields-filtering/) |
| Rules on names ("begins with") | [Yes](use/filters.md#rule-on-the-name) | [Yes](https://perspective-dev.github.io/guide/print.html) | [Partial: regular expression](https://docs.kanaries.net/graphic-walker/api-reference/types) | [Not found](https://github.com/nicolaskruchten/pivottable/wiki/Parameters) | [Yes](https://www.ag-grid.com/react-data-grid/filter-text/) | [Yes](https://www.flexmonster.com/doc/filter-by-condition/) | [Not found](https://www.webdatarocks.com/doc/js/fields-filtering/) |
| Rules on totals ("sum > 1,000") | [Yes](use/filters.md#compare-its-total) | [Partial: in code](https://perspective-dev.github.io/guide/print.html) | [Yes](https://github.com/Kanaries/graphic-walker/releases/tag/v0.6.0) | [Not found](https://github.com/nicolaskruchten/pivottable/wiki/Parameters) | [Partial](https://www.ag-grid.com/react-data-grid/aggregation-filtering/) | [Yes](https://www.flexmonster.com/doc/filter-by-value/) | [Partial: top N only](https://www.webdatarocks.com/doc/js/fields-filtering/) |
| Top N | [Yes, with ties](use/filters.md#top-n) | [Not found](https://perspective-dev.github.io/guide/print.html) | [Partial: row limit](https://docs.kanaries.net/graphic-walker/api-reference/types) | [Not found](https://github.com/nicolaskruchten/pivottable/wiki/Parameters) | [Not found](https://www.ag-grid.com/react-data-grid/aggregation-filtering/) | [Yes](https://www.flexmonster.com/doc/filter-by-value/) | [Yes](https://www.webdatarocks.com/doc/js/fields-filtering/) |
| Relative dates ("last 3 months") | [Yes](use/filters.md#quick-choices-for-dates) | [Partial: expressions](https://perspective-dev.github.io/guide/print.html) | [Not found](https://docs.kanaries.net/graphic-walker/api-reference/types) | [Not found](https://github.com/nicolaskruchten/pivottable/wiki/Parameters) | [Yes, opt-in](https://www.ag-grid.com/react-data-grid/filter-date/) | [Partial: fixed periods](https://www.flexmonster.com/doc/filter-by-condition/) | [Not found](https://www.webdatarocks.com/doc/js/fields-filtering/) |
| Dates by year, quarter, month | [Yes, as placed](use/values.md#dates-and-number-ranges) | [Partial: no quarter](https://perspective-dev.github.io/guide/print.html) | [Partial: in the spec](https://github.com/Kanaries/graphic-walker#readme) | [Partial: developer](https://github.com/nicolaskruchten/pivottable/wiki/Derived-Attributes) | [Partial: developer](https://www.ag-grid.com/react-data-grid/grouping-data/) | [Yes, set by developer](https://www.flexmonster.com/api/field-mapping-object/) | [Partial: developer](https://www.webdatarocks.com/doc/js/setting-data-types/) |
| Same month across years | [Yes](use/values.md#dates-and-number-ranges) | [Partial: expressions](https://perspective-dev.github.io/guide/print.html) | [Not found](https://docs.kanaries.net/graphic-walker/guides/chart-types) | [Partial: developer](https://github.com/nicolaskruchten/pivottable/wiki/Derived-Attributes) | [Not found](https://www.ag-grid.com/react-data-grid/grouping-data/) | [Partial](https://www.flexmonster.com/api/field-mapping-object/) | [Partial](https://www.webdatarocks.com/doc/js/setting-data-types/) |
| Show values as (% of total, rank) | [Yes, with rank](use/values.md#show-as) | [Partial](https://perspective-dev.github.io/guide/print.html) | [Not found](https://docs.kanaries.net/graphic-walker/guides/chart-types) | [Partial: % of totals](https://github.com/nicolaskruchten/pivottable/wiki/Aggregators) | [Partial (paid)](https://www.ag-grid.com/react-data-grid/aggregation-show-values-as/) | [Yes, no rank](https://www.flexmonster.com/doc/aggregation-functions/) | [Yes, no rank](https://www.webdatarocks.com/doc/js/aggregation/) |
| The rows behind a value | [Yes](use/drill-down.md) | [Partial: click event](https://perspective-dev.github.io/guide/how_to/javascript/events.html) | [Partial: whole data set](https://github.com/Kanaries/graphic-walker#readme) | [Partial: developer](https://github.com/nicolaskruchten/pivottable/wiki/Renderers) | [No, in pivot mode](https://www.ag-grid.com/react-data-grid/server-side-model-pivoting/) | [Yes](https://www.flexmonster.com/user-interface/) | [Yes, view only](https://www.webdatarocks.com/doc/js/pivot-table-js-drill-through/) |
| Download the rows behind the report | [CSV, JSON, where the host allows](use/export.md#the-table-or-the-rows-behind-it) | [Yes: the current view](https://perspective-dev.github.io/guide/print.html) | [Not found](https://github.com/Kanaries/graphic-walker#readme) | [Partial: developer](https://github.com/nicolaskruchten/pivottable/wiki/Frequently-Asked-Questions) | [Partial: not in pivot mode](https://www.ag-grid.com/react-data-grid/csv-export/) | [Yes: drill-through](https://www.flexmonster.com/user-interface/) | [Partial: view only](https://www.webdatarocks.com/doc/js/pivot-table-js-drill-through/) |
| Table and chart in one | [Yes: bars, lines, area, pie, donut, heatmap](use/charts.md#chart-types) | [Yes: 15+ types](https://perspective-dev.github.io/guide/how_to/javascript/viewer.html) | [Yes: chart first](https://docs.kanaries.net/graphic-walker/guides/chart-types) | [Partial: add-on renderers](https://github.com/nicolaskruchten/pivottable/wiki/Optional-Extra-Renderers) | [Partial (paid): own chart](https://www.ag-grid.com/react-data-grid/integrated-charts-pivot-chart/) | [Yes: 7 types](https://www.flexmonster.com/doc/flexmonster-pivot-charts/) | [Partial: other libraries](https://www.webdatarocks.com/doc/js/available-tutorials-charts/) |
| Colour scales, data bars | [Yes](use/values.md#highlight) | [Yes: gradients](https://perspective-dev.github.io/guide/print.html) | [Not found](https://docs.kanaries.net/graphic-walker/guides/chart-types) | [Partial: heatmap](https://github.com/nicolaskruchten/pivottable/wiki/Renderers) | [Partial: developer](https://www.ag-grid.com/react-data-grid/cell-styles/) | [Partial: rules only](https://www.flexmonster.com/doc/conditional-formatting/) | [Partial: rules only](https://www.webdatarocks.com/doc/js/conditional-formatting/) |
| Undo and redo | [Yes](use/views.md#undo-redo-start-over) | [Not found](https://perspective-dev.github.io/guide/print.html) | [Yes](https://docs.kanaries.net/graphic-walker/data-viz/create-data-viz) | [Not found](https://github.com/nicolaskruchten/pivottable/wiki/Frequently-Asked-Questions) | [Partial: cell edits](https://www.ag-grid.com/react-data-grid/undo-redo-edits/) | [Not found](https://www.flexmonster.com/user-interface/) | [Not found](https://www.webdatarocks.com/doc/js/field-list/) |
| Keyboard; accessibility statement | [Every action; no WCAG claim](use/keyboard.md) | [Not found](https://perspective-dev.github.io/guide/print.html) | [Not found](https://docs.kanaries.net/graphic-walker/faq) | [Not found](https://github.com/nicolaskruchten/pivottable/wiki/Frequently-Asked-Questions) | [Yes; no own claim](https://www.ag-grid.com/react-data-grid/accessibility/) | [Yes; "based on WCAG 2.1"](https://www.flexmonster.com/doc/accessibility-overview/) | [Partial: basic keys](https://www.webdatarocks.com/doc/js/technical-specifications/) |
| UI languages | [2, every text replaceable](reference/localisation.md) | [Partial: English](https://perspective-dev.github.io/guide/print.html) | [3](https://docs.kanaries.net/graphic-walker/guides/internationalization) | [15 / 1](https://github.com/nicolaskruchten/pivottable/wiki/Localization) | [46](https://www.ag-grid.com/react-data-grid/localisation/) | [13](https://www.flexmonster.com/doc/localizing-component/) | [11](https://www.webdatarocks.com/doc/js/language-localization/) |
| Save the report as JSON | [Yes; JSON Schema, migration](reference/view-file.md) | [Yes; migration](https://perspective-dev.github.io/guide/print.html) | [Yes; JSON Schema](https://github.com/Kanaries/graphic-walker#readme) | [Partial: the host keeps it](https://github.com/nicolaskruchten/pivottable/wiki/Frequently-Asked-Questions) | [Yes; migration](https://www.ag-grid.com/react-data-grid/grid-state/) | [Yes](https://www.flexmonster.com/doc/save-and-restore-report/) | [Yes](https://www.webdatarocks.com/doc/js/saving-the-report/) |
| Share as a link | [Yes](use/views.md#share-a-view) | [Partial: the app's job](https://perspective-dev.github.io/guide/print.html) | [Not found](https://docs.kanaries.net/graphic-walker/faq) | [Not found](https://github.com/nicolaskruchten/pivottable/wiki/Frequently-Asked-Questions) | [Not found](https://www.ag-grid.com/react-data-grid/grid-state/) | [Yes, with its server](https://www.flexmonster.com/doc/share-report/) | [Not found](https://www.webdatarocks.com/doc/js/saving-the-report/) |
| Excel (.xlsx) export | [Yes, layout and highlighting kept](use/export.md#what-each-one-holds) | [No](https://perspective-dev.github.io/guide/print.html) | [Not found](https://docs.kanaries.net/graphic-walker/guides/chart-export) | [No](https://github.com/nicolaskruchten/pivottable/wiki/Frequently-Asked-Questions) | [Yes (paid); styles not by default](https://www.ag-grid.com/react-data-grid/excel-export/) | [Yes, with caveats](https://www.flexmonster.com/doc/export-report/) | [Yes](https://www.webdatarocks.com/doc/js/exporting/) |
| Other files | [CSV, HTML, PNG, SVG; PDF via the print dialog](use/export.md) | [CSV, Arrow, HTML, PNG](https://perspective-dev.github.io/guide/print.html) | [CSV, SVG, PNG](https://docs.kanaries.net/graphic-walker/guides/chart-export) | [TSV](https://github.com/nicolaskruchten/pivottable/wiki/Optional-Extra-Renderers) | [CSV, print, PNG](https://www.ag-grid.com/react-data-grid/csv-export/) | [CSV, PDF, HTML, PNG](https://www.flexmonster.com/doc/export-report/) | [PDF, HTML, print](https://www.webdatarocks.com/doc/js/exporting/) |
| Reports without a browser | [Node library, CLI, REST service and MCP server](embed/index.md) | [Partial: engine in Node](https://perspective-dev.github.io/guide/print.html) | [No](https://docs.kanaries.net/graphic-walker/faq) | [No](https://github.com/nicolaskruchten/pivottable/wiki/Frequently-Asked-Questions) | [Not found](https://www.ag-grid.com/react-data-grid/excel-export/) | [Partial: a headless browser](https://www.flexmonster.com/doc/export-report/) | [Not found](https://www.webdatarocks.com/doc/js/exporting/) |
| Check saved views in CI | [validate, CLI, JSON Schema](reference/cli.md#in-ci) | [Partial: restore() checks](https://perspective-dev.github.io/guide/print.html) | [Partial: JSON Schema](https://github.com/Kanaries/graphic-walker#readme) | [Not found](https://github.com/nicolaskruchten/pivottable#readme) | [Partial: development checks](https://www.ag-grid.com/react-data-grid/dev-validation/) | [Partial: an option](https://www.flexmonster.com/doc/options/) | [Not found](https://www.webdatarocks.com/doc/js/saving-the-report/) |
| Theming with CSS variables | [Yes: `--pk-*`](reference/theming.md) | [Yes](https://perspective-dev.github.io/guide/print.html) | [Partial](https://docs.kanaries.net/graphic-walker/guides/theming) | [Partial: CSS classes](https://github.com/nicolaskruchten/pivottable/wiki/Frequently-Asked-Questions) | [Yes: `--ag-*`](https://www.ag-grid.com/react-data-grid/theming-css/) | [Partial: LESS themes](https://www.flexmonster.com/doc/customizing-appearance/) | [Partial: Less themes](https://www.webdatarocks.com/doc/js/custom-report-themes/) |
| Frameworks | [React 18, 19; web component; Node; REST and MCP](embed/index.md) | [Web component, React, Python](https://perspective-dev.github.io/guide/print.html) | [React 19, plain JS](https://docs.kanaries.net/graphic-walker/api-reference/vanilla-js) | [jQuery / React](https://github.com/plotly/react-pivottable#readme) | [JS, React, Angular, Vue](https://www.ag-grid.com/react-data-grid/compatibility/) | [JS, React, Angular, Vue, more](https://www.flexmonster.com/doc/) | [JS, React 17, Angular, Vue](https://www.npmjs.com/package/@webdatarocks/react-webdatarocks) |
| Licence | MIT | [Apache-2.0](https://github.com/perspective-dev/perspective/blob/master/LICENSE.md)¹ | [Apache-2.0](https://github.com/Kanaries/graphic-walker/blob/main/LICENSE)¹ | MIT¹ | [Paid for pivoting](https://www.ag-grid.com/license-pricing/) | [Paid](https://www.flexmonster.com/software-license-agreement/)¹ | [Free, proprietary](https://www.webdatarocks.com/license-agreement/)¹ |

## At a glance

Licence, release, where the pivot is computed and how many rows each project's own docs name. Checked
on 2026-11-12 (Flexmonster and WebDataRocks again on 2026-11-13); the releases again on 2026-11-14 on
npm and GitHub. Their words are quoted in [each in detail](#each-in-detail). The Frameworks column and "in the browser" are from the pages linked in the same row and in each in detail, not linked cell by cell.

| | Licence | Latest release | Where the pivot is computed | Rows its docs name | Frameworks | Excel (.xlsx) export |
| --- | --- | --- | --- | --- | --- | --- |
| **pivotkit** | MIT | 0.5.0 on 2026-11-13 | JavaScript on the page; the engine also in Node | [Measured up to 1,000,000](concepts/limits.md#measured-in-the-browser) (Apple M4, 16 GB) | React 18 and 19, web component, Node | [Native, of the pivoted view](use/export.md) |
| [Perspective](https://perspective-dev.github.io/) | [Apache-2.0](https://github.com/perspective-dev/perspective/blob/master/LICENSE.md) | [5.9.1 on 2026-11-12](https://github.com/perspective-dev/perspective/releases/tag/v5.9.1) (`@perspective-dev/*`) | [WebAssembly in a Web Worker, or on a server; also SQL engines](https://perspective-dev.github.io/guide/use_cases/large_datasets.md) | ["Millions of rows is routine; tens of millions is practical for narrow numeric tables"](https://perspective-dev.github.io/guide/use_cases/large_datasets.md) | Web component, React, Python, Node, Rust | [None built in](https://perspective-dev.github.io/guide/FAQ.md); CSV, Arrow, HTML |
| [Graphic Walker](https://docs.kanaries.net/graphic-walker) | [Apache-2.0](https://github.com/Kanaries/graphic-walker/blob/main/LICENSE) | [0.6.0 on 2026-11-12](https://github.com/Kanaries/graphic-walker/releases/tag/v0.6.0) | [Web workers; DuckDB WASM or your server optional](https://docs.kanaries.net/graphic-walker/guides/computation) | [100K-1M "Usable", above 1M on a server](https://docs.kanaries.net/graphic-walker/faq) | React 19, plain JS mount functions | Not found; [SVG, PNG](https://docs.kanaries.net/graphic-walker/guides/chart-export), CSV |
| [PivotTable.js](https://pivottable.js.org/) / [react-pivottable](https://github.com/plotly/react-pivottable) | MIT | [2.23.0 on 2018-11-04](https://github.com/nicolaskruchten/pivottable/releases/tag/v2.23.0) / [0.11.1 on 2026-03-13](https://github.com/plotly/react-pivottable/releases/tag/v0.11.1) | JavaScript in the browser | ["up to around a hundred thousand records"](https://github.com/nicolaskruchten/pivottable#readme) | jQuery and jQuery UI / React | Not found; TSV renderer; [open request](https://github.com/plotly/react-pivottable/issues/168) |
| [AG Grid Enterprise](https://www.ag-grid.com/react-data-grid/pivoting/) | [Paid licence](https://www.ag-grid.com/javascript-data-grid/community-vs-enterprise/) for pivoting; Community is MIT | [36.3.0 on 2026-11-04](https://github.com/ag-grid/ag-grid/releases/tag/release-36.3.0) | In the browser, or [on a server](https://www.ag-grid.com/react-data-grid/server-side-model-pivoting/) | [Client-side "100k+ rows"](https://www.ag-grid.com/react-data-grid/row-models/) | JavaScript, React, Angular, Vue | [Yes](https://www.ag-grid.com/react-data-grid/excel-export/) (Enterprise) |
| [Flexmonster](https://www.flexmonster.com/doc/) | [Paid licence](https://www.flexmonster.com/pivot-table-editions-and-pricing/), 30-day trial | [2.9.142](https://www.flexmonster.com/doc/release-notes/) (npm 2.9.142-1 on 2026-11-03) | Mainly in the browser; server options | ["up to 1 million rows of grouped data"](https://www.flexmonster.com/doc/introduction/) (vendor statement) | JavaScript, React, Angular, Vue and more | [Yes](https://www.flexmonster.com/doc/export-report/), with caveats |
| [WebDataRocks](https://www.webdatarocks.com/doc/js/intro/) | Free, [proprietary licence](https://www.webdatarocks.com/license-agreement/): 1 MB data limit, logo required | [1.4.23 on 2026-04-13](https://www.npmjs.com/package/@webdatarocks/webdatarocks) (`@webdatarocks/webdatarocks`) | In the browser | [1 MB of data](https://www.webdatarocks.com/license-agreement/) (licence) | JavaScript, React, Angular, Vue | [Yes](https://www.webdatarocks.com/doc/js/exporting/) |

## Where others are stronger

- **More rows in the browser**: [Perspective](https://perspective-dev.github.io/guide/use_cases/large_datasets.md)
  computes in C++ compiled to WebAssembly in a Web Worker, so the page stays responsive, and names
  millions of rows as routine; it also streams updates and runs the same engine on a server or as
  SQL against DuckDB, ClickHouse, PostgreSQL and Polars. Its `restore()` checks a saved config and
  `migrate()` updates old ones. pivotkit computes on the page: at 1,000,000 rows the first table
  takes 1 to 2.5 s on an Apple M4 and the page is frozen meanwhile
  ([measured](concepts/limits.md#measured-in-the-browser)).
- **Charts**: Perspective draws more than 15 chart types with WebGL; Graphic Walker is a chart
  builder first (Vega-Lite). pivotkit draws bars, lines, area, pie, donut and heatmap
  ([charts](use/charts.md)).
- **A full data grid**: AG Grid is a data grid with several row models,
  [server-side pivoting](https://www.ag-grid.com/react-data-grid/server-side-model-pivoting/) and an
  [Excel import](https://www.ag-grid.com/react-data-grid/excel-import/) by drag and drop; pivotkit is a
  pivot report, not a grid.
- **Languages and data sources**: AG Grid ships 46 locales, Flexmonster localization files for 13
  languages, WebDataRocks 11; Flexmonster connects to Microsoft Analysis Services, SQL databases,
  MongoDB and Elasticsearch. pivotkit ships English and German, every text replaceable
  ([localisation](reference/localisation.md)).
- **Raw rows and accessibility in Flexmonster**: its drill-through view lists the records behind a
  value and exports them, and its [accessibility page](https://www.flexmonster.com/doc/accessibility-overview/)
  says it follows guidelines based on WCAG 2.1 and Section 508, with a high-contrast theme.
- **Files people bring**: Graphic Walker lets people upload a CSV or JSON file, preview it and set each
  column's role; top N and an Excel export were not found in its docs.
- **Size**: PivotTable.js's core is 6.3 KB gzip by its README, without charts. pivotkit's web
  component loads about 172 KiB gzip first, with React inside, and the chart's code (about 216 KiB
  gzip, ECharts with it) on the first chart (measured with `npm run size -w pivotkit-element` on
  2026-11-14; [bundle size](reference/element.md#bundle-size)); Graphic Walker's FAQ names about
  1.5 MB minified, roughly 400 KB gzip, with Vega-Lite.
- **Maturity and support**: AG Grid, Flexmonster and WebDataRocks are commercial products with vendor
  support and years in production, Perspective and PivotTable.js have long track records; pivotkit
  is in 0.x (the version and date are in the table above) and its API can still change between minor
  versions.
- **Calculated values and more chart types**: Flexmonster has calculated values with a formula
  editor and charts such as scatter and column-line combinations; pivotkit has neither.

## What pivotkit does not do

- The report does not fetch data and makes no network request: the host passes the rows, or a person
  loads a file of their own in the browser where the host allows it (`allowImport`, off by default;
  [FAQ](faq.md#my-data-is-on-a-server-does-pivotkit-fetch-it)). The command line reads local files
  only; the REST service and the MCP server, which an operator runs, read the files their
  configuration names and answer requests.
- It is not access control: a viewer can see every row the host passes, and with Source data
  (`exportData`, off by default) download them ([security](security.md#pivotkit-is-not-access-control)).
- The report computes on the page, not in WebAssembly or a worker, and has no server row model or streaming
  updates. For more than a million rows, aggregate on the server first
  ([more than a million rows](concepts/limits.md#more-than-a-million-rows)).
- It is a pivot report, not a data grid or a dashboard tool: no editing of cells, no calculated
  fields from formulas, no dashboards of several reports.
- No conformance level of WCAG is claimed, and it ships two UI languages.

## Each in detail

??? info "Perspective"

    - Packages `@perspective-dev/*` (5.9.1 on 2026-11-12; `@finos/perspective*` stopped at 3.8.0 in
      2025); the React wrapper `@perspective-dev/react` accepts React `>17 <20`. Member project of
      the OpenJS Foundation.
    - Pivot: group by (rows, with subtotals), split by (columns), many aggregates, expressions,
      date buckets; drag and drop in its column list. Top N: not found in its docs.
    - Export: the viewer downloads the current view as CSV or Arrow; `export()` gives CSV, Arrow and
      HTML, a chart as PNG. Its [FAQ](https://perspective-dev.github.io/guide/FAQ.md): "Perspective
      does not have built-in Excel export."
    - Saved views: `save()` and `restore()` as a JSON config; `restore()` rejects keys the format
      does not define, `migrate()` updates configs since 2.0.0.
    - Loading a file in the viewer and an accessibility statement: not found in its guide.
    - It publishes `llms.txt` and `llms-full.txt` for its docs.

??? info "Graphic Walker"

    - A Tableau-like React component: drag fields onto shelves for rows, columns, colour and more.
      0.6.0 needs React 19 (`react >=19.0.0`) and adds nested row and column headers, aggregate
      filters and a CSV, SVG and PNG export of the worksheet.
    - Its README: "upload your Data(csv/json) file, preview your data, and define the analytic type of
      columns (dimension or measure)".
    - Pivot: a `PivotTable` component is exported from the package and named in the 0.6.0 release
      notes; not found in its README or docs site.
    - Rows ([FAQ](https://docs.kanaries.net/graphic-walker/faq)): under 10K excellent, 10K-100K good,
      100K-1M usable, above 1M server-side computation; it "requires a browser environment for
      rendering".
    - Saved charts: a JSON spec, with a JSON Schema for its TerseSpec format. UI languages: English,
      Chinese, Japanese, and your own.
    - Subtotals, top N, .xlsx export and an accessibility statement: not found in its README or docs.

??? info "PivotTable.js and react-pivottable"

    - PivotTable.js needs jQuery and jQuery UI; its last commit is from 2024-01-06. react-pivottable
      0.11.1 (2026-03-13) updated a dependency for React 19; the release before it is from 2020-11-19.
    - Drag and drop UI for rows and columns, one aggregator at a time, derived attributes (a date
      format deriver), table, heatmap and chart renderers (Plotly, C3, D3, Google Charts). Subtotals
      come from a third-party renderer named in its wiki. PivotTable.js has 14 locale packs besides
      English; react-pivottable none.
    - Its [FAQ](https://github.com/nicolaskruchten/pivottable/wiki/Frequently-Asked-Questions):
      "PivotTable.js is designed to be a browser-side component"; export is out of scope, with a TSV
      renderer to copy into Excel.
    - Open requests in react-pivottable: [Excel and PDF export](https://github.com/plotly/react-pivottable/issues/168),
      [click events](https://github.com/plotly/react-pivottable/issues/40).

??? info "AG Grid Enterprise"

    - Pivot mode, row groups and aggregation with a side bar and pivot panel; pivoting, the Excel
      export, the Excel import and integrated charts are Enterprise features.
    - Grid state, the pivot among it, saves as a JSON object with a version and converts old state
      ([grid state](https://www.ag-grid.com/react-data-grid/grid-state/)).
    - In pivot mode "it is not possible to drill all the way down the leaf levels"
      ([server-side pivoting](https://www.ag-grid.com/react-data-grid/server-side-model-pivoting/)).
    - Excel export: groups and merged header groups; "Cell styles will NOT be exported by default".
    - Its [accessibility page](https://www.ag-grid.com/react-data-grid/accessibility/) describes a
      WCAG and ARIA approach; a conformance claim was not found there.

??? info "Flexmonster"

    - Paid licences for a company, SaaS and OEM; a trial of at most 30 days, watermarked, for
      evaluation only (clause 3.1.1 of its
      [licence agreement](https://www.flexmonster.com/software-license-agreement/), "Last updated:
      October 15, 2026").
    - Rows: "you can load more than 1GB of data and display up to 1 million rows of grouped data"
      ([introduction](https://www.flexmonster.com/doc/introduction/)).
    - [Export](https://www.flexmonster.com/doc/export-report/) to PDF, Excel, CSV, HTML and image,
      with caveats: "A node is not included in the exported file if its parent nodes are collapsed",
      and "the chart view or the grid and charts view can be exported only to PDF, HTML, or an image".
      Without a browser it recommends a headless browser (Puppeteer).
    - People load a local CSV or JSON file through Connect; Excel is not listed.
    - UI languages: localization files for 13 languages ship with it
      ([localizing](https://www.flexmonster.com/doc/localizing-component/)); data from Microsoft
      Analysis Services, SQL databases, MongoDB and Elasticsearch, some through its own server tools
      ([data sources](https://www.flexmonster.com/doc/supported-data-sources/)).
    - Reports save as a JSON object
      ([save and restore](https://www.flexmonster.com/doc/save-and-restore-report/)).
    - [Accessibility](https://www.flexmonster.com/doc/accessibility-overview/): "Flexmonster follows
      accessibility guidelines based on WCAG 2.1 and Section 508 standards"; no conformance level or
      audit named there.
    - Wrappers on npm: `react-flexmonster` for React 17 to 19, `ngx-flexmonster` for Angular 12 or
      later, and `vue-flexmonster`.

??? info "WebDataRocks"

    - Free of charge but not open source. Its [licence](https://www.webdatarocks.com/license-agreement/)
      (revision date October 20, 2026) forbids to "change, remove, disable, circumvent,
      or modify any: limitations included in Proprietary Code, including the 1 MB limitation on the
      data size loaded to WebDataRocks" and any "proprietary notice, copyright notice or label (e.g.,
      WebDataRocks logo and/or "WebDataRocks.com" text displayed when the WebDataRocks reporting tool
      is running)".
    - Packages: `@webdatarocks/webdatarocks` 1.4.23 (2026-04-13); the unscoped `webdatarocks` and
      `react-webdatarocks` (1.4.9, 2023-10-19) are deprecated. The React wrapper
      `@webdatarocks/react-webdatarocks` still declares React `^17.0.1`; React 18 and 19 are not
      mentioned in its docs.
    - [Export](https://www.webdatarocks.com/doc/js/exporting/) "to a file in which format is the most
      convenient for you – PDF, Excel or HTML. Besides, you can print it as well."
    - People load a local CSV or JSON file from the toolbar; the drill-through view is view-only.
    - Charts: its docs describe integrations with amCharts, Highcharts, Google Charts and
      FusionCharts; charts of its own were not found.

??? info "pivotkit"

    - Subtotals and grand totals, aggregations with "show values as", date grouping, filters with
      relative date ranges and top N, drill-down, undo and redo ([feature list](features.md)).
    - Loading a CSV, JSON or Excel file in the report, with a preview, a type per column and a sheet
      picker, where the host allows it ([load your own data](use/load-data.md)); the rows behind the
      report as CSV or JSON, where the host allows it
      ([the table or the rows](use/export.md#the-table-or-the-rows-behind-it)).
    - Views: versioned JSON with a published [JSON Schema](reference/view-file.md), shared as a file,
      as JSON or as a link; rendered without a browser by [pivotkit-report](reference/report.md) and
      the [command line](reference/cli.md), which also checks them in CI.
    - Keyboard and screen readers: every action by keyboard and by a menu
      ([keyboard](use/keyboard.md)); no conformance level is claimed.

## How this page was made

Each fact comes from the project's own documentation, its npm entry or its GitHub repository,
linked in the table, and was checked on the date given; a page that only summarised itself to the
tool that read it (Flexmonster's site refuses plain downloads) is no less linked, but worth a second
look in a browser. Prices are left out; the licence links lead to them. The comparison on 2026-11-06
also covered, among others, MUI X Premium, Syncfusion, DevExtreme, Handsontable, RevoGrid and Univer
(pivoting only in a paid edition), TanStack Table, Tabulator and Glide (no pivot UI), DuckDB-WASM and
Arquero (engines without a UI), and Orb and Voyager; these were not checked again for this page.
Corrections are welcome as an [issue](https://github.com/eizedev/pivotkit/issues).

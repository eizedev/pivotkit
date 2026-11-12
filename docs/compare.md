---
title: Compared with other pivot components
description: How pivotkit compares with Perspective, Graphic Walker, PivotTable.js and react-pivottable, AG Grid Enterprise, Flexmonster and WebDataRocks - licence, where the data is computed, rows, frameworks, Excel export, saved views - with sources and the date each fact was checked.
---

# Compared with other pivot components

What pivotkit offers, in short:

- **For the people who build reports**: a pivot table that works like Excel's PivotTable in the
  browser. Drag or click fields into Rows, Columns, Values and Filters, switch between table and
  chart, and export to Excel with the layout kept: merged headers, totals, number formats and
  highlighting ([Use a report](use/index.md)).
- **For developers**: free under MIT; one React component for React 18 and 19, a web component for
  pages without React, and the engine alone for the browser or Node. The whole report is a small JSON
  view with a published JSON Schema; a view is checked as untrusted input and cannot run code
  ([security](security.md)). Measured up to 1,000,000 rows in three browsers
  ([measured in the browser](concepts/limits.md#measured-in-the-browser)).

## The short answer

When we compared 25 options on 2026-11-06 (pivot tables, data grids with a pivot mode, chart
builders, embeddable BI and in-browser engines), we found no free component that offers all of these:

1. a field list that people without technical knowledge can use,
2. pivot with a switch between table and chart,
3. views stored as JSON,
4. native Excel (.xlsx) export of the pivoted view,
5. React 18.

These are pivotkit's criteria, the reasons it was built; other projects choose differently. The two
closest, re-checked on 2026-11-12:

- **Perspective** lacks a built-in Excel export (its FAQ says so), and its settings panel is aimed
  at analysts, where pivotkit aims at people who know Excel.
- **Graphic Walker** needs React 19 (0.6.0), no Excel export was found in its docs, and it is
  chart-first: a pivot table component exists in its source and release notes but is not described
  in its README or docs site.

Where others are better: Perspective handles far more rows in the browser through WebAssembly and
streams live data; Graphic Walker and Perspective draw many more chart types; AG Grid is a full data
grid with server-side pivoting; Flexmonster ships 13 UI languages and connects to server data
sources. See [where others are stronger](#where-others-are-stronger).

## At a glance

Checked on 2026-11-12 in each project's own documentation, npm and GitHub. "Not found" means not
found in the pages linked, on that date; it is not proof of absence.

| | Licence | Latest release | Where the pivot is computed | Rows its docs name | Frameworks | Excel (.xlsx) export |
| --- | --- | --- | --- | --- | --- | --- |
| **pivotkit** | MIT | 0.4.0 on 2026-11-11 | JavaScript on the page; the engine also in Node | [Measured up to 1,000,000](concepts/limits.md#measured-in-the-browser) | React 18 and 19, web component, Node | [Native, of the pivoted view](use/export.md) |
| [Perspective](https://perspective-dev.github.io/) | [Apache-2.0](https://github.com/perspective-dev/perspective/blob/master/LICENSE.md) | [5.9.1 on 2026-11-12](https://github.com/perspective-dev/perspective/releases/tag/v5.9.1) | [WebAssembly in a Web Worker, or on a server; also SQL engines](https://perspective-dev.github.io/guide/use_cases/large_datasets.md) | ["Millions of rows is routine"](https://perspective-dev.github.io/guide/use_cases/large_datasets.md) | Web component, React, Python, Node, Rust | [None built in](https://perspective-dev.github.io/guide/FAQ.md); CSV, Arrow, HTML |
| [Graphic Walker](https://docs.kanaries.net/graphic-walker) | [Apache-2.0](https://github.com/Kanaries/graphic-walker/blob/main/LICENSE) | [0.6.0 on 2026-11-12](https://github.com/Kanaries/graphic-walker/releases/tag/v0.6.0) | [Web workers; DuckDB WASM or your server optional](https://docs.kanaries.net/graphic-walker/guides/computation) | [100K-1M "Usable", above 1M on a server](https://docs.kanaries.net/graphic-walker/faq) | React 19, plain JS mount functions | Not found; [SVG, PNG](https://docs.kanaries.net/graphic-walker/guides/chart-export), CSV |
| [PivotTable.js](https://pivottable.js.org/) / [react-pivottable](https://github.com/plotly/react-pivottable) | MIT | [2.23.0 on 2018-11-04](https://github.com/nicolaskruchten/pivottable/releases/tag/v2.23.0) / [0.11.1 on 2026-03-13](https://github.com/plotly/react-pivottable/releases/tag/v0.11.1) | JavaScript in the browser | ["up to around a hundred thousand records"](https://github.com/nicolaskruchten/pivottable#readme) | jQuery and jQuery UI / React | Not found; TSV renderer; [open request](https://github.com/plotly/react-pivottable/issues/168) |
| [AG Grid Enterprise](https://www.ag-grid.com/react-data-grid/pivoting/) | [Paid licence](https://www.ag-grid.com/javascript-data-grid/community-vs-enterprise/) for pivoting; Community is MIT | [36.3.0 on 2026-11-04](https://github.com/ag-grid/ag-grid/releases/tag/release-36.3.0) | In the browser, or [on a server](https://www.ag-grid.com/react-data-grid/server-side-model-pivoting/) | [Client-side "100k+ rows"](https://www.ag-grid.com/react-data-grid/row-models/) | JavaScript, React, Angular, Vue | [Yes](https://www.ag-grid.com/react-data-grid/excel-export/) (Enterprise) |
| [Flexmonster](https://www.flexmonster.com/doc/) | [Paid licence](https://www.flexmonster.com/pivot-table-editions-and-pricing/), 30-day trial | [2.9.142](https://www.flexmonster.com/doc/release-notes/) (npm 2026-11-02) | Mainly in the browser; server options | About 1 million rows of grouped data (vendor statement) | JavaScript, React, Angular, Vue and more | [Yes](https://www.flexmonster.com/doc/export-report/), with caveats |
| [WebDataRocks](https://www.webdatarocks.com/doc/js/intro/) | Free, [proprietary licence](https://www.webdatarocks.com/license-agreement/): 1 MB data limit, logo required | [1.4.9 on 2023-10-19](https://www.npmjs.com/package/webdatarocks) | In the browser | 1 MB of data (licence) | JavaScript, React, Angular, Vue | [Yes](https://www.webdatarocks.com/doc/js/exporting/) |

## Where others are stronger

- **More rows in the browser**: [Perspective](https://perspective-dev.github.io/guide/use_cases/large_datasets.md)
  computes in C++ compiled to WebAssembly in a Web Worker, so the page stays responsive, and names
  millions of rows as routine; it also streams updates and runs the same engine on a server or as
  SQL against DuckDB, ClickHouse, PostgreSQL and Polars. pivotkit computes on the page: at 1,000,000
  rows the first table takes 1 to 2.5 s and the page is frozen meanwhile
  ([measured](concepts/limits.md#measured-in-the-browser)).
- **Charts**: Perspective draws more than 15 chart types with WebGL; Graphic Walker is a chart
  builder first (Vega-Lite). pivotkit draws bars, lines, area, pie, donut and heatmap
  ([charts](use/charts.md)).
- **A full data grid**: AG Grid is a data grid with several row models and
  [server-side pivoting](https://www.ag-grid.com/react-data-grid/server-side-model-pivoting/);
  pivotkit is a pivot report, not a grid.
- **Languages and data sources**: Flexmonster ships localization files for 13 languages and connects
  to Microsoft Analysis Services; AG Grid ships many locales. pivotkit ships English and German, every
  text replaceable ([localisation](reference/localisation.md)).
- **Size**: PivotTable.js's core is 6.3 KB gzip by its README, without charts. pivotkit's web
  component loads under 170 KiB gzip first, with React inside, and ECharts (204 KiB gzip) on the first
  chart ([bundle size](reference/element.md#bundle-size)); Graphic Walker's FAQ names about 400 KB
  gzip.

## What pivotkit does not do

- It does not fetch data and makes no network request: the host passes the rows
  ([FAQ](faq.md#my-data-is-on-a-server-does-pivotkit-fetch-it)).
- It is not access control: a viewer can see every row the host passes ([security](security.md#pivotkit-is-not-access-control)).
- It computes on the page, not in WebAssembly or a worker, and has no server row model or streaming
  updates. For more than a million rows, aggregate on the server first
  ([more than a million rows](concepts/limits.md#more-than-a-million-rows)).
- It is a pivot report, not a data grid or a dashboard tool.

## Each in detail

??? info "Perspective"

    - Packages `@perspective-dev/*` (formerly `@finos/perspective*`); the React wrapper
      `@perspective-dev/react` accepts React `>17 <20`. Member project of the OpenJS Foundation.
    - Pivot: group by (rows, with subtotals), split by (columns), many aggregates, expressions,
      date buckets; drag and drop in its column list. Top N: not found in its docs.
    - Export: the viewer downloads CSV or Arrow; `export()` gives CSV, Arrow and HTML, a chart as PNG.
      Its [FAQ](https://perspective-dev.github.io/guide/FAQ.md): "Perspective does not have built-in
      Excel export."
    - Saved views: `save()` and `restore()` as a JSON config
      ([save and restore](https://perspective-dev.github.io/guide/how_to/javascript/save_restore.md)).
    - Accessibility statement and bundle size: not found in its docs.
    - It publishes `llms.txt` and `llms-full.txt` for its docs.

??? info "Graphic Walker"

    - A Tableau-like React component: drag fields onto shelves for rows, columns, colour and more.
      0.6.0 needs React 19 (`react >=19.0.0`) and adds nested row and column headers and a CSV, SVG
      and PNG export of the worksheet.
    - Pivot: a `PivotTable` component is exported from the package and named in the 0.6.0 release
      notes; not found in its README or docs site.
    - Rows ([FAQ](https://docs.kanaries.net/graphic-walker/faq)): under 10K excellent, 10K-100K good,
      100K-1M usable, above 1M server-side computation.
    - Saved charts: a JSON spec. UI languages: English, Chinese, Japanese, and your own.
    - Subtotals, top N, .xlsx export and an accessibility statement: not found in its README or docs.

??? info "PivotTable.js and react-pivottable"

    - PivotTable.js needs jQuery and jQuery UI; its last commit is from 2024-01-06. react-pivottable
      0.11.1 (2026-03-13) updated a dependency for React 19; the release before it is from 2020-11-19.
    - Drag and drop UI, aggregators, derived attributes (a date format deriver), table, heatmap and
      chart renderers (Plotly, C3, D3, Google Charts). Subtotals come from a third-party renderer named
      in its wiki.
    - Open requests in react-pivottable: [Excel and PDF export](https://github.com/plotly/react-pivottable/issues/168),
      [click events](https://github.com/plotly/react-pivottable/issues/40).
    - Native .xlsx, top N and an accessibility statement: not found in its README or wiki.

??? info "AG Grid Enterprise"

    - Pivot mode, row groups and aggregation with a side bar and pivot panel; pivoting, the Excel
      export and integrated charts are Enterprise features.
    - Grid state, the pivot among it, saves as a JSON object
      ([grid state](https://www.ag-grid.com/react-data-grid/grid-state/)).
    - Whether the pivoted layout survives the Excel export is not stated on its Excel export page.
    - Its [accessibility page](https://www.ag-grid.com/react-data-grid/accessibility/) describes a
      WCAG and ARIA approach; a conformance claim was not found there.

??? info "Flexmonster"

    - Paid licence types for companies, SaaS and OEM; a 30-day trial with all features and a
      watermark. Its licence agreement was revised, effective 2026-10-15.
    - Export to PDF, Excel, CSV, HTML and image; its export page names caveats, for example the
      children of a collapsed row are not exported.
    - Reports save as a JSON object
      ([save and restore](https://www.flexmonster.com/doc/save-and-restore-report/)).
    - [Accessibility](https://www.flexmonster.com/doc/accessibility-overview/): based on WCAG 2.1 and
      Section 508; no conformance level or audit named there.
    - Wrappers for React 17 to 19, Angular and Vue on npm.

??? info "WebDataRocks"

    - Free of charge but not open source: its [licence](https://www.webdatarocks.com/license-agreement/)
      forbids removing the 1 MB limit on the data loaded and hiding its logo.
    - Export to PDF, Excel and HTML, and printing.
    - Its features beyond these were not checked for this page.

??? info "pivotkit"

    - Subtotals and grand totals, aggregations with "show values as", date grouping, filters with
      relative date ranges and top N, drill-down, undo and redo ([feature list](features.md)).
    - Views: versioned JSON with a published [JSON Schema](reference/view-file.md), shared as a file,
      as JSON or as a link.
    - Keyboard and screen readers: every action by keyboard and by a menu
      ([keyboard](use/keyboard.md)); no conformance level is claimed.

## How this page was made

Each fact comes from the project's own documentation, its npm entry or its GitHub repository,
linked in the table, and was checked on the date given. Prices are left out; the licence links lead
to them. The comparison of 25 options on 2026-11-06 also covered MUI X Premium, Syncfusion,
DevExtreme, Handsontable, RevoGrid and Univer (pivoting only in a paid edition), TanStack Table,
Tabulator and Glide (no pivot UI), DuckDB-WASM and Arquero (engines without a UI), and Orb and
Voyager; these were not checked again for this page. Corrections are welcome as an
[issue](https://github.com/eizedev/pivotkit/issues).

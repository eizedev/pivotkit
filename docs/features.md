---
title: Feature list
description: Every feature of pivotkit at a glance, grouped by area, each with a link to the page that describes it in full.
---

# Feature list

Every feature of pivotkit at a glance. Each row links to the page that describes it with all its
small behaviours; the [start page](index.md) has the short version.

## For the people who build reports

| Area | Features | Details |
| --- | --- | --- |
| <span id="zones-and-fields"></span>Fields and zones | Rows, Columns, Values, Filters; drag, click or a menu; field types with icons; field search; descriptions with an "i"; chips that show their filter, top N and sort; Swap rows and columns | [Fields, zones and the table](use/fields.md) |
| <span id="table"></span>Table | Subtotals and grand totals, expand and collapse, sticky headers, long labels that wrap, fast from 300 rows on | [The table](use/fields.md#the-table) |
| <span id="values"></span>Values | Sum, count, average, median, minimum, maximum, distinct count, statistics, first and last; show as shares, differences, running totals, ranks; number formats; colour scales and data bars; a name of your own | [Values and formats](use/values.md) |
| <span id="dates"></span>Dates and ranges | Dates grouped as they are placed, along the time line or across years; numbers into ranges | [Dates and number ranges](use/values.md#dates-and-number-ranges) |
| <span id="filters"></span>Filters | Values with row counts, search, Only; quick choices for dates in a unit (this, last N with or without the current period; next N, before the last N and rolling under More choices) that stay right over time, This only with data behind it, counted back from today, the latest or first record or a date; the years a month-of-the-year grouping combines; a summary that says what shows and why not the rest; rules on the item itself ("from 2022"), its total and its name ("does not begin with"), all together, each with its explanation and what it keeps; items without a value kept with the rules; the same menu in Filters; top or bottom N within groups, with ties; filters that remember what was left out | [Filters, top N and sorting](use/filters.md) |
| Sorting | By label, by any value, in a custom order; a click on a header sorts | [Sorting](use/filters.md#sorting) |
| <span id="chart"></span>Chart | Automatic type; bars, stacked and horizontal bars, lines, area, pie, donut, heatmap; value labels, legend, title, smooth lines, axis and group labels; tooltip; tips that suggest a better type | [Charts](use/charts.md) |
| <span id="drill-down"></span>Drill-down | The rows behind a value or a chart mark; enlarge; copy, copy as JSON, CSV and Excel | [The rows behind a number](use/drill-down.md) |
| <span id="saved-views"></span>Undo and views | Undo, redo, Start over (Reset, New: an empty report); the view's name in the toolbar with a dot for unsaved changes; Save with one click, Save as with a question before a view is replaced; shared views and my views; delete, publish; views kept in the browser | [Views, saving and sharing](use/views.md), [save your changes](use/views.md#save-your-changes) |
| <span id="sharing"></span>Sharing | Copy link, copy view as JSON, download a view file, open a view file; a check before a view for other data | [Share a view](use/views.md#share-a-view), [open a view file](use/views.md#open-a-view-file) |
| <span id="export"></span>Export | Excel with formats and highlighting, CSV safe to open, chart image, copy table, copy data as JSON; greyed out for an empty report | [Export and copy](use/export.md) |
| <span id="toolbar-and-layout"></span>Room and small screens | Field rail, Enlarge, Full screen; drawer and bottom sheets on a phone; zones folded into one line in a low report; More for the buttons the room left cannot hold | [Small screens, menus and tips](use/layout.md) |
| <span id="tips"></span>Menus and help | Chip menus and Options in levels: a first level that says what each topic holds, a level of its own per topic with Back, every choice at once, a search over all levels; Views, Chart type and Export as flat lists, Save as and Share in levels of their own; an "i" for each setting that needs it; an × in every text field; tips one at a time; Keyboard shortcuts | [Menus](use/layout.md#menus-and-text-fields), [tips](use/layout.md#tips) |
| Messages | Greyed-out entries that say why; status messages; a warning in plain words for parts of a view that could not be used; what the report shows when it cannot show a result | [Behaviour reference](use/behaviour.md) |
| <span id="accessibility"></span>Keyboard and screen readers | Every action by keyboard and by a menu; the field list as one Tab stop; chips moved with the keys; the table by arrow keys; text alternative of the chart; focus kept on purpose; 44 px touch targets | [Keyboard and screen readers](use/keyboard.md) |
| <span id="languages"></span><span id="theming"></span>Languages and themes | English and German, numbers and dates in the language; light and dark | [In German](use/layout.md#in-german), [Theming](reference/theming.md) |
| Real data to learn with | Weather, countries, earthquakes, Nobel laureates, software end of life, each with questions to answer | [Learn with real data](learn.md), [live demo](demo.md) |

## For developers

| Area | Features | Details |
| --- | --- | --- |
| Packages | `pivotkit-react` (`<PivotReport>`, React 18 and 19), `pivotkit-element` (`<pivot-report>`, its own React in a shadow root), `pivotkit-core` (the engine, browser and Node), `pivotkit-xlsx` (a plugin that reads Excel workbooks) | [Embed pivotkit](embed/index.md), [Plugins](reference/plugins.md) |
| <span id="data"></span>Data | Plain objects or one array per column, typed columns, case-insensitive names, wall-clock dates in `timeZone`, numbers sent as text (`inferNumbers`), `dataKey`, `encoded`, `loading` | [pivotkit-core](reference/core.md#data), [React props](reference/react.md#props) |
| <span id="loading-files"></span>Loading files | CSV, TSV, text and JSON read in the browser (encodings, separators, title blocks, German and English numbers, dates, leading zeros); Excel with the pivotkit-xlsx plugin; limits before parsing, notes for what changed, types changed without reading again; reader plugins; in the report with `allowImport`: the Data menu, a file dropped onto the report, a preview with a type per column, a worker for CSV and JSON, Undo and Back to original data, views per file, `onDataLoad`; columnar `data` | [Load your own data](use/load-data.md), [Loading files](reference/import.md), [Plugins](reference/plugins.md), [React props](reference/react.md#prop-allowimport) |
| The view | Plain JSON, controlled or not, normalized against the data, versioned; JSON Schemas built from the engine's tables; `validate` with errors, warnings and "did you mean" hints; `describeSource` and `describeView` for logs, approvers and LLMs | [Views and saved views](concepts/views.md) |
| Templates | `templates` in two groups by `scope`; `onSaveTemplate`, `onDeleteTemplate`, `onPublishTemplate` with `canPublish` (Save and Save as replace by name); `templateStore="browser"`; `x-pivotkit-views` in an OpenAPI document; `parseTemplates` | [Templates and shared views](concepts/templates.md) |
| <span id="sharing"></span>Sharing | View files with a JSON Schema (`toViewFile`, `fromViewFile`, `schemaUrl`); links in the URL fragment (`shareLink`), capped, with a data source reference (`readViewLink`); views from outside with tighter limits (`outsideLimits`); `source`, `sources`, `onSourceSwitch`; `persistView="session"` | [Sharing and keeping a view](concepts/sharing.md), [view file format](reference/view-file.md) |
| <span id="field-descriptions"></span>Fields | Labels, descriptions, links, aggregator, format, order per field (`fieldDefaults`), also from a JSON Schema or OpenAPI document | [Field descriptions and names](concepts/fields.md) |
| Values, dates, filters | The view's keys for aggregators, show as, formats, derived fields, filters (one shape with `not` and `blanks`: items, blanks, text with case and whitespace folding, comparisons by precision, relative ranges in hours to years, top N with ties, value conditions) and sorts; view version 2, with every version-1 view migrated | [Values](concepts/values.md), [dates](concepts/dates.md), [filters](concepts/filters.md) |
| <span id="chart"></span>Chart | The view's `chart` settings, `autoChartType`, `chartOptions` as checked plain JSON | [Charts](concepts/charts.md) |
| Drill-down and export | `drillDown`, `drillDownLimit`, `onCellClick`; `fileName`; every file and copy through `onExport` | [React props](reference/react.md#props) |
| Tips and help | `tips`, `storageKey`, `dismissedTips`, `onTipDismiss`, `fieldInfo`, `zoneInfo`, `settingInfo` | [Tips](reference/react.md#tips), [React props](reference/react.md#props) |
| Layout | `height`, `grow`, `fieldList`, width classes, least heights, Enlarge and Full screen | [Layout](reference/react.md#layout) |
| Look and language | `--pk-*` tokens, light and dark, `theme`; every text replaceable (`labels`), `locale` | [Theming](reference/theming.md), [Localisation](reference/localisation.md) |
| <span id="props-and-attributes"></span>Web component | Attributes, properties, `pivot-*` events with `respondWith()`, styles through tokens, bundle size, CSP | [pivotkit-element](reference/element.md) |
| <span id="embedding"></span>Hosts | Bundlers and import maps, PowerShell Universal, PHP, Angular, several reports on one page | [Recipes](embed/recipes.md) |
| Engine | `encode`, `normalize`, `computePivot`, `toGrid`, `toEChartsOption`, `toXlsx`, `toCsv`, drill-down rows, links, templates | [pivotkit-core](reference/core.md), [engine](getting-started/engine.md) |
| <span id="security"></span>Security | A view holds names only (and the values chosen in its filters), checked against fixed lists and limits; exports safe to open; data written as text, never markup; a strict CSP works | [Security](security.md) |
| <span id="limits"></span>Limits | Rows, groups, cells and work capped before anything big is allocated; links capped while they are inflated | [Limits](concepts/limits.md#limits) |
| Performance | About 100,000 rows; heavy parts loaded on first use | [Performance](reference/react.md#performance), [bundle size](reference/element.md#bundle-size) |

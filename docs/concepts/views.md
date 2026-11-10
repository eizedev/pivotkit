---
title: Views and saved views
description: The view is the whole report as plain JSON - the start preset, the saved view, the undo step and what the UI edits. Its keys, how it is checked, and how to store it.
---

# Views and saved views

A **view** is the whole report as a small JSON object: which fields are on rows and columns, which
values are computed and how, the filters, the sort, the totals, table or chart. The same object is

- the start preset you pass to the report (`defaultView`, or `default-view` on the element),
- the template people save and load (the host's `templates`: shared views and their own),
- one step of the undo history,
- what `onViewChange` (or `pivot-view-change`) hands you on every change.

Store it as text wherever you like - local storage, a database, a URL - and pass it back later.

## A complete view

```js
{
    version: 1,
    rows: ["Region", "Country"],              // field names, outer first
    cols: ["Year"],
    values: [{
        field: "Sales", agg: "sum",           // see Values
        format: "currency:EUR",
        label: null,                          // default "Sum of Sales"; with showAs "% of row total of Sales"
        showAs: { type: "percentOfRowTotal", axis: "rows" },
        conditional: { type: "colorScale", colors: ["#f8696b", "#63be7b"] }   // or { type: "dataBar" }
    }],
    filters: [
        { field: "Region", type: "include", items: ["North", null] },        // null is (blank)
        { field: "Rep", type: "label", op: "contains", value: "an" },
        { field: "Country", type: "top", count: 5, bottom: false, by: { field: "Sales", agg: "sum" } },
        { field: "Region", type: "value", op: ">", value: 1000 }
    ],
    derived: [
        { name: "Year", field: "OrderDate", by: "year" },
        { name: "Band", field: "Amount", by: "bin", size: 100, origin: 0 }
    ],
    sort: [
        { field: "Country", by: "value", order: "desc", value: { field: "Sales", agg: "sum" } },
        { field: "Season", by: "custom", items: ["Spring", "Summer", "Autumn", "Winter"] }
    ],
    totals: { grandTotalRow: true, grandTotalColumn: true, rowSubtotals: true, colSubtotals: true },
    collapsed: { rows: [["North"]], cols: [] },
    display: "table",                          // or "chart"
    chart: {
        type: "auto", stacked: false, horizontal: false,       // auto (the default: the data decides) bar line area pie donut heatmap
        valueLabels: "auto", legend: "auto", title: null,      // how it is drawn, see Charts
        smooth: false, axisLabels: "auto", groupLabels: "auto",
        labelPosition: "outside"                               // pie and donut: "outside" or "inside"
    },
    formatting: { locale: "de-DE", timeZone: null }
}
```

Every key is optional; a partial view is filled with defaults. The smallest useful view is one value:

```json
{ "rows": ["Region"], "values": [{ "field": "Sales", "agg": "sum" }] }
```

| Key | What | Details |
| --- | --- | --- |
| `rows`, `cols` | Field names on each axis, outer first. A derived field is used by its `name`. | |
| `values` | What is computed in the cells: field, aggregator, format, label, "show as", highlighting. | [Values](values.md) |
| `filters` | Item lists, text conditions, comparisons of an item, relative date ranges, top N, value conditions. | [Filters](filters.md) |
| `derived` | New fields from a date (year, month, ...) or a number (ranges). | [Dates and number ranges](dates.md) |
| `sort` | Per field: by label, by a value or in a custom order, ascending or descending. | [Sorting](filters.md#sorting) |
| `totals` | Grand total row and column, row and column subtotals; all on by default. | |
| `collapsed` | Key paths of collapsed groups per axis. | |
| `display`, `chart` | Table or chart, the chart's type, stacking and direction, and how it is drawn: value labels, legend, title, smooth lines, axis labels, group labels ([Charts](charts.md)). | |
| `formatting` | The view's own locale and time zone. | [Locale and time zones](limits.md) |
| `version` | The view format's version; older views are migrated. | |

## A view is user input

pivotkit treats every view as untrusted, wherever it comes from:

- It holds **names only**, and in its filters the values chosen there (plain values of the data, which
  a shared view gives away: see [Privacy](../reference/view-file.md#privacy)). Field names are resolved against the data, aggregators, formats, filter
  operators and chart types against fixed lists, colours against `#rgb`/`#rrggbb`. Nothing in a view
  is evaluated as code or rendered as HTML.
- **A bad view never throws.** What cannot be used is dropped and reported as an issue with its path
  (`values[0]`: `unknown aggregator "evil"`); the rest of the report still works. A view saved
  for one data set therefore opens on another with the fields that exist there.
- It cannot ask for unbounded work: its size and every dense structure it leads to are counted
  against [limits](limits.md#limits) before anything is allocated.

`normalize(view, data)` in pivotkit-core returns the checked view and the issues; `validate` only
reports. The UI normalizes every view it gets and shows what it dropped as a warning above the result,
in plain words ([what people see](../use/behaviour.md#parts-of-a-view-that-were-not-used)).

### Issues (for developers)

An issue is `{ path, message, code, params }`:

| Member | What |
| --- | --- |
| `path` | Where in the view: `rows[1]`, `values[0].conditional.colors`, `chart.legend`, `""` for the whole view. |
| `message` | An English sentence for developers and logs, such as `unknown field "Planet"`; its wording may change. |
| `code` | What kind of problem, one of `VIEW_ISSUE_CODES`: a stable name to say it in your own words. |
| `params` | What such a text needs, when there is something: `field` (a field name), `value` (the setting or item as given, as text, at most 100 characters), `agg` (an aggregator), `type` (a field type), `max` (a limit), `zone` (the data's time zone). |

| Codes | When |
| --- | --- |
| `notView`, `notJson`, `tooLarge`, `badVersion`, `newerVersion`, `noMigration` | Nothing of the view can be used: the empty view instead. |
| `unknownKey` | A key a view does not have (a template's `name` among them). |
| `notList`, `tooMany`, `tooManyItems`, `itemType` | A list that is none, longer than the [limits](limits.md#limits), or an item that does not fit the field's type. |
| `unknownField`, `placedTwice`, `sortedTwice` | A field the data does not have; a field twice on the axes or in the sort. |
| `groupingNoName`, `groupingNameTaken`, `groupingNoSource`, `groupingUnknown`, `binsNeedNumber`, `groupingNeedsDate`, `binSize` | A derived field (grouping) that cannot be made. |
| `notValueRef`, `unknownAggregator`, `aggregatorNeedsField`, `aggregatorType` | A value or a value a filter or sort goes by. |
| `unknownFormat`, `badLabel`, `unknownShowAs`, `showAsNotAdditive`, `showAsNotNumber`, `unknownConditional`, `conditionalNotNumber`, `colorScaleColors`, `dataBarColor` | A value's format, name, "show as" and colours. |
| `unknownFilterType`, `filterNoItems`, `filterLabelOp`, `filterText`, `filterNotNumber`, `filterCount`, `filterValue`, `filterValue2`, `filterCompareField`, `filterCompareValue`, `filterRelativeField`, `filterRelativeUnit`, `filterRelativeCount`, `filterRelativeAnchor` | A filter. |
| `sortNoItems` | A custom sort order without items. |
| `badTotals`, `collapsedPath`, `unknownSetting`, `badTitle`, `unknownLocale`, `unknownTimeZone` | Totals, collapsed groups, display and chart settings, formatting. |
| `timeZoneMismatch` | `computePivot` only: the view's time zone is not the data's. |

A later version may add codes: show a general text for one you do not know.

## Saved views in the UI

The report's **Views** menu lists what you pass in `templates` in two groups, **Shared views** and
**My views**, and offers the first three in the empty state. With `onSaveTemplate` (or
`save-templates` on the element) people save the current view under a name; your code stores it and
passes the new list back, or the browser keeps them (`templateStore="browser"`). A save closes the
menu and says "View “…” saved"; the view loaded has a check mark in its group. Entries marked `deletable` get a delete button with a
confirmation; with `canPublish` people publish one of their views as a shared view. Names need not be
unique. [Templates and shared views](templates.md) describes the groups, where templates are kept and
how to provide them. The menu's last group, **Share this view**, copies or downloads the view as a
[view file](../reference/view-file.md) and opens one ([sharing](sharing.md)).

## Versions

A view carries `version`. pivotkit migrates an older view to the current `VIEW_VERSION` when it reads
it. A view of a newer version than it knows is refused: `normalize` returns an empty view with the
issue `version 99 is newer than this pivotkit-core reads (1); update pivotkit-core`. Store views as they come from `onViewChange`; they always carry the current version.

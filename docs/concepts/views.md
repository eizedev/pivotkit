---
title: Views and saved views
description: The view is the whole report as plain JSON - the start preset, the saved view, the undo step and what the UI edits. Its keys, how it is checked, and how to store it.
---

# Views and saved views

A **view** is the whole report as a small JSON object. It holds:

- which fields are on rows and columns
- which values the report computes, and how
- the filters, the sort and the totals
- table or chart

The same object is:

- the start preset you pass to the report (`defaultView`, or `default-view` on the element)
- the template people save and load (the host's `templates`: shared views and their own)
- one step of the undo history
- what `onViewChange` (or `pivot-view-change`) hands you on every change

Store it as text wherever you like, such as local storage, a database or a URL, and pass it back
later.

## A complete view

```js
{
    version: 2,
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
        { field: "Region", type: "in", items: ["North"], not: false, blanks: "include" },   // blanks: the (blank) item
        { field: "Rep", type: "text", op: "contains", value: "an", on: "value",
          match: { case: "insensitive", whitespace: "collapse" }, not: false, blanks: "exclude" },
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
    totals: { grandTotalRow: true, grandTotalColumn: true, rowSubtotals: true, colSubtotals: false },
    collapsed: { rows: [["North"]], cols: [] },
    display: "table",                          // or "chart"
    chart: {
        type: "auto", stacked: false, horizontal: false,       // auto (the default: the data decides) bar line area pie donut heatmap
        valueLabels: "auto", legend: "auto", title: null,      // how it is drawn, see Charts
        smooth: false, axisLabels: "auto", groupLabels: "auto",
        labelPosition: "outside",                              // pie and donut: "outside" or "inside"
        tooltip: "auto",                                       // or "axis": every series at the category
        zoom: "auto", stackPercent: false,                     // the zoom slider, stacks to 100 %
        hidden: [],                                            // legend entries hidden, by name
        referenceLines: { average: false, trend: false, target: null, extremes: false },  // lines and high and low points
        tooltipShare: false,                                   // the share of the total in the tooltip
        colors: [{ name: "North", color: "#2a78d6" }]          // a fixed colour per series or slice
    },
    formatting: { locale: "de-DE", timeZone: null, weekStart: 1 },  // weekStart: 1 Monday to 7 Sunday
    fieldLabels: { cn: "City" }                                    // a name of the report's own for a field
}
```

Every key is optional. pivotkit fills a partial view with defaults. The smallest useful view is one
value:

```json
{ "rows": ["Region"], "values": [{ "field": "Sales", "agg": "sum" }] }
```

| Key | What | Details |
| --- | --- | --- |
| `rows`, `cols` | Field names on each axis, outer first. A view names a derived field by its `name`. | |
| `values` | What the report computes in the cells: field, aggregator, format, label, "show as", highlighting. | [Values](values.md) |
| `filters` | Item lists, blanks, text conditions, comparisons of an item, relative date ranges, top N, value conditions; each with `not` and `blanks`. | [Filters](filters.md) |
| `derived` | New fields from a date (year, month, ...) or a number (ranges). | [Dates and number ranges](dates.md) |
| `sort` | Per field: by label, by a value or in a custom order, ascending or descending. | [Sorting](filters.md#sorting) |
| `totals` | Grand total row and column, row and column subtotals. All are on by default except the column subtotals. Without values the table has no totals, because a total has no number then. A group with one item has no subtotal. | [The table](../use/fields.md#the-table) |
| `collapsed` | Key paths of collapsed groups per axis. | |
| `display`, `chart` | Table or chart, the chart's type, stacking and direction, and how it is drawn: value labels, legend, title, smooth lines, axis labels, group labels, tooltip, reference lines ([Charts](charts.md)). | |
| `formatting` | The view's own locale and time zone, and the first day of a week for relative ranges in weeks (`weekStart`, 1 Monday to 7 Sunday). | [Locale and time zones](limits.md), [Relative date ranges](filters.md#relative-date-ranges) |
| `fieldLabels` | Names of the report's own for fields, by the field's name. The headers, the chart and the exports show them instead of the field's name or a host's display name. Only a view with a name has the key. pivotkit 0.8 does not know it. | [Upgrading](../getting-started/upgrading.md#field-labels) |
| `version` | The view format's version. pivotkit migrates older views. | |

## A view is user input

pivotkit treats every view as untrusted, wherever it comes from:

- It holds **names only**, and in its filters the values chosen there. These are plain values of the
  data, and a shared view gives them away: see [Privacy](../reference/view-file.md#privacy).
- pivotkit resolves field names against the data. It checks aggregators, formats, filter operators
  and chart types against fixed lists, and colours against `#rgb`/`#rrggbb`. Nothing in a view runs as
  code or renders as HTML.
- **A bad view never throws.** pivotkit drops what it cannot use and reports it as an issue with its
  path (`values[0]`: `unknown aggregator "evil"`). The rest of the report still works. So a view saved
  for one data set opens on another with the fields that exist there.
- It cannot ask for unbounded work. pivotkit counts its size, and every dense structure it leads to,
  against [limits](limits.md#limits) before it allocates anything.

pivotkit-core has these functions for it:

- `normalize(view, data)` returns the checked view and the issues.
- `validate` only reports. It splits the issues into `errors` and `warnings`, with the name that was
  probably meant (`params.suggestion`).
- The JSON Schema `pivotkit-core/schema/view-2.json` checks a view that a program or an LLM wrote,
  before it reaches the data. The schema is built from the engine's tables.
- `describeView(view, data)` explains a view: its parts, with one short English text each
  ([reference](../reference/core.md#describing-data-and-views)).

The UI normalizes every view it gets. It shows what it dropped as a warning above the result, in plain
words ([what people see](../use/behaviour.md#parts-of-a-view-that-were-not-used)).

### Issues (for developers)

An issue is `{ path, message, code, severity, params }`:

| Member | What |
| --- | --- |
| `path` | Where in the view: `rows[1]`, `values[0].conditional.colors`, `chart.legend`, `""` for the whole view. |
| `message` | An English sentence for developers and logs, such as `unknown field "Planet"`. Its wording may change. |
| `code` | What kind of problem, one of `VIEW_ISSUE_CODES`: a stable name to say it in your own words. |
| `severity` | `"error"`: pivotkit leaves the part out or replaces it with its default. `"warning"`: pivotkit uses the part as written, but it may not do what was meant. `VIEW_ISSUES[code].severity` gives a code's severity. `unknownKey` is an error at the top of a view and a warning inside a part. |
| `params` | What such a text needs, when there is something: `field` (a field name), `value` (the setting or item as given, as text, at most 100 characters), `agg` (an aggregator), `type` (a field type), `max` (a limit), `zone` (the data's time zone), `suggestion` (the name that was probably meant: the closest field, aggregator, filter type or key, or the data's item). |

| Codes | When |
| --- | --- |
| `notView`, `notJson`, `tooLarge`, `badVersion`, `newerVersion`, `noMigration` | Nothing of the view can be used: the empty view instead. |
| `unknownKey` | A key a view does not have, a template's `name` among them. Inside a part (a value, a filter, the chart), it is a warning. |
| `notList`, `tooMany`, `tooManyItems`, `itemType`, `itemTooLong` | A list that is none, longer than the [limits](limits.md#limits), an item that does not fit the field's type, or a text item longer than 10,000 characters. |
| `itemCase` | A warning: a text item of a filter is no item of the data, but an item of the data differs from it only in case or whitespace (`params.suggestion`). The filter keeps the item as written. Needs the encoded data. |
| `unknownField`, `placedTwice`, `sortedTwice` | A field the data does not have, or a field twice on the axes or in the sort. |
| `sortColumn` | A sort's `column` that does not fit: not a sort by a value, not a field on Rows, no field on Columns, or a list of the wrong length. The sort goes by the whole row. |
| `groupingNoName`, `groupingNameTaken`, `groupingNoSource`, `groupingUnknown`, `binsNeedNumber`, `groupingNeedsDate`, `binSize` | A derived field (grouping) that cannot be made. |
| `notValueRef`, `unknownAggregator`, `aggregatorNeedsField`, `aggregatorType` | A value or a value a filter or sort goes by. |
| `unknownFormat`, `badLabel`, `unknownShowAs`, `showAsNotAdditive`, `showAsNotNumber`, `unknownConditional`, `conditionalNotNumber`, `colorScaleColors`, `dataBarColor` | A value's format, name, "show as" and colours. |
| `unknownFilterType`, `filterFieldType`, `filterNoItems`, `filterTextOp`, `filterText`, `filterMatch`, `filterNot`, `filterBlanks`, `filterNotNumber`, `filterCount`, `filterTies`, `filterPrecision`, `filterValue`, `filterValue2`, `filterCompareValue`, `filterRelativeDirection`, `filterRelativeUnit`, `filterRelativeCount`, `filterRelativeAnchor` | A filter. `filterFieldType`: the filter type does not work on the field's type (`params.allowed`, and the type that does in `params.suggestion`). A version-1 type or operator in a version-2 view names version 2's in `params.suggestion`. |
| `blanksUnspecified`, `filterEmpty` | Warnings of `validate` only: a filter that does not say what happens to blank items, or an `in` filter that keeps nothing. |
| `sortNoItems` | A custom sort order without items. |
| `badTotals`, `collapsedPath`, `unknownSetting`, `badTitle`, `unknownLocale`, `unknownTimeZone` | Totals, collapsed groups, display and chart settings, formatting. `computePivot` also gives `unknownLocale` as a warning at the path `locale`, for a `locale` option the runtime does not know. |
| `timeZoneMismatch` | `computePivot` only: the view's time zone is not the data's. |
| `tooManyIssues` | A warning, last in the list: pivotkit left out the issues beyond `ISSUE_CAP` (100 of one code, 1,000 in all). `params.value` counts them. |

A later version may add codes. Show a general text for a code you do not know.

## Saved views in the UI

The report's **Views** menu lists what you pass in `templates` in two groups, **Shared views** and
**My views**. The empty state offers the first three.

- With `onSaveTemplate` (or `save-templates` on the element), people save the current view under a
  name. Your code stores it and passes the new list back. Or the browser keeps the views
  (`templateStore="browser"`).
- A save closes the menu and says "View “…” saved". The loaded view has a check mark in its group.
- Entries marked `deletable` get a delete button with a confirmation.
- With `canPublish`, people publish one of their views as a shared view.
- Names need not be unique.

[Templates and shared views](templates.md) describes the groups, where templates are kept and how to
provide them. The menu's last group, **Share this view**, copies or downloads the view as a
[view file](../reference/view-file.md) and opens one ([sharing](sharing.md)).

## Versions

A view carries `version`. pivotkit writes version 2. When pivotkit reads an older view, it migrates
it to the current `VIEW_VERSION` (`migrate`, which `normalize` runs first).

- pivotkit reads a view without a `version` as version 1, so hand-written JSON of version 1 keeps
  working.
- The step to version 2 leaves version 2's shapes as they are, so hand-written JSON of version 2 works
  without a version too.
- Write `version: 2` all the same, so a reader never has to guess.
- pivotkit refuses a view of a newer version than it knows. `normalize` returns an empty view with the
  issue `version 99 is newer than this pivotkit-core reads (2); update pivotkit-core`.

Store views as they come from `onViewChange`. They always carry the current version.

A view file and a link leave out the chart settings newer than pivotkit 0.7 (`tooltip`, `zoom`,
`stackPercent`, `hidden`, `referenceLines`, `colors`, `tooltipShare`) while they hold their
default. A 0.7 reader then takes the view as it is. A view that sets one, such as a hidden series,
gets an `unknownKey` warning from a 0.7 reader, which ignores that setting.
In the same way, `referenceLines` leaves out `extremes`, which is newer than 0.8, while it is
`false`.

From version 1 to 2, only the filters change ([Filters](filters.md)). Every version-1 view keeps what it
kept, apart from the exception below.

| Version 1 | Version 2 |
| --- | --- |
| `include` items | `in`, the items without `null`; `blanks: "include"` when `null` was listed, else `"exclude"` |
| `exclude` items | `in` with `not: true`, the items without `null`; `blanks: "exclude"` when `null` was listed, else `"include"` |
| `label` | `text` with `on: "label"` and `match: { case: "insensitive", whitespace: "exact" }`; `notEquals` and `notContains` as `equals` and `contains` with `not: true`; `blanks` as version 1 matched the blank item (its label "(blank)") |
| `compare`, `value` with `!=` or `notBetween` | `=` or `between` with `not: true` |
| `compare`, `relative` | `blanks: "exclude"`: version 1 never kept a blank |
| `top` | as it was |

One exception: version 1 lower-cased label filters in the runtime's default locale
(`toLocaleLowerCase()`). Version 2 lower-cases them without it (`toLowerCase()`). Where the runtime's
default locale is Turkish, Azeri or Lithuanian, the dotted and dotless i fold differently. There, a
label filter with an "I" or "i" in its text may keep other items after the migration.

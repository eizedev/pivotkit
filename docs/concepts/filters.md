---
title: Filters and sorting in a view
description: How a pivotkit view stores filters, top N and sorting - item, text, comparison, relative date, value and top filters, blanks, and label, value and custom sorts - and what the report's menus write.
---

# Filters and sorting in a view

For developers who write, read or check views in code. [Filters, top N and sorting](../use/filters.md)
describes the same features as people use them in the report.

## Filters

A view's `filters` are a list. Every filter names a field and a `type`. All filters apply together
(and):

- Item, blank, text, comparison and date range filters drop source rows before the engine computes
  anything.
- Value filters and top N drop whole groups after the engine aggregates the values.

```json
"filters": [
    { "field": "Region", "type": "in", "items": ["North"], "blanks": "include" },
    { "field": "Status", "type": "in", "items": ["Retired"], "not": true, "blanks": "include" },
    { "field": "Owner", "type": "blank", "not": true },
    { "field": "Host", "type": "text", "op": "beginsWith", "value": "web", "blanks": "exclude" },
    { "field": "Released by year", "type": "compare", "op": ">=", "value": 2022, "blanks": "exclude" },
    { "field": "Released", "type": "relative", "unit": "year", "count": 5, "blanks": "exclude" },
    { "field": "Region", "type": "value", "op": ">", "value": 1000 },
    { "field": "Country", "type": "top", "count": 5, "bottom": false, "ties": "all" }
]
```

| `type` | What | Fields |
| --- | --- | --- |
| `in` | Keep the listed `items` (with `not: true`, drop them). A blank is no item: `blanks` decides it. | any |
| `blank` | Keep the blank items (with `not: true`, every other). | any |
| `text` | Compare an item's text: `op` `equals`, `contains`, `beginsWith`, `endsWith`; `value` the text; `on` `"value"` (a text field's own value, the default) or `"label"` (the label the table shows, for any field); `match` how text is folded ([Text matching](#text-matching)). | text; any with `on: "label"` |
| `compare` | The item itself compared with `value`: a number, a date or a grouping's key. `op` `=`, `>`, `>=`, `<`, `<=`, `between` (with `value2`). | number, date |
| `relative` | The dates of a range that moves with today: `direction` `last`, `next`, `this` or `before`, `count` and `unit` `hour` to `year`, by whole units or rolling, counted from today or from an `anchor` ([Relative date ranges](#relative-date-ranges)). | date, a grouping of a date |
| `value` | A condition on an aggregated value. `op` as `compare`'s. | any |
| `top` | Keep the `count` largest items, or with `bottom: true` the smallest; `ties` `"first"` (the default) or `"all"`. | any |

`value` and `top` rank by `by`, a value reference such as `{ "field": "Sales", "agg": "sum" }`.
Without it they use the view's first value.

A filter type on a field it does not fit is the issue `filterFieldType`. Its `params.suggestion`
holds the type that fits. `CATALOG.filterFields` lists the field types of each filter type.

### Not and blanks

Every filter has one shape: `{ field, type, ..., not, blanks }`.

- `not: true` inverts which items **with a value** a filter keeps. `{ "type": "text", "op":
  "contains", "value": "test", "not": true }` keeps every item that does not contain "test".
  `compare` and `value` write "not equal" and "not between" this way: `"op": "between", "not": true`.
- `blanks` alone decides the blank items, the items without a value:
    - `"exclude"`, the default, drops them.
    - `"include"` keeps them too.
    - `"only"` keeps them and nothing else.

    So `not` never brings the blanks back on its own. Excel's and AG Grid's filters behave the same
    way.

Which filters have which key:

- `blank` has `not` only.
- `value` has `not`. A group without a number never matches.
- `top` has neither.

`normalize` writes both keys on every filter that has them. `validate` warns in two cases:

- A filter leaves `blanks` out (`blanksUnspecified`). A generated view then has to say what it means.
- An `in` filter keeps nothing (`filterEmpty`): no items, no `not`, no blanks.

### Text matching

`text` folds the item's text and its `value` alike before it compares them. `match` says how:

- `case`:
    - `"insensitive"`, the default, lower-cases both with JavaScript's `toLowerCase()`. It does not
      depend on the runtime's locale, so a server and every browser agree.
    - `"sensitive"` keeps the case.
- `whitespace`:
    - `"collapse"`, the default, turns every run of whitespace into one space and trims the ends.
      Whitespace includes a no-break space (U+00A0), a narrow no-break space and tabs. So "ACTIVE
      DIRECTORY" typed matches an item copied from a web page.
    - `"exact"` compares the spaces as they are.

The search of a field's items in the UI and the "did you mean" hints fold text the same way
(`foldText` in pivotkit-core). A text filter migrated from view version 1 (`label`) keeps
`whitespace: "exact"`, so it keeps the same items as before.

### Compare an item

`compare` keeps the items of a number or date field that pass a comparison. The operators are `=`,
`>`, `>=`, `<`, `<=` and `between`. `between` includes both bounds, in either order, as a value
condition does. `not: true` inverts each of them.

What `compare` compares depends on the field:

- **A number field:** the number. A text of one, such as `"2022"`, counts as the number. A grouping
  of numbers (ranges) compares each range by its lower bound.
- **A date field:** the calendar day. `value` is a date, `"2022-03-01"`. The filter ignores a time in
  it, so "before 2022-03-01" keeps every row of 28 February and none of 1 March, whatever its clock
  time.
    - `precision` compares by another unit: `"year"`, `"quarter"`, `"month"`, `"day"` (the default) or
      `"hour"`.
    - The filter takes both the date and `value` as the start of their unit. So
      `{ "op": "=", "value": "2025-03-17", "precision": "month" }` keeps every day of March 2025.
    - `normalize` writes `value` as that start: `"2025-03-01"`, or with `"hour"`
      `"2025-03-17T14:00"`.
    - A precision on a number is the issue `filterPrecision`.
- **A date grouping:** its key, the number the grouping gives each item:
    - a year: `2022`
    - a month: `202503` (year × 100 + month)
    - a quarter: `20251` (year × 10 + quarter)
    - a week: `202512` (ISO year × 100 + week)
    - the cyclic ones: their number (month `3`, weekday `1` for Monday)
    - a day: a date

    With a calendar day as the value (`"2025-01-01"`), the filter compares the grouping's **source
    dates** instead, as a relative range does. `between "2025-01-01" and "2025-12-31"` on a
    month-of-the-year grouping keeps the rows of 2025, so January is January 2025 alone. The Filter
    level's Years combined writes these filters. A day and a key in one comparison is no comparison.

The filter keeps a blank item (no value) only with `blanks: "include"` or `"only"`, with or without
`not`. Only number and date fields have `compare`. A text field has the `text` conditions.

### Relative date ranges

`relative` keeps the dates of a range that moves with today. A saved report stays right next year:

| Key | What | Default |
| --- | --- | --- |
| `direction` | `"last"`: the range up to now; `"next"`: from now on; `"this"`: the current unit alone (no `count`); `"before"`: every date before the `"last"` range. | `"last"` |
| `unit` | `"hour"`, `"day"`, `"week"`, `"month"`, `"quarter"`, `"year"`. | |
| `count` | How many units, a whole number from 1 to `CATALOG.relativeMaxCount` (500); none with `"this"`. | |
| `calendar` | `true`: whole units ("the last 2 months" is last month and this one); `false`: rolling, from the moment `count` units ago to now ("the last 30 days" from this time 30 days ago). | `true` |
| `includeCurrent` | With `calendar`: whether the current unit is one of the `count` (`false`: "the last 2 months" are the two before this one). | `true` |
| `anchor` | What "now" is: `"today"`, `"latest"` (the latest date of the field's data), `"first"` (its first date) or a date of its own (`"2025-06-30"`, `"2025-06-30T18:00"`). | `"today"` |

```json
{ "field": "Created", "type": "relative", "unit": "year", "count": 5, "blanks": "exclude" }
{ "field": "Created", "type": "relative", "direction": "before", "unit": "day", "count": 30, "calendar": false, "blanks": "include" }
{ "field": "Due", "type": "relative", "direction": "this", "unit": "week", "blanks": "exclude" }
```

The three filters keep:

1. this year and the four before it
2. every item created more than 30 days ago, and the items without a date too
3. this week

A range ends with the end of the current year, month or day, so later dates of this year are in
"this year". A week starts on the view's `formatting.weekStart`: 1 (Monday, the default, as ISO 8601)
to 7 (Sunday). A month or a year counted back from the 31st ends on the last day of a shorter month.

On a date grouping ("Released by year"), the range filters the grouping's **source dates**. Take
"the last 18 months" on a year grouping: the oldest year keeps only its months in the range, and its
total counts only those.

Today is the wall clock of `computePivot`'s `options.now` in the data's time zone, never the
machine's zone. The data's time zone is the `timeZone` of `encode()`, default UTC. The same data and
`now` give the same result everywhere. Without `now`, today is the current time.
`relativeDateRange(unit, count, { now, timeZone, direction, calendar, includeCurrent, anchor,
weekStart })` says which dates a range keeps, for a UI's "last 5 years (2022–2026)".

A range counts from today by default, so a saved report refreshes with the calendar. Some data end,
such as an archive or a closed year. For them, `anchor` sets another starting point:

- `anchor: "latest"` counts from the latest date of the field's data.
  `{ "unit": "month", "count": 12, "anchor": "latest" }` on data that end on 2025-12-31 is January to
  December 2025, whatever the day.
- `"first"` counts from the field's first date.
- A date of its own makes a report give the same result on every run.

On a grouping, the latest and first dates are those of the source dates. An anchor that is none of
these is the issue `filterRelativeAnchor`, and the engine leaves the filter out.

`relativeDateRange` takes the same `anchor`. With the options `latest` and `first` it also takes the data's
latest and first date: a `Date`, epoch milliseconds, an ISO string or the wall-clock milliseconds a
date column holds.

A filter on a field that is on rows or columns filters that axis. A filter on any other field filters
the whole report. In the UI, that is a field in the **Filters** zone.

### Top N and value filters work within groups

`value` and `top` on a field of an axis work within each item of the field above it, and totals add
up the items kept ([top N](../use/filters.md#top-n)). `top` keeps exactly `count` items
(`ties: "first"`, the item first in the data wins a tie at the cut); `ties: "all"` keeps every item
with the value at the cut.

## Sorting

```json
"sort": [
    { "field": "Region", "by": "label", "order": "asc" },
    { "field": "Country", "by": "value", "order": "desc", "value": { "field": "Sales", "agg": "sum" }, "column": ["2025", "Jul"] },
    { "field": "Season", "by": "custom", "items": ["Spring", "Summer", "Autumn", "Winter"] }
]
```

Each field on rows or columns has its own sort:

- `by: "label"` sorts by the item's label. Text sorts in natural order for the locale ("Item 2" before
  "Item 10"). Numbers and dates sort by value. This is the default. Blank sorts last.
- `by: "value"` sorts by an aggregated value. `value` names which one. The default is the view's
  first. Items sort within their parent group.
- A row field's `value` sort can name one column in `column`: its items, from the outermost column
  field, such as `["2025", "Jul"]`. The rows then follow that column's values, and a row without a
  value there comes last. Without `column` the whole row decides. On a column field, or with another
  `by`, `column` is left out with the warning `sortColumn`. A column a filter takes out leaves every
  row without a value there: the rows go by their labels, in the sort's direction, until the column
  is back.
- `by: "custom"` sorts in an order of your own, like Excel's custom lists. The `items` come first, in
  their order, named as filter items name them. The field's other items follow by label. `order:
  "desc"` reverses both. Blank sorts last unless it is listed (`null`).

The menu of a row or column field writes these entries ([Sorting](../use/filters.md#sorting) has the
menu as people see it):

| Menu entry | Sort entry |
| --- | --- |
| "A to Z", "Z to A" | a `label` sort |
| "Largest … first", "Smallest … first" | a `value` sort naming the value. Without a value the sort counts rows. |
| "Custom order" | a `custom` sort |

A click on a header of the table writes the same entries
([sort with a click on a header](../use/filters.md#sort-with-a-click-on-a-header)):

- A value's name writes a `value` sort of the innermost row field: `desc`, then `asc`, then no entry.
  Under a column, or a column's own name with one value, it names that `column`.
- A row or column field's name writes a `label` sort.

The menu offers "Custom order" when the view has a custom sort for the field, or when the host gives
the field an order with the report's `fieldDefaults` prop ([React](../reference/react.md#prop-fielddefaults),
[element](../reference/element.md#prop-fielddefaults)): `{ Season: { order: ["Spring", "Summer", "Autumn", "Winter"] } }`. The report sorts a field with such an order in it as soon as you place it on Rows or Columns.
The order is a `custom` sort in the view, so a saved template keeps it.

A view or template may have the field on Rows or Columns without a sort entry for it. It gets the
same `custom` sort when the report shows it. If you then pick "A to Z" in the menu, the view keeps it
as a sort entry of its own, so the host's order does not come back.

## What the report's menus write

The menus of [Filters, top N and sorting](../use/filters.md) write these entries:

| In the UI | In the view |
| --- | --- |
| Values ticked in the filter | An `in` filter with `not: true` of the values **not** ticked, as Excel does: a value that appears in later data is shown. "(blank)" ticked off is `blanks: "exclude"`, else `"include"`. With every value ticked, the field has no item filter at all; a field in the Filters zone without a filter holds `{ "type": "in", "items": [], "not": true, "blanks": "include" }`. |
| Quick choices of a date field: This [unit], Last [N] [unit], and under More choices Next [N] [unit], Before the last [N] [unit], rolling | One `relative` filter in place of the quick choice's: `direction` `"this"` (no `count`), `"last"` (not written), `"next"` or `"before"`, its `unit` and `count`; "Include the current …" off is `includeCurrent: false`, rolling is `calendar: false`; All removes it. "Counted back from" is its `anchor`: `"latest"`, `"first"` or a day (`"2025-06-30"`; today is no `anchor`). The field's first `relative` filter of a unit the choices offer (none finer than the grouping) that has no `not` and no `blanks: "only"` is the quick choice; the `compare` filters and any other range are rules. |
| Years combined of a grouping that repeats every year (month of the year) | `compare` filters with calendar days on the grouping: `between` the first and the last year ticked (Jan 1 to Dec 31), a `between` with `not: true` for each gap; every year ticked writes none. |
| Rule "Released by year is from 2022" (compare the item itself) | A `compare` filter; "is in the last N years" a `relative` filter. |
| Rule "Count of Released is greater than 3" (compare its total) | A `value` filter, `by` the value chosen; between writes the smaller number into `value`. The number is compared with the aggregated result as the engine computes it, not with a "show values as" percentage. |
| Rule "The name contains …" (a rule on the name) | A `text` filter: `on: "value"` for a text field, `on: "label"` for any other (a number as the table shows it), with case and whitespace ignored (`match: { case: "insensitive", whitespace: "collapse" }`). "is not", "does not contain", "does not begin with" and "does not end with" are `equals`, `contains`, `beginsWith` and `endsWith` with `not: true`; "is not" and "is not between" of the other rules are `=` and `between` with `not: true`. |
| Also keep items without a value (under the rules) | `blanks: "include"` on every `text`, `compare` and `relative` filter of the field (the quick choice's too); off, `"exclude"` on all of them. A new rule takes the field's setting. |
| Top items (Top 3, Top 5, Top 10, Top N…) | A `top` filter, `by` the value chosen; "Also show items with the same value as the last one" is `ties: "all"` (kept when the count or the value changes); Off removes it. |
| Remove (beside Rules in the Filter level) | Removes the field's `text`, `compare`, `relative` and `value` filters except the quick choice's `relative` filter (or Years combined's `compare` filters); Clear (beside Pick items) its `in` filters; Reset filter (in the summary) all of them and a `blank` filter; `top` stays. |

The rules write `blanks: "exclude"` unless the field keeps its blank items. A rule loaded with
other `blanks` keeps them when you edit it.

The menus offer no rule for these:

- `blank`
- `blanks: "only"`. To keep only the blanks, use Select none, then "(blank)" in Pick items.
- a comparison of dates by another `precision` than the day
- a `relative` range in hours
- a case-sensitive text rule (not available yet,
  [#168](https://github.com/eizedev/pivotkit/issues/168))

A view that has one of them shows it among the rules, and you can remove it there. The rules show a
`not` the menus have no word for as "not (…)".

A field keeps its filters when it moves between Rows, Columns and Filters. A field that leaves the
report takes its filters and its sort with it. A field moved to Values leaves its filters behind.

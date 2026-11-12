---
title: Filters, top N and sorting
description: Item filters, text conditions, value conditions and top N in a pivotkit view, how they interact with totals, and how rows and columns are sorted.
---

# Filters, top N and sorting

## Filters

A view's `filters` are a list; every filter names a field and a `type`, and all of them apply
together (and). Item, blank, text, comparison and date range filters drop source rows before anything
is computed; value filters and top N drop whole groups after the values are aggregated.

```json
"filters": [
    { "field": "Region", "type": "in", "items": ["North"], "blanks": "include" },
    { "field": "Status", "type": "in", "items": ["Retired"], "not": true, "blanks": "include" },
    { "field": "Owner", "type": "blank", "not": true },
    { "field": "Host", "type": "text", "op": "beginsWith", "value": "web", "blanks": "exclude" },
    { "field": "Released by year", "type": "compare", "op": ">=", "value": 2022, "blanks": "exclude" },
    { "field": "Released", "type": "relative", "unit": "year", "count": 5, "blanks": "exclude" },
    { "field": "Region", "type": "value", "op": ">", "value": 1000 },
    { "field": "Country", "type": "top", "count": 5, "bottom": false }
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

`value` and `top` rank by `by`, a value reference such as `{ "field": "Sales", "agg": "sum" }`; without
it they use the view's first value. A filter type on a field it does not fit is the issue
`filterFieldType`, with the type that fits in `params.suggestion`; `CATALOG.filterFields` lists the
field types of each filter type.

### Not and blanks

Every filter has one shape: `{ field, type, ..., not, blanks }`.

- `not: true` inverts which items **with a value** a filter keeps: `{ "type": "text", "op":
  "contains", "value": "test", "not": true }` keeps every item that does not contain "test".
  `compare` and `value` write "not equal" and "not between" so: `"op": "between", "not": true`.
- `blanks` alone decides the blank items (no value): `"exclude"` (the default) drops them,
  `"include"` keeps them too, `"only"` keeps them and nothing else. So `not` never brings the blanks
  back on its own, as Excel's and AG Grid's filters behave. `blank` has `not` only; `value` has `not`
  (a group without a number never matches); `top` has neither.

`normalize` writes both keys on every filter that has them. `validate` warns when a filter leaves
`blanks` out (`blanksUnspecified`), so a generated view says what it means, and when an `in` filter
keeps nothing (`filterEmpty`: no items, no `not`, no blanks).

### Text matching

`text` folds the item's text and its `value` alike before it compares them, as `match` says:

- `case`: `"insensitive"` (the default) lower-cases both with JavaScript's `toLowerCase()`, which
  does not depend on the runtime's locale, so a server and every browser agree; `"sensitive"` keeps
  the case.
- `whitespace`: `"collapse"` (the default) turns every run of whitespace into one space and trims
  the ends, a no-break space (U+00A0), a narrow no-break space and tabs among it, so "ACTIVE
  DIRECTORY" typed matches an item copied from a web page; `"exact"` compares the spaces as they are.

The search of a field's items in the UI and the "did you mean" hints fold text the same way
(`foldText` in pivotkit-core). A text filter migrated from view version 1 (`label`) keeps
`whitespace: "exact"`, so it keeps what it kept.

### Compare an item

`compare` keeps the items of a number or date field that pass a comparison: `=`, `>`, `>=`, `<`,
`<=` and `between` (both bounds included, in either order, as a value condition), each inverted with
`not: true`.
What is compared:

- A number field: the number (a text of one, `"2022"`, is read as the number). A grouping of numbers (ranges) compares each range by its lower bound.
- A date field: the calendar day. `value` is a date, `"2022-03-01"`; a time in it is left out, so
  "before 2022-03-01" keeps every row of 28 February and none of 1 March, whatever its clock time.
  `precision` compares by another unit: `"year"`, `"quarter"`, `"month"`, `"day"` (the default) or
  `"hour"`; both the date and `value` are taken as the start of their unit, so `{ "op": "=", "value":
  "2025-03-17", "precision": "month" }` keeps every day of March 2025. `normalize` writes `value` as
  that start (`"2025-03-01"`, with `"hour"` `"2025-03-17T14:00"`). A precision on a number is the
  issue `filterPrecision`.
- A date grouping: its key, the number the grouping gives each item: a year `2022`, a month `202503`
  (year × 100 + month), a quarter `20251` (year × 10 + quarter), a week `202512` (ISO year × 100 +
  week), the cyclic ones their number (month `3`, weekday `1` for Monday); a day is a date. With a
  calendar day as the value (`"2025-01-01"`) the grouping is compared by its **source dates**
  instead, as a relative range filters them: `between "2025-01-01" and "2025-12-31"` on a
  month-of-the-year grouping keeps the rows of 2025, so January is January 2025 alone (the Filter
  level's Years combined writes these). A day and a key in one comparison is no comparison.

A blank item (no value) is kept only with `blanks: "include"` or `"only"`, `not` or not. Only number
and date fields can be compared; a text field has the `text` conditions.

### Relative date ranges

`relative` keeps the dates of a range that moves with today, so a saved report stays right next
year:

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

The first is this year and the four before it; the second every item created more than 30 days ago,
the items without a date too; the third this week. A range ends with the end of the current year,
month or day, so later dates of this year are in "this year". A week starts on the view's
`formatting.weekStart`: 1 (Monday, the default, as ISO 8601) to 7 (Sunday). A month or a year
counted back from the 31st ends on the last day of a shorter month.

On a date grouping ("Released by year") the range filters the grouping's **source dates**: with
"the last 18 months" on a year grouping, the oldest year keeps only its months in the range, and its
total counts only those.

Today is the wall clock of `computePivot`'s `options.now` in the data's time zone (the `timeZone` of
`encode()`, default UTC), never the machine's zone: the same data and `now` give the same result
everywhere. Without `now` it is the current time. `relativeDateRange(unit, count, { now, timeZone,
direction, calendar, includeCurrent, anchor, weekStart })` says which dates a range keeps, for a UI's
"last 5 years (2022–2026)".

A range counts from today by default: a saved report refreshes with the calendar. For data that end -
an archive, a closed year - `anchor: "latest"` counts from the latest date of the field's data:
`{ "unit": "month", "count": 12, "anchor": "latest" }` on data that end on 2025-12-31 is January to
December 2025, whatever the day. `"first"` counts from the field's first date, a date of its own
makes a report give the same result on every run. On a grouping, the latest and first dates are the
source dates'. An anchor that is none of these is the issue `filterRelativeAnchor`, and the filter is
left out. `relativeDateRange` takes the same `anchor`, with `latest` and `first`, the data's latest
and first date (a `Date`, epoch milliseconds, an ISO string or the wall-clock milliseconds a date
column holds).

A filter on a field that is on rows or columns filters that axis. A filter on any other field - in
the UI, a field in the **Filters** zone - filters the whole report.

### Top N and value filters work within groups

A value filter on a field of an axis works **within each item of the field above it**, as in Excel:
with Region and Country on rows, "top 3 countries" keeps three countries per region. Totals then add up
the visible items only, so a region's total is the total of its top three countries.

Top N keeps exactly N items by default (`ties: "first"`): a tie at the cut keeps the item that
appears first in the data. With `ties: "all"` every item with the value at the cut stays too, so a
top 3 may keep four items; Excel may keep all tied items. The report says what a top N does to totals and percentages in a note above the
table ("Country shows the top 5 only: ...").

## Sorting

```json
"sort": [
    { "field": "Region", "by": "label", "order": "asc" },
    { "field": "Country", "by": "value", "order": "desc", "value": { "field": "Sales", "agg": "sum" } },
    { "field": "Season", "by": "custom", "items": ["Spring", "Summer", "Autumn", "Winter"] }
]
```

Each field on rows or columns is sorted on its own:

- `by: "label"` sorts by the item's label: text in natural order for the locale ("Item 2" before
  "Item 10"), numbers and dates by value. This is the default. Blank sorts last.
- `by: "value"` sorts by an aggregated value, `value` naming which one (default: the view's first).
  Items are sorted within their parent group.
- `by: "custom"` sorts in an order of your own, like Excel's custom lists: the `items` (named as
  filter items name them) first, in their order, then the field's other items by label. `order:
  "desc"` reverses both. Blank sorts last unless it is listed (`null`).

The menu of a row or column field writes these entries ([Sorting](../use/filters.md#sorting) has the
menu as people see it): "A to Z" and "Z to A" a `label` sort, "Largest … first" and "Smallest …
first" a `value` sort naming the value (without a value the sort counts rows), "Custom order" a
`custom` sort. A click on a header of the table writes the same entries
([sort with a click on a header](../use/filters.md#sort-with-a-click-on-a-header)): a value's name a
`value` sort of the innermost row field (`desc`, then `asc`, then no entry), a row field's name a
`label` sort. "Custom order" is offered when the view has a custom sort for the field or the host
gives the field an order: `fieldDefaults: { Season: { order: ["Spring", "Summer", "Autumn", "Winter"]
} }`. A field with such an order is sorted in it as soon as it is placed on Rows or Columns, as a
`custom` sort in the view, so a saved template keeps it. A view or template that has the field on
Rows or Columns without a sort entry for it gets the same `custom` sort when the report shows it; "A
to Z" in the menu is then kept as a sort entry of its own, so the host's order does not come back.

## Filters in the UI

The filter and Top N as people use them - the list of values with their row counts, the quick
choices of a date, the rules, **Top items**, numbers typed in the report's language, what Clear picks
and Remove the rules take away - are on [Filters, top N and sorting](../use/filters.md) under Use a
report. What they write into the view:

| In the UI | In the view |
| --- | --- |
| Values ticked in the filter | An `in` filter with `not: true` of the values **not** ticked, as Excel does: a value that appears in later data is shown. "(blank)" ticked off is `blanks: "exclude"`, else `"include"`. With every value ticked, the field has no item filter at all; a field in the Filters zone without a filter holds `{ "type": "in", "items": [], "not": true, "blanks": "include" }`. |
| Quick choices of a date field: This year, Last N years, Last N months, Last N days | One `relative` filter (`year` 1, `year` N, `month` N, `day` N) in place of the field's `relative` filters; All removes them. "Counted back from the latest record" is its `anchor: "latest"` (today is no `anchor`). The field's first `relative` filter of a unit the choices offer is the quick choice; the `compare` filters and any other range are rules. |
| Years combined of a grouping that repeats every year (month of the year) | `compare` filters with calendar days on the grouping: `between` the first and the last year ticked (Jan 1 to Dec 31), a `between` with `not: true` for each gap; every year ticked writes none. |
| Rule "Released by year is from 2022" (compare the item itself) | A `compare` filter; "is in the last N years" a `relative` filter. |
| Rule "Count of Released is greater than 3" (compare its total) | A `value` filter, `by` the value chosen; between writes the smaller number into `value`. The number is compared with the aggregated result as the engine computes it, not with a "show values as" percentage. |
| Rule "The name contains …" (a rule on the name) | A `text` filter: `on: "value"` for a text field, `on: "label"` for any other (a number as the table shows it), with case and whitespace ignored (`match: { case: "insensitive", whitespace: "collapse" }`). "is not" and "does not contain" are `equals` and `contains` with `not: true`; "is not" and "is not between" of the other rules are `=` and `between` with `not: true`. |
| Top items (Top 3, Top 5, Top 10, Top N…) | A `top` filter, `by` the value chosen; Off removes it. |
| Remove (beside Rules in the Filter level) | Removes the field's `text`, `compare`, `relative` and `value` filters except the quick choice's `relative` filter (or Years combined's `compare` filters); Clear (beside Pick items) its `in` filters; Reset filter (in the summary) all of them and a `blank` filter; `top` stays. |

The rules write `blanks: "exclude"`; a rule loaded with other `blanks` keeps them when it is edited.
The menus offer no rule for `blank`, `beginsWith` or `endsWith` with `not`, `blanks: "only"` or a
text rule that is case-sensitive yet: a view that has one shows it among the rules (a `not` the menus
have no word for as "not (…)"), and it can be removed there.

A field keeps its filters when it moves between Rows, Columns and Filters. A field that leaves the
report takes its filters and its sort with it; moved to Values, it leaves its filters behind.

---
title: Filters, top N and sorting
description: Item filters, text conditions, value conditions and top N in a pivotkit view, how they interact with totals, and how rows and columns are sorted.
---

# Filters, top N and sorting

## Filters

A view's `filters` are a list; every filter names a field and a `type`, and all of them apply
together (and). Item, text, comparison and date range filters drop source rows before anything is
computed; value filters and top N drop whole groups after the values are aggregated.

```json
"filters": [
    { "field": "Region", "type": "include", "items": ["North", null] },
    { "field": "Status", "type": "exclude", "items": ["Retired"] },
    { "field": "Rep", "type": "label", "op": "contains", "value": "an" },
    { "field": "Released by year", "type": "compare", "op": ">=", "value": 2022 },
    { "field": "Released", "type": "relative", "unit": "year", "count": 5 },
    { "field": "Region", "type": "value", "op": ">", "value": 1000 },
    { "field": "Country", "type": "top", "count": 5, "bottom": false }
]
```

| `type` | What |
| --- | --- |
| `include` | Keep only the listed `items`; `null` is (blank). |
| `exclude` | Drop the listed `items`. |
| `label` | A text condition on the label. `op`: `equals`, `notEquals`, `contains`, `notContains`, `beginsWith`, `endsWith`. |
| `compare` | The item itself compared with `value`: a number, a date or a grouping's key. `op` as `value`'s, `value2` with `between` and `notBetween`. |
| `relative` | The dates of the last `count` years, months or days (`unit`: `year`, `month`, `day`), today's included; with `anchor: "latest"` counted back from the latest date of the field's data instead of today. |
| `value` | A condition on an aggregated value. `op`: `=`, `!=`, `>`, `>=`, `<`, `<=`, `between`, `notBetween` (with `value2`). |
| `top` | Keep the `count` largest items, or with `bottom: true` the smallest. |

`value` and `top` rank by `by`, a value reference such as `{ "field": "Sales", "agg": "sum" }`; without
it they use the view's first value.

### Compare an item

`compare` keeps the items of a number or date field that pass a comparison: `=`, `!=`, `>`, `>=`,
`<`, `<=`, `between` and `notBetween` (both bounds included, in either order, as a value condition).
What is compared:

- A number field: the number (a text of one, `"2022"`, is read as the number). A grouping of numbers (ranges) compares each range by its lower bound.
- A date field: the calendar day. `value` is a date, `"2022-03-01"`; a time in it is left out, so
  "before 2022-03-01" keeps every row of 28 February and none of 1 March, whatever its clock time.
- A date grouping: its key, the number the grouping gives each item: a year `2022`, a month `202503`
  (year × 100 + month), a quarter `20251` (year × 10 + quarter), a week `202512` (ISO year × 100 +
  week), the cyclic ones their number (month `3`, weekday `1` for Monday); a day is a date. With a
  calendar day as the value (`"2025-01-01"`) the grouping is compared by its **source dates**
  instead, as a relative range filters them: `between "2025-01-01" and "2025-12-31"` on a
  month-of-the-year grouping keeps the rows of 2025, so January is January 2025 alone (the Filter
  level's Years combined writes these). A day and a key in one comparison is no comparison.

A blank item (no value) is never kept by a comparison, not even by `!=` or `notBetween`, as a value
condition never keeps a group without a value. Only number and date fields can be compared; a text
field has the `label` conditions.

### Relative date ranges

`relative` keeps the dates of a range that moves with today, so a saved report stays right next
year: `{ "unit": "year", "count": 5 }` is this year and the four before it, `{ "unit": "month",
"count": 1 }` this month, `{ "unit": "day", "count": 7 }` today and the six days before it. A range
ends with the end of the current year, month or day, so later dates of this year are in "this year".

On a date grouping ("Released by year") the range filters the grouping's **source dates**: with
"the last 18 months" on a year grouping, the oldest year keeps only its months in the range, and its
total counts only those.

Today is the wall clock of `computePivot`'s `options.now` in the data's time zone (the `timeZone` of
`encode()`, default UTC), never the machine's zone: the same data and `now` give the same result
everywhere. Without `now` it is the current time. `relativeDateRange(unit, count, { now, timeZone })`
says which days a range keeps, for a UI's "last 5 years (2022–2026)".

A range counts back from today by default (`anchor: "today"`, not written): a saved report refreshes
with the calendar. For data that end - an archive, a closed year - `anchor: "latest"` counts back
from the latest date of the field's data instead: `{ "unit": "month", "count": 12, "anchor":
"latest" }` on data that end on 2025-12-31 is January to December 2025, whatever the day. On a
grouping, the latest date is the source dates' latest. An anchor that is neither is the issue
`filterRelativeAnchor`, and the filter is left out. `relativeDateRange` takes the same `anchor`
with `latest`, the data's latest date (a `Date`, epoch milliseconds, an ISO string or the wall-clock
milliseconds a date column holds).

A filter on a field that is on rows or columns filters that axis. A filter on any other field - in
the UI, a field in the **Filters** zone - filters the whole report.

### Top N and value filters work within groups

A value filter on a field of an axis works **within each item of the field above it**, as in Excel:
with Region and Country on rows, "top 3 countries" keeps three countries per region. Totals then add up
the visible items only, so a region's total is the total of its top three countries.

Top N keeps exactly N items. A tie at the cut keeps the item that appears first in the data; Excel may
keep all tied items. The report says what a top N does to totals and percentages in a note above the
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
| Values ticked in the filter | An `exclude` filter of the values **not** ticked, as Excel does: a value that appears in later data is shown. With every value ticked, the field has no item filter at all. |
| Quick choices of a date field: This year, Last N years, Last N months, Last N days | One `relative` filter (`year` 1, `year` N, `month` N, `day` N) in place of the field's `relative` filters; All removes them. "Counted back from the latest record" is its `anchor: "latest"` (today is no `anchor`). The field's first `relative` filter of a unit the choices offer is the quick choice; the `compare` filters and any other range are rules. |
| Years combined of a grouping that repeats every year (month of the year) | `compare` filters with calendar days on the grouping: `between` the first and the last year ticked (Jan 1 to Dec 31), a `notBetween` for each gap; every year ticked writes none. |
| Rule "Released by year is from 2022" (compare the item itself) | A `compare` filter; "is in the last N years" a `relative` filter. |
| Rule "Count of Released is greater than 3" (compare its total) | A `value` filter, `by` the value chosen; between writes the smaller number into `value`. The number is compared with the aggregated result as the engine computes it, not with a "show values as" percentage. |
| Rule "The name contains …" (a rule on the name) | A `label` filter. |
| Top items (Top 3, Top 5, Top 10, Top N…) | A `top` filter, `by` the value chosen; Off removes it. |
| Remove (beside Rules in the Filter level) | Removes the field's `label`, `compare`, `relative` and `value` filters except the quick choice's `relative` filter (or Years combined's `compare` filters); Clear (beside Pick items) its `include` and `exclude` filters; Reset filter (in the summary) all of them; `top` stays. |

A field keeps its filters when it moves between Rows, Columns and Filters. A field that leaves the
report takes its filters and its sort with it; moved to Values, it leaves its filters behind.

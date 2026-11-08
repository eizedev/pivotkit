---
title: Filters, top N and sorting
description: Item filters, text conditions, value conditions and top N in a pivotkit view, how they interact with totals, and how rows and columns are sorted.
---

# Filters, top N and sorting

## Filters

A view's `filters` are a list; every filter names a field and a `type`. Item and text filters drop
source rows before anything is computed; value filters and top N drop whole groups after the values
are aggregated.

```json
"filters": [
    { "field": "Region", "type": "include", "items": ["North", null] },
    { "field": "Status", "type": "exclude", "items": ["Retired"] },
    { "field": "Rep", "type": "label", "op": "contains", "value": "an" },
    { "field": "Region", "type": "value", "op": ">", "value": 1000 },
    { "field": "Country", "type": "top", "count": 5, "bottom": false }
]
```

| `type` | What |
| --- | --- |
| `include` | Keep only the listed `items`; `null` is (blank). |
| `exclude` | Drop the listed `items`. |
| `label` | A text condition on the label. `op`: `equals`, `notEquals`, `contains`, `notContains`, `beginsWith`, `endsWith`. |
| `value` | A condition on an aggregated value. `op`: `=`, `!=`, `>`, `>=`, `<`, `<=`, `between`, `notBetween` (with `value2`). |
| `top` | Keep the `count` largest items, or with `bottom: true` the smallest. |

`value` and `top` rank by `by`, a value reference such as `{ "field": "Sales", "agg": "sum" }`; without
it they use the view's first value.

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

The filter, the value condition and Top N as people use them - the list of values with their row
counts, the text condition, **Value condition…**, **Show top items…**, numbers typed in the
report's language, what Remove takes away - are on [Filters, top N and sorting](../use/filters.md)
under Use a report. What they write into the view:

| In the UI | In the view |
| --- | --- |
| Values ticked in the filter | An `exclude` filter of the values **not** ticked, as Excel does: a value that appears in later data is shown. With every value ticked, the field has no item filter at all. |
| Text condition, Condition on the label | A `label` filter. |
| Value condition… | A `value` filter, `by` the value chosen; between writes the smaller number into `value`. The number is compared with the aggregated result as the engine computes it, not with a "show values as" percentage. |
| Show top items… | A `top` filter, `by` the value chosen. |
| Remove (next to "Filter: …") | Removes the field's `include`, `exclude`, `label` and `value` filters; `top` stays. |

A field keeps its filters when it moves between Rows, Columns and Filters. A field that leaves the
report takes its filters and its sort with it; moved to Values, it leaves its filters behind.

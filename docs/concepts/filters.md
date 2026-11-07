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
    { "field": "Country", "by": "value", "order": "desc", "value": { "field": "Sales", "agg": "sum" } }
]
```

Each field on rows or columns is sorted on its own:

- `by: "label"` sorts by the item's label: text in natural order for the locale ("Item 2" before
  "Item 10"), numbers and dates by value. This is the default. Blank sorts last.
- `by: "value"` sorts by an aggregated value, `value` naming which one (default: the view's first).
  Items are sorted within their parent group.

In the UI the menu of a row or column field offers "A to Z", "Z to A" (or "Oldest first", "Newest
first" for dates) and "Largest first", "Smallest first" for each value.

## Filters in the UI

The filter of a field shows its values with their row counts, a search, select all or none, "only
this value", and a text condition. [Using the report](../guide.md#filters) shows it.

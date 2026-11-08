---
title: Dates and number ranges
description: Group dates by year, quarter, month, week, day, hour or weekday, along the time line or across years, and numbers into ranges - as derived fields of a view.
---

# Dates and number ranges

A date is rarely useful on an axis as it is: 4,000 tickets have 4,000 timestamps. pivotkit groups dates
and numbers into **derived fields**: new fields of the view, computed from a source column, which
then go on rows or columns like any other field.

```json
{
    "rows": ["Created by month"],
    "derived": [{ "name": "Created by month", "field": "Created", "by": "yearMonth" }]
}
```

`name` is how the derived field is used in `rows`, `cols`, `filters` and `sort`; `field` is the source
column; `by` is the unit.

## Date units

Along the time line, each value is one period of one year:

| `by` | Label | |
| --- | --- | --- |
| `year` | 2025 | |
| `yearQuarter` | Q1 2025 | |
| `yearMonth` | Jan 2025 | "Jan. 2025" in German |
| `yearWeek` | 2025-W03 | ISO 8601 week and its year |
| `day` | the date | |

Across years, each value repeats every year (or every day), for comparing periods:

| `by` | Label | |
| --- | --- | --- |
| `quarter` | Q1 | |
| `month` | Jan | in the locale's language |
| `week` | W01 | ISO 8601 week |
| `weekday` | Mon | Monday first |
| `hour` | 09:00 | |

Labels follow the locale; the keys stay numbers that sort in time. The "Q" of quarters and the "W" of
weeks are the same in every locale, since Intl has no names for them.

## Grouping when a date is placed

In the UI a date is grouped as soon as it is put on rows or columns, by the span of its values: up to
62 days by day, up to two years by month, up to six years by quarter, longer by year. The chip says so
("Created by month"), and its menu changes the unit or takes the grouping off. `suggestDateUnit(data,
field)` in pivotkit-core makes the same choice.

## Number ranges

```json
{ "name": "Amount band", "field": "Amount", "by": "bin", "size": 100, "origin": 0 }
```

`size` is the width of a range and `origin` where the ranges start. A range includes its lower bound
and excludes the upper one, computed in the decimals of `size` and `origin`, so 0.3 lands in
"0.3 – 0.4" for a size of 0.1. Sizes below 1e-9 are refused. In the UI, the level "Number ranges" in the menu of
a number field on rows or columns sets them, the size and "Starting at" (Excel's name for `origin`);
the chip then reads "Amount (by 100)". A new size keeps the start; an empty start is 0. **Remove ranges**, or Apply with no size, takes the ranges
away again (one undo step). A start so
far from the field's numbers that the bounds of a range can no longer be told apart (1e17 for
magnitudes in ranges of 0.5) would leave every row blank: the form refuses it with a note.

Range labels use the locale's thousands separators ("10,000 – 20,000"), except when every range of
the field has whole-number bounds between -9,999 and 9,999: ranges of years, ages or scores read
"1900 – 1910", as a year on an axis reads "1960".

## Dates and time zones

Dates are wall-clock time: a ticket created at 09:00 is grouped as 09:00, whatever zone the reader is
in. How dates from different sources are read, and what to pass when your dates are instants, is in
[Locale, time zones, limits and errors](limits.md#time-zones).

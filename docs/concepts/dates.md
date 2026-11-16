---
title: Dates and number ranges
description: Group dates by year, quarter, month, week, day, hour or weekday, along the time line or across years, and numbers into ranges - as derived fields of a view.
---

# Dates and number ranges

A date is rarely useful on an axis as it is: 4,000 tickets have 4,000 timestamps. pivotkit groups dates
and numbers into **derived fields**. A derived field is a new field of the view, computed from a source
column. It goes on rows or columns like any other field.

```json
{
    "rows": ["Created by month"],
    "derived": [{ "name": "Created by month", "field": "Created", "by": "yearMonth" }]
}
```

- `name` is the name you use for the derived field in `rows`, `cols`, `filters` and `sort`.
- `field` is the source column.
- `by` is the unit.

## Date units

Along the time line, each value is one period of one year:

| `by` | Label | |
| --- | --- | --- |
| `year` | 2025 | |
| `yearQuarter` | Q1 2025 | |
| `yearMonth` | Jan 2025 | "Jan. 2025" in German |
| `yearWeek` | 2025-W03 | ISO 8601 week and its year |
| `day` | the date | |

Across years, each value repeats every year, or every day. Use these units to compare
periods. The rows of every year of the data land in the same item: `quarter` 1 holds Q1 2024 and
Q1 2025. Nothing in the result says which years it spans.

- To show one year, keep a `year` grouping of the same column in `filters`.
- To set years side by side, put `year` on one axis and `quarter` or `month` on the other
  ([the steps in the UI](../use/values.md#dates-and-number-ranges)).

| `by` | Label | |
| --- | --- | --- |
| `quarter` | Q1 | |
| `month` | Jan | in the locale's language |
| `week` | W01 | ISO 8601 week |
| `weekday` | Mon | Monday first |
| `hour` | 09:00 | |

Labels follow the locale. The keys stay numbers that sort in time. The "Q" of quarters and the "W" of
weeks are the same in every locale, because Intl has no names for them.

Every label writes a year before 1 AD with its era, as the locale writes it. Without the era, 2 BC
would read as the year 2. This holds for the labels of groupings and of dates:

- `year`: "2 BC" ("2 v. Chr." in German)
- `yearQuarter`: "Q1 2 BC"
- `yearMonth`: "Jan 2 BC"
- `yearWeek`: "2 BC-W02"
- a date: "Jan 11, 2 BC"

Years from 1 AD have no era in the label. The key stays the astronomical year, so the periods sort in
time: 0 is 1 BC, -1 is 2 BC. The year of a grouping is Gregorian even in a locale with another
calendar, because its key is Gregorian.

## Grouping when a date is placed

In the UI, the report groups a date as soon as you put it on rows or columns. The span of its values
picks the unit:

| Span of the values | Unit |
| --- | --- |
| up to 62 days | day |
| up to two years | month |
| up to six years | quarter |
| longer | year |

The chip names the unit ("Created by month"). Its menu changes the unit or takes the grouping off.
`suggestDateUnit(data,
field)` in pivotkit-core makes the same choice.

## Number ranges

```json
{ "name": "Amount band", "field": "Amount", "by": "bin", "size": 100, "origin": 0 }
```

- `size` is the width of a range.
- `origin` is where the ranges start.

A range includes its lower bound and excludes the upper one. pivotkit computes the bounds in the
decimals of `size` and `origin`, so 0.3 lands in "0.3 – 0.4" for a size of 0.1. pivotkit refuses sizes
below 1e-9.

In the UI, you set the ranges in the level "Number ranges" of the menu of a number field on rows or
columns:

- The size sets `size`.
- "Starting at" sets `origin`. It is Excel's name for it.
- The chip then reads "Amount (by 100)".
- A new size keeps the start. An empty start is 0.
- **Remove ranges**, or Apply with no size, takes the ranges away again in one undo step.

A start can be so far from the field's numbers that the bounds of a range can no longer be told apart,
for example 1e17 for magnitudes in ranges of 0.5. That would leave every row blank, so the form refuses
it with a note.

Range labels use the locale's thousands separators ("10,000 – 20,000"). The exception: every range of
the field has whole-number bounds between -9,999 and 9,999. Then the labels have no separators, so
ranges of years, ages or scores read "1900 – 1910", as a year on an axis reads "1960".

## Dates and time zones

Dates are wall-clock time. pivotkit groups a ticket created at 09:00 as 09:00, whatever zone the
reader is in. [Locale, time zones, limits and errors](limits.md#time-zones) explains how pivotkit reads
dates from different sources, and what to pass when your dates are instants.

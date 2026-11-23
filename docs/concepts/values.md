---
title: "Values: aggregators, show as, formats"
description: How pivotkit computes the numbers in the cells - aggregators, "show values as" calculations, number formats, colour scales and data bars - and how they reach Excel.
---

# Values: aggregators, show as, formats

A value in the view says what goes into the cells:

- a field and an aggregator
- optionally a calculation on top ("show values as"), a format, a name and highlighting

```json
{
    "field": "Revenue",
    "agg": "sum",
    "format": "currency:EUR",
    "label": null,
    "showAs": { "type": "percentOfGrandTotal" },
    "conditional": { "type": "dataBar" }
}
```

Every aggregator skips blank values. A cell with rows but no numbers is 0 for a sum. It is empty for
an average, a median, a minimum, a maximum or a variance. Excel shows `#DIV/0!` or 0 there.

A report can hold several values. They appear side by side under every column. The same field can
appear more than once, for example as the sum and the average of a cost.

## Aggregators

| `agg` | Shown as | Fits | Notes |
| --- | --- | --- | --- |
| `count` | Count | every field | Rows with a value in the field. |
| `countUnique` | Count Unique | every field | Distinct values. |
| `listUnique` | List Unique | every field | The distinct values as text. |
| `sum` | Sum | numbers | Adds up. |
| `average` | Average | numbers, dates | |
| `median` | Median | numbers, dates | |
| `min`, `max` | Min, Max | numbers, dates | |
| `stdev`, `stdevp` | StdDev, StdDevP | numbers | Standard deviation of a sample, of a population. |
| `var`, `varp` | Var, VarP | numbers | Variance of a sample, of a population. |
| `first`, `last` | First, Last | every field | The value of the first or last row in data order. |

The report's value menu offers sum, count, average, minimum and maximum first. It puts the rest under
"More statistics". A value takes its name from its aggregator and field ("Sum of Revenue"), unless
the view gives it a `label`.

- `aggregatorsFor(type)` in pivotkit-core lists the aggregators that fit a field type.
- `fieldDefaults` in the UI picks the aggregator a field gets when you add it, for example an average
  for a duration.

When you pick another aggregator in the value's menu:

- The report drops "show values as".
- It keeps the format while the result is in the field's unit. An average changed to a median is
  still in hours. This holds whether the user or the host's `fieldDefaults` chose the format.
- A count, a distinct count or a list starts with its own format.

## Show values as

A calculation on the aggregated values, with Excel's names:

| `showAs.type` | Shown as | What |
| --- | --- | --- |
| `percentOfGrandTotal` | % of grand total | The cell's share of the grand total. |
| `percentOfRowTotal` | % of row total | The cell's share of its row's total. |
| `percentOfColumnTotal` | % of column total | The cell's share of its column's total. |
| `percentOfParentRow` | % of parent row | The share of the group one level up on rows. |
| `percentOfParentColumn` | % of parent column | The same on columns. |
| `differenceFromPrevious` | Difference from previous | Minus the previous item along `axis`. |
| `percentDifferenceFromPrevious` | % difference from previous | The same as a percentage. |
| `runningTotal` | Running total | Adds up along `axis`. |
| `percentRunningTotal` | % running total | The running total as a share of the total. |
| `rankAscending` | Rank (smallest first) | 1 for the smallest. |
| `rankDescending` | Rank (largest first) | 1 for the largest. |

The last six walk along `axis` within each parent group. `axis` is `"rows"` or `"cols"`, Excel's
"base field". Running totals need an aggregator that adds up (`sum`, `count`). pivotkit refuses them on
an average or a median, because a running "total" of averages means nothing. The header names the
calculation: "% of grand total of Revenue".

## Formats

A view is JSON and cannot carry functions. So a value names its format:

| Format | Example | What |
| --- | --- | --- |
| `number`, `number:2` | 1,234.5 | Up to 2 decimals; with a number (up to 20) exactly that many. |
| `integer` | 1,235 | Rounded to a whole number. |
| `currency`, `currency:USD` | €1,234.50 | An ISO 4217 code, default EUR. |
| `percent`, `percent:0` | 25% | The value is a fraction (0.25); up to 1 decimal by default. |
| `percent100` | 25% | The value is a percentage already (25). |
| `compact` | 1.2M | The locale's short form. |
| `bytes` | 1.5 MB | Powers of 1024. |
| `duration`, `duration:h` | 2 h 5 min | The value in seconds, or in `ms`, `s`, `min`, `h`, `d`. |
| `date`, `datetime`, `time` | | A date value. |
| `text` | 40072 | As it is, without grouping: for identifiers. |

A value without a format gets the same decimals in every cell of its column:

| Aggregator | Decimals |
| --- | --- |
| a sum, minimum, maximum, first or last | those of the source values, at most 2 |
| an average, a median or a spread | 2 |
| a count | none |
| a percentage calculation | one |

So a sum of fractions keeps two decimals even where it adds up to a whole number: "118.00" next to
"2.33". The column lines up, as Excel's `0.00` does. `number` (up to 2 decimals) shows "118". All
formatting follows the [locale](limits.md#locale), never the machine's.

## In the value's menu

The menu of a value chip ([Values and formats](../use/values.md#the-menu-of-a-value)) shows **Show as**, **Number
format** and **Highlight** only for a value that gives a number in every cell. These values do not
get them:

- a list of distinct values
- the first or last entry of a text
- the average, median, minimum or maximum of dates

Such a value keeps Summarize by, Name and Move.

- The six calculations that walk along an axis (differences, running totals, ranks) add an **Along**
  switch, **Rows** or **Columns**. It sets the view's `axis`.
- **Number format** offers Automatic (no `format`) and nine formats: `number`, `number:0`, `number:2`,
  `currency`, `percent`, `compact`, `bytes`, `duration:h` and `duration:s`. `integer` works in a view
  and shows as `number:0`.
- Every other format of the table above works in a view (a template, a link, `fieldDefaults`) and the
  report keeps it. The menu does not offer it: `percent100`, `date`, `datetime`, `time`, `text`, a
  currency with its code (`currency:USD`), other decimals (`number:3`, `percent:0`) or other duration
  units. For such a format, the menu checks no entry. Picking one replaces it.
- **Highlight**: none, a colour scale or data bars, in the theme's colours.

## Highlighting

`conditional` colours the cells of a value, as Excel's conditional formatting does:

- `{ "type": "colorScale", "colors": ["#5a8dee", "#f4f4f4", "#e8554e"] }`: two or three colours from
  low to high. Without `colors`, or with an empty list, the report uses the theme's scale:
    - In the UI, `--pk-scale-low` and `--pk-scale-high`. By default they are the heatmap's
      light-to-strong blue, so a scale says "more", not "good" or "bad".
    - In the workbook, the same colours ([theming](../reference/theming.md#the-excel-export)).
- `{ "type": "dataBar", "color": "#638ec6" }`: a bar in each cell, its length the cell's place between
  the smallest and the largest cell of that value.

Totals get no highlighting. The XLSX export writes both kinds as Excel's native conditional formats.
So they stay live in the workbook, in the colours the report shows. A row label over several rows sits
at their top in the workbook too, as in the report.

## Export

The XLSX export writes typed cells. Their number formats show them as the grid does:

- decimals per cell for `number`, `percent` and `percent100`
- the locale's currency symbol and its place
- `compact` with Excel's thousands scaling
- the locale's date order

Where Excel cannot follow:

- The export writes `bytes` and `duration` as plain numbers. Excel cannot divide by 1024 or write
  "2 h 5 min" in a number format.
- `compact` in locales that group by ten thousand (Japanese) falls back to `General`.
- The export writes dates before 1900 as text. Dates use Excel's serial numbers, including its 1900
  leap year quirk.
- Number labels (a year on rows) stay numbers.

CSV uses the grid's locale for the separator and the decimal mark. It keeps 15 significant digits.
CSV writes these as the table shows them, rounded to the decimals of their format:

- a percent (the `percent` and `percent100` formats)
- every "show values as" value (a share, a difference, a running total, a rank)

The table's "-2.6 %" becomes `-2.6%`, which spreadsheets read back as the fraction. The XLSX keeps
their full precision, and writes a percent as the fraction with a percent number format.

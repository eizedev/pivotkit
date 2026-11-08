---
title: "Values: aggregators, show as, formats"
description: How pivotkit computes the numbers in the cells - aggregators, "show values as" calculations, number formats, colour scales and data bars - and how they reach Excel.
---

# Values: aggregators, show as, formats

A value in the view says what goes into the cells: a field, an aggregator, and optionally a
calculation on top ("show values as"), a format, a name and highlighting.

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

Blank values are skipped by every aggregator. A cell with rows but no numbers is 0 for a sum and
empty for an average, a median, a minimum, a maximum or a variance (Excel shows `#DIV/0!` or 0 there).

A report can hold several values; they appear side by side under every column. The same field can
appear more than once (the sum and the average of a cost, say).

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

The report's value menu offers sum, count, average, minimum and maximum first and folds the rest
under "More statistics". A value is named after its aggregator and field ("Sum of Revenue") unless
the view gives it a `label`. `aggregatorsFor(type)` in pivotkit-core lists what fits a field type, and
`fieldDefaults` in the UI picks the aggregator a field gets when it is added (an average for a
duration, say). Another aggregator picked in the value's menu drops "show values as" and keeps the
format while the result is in the field's unit (an average to a median: still hours), whether the
user or the host's `fieldDefaults` chose it; a count, a distinct count or a list starts with its own.

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

The last six walk along `axis` (`"rows"` or `"cols"`, Excel's "base field") within each parent group.
Running totals need an aggregator that adds up (`sum`, `count`); on an average or a median they are
refused, since a running "total" of averages means nothing. The header then names the calculation:
"% of grand total of Revenue".

## Formats

A view is JSON and cannot carry functions, so a value names its format:

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

A value without a format gets the same decimals in every cell of its column: those of the source
values (at most 2) for a sum, minimum, maximum, first or last; 2 for an average, a median or a spread;
none for a count; one for a percentage calculation. So a sum of fractions keeps two decimals also
where it adds up to a whole number ("118.00" next to "2.33"): the column lines up, as Excel's `0.00`
does; `number` (up to 2 decimals) shows "118". All formatting follows the
[locale](limits.md#locale), never the machine's.

## In the value's menu

The menu of a value chip ([Values and formats](../use/values.md#the-menu-of-a-value)) shows **Show as**, **Number
format** and **Highlight** only for a value that gives a number in every cell: not for a list of
distinct values, the first or last entry of a text, or the average, median, minimum or maximum of
dates. Such a value keeps Summarize by, Name and Move.

- The six calculations that walk along an axis (differences, running totals, ranks) add an **Along**
  switch, **Rows** or **Columns**: the view's `axis`.
- **Number format** offers Automatic (no `format`) and ten formats: `number`, `number:0`, `number:2`,
  `integer`, `currency`, `percent`, `compact`, `bytes`, `duration:h` and `duration:s`. Every other
  format of the table above works in a view (a template, a link, `fieldDefaults`) and is kept, but is
  not in the menu: `percent100`, `date`, `datetime`, `time`, `text`, a currency with its code
  (`currency:USD`), other decimals (`number:3`, `percent:0`) or other duration units. No entry is
  checked then; picking one replaces it.
- **Highlight**: none, a colour scale or data bars, in the theme's colours.

## Highlighting

`conditional` colours the cells of a value, as Excel's conditional formatting does:

- `{ "type": "colorScale", "colors": ["#f8696b", "#ffeb84", "#63be7b"] }`: two or three colours from
  low to high. Without `colors`, or with an empty list, the theme's scale is used (`--pk-scale-low`, `-mid`, `-high` in the
  UI).
- `{ "type": "dataBar", "color": "#638ec6" }`: a bar in each cell, its length the cell's place between
  the smallest and the largest cell of that value.

Totals are not highlighted. The XLSX export writes both as Excel's native conditional formats, so they
stay live in the workbook.

## Export

The XLSX export writes typed cells with number formats that show them as the grid does: decimals per
cell for `number`, `percent` and `percent100`, the locale's currency symbol and its place, `compact`
with Excel's thousands scaling, and the locale's date order. Where Excel cannot follow:

- `bytes` and `duration` are written as plain numbers: Excel cannot divide by 1024 or write
  "2 h 5 min" in a number format.
- `compact` in locales that group by ten thousand (Japanese) falls back to `General`.
- Dates before 1900 are written as text. Dates use Excel's serial numbers, including its 1900 leap
  year quirk.
- Number labels (a year on rows) stay numbers.

CSV uses the grid's locale for the separator and the decimal mark and keeps 15 significant digits.
A percent (the `percent` and `percent100` formats) and every "show values as" value (a share, a
difference, a running total, a rank) are written as the table shows them, rounded to the decimals of
their format: the table's "-2.6 %" becomes `-2.6%`, which spreadsheets read back as the fraction.
The XLSX keeps their full precision, a percent as the fraction with a percent number format.

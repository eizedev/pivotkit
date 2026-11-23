---
title: Values and formats
description: What a value computes in the cells of a pivotkit report - sum, count, average and the statistics, shares, differences, running totals and ranks, number formats, colour scales and data bars - and how dates and numbers are grouped.
---

# Values and formats

For everyone who builds reports in the browser. A field in **Values** fills the table's cells: it is
summed, counted or averaged for each row and column. A report can hold several values side by side,
also the same field twice, such as the sum and the average of a cost.

## The menu of a value { #the-menu-of-a-value }

Open a value's menu with the arrow on its chip. Its first level shows what is set; each row opens
its choices. A dot marks a setting that differs from the start.

![The menu of a value: its first level with Summarize by, Show as and Number format and what each is set to, Highlight side by side, Name, Move to and Remove field](../assets/screenshots/value-menu-light.png#only-light)
![The menu of a value: its first level with Summarize by, Show as and Number format and what each is set to, Highlight side by side, Name, Move to and Remove field](../assets/screenshots/value-menu-dark.png#only-dark)

| Row | What you set |
| --- | --- |
| **Summarize by** | how the value is computed: [sum, count, average …](#summarize-by) |
| **Show as** | a [share, difference, running total or rank](#show-as) instead of the plain value |
| **Number format** | [number, currency, percent, compact, bytes, durations](#number-format) |
| **Highlight** | a [colour scale or data bars](#highlight) |
| **Name** | a [name of your own](#name) |
| **Move to**, **Remove field** | another zone, or out of the report |

The **i** beside the value's name shows the field's description, when the application gives one.
Values are not filtered here: to filter, use a field in Rows, Columns or [Filters](filters.md).

## Change how a value is computed { #summarize-by }

| Summarize by | Computes | For |
| --- | --- | --- |
| Sum | adds up | numbers |
| Count | rows with a value in the field | every field |
| Average, Median | the mean, the middle value | numbers, dates |
| Minimum, Maximum | the smallest, the largest | numbers, dates |
| Distinct count | how many different values | every field |
| List of distinct values | the different values as text | every field |
| Standard deviation, Variance (sample or population) | the spread | numbers |
| First value, Last value | the value of the first or last row in the data's order | every field |

The first five are on the level; the others are under **More statistics**.

- **Blank values are skipped.** A cell with rows but no numbers is 0 for a sum and empty for an
  average, median, minimum, maximum or variance. Excel shows `#DIV/0!` or 0 there.
- **The name follows** ("Sum of Revenue") until you give the value a name of your own.
- **Show as is dropped** when you pick another way. The number format stays while the result keeps
  the field's unit: an average changed to a median is still in hours.
- The application may choose the first way for a field, such as an average for a duration.

## Show a share, difference or rank { #show-as }

| Show as | Shows |
| --- | --- |
| % of grand total, % of row total, % of column total | the cell's share of that total |
| % of parent row, % of parent column | the share of the group one level up |
| Difference from previous, % difference from previous | the change from the item before |
| Running total, % running total | the sum item by item, as a number or a share |
| Rank, smallest first; Rank, largest first | 1 for the smallest, or the largest |

The header says it: "% of grand total of Revenue".

- **Direction.** Differences, running totals and ranks walk along Rows or Columns within each group.
  **Along**, at the end of the level, chooses the direction.
- **A running total needs a sum or a count.** A running "total" of averages means nothing, so the
  report refuses it. A saved view or link that asks for one shows the plain value, and a note above
  the result says why ([details](behaviour.md#parts-of-a-view-that-were-not-used)).

## Format the number { #number-format }

| Number format | Example |
| --- | --- |
| Automatic | the same decimals in every cell of the column (below) |
| Number, Number with no decimals, Number with 2 decimals | 1,234.5 · 1,235 · 1,234.50 |
| Currency | €1,234.50 |
| Percent | 25% |
| Whole number (More formats) | 1,235 |
| Compact (More formats) | 1.2K |
| Bytes (More formats) | 1.5 MB |
| Duration from hours or seconds (More formats) | 2 h 5 min |

**Automatic** keeps a column aligned: a sum, minimum, maximum, first or last keeps the data's
decimals (at most 2), an average, median or spread has 2, a count none, a percentage one. So a sum of
fractions writes "118.00" next to "2.33", as Excel's `0.00` does.

Numbers, dates and currency follow the report's language, never the computer's. A saved view may
bring a format that is not in the list, such as another currency; it stays until you pick another.

**Only for numbers.** Show as, Number format and Highlight are missing for a value that does not give
a number in every cell: a list of distinct values, the first or last entry of a text, and the
average, median, minimum or maximum of dates.

## Colour the cells { #highlight }

- **Colour scale** colours each cell from light (low) to strong (high). It says "more", not "good".
- **Data bars** draw a bar whose length shows the cell's place between the smallest and the largest.

With a colour scale, **Colours** offers other colours, each shown as a strip:

| Colours | Use it for |
| --- | --- |
| Theme colours, light to dark | the default |
| Low blue, high orange | people with red-green colour blindness tell them apart |
| Low blue, high red | cold to warm, such as temperatures |
| Low red, high green | bad to good; some people cannot tell red and green apart |

Every choice keeps the text readable in the standard light and dark themes. Totals get no colour.
The **Excel export** keeps colour scales and data bars as Excel's own conditional formats.

## Give a value a name { #name }

Type the name under **Name**; it applies with Enter or when you leave the field. The **×** gives the
default name back ("Sum of Revenue"). Undo takes either back.

## Group dates and numbers { #dates-and-number-ranges }

### Dates

A date on Rows or Columns is grouped as soon as you place it. The span of the data picks the unit:
up to 62 days by day, up to two years by month, up to six years by quarter, longer by year. The chip
says it: "Created by month". **Group** in the chip's menu changes the unit; each choice shows an
example from your data.

![The Group level of a date: the data range, one item per period from year to day, the same period with the years combined, each with an example from the data](../assets/screenshots/group-level-light.png#only-light)
![The Group level of a date: the data range, one item per period from year to day, the same period with the years combined, each with an example from the data](../assets/screenshots/group-level-dark.png#only-dark)

| One item per period | Label | Same period, years combined | Label |
| --- | --- | --- | --- |
| Year | 2025 | Quarter of year | Q1 |
| Quarter | Q1 2025 | Month of year | Jan |
| Month | Jan 2025 | Week of year | W03 |
| Week | 2025-W03 | Weekday | Mon to Sun |
| Day | Jan 15, 2025 | Hour of day | 00:00 to 23:00 |

- **One item per period** keeps the years apart: Q1 2024 and Q1 2025 are two rows.
- **Years combined** puts them together: Q1 holds every first quarter, Jan every January. Use it to
  compare seasons, months or weekdays. The title says which years it combines: "Date by month of
  year · 2023–2025 combined". [Filter the years](filters.md#years-combined) to combine fewer.
- **No grouping** shows every date and time.

**Which years does the data cover?** The footer gives the first and the last date, next to the row
count: "Data before filters: Jan 1, 2023 – Dec 31, 2025". The date's **i** in the field list says
the same.

![The footer with the rows and the data's date range, the column title "Date by month of year · 2023–2025 combined"](../assets/screenshots/date-context-light.png#only-light)
![The footer with the rows and the data's date range, the column title "Date by month of year · 2023–2025 combined"](../assets/screenshots/date-context-dark.png#only-dark)

??? note "Details: date ranges, combined years and exports"
    - With more than one date in the report, the footer names the field before each range.
    - When filters leave one year, months and quarters carry it ("Jan 2025"); weekdays, hours and
      weeks stay plain and the title says "· 2025 only".
    - The years in titles are for reading. The saved view keeps the field's name, and the exported
      files hold the plain name and items, as the command line and the server write them. A chart
      image shows what the screen shows.
    - The title lists up to 32 years; gaps stay gaps ("2019, 2021–2023"). Years before 1 AD carry
      their era ("5 BC").
    - In a language with another calendar, the items of one year name their months in that calendar;
      combined months keep the Gregorian names.

**Compare one year with another.** Put the date on Rows and group it by **Year**. Add the date a
second time to Columns (**Add to Columns** in the field list's menu) and group that one by **Quarter
of year**. Each row is a year, and each column compares the same quarter across the years.

![Years as rows and the quarters of the year as columns: the average temperature of 2023, 2024 and 2025 side by side](../assets/screenshots/date-years-light.png#only-light)
![Years as rows and the quarters of the year as columns: the average temperature of 2023, 2024 and 2025 side by side](../assets/screenshots/date-years-dark.png#only-dark)

### Number ranges { #number-ranges }

**Number ranges** in the menu of a number field on Rows or Columns groups it: set the size and
**Starting at**, then **Apply**. The chip reads "Amount (by 100)".

- A range includes its lower bound and excludes the upper one: 100 is in "100 – 200".
- An empty start is 0. **Remove ranges** takes the grouping off.
- A start so far from the numbers that every row would be blank is refused, with a note.
- Type numbers as the report's language writes them ([numbers](filters.md#numbers-in-the-menus)).
- Labels use the language's thousands separators ("10,000 – 20,000"), except when every bound is a
  whole number between -9,999 and 9,999, such as years or ages ("1900 – 1910").

## See also

- [Fields, zones and the table](fields.md): where a value goes, and totals
- [Filters, top N and sorting](filters.md): filter by a total, sort by a value
- [Export](export.md): what the workbook keeps of formats and colours
- For developers: [Values in a view](../concepts/values.md) (`agg`, `showAs`, `format`,
  `conditional`, `label` and how they reach Excel and CSV), [Dates and number ranges](../concepts/dates.md)
  (units, ranges, time zones), and `fieldDefaults` in the [React props](../reference/react.md#props)
  for what a field gets when it is added

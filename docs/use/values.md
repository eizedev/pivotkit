---
title: Values and formats
description: What a value computes in the cells - sum, count, average and the statistics, "show values as" shares, differences, running totals and ranks, number formats, colour scales and data bars - and how dates and numbers are grouped.
---

# Values and formats

A field in **Values** fills the table's cells: summed, counted or averaged per row and column. Its
menu (the arrow on the chip) changes how it is computed, shows it as a share or a running total,
formats the number and colours the cells. A report can hold several values side by side, also the same
field twice (the sum and the average of a cost, say).

## The menu of a value

![The menu of a value: its first level with Summarize by, Show as and Number format and what each is set to, Highlight side by side, Name, Move to and Remove field](../assets/screenshots/value-menu-light.png#only-light)
![The menu of a value: its first level with Summarize by, Show as and Number format and what each is set to, Highlight side by side, Name, Move to and Remove field](../assets/screenshots/value-menu-dark.png#only-dark)

The menu is in levels, as a field's is, each level of choices in one column ([the menu of a field](fields.md#the-menu-of-a-row-or-column-field)):
its first level says in one row per topic what is set, and a row opens its own level, titled with the
value's name ("Sum of Revenue › Number format").

| Topic | What it offers |
| --- | --- |
| **Summarize by** | A level: sum, count, average, minimum, maximum; under them, under **More statistics**, median, distinct count, standard deviation, variance, first, last ([below](#summarize-by)). |
| **Show as** | A level: the value itself, % of grand total, % of row total, % of column total; under **More calculations** differences, running totals and ranks, and **Along** for those that walk along Rows or Columns. The **i** next to its title explains it. |
| **Number format** | A level: Automatic, number (also with no or two decimals), currency, percent; under **More formats** whole number, compact (1.2K), bytes and durations from hours or seconds; each with an example on its right. A format the view brings that is not among them ("Number, 1 decimal") is the first entry, checked. |
| **Highlight** | None, Colour scale and Data bars side by side on the first level, in the theme's colours or the value's own ([below](#highlight)). |
| **Name** | A level with the name: it applies with Enter or when you leave the field. |
| **Move to** | A level: another zone, left or right. |
| **Remove field** | The menu's last entry. |

A choice applies at once and goes back to the first level, with the focus on its row; another way
to summarize closes the menu (the value is another chip then). The rows say what is set ("Number
format · ● Currency"); the dot marks a setting that is not the one the report starts with, and a
screen reader hears ", changed". The menu's first row is the value's name with an **i**: it holds
the field's description, when the application gives one (with **Learn more** when there is a page
about it), and, while **Show explanations** is on, a paragraph that says values are not filtered
here: filter a field on Rows or Columns through its menu, or move a field to Filters. With neither,
the name stands alone.

## Summarize by

| Entry | Computes | Fits |
| --- | --- | --- |
| Sum | Adds up | numbers |
| Count | Rows with a value in the field | every field |
| Average, Median | The mean, the middle value | numbers, dates |
| Minimum, Maximum | The smallest, the largest | numbers, dates |
| Distinct count | Distinct values | every field |
| List of distinct values | The distinct values as text | every field |
| Standard deviation, Variance (sample or population) | The spread of the numbers | numbers |
| First value, Last value | The value of the first or last row in the data's order | every field |

Sum, Count, Average, Minimum and Maximum come first; the others are under **More statistics**.

- A value is named after how it is summarized and its field ("Sum of Revenue") until you give it a
  name.
- Blank values are skipped. A cell with rows but no numbers is 0 for a sum and empty for an average,
  a median, a minimum, a maximum or a variance (Excel shows `#DIV/0!` or 0 there).
- Picking another entry drops "Show as" and keeps the number format while the result is in the
  field's unit (an average to a median: still hours); a count, a distinct count or a list starts with
  its own.
- The application may pick how a field is summarized when it is added (an average for a duration,
  say).

## Show as

| Entry | Shows |
| --- | --- |
| % of grand total | The cell's share of the grand total. |
| % of row total | The cell's share of its row's total. |
| % of column total | The cell's share of its column's total. |
| % of parent row, % of parent column | The share of the group one level up. |
| Difference from previous, % difference from previous | Minus the previous item, as a number or a percentage. |
| Running total, % running total | Adds up item by item, as a number or as a share of the total. |
| Rank, smallest first; Rank, largest first | 1 for the smallest, or for the largest. |

- The header then says it: "% of grand total of Revenue".
- Differences, running totals and ranks walk along Rows or Columns within each group: **Along**
  (Rows or Columns, at the end of the Show as level) sets the direction. The **i** next to the level's
  title explains Show as.
- A running total needs a value that adds up (a sum or a count); on an average or a median it is
  refused, since a running "total" of averages means nothing. A saved view or a link that asks for one
  shows the plain value instead, and the report says so above the result: "this “Show as” needs a sum
  or a count, not Average - the plain value is shown" ([details](behaviour.md#parts-of-a-view-that-were-not-used)).

## Number format

| Entry | Example |
| --- | --- |
| Automatic | the same decimals in every cell of the column (see below) |
| Number; Number, no decimals; Number, 2 decimals | 1,234.5 · 1,235 · 1,234.50 |
| Currency | €1,234.50 |
| Percent | 25% |
| Whole number | 1,235 |
| Compact (1.2K) | 1.2K |
| Bytes (KB, MB) | 1.5 MB |
| Duration from hours, Duration from seconds | 2 h 5 min |

Whole number, Compact, Bytes and the durations are under **More formats**.

- **Automatic** gives every cell of a column the same decimals: those of the data (at most 2) for a
  sum, minimum, maximum, first or last; 2 for an average, a median or a spread; none for a count; one
  for a percentage. So a sum of fractions keeps two decimals also where it adds up to a whole number
  ("118.00" next to "2.33"): the column lines up, as Excel's `0.00` does.
- A format a saved view brought along that is not in this list (a date, text, another currency, other
  decimals) stays until you pick another; no entry is checked then.
- Numbers, dates and currency follow the report's language, never the computer's.

## Show as, format and highlight only for numbers

**Show as**, **Number format** and **Highlight** are there only for a value that gives a number in
every cell: not for a list of distinct values, the first or last entry of a text, or the average,
median, minimum or maximum of dates. Such a value keeps Summarize by, Name and Move.

## Highlight

- **Colour scale**: each cell coloured from low to high, in the theme's colours from light (low) to
  strong (high), so it says "more", not "good" or "bad".
- **Data bars**: a bar in each cell, its length the cell's place between the smallest and the
  largest cell of that value.

Totals are not highlighted. The Excel export keeps both as Excel's own conditional formats, in the
colours the report shows.

A value can bring colours of its own (a saved view's colour scale from blue to red). The choice
that is checked changes nothing, and switching to None or Data bars and back gives the value its own
colours again, as long as that earlier step is in the report's history (Undo); otherwise the theme's
colours are used.

## Name

Type a name; it applies with Enter (the menu goes back to its first level) or when you leave the
field. Escape gives back the name that applies; with nothing to give back it goes back a level. The
**×** gives the value its default name back at once ("Sum of Revenue", shown as the placeholder), as
one step Undo takes back.

## Dates and number ranges

A date on Rows or Columns is grouped as soon as it is placed, by the span of its values: up to 62
days by day, up to two years by month, up to six years by quarter, longer by year. The chip names the
grouping in words: "Created by month", in German "Erstellt nach Monat". The **Group** level of its
menu changes the unit: one column, each unit with an example of its labels on its right, under two
headings. A choice applies and closes the menu (the chip is another field then).

![The Group level of a date: along the time line year to day, the same period every year, each with an example](../assets/screenshots/group-level-light.png#only-light)
![The Group level of a date: along the time line year to day, the same period every year, each with an example](../assets/screenshots/group-level-dark.png#only-dark)

| **Along the time line** | Label | **Same period every year** | Label |
| --- | --- | --- | --- |
| Year | 2025 | Quarter of year | Q1 |
| Quarter | Q1 2025 | Month of year | Jan |
| Month | Jan 2025 | Week of year | W03 |
| Week | 2025-W03 | Weekday | Mon to Sun (Monday first) |
| Day | Jan 15, 2025 | Hour of day | 00:00 to 23:00 |

**No grouping (every date and time)** takes the grouping off. Labels follow the report's language;
the "Q" of quarters and the "W" of weeks are the same in every language.

**Along the time line** each item is one period of one year: Q1 2024 and Q1 2025 are two rows.
**Same period every year** puts the years together: Q1 is Q1 2024 and Q1 2025 in one row, Jan is
every January of the data in one, and the cell summarizes them all (the average of both quarters,
the sum of all the Januaries). This is for comparing seasons, months or weekdays with one another;
the table does not say which years it combined. So three years of data grouped by **Quarter of
year** are four rows, not twelve.

??? question "Which grouping do I need?"
    The steps below use the [weather data](../learn.md#weather) of the live demo: fourteen cities,
    one row per day from 2023 to 2025, the date in the field "Date" and the average of "Mean °C" in
    Values.

    **The quarters of one year only.**

    1. Group the date by **Quarter** (along the time line): one row per quarter, Q1 2023 to Q4 2025.
    2. Open the chip's menu › **Filter** and tick the four quarters of 2025 only (**Select none**, then
       the four), or add under **More ways to filter** the rule "Date by quarter is from Q1 2025".

    The table shows Q1 2025 to Q4 2025; the chip says "4 of 12" or "from Q1 2025".

    **One year next to another (compare 2024 with 2025).**

    1. Put the date on **Rows** and group it by **Year**.
    2. Add the date a second time, to **Columns** (**Add to Columns** in the field's menu in the
       field list), and group that chip by **Quarter of year** (or **Month of year**).

    One row per year, the columns Q1 to Q4: a row reads along one year, a column compares the same
    quarter across the years. The Grand Total row is the combined "Quarter of year" of before.

    ![Years as rows and the quarters of the year as columns: the average temperature of 2023, 2024 and 2025 side by side](../assets/screenshots/date-years-light.png#only-light)
    ![Years as rows and the quarters of the year as columns: the average temperature of 2023, 2024 and 2025 side by side](../assets/screenshots/date-years-dark.png#only-dark)

    **The same period every year, but of one year only** (Quarter of year on Columns, 2025 only).

    1. Put the date on **Rows** (next to City, say) and group it by **Year**.
    2. Open that chip's menu › **Move to** › **Move to Filters**: the chip moves to Filters as "Date
       by year", with its years.
    3. Open it › **Filter** and keep only 2025 (**Only** next to 2025).

    A chip in Filters has no Group level, and a date added to Filters straight from the field list is
    grouped by the span of its dates, as on an axis (by quarter for three years; you could tick the
    four quarters of 2025 there). To filter by year, group it on Rows or Columns first and move it.

    **Which years does the data cover?**

    - Group the date by **Year** and open the chip's menu › **Filter**: the years with their row
      counts ("2023 5,110 · 2024 5,124 · 2025 5,110"). The same list for a date in Filters.
    - Or add the date to **Values** twice and summarize one by **Minimum**, the other by
      **Maximum**: the first and the last date, "Jan 1, 2023" and "Dec 31, 2025", per row or in the
      Grand Total alone.

### Number ranges

**Number ranges** in the menu of a number field on Rows or Columns opens its level: the size of the
ranges and where they start, **Starting at**, then **Apply** (both numbers apply together; the field
becomes another one, so the menu closes). The chip then reads "Amount (by 100)", and the menu's row
says it, "Ranges of 100 from 0"; its level opens filled in, with **Remove ranges**.

- A range includes its lower bound and excludes the upper one.
- A new size keeps the start; an empty start is 0. The **×** of Starting at empties it.
- **Remove ranges**, or Apply with no size, takes the ranges away again (one step Undo takes back).
  **‹ Back** or Escape leaves the level without a change.
- A start so far from the field's numbers that every row would be blank is refused with a note under
  it.
- Range labels use the language's thousands separators ("10,000 – 20,000"), except when every range
  has whole-number bounds between -9,999 and 9,999: ranges of years, ages or scores read
  "1900 – 1910".
- Numbers are typed as your language writes them ("1.000,5" in German); a plain "1000.5" works in
  every language ([numbers in menus](filters.md#numbers-in-the-menus)).

!!! note "For developers"
    The view's keys for values (`agg`, `showAs`, `format`, `conditional`, `label`), every format a view
    may name, and how they reach Excel and CSV are in
    [Values: aggregators, show as, formats](../concepts/values.md); date units, ranges and time zones
    in [Dates and number ranges](../concepts/dates.md). `fieldDefaults` sets what a field gets when it
    is added ([React props](../reference/react.md#props)).

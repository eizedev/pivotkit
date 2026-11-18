---
title: Values and formats
description: What a value computes in the cells - sum, count, average and the statistics, "show values as" shares, differences, running totals and ranks, number formats, colour scales and data bars - and how dates and numbers are grouped.
---

# Values and formats

A field in **Values** fills the table's cells. Each cell holds the field summed, counted or
averaged per row and column. The value's menu opens with the arrow on the chip. In it you can:

- change how the value is computed
- show it as a share or a running total
- format the number
- colour the cells

A report can hold several values side by side. It can also hold the same field twice, such as the
sum and the average of a cost.

## The menu of a value

![The menu of a value: its first level with Summarize by, Show as and Number format and what each is set to, Highlight side by side, Name, Move to and Remove field](../assets/screenshots/value-menu-light.png#only-light)
![The menu of a value: its first level with Summarize by, Show as and Number format and what each is set to, Highlight side by side, Name, Move to and Remove field](../assets/screenshots/value-menu-dark.png#only-dark)

The menu is in levels, like a field's menu, with each level of choices in one column. See
[the menu of a field](fields.md#the-menu-of-a-row-or-column-field). The first level has one row per
topic and says what is set. A row opens its own level, titled with the value's name
("Sum of Revenue › Number format").

| Topic | What it offers |
| --- | --- |
| **Summarize by** | A level with sum, count, average, minimum and maximum. Below them, **More statistics** holds median, distinct count, standard deviation, variance, first and last. See [below](#summarize-by). |
| **Show as** | A level with the value itself, % of grand total, % of row total and % of column total. **More calculations** holds differences, running totals and ranks. **Along** sets the direction for those that walk along Rows or Columns. The **i** next to the level's title explains it. |
| **Number format** | A level with Automatic, number (also with no or two decimals), currency and percent. **More formats** holds whole number, compact (1.2K), bytes and durations from hours or seconds. Each entry has an example on its right. A format the view brings that is not among them ("Number, 1 decimal") is the first entry, checked. |
| **Highlight** | None, Colour scale and Data bars side by side on the first level. They use the theme's colours or the value's own. See [below](#highlight). |
| **Name** | A level with the name: it applies with Enter or when you leave the field. |
| **Move to** | A level: another zone, left or right. |
| **Remove field** | The menu's last entry. |

A choice applies at once. The menu goes back to the first level, with the focus on that topic's
row. Another way to summarize closes the menu, since the value is another chip then.

The rows say what is set ("Number format · ● Currency"). The dot marks a setting that differs from
the one the report starts with, and a screen reader hears ", changed".

The menu's first row is the value's name with an **i**. The **i** holds:

- the field's description, when the application gives one, with **Learn more** when there is a page
  about it
- while **Show explanations** is on, a paragraph that says values are not filtered here. To filter,
  use the menu of a field on Rows or Columns, or move a field to Filters.

With neither, the name stands alone.

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

Sum, Count, Average, Minimum and Maximum come first. The others are under **More statistics**.

- A value takes its name from how it is summarized and from its field ("Sum of Revenue"). It keeps
  that name until you give it one.
- pivotkit skips blank values. A cell with rows but no numbers is 0 for a sum. It is empty for an
  average, a median, a minimum, a maximum or a variance. Excel shows `#DIV/0!` or 0 there.
- When you pick another entry, the value drops "Show as". It keeps the number format while the
  result stays in the field's unit: an average changed to a median is still in hours. A count, a
  distinct count or a list starts with its own format.
- The application may pick how a field is summarized when you add it, such as an average for a
  duration.

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
- Differences, running totals and ranks walk along Rows or Columns within each group. **Along**, at
  the end of the Show as level, sets the direction: Rows or Columns. The **i** next to the level's
  title explains Show as.
- A running total needs a value that adds up: a sum or a count. pivotkit refuses it on an average or
  a median, since a running "total" of averages means nothing. A saved view or a link that asks for
  one shows the plain value instead. The report says so above the result: "this “Show as” needs a
  sum or a count, not Average - the plain value is shown". See
  [details](behaviour.md#parts-of-a-view-that-were-not-used).

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

- **Automatic** gives every cell of a column the same decimals:

    | Value | Decimals |
    | --- | --- |
    | Sum, minimum, maximum, first or last | those of the data, at most 2 |
    | Average, median or a spread | 2 |
    | Count | none |
    | Percentage | one |

    So a sum of fractions keeps two decimals even where it adds up to a whole number ("118.00" next
    to "2.33"). The column lines up, as with Excel's `0.00`.

- A saved view may bring a format that is not in this list, such as a date, text, another currency
  or other decimals. It stays until you pick another, and no entry is checked then.
- Numbers, dates and currency follow the report's language, never the computer's.

## Show as, format and highlight only for numbers

**Show as**, **Number format** and **Highlight** are there only for a value that gives a number in
every cell. They are missing for:

- a list of distinct values
- the first or last entry of a text
- the average, median, minimum or maximum of dates

Such a value keeps Summarize by, Name and Move.

## Highlight

- **Colour scale**: colours each cell from low to high, in the theme's colours from light (low) to
  strong (high). So it says "more", not "good" or "bad".
- **Data bars**: draws a bar in each cell. Its length shows the cell's place between the smallest
  and the largest cell of that value.

Totals get no highlight. The Excel export keeps both as Excel's own conditional formats, in the
colours the report shows.

A value can bring colours of its own, such as a saved view's colour scale from blue to red. The
checked choice changes nothing. Switching to None or Data bars and back gives the value its own
colours again, as long as that earlier step is in the report's history (Undo). Otherwise the value
takes the theme's colours.

## Name

Type a name. It applies with Enter, and the menu goes back to its first level. It also applies when
you leave the field. Escape gives back the name that applies. With nothing to give back, Escape goes
back a level. The **×** gives the value its default name back at once ("Sum of Revenue", shown as
the placeholder). Undo takes this back as one step.

## Dates and number ranges

pivotkit groups a date on Rows or Columns as soon as you place it. The span of its values picks the
unit:

| Span | Grouped by |
| --- | --- |
| up to 62 days | day |
| up to two years | month |
| up to six years | quarter |
| longer | year |

The chip names the grouping in words: "Created by month", in German "Erstellt nach Monat". The
**Group** level of the chip's menu changes the unit. Its first line gives the data's first and last
date and the number of days. Below is one column under two headings. Each unit shows an example from
your data on its right, such as "Q1 2024 … Q4 2025 (8)". A choice applies and closes the menu, since
the chip is another field then.

![The Group level of a date: the data range, one item per period from year to day, the same period with the years combined, each with an example from the data](../assets/screenshots/group-level-light.png#only-light)
![The Group level of a date: the data range, one item per period from year to day, the same period with the years combined, each with an example from the data](../assets/screenshots/group-level-dark.png#only-dark)

| **One item per period** | Label | **Same period, years combined** | Label |
| --- | --- | --- | --- |
| Year | 2025 | Quarter of year | Q1 |
| Quarter | Q1 2025 | Month of year | Jan |
| Month | Jan 2025 | Week of year | W03 |
| Week | 2025-W03 | Weekday | Mon to Sun (Monday first) |
| Day | Jan 15, 2025 | Hour of day | 00:00 to 23:00 |

**No grouping (every date and time)** takes the grouping off. Labels follow the report's language.
The "Q" of quarters and the "W" of weeks are the same in every language.

**One item per period** keeps the years apart: Q1 2024 and Q1 2025 are two rows.

**Same period, years combined** puts the years together. Q1 is Q1 2024 and Q1 2025 in one row. Jan
is every January of the data in one row. The cell summarizes them all: the average of both quarters,
or the sum of all the Januaries. Use it to compare seasons, months or weekdays with one another.
Three years of data grouped by **Quarter of year** are four rows, not twelve.

The field's title in the table and the chart says which years it combines: "Date by month of year ·
2023–2025 combined". The chip keeps the plain name. Its tooltip and the Group level name the years.

When filters leave one year:

- The items of a month or a quarter carry it: "Jan 2025".
- A weekday, an hour or a week keeps its items plain. The title says "Date by weekday · 2025 only".

The footer gives the first and last date of the data next to the row count. It does so when a date
is in Rows, Columns or Filters. The range is the data's before filters, as its tooltip says. The
date's **i** in the field list and the Group level show the same range.

![The footer with the rows and the data's date range, the column title "Date by month of year · 2023–2025 combined"](../assets/screenshots/date-context-light.png#only-light)
![The footer with the rows and the data's date range, the column title "Date by month of year · 2023–2025 combined"](../assets/screenshots/date-context-dark.png#only-dark)

??? note "Details of the date range and the combined years"
    - With more than one date in the report, the footer names the field before each range.
    - The name lists up to 32 years. More end in "…". Gaps stay gaps: "2019, 2021–2023".
    - The years are for reading only. The saved view keeps the field's name. The exported files
      hold the plain name and the plain items, as the command line and the server write them. The
      drill-down's title shows the years.
    - Years before 1 AD carry their era: "5 BC".
    - In a language setting with another calendar, the items of one year name their months in that
      calendar. Combined months keep the Gregorian month names, as the grouping does.

    ![The date context on a phone: the column title with the combined years, the range in the footer](../assets/screenshots/date-context-phone-light.png#only-light)
    ![The date context on a phone: the column title with the combined years, the range in the footer](../assets/screenshots/date-context-phone-dark.png#only-dark)

With one item per period, the years 0–99 and dates before year 1 keep their own periods. A year before
1 AD names its era in every label: 100 BC, Q1 100 BC, Jan 100 BC, the day Jan 11, 100 BC.

??? question "Which grouping do I need?"
    The steps below use the [weather data](../learn.md#weather) of the live demo. It has fourteen
    cities and one row per day from 2023 to 2025. The date is in the field "Date", and Values holds
    the average of "Mean °C".

    **The quarters of one year only.**

    1. Group the date by **Quarter** (one item per period). You get one row per quarter, Q1 2023 to
       Q4 2025.
    2. Open the chip's menu › **Filter**. Tick only the four quarters of 2025: **Select none**, then
       the four. Or add the rule "Date by quarter is from Q1 2025" under **More ways to filter**.

    The table shows Q1 2025 to Q4 2025. The chip says "4 of 12" or "from Q1 2025".

    **One year next to another (compare 2024 with 2025).**

    1. Put the date on **Rows** and group it by **Year**.
    2. Add the date a second time, to **Columns**, with **Add to Columns** in the field's menu in the
       field list. Group that chip by **Quarter of year** or **Month of year**.

    You get one row per year and the columns Q1 to Q4. A row reads along one year. A column compares
    the same quarter across the years. The Grand Total row is the combined "Quarter of year" from
    before.

    ![Years as rows and the quarters of the year as columns: the average temperature of 2023, 2024 and 2025 side by side](../assets/screenshots/date-years-light.png#only-light)
    ![Years as rows and the quarters of the year as columns: the average temperature of 2023, 2024 and 2025 side by side](../assets/screenshots/date-years-dark.png#only-dark)

    **The same period of one year only** (Quarter of year on Columns, 2025 only).

    1. Put the date on **Rows**, for example next to City, and group it by **Year**.
    2. Open that chip's menu › **Move to** › **Move to Filters**. The chip moves to Filters as "Date
       by year", with its years.
    3. Open it › **Filter** and keep only 2025: **Only** next to 2025.

    A chip in Filters has no Group level. A date you add to Filters straight from the field list is
    grouped by the span of its dates, as on an axis. For three years that is by quarter, and you
    could tick the four quarters of 2025 there. To filter by year, group the date on Rows or Columns
    first and then move it.

    **Which years does the data cover?**

    - The footer gives the first and the last date, "Jan 1, 2023 – Dec 31, 2025". So does the
      date's **i** in the field list.
    - Group the date by **Year** and open the chip's menu › **Filter**. It lists the years with their
      row counts ("2023 5,110 · 2024 5,124 · 2025 5,110"). A date in Filters shows the same list.
    - Or add the date to **Values** twice. Summarize one by **Minimum** and the other by
      **Maximum**. You get the first and the last date, "Jan 1, 2023" and "Dec 31, 2025", per row
      or in the Grand Total alone.

### Number ranges

**Number ranges** in the menu of a number field on Rows or Columns opens its level. Set the size of
the ranges and where they start, **Starting at**, then press **Apply**. Both numbers apply
together. The field becomes another one, so the menu closes. The chip then reads "Amount (by 100)",
and the menu's row says "Ranges of 100 from 0". The level opens filled in, with **Remove ranges**.

- A range includes its lower bound and excludes the upper one.
- A new size keeps the start. An empty start is 0. The **×** of Starting at empties it.
- **Remove ranges**, or Apply with no size, takes the ranges away again. Undo takes this back as one
  step. **‹ Back** or Escape leaves the level without a change.
- pivotkit refuses a start so far from the field's numbers that every row would be blank, with a
  note under it.
- Range labels use the language's thousands separators ("10,000 – 20,000"). The exception is when
  every range has whole-number bounds between -9,999 and 9,999: ranges of years, ages or scores read
  "1900 – 1910".
- Type numbers as your language writes them ("1.000,5" in German). A plain "1000.5" works in every
  language. See [numbers in menus](filters.md#numbers-in-the-menus).

!!! note "For developers"
    [Values: aggregators, show as, formats](../concepts/values.md) describes the view's keys for
    values (`agg`, `showAs`, `format`, `conditional`, `label`), every format a view may name, and how
    they reach Excel and CSV. [Dates and number ranges](../concepts/dates.md) describes date units,
    ranges and time zones. `fieldDefaults` sets what a field gets when it is added. See
    [React props](../reference/react.md#props).


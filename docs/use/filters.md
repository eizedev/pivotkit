---
title: Filters, top N and sorting
description: Leave values out of a pivotkit report - tick values, pick a date range such as "Last 3 months", add rules such as "from 2022" or "Sum of Revenue > 2,000,000", keep the top N - and sort rows and columns.
---

# Filters, top N and sorting

For everyone who builds reports in the browser. A filter leaves rows out of the report. Top N keeps
only the largest or smallest items. Sorting changes the order of rows and columns.

## Where a filter works

Open a field's menu and choose **Filter**. Where the field sits decides what the filter changes:

- A field in **Filters** filters the whole report. Drag a field there, or use **Add to Filters** in
  the field list's menu or **+ Add** beside the zone.
- A field in **Rows** or **Columns** filters its own items. With Region on Rows, a filter on Region
  hides regions.

A field keeps its filter when you move it between Rows, Columns and Filters. Moved to Values, or
taken out of the report, it leaves its filter behind.

![The menu of Released in Filters: the Filter row says last 12 months with its months, then Group, Move to and Remove field](../assets/screenshots/filter-zone-light.png#only-light)
![The menu of Released in Filters: the Filter row says last 12 months with its months, then Group, Move to and Remove field](../assets/screenshots/filter-zone-dark.png#only-dark)

??? info "Add to Filters, and dates in Filters"
    The field list's **Add to Filters** opens the filter first: **Apply** places the field with it,
    **Cancel** changes nothing. A field you drag into Filters keeps every item until you filter it.

    A date in Filters is grouped by the span of its dates, as on Rows. **Group** in its chip's menu
    changes the unit, for example to **Year**, to filter whole years. The new grouping starts with every
    item; Undo brings the earlier filter back.

    ![The filter of Product opened from Add to Filters in the field list: its values with row counts, a search, Select all and Select none, a condition on the names, Cancel and Apply](../assets/screenshots/add-to-filters-light.png#only-light)
    ![The filter of Product opened from Add to Filters in the field list: its values with row counts, a search, Select all and Select none, a condition on the names, Cancel and Apply](../assets/screenshots/add-to-filters-dark.png#only-dark)

The Filter level of the menu has three parts. They work together: an item stays when it is ticked
and meets every rule.

![The Filter level of the Region field: the summary card, the values with row counts under Pick items, a search, select all or none, and the folded Rules](../assets/screenshots/filter-light.png#only-light)
![The Filter level of the Region field: the summary card, the values with row counts under Pick items, a search, select all or none, and the folded Rules](../assets/screenshots/filter-dark.png#only-dark)

At the top, a summary says what the table shows of the field and why not the rest, such as
"3 of 12 months shown, 9 left out by your picks". Its small line counts the rows, as the line under the result does
("1,104 of 4,386 rows"). **Reset filter** there takes every pick, date range and rule off the field. The chip of a filtered field says the same in short: "4 of 12",
"last 2 years", "Sum of Revenue > 1,000".

![A filtered field's menu: the Filter row says 1 of 5 with its dot](../assets/screenshots/filter-state-light.png#only-light)
![A filtered field's menu: the Filter row says 1 of 5 with its dot](../assets/screenshots/filter-state-dark.png#only-dark)

## Tick the values to keep { #filter-by-values }

Under **Pick items**, untick the values to leave out, or click **Only** beside a value to keep it
alone (it shows when you point at a value or reach it with the keyboard, and always on a touch
screen). Each change applies at once. Each value shows its row count. Search finds a value in a long list. The list shows at most
300 values at a time.

The report remembers the values you left out, not the ones you kept, as Excel does. So a value that
is new in later data shows up. **Pick all again** ticks every value again.

## Pick a date range { #quick-choices-for-dates }

A date field, and a grouping of a date such as "Date by month", has **Quick choices**:

| Choice | Keeps |
| --- | --- |
| **All** | every date |
| **This year** (or quarter, month, week, day) | the current period |
| **Last 3 months** (any number and unit) | the current period and the ones before it, as whole calendar periods |
| **Next 2 years** (under More choices) | the current period and the ones after it, for dates such as end of life |
| **Before the last 2 years** (under More choices) | every date older than that |

A range moves with the calendar, so "Last 12 months" in a saved report stays right next month.
"Last 3 months" in November keeps September to November. Untick **Include the current month** to
keep August to October instead. **Rolling instead of whole calendar periods** under More choices
counts from today's date instead of whole months: Aug 12 to Nov 12.

??? info "Today, data that end, and groupings"
    Today is the day in the data's time zone. That is UTC unless the application sets another one.

    **Data that end.** For an archive or a closed year, set **Counted back from** to **the latest
    record**. Then "Last 12 months" are the last twelve months of the data, and the chip says "last 12
    months to Dec 2025". The level offers this when the data end before the current period. You can
    also count from the first record or a date of your own. The view keeps this choice, and every range of
    the field counts from it, a rule's range too.

    On a grouping, the range goes by the dates themselves: "Last 18 months" on a grouping by year keeps
    only the months of the oldest year that are in the range.

    Each choice shows the dates it keeps and its rows ("2022–2026 · 2,190 rows"), and names the dates
    without data: "last 2 years (2025; 2026 has no data)".

![More choices of EOL date by month on the end-of-life data, open with Next 2 years set: Next and Before the last with their counts and units, Rolling, and Counted back from](../assets/screenshots/filter-more-light.png#only-light)
![More choices of EOL date by month on the end-of-life data, open with Next 2 years set: Next and Before the last with their counts and units, Rolling, and Counted back from](../assets/screenshots/filter-more-dark.png#only-dark)

![The Filter level of Date by month on the weather data: the summary, the quick choices with the data's share of each and their rows, This year not offered, and Counted back from today or the latest record](../assets/screenshots/filter-dates-light.png#only-light)
![The Filter level of Date by month on the weather data: the summary, the quick choices with the data's share of each and their rows, This year not offered, and Counted back from today or the latest record](../assets/screenshots/filter-dates-dark.png#only-dark)

### Years combined { #years-combined }

Groupings that combine the years, such as month of the year or day of the week, have no date
range. **Years combined** shows one switch per year instead. Switch 2023 off, and the table combines
2024 and 2025. It shows for two to twelve years in the data; the last year that is on stays on. A rule
of your own on the grouping ("is from Jun") stays when you switch a year.

![The Filter level of Date by month of year on the weather data: Years combined with 2024 and 2025 ticked and 2023 not, the summary saying 2024–2025 combined, and the months to pick](../assets/screenshots/filter-cyclic-light.png#only-light)
![The Filter level of Date by month of year on the weather data: Years combined with 2024 and 2025 ticked and 2023 not, the summary saying 2024–2025 combined, and the months to pick](../assets/screenshots/filter-cyclic-dark.png#only-dark)

## Add rules { #value-filter }

**Rules** are sentences that must all be true for an item to stay. Add one with a button under them.
Its **×** takes it away. A line under each rule says what it keeps: "Keeps 7 of 12 months". A field
takes up to 10 rules.

<figure markdown>
<video controls muted playsinline preload="none" width="800" height="600" poster="../../assets/clips/filter-dates.png" aria-label="Video: keep the months from Jun to Aug 2024 with a rule" aria-describedby="clip-filter-dates">
<source src="../assets/clips/filter-dates.webm" type="video/webm">
Your browser cannot play this video. The caption below says what it shows.
</video>
<figcaption id="clip-filter-dates">Video without sound: in the menu of Date by month, Filter, then a rule "is between" Jun 2024 and Aug 2024. The table keeps those three months.</figcaption>
</figure>

| Rule | Example | For |
| --- | --- | --- |
| **Filter by** the item itself | "Released by year is from 2022", "Price is between 10 and 20", "Released is in the last 3 months" | numbers, dates and their groupings |
| **Filter by total** | "Region items whose Sum of Revenue is greater than 2,000,000" | every field |
| **Filter by name** | "The name does not begin with Service" | text, and numbers as the table writes them |

![The Filter level of Region scrolled to its rules: Sum of Revenue is greater than 2,000,000](../assets/screenshots/value-filter-light.png#only-light)
![The Filter level of Region scrolled to its rules: Sum of Revenue is greater than 2,000,000](../assets/screenshots/value-filter-dark.png#only-dark)

![The Filter level of Date by month of year with a rule on the total: Average of Mean °C is greater than 25, its explanation open, its line saying it keeps 0 of 12 months with the lowest and the highest total, and the red summary](../assets/screenshots/filter-rules-light.png#only-light)
![The Filter level of Date by month of year with a rule on the total: Average of Mean °C is greater than 25, its explanation open, its line saying it keeps 0 of 12 months with the lowest and the highest total, and the red summary](../assets/screenshots/filter-rules-dark.png#only-dark)

??? info "Good to know"
    - **A date compares its day.** "is before Mar 1, 2022" keeps every row of 28 February, whatever its
      time.
    - **Names ignore case and extra spaces.** "SERVER" matches "Server".
    - **A total names its value.** With several values in the report you pick one; with no value, the
      rule counts rows ("Count of rows"). A rule whose value has left the report keeps it.
    - **A total compares the computed value**, the sum or the average, not a "show as" percentage. For
      "Revenue as % of grand total", type the revenue, not 25 %.
    - **A total works within groups.** With a field above it on the same axis, a rule on the total
      applies within each item of that field, as top N does ([below](#top-n)).
    - When a rule keeps nothing, its line says why and gives the range: "Keeps 0 of 12 months – the
      totals go from 13.4 (Jan) to 22.2 (Jul)". The summary turns red.
    - **Remove** beside Rules takes the rules off. The ticked values and the date range stay.

### Items without a value { #items-without-a-value }

An item without a value shows as "(blank)". A rule on the item or its name keeps the items that
meet it, and "(blank)" meets none, so such rules leave it out. Tick **Also keep items without a
value** under the rules to keep it. A rule on the total compares the blank item's total like any
other.

![The rules of Country on the Nobel data: the name does not begin with united, and Also keep items without a value ticked with its 7 rows](../assets/screenshots/filter-blanks-light.png#only-light)
![The rules of Country on the Nobel data: the name does not begin with united, and Also keep items without a value ticked with its 7 rows](../assets/screenshots/filter-blanks-dark.png#only-dark)

To show only the items without a value, choose **Select none** under Pick items and tick "(blank)".

## Top N { #top-n }

**Top items** in the field's menu keeps the largest items: **Top 3**, **Top 5**, **Top 10**, or
**Top N…** with a number of your own and **Top** or **Bottom**. It ranks by the report's first value,
or by the value you pick there.

![The Top items level of Country: Off, Top 3 (checked, the template's), Top 5, Top 10 and Top N…, by Sum of Population, Also show items with the same value as the last one, and the items shown](../assets/screenshots/top-items-light.png#only-light)
![The Top items level of Country: Off, Top 3 (checked, the template's), Top 5, Top 10 and Top N…, by Sum of Population, Also show items with the same value as the last one, and the items shown](../assets/screenshots/top-items-dark.png#only-dark)

With a field above it on Rows, a top N keeps N items per group, and the group totals count only
those items.

??? info "Per group, ties and Reset"
    - **Per group.** With Region and Country on Rows, "top 3 countries" keeps three countries per
      region, as in Excel. A region's total is then the total of its three countries, and percentages
      count only the items shown. A note above the table says so.
    - **Ties.** Top N keeps exactly N items. At a tie at the cut, the item that comes first in the data
      stays. Tick **Also show items with the same value as the last one** to keep every tied item, so
      "Top 6" may show 7.
    - **Reset filter** leaves top N as it is. **Off** takes it away.

## Type numbers { #numbers-in-the-menus }

Type numbers the way the report's own language writes them: "1.000,5" in a German report,
"1,000.5" in an English one. Every language also reads a plain "1000.5". Anything else is refused with a hint, not guessed.

## Sort { #sorting }

### With a click on the table's header { #sort-with-a-click-on-a-header }

| Click on | First click | Then |
| --- | --- | --- |
| A value's name, such as "Sum of Revenue" | sorts the innermost field in Rows by it, largest first | smallest first, then the field's own order again |
| A column's name, such as "Jul" | sorts the rows by that column's values, largest first; rows without a value there come last | smallest first, then the field's own order |
| A field's name, such as "Region" | Z to A | back to A to Z, then Z to A again |

The **Grand Total** column's name sorts by the whole row. A value's name does nothing while Rows is
empty. An arrow before the name shows the sort; its tooltip says what the next click does. The keyboard
reaches every name with Tab, then Enter.

### In the field's menu

The menu of a row or column field offers:

- **A to Z** and **Z to A** sort by the item's name, in natural order ("Item 2" before "Item 10").
  Numbers and dates sort by value. This is the default. "(blank)" comes last.
- **Largest … first** and **Smallest … first** sort by a value, within each group. With several
  values, **Sort by value** lists them.
- **Custom order** sorts in an order the application gives the field, such as the seasons. A field
  with such an order is sorted in it when you place it. Choose A to Z to use names instead.

??? info "Values that cannot sort"
    Values that give no number cannot sort: a list of distinct values, the first or last entry of a
    text, and the average, median, minimum or maximum of dates.

Undo takes back every filter and sort step.

## See also

- [Fields, zones and the table](fields.md): where a field goes, and its menu
- [Values and formats](values.md): what a total is, and date groupings such as month of the year
- [The rows behind a number](drill-down.md): which rows a filtered cell holds
- For developers: [Filters and sorting in a view](../concepts/filters.md), how a view stores what
  this page sets

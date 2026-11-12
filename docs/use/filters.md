---
title: Filters, top N and sorting
description: Leave values out of a pivotkit report - the filter with its values and row counts, quick choices for dates such as "Last 5 years", rules such as "from 2022" or "Count of Released > 3", the top or bottom N - and sort rows and columns.
---

# Filters, top N and sorting

A filter leaves rows out of the report. Open a field's menu and choose **Filter**: for a date pick a
quick choice ("Last 2 years"), tick the values to keep, or add rules ("from 2022", "Count of Released
is greater than 3"). A field in **Filters** filters the whole report; a field on Rows or Columns
filters its own items. **Top items** keeps the largest (or smallest) N.

The menu's first level says on the Filter row what the filter keeps ("All", "4 of 12", "last 2 years
(2025; 2026 has no data)", "from 2022", "Sum of Revenue > 1,000"), with a dot when it filters; the
chip says the same words.

## Filter by values

1. Open the field's menu and choose **Filter**. A chip in **Filters** has the same menu: its Filter
   row, Move to and Remove field.
2. Under **Pick items**, untick the values to leave out, or click **Only** next to a value to keep it
   alone. **Select all** and **Select none** act on what the search finds.
3. Each change applies at once; **‹ Back** or Escape goes back to the menu's first level, and Undo
   takes a change back.

![The Filter level of the Region field: the summary card, the values with row counts under Pick items, a search, select all or none, and the folded Rules](../assets/screenshots/filter-light.png#only-light)
![The Filter level of the Region field: the summary card, the values with row counts under Pick items, a search, select all or none, and the folded Rules](../assets/screenshots/filter-dark.png#only-dark)

The level has a summary card at the top that stays in view while the rest scrolls, then three
sections that fold: **Quick choices** (dates only), **Pick items** and **Rules**.

| In the Filter level | What it does |
| --- | --- |
| The summary | In bold, what the table shows of the field: "All 12 months shown", "3 of 12 months shown", or "Nothing shown" in red. Under it, why the rest does not show, each reason with its count: "9 left out by your picks", "24 outside last 2 years (2025; 2026 has no data)", "11 left out by the rule", "2 left out by the rule on the total". With nothing shown, the one reason and the nearest value: "No month has a total Average of Mean °C that is greater than 25 – the totals go from 13.4 (Jan) to 22.2 (Jul)." The small line says the rows ("1,104 of 4,386 rows") and, for a date, the data's dates ("data Jan 1, 2023 – Dec 31, 2025"; a grouping that combines the years adds "2023–2025 combined" or "2025 only"). A screen reader hears the card as it changes. **Reset filter** at its right takes the picks, the quick choice and the rules off; Top N stays. |
| Quick choices | A date along the time line only (a date field, or a grouping by year, quarter, month, week or day), open at first: **All**, **This year**, **Last [N] years**, **Last [N] months**, **Last [N] days**, each with the days it keeps and its rows. [Below](#quick-choices-for-dates). A grouping that combines the years (month of the year, weekday, hour) has **Years combined** instead. |
| Pick items | Its header says what is picked ("3 of 12 picked", "all 12 picked"); **Clear** beside it ticks every value again. Inside: a search, **Select all**, **Select none**, and the values with their row counts; at most 300 are listed, below them "300 of 1,045 values; search to find more" says that the search finds the rest. The items a quick choice or a rule leaves out are not among them: they stand in a folded group at the end, "Left out by the rules (24) – their ticks apply again once they go", muted, their ticks kept and still yours to change. Open when the field has no rule, folded once it has one. |
| Rules | Its header says "No rules" or "● 1 rule" (the quick choice is no rule); **Remove** beside it takes the rules off, the quick choice stays. Inside, the rules as sentences that must all be true ([below](#value-filter)); the quick choice stands first among them as a line to read, "Quick choice: last 2 years (2025; 2026 has no data) – change it above". Folded while the field has no rule; the first rule or quick choice opens it and folds Pick items, the last one going does the reverse, every time the field goes from none to one and back, and a fold by hand wins until the next such change. "Change it above" scrolls to the quick choice, unfolds its section and puts the focus on the choice that is set. |

Details:

- The report remembers the values you left out, not the ones you kept, as Excel does: a value that is
  new in later data shows up. With every value ticked, the field is not filtered at all.
- The values, the quick choice and the rules all apply together: an item is kept when it is ticked
  and meets every rule. The summary counts what the table shows and says why the rest does not.
- The menu stays where it opened while you move between its levels: a taller level scrolls inside it
  instead of moving the menu to the other side of the chip; the summary stays in view.
- Escape in a text or number field gives back what applies; with nothing to give back it goes back a
  level.
- A field keeps its filters when it moves between Rows, Columns and Filters. Moved to Values, it
  leaves its filters behind. A field that leaves the report (its **x**, **Remove field**, or dragged
  back to the field list) takes its filters and its sort with it.
- On a phone the level is a sheet: one of Pick items and Rules is open at a time, and a rule's
  controls stack.

![A filtered field's menu: the Filter row says 1 of 5 with its dot](../assets/screenshots/filter-state-light.png#only-light)
![A filtered field's menu: the Filter row says 1 of 5 with its dot](../assets/screenshots/filter-state-dark.png#only-dark)

A chip in **Filters** opens the same Filter level from its menu, with **Move to** and **Remove field**:

![The menu of Released in Filters: the Filter row says last 12 months with its months, then Move to and Remove field](../assets/screenshots/filter-zone-light.png#only-light)
![The menu of Released in Filters: the Filter row says last 12 months with its months, then Move to and Remove field](../assets/screenshots/filter-zone-dark.png#only-dark)

### Filter a field that is not in the report

**Filter…** in the menu of a field in the field list opens its filter at once: its values and a
condition on the names, a draft until **Apply**, which puts the field into Filters with what you
chose; **Cancel** changes nothing. In Filters, and moved to Rows or Columns later, it keeps its
filter, and its chip opens the whole Filter level.

## Quick choices for dates

A date field, or a grouping of one along the time line ("Date by month", "Released by year"), has
quick choices above its values. They stay right over time: "Last 5 years" is this year and the four
before it, today as well as next year. Only the choices that keep at least one row are offered; a
line under them names the others and why: "This year (2026) is not offered: the data end Dec 31,
2025."

| Choice | Keeps |
| --- | --- |
| **All** | Every date (it takes the quick choice away; the rules stay). The line under it shows the data's first and last date and all rows. |
| **This year** | The dates of this year, also those later this year. |
| **Last [N] years** | This year and the N - 1 before it. Type N, from 1 to 500 (more says "Enter a whole number up to 500." and changes nothing); it applies a moment after you stop typing, or with Enter. The words follow the number: "Last 1 year", "Letztes 1 Jahr". |
| **Last [N] months** | This month and the N - 1 before it. Not offered for a grouping by year or by quarter. |
| **Last [N] days** | Today and the N - 1 before it. A date field or a grouping by day only. |

![The Filter level of Date by month on the weather data: the summary, the quick choices with the data's share of each and their rows, This year not offered, and Counted back from today or the latest record](../assets/screenshots/filter-dates-light.png#only-light)
![The Filter level of Date by month on the weather data: the summary, the quick choices with the data's share of each and their rows, This year not offered, and Counted back from today or the latest record](../assets/screenshots/filter-dates-dark.png#only-dark)

- The counts start at the smallest that reaches the latest record (2 years at least, since "Last 1
  year" is This year), so a choice always keeps something.
- Each choice shows the days it keeps and its rows ("2022–2026 · 2,190 rows"). When the data do not
  cover all of them, the days with data and the ones without: "2025 (2026 has no data)". The chip,
  the summary and the menu's first level say the same: "last 2 years (2025; 2026 has no data)".
- **Counted back from** appears under the choices when the latest record lies before this month (or
  this year, for a grouping by year or quarter): **today** (the default; "last 12 months" means the
  same next month) or **the latest record** (for data that end, an archive or a closed year). From
  the latest record, "Last 12 months" is the twelve months up to it and "This year" is its year; the
  chip says "last 12 months to Dec 2025". The choice is saved with the view.
- Today is the day in the data's time zone (the report's `timeZone`, UTC unless the application
  says otherwise), not your computer's.
- On a grouping, the range goes by the dates themselves: with "Last 18 months" on a grouping by year,
  the oldest year shows only its months in the range.
- The arrow keys move between the choices and apply each, as radio buttons do; Tab goes to a count.
- Undo, or a rule that changes the range, shows in the choices and their counts at once, unless you
  are typing in that count. The section folds like the others; folded, its header says the choice.

### Years combined

A grouping that puts the same period of every year together (month of the year, quarter of the year,
week of the year, day of the week, hour of the day) has no quick choices: "This year" would leave a
lone December. Instead, **Years combined** shows one toggle per year in the data (with two to twelve
years), each with its rows, all on at first. Switch a year off and the table combines the others; the
summary's small line says which ("2024–2025 combined", "2025 only") and the chip says the years
("2024 to 2025"). The last year on cannot go. Under the hood this is a rule on the dates (below), not
a rule of its own: Rules says "No rules" and shows it as a line, "Quick choice: 2024–2025 combined". A rule of your own on the same grouping ("is from Jun") stays when you switch a year.

![The Filter level of Date by month of year on the weather data: Years combined with 2023, 2024 and 2025, the summary saying 2023–2025 combined, and the months to pick](../assets/screenshots/filter-cyclic-light.png#only-light)
![The Filter level of Date by month of year on the weather data: Years combined with 2023, 2024 and 2025, the summary saying 2023–2025 combined, and the months to pick](../assets/screenshots/filter-cyclic-dark.png#only-dark)

## Rules { #value-filter }

The last section of the Filter level, **Rules**, holds the rules: sentences that must all be true
for an item to stay ("Keep the months for which all of these are true:"). Add one with a button under
them; its **×** takes it away at once. Each rule has an **i** that explains what it compares, with an
example, and a line under it with what it keeps by itself: "Keeps 7 of 12 months".

| Rule | Example | Offered for |
| --- | --- | --- |
| **Compare** the item itself | "Released by year is from 2022", "Price is between 10 and 20", "Released is in the last 3 months" | Numbers and dates, and their groupings |
| **Compare its total** | "Count of Released is greater than 3" | Every field |
| **Rule on the name** | "The name contains an" | Text and numbers (the number as the table writes it) |

![The Filter level of Date by month of year with a rule on the total: Average of Mean °C is greater than 25, its explanation open, its line saying it keeps 0 of 12 months with the lowest and the highest total, and the red summary](../assets/screenshots/filter-rules-light.png#only-light)
![The Filter level of Date by month of year with a rule on the total: Average of Mean °C is greater than 25, its explanation open, its line saying it keeps 0 of 12 months with the lowest and the highest total, and the red summary](../assets/screenshots/filter-rules-dark.png#only-dark)

### Compare the item itself

- A number is typed; a date is picked as a day; a grouping offers its items ("2022", "Mar 2025"): a
  short list in a select, a list of more than twelve in a searchable list - a button with the item
  opens a search and the matches with their rows ("12 of 358 match"); the arrow keys move, Enter
  picks, Escape closes the list and leaves the rule as it is. On a phone the select stays.
- The comparisons of a number: is, is not, is greater than, is at least, is less than, is at most, is
  between, is not between. Of a date: is, is not, is after, is from, is before, is up to, is between,
  is not between, and **is in the last** N years, months or days (a range like the quick choices; the
  field's first such range is the quick choice, any other one a rule).
- A date is compared by its day: "is before Mar 1, 2022" keeps every row of 28 February, whatever its
  time.
- An item without a value ("(blank)") is never kept by a comparison; with **is not** and **is not
  between** the rule says so under it ("Blank items are not kept.").
- The **i**: a grouping along the time line "compares each month by its place on the time line"; one
  that combines the years "by its place in the year, over all the years combined"; a number "the
  value itself, not its total"; a date "by its calendar day".
- The chip says it in short: "from 2022", "2022 to 2024", "≥ 10".

### Compare its total

The rule keeps the items whose value meets it, as a sentence: "Region items whose Sum of Revenue is
greater than 2,000,000".

1. Pick the value it compares: a choice appears when the report has several values that give
   numbers; the first one is chosen. With no value in **Values** it is the **Count of rows**, named so.
2. Pick the comparison: is, is not, is greater than, is at least, is less than, is at most, is
   between, is not between.
3. Type the number, two for between. It applies a moment after you stop typing, or with Enter; the
   value and the comparison apply at once once a number is there.

![The Filter level of Region scrolled to its rules: Sum of Revenue is greater than 2,000,000](../assets/screenshots/value-filter-light.png#only-light)
![The Filter level of Region scrolled to its rules: Sum of Revenue is greater than 2,000,000](../assets/screenshots/value-filter-dark.png#only-dark)

- The **i** says what the total is: "The total is the month's Grand Total – the Average of Mean °C
  over all 14 City items and the dates Jan 1, 2023 – Dec 31, 2025, as the Grand Total row shows it –
  not a single cell." The scope names the other fields on Rows and Columns and, for a date, the
  data's dates.
- The line under the rule says what it keeps; with nothing, the totals' range: "Keeps 0 of 12 months
  – the totals go from 13.4 (Jan) to 22.2 (Jul)", written as the table writes the value. The summary
  then says the same in red.
- The chip then shows it in short, "Sum of Revenue > 1,000" (when the chip is short of room it ends
  in "…"; its whole text is in the chip's tooltip and its name for screen readers), and so does the
  Filter row of the menu.
- The number is compared with the value as it is computed - the sum, the count, the average - not
  with a "show as" percentage and not with what its format shows: for "Revenue as % of grand total",
  0.25 is no condition on 25 %, 1000 is one on the sum of revenue.
- Between keeps the items from the smaller to the larger number, in whatever order they were typed;
  the chip writes the smaller one first. Nothing changes until both numbers are there.
- Text that is no number says so under the field, and nothing applies; Escape gives back the number
  that applies. Each change is one step Undo takes back.
- A rule whose value is no longer among the report's values keeps it: the rule offers it next to the
  values, chosen.
- With a field above it on the same axis, the rule works within each item of that field (as Top N
  does); the line under the rule and the summary count by the Grand Total over the whole data.

### More about rules

- A new rule applies once it is complete (a number typed, an item picked); until then it changes
  nothing and its line says "Applies once it is complete." It scrolls into view. A rule's **×** takes
  it away and puts the focus on the first button that adds one; the last rule going folds the section
  and puts the focus on its header.
- A field takes at most 10 rules.
- The **i** of the rules shows while **Show explanations** (Options › Help) is on, as the other
  explanations do.
- The chip shows the quick choice or the first rule on the item or its name and "+1" for each more
  ("last 2 years (2025; 2026 has no data) +1", "contains “linux”"); the whole list is in the chip's
  tooltip and its name for screen readers. A rule on the total has its own badge. With room for them,
  the name and every badge show whole; when the chip is short of room (a phone), a badge in words ends
  in "…" before the field's name gets shorter, and a badge with a number ("3 of 4", "Top 5") stays
  whole.
- Pointing anywhere at a chip shows all of it as a tooltip: the field and everything set on it, in the
  words its name has for screen readers ("Month, filtered 10 of 12, 2025").
- The search of the menu finds the rules ("rule", "compare its total"), the quick choices with the
  count you type ("last 3 years", counted back as the field's range is) and, for a grouping by year,
  a year compared ("from 2022", "up to 2022", "before 2022", "after 2022"); Enter applies a found
  choice at once. A date field compares days: its rule editor picks them.
- **Remove** beside Rules takes every rule away; the values ticked and the quick choice stay. **Reset
  filter** in the summary takes all three away. **Reset filter**, **Clear** and **Remove** are greyed out while they would change nothing: Reset when nothing is picked out, no rule and no quick choice is set and all years are on, Remove when only a quick choice is set.

## Top N

**Top items** in the same menu opens its level: **Off**, **Top 3**, **Top 5**, **Top 10**, or
**Top N…** with **Top** or **Bottom** and a count of your own, and the value it goes by (a choice when
the report has several values that give numbers; the first value is the default). A choice applies at
once and the level stays open; a count applies a moment after you stop typing, or with Enter. The
menu's row then says it, "Top 10 by Sum of Revenue", and the chip shows "Top 10". Each change is one
step Undo takes back.

![The Top items level of Country: Off, Top 3 (checked, the template's), Top 5, Top 10 and Top N…, by Sum of Population](../assets/screenshots/top-items-light.png#only-light)
![The Top items level of Country: Off, Top 3 (checked, the template's), Top 5, Top 10 and Top N…, by Sum of Population](../assets/screenshots/top-items-dark.png#only-dark)

- Top N and value filters work within each item of the field above, as in Excel: with Region and
  Country on Rows, "top 3 countries" keeps three countries per region. Totals then add up the items
  shown only, so a region's total is the total of its top three countries.
- A note above the table says what a top N does to totals and percentages ("Country shows the top 5
  only: ..."). It always shows and cannot be dismissed.
- Top N keeps exactly N items. A tie at the cut keeps the item that comes first in the data; Excel may
  keep all tied items.

![Above the table: the notice that the top 3 cover these items only, and a tip with its x](../assets/screenshots/tips-light.png#only-light)
![Above the table: the notice that the top 3 cover these items only, and a tip with its x](../assets/screenshots/tips-dark.png#only-dark)

## Numbers in the menus

Numbers in the menus (the rules, the count of a quick choice, Top N, number ranges) are typed as the report's language writes
them: "1.000,5" or "1000,5" in German, "1,000.5" in English; a plain number with a point ("1000.5")
is read in every language. Anything else is no number, and the field says so under it ("Enter a
number, such as 1,234.5.") instead of guessing.

## Sorting

Click a name in the table's header to sort, or use the sort of a row or column field's menu. Both
write the same sort, which **Undo** takes back.

### Sort with a click on a header

| Click on | First click | Next clicks |
| --- | --- | --- |
| A value's name ("Sum of Revenue") | Sorts the innermost field in Rows by it, largest first | Smallest first, then the field's own order again (A to Z, or its custom order) |
| A field's name in Rows ("Region") | Z to A (A to Z is the default) | A to Z, Z to A, ... From a sort by a value or a custom order, the first click gives A to Z. |

- The third click on a value's name goes back to the field's own order: A to Z, or its custom
  order. A Z to A you chose before is not kept.
- The arrow next to the name shows the sort you chose: down for largest first or Z to A, up for
  smallest first or A to Z. Pointing at the name, or the focus on it, shows the arrow of the next
  click, and the tooltip says what it does ("Sort by Sum of Revenue: largest first", "Sort Region: Z to A"). On a touch
  screen a faint arrow marks every name that sorts.
- With a field in Columns, only the value names of the **Grand Total** column sort: the sort goes by
  the whole row, not by one column. Without the grand total column the value names do not sort.
- A value that gives no number to sort by (below) does not sort; neither does a value's name while
  Rows is empty.
- Only the name is the button, not the whole header cell. A name can still be dragged into a zone.
- With the keyboard: **Tab** to the name, then **Enter** or **Space**. A screen reader hears the
  sort on the one header whose sort you chose ("sorted descending"; a field in its own order
  "sorted other"; the default A to Z is not announced on a header) and the new order ("Region sorted: Largest Sum of Revenue
  first").

### Sort in the field's menu

The first level of a row or column field's menu:

| Entry | Sorts |
| --- | --- |
| A to Z, Z to A side by side (dates: Oldest, Newest) | By the item's label: text in natural order for the language ("Item 2" before "Item 10"), numbers and dates by value. This is the default. Blank sorts last. |
| Largest Sum of Revenue first, Smallest Sum of Revenue first | By a value, with the value's name; without a value, by the number of rows. Items are sorted within their group. With one value both stand on the first level; with more, a pair for each value that gives a number is in the level **Sort by value**, whose row names the sort in use. |
| Custom order, Custom order, reversed | In an order of its own, such as the seasons in the order of the year; in the level **Sort by value**, offered when the application gives the field an order or a view brought one. |

- The entry in use is marked: a check mark, or the raised segment of A to Z and Z to A.
- A value gives no number to sort by when it lists distinct values, takes the first or last entry of
  a text, or the average, median, minimum or maximum of dates; the menu leaves those out.
- A field with an order of its own is sorted in it as soon as it is placed on Rows or Columns; choose
  A to Z to sort it by label instead, and the report keeps that choice.

!!! note "For developers"
    The view's `filters` (`in`, `blank`, `text`, `compare`, `relative`, `value`, `top`) and `sort` (`label`,
    `value`, `custom`), and how a field gets its order (`fieldDefaults.order`), are in
    [Filters, top N and sorting](../concepts/filters.md).

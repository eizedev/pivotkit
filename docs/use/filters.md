---
title: Filters, top N and sorting
description: Leave values out of a pivotkit report - the filter with its values and row counts, quick choices for dates such as "Last 5 years", rules such as "from 2022" or "Count of Released > 3", the top or bottom N - and sort rows and columns.
---

# Filters, top N and sorting

A filter leaves rows out of the report. Open a field's menu and choose **Filter**: for a date pick a
quick choice ("Last 5 years"), tick the values to keep, or add rules ("from 2022", "Count of Released
is greater than 3"). A field in **Filters** filters the whole report; a field on Rows or Columns
filters its own items. **Top items** keeps the largest (or smallest) N.

The menu's first level says on the Filter row what the filter keeps ("All", "4 of 12", "last 5 years
(2022–2026)", "from 2022", "Sum of Revenue > 1,000"), with a dot when it filters; the chip says the
same words.

## Filter by values

1. Open the field's menu and choose **Filter**. A chip in **Filters** has the same menu: its Filter
   row, Move to and Remove field.
2. Untick the values to leave out, or click **Only** next to a value to keep it alone. **Select all**
   and **Select none** act on what the search finds.
3. Each change applies at once; **‹ Back** or Escape goes back to the menu's first level, and Undo
   takes a change back.

![The Filter level of the Region field: how many items are picked, the values with row counts, a search, select all or none, and the folded More ways to filter](../assets/screenshots/filter-light.png#only-light)
![The Filter level of the Region field: how many items are picked, the values with row counts, a search, select all or none, and the folded More ways to filter](../assets/screenshots/filter-dark.png#only-dark)

| In the Filter level | What it does |
| --- | --- |
| The first line | How many of the field's items the list keeps, and the rules in words ("4 of 5 items picked, plus last 5 years (2022–2026)"), said again by a screen reader as it changes. Under it, while there is something to take away, **Clear picks** (every value ticked again) and **Remove the rules** (every rule, the quick choice of a date too); Top N stays. |
| Quick choices | A date field (or a grouping of one) only, above the list: **All**, **This year**, **Last [5] years**, and, unless it is grouped by year or quarter, **Last [12] months**, each with the years or months it keeps ("2022–2026"). [Below](#quick-choices-for-dates). |
| The values | Each with its row count, in a list of limited height that scrolls. At most 300 are listed; below them "300 of 1,045 values; search to find more" says that the search finds the rest. |
| Search | Narrows the list; **Select all** and **Select none** then act on the values it finds (all of them, also those past the first 300). |
| **Only** | Next to each value: keeps that one alone. |
| **More ways to filter** | Folded each time the level opens (a dot on it while a rule is set); it holds the rules ([below](#value-filter)). |

Details:

- The report remembers the values you left out, not the ones you kept, as Excel does: a value that is
  new in later data shows up. With every value ticked, the field is not filtered at all.
- The values, the quick choice and the rules all apply together: an item is kept when it is ticked
  and meets every rule. The first line counts the items the list keeps; the rules can keep fewer of
  them, and the table shows which.
- The menu stays where it opened while you move between its levels: a taller level scrolls inside it
  instead of moving the menu to the other side of the chip.
- Escape in a text or number field gives back what applies; with nothing to give back it goes back a
  level.
- A field keeps its filters when it moves between Rows, Columns and Filters. Moved to Values, it
  leaves its filters behind. A field that leaves the report (its **x**, **Remove field**, or dragged
  back to the field list) takes its filters and its sort with it.

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

A date field, or a grouping of one ("Released by year"), has quick choices above its values. They
stay right over time: "Last 5 years" is this year and the four before it, today as well as next year.

| Choice | Keeps |
| --- | --- |
| **All** | Every date (it takes the quick choice and the rules on the item away). |
| **This year** | The dates of this year, also those later this year. |
| **Last [N] years** | This year and the N - 1 before it. Type N; it applies a moment after you stop typing, or with Enter. |
| **Last [N] months** | This month and the N - 1 before it. Not offered for a grouping by year or by quarter. |
| **Custom rules** | Shown, checked, while the rules hold something no quick choice says (a comparison, two ranges); a quick choice then replaces them. |

![The Filter level of Released by year: the quick choices with Last 5 years checked and its years, then the values](../assets/screenshots/filter-dates-light.png#only-light)
![The Filter level of Released by year: the quick choices with Last 5 years checked and its years, then the values](../assets/screenshots/filter-dates-dark.png#only-dark)

- Each choice shows the dates it keeps ("2022–2026", "Dec 2025–Nov 2026"); the chip and the menu's
  first level say it with them: "last 5 years (2022–2026)".
- Today is the day in the data's time zone (the report's `timeZone`, UTC unless the application
  says otherwise), not your computer's.
- On a grouping, the range goes by the dates themselves: with "Last 18 months" on a grouping by year,
  the oldest year shows only its months in the range.
- The arrow keys move between the choices and apply each, as radio buttons do; Tab goes to a count.

## Rules { #value-filter }

The last part of the Filter level, under **More ways to filter**, holds the rules: sentences that
must all be true for an item to stay ("Keep the items for which all of these are true:"). Add one
with a button under them; its **×** takes it away at once.

| Rule | Example | Offered for |
| --- | --- | --- |
| **Compare** the item itself | "Released by year is from 2022", "Price is between 10 and 20", "Released is in the last 3 months" | Numbers and dates, and their groupings |
| **Compare its total** | "Count of Released is greater than 3" | Every field |
| **Rule on the name** | "The name contains an" | Text and numbers (the number as the table writes it) |

![The rules of Released by year: is from 2022, and Release cycles is greater than 500](../assets/screenshots/filter-rules-light.png#only-light)
![The rules of Released by year: is from 2022, and Release cycles is greater than 500](../assets/screenshots/filter-rules-dark.png#only-dark)

### Compare the item itself

- A number is typed; a date is picked as a day; a grouping offers its items ("2022", "Mar 2025").
- The comparisons of a number: is, is not, is greater than, is at least, is less than, is at most, is
  between, is not between. Of a date: is, is not, is after, is from, is before, is up to, is between,
  is not between, and **is in the last** N years, months or days (a quick choice as a rule).
- A date is compared by its day: "is before Mar 1, 2022" keeps every row of 28 February, whatever its
  time.
- An item without a value ("(blank)") is never kept by a comparison.
- The chip says it in short: "from 2022", "2022 to 2024", "≥ 10".

### Compare its total

The rule keeps the items whose value meets it, as a sentence: "Sum of Revenue is greater than
2,000,000".

1. Pick the value it compares: a choice appears when the report has several values that give
   numbers; the first one is chosen. With no value in **Values** it is the **Count of rows**, named so.
2. Pick the comparison: is, is not, is greater than, is at least, is less than, is at most, is
   between, is not between.
3. Type the number, two for between. It applies a moment after you stop typing, or with Enter; the
   value and the comparison apply at once once a number is there.

![The Filter level of Region scrolled to its rules: Sum of Revenue is greater than 2,000,000](../assets/screenshots/value-filter-light.png#only-light)
![The Filter level of Region scrolled to its rules: Sum of Revenue is greater than 2,000,000](../assets/screenshots/value-filter-dark.png#only-dark)

- The chip then shows it in short, "Sum of Revenue > 1,000" (a long one ends in "…"; its whole text
  is in the chip's name for screen readers and in its tooltip), and so does the Filter row of the
  menu.
- The number is compared with the value as it is computed - the sum, the count, the average - not
  with a "show as" percentage and not with what its format shows: for "Revenue as % of grand total",
  0.25 is no condition on 25 %, 1000 is one on the sum of revenue.
- Between keeps the items from the smaller to the larger number, in whatever order they were typed;
  the chip writes the smaller one first. Nothing changes until both numbers are there.
- Text that is no number says so under the field, and nothing applies; Escape gives back the number
  that applies. Each change is one step Undo takes back.
- A rule whose value is no longer among the report's values keeps it: the rule offers it next to the
  values, chosen.

### More about rules

- A new rule applies once it is complete (a number typed, an item picked); until then it changes
  nothing. A rule's **×** takes it away and puts the focus on the first button that adds one.
- A field takes at most 10 rules.
- The chip shows the first rule on the item itself and "+1" for each more ("last 2 years (2025–2026)
  +1"); the whole list is in its tooltip and its name for screen readers. A rule on the total has its
  own badge.
- The search of the menu finds the rules ("rule", "compare its total"), the quick choices with the
  count you type ("last 3 years") and, for a date or a grouping by year, a year compared ("from
  2022", "up to 2022", "before 2022", "after 2022"); Enter applies a found choice at once.
- Remove the rules (the first line of the level) takes every rule away; the values ticked stay.

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
    The view's `filters` (`include`, `exclude`, `label`, `value`, `top`) and `sort` (`label`,
    `value`, `custom`), and how a field gets its order (`fieldDefaults.order`), are in
    [Filters, top N and sorting](../concepts/filters.md).

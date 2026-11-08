---
title: Filters, top N and sorting
description: Leave values out of a pivotkit report - the filter with its values and row counts, text conditions, value conditions such as "Sum of Revenue > 1,000", the top or bottom N - and sort rows and columns.
---

# Filters, top N and sorting

A filter leaves rows out of the report. Open a field's menu and choose the filter: tick the values to
keep, or set a condition. A field in **Filters** filters the whole report; a field on Rows or Columns
filters its own items. **Value filter…** and **Show only the top items** keep the items whose value
meets a condition, or the largest N.

## Filter by values

1. Open the field's menu and choose the filter (a chip in **Filters** opens it with a click).
2. Untick the values to leave out, or click **Only** next to a value to keep it alone. **Select all**
   and **Select none** act on what the search finds.
3. Press **Apply**. **Cancel** or Escape leaves the filter as it was.

![The filter of the Region field: values with row counts, a search, select all or none, and a text condition](../assets/screenshots/filter-light.png#only-light)
![The filter of the Region field: values with row counts, a search, select all or none, and a text condition](../assets/screenshots/filter-dark.png#only-dark)

| In the filter | What it does |
| --- | --- |
| The values | Each with its row count; "N selected" at the top. At most 300 are listed; below them "300 of 1,045 values; search to find more" says that the search finds the rest. |
| Search | Narrows the list; **Select all** and **Select none** then act on the values it finds (all of them, also those past the first 300). |
| **Only** | Next to each value: keeps that one alone. |
| Text condition | A condition on the labels: is, is not, contains, does not contain, begins with, ends with. For a text field it reads "Text condition", for a number "Condition on the label" (the number as the table writes it). A date (or a grouping of one) and a yes/no field have none: their items are chosen in the list; a condition a loaded view brings still shows, so it can be removed. |
| **Remove filter** | At the top while the field is filtered. |

Details:

- Your choice is a draft until **Apply**.
- The report remembers the values you left out, not the ones you kept, as Excel does: a value that is
  new in later data shows up. With every value ticked, the field is not filtered at all.
- The **×** in the text of a condition removes the condition at once; the values you ticked stay a
  draft until you apply them.
- While a field is filtered, its menu says what the filter keeps, in the accent colour: "Filter: 15 of
  45" or "Filter: contains “an”", with **Remove filter** right below.
- A field keeps its filters when it moves between Rows, Columns and Filters. Moved to Values, it
  leaves its filters behind. A field that leaves the report (its **x**, **Remove field**, or dragged
  back to the field list) takes its filters and its sort with it.

![A filtered field's menu: Filter: 1 of 5 in the accent colour, Remove filter right below](../assets/screenshots/filter-state-light.png#only-light)
![A filtered field's menu: Filter: 1 of 5 in the accent colour, Remove filter right below](../assets/screenshots/filter-state-dark.png#only-dark)

### Filter a field that is not in the report

**Filter…** in the menu of a field in the field list opens its filter at once. **Apply** puts it into
Filters with what you chose; **Cancel** changes nothing. Moved to Rows or Columns later, it keeps its
filter.

## Value filter

**Value filter…** in the menu of a row or column field keeps the items whose value meets a condition:
"regions with more than 2,000,000 revenue".

1. Pick the value it compares (a choice appears when the report has several values that give
   numbers; the first one is chosen).
2. Pick an operator: equals, does not equal, greater than, greater than or equal to, less than, less
   than or equal to, between, not between.
3. Type the number, two for between, and **Apply**.

![The menu of Region with its value condition: Sum of Revenue greater than 2,000,000](../assets/screenshots/value-filter-light.png#only-light)
![The menu of Region with its value condition: Sum of Revenue greater than 2,000,000](../assets/screenshots/value-filter-dark.png#only-dark)

- The chip then shows it in short, "Sum of Revenue > 1,000" (a long one ends in "…"; its whole text
  is in the chip's name for screen readers and in its tooltip), and so does the menu: "Filter: Sum of
  Revenue > 1,000".
- The number is compared with the value as it is computed - the sum, the count, the average - not
  with a "show as" percentage and not with what its format shows: for "Revenue as % of grand total",
  0.25 is no condition on 25 %, 1000 is one on the sum of revenue.
- Between keeps the items from the smaller to the larger number, in whatever order they were typed;
  the chip writes the smaller one first.
- Open the form again to change it; changing it replaces it. **Remove** (or Apply with no number)
  removes it. Each is one step Undo takes back.
- **Remove filter** in the menu removes it together with the values and the text condition; Top N
  stays.
- A field that holds no number says so under the number.
- A view may hold more than one value condition or top N for a field (from a link, say): the menu
  edits the first one and leaves the others as they are. A condition whose value is no longer among
  the report's values keeps it: the form offers it next to the values, chosen.

## Top N

**Show only the top items** in the same menu keeps the largest (or smallest) items: **Top** or
**Bottom**, how many, and by which value (a choice when the report has several values that give
numbers; the first value is the default). **Remove**, or Apply with no count, removes it; one undo
step.

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

Numbers in the menus (value condition, Top N, number ranges) are typed as the report's language writes
them: "1.000,5" or "1000,5" in German, "1,000.5" in English; a plain number with a point ("1000.5")
is read in every language. Anything else is no number, and the field says so under it ("Enter a
number, such as 1,234.5.") instead of guessing.

## Sorting

The **Sort** section of a row or column field's menu:

| Entry | Sorts |
| --- | --- |
| A to Z, Z to A (dates: Oldest first, Newest first) | By the item's label: text in natural order for the language ("Item 2" before "Item 10"), numbers and dates by value. This is the default. Blank sorts last. |
| Largest Sum of Revenue first, Smallest Sum of Revenue first | By a value, one pair for each value that gives a number, with the value's name; without a value, by the number of rows. Items are sorted within their group. |
| Custom order, Custom order, reversed | In an order of its own, such as the seasons in the order of the year; offered when the application gives the field an order or a view brought one. |

- The entry in use has a check mark.
- A value gives no number to sort by when it lists distinct values, takes the first or last entry of
  a text, or the average, median, minimum or maximum of dates; the menu leaves those out.
- A field with an order of its own is sorted in it as soon as it is placed on Rows or Columns; choose
  A to Z to sort it by label instead, and the report keeps that choice.

!!! note "For developers"
    The view's `filters` (`include`, `exclude`, `label`, `value`, `top`) and `sort` (`label`,
    `value`, `custom`), and how a field gets its order (`fieldDefaults.order`), are in
    [Filters, top N and sorting](../concepts/filters.md).

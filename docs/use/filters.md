---
title: Filters, top N and sorting
description: Leave values out of a pivotkit report - the filter with its values and row counts, text conditions, value conditions such as "Sum of Revenue > 1,000", the top or bottom N - and sort rows and columns.
---

# Filters, top N and sorting

A filter leaves rows out of the report. Open a field's menu and choose **Filter**: tick the values to
keep, set a condition on their names, or keep the items whose value meets a condition. A field in
**Filters** filters the whole report; a field on Rows or Columns filters its own items. **Top items**
keeps the largest (or smallest) N.

The menu's first level says on the Filter row what the filter keeps ("All", "4 of 12", "contains
“an”", "Sum of Revenue > 1,000"), with a dot when it filters; the chip says the same.

## Filter by values

1. Open the field's menu and choose **Filter** (a chip in **Filters** opens the filter with a click).
2. Untick the values to leave out, or click **Only** next to a value to keep it alone. **Select all**
   and **Select none** act on what the search finds.
3. Each change applies at once; **‹ Back** or Escape goes back to the menu's first level, and Undo
   takes a change back.

![The Filter level of the Region field: how many items are picked, the values with row counts, a search, select all or none, the text condition and the condition on a value](../assets/screenshots/filter-light.png#only-light)
![The Filter level of the Region field: how many items are picked, the values with row counts, a search, select all or none, the text condition and the condition on a value](../assets/screenshots/filter-dark.png#only-dark)

| In the Filter level | What it does |
| --- | --- |
| The first line | How many of the field's items the list keeps ("4 of 5 items picked"), said again by a screen reader as it changes; **Remove filter** next to it while the field is filtered: it removes the values, the text condition and the condition on a value (Top N stays). |
| The values | Each with its row count. At most 300 are listed; below them "300 of 1,045 values; search to find more" says that the search finds the rest. |
| Search | Narrows the list; **Select all** and **Select none** then act on the values it finds (all of them, also those past the first 300). |
| **Only** | Next to each value: keeps that one alone. |
| Text condition | A condition on the names: is, is not, contains, does not contain, begins with, ends with. For a text field it reads "Text condition", for a number "Condition on the label" (the number as the table writes it). It applies a moment after you stop typing, or with Enter; its **×** removes it at once. A date (or a grouping of one) and a yes/no field have none: their items are chosen in the list; a condition a loaded view brings still shows, so it can be removed. |
| Condition on a value | A sentence: "Keep Region items whose Sum of Revenue is greater than …" ([below](#value-filter)). |

Details:

- The report remembers the values you left out, not the ones you kept, as Excel does: a value that is
  new in later data shows up. With every value ticked, the field is not filtered at all.
- The first line counts the items the list keeps; a condition can keep fewer of them, and the table
  shows which.
- Escape in a text field gives back the text that applies; with nothing to give back it goes back a
  level.
- The filter of a field in **Filters** (a click on its chip, or **Filter…** in the field list) is a
  popover of its own: there the values and the condition are a draft until **Apply**, and **Remove
  filter** stands at its top while the field is filtered.
- A field keeps its filters when it moves between Rows, Columns and Filters. Moved to Values, it
  leaves its filters behind. A field that leaves the report (its **x**, **Remove field**, or dragged
  back to the field list) takes its filters and its sort with it.

![A filtered field's menu: the Filter row says 1 of 5 with its dot](../assets/screenshots/filter-state-light.png#only-light)
![A filtered field's menu: the Filter row says 1 of 5 with its dot](../assets/screenshots/filter-state-dark.png#only-dark)

### Filter a field that is not in the report

**Filter…** in the menu of a field in the field list opens its filter at once. **Apply** puts it into
Filters with what you chose; **Cancel** changes nothing. Moved to Rows or Columns later, it keeps its
filter.

## Value condition { #value-filter }

The last part of the Filter level keeps the items whose value meets a condition, written as a
sentence: "Keep Region items whose Sum of Revenue is greater than 2,000,000".

1. Pick the value it compares (a choice appears when the report has several values that give
   numbers; the first one is chosen; with no value it is the count of rows).
2. Pick the comparison: is, is not, is greater than, is at least, is less than, is at most, is
   between, is not between. **is anything** takes the condition off.
3. Type the number, two for between. It applies a moment after you stop typing, or with Enter; the
   value and the comparison apply at once once a number is there.

![The Filter level of Region scrolled to the condition on a value: Keep Region items whose Sum of Revenue is greater than 2,000,000](../assets/screenshots/value-filter-light.png#only-light)
![The Filter level of Region scrolled to the condition on a value: Keep Region items whose Sum of Revenue is greater than 2,000,000](../assets/screenshots/value-filter-dark.png#only-dark)

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
- A view may hold more than one value condition or top N for a field (from a link, say): the menu
  edits the first one and leaves the others as they are. A condition whose value is no longer among
  the report's values keeps it: the level offers it next to the values, chosen.

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

Numbers in the menus (the condition on a value, Top N, number ranges) are typed as the report's language writes
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

---
title: Fields, zones and the table
description: Put fields into Rows, Columns, Values and Filters by drag and drop, a click, a menu or + Add in each zone; what a chip shows and its menu; field descriptions; the table with its groups, totals and the swap of rows and columns.
---

# Fields, zones and the table

You build a report by putting the fields of your data into four zones:

- **Rows** and **Columns** say how the table is split.
- **Values** says what the table computes in its cells.
- **Filters** says what the whole report leaves out.

A field in a zone is a **chip**. Its menu changes how the report shows the field.

## The parts

| Part | Where | What it does |
| --- | --- | --- |
| **Fields** | left | Every column of the data, with a search and an icon for its type: text, number, date or yes/no. A mark next to a field shows which zone it is in. When the application describes a field, an **i** next to it says what the field means. A long field name takes two lines and breaks between words only. A word too long for its line ends in "…", and pointing at the name shows it whole. |
| **The zones** | below the toolbar | **Rows**, **Columns**, **Values** and **Filters**, each a shelf: its title, its **i** and **+ Add** on the left, its chips beside them. Shelves sit side by side while they fit, and a full one takes a line of its own. The **i** next to a zone's title says what the zone does, with an example. More, Help, **Show explanations** switches these off and on. The zones sit under the heading **Fields in the report**, which folds them. **Swap rows and columns** is at the right end of that heading. |
| **The toolbar** | top | Undo, Redo, Start over (Reset, New), the name of the view you loaded, Views, Export and **More**. **More** holds **Help** first, then what does not fit. See [small screens](layout.md#small-screens). |
| **The result** | below | The tabs **Table** and **Chart** on top, with the settings of the view shown, **Enlarge** and **Full screen** beside them. Tips stand above the tabs, a status line below the result. |

## Adding fields

| To put a field into a zone | How |
| --- | --- |
| Drag | Drag the field into a zone. While you drag, each zone shows a dashed outline. The lists and the page scroll while you drag, and the field you drag stays above everything. |
| Click | Click the field, or press Enter on it. Numbers go to Values, everything else to Rows. |
| Menu | Open the field's menu and choose **Add to Rows**, **Columns**, **Values** or **Filters**. To open the menu, click the three dots, or the grip left of the field, which says "Drag into a zone". |
| **+ Add** | Click **+ Add** next to a zone's title. Its menu lists every field with its type and a search. Pick a field. |

All four give the same result. Details:

- A click on a field in Columns or Filters moves it to Rows. A field that is in that zone already
  stays, and the status line says so, for example "Region is already in Rows" or
  "Revenue is already in Values". So a second click or Enter never adds it twice.
- For a field that is in Values already, the menu entry reads **Add to Values again**. It adds a
  second value of the field, for example a second "Sum of Revenue" to show it as a share.
- The report counts a number field that is an identifier instead of summing it. A field is an
  identifier when it holds whole numbers and its name ends in the word ID, Nr, No, Number, Key or
  "#". Examples: "ID", "CustomerId", "customer_id", "Order No", "Serial #", "userID2",
  "ID (Asset)".
    - You get "Count of ID" instead of a sum no one needs. **Sum** stays a choice of its menu.
    - Its numbers show as they are, 27000 and not 27,000: on Rows and Columns and in the rows behind
      a value.
    - The application can set this otherwise. See
      [field settings](../concepts/fields.md#identifier-fields).
- **Add to Filters** opens the field's filter first. **Apply** puts the field into Filters with what
  you chose. **Cancel** places nothing. See
  [Filters](filters.md#add-a-field-to-filters-from-the-field-list).
- **+ Add** works on a phone too, where the field list is a drawer. Its menu:
    - is titled for its zone, for example **Add to Rows**
    - finds a field as the field list's search does
    - marks a field that is placed already with its zone, for example "Columns". The line under it
      says "Moves it from Columns.", and after the pick a screen reader hears "Category moved from
      Columns to Rows". A field in Values stays there as well.
    - says "Adds a second value of it." under a field that is in Values already, in Values' menu
    - shows a field that is in this zone already as unavailable, with its reason ("Already in Rows").
      A date counts as the grouping it would get.
    - in Filters, opens the field's filter first. **Apply** places it, **Cancel** and **Back** return
      to the list.
    - puts the focus on the new chip after a pick, so its menu is one Enter away
- An empty report shows three first steps and up to three saved views to start from.
- The report groups a date as soon as you place it, by the span of its values:
    - up to 62 days: by day
    - up to two years: by month ("Jan 2025")
    - up to six years: by quarter
    - longer: by year

    The chip says so: "Created by month". See
    [dates and number ranges](values.md#dates-and-number-ranges).

![+ Add of Rows open: a search, every field with its type, Category marked Columns, Region and Country unavailable as they are in Rows](../assets/screenshots/add-menu-light.png#only-light)
![+ Add of Rows open: a search, every field with its type, Category marked Columns, Region and Country unavailable as they are in Rows](../assets/screenshots/add-menu-dark.png#only-dark)

## What a field means

When the application describes its fields, an **i** stands next to such a field in the list and on
its chips. Point at it, or move the focus to it with Tab, and the description appears. Click or tap
it to keep it open. When there is a page about the field, the description has **Learn more**.
Escape closes it.

- On a phone a chip has no **i**. The chip's menu has it at its top, next to the field's name. The
  field's headers in the table and in the drill-down carry the same text.
- The field search finds a field by its name, by the name the application gives it and by words of
  its description. Its **×** and Escape empty the search.
- The application may give a field a clearer name than the data's. The report uses that name
  everywhere, also in the exported files.

![A field's description next to the field list: what the World Bank counts as population, with Learn more](../assets/screenshots/field-info-light.png#only-light)
![A field's description next to the field list: what the World Bank counts as population, with Learn more](../assets/screenshots/field-info-dark.png#only-dark)

!!! note "For developers"
    Labels, descriptions and links come from `fieldDefaults` or a JSON Schema or OpenAPI document.
    See [Field descriptions and names](../concepts/fields.md).

## Chips

Every field in a zone is a chip. A chip shows what is set on it:

- "3 of 4" for a filter
- "Top 5"
- a value condition such as "Sum of Revenue > 1,000". A long condition ends in "…".
- the sort

Screen readers hear the same.

| To | Do |
| --- | --- |
| Reorder a chip or move it to another zone | Drag it. A press inside its open menu never moves it, for example when you select text or choose in a list. |
| Remove it | Drag it back to the field list, or press its **x**. A note in the status line offers Undo ("Region removed"). The focus goes to the neighbouring chip, or to the zone. |
| Change everything else | Open its menu: the arrow. |

A field that leaves the report takes its filters and its sort with it. A field leaves by its **x**,
by **Remove field**, or when you drag it to the field list.

### The menu of a row or column field

The menu is in levels. Its first level is short:

- the field's name, with an **i** when the field has a description
- a search
- one row per topic, with what is set on its right: "Filter · All", "Top items · Off"

A row opens the topic's own level in the menu's place. The level's title names the field:
"Month › Group". **‹ Back**, Escape or the left arrow key go back to the row it came from. A setting
that differs from the one the report starts with has a dot before it: "Filter · ● 4 of 12". A
screen reader hears ", changed" after it.

![A field's menu: sort A to Z and Z to A side by side, sort by the value, then Filter, Top items and Move to, each with what is set](../assets/screenshots/field-menu-light.png#only-light)
![A field's menu: sort A to Z and Z to A side by side, sort by the value, then Filter, Top items and Move to, each with what is set](../assets/screenshots/field-menu-dark.png#only-dark)

| Topic | What it offers |
| --- | --- |
| **Sort** | A to Z and Z to A side by side on the first level. For a date they read Oldest and Newest. While the field sorts by a value, the row says by which: "Largest Sum of Revenue first". |
| Sort by value | With one value in the report: "Largest Sum of Revenue first" and "Smallest Sum of Revenue first" on the first level. With more values, or a custom order: a level **Sort by value**. It has a pair for each value that gives a number. When the field has a custom order, such as the seasons in the order of the year, it also has "Custom order" and "Custom order, reversed". See [sorting](filters.md#sorting). Its row names the sort in use. |
| **Filter** | A level that starts with a summary of what shows. Then come, for a date, its quick choices, such as "Last 2 years". For a month-of-the-year grouping these are the years combined. Then the values to keep, and its rules as sentences with what each keeps: the item itself compared, its total compared, a rule on its name. See [filters](filters.md). Its row says what the filter keeps: "4 of 12", "last 2 years (2025; 2026 has no data)", "from 2022", "Sum of Revenue > 1,000". A chip in **Filters** has a menu of its own: Filter, Move to and Remove field. |
| **Group** (dates) | A level with three kinds of choice. Along the time line: year, quarter, month, week, day. The same period every year: quarter, month, week of the year, weekday, hour. Or no grouping. See [dates](values.md#dates-and-number-ranges). |
| **Number ranges** (numbers) | A level with the size of the ranges and where they start. See [ranges](values.md#number-ranges). |
| **Top items** | A level: Off, Top 3, Top 5, Top 10, or **Top N…**. **Top N…** takes a count of your own, top or bottom, by a value you choose. See [top N](filters.md#top-n). |
| **Move to** | A level: another zone, left or right. |
| **Remove field** | The menu's last entry. |

Every choice applies at once. The table behind the menu changes while the menu is open, and Undo
takes back each change as one step.

- A choice in a list goes back to the first level. The focus is on the row, which then says the new
  setting.
- A choice that makes the chip another one closes the menu, because the report replaces the chip
  the menu belongs to. Examples are a grouping, which renames the field, and a move.

The menu's head and its levels' titles name the field as the chip does: "Created by month".

The menu of a value is on [Values and formats](values.md#the-menu-of-a-value).

## The table

- The header and the row labels stay in place (sticky) while you scroll.
- Groups expand and collapse with the arrow next to them. **Table settings** has **Expand all** and
  **Collapse all** for the groups of Rows. Collapse all says what it keeps: "Show Region only". Groups of Columns open and close with their arrows only.
    - The report offers each of the two only when it changes something. Otherwise a line under it
      says why: "Nothing is collapsed.", "Needs two or more fields in Rows.",
      "Every group is collapsed already."
    - After a click, the status line says what it did: "5 groups collapsed".
- **Swap rows and columns**, in the heading row of the zones, swaps the fields, which groups are
  collapsed, and the direction of calculations. "% of row total" becomes "% of column total", and a
  running total along Rows runs along Columns. It works while the zones are folded too. On a phone
  the button shows its icon only.
- You switch subtotals and grand totals on and off in **Table settings**. Each switch has an **i** that
  says what it does. A new report has the grand totals and the row subtotals. The column subtotals
  are off.
- A switch that would change nothing in this layout is greyed out, without a tick, with the reason
  under it:

    | Total | Needs |
    | --- | --- |
    | Grand total row | a field in Rows |
    | Grand total column | a field in Columns |
    | Row subtotals | two or more fields in Rows |
    | Column subtotals | two or more fields in Columns |
    | Every total | a field in Values |

- A subtotal (“North Total”) adds up a group of the outer field. A group with a single item has
  none, because it would repeat that item. Its arrow still collapses it.
- With column subtotals on, a subtotal column has a line before it and a darker background. Its
  header's tooltip says what it adds up. While a Total column shows, a tip says the same, with
  **Hide column subtotals**. On a phone there is no tooltip, so you read it in the tip.

    ![Tickets per team by priority and channel with column subtotals: a line before each Total column, and the tip that says what it adds up](../assets/screenshots/column-subtotals-light.png#only-light)
    ![Tickets per team by priority and channel with column subtotals: a line before each Total column, and the tip that says what it adds up](../assets/screenshots/column-subtotals-dark.png#only-dark)

- A collapsed column group shows only its total: one column under the group's name.
- Fields in Rows without a value show their labels only. There is no empty column after them and no
  total rows, because a total would have no number. The labels then take most of the report's
  width, so on a phone a name stays whole. The arrows still collapse the groups.
- You can drag field names and value names from the header into a zone. A click on a value's name
  or on a field's name in Rows sorts the rows. See
  [sort with a click on a header](filters.md#sort-with-a-click-on-a-header).
- With one value, its name stands once over all of its columns.
- The table is as wide as its columns and scrolls sideways when it is wider than the report.
- Row labels and field names stay on one line when the table fits the report.
- Long row labels wrap between words when the table is wider than the report, so on a phone numbers
  stay in view next to them. On a phone a row label keeps at least 5.5em, so a common word is never
  cut. A longer word breaks at a hyphen of its own. As a last resort, a word longer than the column
  breaks anywhere.
- From 300 rows on, the table draws only the rows in view, so it stays fast. A row label is then cut
  to one line:
    - The status line under the table shows the whole label of the row the focus is on, or of a label
      you tap. The cut label's tooltip shows it too.
    - The row label column is as wide as its longest labels, at most 28em. It keeps that width while
      the table scrolls. The report measures it again when the font or its size changes.
    - "Longest" counts characters. A label of fewer but wider characters, such as Chinese or emoji,
      can end in "…" although it would fit. Its whole text is in the tooltip.

![Table settings: the totals, each with an "i", a total that changes nothing greyed out with what it needs, then Expand all and Collapse all](../assets/screenshots/explanations-light.png#only-light)
![Table settings: the totals, each with an "i", a total that changes nothing greyed out with what it needs, then Expand all and Collapse all](../assets/screenshots/explanations-dark.png#only-dark)

!!! note "For developers"
    How the layout follows the report's width, and the least heights, are in the
    [pivotkit-react reference](../reference/react.md#layout).

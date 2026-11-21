---
title: Keyboard and screen readers
description: Use a pivotkit report with the keyboard alone and with a screen reader - the field list, menus, moving chips, the table, the chart's text alternative and what is announced.
---

# Keyboard and screen readers

Every action in the report has a button or a menu entry, so drag and drop is never the only way.
With the keyboard you reach every field, menu and value. A screen reader hears what each control is
and what changed. In the report itself, **More**, **Help**, **Keyboard shortcuts** lists the keys.

## Keys

| Where | Keys |
| --- | --- |
| Anywhere | **Ctrl+Z** (Mac **Cmd+Z**) undo, **Ctrl+Shift+Z** or **Ctrl+Y** (Mac **Cmd+Shift+Z**) redo. **Escape** closes the newest open menu or panel. |
| Before the field list | A **Skip to the toolbar** link comes first. |
| Field list | One stop of **Tab**. **Up** and **Down** move between the fields, **Home** and **End** to the first and the last. **Left** and **Right** move to a field's grip, its **i** and its menu. **Enter** on a name adds the field. **Shift+F10** or the context menu key opens its menu. **Space** on the grip picks it up. |
| Fields in the report | **Enter** or **Space** on the heading row folds or opens the zones, and the focus stays there. **Tab** goes on to its **i**, to **Swap rows and columns**, then through each zone: its **i**, **+ Add**, its chips. |
| The line between table and chart | With **Both** shown, the line is a stop of **Tab**. **Left** and **Right** move it, **Home** and **End** to the narrowest and widest table. |
| Table, Chart and Both | The tabs are one stop of **Tab**. **Left** and **Right** move between them, **Home** and **End** to the first and the last. **Enter** or **Space** shows the tab. **Tab** goes on to the settings of the view shown, **Enlarge** and **Full screen**, then the result. |
| Moving a chip or a field | **Space** picks it up. **Left** and **Right** move it within a zone, **Up** and **Down** to the zone above or below. The report announces its position: "Region is over Rows, position 2 of 3". **Space** drops it, **Escape** cancels. |
| Menus | **Start over** and **More** open with **Enter**, **Space** or **Down**. The arrow keys move, also over an entry that is greyed out, and a screen reader hears why it is greyed out. **Home** and **End** jump to the first and the last entry. A letter jumps to the next entry that starts with it. **Tab** or **Escape** closes the menu, and the focus goes back to its button. |
| **+ Add** | **Enter** or **Space** opens its menu with the focus in the search. Type to narrow the fields. **Down** moves into the list, **Enter** adds the field. **Escape** closes the menu, and the focus goes back to **+ Add**. |
| A chip's menu, Table settings, Chart settings, More, Views (in levels) | One stop of **Tab**. The arrow keys move, **Left** and **Right** between choices side by side. A letter jumps. **Enter**, **Space** or **Right** on a row opens its level. **Escape** or **Left** goes back, with the focus on that row. **Escape** on the first level closes the menu, and the focus goes back to its button. **Tab** closes the menu and moves on. In a level with fields, **Tab** moves between them. **Tab** past the last field, or **Shift+Tab** before the first, closes the menu, and the focus goes back to its button. A bottom sheet keeps **Tab** inside. **/** goes to the search, **Down** in it moves into its hits, **Enter** runs one. |
| Text fields in menus | **Escape** empties the field first. The next Escape closes the menu. In a level of a chip's menu, a field applies as you type. There, **Escape** gives back what applies, then goes back a level, and **Enter** applies at once. **Ctrl+Z** in the field brings back text its **×** emptied. |
| Table | The arrow keys move between values. **Enter** or **Space** opens the rows behind one. A field's or value's name in the header is a button: **Tab** to it, and **Enter** or **Space** sorts. See [sort with a click on a header](filters.md#sort-with-a-click-on-a-header). |
| Drill-down panel | When the panel is enlarged, **Escape** reduces it first, then closes it. |

## What a screen reader hears

- An empty cell of the table is a stop too. It says "No rows" when no rows are behind it, and
  "No value" when its rows have no number.
- From 300 rows on, the report cuts a row label to one line. The status line under the table shows
  the whole label of the row the focus is on, or of a label you tap.
- A chip's name says what is set on it. The chip's tooltip has the same words. The name covers:
    - the filter, such as "3 of 4"
    - its rules, such as "last 5 years (2022–2026)" or "from 2022"
    - the top N
    - the whole value condition
    - the sort
- In a chip's menu, each row says what is set and whether it is the default: "Filter, 3 of 4,
  changed". A level's title names the field, such as "Month › Group". A level with fields is a group
  with that heading. A level of choices is a menu. The Filter level says how many items it keeps as
  it changes.
- The header whose sort you chose says its order: "sorted descending". After a click on a header, a
  screen reader reads out the new order: "Region sorted: Z to A".
- The chart has a text alternative: type, values, counts, highest and lowest value.
- A screen reader reads out status messages, such as "Undone: Region removed" or
  "View “Sales” saved". See [status messages](behaviour.md#status-messages).
- While the report waits for its data, it says "Loading the report…" once.
- The descriptions of fields stay readable for screen readers even when the **i** is switched off.

## Focus

- A menu takes the focus on its first entry when it opens, with or without reduced motion. It gives
  the focus back to its button when it closes. A level of a chip's menu takes the focus on its choice
  in use, or on its first field. It gives the focus back to the row it came from.
- The drill-down, the field drawer and the bottom sheets keep the focus inside while they are open.
  They give it back when they close.
- When you remove a chip, the focus goes to the neighbouring chip, or to the zone.
- After you add a field with **+ Add**, the focus goes to its new chip. A screen reader hears
  "Country added to Rows", or "Category moved from Columns to Rows".
- When the zones fold or open, the focus stays on the heading row. After a swap it stays on **Swap
  rows and columns**. When the zones fold by themselves while the focus is in them, it goes to the
  heading row.
- After you show a tab, the focus stays on it.
- The **×** of a text field keeps the focus in the field.
- After a publish or Cancel in the Views menu, the focus goes back to where you asked. After a
  delete, it goes to the view that takes the deleted one's place.

## Touch and sizes

- Text is at least 14 px, and controls at least 24 x 24 px.
- On a touch screen, every button takes a finger: at least 44 x 44 px. That holds for the toolbar,
  the tabs **Table** and **Chart**, **Settings**, **Enlarge** and **Full screen**, the zones'
  heading, the chips, ×, **i**, **+ Add**, a tip's x and the small text buttons such as
  **Select all** and **Reset filter**.
- Every menu's rows are at least 44 px high: the levels, Export, Data and their Back row, search
  row and choices side by side. So are a filter's values, the fold of Pick items and Rules, and a
  rule's fields.
- A row's fold arrow keeps its size in the table. A finger finds it in an area 44 px wide and as high
  as its row.
- A link inside a sentence, such as **Learn more**, keeps the size of its text.
- In the field list, the buttons keep their desktop size. This keeps the rows as compact, and the
  names on one line where they fit. A finger still finds each button in an area 44 px high around
  it. The grip's area is also 44 px wide. The rows stand a little further apart, so that no area
  reaches into the next row.
- Contrast is checked in both themes.
- Reduced motion switches the animations and transitions off: a menu or popover appears at once, in
  its place.

!!! note "For developers"
    The [pivotkit-react reference](../reference/react.md#escape-and-the-host-page) explains how
    Escape works when the report sits in a dialog of the host page. `label` names the report's
    region, so several reports on a page can be told apart. The region is not a
    `<main>`, so it fits inside the host page's own main landmark. The sorted header carries
    `aria-sort`. The view loaded in the Views menu carries `aria-current`. Table and Chart are ARIA
    tabs with manual activation, and the result is their tab panel. The sizes are `--pk-*`
    tokens: see [theming](../reference/theming.md).

---
title: Keyboard and screen readers
description: Use a pivotkit report with the keyboard alone and with a screen reader - the field list, menus, moving chips, the table, the chart's text alternative and what is announced.
---

# Keyboard and screen readers

Every action in the report has a button or a menu entry: drag and drop is never the only way. With the
keyboard you reach every field, menu and value; a screen reader hears what each control is and what
changed. **Options**, **Help**, **Keyboard shortcuts** lists the keys in the report itself.

## Keys

| Where | Keys |
| --- | --- |
| Anywhere | **Ctrl+Z** (Mac **Cmd+Z**) undo, **Ctrl+Shift+Z** or **Ctrl+Y** (Mac **Cmd+Shift+Z**) redo. **Escape** closes the newest open menu or panel. |
| Before the field list | A **Skip to the toolbar** link comes first. |
| Field list | One stop of **Tab**. **Up** and **Down** move between the fields (**Home**, **End**), **Left** and **Right** to a field's grip, its **i** and its menu. **Enter** on a name adds the field; **Shift+F10** (or the context menu key) opens its menu; **Space** on the grip picks it up. |
| Moving a chip or a field | **Space** picks it up. **Left** and **Right** move it within a zone, **Up** and **Down** to the zone above or below; its position is announced ("Region is over Rows, position 2 of 3"). **Space** drops it, **Escape** cancels. |
| Menus | The arrow keys move, **Home** and **End** jump to the first and the last entry, a letter to the next entry that starts with it; **Tab** or **Escape** closes the menu. |
| A chip's menu, Options, Views (in levels) | One stop of **Tab**: the arrow keys move (**Left** and **Right** between choices side by side), a letter jumps. **Enter**, **Space** or **Right** on a row opens its level; **Escape** or **Left** goes back, the focus on that row; **Escape** on the first level closes the menu and the focus goes back to its button; **Tab** closes it and moves on. In a level with fields, **Tab** moves between them. **Down** in the search moves into its hits, **Enter** runs one. |
| Text fields in menus | **Escape** empties the field first; the next Escape closes the menu. In a level of a chip's menu, where a field applies as you type, **Escape** gives back what applies, then goes back a level; **Enter** applies at once. **Ctrl+Z** in the field brings back text its **×** emptied. |
| Table | The arrow keys move between values; **Enter** or **Space** opens the rows behind one. A field's or value's name in the header is a button: **Tab** to it, **Enter** or **Space** sorts ([sort with a click on a header](filters.md#sort-with-a-click-on-a-header)). |
| Drill-down panel | **Escape** reduces it when enlarged, then closes it. |

## What a screen reader hears

- An empty cell of the table is a stop too: "No rows" (nothing behind it) or "No value" (rows
  without a number).
- From 300 rows on a row label is cut to one line; the status line under the table shows the whole
  label of the row the focus is on, or of a label you tap.
- A chip's name says what is set on it: the filter ("3 of 4"), the top N, the whole value condition,
  the sort.
- In a chip's menu each row says what is set and whether it is the default: "Filter, 3 of 4,
  changed". A level's title names the field ("Month › Group"); a level with fields is a group with
  that heading, a level of choices a menu. The Filter level says how many items it keeps as it
  changes.
- The header whose sort you chose says its order ("sorted descending"); after a click on a header
  the new order is read out ("Region sorted: Z to A").
- The chart has a text alternative: type, values, counts, highest and lowest value.
- Status messages ("Undone: Region removed", "View “Sales” saved") are read out
  ([status messages](behaviour.md#status-messages)).
- While the report waits for its data it says "Loading the report…", once.
- The descriptions of fields stay readable for screen readers also when the **i** is switched off.

## Focus

- A menu takes the focus when it opens (its first entry), with or without reduced motion, and gives
  it back to its button when it closes. A level of a chip's menu takes it on its choice in use (or its
  first field), and gives it back to the row it came from.
- The drill-down, the field drawer and the bottom sheets keep the focus inside while open and give it
  back when they close.
- After a chip is removed the focus goes to the neighbouring chip, or to the zone.
- The **×** of a text field keeps the focus in the field.
- After a publish or Cancel in the Views menu the focus goes back to where you asked; after a delete
  to the view that takes its place.

## Touch and sizes

- Text is at least 14 px, and controls at least 24 x 24 px.
- On a touch screen the small buttons (×, **i**, a field's menu and grip, a tip's x) are at least
  44 px.
- Contrast is checked in both themes; reduced motion switches the animations and transitions off:
  a menu or popover appears at once, in its place.

!!! note "For developers"
    How Escape works when the report sits in a dialog of the host page is in the
    [pivotkit-react reference](../reference/react.md#escape-and-the-host-page); `label` names the
    report's region, so several reports on a page can be told apart. The region is not a `<main>`, so
    it fits inside the host page's own main landmark. The sorted header carries `aria-sort`, the view
    loaded in the Views menu `aria-current`. The sizes are `--pk-*` tokens
    ([theming](../reference/theming.md)).

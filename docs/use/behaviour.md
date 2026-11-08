---
title: Behaviour reference
description: Why a button of a pivotkit report is greyed out, what the status messages say and how long they stay, what is shown when parts of a view were not used, and what the report shows when it cannot show a result.
---

# Behaviour reference

Look things up here when the report does something you did not expect: a greyed-out button, a message
at the bottom, a note above the result, an empty table.

## Greyed-out buttons and entries

A button or menu entry that would do nothing is greyed out. Where the reason is not obvious, a short
line under it says why, only while it is greyed out.

| Entry | Available when |
| --- | --- |
| Undo, Redo | there is a step to take back or to repeat |
| Reset | the report differs from the start view |
| Views, **New, empty report** | a field is placed ("The report is empty already.") |
| Export, every entry | a field is placed ("Add a field first.") |
| Export, **Chart image (.png)** | the chart is shown and drawn ("Switch to Chart first.") |
| Options, Help, **Show dismissed tips again** | you dismissed a tip |
| Options, **Expand all**, **Collapse all** | it changes something; the line under it says why not ("Nothing is collapsed.", "Needs two or more fields in Rows.", "Every group is collapsed already.") |
| Options, **Grand total row**, **Grand total column**, **Row subtotals**, **Column subtotals** | it changes something in this layout; the line under it says what it needs |
| Views, **Save “…”** | a saved view is loaded and you may change it: greyed out for a shared view you may not change ("Shared view: you cannot change it. Use Save as."), for a view opened from a file or a link ("Not saved yet. Use Save as.") and while no field is placed ("Add a field first.") |
| Views, the button next to the name field (**Save**, **Save as**) | the name holds text |
| Chart type, Display, **Labels** (pie and donut) | value labels are not Off |
| Load view, **Load** | the box holds text (a chosen file loads at once) |
| The chart title's **Apply** | the title differs from the current one |

## Status messages

Notes such as "Undone: Region removed", "View “Sales” saved" or "Exported pivot.xlsx" appear at the
bottom right of the part of the report you see: under the table, or at the bottom of the window when
the report reaches below it. A screen reader hears them. Adding a field shows none: the chip is the
feedback.

| Kind | Example | Stays |
| --- | --- | --- |
| Note | "Region removed" with **Undo**, "New, empty report" with **Undo**, "View “Sales” saved", "View loaded", "Opened the view from the link", "Table copied: tab-separated, pastes into Excel or Google Sheets as columns" | 6 seconds; longer while the pointer is on it or the focus is in it |
| Warning | "View loaded; some parts did not fit this data" | like a note; the details stay above the result (below) |
| Error | "Export failed: ..." | until you close it with its **x** |

At most two show at a time. A save closes the Views menu (the focus goes back to **Views**, or
**More**), so the note "View “…” saved", or why it was not saved, is what tells you the result.

## Parts of a view that were not used

A saved view, a link or a loaded file can name things the data does not have (a field that is gone, a
value the field cannot compute). The report leaves them out and shows "Some parts of the view were not
used: 2" above the result. Open it to see each part, up to 20 of them: what a loaded view left out in
words, such as "fields this data does not have (“Planet”)", "1 other setting", or its place in the
view, such as `filters[1].by`, and why. It stays until you dismiss it with its **x** or load another
view.

## When the report cannot show anything

| Situation | The report shows |
| --- | --- |
| Data without a single column | "The data has no columns." in the field list. |
| No field placed | Three first steps and up to three saved views to start from. |
| A filter leaves nothing | A note that always shows, with **Remove filter**. |
| A layout over a limit | What to change: "This layout makes more than 500,000 groups of rows and columns. Remove a field with many values from Rows or Columns, or filter it." ([limits](../concepts/limits.md#limits)) |
| A menu whose code could not be loaded (offline, say) | That it could not be loaded, with **Try again**. |
| Any other error | "The report cannot be shown:" and the error's message. |

## Loading

While the report waits for its data, opens a shared link or reads a large data set, it shows grey
shapes where the toolbar, the zones and the table will be, and a screen reader hears "Loading the
report…" once. Reduced motion stops their shimmer. When the application loads new data later, the
result is covered until it is there.

!!! note "For developers"
    `loading` shows the skeleton; a menu chunk that is not deployed (`dist/chunks/`) is one reason for
    Try again ([files the package loads](../reference/react.md#files-the-package-loads)). Errors and
    limits are in [Locale, time zones, limits and errors](../concepts/limits.md).

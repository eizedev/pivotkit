---
title: Behaviour reference
description: Why a button of a pivotkit report is greyed out, what the status messages say and how long they stay, what is shown when parts of a view were not used, and what the report shows when it cannot show a result.
---

# Behaviour reference

Look things up here when the report does something you did not expect: a greyed-out button, a message
at the bottom, a note above the result, an empty table.

## Greyed-out buttons and entries

A button or menu entry that would do nothing is greyed out. Where the reason is not obvious, a short
line under it says why, only while it is greyed out. In a menu in levels, such as a chip's menu or
Table settings, the arrow keys still stop on a greyed-out entry, so a screen reader hears the reason. Start
over and More work the same way.

| Entry | Available when |
| --- | --- |
| Undo, Redo | there is a step to take back or to repeat |
| Start over, **Reset** | the report differs from the start view ("Already at the start view."), and the start view is not the empty report ("The start view is empty: use New, empty report.") |
| Start over, **New, empty report** | a field is placed ("The report is empty already.") |
| **Start over** itself | one of its two entries is available. Otherwise it is greyed out with "The report is empty already." |
| Export, every entry | a field is placed ("Add a field first.") |
| Export, **Chart image (.png)** | the chart is shown and drawn ("Switch to Chart first.") |
| More, Help, **Show dismissed tips again** | you dismissed a tip |
| Table settings, **Expand all**, **Collapse all**<br>Chart settings, Layout, **Show each …**, **Show … only** | it changes something. Otherwise the line under it says why not: "Nothing is collapsed.", "Needs two or more fields in Rows." or "Every group is collapsed already." |
| Table settings, **Grand total row**, **Grand total column**, **Row subtotals**, **Column subtotals** | it changes something in this layout, and the layout has a field in Values. Otherwise the line under it says what it needs, and the greyed-out switch has no tick. |
| Views, **Save “…”** | a saved view is loaded and you may change it. It is greyed out<br>for a shared view you may not change ("Shared view: you cannot change it. Use Save as."),<br>for a view opened from a file or a link ("Not saved yet. Use Save as."),<br>while no field is placed ("Add a field first.") |
| Views, the button next to the name field (**Save**, **Save as**) | the name holds text |
| Chart type, Display, **Labels** (pie and donut) | value labels are not Off |
| Open view file, **Load** | the box holds text. A file you choose loads at once. |
| The chart title's **Apply** | the title differs from the current one |

## Status messages

Notes such as "Undone: Region removed", "View “Sales” saved" or "Exported pivot.xlsx" appear at the
bottom right of the part of the report you see. That is under the table, or at the bottom of the
window when the report reaches below it. A screen reader hears them. Adding a field shows no note,
because the new chip already shows it.

| Kind | Example | Stays |
| --- | --- | --- |
| Note | "Region removed" with **Undo**, "New, empty report" and "Back to the start view" with **Undo**, "View “Sales” saved", "View loaded", "Opened the view from the link", "Table copied: tab-separated, pastes into Excel or Google Sheets as columns" | 6 seconds, longer while the pointer is on it or the focus is in it |
| Warning | "View loaded; some parts did not fit this data" | like a note. The details stay above the result, as described below. |
| Error | "Export failed: ..." | until you close it with its **x** |

At most two show at a time. A save closes the Views menu, and the focus goes back to **Views** or
**More**. So the note tells you the result: "View “…” saved", or why the view was not saved.

## The row count under the result { #row-count }

The line under the result counts the rows of the data the report is made of.

- With nothing filtered, it says "4,386 rows".
- When a filter leaves rows out, it says "2,190 of 4,386 rows". The first number counts the rows
  left after every filter. Top N and value conditions count too. The second counts the data's rows.
- It is the count the summary of a field's filter shows. See [filters](filters.md#the-summary).
- It stays on one line, also on a phone.

## Parts of a view that were not used

A view can come from several places: a saved view (shared or your own), a link, a loaded file or
the view the application starts with. Such a view can name things the data does not have, such as a
field that is gone or a value the field cannot compute. It can also hold settings this version does
not know. The report leaves those parts out and shows the rest. It puts a warning above the result:
"3 parts of this view could not be used".

![The warning above the result: three parts of the view in plain words, each with a line for developers](../assets/screenshots/unused-parts-light.png#only-light)
![The warning above the result: three parts of the view in plain words, each with a line for developers](../assets/screenshots/unused-parts-dark.png#only-dark)

- **Open the first time.** The warning is open when it first appears for a view. It has one line per
  part. Each line says:
    - what it is about, in bold: the value's name, the field, or the part of the report such as
      **Chart**. Two values of one name say which one: "Sum of Units (no. 2 in Values)".
    - what is wrong
    - what the report does instead

    For example: "**Quakes**: the colour scale needs two or three colours - the
    default colours are used" or "**Planet**: the data has no field of this name - it is left out of
    Rows".

- **The first three lines** show, two on a narrow report. **Show N more** shows the rest, **Show
  fewer** hides them again.
- **Fold it** with a click on its title, or with Enter or Space on it. It stays folded while you
  change the view. Loading another view opens it again.
- **A line goes when you fix its part by hand.** Remove the value with the colour scale that did not
  fit, or pick its colours, and its line goes. Change something else, such as swapping rows and
  columns, and the lines stay. **Undo** back to the view as it was loaded brings the line back. When
  no line is left, the warning goes.
- **For developers**: below each line, small grey text shows the part's place in the view
  (`values[0].conditional.colors`) and, after a dot, pivotkit-core's message. A person who builds
  reports can ignore it. A developer finds the setting with it.
- **Dismiss it** with its **x**. The focus goes to what follows it: a tip, **Enlarge** or the table.
  The warning comes back when another view is loaded.
- A screen reader hears it once, when it appears. It hears the warning's title, or, for a view you
  loaded from a file or a link, the status note "View loaded; some parts did not fit this data". The
  warning never takes the focus.

??? note "Every kind of part and what the report does instead"
    | What is wrong | The report |
    | --- | --- |
    | A field the data does not have, in Rows, Columns, Values, Filters or a sort | leaves that field, value or filter out. A sort falls back to the usual order. |
    | A field twice in Rows and Columns, or sorted twice | keeps the first |
    | A calculation, such as sum or average, that is unknown or does not fit the field | leaves the value out |
    | A number format, "Show as" or colour format that is unknown or does not fit | shows the value without it |
    | A colour scale without two or three colours, a bar colour that is no colour | uses the default colours |
    | A filter that is incomplete: no items, no text, no number, or Top without a count | leaves the filter out |
    | An item that does not fit the field, such as text in a number field | leaves the item out |
    | A grouping without a name, of a field that is gone or of the wrong type | leaves the grouping out |
    | More entries or items than the [limits](../concepts/limits.md#limits) allow | uses the first ones |
    | A chart or display setting, language or time zone that is unknown | uses the default |
    | A view made for another time zone | reads the times in the data's time zone |
    | A view that is no view, too large, or from a newer pivotkit | starts empty |

    The plain words load with the warning, as a small file of their own, when a view has such parts.
    Until they arrive, which takes a moment, each line shows pivotkit-core's short message in English
    instead. The same happens when the file cannot be loaded. With a pivotkit-core older than the
    plain words, each line shows that message. For developers: that is a pivotkit-core whose
    issues have no `code`.

## When the report cannot show anything

| Situation | The report shows |
| --- | --- |
| Data without a single column | "The data has no columns." in the field list. |
| No field placed | Three first steps and up to three saved views to start from. |
| A filter leaves nothing | A note that always shows, with **Remove filter**. |
| A layout over a limit | What to change: "This layout makes more than 500,000 groups of rows and columns. Remove a field with many values from Rows or Columns, or filter it." See [limits](../concepts/limits.md#limits). |
| A menu whose code could not be loaded, for example offline | That it could not be loaded, with **Try again**. |
| Any other error | "The report cannot be shown:" and the error's message. |

## Loading

The report can wait for its data, open a shared link or read a large data set. Meanwhile it shows
grey shapes where the toolbar, the zones and the table will be. A screen reader hears "Loading the
report…" once. Reduced motion stops the shapes' shimmer. When the application loads new data later,
the report covers the result until the new data is there.

!!! note "For developers"
    `loading` shows the skeleton. A menu chunk that is not deployed (`dist/chunks/`) is one reason for
    Try again: see [files the package loads](../reference/react.md#files-the-package-loads). Errors
    and limits are in [Locale, time zones, limits and errors](../concepts/limits.md).

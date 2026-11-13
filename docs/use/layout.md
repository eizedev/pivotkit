---
title: Small screens, menus and tips
description: Give the result of a pivotkit report more room (field rail, Enlarge, Full screen), use it on a phone or in a low card, find your way in long menus with their "i" and "×", the tips above the result, and the report in German.
---

# Small screens, menus and tips

The report adapts to the room it has: the field list folds away, the zones fold into one line, menus
open from the bottom on a phone. **Enlarge** and **Full screen** give the result all the room. Tips
above the result say what the report shows; an **i** explains a setting; a chip's menu says on its
first level what is set and opens each topic in a level of its own.

## More room for the result

| Button | Where | Does |
| --- | --- | --- |
| **«** | next to "Fields" | Collapses the field list to a slim rail at the side of the report (about 40 px) that shows "Fields" upright and a search button: the zones and the result get its room. |
| **Enlarge** | top right of the result | The table or the chart fills the report (below). |
| **Full screen** | next to it | The whole report on the screen. |

None of them is part of the saved view.

![The field list collapsed to a rail with "Fields" and a search button](../assets/screenshots/field-rail-light.png#only-light)
![The field list collapsed to a rail with "Fields" and a search button](../assets/screenshots/field-rail-dark.png#only-dark)

??? info "The field rail"
    A click on the rail opens the list again; the search button opens it with the cursor in the
    search field. The focus stays on the button that takes the place of the one pressed. A chip
    dragged onto the rail leaves the report, as on the open list: while one is dragged, the rail reads
    "Drop here to remove" (a screen reader hears it). The report remembers the choice (with the tips);
    an application can start the list open or collapsed. On a narrow report the field list is a
    drawer instead ([small screens](#small-screens)). Enlarge hides the rail too.

??? info "Enlarge"
    The field list, the zones, the tips and the notes above the result step aside, and one line says
    which fields the report shows ("Rows: Team · Columns: Priority · Values: Count of Ticket"). The
    toolbar stays. **Escape** or the same button, which then reads **Reduce** (in German **Verkleinern**) and is highlighted,
    brings everything back. Its name says what a click does, so a screen reader hears "Enlarge" or
    "Reduce", not a pressed switch. The drill-down's Enlarge works the same.

    ![Enlarge: the table fills the report, one line above it names the fields](../assets/screenshots/enlarged-light.png#only-light)
    ![Enlarge: the table fills the report, one line above it names the fields](../assets/screenshots/enlarged-dark.png#only-dark)

??? info "Full screen"
    **Escape** or the button leaves it. It is offered only where the browser can do it (not, for
    example, in Safari on an iPhone); it works in the web component too.

## Small screens

The report adapts to its own width, not the window's.

| Report width | Layout |
| --- | --- |
| Wide | The field list on the left, the zones in a 2 x 2 grid. |
| Narrow (below 640 px of the report's own width) | The field list is a drawer opened with **Fields** in the toolbar; menus open as sheets from the bottom of the window. |

![The report at phone width: toolbar, the zones folded into one line, one tip, Enlarge and Full screen, and the table below](../assets/screenshots/phone-light.png#only-light){ width="320" }
![The report at phone width: toolbar, the zones folded into one line, one tip, Enlarge and Full screen, and the table below](../assets/screenshots/phone-dark.png#only-dark){ width="320" }

- **The drawer** closes with its **x** ("Close field list"), Escape or a tap beside it, and by itself
  once a field is added from it, its "Filter…" opens or a drag starts, so you see where the field
  lands.
- **Sheets**: on a phone **More** and every menu are a sheet at the bottom of the window, at most
  82 % of its height, scrolling inside: every entry is reachable.
- **More**: toolbar buttons that do not fit move into **More**, in a fixed order - Layout
  first, then Options, the chart type, and Start over and Views last (Start over holds New, and
  Views is where you save) - but only those the room left in the
  toolbar cannot hold: a button that fits stays, even when one before it in that order had to go.
  The room is measured with the texts of the report's language, so a shorter language keeps more
  buttons. The chart type keeps the room of its longest type, so picking another type never moves a
  button, and a click on Layout never moves it either. While a menu of the toolbar is open nothing
  moves (a narrower window, another language): the buttons settle when it closes. A menu opened
  from **More** closes when its own button fits in the toolbar again. Table or Chart, Undo with Redo next to it,
  and Export always stay. In **More** the entries come in groups with a line between them: Start
  over's **Reset** and **New, empty report** as entries of their own; Layout, the chart type and
  Options; Views. The name of the view you loaded takes the room that is left on its line and is
  shortened with "…", never to less than a few letters; a tap on it opens Views.

  | Window (field list open / folded) | English | German |
  | --- | --- | --- |
  | 1920 px | every button / every button | every button / every button |
  | 1440 px | Layout and Options in More / every button | Layout, Options and the chart type in More / Layout and Options in More |
  | 1280 px | Options and the chart type in More / every button | everything but Views in More / Layout and the chart type in More |
  | 1000 px | everything in More / Layout, Options and the chart type in More | everything in More / everything but Views in More |

  Measured in the playground with the sales data (Chromium); another font or other texts move the
  limits a little.

  ![More in a window 1000 px wide: Reset and New, empty report; Layout, the chart type and Options; Views - with a line between the groups](../assets/screenshots/more-menu-light.png#only-light)
  ![More in a window 1000 px wide: Reset and New, empty report; Layout, the chart type and Options; Views - with a line between the groups](../assets/screenshots/more-menu-dark.png#only-dark)
- **The table**: row labels wrap between words; a table wider than the phone scrolls sideways.

### A low report

When the report is low (below 600 px; a narrow one below 820 px), the zones fold into one line that
says what is in them ("Rows: Team · Columns: Priority · Values: Count of Ticket"), and at most one tip
shows. A click on the line, or **Layout** in the toolbar, opens them. **Layout** keeps its name and
shows pressed while the zones are open; in **More** it is an entry with a check. A drag from the field
list or the table opens them while it lasts.

When the report's box is lower than its toolbar, its zones, its tips and the least height of the
result need (240 px, 280 px on a narrow report), a report with a height of the application's (a card)
stays inside it and its table scrolls; a report without one grows and the page scrolls, instead of
squeezing the table into a sliver.

## Menus and text fields

- A setting that needs explaining has an **i** next to it: pointing at it or moving the focus to it
  shows the explanation, a tap opens it. It is the same **i** everywhere (totals, Show as, the
  export formats, the chart's Labels and Group labels), so every menu row stays one line. Next to an
  item of Options it is for the pointer: a screen reader reads the explanation with the item.
  **Options**, **Help**, **Show explanations** hides them all.
- Every text field in a menu - the field search, a value's name, "Starting at" of number ranges, a
  saved view's name, the text of a filter condition, the box of Open view file - has an **×** while it
  holds text. It empties the field and keeps the focus there; Ctrl+Z in the field brings the text
  back.
- **Escape** in such a field empties it first; the next Escape closes the menu (in a level of a
  chip's menu, where a field applies as you type, Escape gives back what applies and then goes back
  a level).
- While the report waits for its data, or opens a shared link, it shows grey shapes where the
  toolbar, the zones and the table will be, and a screen reader hears "Loading the report…". A large
  data set (more than 10,000 rows) shows them for a moment too, while it is read.

## Menus that are long

The menu of a chip, **Options** and **Views** are in levels, so their first level stays short:

- The first level has one row per topic with what is set on its right, muted ("Filter · All",
  "Number format · Automatic"); a dot in the accent colour before it means the setting is not the one
  the report starts with ("Number format · ● Currency"), and a screen reader hears "Number format,
  Currency, changed". A topic with only a few choices has them right there: A to Z and Z to A, a
  value's Highlight, the totals and help switches of Options.
- A row opens the topic's level in the menu's place, titled with the field's name ("Month ›
  Group"). **‹ Back**, Escape or the left arrow key go back to the row it came from.
- Every choice applies at once: the table behind the menu changes while it is open, and each change
  is one step Undo takes back. A number applies a moment after you stop typing (or with Enter), a
  value's name with Enter or when you leave the field; Escape in a field gives back what applies.
- The search above a chip menu's first level finds any choice of any level, with where it is
  ("Percent · Number format"), and the levels by their titles; **/** goes to it from the menu. It knows
  a few more words: "percent" and "%" find the shares of Show as first, "rename" finds Name, "top 5"
  (or "5") applies Top 5, and "text condition" or "value condition" opens the Filter level on its
  conditions. The arrow keys move into the hits and Enter runs one. "Nothing found" says when there
  is none.
- A name, a count or a number you typed applies when you leave the field, press Enter, go back a
  level or click outside the menu; Escape in the field gives back what applied.
- Entries few people need come last in their level, under a heading: **More statistics**, **More
  calculations**, **More formats** (whole number, compact, bytes, durations).
- A menu keeps the mouse wheel to itself: at its end it stops, the table or the page behind it does
  not scroll; scrolling a long menu by touch stops at its end too. A menu is never higher than the
  window; what does not fit scrolls inside it.

**Views** is in levels too: its first level is the list to scan (This view, Shared views, My views,
Share this view); Save as…, Open view file… and the questions before a delete or a publish open levels
of their own ([views](views.md#the-views-menu)). The chart type menu, the Export menus, **Start
over** and **More** are flat lists. No menu folds.

Every menu draws its groups alike: each group under its title in bold (Totals, Rows and Help in
Options; This view, Shared views, My views and Share this view in Views; Chart type and Display in the
chart type menu; Download and Copy in Export; More statistics and the like in a value's levels), with
a line between one group and the next. **More** has lines only, no titles. Inside the chart's
Display, its own groups (Value labels, Legend, Title, ...) are parted by a dashed line.

![A value's menu on a phone: a sheet at the bottom, its first level with Number format · ● Currency and Highlight side by side](../assets/screenshots/phone-value-menu-light.png#only-light){ width="320" }
![A value's menu on a phone: a sheet at the bottom, its first level with Number format · ● Currency and Highlight side by side](../assets/screenshots/phone-value-menu-dark.png#only-dark){ width="320" }

## Tips

Short tips above the result say what the report shows and what you can do next. One shows at a time,
the most important first; the next waits until it is followed or dismissed. They are never over the
table.

| A tip says | With |
| --- | --- |
| a top 5 changes what the totals mean | |
| what 100 % is for a percentage | |
| a text field in Values is counted | |
| a date makes a column per day | a button to group it by month |
| a filter leaves nothing | **Remove filter** |
| the view could be saved | **Save view**, which opens Views; after a save it waits for more changes |
| a chart over dates reads better as lines | **Show as lines over time** |
| a pie has too many slices | **Switch to Bars** |

- The **x** of a tip (Tab reaches it) hides that tip; the report remembers it.
- The notes that say the result is cut or empty (a top 5, the first 50 categories of a chart, a
  filter that leaves nothing) always stay; they have no x.
- **Options**, **Help** has **Show tips**, to switch them all off and on, **Show explanations** (every
  **i**: of the fields, the zones and the settings of the menus), **Show dismissed tips again**
  (greyed out until you dismissed a tip). The report remembers the switches like the tips.
- **Options**, **Help**, **Keyboard shortcuts** lists the keys ([keyboard](keyboard.md)).

![Above the table: the notice that the top 3 cover these items only, and a tip with its x](../assets/screenshots/tips-light.png#only-light)
![Above the table: the notice that the top 3 cover these items only, and a tip with its x](../assets/screenshots/tips-dark.png#only-dark)

## In German

The report speaks English and German; numbers, dates and currency follow the language as well.

![The report in German: Felder, Zeilen, Spalten, Werte, amounts as 1.041.224,25 €](../assets/screenshots/german-light.png#only-light)
![The report in German: Felder, Zeilen, Spalten, Werte, amounts as 1.041.224,25 €](../assets/screenshots/german-dark.png#only-dark)

!!! note "For developers"
    The report's height, `grow`, `fieldList`, the width classes and the least heights are in the
    [pivotkit-react reference, Layout](../reference/react.md#layout); the tips, their ids and
    `storageKey` in [Tips](../reference/react.md#tips); the texts and languages in
    [Localisation](../reference/localisation.md).

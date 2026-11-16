---
title: Small screens, menus and tips
description: Give the result of a pivotkit report more room (field rail, Enlarge, Full screen), use it on a phone or in a low card, find your way in long menus with their "i" and "×", the tips above the result, and the report in German.
---

# Small screens, menus and tips

The report adapts to the room it has. The field list folds away, the zones fold into one line, and
on a phone menus open from the bottom. **Enlarge** and **Full screen** give the result all the room.

- Tips above the result say what the report shows.
- An **i** explains a setting.
- A chip's menu says on its first level what is set, and opens each topic in a level of its own.

## More room for the result

| Button | Where | Does |
| --- | --- | --- |
| **«** | next to "Fields" | Collapses the field list to a slim rail at the side of the report, about 40 px wide. The rail shows "Fields" upright and a search button. The zones and the result get the list's room. |
| **Enlarge** | top right of the result | The table or the chart fills the report, as described below. |
| **Full screen** | next to it | The whole report on the screen. |

None of them is part of the saved view.

![The field list collapsed to a rail with "Fields" and a search button](../assets/screenshots/field-rail-light.png#only-light)
![The field list collapsed to a rail with "Fields" and a search button](../assets/screenshots/field-rail-dark.png#only-dark)

??? info "The field rail"
    A click on the rail opens the list again. The search button opens it with the cursor in the
    search field. The focus stays on the button that takes the place of the one you pressed.

    A chip you drag onto the rail leaves the report, as on the open list. While you drag one, the
    rail reads "Drop here to remove", and a screen reader hears it.

    The report remembers the choice, together with the tips. An application can start the list open
    or collapsed. On a narrow report the field list is a drawer instead. See
    [small screens](#small-screens). Enlarge hides the rail too.

??? info "Enlarge"
    The field list, the zones, the tips and the notes above the result step aside. One line says
    which fields the report shows: "Rows: Team · Columns: Priority · Values: Count of Ticket". The
    toolbar stays.

    The same button then reads **Reduce** (in German **Verkleinern**) and is highlighted. It or
    **Escape** brings everything back. The button's name says what a click does, so a screen reader
    hears "Enlarge" or "Reduce", not a pressed switch. The drill-down's Enlarge works the same.

    ![Enlarge: the table fills the report, one line above it names the fields](../assets/screenshots/enlarged-light.png#only-light)
    ![Enlarge: the table fills the report, one line above it names the fields](../assets/screenshots/enlarged-dark.png#only-dark)

??? info "Full screen"
    **Escape** or the button leaves it. The report offers it only where the browser can do it. Safari
    on an iPhone, for example, cannot. It works in the web component too.

## Small screens

The report adapts to its own width, not the window's.

| Report width | Layout |
| --- | --- |
| Wide | The field list on the left, the zones in a 2 x 2 grid. |
| Narrow: below 640 px of the report's own width | The field list is a drawer that **Fields** in the toolbar opens. Menus open as sheets from the bottom of the window. |

![The report at phone width: toolbar, the zones folded into one line, one tip, Enlarge and Full screen, and the table below](../assets/screenshots/phone-light.png#only-light){ width="320" }
![The report at phone width: toolbar, the zones folded into one line, one tip, Enlarge and Full screen, and the table below](../assets/screenshots/phone-dark.png#only-dark){ width="320" }

- **The drawer** closes with its **x** ("Close field list"), Escape or a tap beside it. It also
  closes by itself, so you see where the field lands:
    - once you add a field from it
    - when its **Add to Filters** opens the filter
    - when a drag starts
- **Sheets**: on a phone, **More** and every menu are a sheet at the bottom of the window. A sheet
  takes at most 82 % of the window's height and scrolls inside, so every entry is reachable.
- **More**: toolbar buttons that do not fit move into **More**.
    - They move in a fixed order: Layout first, then Options, the chart type, and Start over and Views
      last. Start over holds New, and Views is where you save.
    - Only the buttons that the room left in the toolbar cannot hold move. A button that fits stays,
      even when one before it in that order had to go.
    - The report measures the room with the texts of the report's language, so a shorter language
      keeps more buttons.
    - The chart type keeps the room of its longest type, so picking another type never moves a
      button. A click on Layout never moves a button either.
    - While a menu of the toolbar is open, nothing moves, even when the window gets narrower or the
      language changes. The buttons settle when the menu closes.
    - A menu opened from **More** closes when its own button fits in the toolbar again.
    - Table or Chart, Undo with Redo next to it, and Export always stay.
    - In **More** the entries come in groups with a line between them. The first group holds Start
      over's **Reset** and **New, empty report** as entries of their own. The second holds Layout, the
      chart type and Options. The third holds Views.
    - The name of the view you loaded takes the room that is left on its line. The report shortens it
      with "…", never to less than a few letters. A tap on it opens Views.

  | Window (field list open / folded) | English | German |
  | --- | --- | --- |
  | 1920 px | every button / every button | every button / every button |
  | 1440 px | Layout and Options in More / every button | Layout, Options and the chart type in More / Layout and Options in More |
  | 1280 px | Options and the chart type in More / every button | everything but Views in More / Layout and the chart type in More |
  | 1000 px | everything in More / Layout, Options and the chart type in More | everything in More / everything but Views in More |

  The table shows measurements in the playground with the sales data, in Chromium. Another font or
  other texts move the limits a little.

  ![More in a window 1000 px wide: Reset and New, empty report; Layout, the chart type and Options; Views - with a line between the groups](../assets/screenshots/more-menu-light.png#only-light)
  ![More in a window 1000 px wide: Reset and New, empty report; Layout, the chart type and Options; Views - with a line between the groups](../assets/screenshots/more-menu-dark.png#only-dark)
- **The table**: row labels wrap between words. A table wider than the phone scrolls sideways.

### A low report

A report is low below 600 px of height, a narrow one below 820 px. Then the zones fold into one line
that says what is in them: "Rows: Team · Columns: Priority · Values: Count of Ticket". At most one
tip shows.

- A click on the line, or **Layout** in the toolbar, opens the zones.
- **Layout** keeps its name and shows pressed while the zones are open. In **More** it is an entry
  with a check.
- A drag from the field list or the table opens the zones while it lasts.

The report's box can be lower than its toolbar, its zones, its tips and the least height of the
result need. The least height is 240 px, 280 px on a narrow report. In that case:

- A report whose height the application sets, such as a card, stays inside that height, and its
  table scrolls.
- A report without such a height grows, and the page scrolls. This keeps the table from being
  squeezed into a sliver.

## Menus and text fields

- A setting that needs explaining has an **i** next to it. Pointing at it or moving the focus to it
  shows the explanation. A tap opens it.
    - It is the same **i** everywhere: at totals, Show as, the export formats, the chart's Labels and
      Group labels. So every menu row stays one line.
    - Next to an item of Options the **i** is for the pointer. A screen reader reads the explanation
      with the item.
    - **Options**, **Help**, **Show explanations** hides them all.
- Every text field in a menu has an **×** while it holds text. The **×** empties the field and keeps
  the focus there. Ctrl+Z in the field brings the text back. These text fields are:
    - the field search
    - a value's name
    - "Starting at" of number ranges
    - a saved view's name
    - the text of a filter condition
    - the box of Open view file
- **Escape** in such a field empties it first. The next Escape closes the menu. In a level of a
  chip's menu, a field applies as you type. There Escape gives back what applies and then goes back
  a level.
- While the report waits for its data, or opens a shared link, it shows grey shapes where the
  toolbar, the zones and the table will be. A screen reader hears "Loading the report…". A large
  data set of more than 10,000 rows shows them for a moment too, while the report reads it.

## Menus that are long

The menu of a chip, **Options** and **Views** are in levels, so their first level stays short:

- The first level has one row per topic, with what is set muted on its right: "Filter · All",
  "Number format · Automatic".
    - A dot in the accent colour before the setting means it differs from the one the report starts
      with: "Number format · ● Currency". A screen reader hears "Number format, Currency, changed".
    - A topic with only a few choices has them right there: A to Z and Z to A, a value's Highlight,
      the totals and help switches of Options.
- A row opens the topic's level in the menu's place. The level's title names the field:
  "Month › Group". **‹ Back**, Escape or the left arrow key go back to the row it came from.
- Every choice applies at once. The table behind the menu changes while the menu is open, and Undo
  takes back each change as one step.
    - A number applies a moment after you stop typing, or with Enter.
    - A value's name applies with Enter or when you leave the field.
    - Escape in a field gives back what applies.
- The search above a chip menu's first level finds any choice of any level, with where it is:
  "Percent · Number format". It also finds the levels by their titles. **/** goes to the search from
  the menu.
    - It knows a few more words. "percent" and "%" find the shares of Show as first. "rename" finds
      Name. "top 5", or "5", applies Top 5. "text condition" or "value condition" opens the Filter
      level on its conditions.
    - The arrow keys move into the hits, and Enter runs one. "Nothing found" says when there is none.
- A name, a count or a number you typed applies when you leave the field, press Enter, go back a
  level or click outside the menu. Escape in the field gives back what applied.
- Entries few people need come last in their level, under a heading: **More statistics**,
  **More calculations**, **More formats** (whole number, compact, bytes, durations).
- A menu keeps the mouse wheel to itself. At its end it stops, and the table or the page behind it
  does not scroll. Scrolling a long menu by touch stops at its end too. A menu is never higher than
  the window. What does not fit scrolls inside it.

**Views** is in levels too. Its first level is the list to scan: This view, Shared views, My views,
Share this view. Save as…, Open view file… and the questions before a delete or a publish open
levels of their own. See [views](views.md#the-views-menu). The chart type menu, the Export menus,
**Start over** and **More** are flat lists. No menu folds.

Every menu draws its groups alike. Each group stands under its title in bold, with a line between one
group and the next:

| Menu | Groups |
| --- | --- |
| Options | Totals, Rows and Help |
| Views | This view, Shared views, My views and Share this view |
| The chart type menu | Chart type and Display |
| Export | Download and Copy |
| A value's levels | More statistics and the like |

**More** has lines only, no titles. Inside the chart's Display, a dashed line parts its own groups,
such as Value labels, Legend and Title.

![A value's menu on a phone: a sheet at the bottom, its first level with Number format · ● Currency and Highlight side by side](../assets/screenshots/phone-value-menu-light.png#only-light){ width="320" }
![A value's menu on a phone: a sheet at the bottom, its first level with Number format · ● Currency and Highlight side by side](../assets/screenshots/phone-value-menu-dark.png#only-dark){ width="320" }

## Tips

Short tips above the result say what the report shows and what you can do next. One shows at a
time, the most important first. The next waits until you follow or dismiss the one shown. Tips are
never over the table.

| A tip says | With |
| --- | --- |
| a top 5 changes what the totals mean | |
| what 100 % is for a percentage | |
| a text field in Values is counted | |
| a date makes a column per day | a button to group it by month |
| a filter leaves nothing | **Remove filter** |
| you could save the view | **Save view**, which opens Views. After a save the tip waits for more changes. |
| a chart over dates reads better as lines | **Show as lines over time** |
| a pie has too many slices | **Switch to Bars** |

- The **x** of a tip hides that tip, and the report remembers it. Tab reaches the **x**.
- The notes that say the result is cut or empty always stay. They have no x. Such notes are about a
  top 5, the first 50 categories of a chart, or a filter that leaves nothing.
- **Options**, **Help** has three switches. The report remembers them like the tips.
    - **Show tips** switches all tips off and on.
    - **Show explanations** switches every **i**: of the fields, the zones and the settings of the
      menus.
    - **Show dismissed tips again** is greyed out until you dismiss a tip.
- **Options**, **Help**, **Keyboard shortcuts** lists the keys. See [keyboard](keyboard.md).

![Above the table: the notice that the top 3 cover these items only, and a tip with its x](../assets/screenshots/tips-light.png#only-light)
![Above the table: the notice that the top 3 cover these items only, and a tip with its x](../assets/screenshots/tips-dark.png#only-dark)

## In German

The report speaks English and German. Numbers, dates and currency follow the language as well.

![The report in German: Felder, Zeilen, Spalten, Werte, amounts as 1.041.224,25 €](../assets/screenshots/german-light.png#only-light)
![The report in German: Felder, Zeilen, Spalten, Werte, amounts as 1.041.224,25 €](../assets/screenshots/german-dark.png#only-dark)

!!! note "For developers"
    The report's height, `grow`, `fieldList`, the width classes and the least heights are in the
    [pivotkit-react reference, Layout](../reference/react.md#layout). The tips, their ids and
    `storageKey` are in [Tips](../reference/react.md#tips). The texts and languages are in
    [Localisation](../reference/localisation.md).

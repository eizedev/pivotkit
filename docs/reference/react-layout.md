---
title: pivotkit-react layout and menus
description: How pivotkit-react's report lays itself out - widths, the toolbar and what moves into More, the Table and Chart tabs, small and low reports, the menus and their levels, form fields, the test ids, and how popovers and Escape work with the host page.
---

# pivotkit-react layout and menus

This page is for developers who place the report on a page and test it. The props are in the
[pivotkit-react reference](react.md). What the people who use the report see is in
[Use a report](../use/index.md).

## Layout

The report adapts to its own width, not the window's:

- **Wide** (1024 px and more): the field list is on the left, and the zones are shelves in a 2×2
  grid.
- **Medium**: the field list is narrower.
- **Narrow** (below 640 px): the field list opens as a drawer from the toolbar. Menus show as bottom
  sheets: at the bottom of the window, at most 82 % of its height, scrolling inside.

The toolbar holds what applies to the whole report: Undo, Redo, Start over, Data (with
`allowImport`), Views, Export and "More". The [tabs Table and Chart](#table-and-chart) sit on the result.

"More" is always the toolbar's last button. Help is its first entry. Toolbar buttons move into
"More", below Help, by a fixed priority (`OVERFLOW_ORDER`): Data, then Start over, and Views last.
Only the buttons the room left cannot hold move (`overflowHidden` in `overflow.js`). The first ones
in the order go until the rest fits. Then each of them that the room left still holds comes back.

- The report measures each button's room with the texts of the report's labels, in the font the
  toolbar is drawn in (`toolbarRoom`). A shorter language keeps more buttons.
- "More" lists them below Help in groups (`MORE_GROUPS`): Start over's Reset and New as entries of
  their own, then Data, then Views.
- The report decides all this before the first paint.

The name of the view loaded takes the room left. The report cuts it with "…", never below 4em.

The zones stack, one line each, whenever the area next to the field list is narrower than 640 px. A
container query on that area decides it. This covers the narrow layout and a medium one, such as a
half-width card of 650 px.

Only the table scrolls sideways. The table measures whether it fits the report and takes the first
layout that fits:

1. Every row label, field name and value name keeps its natural width, on one line.
2. The labels and names wrap between words until the table is as wide as the report.
3. The labels are capped. The row label columns share the room the value columns leave. Each gets
   at least an equal part of 40 % of the main area. A value's name wraps beyond 30 %. So a phone
   still shows values next to two levels of row labels.

Under the cap:

- Each row label column is at least 5.5em wide, so a common word such as "Central" never breaks.
- A longer word breaks at a hyphen of its own. A word longer than the column breaks as a last
  resort.

In every layout:

- A narrow report has less room around each cell.
- From 300 rows on, rows have one height, too low for two lines. The report then cuts a row label
  with an ellipsis. Its full text is the cell's title. The status line under the table shows the
  whole row label ("Row: Linux / 24.04") of a tapped label, or of the value the focus is on.

The report starts in the compact layout when it is lower than a threshold. It measures the border
box before the first paint:

- below 600 px of height (`COMPACT_HEIGHT` in `use-report-size.js`)
- below 820 px in the narrow layout, where the zones stack (`COMPACT_HEIGHT_NARROW`)

The zones sit in a section between two rules (`--pk-section-rule`), under the toolbar and above the
tabs. Its heading row is one line in every state and size, with three buttons side by side:

- The fold button: a chevron and the heading "Fields in the report" (`zonesTitle`). It is a
  disclosure button with `aria-expanded` and `aria-controls` on the zones, named by its heading.
  Its test id is `layout-summary`.
- The section's "i", the zones' own: it says what the section is for (`zonesHint`). It shows while
  explanations show, as the zones' "i" does.
- "Swap rows and columns" at the row's end. It works while the zones are folded too. Where the row
  is narrower than 36em, as on a phone, it shows its icon only. Its name stays for screen readers
  and as a tooltip.

Folded, what is placed stands in the same line after the "i" ("Rows: Team · Columns: Priority ·
Values: Count of Ticket"), cut with "…". It is the fold button's description (`aria-describedby`)
and its tooltip, and a click on it folds or opens the zones too. Open, the zones sit indented in a
tinted panel (`--pk-section-indent`, `--pk-section-bg`, `--pk-section-pad`). The focus stays on
the fold button when it folds or opens the zones. The Tab order is the fold button, the "i", Swap,
then each zone's "i", its "+ Add" and its chips.

Each zone is a shelf: its title, its "i" and "+ Add" on the left, its chips flowing beside them.

- From 640 px of the main area, the shelves form a 2×2 grid of equal halves: Filters and Columns
  on top, Rows and Values below. Below 640 px they stand in one column.
- A half is at least `--pk-shelf-min` wide. Where it would be narrower, the grid keeps one column.
- A chip never widens its shelf. The chips wrap inside it, so the drop targets stay in place.
- A shelf narrower than 26em puts its title row above the chips, with "+ Add" at its right end.
  That happens on a phone and in the halves of a medium report.
- Each shelf has a frame (`--pk-zone-border`). While something is dragged, the frame turns
  into the dashed drop outline. Its width stays the same, so the shelves do not move.
- "+ Add" (`addField`, named by `addFieldTo`) opens the zone's menu of every field. It loads with
  the menus. After a pick the focus goes to the new chip, and a status region inside the section
  says what was added or moved (`steps.added`, `movedFrom`).
- There is no prop to switch editing off, so "+ Add" shows whenever the zones do.
- Each zone carries `data-zone` (`filters`, `cols`, `rows`, `values`), and an entry of the add
  menu the class `pk-add-type-<type>`. Both are internal, for tests and styles of this package, not
  an interface.
- A report with no field placed starts with its zones open, whatever its height. `zones` still wins.

In the compact layout, the zones start folded, so the table keeps its room. At most one tip shows.
[`zones`](react.md#prop-zones) sets the start state instead.

- The folded line only shows what is placed. To change a chip, open the zones first.
- A drag from the field list or the table opens the zones while it lasts, so a field can still be
  dropped.
- When what the open zones need grows inside a box of the same size (fields added, a language, a
  font), the fold waits while the user works in the section: a drag, the focus or the pointer in it,
  or a menu open. It is checked once they leave. The load and a resize of the box decide at once.
- When the report gets lower while a menu or popover is open, the fold waits until it closes. A focus
  in the zones moves to the fold button.
- The report folds the zones too when they no longer fit its box. It checks after every render and
  when a part of it changes size. So zones that grow in a box of the same size fold as well: longer
  texts in another language, more fields in Rows, a font or stylesheet that loads late.
- Folded that way, the zones open again once they fit: when a warning folds, a tip goes or the
  report gets wider.

The user's choice is state of the mounted report. It survives the host's renders. It is not part of
the view, so a saved view does not carry it.

The result keeps a least height: 240 px, 280 px in the narrow layout. The box may be lower than
what the toolbar, the zones (or their heading row), the tips, the notes, the result's least height and the
status line need. What happens then depends on whether the host gives a height:

- **Without `height`** (the report's 640 px default), the report grows past its 640 px, and the page
  scrolls. It does not squeeze the table into a sliver. It sets an inline `min-height` on its root,
  measured after every render and when its size changes.
- **With `height`** (a number, `"100%"`, any CSS length), the report stays inside that height. It
  folds its zones (above), and the table scrolls inside the result, however small it gets. Nothing is
  cut off: a card of a fixed size, such as a PowerShell Universal card, keeps the whole report.
- `grow` decides it either way. `"on"` lets a report with a height grow too. `"off"` keeps a report
  without one inside its 640 px. The element's attribute is `grow`.

Whatever is taller than the result's area scrolls inside it, with or without `height`:

- the table, in its own box. Its header stays at the top. The user reaches the last row, Grand
  Total, by scrolling.
- the empty report's first steps with their **Start with …** buttons
- a message, in the area itself

`height` takes a number of pixels or any CSS length:

- `"100%"` of a parent with a height
- `"calc(100svh - 24px)"` for a page that holds one report. The page scrolls to the report, and the
  table scrolls inside it.

In the narrow layout, the zones sit above the table, so a report of a fixed 640 px leaves little room
for the table on a phone. Give it more height there.

### Table and Chart { #table-and-chart }

On top of the result stand the tabs Table and Chart, then the settings button, Enlarge and Full
screen. Without room for their whole names the buttons take their short form, their icons only; without
room for that, a line above the tabs. The Tab order stays tabs first.

- The tabs are ARIA tabs: `role="tablist"` named "View", two `role="tab"` with `aria-selected`. The
  result is their `tabpanel`, labelled by the tab shown. Test ids: `show-table`, `show-chart`.
- Activation is manual. The tab list is one Tab stop. Left and Right (Home, End) move the focus.
  Enter or Space shows the tab, since the chart loads on demand.
- The settings button reads "Table settings" (`tableSettings`) or "Chart settings"
  (`chartSettings`). Its test id is `view-settings`. Table settings holds the totals, Expand all and
  Collapse all. Chart settings holds the chart types and the Display topics.
- In the narrow layout Settings, Enlarge and Full screen show their icon only. Each keeps its whole name in `aria-label` and `title`. Left and Right
  do not mirror: the report has no right-to-left layout.
- A tab changes the view's `display`, so showing the other tab is one step for Undo, as the switch
  Table | Chart was before. The tab shown, clicked again, adds no step.

The Tab order is the toolbar, the zones, the tips, the tabs, the settings button, Enlarge, Full
screen and the result.

**Enlarge** and **Full screen** stand at the top right of the result. Neither is part of the view.

**Enlarge** lets the result fill the report. Its name says what a click does: Enlarge or Reduce. It
has no `aria-pressed`.

- The field list, the zones, the tips and the notes above the result are hidden. The toolbar and the
  tabs stay, and one line above the tabs names the fields.
- Escape inside the report, or the button, restores it.
- On Escape, an open menu, the field drawer, a filter or the drill-down closes first.
- An Escape elsewhere on the page, such as in a host's own dialog, is not the report's.

**Full screen** calls the Fullscreen API on the report's root. In pivotkit-element, that is the root
inside the shadow root. The report reads its state from its own root's `fullscreenElement`.

- Escape leaves full screen. The browser keeps that key for itself in full screen, so Escape leaves
  full screen before an open menu would close. Close a menu there with a click outside it.
- The button shows only where `document.fullscreenEnabled` and `requestFullscreen` exist. The report
  reads them after the first render. Safari on an iPhone, for example, lacks them.

## Menus

The menus of a chip, Table settings, Chart settings, More and Views are menus in levels.

- The first level is an ARIA menu: `role="menu"` with `menuitem`, `menuitemradio`,
  `menuitemcheckbox`, `group` and `separator`. It has one Tab stop with a roving `tabindex`, the
  arrow keys, Home and End, and type-ahead. Each row shows what is set on its right. Its name has
  ", changed" where the setting is not the default.
- Enter or the right arrow opens a topic's level in the menu's place. A level of choices is a menu
  again, labelled by its title ("Month › Group"). A level with form controls (Filter, Top items,
  Number ranges, Name, Keyboard shortcuts) is a `group` labelled by its heading.
- Escape or the left arrow goes back, with the focus on the row the level came from.
- Escape on the first level closes the menu, and the focus goes back to its button. Tab closes it
  and moves on from the button.

The popover around them is a non-modal dialog. It holds the field's name with its "i" and the
search, which a menu cannot hold.

Every choice applies at once. A number applies about half a second after the typing stops, or with
Enter. A value's name applies with Enter or when the field is left. Escape in a field gives back what
applies.

| Menu | First level | Levels |
| --- | --- | --- |
| A field on Rows or Columns | Sort (A to Z, Z to A side by side), sort by its one value, Filter, Top items, Move to, Remove field | Sort by value (two or more values, or a custom order), Filter, Group (dates), Number ranges (numbers), Top items, Move to |
| A field in Filters | Filter, Group (dates), Move to, Remove field | Filter, Group (dates), Move to |
| A value | Summarize by, Show as, Number format, Highlight (side by side), Name, Move to, Remove field | Summarize by, Show as, Number format, Name, Move to |
| Table settings | Totals, Rows (Expand all, Collapse all with what it keeps: "Show Region only") | |
| Chart settings | the chart types, then Value labels, Legend, Title, Axis, Tooltip, Reference lines, Series, Layout | each Display topic. Layout ends with "Show each Country" and "Show Region only" |
| More | Help, then the toolbar's buttons that do not fit | Help (Show tips, Show explanations, Show dismissed tips again, Keyboard shortcuts), Keyboard shortcuts |
| Views | This view (Save "…", Save as…), Shared views, My views (each entry with its Publish and Delete as items next to it), Share this view (Copy link, Copy view as JSON, Download view, Open view file…) | Save as, Open view file, the question before a delete, a publish or a Save over a shared view |

The chip menus have a search above their first level, and `/` focuses it.

- It finds a choice of any level by its text, the titles above it and a few more words (labels
  `showAsKeywords`, `nameKeywords`, `filterKeywords`).
- It opens a level by its title.
- For a date field, it also makes hits from a number typed: the quick choices with that count
  ("last 3 years") and a year compared ("from 2022").

Enter runs a hit the arrow keys reached, not the text typed.

The Filter level of a date field shows its quick choices and the days each one keeps. The days
count relative to one of these:

- today: the current time read in `encode`'s `timeZone`, through pivotkit-core's
  `relativeDateRange`
- what the person picks under "Counted back from": the data's latest or first date, or a day of
  their own (the filter's `anchor`)

The level offers This only for the units whose current period has data. It says the data's share of
a range ("2025; 2026 has no data"). When the data have no date after today, it leaves out the days
from today on in a range that holds today. Today comes from `encode`'s `timeZone`. With rows dated
after today, it names every day.

The rules write pivotkit-core's `relative`, `compare`, `value` and `text` filters
([Filters](../concepts/filters.md#filters-in-the-ui)). A rule's result line and the summary compute
the field's totals with pivotkit-core's `computePivot` on the field alone, in its Grand Total scope.
What is typed in a level also applies when the level or the menu closes, such as on a click outside.
A popover keeps its side of the anchor while its content changes, such as when a level opens, as
long as that side has room.

A menu keeps the mouse wheel to itself. The menu stops a wheel turn that nothing inside it can
scroll further, so the table or the page behind never scrolls. `overscroll-behavior: contain` does
the same for touch. A menu is at most as high as the window, and scrolls inside.

No menu folds. The Export menus are flat lists in titled groups (`role="group"` with its title).
Chart settings has its types first, then a row per Display topic that opens a level, like the
field menus.

An "i" next to a setting explains it on hover, focus or tap. Settings with an "i": the totals, Show
as, Excel and CSV in the export menu, and Labels and Group labels of the chart.

- Shown on hover, the description stays while the pointer moves from the "i" onto it, also slowly:
  up to one and a half seconds on the way. So its "Learn more" link can be reached.
- It is the same button as a field's "i". Its name is "About <setting>".
- A menu row stays one line. Next to an item of a menu in levels (the totals), the "i" is for the
  pointer. The item carries its text as its description, so the arrow keys stay on the items.
- More, Help, "Show explanations" (or `settingInfo`) hides them all.
- The export menu is a dialog, so Tab reaches each format's "i".

The report disables an entry that would change nothing. In a menu in levels it uses
`aria-disabled`, so the arrow keys still reach it. While the entry is disabled, a short line under it
says why:

- The grand total row needs a field in Rows.
- The grand total column needs one in Columns.
- Row subtotals need two or more fields in Rows.
- Column subtotals need two or more in Columns.
- Every total needs a value. A disabled total shows no tick.
- Expand all and Collapse all.
- The chart image: "Switch to Chart first."
- A pie's Labels, while value labels are off.

## Form fields

Every `input`, `select` and `textarea` of the report has a label (its text, `aria-label`). It also
has a `name` of its own report: `pk-`, then a part chosen once per report in the browser, then
React's `useId` (`pk-x3k9q1-r1f`), so two reports on one page share no name, and neither do two web
components. Browsers fill and restore fields by name. Browsers' developer tools flag a field without a
name or an id. The names are not stable across page loads. Do not select the fields by them. The
`data-testid`s are for tests.

## Test ids

A `data-testid` is not public interface. The changelog lists the ones a release changes. Those of
the layout:

| Test id | What |
| --- | --- |
| `zone-section` | the section "Fields in the report" |
| `layout-summary` | its fold button, with `aria-expanded` |
| `zones-sub` | what is placed, after the heading while folded |
| `zones-info` | the section's "i" |
| `swap` | Swap rows and columns, at the end of the heading row |
| `add-field-<zone>` | "+ Add" of a zone: `add-field-filters`, `add-field-cols`, `add-field-rows`, `add-field-values` |
| `add-menu-<zone>` | its menu; each field in it is `add-pick-<field>`, a disabled one's reason `add-pick-<field>-reason`, the line that says what a pick does `add-pick-<field>-note` |
| `zone-info-<zone>` | the "i" next to a zone's title |
| `zones-status` | the status region that says what "+ Add" did |
| `show-table`, `show-chart` | the tabs, with `aria-selected` |
| `view-settings` | Table settings or Chart settings |
| `chart-types` | the group of chart types in Chart settings; each type is `chart-<type>` |
| `chart-show-each`, `chart-show-only` | Chart settings › Layout: "Show each …" and "Show … only" |
| `expand-all`, `collapse-all` | the same in Table settings |
| `more`, `more-help` | More, and its Help entry |

## Popovers and the host page

Menus, bottom sheets and the "i" popups opened by a click open in the browser's top layer
(`popover="manual"`).

- They show above the host page's own layout, whatever its z-indexes, such as a fixed navigation
  drawer at 1200 or an app bar.
- The page's boxes never clip them.
- They stay in the report's DOM, and the report places them against the window.
- A description shown on hover of an "i" outside a menu stays in the report's layer. One inside a
  menu opens above the menu.

A browser without the Popover API stacks them by `--pk-layer-z`:
[popovers above the page](theming.md#popovers-above-the-page).

## Escape and the host page

While a popover, the drill-down or the narrow field drawer of the report is open, the report
listens for Escape on the whole `document`. It closes its newest layer only, also when the focus is
outside the report, such as on the host page. It calls `preventDefault()` on that Escape. It leaves
alone an Escape that is `defaultPrevented` already.

A host that opens a dialog of its own while a report layer is open has two ways:

- Handle Escape in the dialog's own `keydown` listener, which runs before the document's, and call
  `preventDefault()`.
- Close the report's layer first.

[Keyboard and screen readers](../use/keyboard.md) lists the keys of the report itself.

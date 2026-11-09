# Changelog

All notable changes to `pivotkit-react` are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Filter rules ([#89](https://github.com/eizedev/pivotkit/issues/89),
  [#90](https://github.com/eizedev/pivotkit/issues/90)). The Filter level of a date field (or a
  grouping of one) starts with quick choices: All, This year, Last [N] years and, unless it is
  grouped by year or quarter, Last [N] months, each with the days it keeps ("2022–2026"), relative to
  today in the data's time zone; "Custom rules" while the rules hold more. Under "More ways to
  filter" a rule editor: sentences that all apply together, added and removed one by one, each
  applied once complete: the item itself compared ("Released by year is from 2022", for dates also
  "is in the last N years"), its total compared ("Count of Released is greater than 3"; "Count of
  rows" with nothing in Values) and a rule on its name. The chip, the menu's first level and the
  level say the same words: "last 5 years (2022–2026)", "from 2022", "Count of rows > 3".
- A field in Filters opens a menu of its own with the same Filter level (Filter, Move to, Remove
  field) instead of the filter popover.
- The menu search finds the rules ("rule"), the quick choices with the count typed ("last 3
  years") and a year compared ("from 2022"), and applies them at once.

### Changed

- The text condition and the condition on a value of the Filter level are rules now: each is added
  with its button and taken away with its ×; "is anything" and "No condition" are gone. "Remove the
  conditions" is "Remove the rules" and takes the quick choice of a date too.
- A sort, Top items or a value condition by the row count the view does not show is named "Count
  of rows" ("Anzahl der Zeilen").
- The filter popover is only the field list's "Filter…" of a field not placed yet, so its "Remove
  filter" is gone (with the label `removeFilter`).
- The menus of a chip and Options are in levels instead of long accordions. The first level is a
  short summary: one row per topic with what is set on its right ("Filter · All", "Top items · Off",
  "Number format · ● Currency"; the dot and ", changed" in its accessible name where it is not the
  default), or a topic's few choices right there (A to Z and Z to A, a value's Highlight, the totals
  and help switches). A row opens the topic's own level in place, titled with the field ("Month ›
  Group"), with **‹ Back**. The first level and the levels of choices are ARIA menus (WAI-ARIA
  Authoring Practices: one Tab stop, arrow keys, Home and End, type-ahead; Enter or the right arrow
  into a level, Escape or the left arrow back to the row it came from, Escape on the first level
  closes the menu, Tab closes it and moves on); a level with form controls is a group with its
  heading. A search above a chip menu's first level finds a choice of any level, with its path.
- Every choice in these menus applies at once, without Apply: the values of the Filter level (in a
  chip's menu; the filter popover of a Filters chip keeps its draft and Apply), the text condition and
  the numbers a moment after the typing stops (or with Enter), a value's name with Enter or when the
  field is left; Escape in a field gives back what applies. Number ranges keep Apply (size and start
  apply together).
- The Filter level of a field: how many items the list keeps, **Remove filter** (now also taking the
  value condition; Top N stays), the values with their counts, the condition on the names, and the
  condition on a value as a sentence ("Keep Region items whose Sum of Revenue is greater than …";
  "is anything" takes it off). The Top items level: Off, Top 3, Top 5, Top 10, or **Top N…** with Top
  or Bottom and a count. The Group level of a date: one column, each unit's example on its right,
  under "Along the time line" and "Same period every year". Sorting by a value: on the first level
  for one value, else in the level **Sort by value**.
- Options: the totals and help switches are menu items (`menuitemcheckbox`); one that would change
  nothing is `aria-disabled` with its reason, so the arrow keys still reach it; the "i" next to a
  total is for the pointer, its text is the item's description; Keyboard shortcuts is a level.
- The Views menu is in levels too: its first level is the flat list to scan (This view with Save “…”,
  Save as… and New, Shared views, My views, Share); Save as…, Share (copy link, copy JSON, download,
  Load view…) and the questions before a delete, a publish or a Save over a shared view open levels of
  their own. An entry's Publish and Delete are items next to it, reached by the arrow keys; after a
  delete the focus goes to the entry that takes its place.
- No menu folds any more: the chart type menu (its Display settings shown at once) and the Export
  menus are flat lists in titled groups. The folding (`SECTIONS`, `open:<section>` and
  `closed:<section>` in the tips' list) and **Reset menu sections** are gone; a stored state of a
  section is dropped when the list is read, and `dismissedTips` and `onTipDismiss` carry only tips and
  switches.
- After a usability review: the Filter level shows the list first and folds "More ways to filter"
  (the text condition and the condition on a value) each time it opens; its first line names the
  conditions; Clear picks and Remove the conditions replace Remove filter there; the comparison has a
  line of its own. A typed name, count or number applies when the menu closes from a click outside.
  The search knows "percent", "%", "rename", "top 5" and the two conditions, and `/` goes to it. A
  format the menu does not offer (number:1) is a checked entry by its name. The levels of choices are
  one column, the chip menus 420 px wide. The Sort row names a sort by a value; the menu's head names
  the field as its levels do; Expand all has a neutral icon; Select all and the Filter level's
  actions are underlined. A popover keeps its side while its content changes.
- A menu whose entries are all off (the Export menu of an empty report) no longer puts the focus on
  its first "i", whose explanation opened over the entries; the menu takes the focus itself.
- Text fields, searches and selects in the menus have an edge of 3:1 contrast in both themes: the new
  token `--pk-input-border`.
- Labels of the menus (a host's `labels` for them): new `back`, `backTo`, `levelTitle`, `searchMenu`,
  `searchMenuShort`, `searchResults`, `searchNothing`, `sortByValue`, `sortOldestShort`,
  `sortNewestShort`, `filterTopic`, `filterAll`, `groupTopic`, `groupNoneShort`, `off`,
  `moveToTitle`, `topOwn`, `binsOff`, `itemsPicked`, `valueConditionTitle`, `keepWhose`,
  `valueOpAny`, `nameHint`, `showAsKeywords`, `nameKeywords`, `filterKeywords`, `formatDecimals`,
  `pickedPlus`, `conditionOnNames`, `conditionOnValue`, `listAnd`, `clearPicks`, `removeConditions`,
  `moreFilters`; changed: `valueOps` is the comparison inside the sentence ("is greater
  than", German "größer als"), `groupCyclic` reads "Same period every year"; gone (no longer shown):
  `chooseValues`, `valueFilter`, `change`, `removeSetting`, `topStart`, `binsStart`, `filterIs`,
  `groupBy`, `resetSections`, `resetSectionsDone`. A host's text for a key that is gone is ignored.

### Fixed

- A press inside a menu that a chip or a field opened no longer drags that chip or field: selecting
  text in the menu, pressing a native select of a rule, or a click that moves a little (Clear picks
  over the Values zone) moved the field to another zone and lost its filters. The menu is rendered
  through a portal, and React passed its mouse and touch events up to the chip's drag listeners;
  they now take only events from the chip's or field's own elements.
- Filter rules after review: a rule on the names shows its words on the chip ("contains “linux”");
  the pick list marks the items the field's rules leave out and the first line counts what shows
  ("2 of 36 items shown: last 2 years (2025–2026)"); the quick choices follow Undo; a count above
  500 says so; a new rule and the opened rules scroll into view; a narrow chip cuts the rule, not the
  field's name; "is not" says blank items are not kept; counts of one have their own words ("Letztes
  1 Jahr", "im letzten 1 Monat"); the rule on a total names the items ("Region items whose …"); the
  search offers "from 2022" for a grouping by year only. The labels `labelOps` load first now (the
  chip says them).
- On a touch screen the field list keeps its desktop rows: the grip, the "i" and the menu of a
  field keep their size and get a hit area 44 px high instead (the grip's 44 px wide), within their
  own row; they made every row 44 px or more high and broke names such as "Sunshine h" into two lines.
- Highlight keeps a value's own colours: Colour scale while it is checked changes nothing (it
  replaced a view's own colours by the theme's), and None or Data bars and back bring the value's
  colours of an earlier step of the history back.
- The "i" popover (and every other popover) appears at its final size and place
  ([#91](https://github.com/eizedev/pivotkit/issues/91)). Where the area of fixed elements ends before
  the window's edge (a classic scroll bar, as on Windows; a transformed host element), it narrowed a
  little on every placement, over about a second; it now takes its own width (`width: max-content`,
  capped as before) and is placed inside the window without its scroll bars.
- With reduced motion a chip's menu (and every other menu) takes the focus when it opens
  ([#78](https://github.com/eizedev/pivotkit/issues/78)). The reduced-motion rule gave every element a
  transition of 1 ms, also those without one of their own (`transition-property` is `all` by
  default), so a popover shown from `visibility: hidden` was still hidden in the frame its focus
  moved; reduced motion now turns animations and transitions off (`animation: none`,
  `transition: none`), so nothing moves at all.
- German texts quote with German quotation marks
  ([#79](https://github.com/eizedev/pivotkit/issues/79)): a text condition in a chip's menu
  ("enthält „an“") and the fields a view for other data names ("Felder, die diese Daten
  nicht haben: „Country“") take their quotes from the new label `quote` (`"“{text}”"` in English,
  `"„{text}“"` in German); they were English quotes in every language.
- The empty report's first steps ("Build your report in three steps" with its **Start with …**
  buttons) are no longer cut off in a report lower than they are (a host's height, the result's least
  height of 240 px): the result's area scrolls what is taller than it (`.pk-result` is
  `overflow: auto`); the table keeps scrolling in its own box.

## [0.2.0] - 2026-11-08

### Added

- A view's unused parts as a warning in plain words
  ([#56](https://github.com/eizedev/pivotkit/issues/56)). What a saved view (the host's templates
  and the browser store's), a link or a loaded file asks for and the data or this version cannot
  give is a notice above the result, open the first time it shows for a view (another view loaded
  opens it again, also with the same parts) and folded with its title: "2 parts of this view could
  not be used", one line per part with what it is about in bold (the value's name, the field, the
  part of the report; two entries of one name say which one, "Sum of Units (no. 2 in Values)"),
  what is wrong and what is used instead ("Quakes: the colour scale needs two or three colours - the
  default colours are used"), and below it, small, the path and pivotkit-core's message for
  developers. An open warning shows its first three lines (two on a narrow report) and "Show N more"
  for the rest. A screen reader hears it once (the title through a live region, or the status note
  "View loaded; some parts did not fit this data" alone); it never takes the focus; its x dismisses
  it and moves the focus to what follows it. The words for every issue code (pivotkit-core's
  `VIEW_ISSUE_CODES`) load on demand when a view has such parts (`unused-texts.js`, German in a file
  of its own); until then, or when they fail, each line shows the core's English message, and a
  German report falls back to English. A code a newer pivotkit-core adds gets a general text.
  The plain words need the pivotkit-core release with issue codes (the next release); with an
  earlier pivotkit-core each line shows the core's English message.
  Labels: `unusedParts` (the title, a count), `unusedPath` ("For developers:"), `unusedMore` (a
  count) and `unusedFewer` are new; the texts of the lines are `labels.unused` (`codes`, `dropped`,
  `sections`, `settings`, `view`, `quote`, `position`, `other`, `item`), which a host overrides as
  any label and which `pivotkit-react/labels` has in `LABELS`. Hosts that override labels: `issues`
  is gone (the title is `unusedParts` now, with the count in it), and so are `viewMissingFields`,
  `viewOtherIssue` and `viewOtherIssues` (each part has its own line now).
- Sorting with a click on a table header
  ([#55](https://github.com/eizedev/pivotkit/issues/55)). A value's name sorts the innermost row
  field by that value: largest first, smallest first, then the field's own order again; a row
  field's name toggles A to Z and Z to A. It writes the same sort entry as the chip menu, as one step
  Undo takes back. Only the name is the button (the cell's edges stay free), reached with Tab and
  pressed with Enter or Space; with column fields only the grand total column's value names sort.
  The header whose sort was chosen carries `aria-sort` (one at a time; `other` for a custom order;
  the default A to Z none); an
  arrow marks the chosen order and, on hover and focus, the next one, and a faint arrow every name
  that sorts on a touch screen, where the name is a 44 px target; a screen reader hears the new
  order. The table's tip ("Click a value, ...") and `shortcuts.open` say that a header sorts. New
  labels: `headerSort`, `headerSortDesc` and `headerSortAsc` (the tooltip of a row field's and a
  value's name) and `headerSorted` (what is read out).
- Save, Save as and New for views
  ([#60](https://github.com/eizedev/pivotkit/issues/60)). The toolbar shows the name of the view
  loaded (a saved view, a view file, a link) next to Views, with a dot while it has unsaved changes
  (`labels.unsavedChanges`); the name is a button that opens Views. The Views menu starts with
  "This view": **Save “…”** writes the loaded view under its name in one click (a view of the
  browser store in its place, a user's view of the host through `onSaveTemplate`, a shared view
  through `onPublishTemplate` with `canPublish`, after "Replace the shared view “…” for everyone?").
  It is off with the reason for a shared view the user may not change, for a view from a file or a
  link and while the report is empty. **Save as…** is the name field (its button "Save as"): a
  name that exists among the user's views asks "“…” exists. Replace it?" first. **New, empty report** (in
  the menu) empties the report to the start screen in one step. The name belongs to the history's steps: New and Reset take it away
  (the report no longer shows that view), Undo and Redo move it with the view. A view of the browser
  store is known by its name and the data it names, so two views of one name (one saved without
  named data) stay apart; another source with the same columns keeps the view but not its name. A
  reload with `persistView` keeps the view, not its name. A save that answers after New, another
  view loaded or a change names nothing it did not save. New labels: `newEmpty`,
  `unsavedChanges`, `steps.new`, and in the menus `thisView`, `saveNamed`, `saveAs`,
  `saveSharedLocked`, `saveNotInViews`, `replaceConfirm`, `replaceSharedConfirm`, `replaceAction`,
  `newAlready`, `settingInfo.newReport`.
- Publish as shared view hands over the view in the same form as Save: normalized against the data,
  with the host's custom orders (`fieldDefaults.order`) the report shows.
- Host notes: Save and Save as call `onSaveTemplate(name, view, { scope: "user" })` and
  `onPublishTemplate(name, view)` with a name that exists: the host replaces the view of that name
  (an upsert by name), it does not add a second one.

### Changed

- The field chip menu shows each setting first, one line per setting
  ([#57](https://github.com/eizedev/pivotkit/issues/57)): "Top 10 by Sum of Revenue · Change ·
  Remove", "Ranges of 0.5 from 4.5 · Change · Remove", "Sum of Units > 1,000 · Change · Remove",
  "Filter: 15 of 45 · Remove" (each Remove takes only its own setting); with nothing set, one item
  ("Show top items…", "Group into ranges…", "Value condition…") opens its form in place, with Apply
  and Cancel (Cancel puts the focus back on the line; the form scrolls into view). Filters offer
  "Choose values…" and "Value condition…" as equals. Order: Sort, Filters, Top items, Group, Move.
  The field's description (with its link), and in a value's menu the note that values are not
  filtered there, are behind an "i" next to the field's name in the menu's first row, instead of a
  paragraph.
- Menu sections: a folded title says what the section holds, muted at its end ("Number format ·
  Automatic"), with a dot (read as ", changed") when it is not the default; titles read as controls
  (the text's colour, a larger chevron, 44 px high on a touch screen). Share (Views) and Display
  (chart type) start folded; Options → Rows, the value's Name and its Filters note fold no more.
  Options → Help has "Reset menu sections" (the focus then on the Help title, a status says it);
  "Show dismissed tips again" keeps the folding, as before. The drill-down's Export menu has Download
  before Copy, as the toolbar's. My views, empty in the browser store, is one line.
- Labels for hosts that override them: `topN` reads "Top items", `bins` "Number ranges", `valueFilter`
  "Value condition…"; new are `change`, `topStart`, `binsStart`, `binsState`, `chooseValues`,
  `noViewsStore`, `resetSections`, `resetSectionsDone`, `sectionChanged` and
  `settingInfo.valuesFilter`. `valuesFilterHint` is gone (its text is `settingInfo.valuesFilter`): a
  host's text for it is no longer used. The `dismissedTips` entries `open:`/`closed:` of `name`,
  `valueFilters` and `folding` are dropped.

- What runs only after a click in a menu loads with the menus, not with the report
  ([#73](https://github.com/eizedev/pivotkit/issues/73)): the view changes only the menus make and
  the filter's summary (`menu-ops.js`), sharing's Copy link, Copy view as JSON, Download view and
  Load view (`share-actions.js`), the drill-down's table (`drill-table.js`, built when the panel
  opens), and the texts only these show (the totals and their reasons, Expand and Collapse all's
  notes, the filter's text conditions, sharing's notes, `toastExported`, `chartDisplay`) move to
  `menu-labels.js`. The chart's label layout (`chart-layout.js`) loads with ECharts. A host's
  `labels` for them still win, `LABELS` of `pivotkit-react/labels` is unchanged, and the files of
  `dist/` stay the same; a value clicked before the menus are there opens its rows once they are.

- The menus' German texts are a file of their own, `dist/menu-texts-de.js`, loaded with the menus
  only for a German report, or when the locale changes to German
  ([#73](https://github.com/eizedev/pivotkit/issues/73)). A menu waits for them ("Loading…"), so it
  never shows English first, and keeps its texts (and its state and focus) while the language
  changes with it open; when the file cannot load, the menus open in English and the next menu tries
  again. A host's `labels` still win; `labels` with `lang: "de"` load the file too. The loading line
  is announced to screen readers. The menus' sections and the "i" of the
  settings (`section.jsx`) load with the menus, not with the report; their context is `help.js`.
  The element's menus are 2.7 KiB gzip smaller for every page that is not German. `LABELS` of
  `pivotkit-react/labels` is unchanged. A host that copies `dist/` by hand copies the new file too
  (it is in `dist/`).

- The README, the package's page on npm, is a short landing page: what pivotkit-react is, one screenshot,
  install, one example and a table of links into the
  [documentation site](https://pivotkit.eize.dev/), which holds the details.
- Views stays in the toolbar from a window about 1280 px wide: it is the last button to move into
  "More" (`OVERFLOW_ORDER`: Reset, Layout, Options, the chart type, Views), so it shows wherever one
  button besides Undo, Redo and Export fits, with the loaded view's name before it. Options and the
  chart type move into "More" before Views: at about 1280 px the chart type is in "More", from
  about 1440 px both show. The name is cut with "…" but never below 4em.
- Every save closes the Views menu, as Save “…” does: also the first Save of a view without a name
  and Save as (it stayed open with Copy link). The focus goes back to Views (or More), the note says
  "View “…” saved".
- The question before a view is replaced ("“…” exists. Replace it?", "Replace the shared view “…”
  for everyone?") has the focus on Cancel, so Enter replaces nothing.
- The view loaded has a check mark (and `aria-current="true"`) in Shared views or My views; while
  Views is in "More", More shows the dot for unsaved changes too.
- The texts of the keyboard shortcuts (`labels.shortcuts`) load with the menus, where Options, Help
  shows them (`menu-labels.js`): a host's texts for them apply as before. This made room in the first
  load for sorting by a header.
- The forms of a row or column field's menu (number ranges, Top N, value condition) remove what
  they set with **Remove** (was "Clear"; label key `removeSetting`, was `clear`), and Apply with an
  empty number removes it too instead of asking for a number. One undo step, as before.
- The foot of a chip menu reads **Remove field** ("Feld entfernen"), so it is not mistaken for a
  form's Remove.

### Fixed

- Copy table, Copy data as JSON, Excel, CSV and PNG are off for an empty report (no field placed),
  with the reason "Add a field first." (`labels.exportNeedsField`); they produced empty output
  before, and no `onExport` call happens for them now
  ([#61](https://github.com/eizedev/pivotkit/issues/61)).
- A click or Enter on a field of the field list that is in Values already no longer adds it again
  ("Count of Ticket 2", "3", ... on a repeated Enter): it stays, and the status line says "Ticket is
  already in Values", as for a field in Rows. A second value of the same field is "Add to Values
  again" in the field's menu (label `addAgain`).
- A donut on a narrow chart: a legend on the right of a chart narrower than 480 px is drawn at the
  bottom, so the ring keeps its width, and numbers inside a ring too thin for them are written
  outside on a line instead of spilling over its edges.
- A colour scale in the theme's colours (Highlight, "Colour scale") no longer shows "Some parts of the
  view were not used" (pivotkit-core's normalize).

## [0.1.0] - 2026-11-07

First release.

### Added

- The Export menus (the toolbar's and the drill-down's) fold their sections Download and Copy
  (`exportDownload`, `exportCopy`), remembered as the other sections. Copy table and the drill-down's
  Copy say in their "i" and their note that the copy is tab-separated and pastes into Excel or Google
  Sheets as columns. The status notes show above the drill-down panel, so its copies and exports are
  seen. The popovers' layer is no longer inside a clipping box: the report's layout clips its content
  instead of the report, so Safari no longer cuts a popover (the filter from the field list) at the
  report's edge.
- The field list collapses to a rail of about 40 px (`--pk-rail-w`): « next to "Fields"
  (`collapseFields`, `aria-expanded`), the rail with "Fields" upright (`expandFields`) and a search
  button that opens the list with the focus in its search field; a chip dropped on the rail leaves
  the report (the rail reads "Drop here to remove" while one is dragged); another `fieldList` value
  is ignored with a console warning; the choice is kept with the tips (`-fields`); `fieldList` (`"open"`, `"collapsed"`)
  starts it so. Not on a narrow report (the drawer); Enlarge hides it. The check and merge of
  `chartOptions` and the report's marks on the chart's option load with ECharts
  (`dist/echarts.js`), so the first load stays small; the `chartOptions` warning comes when the chart
  is drawn.
- Templates in two groups of the Views menu, "Shared views" and "My views" (labels `sharedViews`,
  `myViews`; "Gemeinsame Ansichten", "Meine Ansichten"), each shown only with entries ("My views"
  also while people can save; `noViews` when there is nothing at all). `templates` entries take
  `scope` (`"shared"` or `"user"`; without it a `deletable` entry is the user's own) and `file`, a
  view file instead of `view` (its name the default). A shared entry that cannot be deleted has an
  "i": "Only admins can change shared views." (`labels.settingInfo.sharedView`), where someone can
  change shared views (a deletable shared entry, or Publish). Every name is plain text, at most 120
  characters; a deletable entry without `scope` is listed under My views with a console warning once.
  A published view is sent normalized against the data. `onSaveTemplate`
  gets `{ scope: "user" }` and `onDeleteTemplate` `{ scope }`. `canPublish` with `onPublishTemplate`
  offers "Publish as shared view" on the user's views, asked in place (`publishView`,
  `publishConfirm`, `publishAction`, `toastPublished`, `toastPublishFailed`,
  `toastPublishRejected`). After a delete, a publish or Cancel the focus goes back to the entry in
  that place. `templateStore="browser"` keeps the user's views in localStorage
  (`pivotkit:views:<storageKey>`) as view files per data (`source`), at most 100 views and 500,000
  characters for a save (a delete is never refused; a text over the cap is not read), a delete
  changed in another tab meanwhile refused (`storeChanged`), read after hydration, with a note that they stay in this browser (`storeNote`) and
  the reasons a save is refused (`storeFull`, `storeTooLarge`, `storeRefused`); the host's
  `onSaveTemplate` wins. The texts of save and delete (`toastSaved`, `toastDeleted`,
  `toastSaveFailed`, `toastDeleteFailed`, `toastSaveRejected`, `toastDeleteRejected`) load with the
  menus, as does the browser store with pivotkit-core/templates, so the first load stays small.
- The drill-down panel: Enlarge fills the report with it (Reduce or Escape brings it back, a second
  Escape closes it; the focus stays on the button; not on a narrow report, not part of the view),
  columns as wide as their content with a long text wrapping, and an Export menu: Copy (the rows as
  shown, tab-separated with a header row, for a spreadsheet), Copy as JSON (field names and raw
  values), Download CSV and Download Excel (pivotkit-core's rows exporters, the panel's formats, named
  after the cell: "Central – Jul 2026"). With more rows behind the value than `drillDownLimit`, every
  export holds the rows shown, and the menu and the note say so ("Copied 1,000 of 4,212 rows").
- Export, Copy table (the table as shown, tab-separated, headers and totals) and Copy data as JSON
  (pivotkit-core's `toJson`: header texts, labels and raw values; not the view, which Views, Copy view
  as JSON copies); a page that does not allow copying gets a note. `onExport` gets every copy too:
  kinds `copy-table`, `copy-json`, `drill-copy`, `drill-json`, `drill-csv`, `drill-xlsx`, with `text`
  for a copy and `rows: { shown, count }` for a drill-down export; returning false keeps it from the
  clipboard or the download. The Export menu and its texts load with the menus; the export module
  starts loading when the Export menu or the drill-down opens, so a copy happens in the click.
- The filter and the chip menus (a scrolling middle, a foot that stays in view) may cover their anchor
  when they fit neither below nor above it: placed against the window's edge, as tall as the window
  allows (`fill` of the popover); every other popover stays next to its anchor and scrolls. The
  filter is a column with a scrolling middle (values and condition, the list of values giving way
  first), its head and Apply and Cancel always in view.
- Enlarge of the result and of the drill-down: the name says what a click does (Enlarge, Reduce), so
  the button is no toggle (no `aria-pressed`); the highlight shows the state.
- Sort by value and Top N by any value that gives numbers: the sort section lists "Largest … first"
  and "Smallest … first" for each such value, Top N has a "by" select; the first value is the
  default. A value condition on a row or column field ("Value filter…" in the Filters section of its
  menu: a value, an operator of `CATALOG.valueOps` and a number, two for between), pivotkit-core's
  `value` filter, shown on the chip and in the menu as "Sum of Revenue > 1,000"; Clear removes it,
  Remove filter too; editing changes only the condition (or top N) being edited, and a measure no
  longer among the values stays a choice. Numbers in the menus (value condition, Top N, number
  ranges) are text fields read in the report's locale ("1.000,5" in German, a plain "1000.5"
  everywhere), with a note under a field that holds no number. Labels `numberInvalid`,
  `countInvalid`, `sizeInvalid`, `topBy`, `valueFilter`, `valueFilterBy`, `valueFilterOp`,
  `valueFilterNumber`, `valueFilterTo`, `valueOps` and `valueConditions`.
- Chart display settings in the chart type menu ("Display"): value labels, legend, title, smooth
  lines, axis labels (all straight when they fit, slanted, else every n-th with a note; long names cut
  with "…", whole in the tooltip), long titles cut with "…", and group labels under the axis for two
  or more row fields (automatic: only where the chart has room; on, off); kept in
  the view, so saved views, links and the PNG export show them. A tip suggests bars for lines over
  categories without an order (`chartTrend`, "Switch to Bars").
- Chart type Donut (a ring; the pie is a whole circle), and "Labels: Outside / Inside" for a pie or a
  donut (`chart.labelPosition`): inside writes only the number on the slice (the share when
  Automatic) in a colour that reads on it, the legend names the slices. Labels `chartTypes.donut`,
  `labelPosition`, `labelPositionNames`.
- `chartOptions`: plain JSON merged over the ECharts option (lists entry by entry, an object into
  every entry of a list); it wins over the view's settings; functions, values that are not JSON and
  the ECharts options that are markup or addresses (a string `formatter` at any depth, `rich`, `link`,
  `sublink`, `image`, the tooltip's element) are left out with a warning.
- The Views menu (labels `views`, `share`; "Ansichten" in German) with the templates and Share: Copy link (with `shareLink`:
  `true` or a base URL; the view in the fragment, `#pivot=` or `#pivot-<storageKey>=`, only that
  entry changed so a hash route stays; `true` links to the page without its query; read after the
  first render as the start, and on a fragment change as one undoable step), Copy view as JSON,
  Download view (.pivotkit.json) (`onExport` kind `"json"`), Load view… from a pasted view file, JSON,
  a link or a file, and a line on what a shared view gives away (`sharePrivacy`).
- The prop `schemaUrl`: the `$schema` of the view files the report writes (a self-hosted copy of the
  schema, or `null` / `""` for none); loading never depends on it.
- Views are shared as pivotkit-core's view file: the envelope with the view's name, its source and
  the fields it uses, `generator` with this package's version from its `package.json`; a link carries
  its link profile. A bare view and a link with one still load; a newer format or view version is
  refused with "Update pivotkit to open it."
- Props `source` (`{ id, name }`), `sources` and `onSourceSwitch`: a view made for another source, or
  with fields this data lacks or has with another type, asks before it is loaded (Load anyway,
  Cancel, "Switch to “…” and load"); labels `loadCheckTitle`, `loadCheckSource`,
  `loadCheckOtherSource`, `loadCheckMissing`, `loadCheckChanged`, `loadAnyway`, `switchAndLoad`.
- A loaded view is one undoable step with a note that has Undo and goes by itself ("View loaded",
  `toastViewLoadedPartly` when parts were left out: a warning, not an error); what was left out stays
  in the collapsible "Some parts of the view were not used" area above the result until it is
  dismissed (`dismissIssues`) or another view is loaded; so does a saved view trimmed to the limits
  (`viewTrimmed`).
- `persistView="session"`: the view kept per tab in `sessionStorage`; Reset stores the start view.
- `loading` and a skeleton (toolbar, zones, table rows, `role="status"` announced once, reduced motion
  respected) while the host loads data, while more than 10,000 rows are encoded the first time and
  while a link is read.
- Filters say what they keep: "Filter: 15 of 45" or the condition in the chip menu, in the accent
  colour, with "Remove filter" right below; "Remove filter" at the top of the filter popover; the ×
  of the text condition removes it at once.
- One clear "×" for every text field in a menu (field search, value name, "Starting at", saved
  view's name, filter search and condition, Load view): it empties the field and keeps the focus there,
  Escape does the same first; a value's name goes back to its default at once, as one undo step.
- "Filter…" in the field list for a field not placed: its filter opens at once, Apply puts it into
  Filters with the selection.
- The Values menu says where filtering happens; an "i" next to each zone's title explains it with an
  example; the field list's grip says "Drag into a zone" and opens the field's menu on a click.
- Options, Help: two switches, "Show tips" and "Show explanations" (every "i": of the settings, the
  zones and the field descriptions), remembered with the tips (`"-explanations"` in
  `dismissedTips`); `fieldInfo`, `zoneInfo` and `settingInfo` ("on", "off") decide one kind each for
  the host, whatever the switch says.
- One way to explain a setting: the "i" (hover, focus, tap) next to the totals, Show as, Along, the
  export formats (the export menu is a dialog), and a pie's Labels and the Group labels; menu rows stay
  one line (`aboutSetting`, `settingInfo`).
- An entry that would change nothing is disabled and says why, only while disabled: the grand total
  row needs a field in Rows, the grand total column one in Columns, subtotals two or more fields on
  their axis (`needsRowField`, `needsColField`, `needsRowFields`, `needsColFields`), the chart image
  "Switch to Chart first." (`exportPngNeedsChart`).
- Long menus: the wheel and the swipe stay in the menu (the table and the page behind never scroll),
  a menu is never higher than the window; sections fold with their title, the frequent ones open, the
  user's choice kept with the tips (`"open:<id>"`, `"closed:<id>"` in `dismissedTips`); "More
  formats" for the rarer number formats.
- Enlarge and Full screen at the top right of the result: Enlarge lets the result fill the report
  (Escape or the button, which then reads "Reduce", restores; label `reduce`), Full screen uses the Fullscreen API on the report's root (also in a
  shadow root) and is offered only where the browser has it; neither is part of the view.
- Expand all and Collapse all are offered only when they change something, say why not, and report
  what they did ("5 groups collapsed").
- Notices and tips above the result, from one table (`tips.js`). Notices, always shown and not
  dismissible: a filter that leaves nothing (with "Remove filter"), top N, the chart's category cap.
  Tips: what 100 % is for a percentage, dates on Columns and many
  series in a chart (with "Swap rows and columns"), a text field in Values, an ungrouped date with
  many columns (with "Group by"), many columns (swap), Rows without Values, Undo after the first drag,
  saving after five changes (opens Views; after a save it waits for five more), the empty report and
  how to open a value; a chosen chart type over dates ("Show as lines over time", `chartOverTime`),
  a pie or donut of more than 7 slices ("Switch to Bars", `pieSlices`) and one whose columns it adds
  up (`pieColumns`). One tip at a time, the most important first, the next one waiting until it is
  followed or dismissed; in the flow above the result, each with an x; Options has
  "Show tips", "Show dismissed tips again" and the keyboard shortcuts. Props `tips` ("on", "off" or ids),
  `storageKey` (localStorage per report, read after the first render so server rendering and
  hydration match), `dismissedTips` and `onTipDismiss`. The texts are `labels.tips`; the earlier keys
  `topNote`, `bottomNote`, `noValuesHint`, `cellHint`, `emptyHint`, `chartManySeries`,
  `chartDatesOnColumns` and `chartCapped` still apply as aliases of their tip.
- `fieldDefaults[field].label`, `.description`, `.href` and `.type`: a display name everywhere a field
  name shows (chips, headers, value names, drill-down, chart, CSV and XLSX; views keep the names), an
  "i" with the description on hover, focus and tap ("Learn more" for an https link), the description
  at the top of the chip menu and on table and drill-down headers, field search by label and
  description, and the column type for encode. A label two fields share, or another field's name,
  gets the field's name in parentheses. A field without them looks as before.

- `<PivotReport>`: field list with search, type icons, quick add and a menu per field; Rows, Columns,
  Values and Filters zones with chips that are dragged, reordered and removed and say what is set on
  them ("3 of 4", "Top 5", the sort); chip menus for sort, date grouping, number ranges, top N,
  filter, aggregator (common ones first), "show as", number format, highlighting, name and move.
- Controlled (`view` + `onViewChange`) and uncontrolled (`defaultView`) use; the undo history stays in
  the report however often the host renders, new data with the same columns keeps it; `dataKey`
  encodes a new array only when its key changes. Undo notes say what was undone.
- A date is grouped by the span of its values when it is placed (day, month, quarter or year);
  `fieldDefaults` gives a field's aggregator and format in Values.
- Drag and drop with @dnd-kit (mouse, touch and keyboard with positions announced), a drag preview
  above everything, auto-scroll, drop on the field list to remove, header cells dragged into a zone.
- Table with sticky header and row labels (their offsets follow the report's width and fractional row
  heights), expand and collapse, totals on and off, colour scales and
  data bars, keyboard navigation, drill-down panel and `onCellClick`; virtual scrolling from 300 rows.
- The chart type "Automatic" (the default, `chart.type: "auto"`): lines when a date or a grouping of
  one along the time line is on Rows (a weekday or hour of day is bars); with dates on Columns only, lines too, with rows and columns swapped for the chart
  alone (the table keeps its layout); bars otherwise. The toolbar's button shows the type ("Automatic",
  "Bars"; its name "Chart type: …"), the menu's "Automatic" what it draws now (`chartAutoNow`). A
  type the user picks stays.
- Chart with Apache ECharts (a peer dependency, loaded on first use): bars, stacked and horizontal
  bars, lines, area, pie, donut, heatmap (its colour scale in the value's number format), themed from the `--pk-*` tokens, with a text alternative, at most 50
  categories, tips for many series and dates on Columns, and "Swap rows and columns"; a stacked area
  or line chart is named "Area" or "Lines" in the toolbar and the picker.
- Filter popover with values and row counts, search, select all or none and a condition on the labels
  by the field's type: "Text condition" for text, "Condition on the label" for a number (label
  `conditionNumber`), none for a date or a grouping of one and a yes/no field.
- Undo, redo and reset; saved views (the `templates` prop: load, save, delete of entries marked
  `deletable` after an in-page confirmation; the host's callbacks may return a promise); export to XLSX, CSV and PNG, with
  `onExport` seeing every file before its download and able to skip it (then without the "Exported"
  note).
- Popovers and menus open at their button also inside an ancestor with a transform, a filter or
  `contain`, which becomes the containing block of fixed elements.
- The toolbar moves buttons into "More" by a fixed priority (Reset, Layout, Views, Options, chart
  type) and the report's width, not by the length of its texts: the same buttons show at the same
  width in English and German; Redo stays next to Undo. On a narrow report More and every other menu
  are a sheet at the bottom of the window, as high as 82 % of it, scrolling inside.
- The field list is one stop of the Tab order: arrow keys move between the fields (up, down, Home,
  End) and a field's grip, name, "i" and menu (left, right), Shift+F10 or the context menu key opens
  its menu, Enter on a name adds it; a "Skip to the toolbar" link before it (label `skipToToolbar`);
  both in Options → Help → Keyboard shortcuts. A long field name takes two lines, with the whole name
  as its title.
- A date grouping is named in words: "Created by month", "Erstellt nach Monat" (labels
  `derivedName`, `unitInName`).
- Status notes sit at the bottom edge of the report's part on screen, also when the report reaches
  past the window. The Views menu stays open after "Save", with the new entry and Copy link in it.
- Row labels on a narrow report wrap between words and keep at least 5.5em, so a common word is not
  cut in two; a longer one breaks at a hyphen of its own (labels are data, not the UI's
  language), a word longer than the column only as a last resort.
- On a touch screen (a coarse pointer) the ×, the "i", a field's menu and grip and a tip's x are at
  least 44 px (token `--pk-target-touch`).
- The texts only the menus show load with them (`menu-labels.js`); a host's `labels` for them still
  apply. `LABELS` (every text, English and German) is the subpath export `pivotkit-react/labels`.
- The medium layout narrows the field list without setting `--pk-panel-w` on the root, so a host's
  value of the token stays in force.
- Notes in the status line under the table (none for adding a field), kept while hovered or focused.
- Themes light and dark (`theme="auto"` follows the nearest `data-theme`, also across a shadow root,
  and `prefers-color-scheme`), CSS custom properties `--pk-*` with zero-specificity defaults,
  `prefers-reduced-motion`. Works inside a shadow root with the stylesheet linked there.
- Layouts for wide, medium and narrow reports; toolbar buttons keep their text and move into "More"
  when there is no room; field list as a modal drawer below 640 px.
- Labels in English and German with plain words; `labels` overrides single texts and ignores entries
  of the wrong type; the report's `lang` follows the labels.
- Labels `toastSaveRejected` and `toastDeleteRejected` ("The server could not save the view."),
  shown when the host's save or delete callback throws or rejects without a message; a message the host
  gives (an `Error`, a text) is shown instead.
- Compact layout: below 600 px of height, 820 px in the narrow layout (border box, measured before
  the first paint), the zones start folded into one line that says what is in them, and at most one
  tip shows; the line and the Layout toggle of the toolbar (a stable text with `aria-pressed`; its
  place in the toolbar or in "More" depends on the width only) open and fold them, and a drag opens
  them while it lasts. A fold waits while a menu or popover is open, and a focus in the zones moves to
  the folded line. Labels `layout`, `showLayout` and `layoutEmpty`.
- The result keeps a least height (240 px, 280 px narrow): a report without `height` that needs more
  grows past its 640 px (an inline `min-height`), so the page scrolls; with a `height` it stays inside
  and its table scrolls. The prop `grow` ("on", "off") decides it either way.
- The menus' panels load on demand (`dist/menus.js`, `dist/chunks/`); a failed load says so in the
  menu with Try again, and the next try imports again.
- A link in the page's address made for other data asks before it opens (Load anyway, Cancel, Switch),
  as a pasted view file does; the load check takes the focus when it appears.
- The `label` prop names the report's region landmark (default `labels.report`); several reports on
  one page need one name each.
- A limit of pivotkit-core in place of the result says which one and what to change: too many
  rows in the data (`tooManyRows`), too many cell updates (`tooMuchWork`), groups (`tooManyGroups`) or
  cells with subtotals (`tooManyCells`) in the layout, besides the dense grid's `tooLarge`.
- A field beyond pivotkit-core's limit of its zone (8 per axis, 16 values) is refused with a note
  (`zoneFull`); a saved view with more loads the fields that fit and says so above the result
  (`viewTrimmed`).
- Number ranges: size and "Starting at" (Excel's origin; empty is 0); a new size keeps the start, and
  a start so far from the field's numbers that every row would be blank is refused with a note.
- `fieldDefaults[field].order`: the field's custom order of items. A field placed on Rows or Columns
  is sorted in it, and so is one in a view or template without a sort entry for it; its menu offers
  "Custom order" and "Custom order, reversed" (also for a view's own custom sort).
- Another aggregator in a value's menu keeps the field's format (`fieldDefaults` or the user's own)
  while the result is in the field's unit, not for a count; "show values as" starts again.
- Long row labels wrap: the label columns share at most 40 % of the report's main area and a value's
  name wraps beyond 30 %, so a phone shows values next to nested row labels. From 300 rows on, where
  rows have one height, a label is cut with an ellipsis; the status line shows the whole label of a
  tapped label or of the focused value until the focus leaves the table or the table is scrolled.
- A blank value cell with no rows behind it is not clickable and Enter does nothing; `onCellClick` is
  not called for it. Every empty cell stays an arrow-key stop and a screen reader hears "No rows" or
  "No value" (`labels.emptyCell`, `labels.emptyValue`); a copied selection keeps the cell empty.
- A narrow chip shortens the field's name with an ellipsis and keeps a few characters of it, never a
  badge ("Top 10", "15 of 45"); on a phone a zone's name stands above its chips.
- Heatmaps slant their column names where they would overlap, write every row name where a line
  fits each row (else every n-th), and show the numbers only where the formatted numbers fit the
  cells.
- The export menu says what each file keeps: the XLSX every decimal, the CSV percentages and
  calculations as the table shows them.
- Tested against the five real public data sets of the playground and the documentation site:
  weather (Open-Meteo), countries (World Bank), earthquakes (USGS), Nobel laureates and the release
  cycles of software products (endoflife.date).

[Unreleased]: https://github.com/eizedev/pivotkit/compare/pivotkit-react@0.2.0...HEAD
[0.2.0]: https://github.com/eizedev/pivotkit/compare/pivotkit-react@0.1.0...pivotkit-react@0.2.0
[0.1.0]: https://github.com/eizedev/pivotkit/releases/tag/pivotkit-react@0.1.0

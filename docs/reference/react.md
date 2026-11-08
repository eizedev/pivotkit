---
title: pivotkit-react reference
description: Every prop of <PivotReport>, the package's exports, its layout at every width and its performance.
---

# pivotkit-react reference

```jsx
import { PivotReport } from "pivotkit-react";
import { LABELS } from "pivotkit-react/labels";
import "pivotkit-react/styles.css";
```

Installation and a first example are in [Getting started with React](../getting-started/react.md).

## Props

| Prop | What |
| --- | --- |
| `data` | The rows; encoded once per array, or once per `dataKey`.<br><small>Type: `object[]`</small> |
| `dataKey` | The identity of `data`: a host that builds a new array on every render passes a key, and the rows are encoded again only when it changes.<br><small>Type: `string` or `number`</small> |
| `encoded` | Data already encoded with pivotkit-core's `encode()`, instead of `data`.<br><small>Type: `Encoded`</small> |
| `view` | Controlled: the view to show. Pass back what `onViewChange` gives; the undo history stays in the report however often the host renders. A view the host changes on its own becomes one undo step.<br><small>Type: view</small> |
| `defaultView` | Uncontrolled: the start view.<br><small>Type: view; default: empty</small> |
| `onViewChange` | Every change, as a normalized view.<br><small>Type: `(view) => void`</small> |
| `templates` | The templates of the Views menu, in two groups by `scope`: "Shared views" (`"shared"`) and "My views" (`"user"`); without `scope` a `deletable` entry is the user's own, every other one shared. An entry has a `view`, or a [view file](view-file.md) in `file` (its object or its text; the entry's `name` defaults to the file's). The first three are also offered in the empty state. `deletable: true` shows a delete button for that entry; a shared entry without it has an "i" ("Only admins can change shared views.", `labels.settingInfo.sharedView`). An entry without a name or usable view is left out. Names need not be unique: every entry is shown in order (a saved view may have a preset's name), and `onDeleteTemplate` gets the name. See [Templates and shared views](../concepts/templates.md).<br><small>Type: `{ name?, view?, file?, scope?, deletable? }[]`; default: `[]`</small> |
| `onSaveTemplate` | Shows "Save current view" under My views; gets the name, the normalized view and `{ scope: "user" }`. "View “…” saved" is shown when it returns or the promise it returns resolves; an error when it throws or rejects: with the host's message when it gives one (an `Error`, a text), else "The server could not save the view." (`labels.toastSaveRejected`). It wins over `templateStore`.<br><small>Type: `(name, view, { scope }) => unknown`</small> |
| `onDeleteTemplate` | Deletes a template marked `deletable`, after the user confirmed in the menu; `scope` is the entry's group. The entry goes when it returns or its promise resolves; a failure is shown as for `onSaveTemplate` (`labels.toastDeleteRejected` without a message). The browser store's own entries are deleted there, without it.<br><small>Type: `(name, { scope }) => unknown`</small> |
| `onPublishTemplate` | With `canPublish`: "Publish as shared view" (an arrow) next to each of the user's views (the view is sent normalized against the data), asked in place ("Publish “…” as a shared view? Everyone who uses this report sees it."). The host adds the view to its shared views and passes the new `templates`; "View “…” published" when it returns or its promise resolves, a failure as for `onSaveTemplate` (`labels.toastPublishRejected`).<br><small>Type: `(name, view) => unknown`</small> |
| `canPublish` | The user may publish views for everyone (an admin, as the host decides). The report only shows what the host allows: the server must check who may save, publish or delete. Without it, or without `onPublishTemplate`, nothing is offered.<br><small>Type: `boolean`; default: `false`</small> |
| `templateStore` | `"browser"`: the report keeps the user's own views (My views) in `localStorage` under `pivotkit:views:<storageKey>` (`pivotkit:views` without one), as view files that name their data (`source`); a report lists the views of its data and those made for no named data. Only this browser and device, lost when the site's data is cleared, shared with nobody; the menu says so. At most 100 views and 500,000 characters; a save of a name the store has for the same data replaces it. Read after the first render (no hydration mismatch). With `onSaveTemplate` saves go to the host; stored views are still listed and can be deleted. See [Templates and shared views](../concepts/templates.md#the-browser-keeps-my-views-templatestorebrowser).<br><small>Type: `"browser"`; default: off</small> |
| `fieldDefaults` | The aggregator and the format a field gets when it is added to Values (an average for a duration, say). An aggregator that does not fit the field's type is ignored. Another aggregator picked in the value's menu keeps `format` while the result is in the field's unit (an average to a median), not for a count; a format the user chose stays the same way. In the drill-down, `drillFormat` (else `format`) formats the field's own values: `"text"` shows a numeric identifier as it is (40072, not 40,072), `"date"` a date without its time. `order` is the field's own order of items (`["Spring", "Summer", "Autumn", "Winter"]`): the field is sorted in it when it is placed on Rows or Columns (a `custom` sort in the view, so a template keeps it), and so is a field on Rows or Columns of a view or template without a sort entry for it; its menu offers "Custom order" and "Custom order, reversed", and "A to Z" stays a sort entry of its own; items not listed follow by label. `label` is the name the report shows for the field (chips, headers, value names such as "Sum of Net revenue", the drill-down, the chart and the exported files); views and templates keep the field's own name. `description` (plain text, at most 1,000 characters) shows behind an "i" next to the field and on its chips, at the top of its chip menu and on its table headers; `href`, an https link, adds "Learn more". A field without them looks as it does without `fieldDefaults`. `type` reads the field's column as `"number"`, `"date"`, `"string"` or `"boolean"` (pivotkit-core's `encode` `types`). pivotkit-core's `fieldDefaultsFromSchema` builds all of it from a JSON Schema or an OpenAPI document: [Field descriptions and names](../concepts/fields.md).<br><small>Type: `{ [field]: { agg?, format?, drillFormat?, order?, label?, description?, href?, type? } }`</small> |
| `onCellClick` | A click (or Enter) on a value or a chart point: key paths of its row and column, the value, the number of source rows and the first `drillDownLimit` of them. A blank cell with no rows behind it is not clickable and does not call it.<br><small>Type: `({ row, col, value, valueIndex, text, count, rows }) => void`</small> |
| `drillDown` | The panel with the rows behind a clicked value.<br><small>Type: `boolean`; default: `true`</small> |
| `drillDownLimit` | Rows passed to the panel and to `onCellClick`; the panel's exports (Copy, Copy as JSON, Download CSV and Excel) hold these rows and say when there are more ("1,000 of 4,212 rows").<br><small>Type: `number`; default: `1000`</small> |
| `locale` | Numbers, dates and sorting (a view's own `formatting.locale` wins), and the language of the labels: `de-*` picks German.<br><small>Type: `string`; default: `"en-US"`</small> |
| `timeZone` | The zone `data` is encoded in; see pivotkit-core.<br><small>Type: `string`; default: `"UTC"`</small> |
| `labels` | Texts merged over the language's labels, see [Localisation](localisation.md).<br><small>Type: partial labels</small> |
| `theme` | `auto` follows the nearest `data-theme="light"` or `data-theme="dark"` above the report (`<html>`, or a shadow root's host), then `prefers-color-scheme`, and changes with them.<br><small>Type: `"auto"` or `"light"` or `"dark"`; default: `"auto"`</small> |
| `height` | The report's height: a number of pixels or a CSS length (`"100%"`, `"calc(100svh - 24px)"`); the table and the field list scroll inside it. With a height the report stays inside it; without one it grows past its default 640 px when it needs more, so the page scrolls (see [Layout](#layout)).<br><small>Type: `number` or `string`; default: `640`</small> |
| `grow` | Whether the report grows past its height to keep the result's least height: `"on"` by default without `height`, `"off"` with one (the report stays in its box, the result scrolls). See [Layout](#layout).<br><small>Type: `"on"` or `"off"`</small> |
| `fieldList` | The field list of a wide or medium report: `"open"` or `"collapsed"` to a rail of about 40 px (`--pk-rail-w`). Without it the user's choice (« and the rail, remembered with the tips under `storageKey`) decides; with it the user can still open or collapse it until the page is loaded again, without storing it. A narrow report has its drawer either way.<br><small>Type: `"open"` or `"collapsed"`</small> |
| `limits` | pivotkit-core's [limits](../concepts/limits.md#limits). Data over `limits.rows`, or a layout over `limits.work`, `groups`, `pivotCells` or `cells`, shows a message in place of the result that says what to change; a field beyond `limits.axisFields` or `limits.values` is refused with a note, and a saved view with more loads the fields that fit and says so above the result.<br><small>Type: `Partial<Limits>`</small> |
| `label` | The name of the report's region landmark ("Pivot report"). Several reports on one page need one name each (`label="Tickets per team"`), so a screen reader can tell them apart.<br><small>Type: `string`; default: `labels.report`</small> |
| `className` | Added to the root element `.pk-root`.<br><small>Type: `string`</small> |
| `fileName` | Name of exported files, without the extension; path separators and characters a file system refuses are replaced.<br><small>Type: `string`; default: `"pivot"`</small> |
| `onExport` | Every exported file (`"xlsx"`, `"csv"`, `"png"`, or `"json"` for the [view file](view-file.md) of "Download view" in Views, named `<name>.pivotkit.json`; the name with its extension, the file) before it is downloaded, and every copy before it goes on the clipboard (`"copy-table"`, `"copy-json"` from Export; `"drill-copy"`, `"drill-json"`, `"drill-csv"`, `"drill-xlsx"` from the drill-down panel; a copy has its `text` and the `fileName` it would have as a file, a drill-down export `rows: { shown, count }`); returning `false` skips the download or the copy, so the host can keep the file or the text (upload it, say).<br><small>Type: `({ kind, fileName, blob, text, rows }) => unknown`</small> |
| `tips` | The [tips](#tips) above the result: `"on"`, `"off"` (none, and no switch in Options), or the ids of the tips allowed, as an array or a comma-separated text.<br><small>Type: `"on"` or `"off"` or `string` or `string[]`; default: `"on"`</small> |
| `storageKey` | Remembers the dismissed tips, the help switches and the menu sections the user opened or folded in the browser's `localStorage` under `pivotkit:tips:<storageKey>`. Give each report on a page its own key. Without it the tips stay dismissed until the page is loaded again. Read after the first render, so server rendering and hydration match. With `templateStore="browser"` the user's own views are kept under `pivotkit:views:<key>` too.<br><small>Type: `string`</small> |
| `dismissedTips` | Dismissed tip ids from the host's own storage; `"*"` means the user switched all tips off, `"-explanations"` that the user switched off "Show explanations" (Options, Help); `"open:<section>"` and `"closed:<section>"` a menu section the user opened or folded against its default. A new list (by value) replaces the report's.<br><small>Type: `string[]`</small> |
| `onTipDismiss` | Every change of the dismissed tips: a dismissal (`id` the tip), "Show tips" off (`id` `"*"`), "Show explanations" off (`"-explanations"`), a switch on, a section opened or folded, or "Show dismissed tips again" (`id` `null`; the switches and the sections stay), with the whole list to store and pass back as `dismissedTips`.<br><small>Type: `({ id, dismissed }) => void`</small> |
| `fieldInfo` | The "i" of the field descriptions (field list, chips; the tooltip of the table headers): `"on"` or `"off"` decides it, whatever the user's switch says. Without it the user's "Show explanations" in Options, Help decides (on by default, remembered like the tips; one switch for the "i" of the settings, the zones and the fields). Screen readers keep the descriptions (`aria-describedby`).<br><small>Type: `"on"` or `"off"`</small> |
| `zoneInfo` | The "i" next to each zone's title that says what the zone does, with an example: as `fieldInfo`.<br><small>Type: `"on"` or `"off"`</small> |
| `settingInfo` | The "i" next to the settings that need explaining (the totals, Show as, Along, the export formats, the chart's Labels and Group labels): as `fieldInfo`. Options shows "Show explanations" while one of the three is left to the user. A disabled entry's reason stays either way.<br><small>Type: `"on"` or `"off"`</small> |
| `source` | The data the report shows: its `id` and `name` go into the [view files](view-file.md) and links it shares, and a view made for another `id` asks before it is loaded. See [Sharing](../concepts/sharing.md#the-source-of-a-view-for-developers).<br><small>Type: `{ id, name? }`</small> |
| `schemaUrl` | The `$schema` of the [view files](view-file.md) the report writes: by default `https://pivotkit.eize.dev/schema/view-file-1.json`, a host's own copy of the schema (it ships as `pivotkit-core/schema/view-file-1.json`), or `null` / `""` to leave it out. Loading a view never depends on it.<br><small>Type: `string` or `null`</small> |
| `sources` | The other data the host can show: a view made for one of them offers "Switch to “name” and load" (with `onSourceSwitch`).<br><small>Type: `{ id, name? }[]`</small> |
| `onSourceSwitch` | The user chose to switch to the data a loaded view was made for: show that data and `view` (as the file has it, not normalized) as its start view. Switching starts the report on that data anew: Undo begins there. The view is untrusted input like any loaded view (it comes from a file or a link): hand it only to a report as its start view, which normalizes it, never run or render anything from it.<br><small>Type: `({ source, view, name }) => void`</small> |
| `chartOptions` | Plain JSON merged over the ECharts option the report builds (objects key by key, a list entry by entry, an object given for a list into every entry); it wins over the view's chart settings. Functions, values that are not plain JSON, and the ECharts options that are markup or addresses (a string `formatter`, `rich`, `link`, `image`, the tooltip's element) are left out with a console warning when the chart is drawn. Compared by value. See [Charts](../concepts/charts.md#chartoptions-for-developers).<br><small>Type: `object`</small> |
| `shareLink` | "Copy link" in the Views menu, and opening a shared link: `true` links to the page's own address without its query string (origin, path, fragment), a string is the base URL as it is. The view is in the URL fragment, `#pivot=` or `#pivot-<storageKey>=`, read after the first render and when only the fragment changes. See [Sharing](../concepts/sharing.md).<br><small>Type: `boolean` or `string`; default: off</small> |
| `persistView` | `"session"`: the view is kept in `sessionStorage` (`pivotkit:view:<storageKey>`) for this tab and shown again after a reload; read after the first render; a link wins. Reset goes to the start view, which the tab then keeps.<br><small>Type: `"session"`</small> |
| `loading` | The host is loading the data: before the report has had data it shows its skeleton (toolbar, zones and table rows in the theme, `role="status"` with "Loading the report…", announced once); later it covers only the result, and the view and its history stay. A data set of more than 10,000 rows shows the skeleton by itself while it is encoded the first time.<br><small>Type: `boolean`; default: `false`</small> |

Exports: `PivotReport` and the types `PivotReportProps`, `CellClick`,
`ExportFile`, `Template`, `TemplateScope`, `FieldDefaults`, `TipDismiss`, `ViewSource`, `SourceSwitch`, `View`, `ViewInput` (a view as a host passes it), `UiLabels` and
`PartialLabels`. The stylesheet is `pivotkit-react/styles.css`. `pivotkit-react/labels` exports
`LABELS` (`{ en, de }`, every text), a subpath of its own: the menus' texts load with the menus, so
the report's first load stays small.

## Tips

The report shows short notes above the table or the chart, in the flow (never over it), the most
important first. Three are **notices**: they say that the result is cut or empty, so they always show,
have no x, count against no limit and stay with `tips="off"` and "Show tips" off. The others are
**tips**: one at a time, the most important first; the next one waits until it is followed or
dismissed. Each has an x that dismisses it (Tab reaches it; the focus then goes to the next tip).
Options, Help has "Show tips", "Show explanations", "Show dismissed tips again" and the keyboard
shortcuts. A screen reader hears new notes through a
polite live region. In the order they are shown, and when:

| Id | Kind | Shown when | Button |
| --- | --- | --- | --- |
| `filterEmpty` | notice | The filters leave no row of the data. | Remove filter |
| `top` | notice | A field on Rows or Columns shows its top or bottom N: totals and percentages cover those items only. | |
| `chartCapped` | notice | The chart draws the first 50 of more categories. | |
| `showAs` | tip | A value is shown as a percentage: what 100 % is for that calculation. | |
| `chartOverTime` | tip | A chart type the user chose (not lines, areas or a heatmap) with a date or a grouping of one along the time line on Rows or Columns (where Automatic would draw lines). | Show as lines over time (the automatic type) |
| `pieSlices` | tip | A pie or donut of more than 7 slices. | Switch to Bars |
| `pieColumns` | tip | A pie or donut with a field on Columns: it draws one slice per row and adds up the columns. | Switch to Bars |
| `chartDates` | tip | Lines or areas with the dates on Columns (and none on Rows). | Swap rows and columns |
| `chartTrend` | tip | Lines or areas over categories without an order: the last field on Rows is text or yes/no without a custom order (not dates, numbers or number ranges), and the dates are not on Columns. | Switch to Bars |
| `chartSeries` | tip | Bars, lines or areas with more than 8 series (not automatic lines over time, which a swap would draw the same). | Swap rows and columns |
| `textValue` | tip | A text or yes/no field in Values without a name of its own: it is counted. | |
| `dateUngrouped` | tip | An ungrouped date on Columns with more than 12 columns, or on Rows with more than 60 rows. | Group by (the date's span: month, quarter, year) |
| `manyColumns` | tip | A table with more than 20 columns and fewer rows than columns. | Swap rows and columns |
| `afterDrag` | tip | After the first drag, for three more changes: Undo and the menus. | |
| `values` | tip | Rows or Columns without a value. | |
| `saveTemplate` | tip | After five changes of the view, when `onSaveTemplate` or `templateStore` is set; after a save, five changes later again. | Save view (opens Views) |
| `menus` | tip | The empty report, before the first drag. | |
| `cells` | tip | A table with values, until a value was opened once. | |

The texts are `labels.tips` and `labels.tipActions` ([Localisation](localisation.md)). The ids in
`tips`, `dismissedTips` and `onTipDismiss` are those of the tips; notices are not switched off.

The stored dismissals (`storageKey`) are read after the first render, also when the report is
rendered on a server and hydrated: the server and the first client render show the same tips, and a
tip dismissed earlier goes right after hydration.

## Controlled and uncontrolled

- **Uncontrolled**: pass `defaultView` (or nothing). The report keeps the view itself and reports
  every change through `onViewChange`.
- **Controlled**: pass `view` and set it from `onViewChange`. The undo history stays in the report
  however often the host renders; a view the host changes on its own becomes one undo step.

A host may render the report on every change of its own state: `labels` and `limits` are compared by
value, `data` by identity or by `dataKey`.

## Files the package loads

`dist/index.js` imports `dist/echarts.js` (on the first chart) and `dist/menus.js` (the menus' panels,
right after the first render) by relative dynamic import, with the code they share in `dist/chunks/`.
A bundler follows these imports with no setting. A host that copies files by hand (an import map, a
folder of assets) deploys the whole `dist/` folder: without `dist/menus.js` and `dist/chunks/` the
report works, but its menus say "This menu could not be loaded." with **Try again**.

## Layout

The report adapts to its own width, not the window's: wide (1024 px and more) has the field list on
the left and the zones in a 2 x 2 grid; medium narrows the field list; narrow (below 640 px) opens the
field list as a drawer from the toolbar and shows menus as bottom sheets (at the bottom of the
window, at most 82 % of its height, scrolling inside). Toolbar buttons move into "More" by a fixed
priority (`OVERFLOW_ORDER`: Reset, Layout, Views, Options, the chart type) and the toolbar's width
measured against the room each button takes with the longest of its texts in English, German and the
report's own labels, measured in the font the toolbar is drawn in (`toolbarRoom` in `overflow.js`),
so English and German show the same buttons in every browser. Decided before the first paint. The zones stack, one line
each, whenever the area next to the field list is narrower than 640 px (a container query on that
area: the narrow layout, and a medium one such as a half-width card of 650 px). "Swap rows and
columns" shows its icon only, with its name for screen readers and as a tooltip, when the head of the
Columns zone is too narrow for the text. Only the table scrolls sideways. The row label columns share
at most 40 % of the main area (each at least 5.5em, so a common word such as "Central" never breaks;
a longer one breaks at a hyphen of its own, a word longer than the column as a last resort; a narrow report has less room
around each cell) and a value's name wraps beyond 30 %, so a long label wraps between words and a
phone still shows values next to two levels of row labels; from 300 rows on, where
rows have one height (too low for two lines), a row label is cut with an ellipsis: its full text is
the cell's title, and the status line under the table shows the whole row label ("Row: Linux /
24.04") of a tapped label or of the value the focus is on.

Below 600 px of height (`COMPACT_HEIGHT` in `PivotReport.jsx`), or 820 px in the narrow layout
(`COMPACT_HEIGHT_NARROW`, where the zones stack), measured on the border box before the first paint,
the report starts in the compact layout: the zones fold into one line that says what is in them
("Rows: Team · Columns: Priority · Values: Count of Ticket"), so the table keeps its room, and at most
one tip shows. A click on that line, or Layout in the toolbar, opens them; Layout folds them again.
Layout keeps its text and shows its state with `aria-pressed` (pressed: the zones are open); whether
it stands in the toolbar or in "More" (as an entry with a check) depends on the width only, never on
its own state. The line only shows what is placed: to change a chip, open the zones first. A drag
from the field list or the table opens them while it lasts, so a field can still be dropped. When the
report gets lower while a menu or popover is open, the fold waits until it closes; a focus in the
zones moves to the folded line. The user's choice is state of the mounted report: it survives the
host's renders, and it is not part of the view, so a saved view does not carry it.

The result keeps a least height: 240 px, 280 px in the narrow layout. What happens when the box is
lower than the toolbar, the zones (or their line), the tips, the notes, the result's least height and
the status line need depends on whether the host gives a height:

- **Without `height`** (the report's 640 px default) the report grows past its 640 px (an inline
  `min-height` on its root, measured after every render and when its size changes) and the page
  scrolls, instead of squeezing the table into a sliver.
- **With `height`** (a number, `"100%"`, any CSS length) the report stays inside that height: it folds
  its zones (above), and the table scrolls inside the result, however small it gets. Nothing is cut
  off: a card of a fixed size, such as a PowerShell Universal card, keeps the whole report.
- `grow` decides it either way: `"on"` lets a report with a height grow too, `"off"` keeps a report
  without one inside its 640 px. The element's attribute is `grow`.

`height` takes a number of pixels or any CSS length: `"100%"` of a parent with a height,
`"calc(100svh - 24px)"` for a page that holds one report (the page scrolls to the report, the table
scrolls inside it). In the narrow layout the zones sit above the table, so a report of a fixed 640 px
leaves little room for it on a phone: give it more height there.

**Enlarge** and **Full screen** stand at the top right of the result. Enlarge (its name says what a click does: Enlarge or Reduce, no `aria-pressed`) lets
the result fill the report: the field list, the zones, the tips and the notes above the result are
hidden, the toolbar stays, and one line names the fields; Escape inside the report or the button
restores it. An open menu, the field drawer, a filter or the drill-down closes first on Escape; an
Escape elsewhere on the page (a host's own dialog) is not the report's. Full screen calls the Fullscreen API on the report's root
(in pivotkit-element the root inside the shadow root; the report reads its state from its own root's
`fullscreenElement`); Escape leaves it: the browser keeps that key for itself in full screen, so it
leaves full screen before an open menu would close (close a menu with a click outside it there). It is shown only where `document.fullscreenEnabled` and
`requestFullscreen` exist, read after the first render (not, for example, in Safari on an iPhone).
Neither is part of the view.

## Menus

A menu keeps the mouse wheel to itself: a wheel turn that nothing inside it can scroll further is
stopped, so the table or the page behind never scrolls (`overscroll-behavior: contain` does the same
for touch). A menu is at most as high as the window, and scrolls inside. Its sections fold with their
title (a button with `aria-expanded`); their default and the user's choice:

| Menu | Open | Folded |
| --- | --- | --- |
| A value | Summarize by, Show as | Number format, Highlight, Name, Filters, Move |
| A field on Rows or Columns | Sort, Group dates by, Group numbers into ranges, Show only the top items, Filters | Move |
| Options, Views, Chart type | every section | |

What the user opens or folds is kept with the tips (`storageKey`, `dismissedTips`). Rarely used
entries sit behind a link inside their section: "More statistics", "More calculations", "More
formats" (whole number, compact, bytes, durations).

An "i" next to a setting explains it on hover, focus or tap: the totals, Show as, Along, Excel and CSV
in the export menu, Labels and Group labels of the chart. It is the same button as a field's "i"; its
name is "About <setting>". A menu row stays one line. Options, Help, "Show explanations" (or
`settingInfo`) hides them all. An entry that would change nothing is disabled, and a short line under
it says why, only while it is disabled: the grand total row needs a field in Rows, the grand total
column one in Columns, row subtotals two or more fields in Rows, column subtotals two or more in
Columns; Expand all and Collapse all; the chart image "Switch to Chart first."; a pie's Labels while
value labels are off. The export menu is a dialog, so Tab reaches each format's "i".

## Escape and the host page

While a popover, the drill-down or the narrow field drawer of the report is open, the report listens
for Escape on the whole `document` and closes its newest layer only, also when the focus is outside
the report (on the host page, say). It calls `preventDefault()` on that Escape, and it leaves an
Escape alone that is `defaultPrevented` already. A host that opens a dialog of its own while a report
layer is open: handle Escape in the dialog's own `keydown` listener (it runs before the document's)
and call `preventDefault()`, or close the report's layer first. The keys of the report itself are in
[Using the report](../guide.md#keyboard-and-screen-readers).

## Performance

The pivot is computed once per view and the table body is virtualized. Approximate numbers, measured
by hand in the playground on one Mac (Chromium, Firefox and WebKit from Playwright 1.64.1 on
darwin/arm64); no test backs them and other machines differ, in ms:

| Rows | `encode` (once) | `computePivot` | `toGrid` | Change to next frame |
| ---: | ---: | ---: | ---: | ---: |
| 2,000 | 4-7 | 1-4 | 0-3 | 11-34 |
| 4,000 | 6-8 | 2-3 | 0-2 | 10-37 |
| 100,000 | 93-117 | 8-31 | 0-18 | 18-64 |
| 100,000, 100,000 distinct row labels | 114 | 72 | 29 | 112 |

A change stays within a frame or two, so the engine runs on the main thread; a Web Worker would add
copying the columns and the grid between threads for no visible gain. The timings are in the
browser's performance timeline as `pivotkit:encode`, `pivotkit:computePivot` and `pivotkit:toGrid`.

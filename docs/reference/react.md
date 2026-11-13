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

| Prop | Type | Default | What |
| --- | --- | --- | --- |
| `data` | `object[]` or `{ columns, types, data }` |  | The rows, or columnar data (one array per column, as pivotkit-core's [`encode`](core.md#columnar-input) takes it); encoded once per array or object, or once per `dataKey`. |
| `dataKey` | `string` or `number` |  | The identity of `data`: a host that builds a new array on every render passes a key, and the rows are encoded again only when it changes. |
| `encoded` | `Encoded` |  | Data already encoded with pivotkit-core's `encode()`, instead of `data`. |
| `view` | view |  | Controlled: the view to show. Pass back what `onViewChange` gives; the undo history stays in the report however often the host renders. A view the host changes on its own becomes one undo step. |
| `defaultView` | view | empty | Uncontrolled: the start view. |
| `onViewChange` | `(view) => void` |  | Every change, as a normalized view. |
| `templates` | `{ name?, view?, file?, scope?, deletable? }[]` | `[]` | The templates of the Views menu, in two groups by `scope`: "Shared views" (`"shared"`) and "My views" (`"user"`); without `scope` a `deletable` entry is the user's own, every other one shared. [More](#prop-templates) |
| `onSaveTemplate` | `(name, view, { scope }) => unknown` |  | Save as and Save of the user's own views; gets the name (an existing one to replace), the view and `{ scope: "user" }`. [More](#prop-onsavetemplate) |
| `onDeleteTemplate` | `(name, { scope }) => unknown` |  | Deletes a template marked `deletable`, after the user confirmed in the menu; `scope` is the entry's group. [More](#prop-ondeletetemplate) |
| `onPublishTemplate` | `(name, view) => unknown` |  | With `canPublish`: "Publish as shared view" on the user's views and Save on a shared view, asked in place. [More](#prop-onpublishtemplate) |
| `canPublish` | `boolean` | `false` | The user may publish views for everyone (an admin, as the host decides). [More](#prop-canpublish) |
| `templateStore` | `"browser"` | off | `"browser"`: the report keeps the user's own views (My views) in `localStorage` under `pivotkit:views:<storageKey>` (`pivotkit:views` without one), as view files that name their data (`source`). [More](#prop-templatestore) |
| `fieldDefaults` | `{ [field]: { agg?, format?, drillFormat?, order?, label?, description?, href?, type? } }` |  | The aggregator and the format a field gets when it is added to Values (an average for a duration, say). [More](#prop-fielddefaults) |
| `onCellClick` | `({ row, col, value, valueIndex, text, count, rows }) => void` |  | A click (or Enter) on a value or a chart point: key paths of its row and column, the value, the number of source rows and the first `drillDownLimit` of them. [More](#prop-oncellclick) |
| `drillDown` | `boolean` | `true` | The panel with the rows behind a clicked value. |
| `drillDownLimit` | `number` | `1000` | Rows passed to the panel and to `onCellClick`; the panel's exports (Copy, Copy as JSON, Download CSV and Excel) hold these rows and say when there are more ("1,000 of 4,212 rows"). |
| `locale` | `string` | `"en-US"` | Numbers, dates and sorting (a view's own `formatting.locale` wins), and the language of the labels: `de-*` picks German. |
| `timeZone` | `string` | `"UTC"` | The zone `data` is encoded in; see pivotkit-core. |
| `labels` | partial labels |  | Texts merged over the language's labels, see [Localisation](localisation.md). |
| `theme` | `"auto"` or `"light"` or `"dark"` | `"auto"` | `auto` follows the nearest `data-theme="light"` or `data-theme="dark"` above the report (`<html>`, or a shadow root's host), then `prefers-color-scheme`, and changes with them. |
| `height` | `number` or `string` | `640` | The report's height: a number of pixels or a CSS length (`"100%"`, `"calc(100svh - 24px)"`); the table and the field list scroll inside it. [More](#prop-height) |
| `grow` | `"on"` or `"off"` |  | Whether the report grows past its height to keep the result's least height: `"on"` by default without `height`, `"off"` with one (the report stays in its box, the result scrolls). See [Layout](#layout). |
| `fieldList` | `"open"` or `"collapsed"` |  | The field list of a wide or medium report: `"open"` or `"collapsed"` to a rail of about 40 px (`--pk-rail-w`). [More](#prop-fieldlist) |
| `limits` | `Partial<Limits>` |  | pivotkit-core's [limits](../concepts/limits.md#limits) for the host's data. [More](#prop-limits) |
| `label` | `string` | `labels.report` | The name of the report's region landmark ("Pivot report"). Several reports on one page need one name each (`label="Tickets per team"`), so a screen reader can tell them apart. |
| `className` | `string` |  | Added to the root element `.pk-root`. |
| `fileName` | `string` | `"pivot"` | Name of exported files, without the extension; path separators and characters a file system refuses are replaced. |
| `onExport` | `({ kind, fileName, blob, text, rows }) => unknown` |  | Every exported file before it is downloaded, and every copy before it goes on the clipboard; returning `false` skips it. [More](#prop-onexport) |
| `tips` | `"on"` or `"off"` or `string` or `string[]` | `"on"` | The [tips](#tips) above the result: `"on"`, `"off"` (none, and no switch in Options), or the ids of the tips allowed, as an array or a comma-separated text. |
| `storageKey` | `string` |  | Remembers the dismissed tips and the help switches in the browser's `localStorage` under `pivotkit:tips:<storageKey>`. [More](#prop-storagekey) |
| `dismissedTips` | `string[]` |  | Dismissed tip ids from the host's own storage. [More](#prop-dismissedtips) |
| `onTipDismiss` | `({ id, dismissed }) => void` |  | Every change of the dismissed tips, with the whole list to store and pass back as `dismissedTips`. [More](#prop-ontipdismiss) |
| `fieldInfo` | `"on"` or `"off"` |  | The "i" of the field descriptions (field list, chips; the tooltip of the table headers): `"on"` or `"off"` decides it, whatever the user's switch says. [More](#prop-fieldinfo) |
| `zoneInfo` | `"on"` or `"off"` |  | The "i" next to each zone's title that says what the zone does, with an example: as `fieldInfo`. |
| `settingInfo` | `"on"` or `"off"` |  | The "i" next to the settings that need explaining (the totals, Show as, Along, the export formats, the chart's Labels and Group labels): as `fieldInfo`. [More](#prop-settinginfo) |
| `source` | `{ id, name? }` |  | The data the report shows: its `id` and `name` go into the [view files](view-file.md) and links it shares, and a view made for another `id` asks before it is loaded. [More](#prop-source) |
| `schemaUrl` | `string` or `null` |  | The `$schema` of the [view files](view-file.md) the report writes: by default `https://pivotkit.eize.dev/schema/view-file-2.json`, a host's own copy of the schema (it ships as `pivotkit-core/schema/view-file-2.json`), or `null` / `""` to leave it out. [More](#prop-schemaurl) |
| `sources` | `{ id, name? }[]` |  | The other data the host can show: a view made for one of them offers "Switch to “name” and load" (with `onSourceSwitch`). |
| `onSourceSwitch` | `({ source, view, name }) => void` |  | The user chose to switch to the data a loaded view was made for: show that data and `view` (as the file has it, not normalized) as its start view. [More](#prop-onsourceswitch) |
| `chartOptions` | `object` |  | Plain JSON merged over the ECharts option the report builds (objects key by key, a list entry by entry, an object given for a list into every entry); it wins over the view's chart settings. [More](#prop-chartoptions) |
| `shareLink` | `boolean` or `string` | off | "Copy link" in the Views menu, and opening a shared link: `true` links to the page's own address without its query string (origin, path, fragment), a string is the base URL as it is. [More](#prop-sharelink) |
| `persistView` | `"session"` |  | `"session"`: the view is kept in `sessionStorage` (`pivotkit:view:<storageKey>`) for this tab and shown again after a reload; read after the first render; a link wins. [More](#prop-persistview) |
| `loading` | `boolean` | `false` | The host is loading the data: before the report has had data it shows its skeleton (toolbar, zones and table rows in the theme, `role="status"` with "Loading the report…", announced once). [More](#prop-loading) |
| `allowImport` | `boolean` | `false` | People may load a file into the report in the browser: a **Data** button, a file dropped onto the report, a preview before it replaces the data; nothing is uploaded. [More](#prop-allowimport) |
| `importLimits` | `Partial<Limits>` | `limits` | The limits of a file people load, merged key by key over `limits`. [More](#prop-importlimits) |
| `plugins` | `ReaderPlugin[]` |  | Reader plugins for more formats ([pivotkit-xlsx](plugins.md#pivotkit-xlsx) for Excel); CSV, TSV, text and JSON are built in. [More](#prop-plugins) |
| `onDataLoad` | `({ cause, source, file, sheet, rows, columns, notes }) => unknown` |  | The data shown changed: a file loaded (returning `false` refuses it), the host's data shown again, one of those undone or redone, or the file shown again after a new mount. [More](#prop-ondataload) |
| `importWorker` | `() => Worker` |  | Starts a module worker that runs `pivotkit-react/import-worker`, so CSV and JSON files are read off the page. [More](#prop-importworker) |

Exports: `PivotReport` and the types `PivotReportProps`, `CellClick`,
`ExportFile`, `Template`, `TemplateScope`, `FieldDefaults`, `TipDismiss`, `ViewSource`, `SourceSwitch`, `DataLoad`, `View`, `ViewInput` (a view as a host passes it), `UiLabels` and
`PartialLabels`. The stylesheet is `pivotkit-react/styles.css`. `pivotkit-react/labels` exports
`LABELS` (`{ en, de }`, every text), a subpath of its own: the menus' texts load with the menus, so
the report's first load stays small.

## Props in detail

The props whose line in the table ends in "More", in full.

### `templates` { #prop-templates }

Type: `{ name?, view?, file?, scope?, deletable? }[]`; default: `[]`.

The templates of the Views menu, in two groups by `scope`: "Shared views" (`"shared"`) and "My views" (`"user"`); without `scope` a `deletable` entry is the user's own, every other one shared. An entry has a `view`, or a [view file](view-file.md) in `file` (its object or its text; the entry's `name` defaults to the file's). The first three are also offered in the empty state. `deletable: true` shows a delete button for that entry; a shared entry without it has an "i" ("Only admins can change shared views.", `labels.settingInfo.sharedView`). An entry without a name or usable view is left out. Names need not be unique: every entry is shown in order (a saved view may have a preset's name), and `onDeleteTemplate` gets the name. See [Templates and shared views](../concepts/templates.md).

### `onSaveTemplate` { #prop-onsavetemplate }

Type: `(name, view, { scope }) => unknown`.

Shows "Save current view" (Save as… once a view is loaded) under This view in the Views menu, and Save “…” for a user's view of `templates` that was loaded. Gets the name, the view as shown (normalized against the data, with the custom orders of `fieldDefaults`) and `{ scope: "user" }`.

Replace by name (an upsert): Save sends the loaded view's own name, and Save as a name of one of the user's views once the user confirmed "“…” exists. Replace it?". Replace that view, do not add a second one. Then pass the new `templates`; until then the menu keeps the old entry, and the view shown carries the name. When the answer comes after the user changed the view (a slow server), the dot for unsaved changes stays; after New or another view was loaded the name goes to no view.

"View “…” saved" is shown when it returns or the promise it returns resolves; an error when it throws or rejects: with the host's message when it gives one (an `Error`, a text), else "The server could not save the view." (`labels.toastSaveRejected`). It wins over `templateStore`.

### `onDeleteTemplate` { #prop-ondeletetemplate }

Type: `(name, { scope }) => unknown`.

Deletes a template marked `deletable`, after the user confirmed in the menu; `scope` is the entry's group. The entry goes when it returns or its promise resolves; a failure is shown as for `onSaveTemplate` (`labels.toastDeleteRejected` without a message). The browser store's own entries are deleted there, without it.

### `onPublishTemplate` { #prop-onpublishtemplate }

Type: `(name, view) => unknown`.

With `canPublish`: "Publish as shared view" (an arrow) next to each of the user's views, asked in place ("Publish “…” as a shared view? Everyone who uses this report sees it."), and Save “…” on a shared view that was loaded, asked in place ("Replace the shared view “…” for everyone?"). Both send the view in the same form: normalized against the data, with the custom orders of `fieldDefaults`. The host adds the view to its shared views, or replaces the shared view of that name (an upsert by name: Save sends the shared view's own name), and passes the new `templates`; "View “…” published" when it returns or its promise resolves, a failure as for `onSaveTemplate` (`labels.toastPublishRejected`).

### `canPublish` { #prop-canpublish }

Type: `boolean`; default: `false`.

The user may publish views for everyone (an admin, as the host decides). The report only shows what the host allows: the server must check who may save, publish or delete. Without it, or without `onPublishTemplate`, nothing is offered.

### `templateStore` { #prop-templatestore }

Type: `"browser"`; default: off.

`"browser"`: the report keeps the user's own views (My views) in `localStorage` under `pivotkit:views:<storageKey>` (`pivotkit:views` without one), as view files that name their data (`source`); a report lists the views of its data and those made for no named data. Only this browser and device, lost when the site's data is cleared, shared with nobody; the menu says so. At most 100 views and 500,000 characters; a save of a name the store has for the same data replaces it. Read after the first render (no hydration mismatch). With `onSaveTemplate` saves go to the host; stored views are still listed and can be deleted. See [Templates and shared views](../concepts/templates.md#the-browser-keeps-my-views-templatestorebrowser).

### `fieldDefaults` { #prop-fielddefaults }

Type: `{ [field]: { agg?, format?, drillFormat?, order?, label?, description?, href?, type? } }`.

The aggregator and the format a field gets when it is added to Values (an average for a duration, say). An aggregator that does not fit the field's type is ignored. Another aggregator picked in the value's menu keeps `format` while the result is in the field's unit (an average to a median), not for a count; a format the user chose stays the same way. In the drill-down, `drillFormat` (else `format`) formats the field's own values: `"text"` shows a numeric identifier as it is (40072, not 40,072), `"date"` a date without its time. `order` is the field's own order of items (`["Spring", "Summer", "Autumn", "Winter"]`): the field is sorted in it when it is placed on Rows or Columns (a `custom` sort in the view, so a template keeps it), and so is a field on Rows or Columns of a view or template without a sort entry for it; its menu offers "Custom order" and "Custom order, reversed", and "A to Z" stays a sort entry of its own; items not listed follow by label. `label` is the name the report shows for the field (chips, headers, value names such as "Sum of Net revenue", the drill-down, the chart and the exported files); views and templates keep the field's own name. `description` (plain text, at most 1,000 characters) shows behind an "i" next to the field and on its chips, behind the "i" at the top of its chip menu and on its table headers; `href`, an https link, adds "Learn more". A field without them looks as it does without `fieldDefaults`. `type` reads the field's column as `"number"`, `"date"`, `"string"` or `"boolean"` (pivotkit-core's `encode` `types`). pivotkit-core's `fieldDefaultsFromSchema` builds all of it from a JSON Schema or an OpenAPI document: [Field descriptions and names](../concepts/fields.md).

A field `fieldDefaults` says nothing about how to count or show (no `agg`, `format` or `drillFormat`) is an identifier when it is a number field of whole numbers whose name ends in the word ID, Nr, No, Number, Key or `#`, in any case (`ID`, `CustomerId`, `customer_id`, `Order No`, `Serial #`, `userID2`, `ID (Asset)`; not `Paid`, `UUID` or `Number of items`; the exact rule: [identifier fields](../concepts/fields.md#identifier-fields)): it gets `agg: "count"` and `drillFormat: "text"`, so it is counted when it is added to Values (from the field list, by a drag or Move to) and its numbers show as they are in the drill-down. Any of the three entries overrides it: `{ ID: { agg: "sum" } }`, `{ ID: { drillFormat: "number" } }`. [Identifier fields](../concepts/fields.md#identifier-fields).

### `onCellClick` { #prop-oncellclick }

Type: `({ row, col, value, valueIndex, text, count, rows }) => void`.

A click (or Enter) on a value or a chart point: key paths of its row and column, the value, the number of source rows and the first `drillDownLimit` of them. A blank cell with no rows behind it is not clickable and does not call it.

### `height` { #prop-height }

Type: `number` or `string`; default: `640`.

The report's height: a number of pixels or a CSS length (`"100%"`, `"calc(100svh - 24px)"`); the table and the field list scroll inside it. With a height the report stays inside it; without one it grows past its default 640 px when it needs more, so the page scrolls (see [Layout](#layout)).

### `fieldList` { #prop-fieldlist }

Type: `"open"` or `"collapsed"`.

The field list of a wide or medium report: `"open"` or `"collapsed"` to a rail of about 40 px (`--pk-rail-w`). Without it the user's choice (« and the rail, remembered with the tips under `storageKey`) decides; with it the user can still open or collapse it until the page is loaded again, without storing it. A narrow report has its drawer either way. Another value is ignored with a console warning. The rail shows "Fields" upright and a search button; « and the rail are buttons with `aria-expanded`.

### `limits` { #prop-limits }

Type: `Partial<Limits>`.

pivotkit-core's [limits](../concepts/limits.md#limits). Data over `limits.rows`, or a layout over `limits.work`, `groups`, `pivotCells` or `cells`, shows a message in place of the result that says what to change; a field beyond `limits.axisFields` or `limits.values` is refused with a note, and a saved view with more loads the fields that fit and says so above the result. A file people load
([`allowImport`](#prop-allowimport)) has [`importLimits`](#prop-importlimits) over these.

### `onExport` { #prop-onexport }

Type: `({ kind, fileName, blob, text, rows }) => unknown`.

Every exported file (`"xlsx"`, `"csv"`, `"html"`, `"png"`, `"svg"`, or `"json"` for the [view file](view-file.md) of "Download view" in Views, named `<name>.pivotkit.json`; the name with its extension, the file) before it is downloaded, and every copy before it goes on the clipboard (`"copy-table"`, `"copy-json"` from Export; `"drill-copy"`, `"drill-json"`, `"drill-csv"`, `"drill-xlsx"` from the drill-down panel; a copy has its `text` and the `fileName` it would have as a file, a drill-down export `rows: { shown, count }`); returning `false` skips the download or the copy, so the host can keep the file or the text (upload it, say). `"print"` is the [HTML report](report.md) before the print dialog opens (`pivot.html`): returning `false` prints nothing, so the host can print it its own way (a PDF of its server, say). An empty report (no field placed) has its Export entries greyed out ("Add a field first."): no call for them.

### `storageKey` { #prop-storagekey }

Type: `string`.

Remembers the dismissed tips and the help switches in the browser's `localStorage` under `pivotkit:tips:<storageKey>`. Give each report on a page its own key. Without it the tips stay dismissed until the page is loaded again. Read after the first render, so server rendering and hydration match. With `templateStore="browser"` the user's own views are kept under `pivotkit:views:<key>` too. With [`allowImport`](#prop-allowimport) a loaded file survives a new mount of the report under this key (in memory only).

### `dismissedTips` { #prop-dismissedtips }

Type: `string[]`.

Dismissed tip ids from the host's own storage; `"*"` means the user switched all tips off, `"-explanations"` that the user switched off "Show explanations" (Options, Help). Entries of other shapes (`"open:<section>"` and `"closed:<section>"` of the menu sections that folded before) are dropped. A new list (by value) replaces the report's.

### `onTipDismiss` { #prop-ontipdismiss }

Type: `({ id, dismissed }) => void`.

Every change of the dismissed tips: a dismissal (`id` the tip), "Show tips" off (`id` `"*"`), "Show explanations" off (`"-explanations"`), a switch on, or "Show dismissed tips again" (`id` `null`; the switches stay), with the whole list to store and pass back as `dismissedTips`.

### `fieldInfo` { #prop-fieldinfo }

Type: `"on"` or `"off"`.

The "i" of the field descriptions (field list, chips; the tooltip of the table headers): `"on"` or `"off"` decides it, whatever the user's switch says. Without it the user's "Show explanations" in Options, Help decides (on by default, remembered like the tips; one switch for the "i" of the settings, the zones and the fields). Screen readers keep the descriptions (`aria-describedby`).

### `settingInfo` { #prop-settinginfo }

Type: `"on"` or `"off"`.

The "i" next to the settings that need explaining (the totals, Show as, Along, the export formats, the chart's Labels and Group labels): as `fieldInfo`. Options shows "Show explanations" while one of the three is left to the user. A disabled entry's reason stays either way.

### `source` { #prop-source }

Type: `{ id, name? }`.

The data the report shows: its `id` and `name` go into the [view files](view-file.md) and links it shares, and a view made for another `id` asks before it is loaded. See [Sharing](../concepts/sharing.md#the-source-of-a-view-for-developers).

### `schemaUrl` { #prop-schemaurl }

Type: `string` or `null`.

The `$schema` of the [view files](view-file.md) the report writes: by default `https://pivotkit.eize.dev/schema/view-file-2.json`, a host's own copy of the schema (it ships as `pivotkit-core/schema/view-file-2.json`), or `null` / `""` to leave it out. Loading a view never depends on it.

### `onSourceSwitch` { #prop-onsourceswitch }

Type: `({ source, view, name }) => void`.

The user chose to switch to the data a loaded view was made for: show that data and `view` (as the file has it, not normalized) as its start view. Switching starts the report on that data anew: Undo begins there. The view is untrusted input like any loaded view (it comes from a file or a link): hand it only to a report as its start view, which normalizes it, never run or render anything from it.

### `chartOptions` { #prop-chartoptions }

Type: `object`.

Plain JSON merged over the ECharts option the report builds (objects key by key, a list entry by entry, an object given for a list into every entry); it wins over the view's chart settings. Functions, values that are not plain JSON, and the ECharts options that are markup or addresses (a string `formatter`, `rich`, `link`, `image`, the tooltip's element) are left out with a console warning when the chart is drawn. Compared by value. See [Charts](../concepts/charts.md#chartoptions-for-developers).

### `shareLink` { #prop-sharelink }

Type: `boolean` or `string`; default: off.

"Copy link" in the Views menu, and opening a shared link: `true` links to the page's own address without its query string (origin, path, fragment), a string is the base URL as it is. The view is in the URL fragment, `#pivot=` or `#pivot-<storageKey>=`, read after the first render and when only the fragment changes. See [Sharing](../concepts/sharing.md).

### `persistView` { #prop-persistview }

Type: `"session"`.

`"session"`: the view is kept in `sessionStorage` (`pivotkit:view:<storageKey>`) for this tab and shown again after a reload; read after the first render; a link wins. Reset goes to the start view, which the tab then keeps.

### `loading` { #prop-loading }

Type: `boolean`; default: `false`.

The host is loading the data: before the report has had data it shows its skeleton (toolbar, zones and table rows in the theme, `role="status"` with "Loading the report…", announced once); later it covers only the result, and the view and its history stay. A data set of more than 10,000 rows shows the skeleton by itself while it is encoded the first time.

### `allowImport` { #prop-allowimport }

Type: `boolean`; default: `false`.

People may load a file of theirs into the report, read in the browser (nothing is uploaded): a
**Data** button in the toolbar (before Views; under More on a narrow report) with the data source and
**Load data…**, a file dropped anywhere onto the report, and a preview before the data is replaced
(the sheet of a workbook, the first rows, a type per column, the readers' notes). What people see is
on [Load your own data](../use/load-data.md); what the readers do on [Loading files](import.md).

- Loading a file is a step of the undo history: Undo goes back to the data before it with the view it
  had, Redo forward again; "Back to original data" shows the host's data with its view. Up to three
  such steps are kept, since each holds a data set.
- While a file's data is shown, the report's [`source`](#prop-source) is the file's: its name and an
  `id` made of the name and a hash of the name and the column names (`tickets.csv#e51bd4bc21e98ee8`;
  the rule: [How a loaded file is named](import.md#how-a-loaded-file-is-named)), so the browser store
  (`templateStore="browser"`) keeps views per file and a view shared from one names it. The host's
  `source` comes back with its data.
- The host's data and props stay as they are: a new `data` from the host while a file is shown is
  used when its data is shown again.
- A host that mounts the report again (a new `key`, a component library that remounts on a theme
  switch: PowerShell Universal on its light/dark switch and `Sync-UDElement`) gets the file back: the
  report with the same [`storageKey`](#prop-storagekey) shows the file's data, its view and its undo
  steps again, and tells `onDataLoad` with `cause` `"restore"` before its view (`onViewChange`), so a
  host that controls the view takes the file's. However quickly the host mounts it again
  (PowerShell Universal's `Sync-UDElement` mounts it twice within about 30 ms), the file comes back
  with its view; a view the host has not passed back yet (one that goes through its server first)
  counts as the report's, so the next mount shows it, not the host's view from before. Only when the host's data is the same: the same
  `dataKey` (without one, the same column names and types) and the same `source.id`; otherwise the
  host's data is shown and the file is let go. It is kept in the page's memory only, never in
  `localStorage` or `sessionStorage`, so a reload still shows the host's data: the latest state per
  `storageKey`, for at most four reports (the one written longest ago goes first), let go as soon as
  the host's data is shown again ("Back to original data", Undo of the load). Without a `storageKey`
  nothing is kept. Two reports mounted at once with the same `storageKey` would share it: give each
  its own. Pass a `dataKey` where another table with the same columns can stand under the same
  `storageKey` (another page of a single-page app, say): without one such a table counts as the same
  data. A report mounted while the host's data is still on its way should get `loading`: mounted on
  data without columns it shows that data and keeps the file for the mount after. The restored report
  starts where it was: a shared link in the address or the tab's stored view (`persistView`) is not
  read again then.
- The import UI is a chunk of its own (`dist/import-ui.js`, with `pivotkit-core/import`), loaded when
  the Data menu opens, a file is dragged over the report or the empty report's **Load data…** is
  clicked. Without `allowImport` nothing of it loads.
- A file is read and shown with [`importLimits`](#prop-importlimits) over the report's
  [`limits`](#prop-limits) (`fileBytes`, `rows`, `columns`, `importCells`, ...); a file over one is
  refused with what to do, and the data stays.
- Memory: while the preview is open the page holds the table as read (values and their text) and,
  after a change of a type, a second one; after **Load data** only the encoded columns stay, for the
  file shown and for each data step Undo keeps. A rough, unverified guide from one measurement in
  Node (not a browser): a CSV of 1,000,000 rows and 5 columns (46 MB) took about 650 MB more memory
  while it was read and loaded. Lower `importLimits.rows` or `importLimits.fileBytes` where people's
  machines are small.

### `importLimits` { #prop-importlimits }

Type: `Partial<Limits>`; default: [`limits`](#prop-limits).

The [limits](../concepts/limits.md#limits) a file loaded with [`allowImport`](#prop-allowimport) is
read and shown with, merged key by key over `limits`: a key it sets is the file's, a key it leaves out
is `limits`'s, and both over pivotkit-core's defaults. The host's own `data` keeps `limits`, so a
host can keep uploads small without capping its own data:

```jsx
<PivotReport data={rows} allowImport importLimits={{ rows: 1_000, fileBytes: 5_000_000 }} />
```

Here the host's 50,000 rows show, while a file of 1,001 rows is refused with "… has more than 1,000
rows (limits.rows) …" and the data shown stays. The import limits hold for everything about the file:
the readers (also in the [`importWorker`](#prop-importworker)), the preview, and the views, results and
exports while its data is shown; "Back to original data" goes back to `limits`. A key of
`importLimits` is not capped by `limits`: a file may get more than the host's data where the host
says so (`importLimits={{ rows: 200_000 }}` over `limits={{ rows: 1_000 }}`), so set only the keys a
file should have differently. Compared by value, as `limits`.

### `plugins` { #prop-plugins }

Type: `ReaderPlugin[]` (contract v1 of `pivotkit-core/import`).

Reader plugins for formats beyond CSV, TSV, text and JSON: `plugins={[xlsxReader]}` with
[pivotkit-xlsx](plugins.md#pivotkit-xlsx) reads Excel workbooks. A plugin is checked when a file is
read (`validatePlugin`); its code loads with the first file of its kind. The file picker offers what
the plugins and the built-in readers accept, the Data menu names them by their `label`. A plugin runs
on the page, never in the import worker (it is code of the page; a worker cannot take it).

### `onDataLoad` { #prop-ondataload }

Type: `({ cause, source, file, sheet, rows, columns, notes }) => unknown`.

The data shown changed, with what it is now:

| Key | What |
| --- | --- |
| `cause` | `"load"`: a file, before it is shown (returning `false` refuses it; the data stays); `"original"`: the host's data again; `"undo"`, `"redo"`: one of those undone or redone; `"restore"`: the report was mounted again and shows the file it had ([`allowImport`](#prop-allowimport)). |
| `source` | `{ id, name }` of the data shown: the file's, or the host's `source` (`null` without one). |
| `file` | `{ name, size, type }` of the file shown, or `null` for the host's data. |
| `sheet` | The sheet of a workbook, else `null`. |
| `rows`, `columns` | The rows, and `[{ name, type }]` per column. |
| `notes` | For `"load"`: the readers' notes `[{ code, params, message }]` ([the codes](import.md#the-table)). |

Only `false` itself refuses a file: a promise is not waited for. A function that throws refuses a
load too, with "<name> was not loaded: <message>"; for the other causes the step has happened, and
the error is thrown again a moment later, outside the report, so the page sees it. Names and notes
come from the file: show them as text, never as HTML.

### `importWorker` { #prop-importworker }

Type: `() => Worker`.

Starts a module worker for the built-in readers, so a large CSV or JSON file is read off the page and
the report stays responsive (a plugin's file is read on the page). The worker is the package's
`pivotkit-react/import-worker` entry (`dist/import-worker.js`), which imports `pivotkit-core/import`;
bundle it the way your bundler bundles workers, as a file of your origin:

```js
const importWorker = () => new Worker(new URL("./import-worker.js", import.meta.url), { type: "module" });
<PivotReport data={rows} allowImport importWorker={importWorker} />
```

One worker per file, ended when it is read or cancelled. A worker that does not say it is ready
within 10 seconds, or answers with something that is no table, ends: the first leaves the read to
the page, the second is reported as an error. A worker that does not start (a
Content-Security-Policy without `worker-src` for it, a browser without module workers, a file that is
not there) leaves the read to the page without a message. Without `importWorker` the file is read on
the page; the readers give the page a turn every 16,384 rows, so progress and **Cancel** still work.
pivotkit-element starts its own worker.

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
| `colSubtotals` | tip | A table with column subtotals on, two or more fields in Columns, a value and an open column group of two or more items (only those get a Total column): a Total column adds up the group before it. The header of each subtotal column has the same text as its tooltip. | Hide column subtotals |
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
  While a delayed host is acknowledging changes, actions keep the pending undo history, including
  when earlier acknowledgements arrive between actions. The view shown still comes from the host.

A host may render the report on every change of its own state: `labels`, `limits` and `importLimits`
are compared by value, `data` by identity or by `dataKey`.

What of the host's view (`view`, else the first `defaultView`) the data cannot use (a field it lacks,
an unknown format) shows above the result as a warning, as for a loaded view
([parts of a view that were not used](../use/behaviour.md#parts-of-a-view-that-were-not-used)): once
per distinct view, so a host that passes the same view on every render keeps it folded or
dismissed; not while `loading`; a view the user loads later replaces it. A controlled host that passes
back what `onViewChange` gave ends it, since that view is normalized.

## Files the package loads

`dist/index.js` imports `dist/echarts.js` (on the first chart), `dist/menus.js` (the menus' panels,
right after the first render), for a German report `dist/menu-texts-de.js` (the menus' German
texts, with the menus, or when the locale changes to German) and, with `allowImport`,
`dist/import-ui.js` (loading data, on its first use, with `pivotkit-core/import`) by relative dynamic
import, with the code they share in `dist/chunks/`. `dist/import-worker.js` is the worker of
[`importWorker`](#prop-importworker), loaded only by a host that starts it.
A bundler follows these imports with no setting. A host that copies files by hand (an import map, a
folder of assets) deploys the whole `dist/` folder: without `dist/menus.js` and `dist/chunks/` the
report works, but its menus say "This menu could not be loaded." with **Try again**. Without
`dist/menu-texts-de.js` (or when it cannot load: offline, a Content-Security-Policy that blocks it)
a German report's menus open in English and work; the next menu that opens tries the German texts
again.

## Layout

The report adapts to its own width, not the window's: wide (1024 px and more) has the field list on
the left and the zones in a 2 x 2 grid; medium narrows the field list; narrow (below 640 px) opens the
field list as a drawer from the toolbar and shows menus as bottom sheets (at the bottom of the
window, at most 82 % of its height, scrolling inside). Toolbar buttons move into "More" by a fixed
priority (`OVERFLOW_ORDER`: Layout, Options, the chart type, then Start over and
Views last), but only those the room left cannot hold (`overflowHidden` in `overflow.js`): the
first ones in the order go until the rest fits, then each of them the room left still holds comes
back. Each button's room is measured with the texts of the report's labels in the font the toolbar is
drawn in (`toolbarRoom`), the chart type's with its longest type, so a pick never moves a button; a
shorter language keeps more buttons. "More" lists them in groups (`MORE_GROUPS`): Start over's
Reset and New as entries of their own, then Layout, the chart type and Options, then Views. Decided before the first paint. The
name of the view loaded takes the room left and is cut with "…", never below 4em. The zones stack, one line
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

Whatever is taller than the result's area scrolls inside it, with or without `height`: the table in
its own box (its header stays at the top, the last row, Grand Total, is reached by scrolling), the
empty report's first steps with their **Start with …** buttons and a message in the area itself.
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

The menus of a chip and Options are menus in levels: the first level is an ARIA menu (`role="menu"`
with `menuitem`, `menuitemradio`, `menuitemcheckbox`, `group` and `separator`; one Tab stop with a
roving `tabindex`, the arrow keys, Home and End, type-ahead), each row with what is set on its right
and ", changed" in its name where it is not the default. Enter or the right arrow opens a topic's
level in the menu's place: a level of choices is a menu again (labelled by its title, "Month ›
Group"), a level with form controls (Filter, Top items, Number ranges, Name, Keyboard shortcuts) a
`group` labelled by its heading. Escape or the left arrow goes back, with the focus on the row the
level came from; Escape on the first level closes the menu and the focus goes back to its button;
Tab closes it and moves on from the button. The popover around them is a non-modal dialog (it holds
the field's name with its "i" and the search, which a menu cannot hold). Every choice applies at
once; a number applies about half a second after the typing stops (or with Enter), a value's name
with Enter or when the field is left, and Escape in a field gives back what applies.

| Menu | First level | Levels |
| --- | --- | --- |
| A field on Rows or Columns | Sort (A to Z, Z to A side by side), sort by its one value, Filter, Top items, Move to, Remove field | Sort by value (two or more values, or a custom order), Filter, Group (dates), Number ranges (numbers), Top items, Move to |
| A field in Filters | Filter, Move to, Remove field | Filter, Move to |
| A value | Summarize by, Show as, Number format, Highlight (side by side), Name, Move to, Remove field | Summarize by, Show as, Number format, Name, Move to |
| Options | Totals, Rows (Expand all, Collapse all), Help | Keyboard shortcuts |
| Views | This view (Save "…", Save as…), Shared views, My views (each entry with its Publish and Delete as items next to it), Share this view (Copy link, Copy view as JSON, Download view, Open view file…) | Save as, Open view file, the question before a delete, a publish or a Save over a shared view |

The chip menus have a search above their first level (`/` focuses it): it finds a choice of any level
by its text, the titles above it and a few more words (labels `showAsKeywords`, `nameKeywords`,
`filterKeywords`), and opens a level by its title; for a date field it also makes hits from a number
typed: the quick choices with that count ("last 3 years") and a year compared ("from 2022"). Enter
runs a hit the arrow keys reached, not the text typed.

The Filter level of a date field shows its quick choices and the days each keeps relative to today
(the current time read in `encode`'s `timeZone`, through pivotkit-core's `relativeDateRange`) or to
what the person picks under "Counted back from": the data's latest or first date or a day of their
own (the filter's `anchor`); it offers This only for the units whose current period has data and says
the data's share of a range ("2025; 2026 has no data"). The rules write pivotkit-core's
`relative`, `compare`, `value` and `text` filters ([Filters](../concepts/filters.md#filters-in-the-ui));
a rule's result line and the summary compute the field's totals with pivotkit-core's `computePivot`
on the field alone (its Grand Total scope). What is typed in a level applies when the level or the menu closes too (a click outside).
A popover keeps its side of the anchor while its content changes (a level opening), as long as that
side has room.

A menu keeps the mouse wheel to itself: a wheel turn that nothing inside it can scroll further is
stopped, so the table or the page behind never scrolls (`overscroll-behavior: contain` does the same
for touch). A menu is at most as high as the window, and scrolls inside. No menu folds: the chart
type menu and the Export menus are flat lists in titled groups (`role="group"` with its title).

An "i" next to a setting explains it on hover, focus or tap: the totals, Show as, Excel and CSV
in the export menu, Labels and Group labels of the chart. Shown on hover, the description stays while
the pointer moves from the "i" onto it, also slowly (up to one and a half seconds on the way), so its
"Learn more" link can be reached. It is the same button as a field's "i"; its
name is "About <setting>". A menu row stays one line. Next to an item of a menu in levels (the
totals) the "i" is for the pointer: the item carries its text as its description, so the arrow keys
stay on the items. Options, Help, "Show explanations" (or
`settingInfo`) hides them all. An entry that would change nothing is disabled (in a menu in levels
`aria-disabled`, so the arrow keys still reach it), and a short line under it says why, only while it
is disabled: the grand total row needs a field in Rows, the grand total
column one in Columns, row subtotals two or more fields in Rows, column subtotals two or more in
Columns, every total a value (a disabled total shows no tick); Expand all and Collapse all; the chart image "Switch to Chart first."; a pie's Labels while
value labels are off. The export menu is a dialog, so Tab reaches each format's "i".

## Form fields

Every `input`, `select` and `textarea` of the report has a label (its text, `aria-label`) and a `name`
of its own report: `pk-` with a part chosen once per report in the browser and React's `useId`
(`pk-x3k9q1-r1f`), so two reports on one page, two web components too, share no name. Browsers fill
and restore fields by name, and list one without a name or an id in their developer tools. The names
are not stable across page loads; do not select the fields by them (the `data-testid`s are for tests).

## Popovers and the host page

Menus, bottom sheets and the "i" popups opened by a click open in the browser's top layer (`popover="manual"`; a description shown on hover of an "i" outside a menu stays in the report's layer, one inside a menu opens above the menu): above
the host page's own layout whatever its z-indexes (a fixed navigation drawer at 1200, an app bar), and
never clipped by its boxes; they stay in the report's DOM and are placed against the window. A
browser without the Popover API stacks them by `--pk-layer-z`:
[popovers above the page](theming.md#popovers-above-the-page).

## Escape and the host page

While a popover, the drill-down or the narrow field drawer of the report is open, the report listens
for Escape on the whole `document` and closes its newest layer only, also when the focus is outside
the report (on the host page, say). It calls `preventDefault()` on that Escape, and it leaves an
Escape alone that is `defaultPrevented` already. A host that opens a dialog of its own while a report
layer is open: handle Escape in the dialog's own `keydown` listener (it runs before the document's)
and call `preventDefault()`, or close the report's layer first. The keys of the report itself are in
[Keyboard and screen readers](../use/keyboard.md).

## Performance

The pivot is computed once per view and the table body is virtualized. Approximate numbers, measured
by hand in the playground on one Mac (Chromium, Firefox and WebKit from the Playwright version pinned in `package.json`, on
darwin/arm64); no test backs them and other machines differ, in ms:

| Rows | `encode` (once) | `computePivot` | `toGrid` | Change to next frame |
| ---: | ---: | ---: | ---: | ---: |
| 2,000 | 4-7 | 1-4 | 0-3 | 11-34 |
| 4,000 | 6-8 | 2-3 | 0-2 | 10-37 |
| 100,000 | 93-117 | 8-31 | 0-18 | 18-64 |
| 100,000, 100,000 distinct row labels | 114 | 72 | 29 | 112 |

Up to 100,000 rows a change stays within a frame or two, so the engine runs on the main thread; a Web Worker would add
copying the columns and the grid between threads for no visible gain. Above 100,000 rows the first
table takes longer and the page is frozen while it is built: 1 to 2.5 s at 1,000,000 rows, a filter
or a field then about 0.1 s, the chart up to 0.15 s ([measured in three browsers](../concepts/limits.md#measured-in-the-browser) with
`npm run bench:browser`). The timings are in the
browser's performance timeline as `pivotkit:encode`, `pivotkit:computePivot` and `pivotkit:toGrid`.

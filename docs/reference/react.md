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
| `onSaveTemplate` | `(name, view, { scope, source }) => unknown` |  | Save as and Save of the user's own views; gets the name (an existing one to replace), the view and `{ scope: "user", source }` (the data shown). [More](#prop-onsavetemplate) |
| `onDeleteTemplate` | `(name, { scope }) => unknown` |  | Deletes a template marked `deletable`, after the user confirmed in the menu; `scope` is the entry's group. [More](#prop-ondeletetemplate) |
| `onPublishTemplate` | `(name, view, { source }) => unknown` |  | With `canPublish`: "Publish as shared view" on the user's views and Save on a shared view, asked in place. [More](#prop-onpublishtemplate) |
| `canPublish` | `boolean` | `false` | The user may publish views for everyone (an admin, as the host decides). [More](#prop-canpublish) |
| `templateStore` | `"browser"` | off | `"browser"`: the report keeps the user's own views (My views) in `localStorage` under `pivotkit:views:<storageKey>` (`pivotkit:views` without one), as view files that name their data (`source`). [More](#prop-templatestore) |
| `fieldDefaults` | `{ [field]: { agg?, format?, drillFormat?, order?, label?, description?, href?, type? } }` |  | The aggregator and the format a field gets when it is added to Values (an average for a duration, say). [More](#prop-fielddefaults) |
| `onCellClick` | `({ row, col, value, valueIndex, text, count, rows }) => void` |  | A click (or Enter) on a value or a chart point: key paths of its row and column, the value, the number of source rows and the first `drillDownLimit` of them. [More](#prop-oncellclick) |
| `drillDown` | `boolean` | `true` | The panel with the rows behind a clicked value. |
| `exportData` | `boolean \| { columns?: string[] }` | `false` | Export → Source data: every row of the data as a CSV or JSON file, for the user's own analysis or the command line. It also gives the drill-down its copy and download. `{ columns }` keeps both to some columns. [More](#prop-exportdata) |
| `drillDownExport` | `boolean` | `false` | The drill-down's copy and download while `exportData` is off, with every column. [More](#prop-drilldownexport) |
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
| `settingInfo` | `"on"` or `"off"` |  | The "i" next to the settings that need explaining (the totals, Show as, Along, the export formats, the chart's Labels, Group labels and Tooltip): as `fieldInfo`. [More](#prop-settinginfo) |
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

Exports: `PivotReport` and these types:

- `PivotReportProps`, `CellClick`, `ExportFile`
- `Template`, `TemplateScope`, `TemplateSource`: the data a view is saved or published from
- `FieldDefaults`, `TipDismiss`, `ViewSource`, `SourceSwitch`, `DataLoad`, `View`
- `ViewInput`: a view as a host passes it
- `UiLabels` and `PartialLabels`

The stylesheet is `pivotkit-react/styles.css`. It ships its own type declaration, so a strict
TypeScript project imports it without a bundler's CSS types.

`pivotkit-react/labels` exports `LABELS` (`{ en, de }`, every text). It is a subpath of its own
because the menus' texts load with the menus. That keeps the report's first load small.

## Props in detail

This section describes in full each prop whose line in the table ends in "More".

### `templates` { #prop-templates }

Type: `{ name?, view?, file?, scope?, deletable? }[]`; default: `[]`.

The templates of the Views menu. The menu shows them in two groups by `scope`:

- "Shared views": `"shared"`
- "My views": `"user"`

Without `scope`, a `deletable` entry is the user's own, and every other entry is shared.

An entry has a `view`, or a [view file](view-file.md) in `file`. The file can be its object or its
text, and the entry's `name` defaults to the file's. The empty state also offers the first three
entries.

- `deletable: true` shows a delete button for that entry.
- A shared entry without `deletable` has an "i" ("Only admins can change shared views.",
  `labels.settingInfo.sharedView`).
- The report leaves out an entry without a name or a usable view.

Names need not be unique. The menu shows every entry in order, so a saved view may have a preset's
name. `onDeleteTemplate` gets the name. See [Templates and shared views](../concepts/templates.md).

### `onSaveTemplate` { #prop-onsavetemplate }

Type: `(name, view, { scope, source }) => unknown`.

With this prop, the Views menu shows:

- "Save current view" under This view. Once a view is loaded, it shows Save as… instead.
- Save “…” for a user's view of `templates` that was loaded.

The function gets three arguments:

- the name
- the view as shown: normalized against the data, with the custom orders of `fieldDefaults`
- `{ scope: "user", source }`. `source` is the data shown, as a view file names it: `{ id, name, params }`,
  with a loaded workbook's sheet in `params.sheet`. It is `null` without a source id
  ([keeping it](../concepts/templates.md#your-application-keeps-them-callbacks)).

Replace by name (an upsert). Save sends the loaded view's own name. Save as sends the name of one of
the user's views once the user confirmed "“…” exists. Replace it?". Replace that view, and do
not add a second one. Then pass the new `templates`. Until then, the menu keeps the old entry, and the view
shown carries the name.

When the answer comes after the user changed the view (a slow server), the dot for unsaved changes
stays. When the user chose New or loaded another view in the meantime, the name goes to no view.

The report shows "View “…” saved" when the function returns or the promise it returns resolves. It
shows an error when the function throws or rejects. The error uses the host's message when it gives
one (an `Error`, a text), else "The server could not save the view." (`labels.toastSaveRejected`).
`onSaveTemplate` wins over `templateStore`.

### `onDeleteTemplate` { #prop-ondeletetemplate }

Type: `(name, { scope }) => unknown`.

Deletes a template marked `deletable`, after the user confirmed in the menu. `scope` is the entry's
group. The entry goes when the function returns or its promise resolves. The report shows a failure
as for `onSaveTemplate`, with `labels.toastDeleteRejected` when there is no message. The report
deletes the browser store's own entries in the store, without this function.

### `onPublishTemplate` { #prop-onpublishtemplate }

Type: `(name, view, { source }) => unknown`.

`source` is the data the view was made for:

- For a view that names no data of its own: the data shown, `{ id, name, params }` as
  [`onSaveTemplate`](#prop-onsavetemplate) gets it. It is `null` without a source id.
- For a view file or a view of the browser store: the data it names. That is its `id`,
  `params.sheet` for a workbook's sheet, and `name` when it is the data shown.

With `canPublish`, the report offers two actions. Each asks in place before it runs:

- "Publish as shared view" (an arrow) next to each of the user's views. It asks "Publish “…” as a
  shared view? Everyone who uses this report sees it."
- Save “…” on a shared view that was loaded. It asks "Replace the shared view “…” for everyone?".

Both send the view in the same form: normalized against the data, with the custom orders of
`fieldDefaults`. The host adds the view to its shared views, or replaces the shared view of that
name. This is an upsert by name: Save sends the shared view's own name. Then the host passes the new
`templates`. The report shows "View “…” published" when the function returns or its promise
resolves. It shows a failure as for `onSaveTemplate` (`labels.toastPublishRejected`).

### `canPublish` { #prop-canpublish }

Type: `boolean`; default: `false`.

The user may publish views for everyone, as an admin. The host decides who that is. The report
only shows what the host allows: the server must check who may save, publish or delete. Without
`canPublish`, or without `onPublishTemplate`, the report offers nothing to publish.

### `templateStore` { #prop-templatestore }

Type: `"browser"`; default: off.

With `"browser"`, the report keeps the user's own views (My views) in `localStorage`. The key is
`pivotkit:views:<storageKey>`, or `pivotkit:views` without a `storageKey`. Each view is a view file
that names its data (`source`). A report lists the views of its data and those made for no named
data.

- The views stay in this browser and device only. Clearing the site's data loses them. Nobody else
  sees them. The menu says so.
- The store holds at most 100 views and 500,000 characters.
- Saving a name the store already has for the same data replaces that view.
- The report reads the store after the first render, so hydration does not mismatch.
- With `onSaveTemplate`, saves go to the host. The menu still lists the stored views, and the user
  can delete them.

See [Templates and shared views](../concepts/templates.md#the-browser-keeps-my-views-templatestorebrowser).

### `fieldDefaults` { #prop-fielddefaults }

Type: `{ [field]: { agg?, format?, drillFormat?, order?, label?, description?, href?, type? } }`.

Settings per field, by key:

- `agg` and `format`: the aggregator and the format a field gets when it is added to Values, such as
  an average for a duration. The report ignores an aggregator that does not fit the field's type.
  When the user picks another aggregator in the value's menu, `format` stays while the result is in
  the field's unit, such as from an average to a median. It does not stay for a count. A format the
  user chose behaves the same way.
- `drillFormat`: formats the field's own values in the drill-down, else `format` does. `"text"` shows
  a numeric identifier as it is (40072, not 40,072). `"date"` shows a date without its time.
- `order`: the field's own order of items (`["Spring", "Summer", "Autumn", "Winter"]`). The report
  sorts the field in this order when it is placed on Rows or Columns. The view gets a `custom` sort,
  so a template keeps it. A field on Rows or Columns of a view or template without a sort entry for
  it is sorted this way too. The field's menu offers "Custom order" and "Custom order, reversed".
  "A to Z" stays a sort entry of its own. Items not listed follow by label.
- `label`: the name the report shows for the field. It appears on chips and headers, in value names
  such as "Sum of Net revenue", in the drill-down, the chart and the exported files. Views and
  templates keep the field's own name.
- `description`: plain text, at most 1,000 characters. It shows behind an "i" next to the field and
  on its chips, behind the "i" at the top of its chip menu, and on its table headers.
- `href`: an https link. It adds "Learn more".
- `type`: reads the field's column as `"number"`, `"date"`, `"string"` or `"boolean"`, as the
  `types` option of pivotkit-core's `encode` does.

A field without `description` and `href` looks as it does without `fieldDefaults`.
pivotkit-core's `fieldDefaultsFromSchema` builds all of it from a JSON Schema or an OpenAPI
document: [Field descriptions and names](../concepts/fields.md).

#### Identifier fields { #identifier-fields-react }

Some fields are identifiers by default. This applies when `fieldDefaults` says nothing about how to
count or show the field (no `agg`, `format` or `drillFormat`), and the field:

- is a number field of whole numbers, and
- has a name that ends in the word ID, Nr, No, Number, Key or `#`, in any case.

Examples that match: `ID`, `CustomerId`, `customer_id`, `Order No`, `Serial #`, `userID2`,
`ID (Asset)`. Examples that do not: `Paid`, `UUID`, `Number of items`. The exact rule is under
[identifier fields](../concepts/fields.md#identifier-fields).

Such a field gets `agg: "count"` and `drillFormat: "text"`, so the report counts it when it is added
to Values, from the field list, by a drag or by Move to. Its numbers show as they are in the
drill-down. Any of the three entries overrides this: `{ ID: { agg: "sum" } }`,
`{ ID: { drillFormat: "number" } }`. See [Identifier fields](../concepts/fields.md#identifier-fields).

### `onCellClick` { #prop-oncellclick }

Type: `({ row, col, value, valueIndex, text, count, rows }) => void`.

The report calls it on a click (or Enter) on a value or a chart point. It gets:

- the key paths of the value's row and column
- the value
- the number of source rows, and the first `drillDownLimit` of them

A blank cell with no rows behind it is not clickable and does not call it.

### `height` { #prop-height }

Type: `number` or `string`; default: `640`.

The report's height: a number of pixels or a CSS length (`"100%"`, `"calc(100svh - 24px)"`). The
table and the field list scroll inside it. With a height, the report stays inside it. Without one,
the report grows past its default 640 px when it needs more, and the page scrolls. See
[Layout](#layout).

### `fieldList` { #prop-fieldlist }

Type: `"open"` or `"collapsed"`.

The field list of a wide or medium report: `"open"`, or `"collapsed"` to a rail of about 40 px
(`--pk-rail-w`).

- Without `fieldList`, the user's choice decides. The user chooses with « and the rail, and the
  report remembers the choice with the tips under `storageKey`.
- With `fieldList`, the user can still open or collapse the list until the page is loaded again.
  The report does not store that.
- A narrow report has its drawer either way.
- The report ignores another value, with a console warning.

The rail shows "Fields" upright and a search button. « and the rail are buttons with `aria-expanded`.

### `limits` { #prop-limits }

Type: `Partial<Limits>`.

pivotkit-core's [limits](../concepts/limits.md#limits).

- Data over `limits.rows`, or a layout over `limits.work`, `groups`, `pivotCells` or `cells`: the
  report shows a message in place of the result. The message says what to change.
- A field beyond `limits.axisFields` or `limits.values`: the report refuses it with a note.
- A saved view with more fields: the report loads the fields that fit and says so above the result.

A file people load ([`allowImport`](#prop-allowimport)) has [`importLimits`](#prop-importlimits)
over these.

### `onExport` { #prop-onexport }

Type: `({ kind, fileName, blob, text, rows }) => unknown`.

The report calls it with every exported file before the download, and with every copy before it
goes on the clipboard. Returning `false` skips the download or the copy. The host can then keep the
file or the text, to upload it, say.

`kind` says what it is:

- Files: `"xlsx"`, `"csv"`, `"html"`, `"png"`, `"svg"`. With [`exportData`](#prop-exportdata),
  `"data-csv"` and `"data-json"` for Source data. `"json"` for the [view file](view-file.md) of
  "Download view" in Views, named `<name>.pivotkit.json`. `fileName` is the name with its
  extension, and `blob` is the file.
- Copies from Export: `"copy-table"`, `"copy-json"`.
- From the drill-down panel: `"drill-copy"`, `"drill-json"`, `"drill-csv"`, `"drill-xlsx"`.
- `"print"`: the [HTML report](report.md) before the print dialog opens (`pivot.html`). Returning
  `false` prints nothing, so the host can print it its own way, such as a PDF of its server.

A copy has its `text` and the `fileName` it would have as a file. A drill-down export has
`rows: { shown, count }`.

An empty report has no field placed. Its table's Export entries are greyed out ("Add a field
first."), and the report does not call `onExport` for them. Source data stays.

### `exportData` { #prop-exportdata }

Type: `boolean | { columns?: string[] }`. Default `false`.

Adds the group **Source data** last in the Export menu, with **All rows as CSV (.csv)** and **All
rows as JSON (.json)**. The files hold:

- every row of the data the report shows: yours, or a file the user loaded
- every column except the derived fields a view adds
- the fields' own names, and values not formatted (pivotkit-core's
  [`dataToCsvParts` and `dataToJson`](core.md))

The files are named `<fileName>-data.csv` and `<fileName>-data.json`. With the view file of
"Download view", the [command line](cli.md) renders the report again:
`pivotkit render <view> --data <fileName>-data.csv`. Each file passes [`onExport`](#prop-onexport)
first (`kind` `"data-csv"`, `"data-json"`).

The file holds what the report holds. That includes columns no view places and rows its filters
leave out. So the export is off unless you turn it on: [Security](../security.md#source-data). The
file counts against `limits.cells` (rows times fields).

`exportData` also decides the drill-down panel's **Export** menu: its copies and downloads. With
`exportData` off, the panel shows the rows behind a value but has no Export menu.
[`drillDownExport`](#prop-drilldownexport) turns that menu on alone. Only the menu goes: a person
can still select and copy the panel's text in the browser, and `onCellClick` still gets the rows.
To keep the rows in, set `drillDown={false}`.

`exportData={{ columns: ["Region", "Revenue"] }}` keeps Source data to these columns, in this order:

- The report matches the names case-insensitively, each once. It never writes derived fields.
- The drill-down panel's copies and files keep to these columns too. The panel still shows every
  column, and `onCellClick` still gets whole rows.
- The report leaves out a name the data lacks. It says so once in the console when the Export menu
  or a drill-down opens (`pivotkit: exportData.columns names no column of the data: …`).
- With no column left (an empty list, or none that matches), Source data and the drill-down's Export
  menu are off. They are off too when `columns` is no list (`{ columns: "Region" }`), and the console
  says so once.
- An `exportData` of another shape (a text, an array) is off, as `false`.

### `drillDownExport` { #prop-drilldownexport }

Type: `boolean`. Default `false`.

Gives the drill-down panel its **Export** menu while `exportData` is off: Copy, Copy as JSON,
Download CSV and Download Excel. The copies and files hold every column and the rows the panel
shows. Source data stays off.

- With `exportData` on, the panel has the menu anyway. `drillDownExport` changes nothing there.
- With `exportData={{ columns }}`, the menu keeps to those columns. With none left, it stays off.
- `onCellClick` gets the rows either way. The prop decides only what people can copy and download.

### `storageKey` { #prop-storagekey }

Type: `string`.

Remembers the dismissed tips and the help switches in the browser's `localStorage` under
`pivotkit:tips:<storageKey>`. Give each report on a page its own key.

- Without it, the tips stay dismissed until the page is loaded again.
- The report reads the store after the first render, so server rendering and hydration match.
- With `templateStore="browser"`, the report keeps the user's own views under `pivotkit:views:<key>`
  too.
- With [`allowImport`](#prop-allowimport), a loaded file survives a new mount of the report under
  this key, in memory only.

### `dismissedTips` { #prop-dismissedtips }

Type: `string[]`.

Dismissed tip ids from the host's own storage. Three entries are switches:

- `"*"`: the user switched all tips off.
- `"-explanations"`: the user switched off "Show explanations" (Options, Help).
- `"-fields"`: the user collapsed the field list to the rail. Without [`fieldList`](#prop-fieldlist)
  this entry stores that choice.

The report drops entries of other shapes: `"open:<section>"` and `"closed:<section>"`, of the menu
sections that folded before. A new list replaces the report's. The report compares lists by value.

### `onTipDismiss` { #prop-ontipdismiss }

Type: `({ id, dismissed }) => void`.

The report calls it on every change of the dismissed tips, with the whole list in `dismissed`.
Store the list and pass it back as `dismissedTips`. The changes and their `id`:

- a dismissal: the tip's id
- "Show tips" off: `"*"`
- "Show explanations" off: `"-explanations"`
- the field list collapsed to the rail, or opened again, without `fieldList`: `null`, with
  `"-fields"` added to or removed from `dismissed`
- a switch on, or "Show dismissed tips again": `null`. "Show dismissed tips again" keeps the switches.

### `fieldInfo` { #prop-fieldinfo }

Type: `"on"` or `"off"`.

The "i" of the field descriptions in the field list and on chips, and the tooltip of the table
headers. `"on"` or `"off"` decides it, whatever the user's switch says.

Without it, the user's "Show explanations" in Options, Help decides. The switch is on by default,
and the report remembers it like the tips. It is one switch for the "i" of the settings, the zones
and the fields. Screen readers keep the descriptions (`aria-describedby`).

### `settingInfo` { #prop-settinginfo }

Type: `"on"` or `"off"`.

The "i" next to the settings that need explaining: the totals, Show as, Along, the export formats,
and the chart's Labels and Group labels. It works as `fieldInfo` does. Options shows "Show
explanations" while one of the three props is left to the user. A disabled entry's reason stays
either way.

### `source` { #prop-source }

Type: `{ id, name? }`.

The data the report shows. Its `id` and `name` go into the [view files](view-file.md) and links the
report shares. Before the report loads a view made for another `id`, it asks. See
[Sharing](../concepts/sharing.md#the-source-of-a-view-for-developers).

### `schemaUrl` { #prop-schemaurl }

Type: `string` or `null`.

The `$schema` of the [view files](view-file.md) the report writes:

- by default `https://pivotkit.eize.dev/schema/view-file-2.json`
- a host's own copy of the schema, which ships as `pivotkit-core/schema/view-file-2.json`
- `null` / `""` to leave it out

Loading a view never depends on it.

### `onSourceSwitch` { #prop-onsourceswitch }

Type: `({ source, view, name }) => void`.

The user chose to switch to the data a loaded view was made for. Show that data, with `view` as
its start view. `view` is as the file has it, not normalized. Switching starts the report on that
data anew, so Undo begins there.

The view is untrusted input like any loaded view: it comes from a file or a link. Hand it only to a
report as its start view, which normalizes it. Never run or render anything from it.

### `chartOptions` { #prop-chartoptions }

Type: `object`.

Plain JSON that the report merges over the ECharts option it builds. Objects merge key by key, a
list entry by entry, and an object given for a list goes into every entry. It wins over the view's
chart settings.

When it draws the chart, the report leaves out the following, with a console warning:

- functions, and values that are not plain JSON
- the ECharts options that are markup or addresses: a string `formatter`, `rich`, `link`, `image`,
  the tooltip's element

The report compares it by value. See [Charts](../concepts/charts.md#chartoptions-for-developers).

### `shareLink` { #prop-sharelink }

Type: `boolean` or `string`; default: off.

Turns on "Copy link" in the Views menu, and opening a shared link.

- `true` links to the page's own address without its query string: origin, path, fragment.
- A string is the base URL as it is.

The view is in the URL fragment, `#pivot=` or `#pivot-<storageKey>=`. The report reads it after the
first render, and when only the fragment changes. See [Sharing](../concepts/sharing.md).

### `persistView` { #prop-persistview }

Type: `"session"`.

With `"session"`, the report keeps the view in `sessionStorage` (`pivotkit:view:<storageKey>`) for
this tab and shows it again after a reload. It reads the store after the first render. A link wins.
Reset goes to the start view, which the tab then keeps.

### `loading` { #prop-loading }

Type: `boolean`; default: `false`.

The host is loading the data.

- Before the report has had data, it shows its skeleton: toolbar, zones and table rows in the
  theme, and `role="status"` with "Loading the report…", announced once.
- Later, the skeleton covers only the result. The view and its history stay.

A data set of more than 10,000 rows shows the skeleton by itself while the report encodes it the
first time.

### `allowImport` { #prop-allowimport }

Type: `boolean`; default: `false`.

People may load a file of theirs into the report. The browser reads it, and nothing is uploaded.
The report offers:

- a **Data** button in the toolbar, with the data source and **Load data…**. It stands before Views,
  and under More on a narrow report.
- a file dropped anywhere onto the report
- a preview before the data is replaced: the sheet of a workbook, the first rows, a type per column,
  the readers' notes

[Load your own data](../use/load-data.md) shows what people see. [Loading files](import.md) describes
what the readers do.

- Loading a file is a step of the undo history. Undo goes back to the data before it, with the view
  it had. Redo goes forward again. "Back to original data" shows the host's data with its view. The
  report keeps up to three such steps, since each holds a data set.
- While a file's data is shown, the report's [`source`](#prop-source) is the file's. It has the
  file's name and an `id` made of the name and a hash of the name and the column names
  (`tickets.csv#e51bd4bc21e98ee8`). The rule is under
  [How a loaded file is named](import.md#how-a-loaded-file-is-named). So the browser store
  (`templateStore="browser"`) keeps views per file, and a view shared from a file names it. The
  host's `source` comes back with its data.
- The host's data and props stay as they are. When the host passes a new `data` while a file is
  shown, the report uses it when the host's data is shown again.
- A host that mounts the report again gets the file back. See
  [When the host mounts the report again](#allowimport-remount).
- The import UI is a chunk of its own (`dist/import-ui.js`, with `pivotkit-core/import`). It loads
  when the Data menu opens, when a file is dragged over the report, or when the user clicks the
  empty report's **Load data…**. Without `allowImport`, nothing of it loads.
- The report reads and shows a file with [`importLimits`](#prop-importlimits) over the report's
  [`limits`](#prop-limits) (`fileBytes`, `rows`, `columns`, `importCells`, ...). It refuses a file
  over one of them and says what to do. The data stays.
- Memory: while the preview is open, the page holds the table as read, with values and their text.
  After a change of a type, it holds a second one. After **Load data**, only the encoded columns
  stay, for the file shown and for each data step Undo keeps. A rough, unverified guide from one
  measurement in Node, not a browser: a CSV of 1,000,000 rows and 5 columns (46 MB) took about
  650 MB more memory while it was read and loaded. Lower `importLimits.rows` or
  `importLimits.fileBytes` where people's machines are small.

#### When the host mounts the report again { #allowimport-remount }

A host may mount the report again: with a new `key`, or through a component library that
remounts on a theme switch. PowerShell Universal does this on its light/dark switch and with
`Sync-UDElement`. The host then gets the file back:

- The report with the same [`storageKey`](#prop-storagekey) shows the file's data, its view and
  its undo steps again.
- It tells `onDataLoad` with `cause` `"restore"` before it reports its view (`onViewChange`). So
  a host that controls the view takes the file's.
- The file comes back with its view however quickly the host mounts the report again.
  PowerShell Universal's `Sync-UDElement` mounts it twice within about 30 ms.
- A view the host has not passed back yet, such as one that goes through its server first,
  counts as the report's. The next mount shows it, not the host's view from before.

This works only when the host's data is the same: the same `dataKey` and the same `source.id`.
Without a `dataKey`, the same column names and types count. Otherwise the report shows the
host's data and lets the file go.

The report keeps the file in the page's memory only, never in `localStorage` or
`sessionStorage`, so a reload still shows the host's data.

- It keeps the latest state per `storageKey`, for at most four reports. The one written longest
  ago goes first.
- It lets the file go as soon as the host's data is shown again ("Back to original data", Undo
  of the load).
- Without a `storageKey`, it keeps nothing.
- Two reports mounted at once with the same `storageKey` would share it. Give each its own key.
- Pass a `dataKey` where another table with the same columns can stand under the same
  `storageKey`, such as another page of a single-page app. Without one, such a table counts as
  the same data.
- Pass `loading` to a report you mount while the host's data is still on its way. A report
  mounted on data without columns shows that data and keeps the file for the next mount.
- The restored report starts where it was. It does not read a shared link in the address or the
  tab's stored view (`persistView`) again.

### `importLimits` { #prop-importlimits }

Type: `Partial<Limits>`; default: [`limits`](#prop-limits).

The [limits](../concepts/limits.md#limits) for a file loaded with
[`allowImport`](#prop-allowimport). The report reads and shows the file with them. They merge key by
key over `limits`:

- A key `importLimits` sets is the file's.
- A key it leaves out comes from `limits`.
- Both merge over pivotkit-core's defaults.

The host's own `data` keeps `limits`, so a host can keep uploads small without capping its own data:

```jsx
<PivotReport data={rows} allowImport importLimits={{ rows: 1_000, fileBytes: 5_000_000 }} />
```

Here the host's 50,000 rows show. A file of 1,001 rows is refused with "… has more than 1,000
rows (limits.rows) …", and the data shown stays.

The import limits hold for everything about the file: the readers (also in the
[`importWorker`](#prop-importworker)), the preview, and the views, results and exports while its data
is shown. "Back to original data" goes back to `limits`.

`limits` does not cap a key of `importLimits`. A file may get more than the host's data where the
host says so (`importLimits={{ rows: 200_000 }}` over `limits={{ rows: 1_000 }}`), so set only the
keys a file should have differently. The report compares `importLimits` by value, as `limits`.

### `plugins` { #prop-plugins }

Type: `ReaderPlugin[]` (contract v1 of `pivotkit-core/import`).

Reader plugins for formats beyond CSV, TSV, text and JSON. `plugins={[xlsxReader]}` with
[pivotkit-xlsx](plugins.md#pivotkit-xlsx) reads Excel workbooks.

- The report checks a plugin when a file is read (`validatePlugin`).
- A plugin's code loads with the first file of its kind.
- The file picker offers what the plugins and the built-in readers accept. The Data menu names them
  by their `label`.
- A plugin runs on the page, never in the import worker. It is code of the page, and a worker cannot
  take it.

### `onDataLoad` { #prop-ondataload }

Type: `({ cause, source, file, sheet, rows, columns, notes }) => unknown`.

The report calls it when the data shown changed. It gets what the data is now:

| Key | What |
| --- | --- |
| `cause` | `"load"`: a file, before it is shown (returning `false` refuses it; the data stays), also another sheet of the workbook shown that a saved view opened (refused, the view is not opened and a note says so); `"original"`: the host's data again; `"undo"`, `"redo"`: one of those undone or redone; `"restore"`: the report was mounted again and shows the file it had ([`allowImport`](#prop-allowimport)). |
| `source` | `{ id, name }` of the data shown: the file's, or the host's `source` (`null` without one). |
| `file` | `{ name, size, type }` of the file shown, or `null` for the host's data. |
| `sheet` | The sheet of a workbook, else `null`. |
| `rows`, `columns` | The rows, and `[{ name, type }]` per column. |
| `notes` | For `"load"`: the readers' notes `[{ code, params, message }]` ([the codes](import.md#the-table)). |

Only `false` itself refuses a file. The report does not wait for a promise. A function that throws
refuses a load too, with "<name> was not loaded: <message>". For the other causes, the step has
already happened. The report throws the error again a moment later, outside the report, so the page
sees it. Names and notes come from the file: show them as text, never as HTML.

### `importWorker` { #prop-importworker }

Type: `() => Worker`.

Starts a module worker for the built-in readers. The worker reads a large CSV or JSON file off the
page, so the report stays responsive. A plugin's file is read on the page. The worker is the
package's `pivotkit-react/import-worker` entry (`dist/import-worker.js`), which imports
`pivotkit-core/import`. Bundle it the way your bundler bundles workers, as a file of your origin:

```js
const importWorker = () => new Worker(new URL("./import-worker.js", import.meta.url), { type: "module" });
<PivotReport data={rows} allowImport importWorker={importWorker} />
```

The report starts one worker per file and ends it when the file is read or cancelled. It also ends
a worker in these cases:

- The worker does not say it is ready within 10 seconds. The page then reads the file.
- The worker answers with something that is no table. The report shows an error.

A worker that does not start leaves the read to the page, without a message. For example a
Content-Security-Policy without `worker-src` for it, a browser without module workers, or a file that
is not there.

Without `importWorker`, the page reads the file. The readers give the page a turn every 16,384 rows,
so progress and **Cancel** still work. pivotkit-element starts its own worker.

## Tips

The report shows short notes above the table or the chart. They sit in the flow, never over the
result, the most important first.

- Three are **notices**. They say that the result is cut or empty, so they always show. They have no
  x and count against no limit. They stay with `tips="off"` and with "Show tips" off.
- The others are **tips**. The report shows one at a time, the most important first. The next one
  waits until the user follows or dismisses the one shown. Each tip has an x that dismisses it. Tab
  reaches the x, and the focus then goes to the next tip.

Options, Help has "Show tips", "Show explanations", "Show dismissed tips again" and the keyboard
shortcuts. A screen reader hears new notes through a polite live region.

The notes, in the order the report shows them, and when:

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
`tips`, `dismissedTips` and `onTipDismiss` are those of the tips. Notices cannot be switched off.

The report reads the stored dismissals (`storageKey`) after the first render. This also holds when
the report is rendered on a server and hydrated. The server and the first client render show the
same tips, and a tip dismissed earlier goes right after hydration.

## Controlled and uncontrolled

- **Uncontrolled**: pass `defaultView` (or nothing). The report keeps the view itself and reports
  every change through `onViewChange`.
- **Controlled**: pass `view` and set it from `onViewChange`. The undo history stays in the report
  however often the host renders. A view the host changes on its own becomes one undo step.
  While a delayed host is acknowledging changes, actions keep the pending undo history. This holds
  also when earlier acknowledgements arrive between actions. The view shown still comes from the
  host.

A host may render the report on every change of its own state. The report compares `labels`,
`limits` and `importLimits` by value, and `data` by identity or by `dataKey`.

The host's view is `view`, else the first `defaultView`. When the data cannot use parts of it, such
as a field the data lacks or an unknown format, a warning shows above the result. It works as for a
loaded view ([parts of a view that were not used](../use/behaviour.md#parts-of-a-view-that-were-not-used)):

- It shows once per distinct view, so a host that passes the same view on every render keeps it
  folded or dismissed.
- It does not show while `loading`.
- A view the user loads later replaces it.
- A controlled host that passes back what `onViewChange` gave ends it, since that view is
  normalized.

## Files the package loads

`dist/index.js` loads these files by relative dynamic import, with the code they share in
`dist/chunks/`:

- `dist/echarts.js`, on the first chart
- `dist/menus.js`, the menus' panels, right after the first render
- `dist/menu-texts-de.js` for a German report: the menus' German texts. It loads with the menus, or
  when the locale changes to German.
- `dist/import-ui.js` with `allowImport`: loading data, on its first use, with `pivotkit-core/import`

`dist/import-worker.js` is the worker of [`importWorker`](#prop-importworker). Only a host that
starts it loads it.

A bundler follows these imports with no setting. A host that copies files by hand (an import map, a
folder of assets) deploys the whole `dist/` folder.

- Without `dist/menus.js` and `dist/chunks/`, the report works, but its menus say "This menu could
  not be loaded." with **Try again**.
- Without `dist/menu-texts-de.js`, a German report's menus open in English and work. The same
  happens when the file cannot load: offline, or a Content-Security-Policy that blocks it. The next
  menu that opens tries the German texts again.

## Layout

The report adapts to its own width, not the window's:

- **Wide** (1024 px and more): the field list is on the left, and the zones are in a 2 x 2 grid.
- **Medium**: the field list is narrower.
- **Narrow** (below 640 px): the field list opens as a drawer from the toolbar. Menus show as bottom
  sheets: at the bottom of the window, at most 82 % of its height, scrolling inside.

Toolbar buttons move into "More" by a fixed priority (`OVERFLOW_ORDER`): Layout, Options, the chart
type, then Start over, and Views last. Only the buttons the room left cannot hold move
(`overflowHidden` in `overflow.js`). The first ones in the order go until the rest fits. Then each of
them that the room left still holds comes back.

- The report measures each button's room with the texts of the report's labels, in the font the
  toolbar is drawn in (`toolbarRoom`). It measures the chart type's button with its longest type, so
  a pick never moves a button. A shorter language keeps more buttons.
- "More" lists them in groups (`MORE_GROUPS`): Start over's Reset and New as entries of their own,
  then Layout, the chart type and Options, then Views.
- The report decides all this before the first paint.

The name of the view loaded takes the room left. The report cuts it with "…", never below 4em.

The zones stack, one line each, whenever the area next to the field list is narrower than 640 px. A
container query on that area decides it. This covers the narrow layout and a medium one, such as a
half-width card of 650 px. "Swap rows and columns" shows its icon only when the head of the Columns
zone is too narrow for the text. Its name stays for screen readers and as a tooltip.

Only the table scrolls sideways. The row label columns share at most 40 % of the main area, and a
value's name wraps beyond 30 %. So a long label wraps between words, and a phone still shows values
next to two levels of row labels.

- Each row label column is at least 5.5em wide, so a common word such as "Central" never breaks.
- A longer word breaks at a hyphen of its own. A word longer than the column breaks as a last
  resort.
- A narrow report has less room around each cell.
- From 300 rows on, rows have one height, too low for two lines. The report then cuts a row label
  with an ellipsis. Its full text is the cell's title. The status line under the table shows the
  whole row label ("Row: Linux / 24.04") of a tapped label, or of the value the focus is on.

The report starts in the compact layout when it is lower than a threshold. It measures the border
box before the first paint:

- below 600 px of height (`COMPACT_HEIGHT` in `PivotReport.jsx`)
- below 820 px in the narrow layout, where the zones stack (`COMPACT_HEIGHT_NARROW`)

In the compact layout, the zones fold into one line that says what is in them ("Rows: Team ·
Columns: Priority · Values: Count of Ticket"), so the table keeps its room. At most one tip shows.

- A click on that line, or Layout in the toolbar, opens the zones. Layout folds them again.
- Layout keeps its text and shows its state with `aria-pressed` (pressed: the zones are open).
  Whether it stands in the toolbar or in "More" (as an entry with a check) depends on the width only,
  never on its own state.
- The line only shows what is placed. To change a chip, open the zones first.
- A drag from the field list or the table opens the zones while it lasts, so a field can still be
  dropped.
- When the report gets lower while a menu or popover is open, the fold waits until it closes. A focus
  in the zones moves to the folded line.
- The report folds the zones too when they no longer fit its box. It checks after every render and
  when a part of it changes size. So zones that grow in a box of the same size fold as well: longer
  texts in another language, more fields in Rows, a font or stylesheet that loads late.
- Folded that way, the zones open again once they fit: when a warning folds, a tip goes or the
  report gets wider.

The user's choice is state of the mounted report. It survives the host's renders. It is not part of
the view, so a saved view does not carry it.

The result keeps a least height: 240 px, 280 px in the narrow layout. The box may be lower than
what the toolbar, the zones (or their line), the tips, the notes, the result's least height and the
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

**Enlarge** and **Full screen** stand at the top right of the result. Neither is part of the view.

**Enlarge** lets the result fill the report. Its name says what a click does: Enlarge or Reduce. It
has no `aria-pressed`.

- The field list, the zones, the tips and the notes above the result are hidden. The toolbar stays,
  and one line names the fields.
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

The menus of a chip and Options are menus in levels.

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
| A field in Filters | Filter, Move to, Remove field | Filter, Move to |
| A value | Summarize by, Show as, Number format, Highlight (side by side), Name, Move to, Remove field | Summarize by, Show as, Number format, Name, Move to |
| Options | Totals, Rows (Expand all, Collapse all), Help | Keyboard shortcuts |
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
a range ("2025; 2026 has no data").

The rules write pivotkit-core's `relative`, `compare`, `value` and `text` filters
([Filters](../concepts/filters.md#filters-in-the-ui)). A rule's result line and the summary compute
the field's totals with pivotkit-core's `computePivot` on the field alone, in its Grand Total scope.
What is typed in a level also applies when the level or the menu closes, such as on a click outside.
A popover keeps its side of the anchor while its content changes, such as when a level opens, as
long as that side has room.

A menu keeps the mouse wheel to itself. The menu stops a wheel turn that nothing inside it can
scroll further, so the table or the page behind never scrolls. `overscroll-behavior: contain` does
the same for touch. A menu is at most as high as the window, and scrolls inside.

No menu folds. The chart type menu and the Export menus are flat lists in titled groups
(`role="group"` with its title).

An "i" next to a setting explains it on hover, focus or tap. Settings with an "i": the totals, Show
as, Excel and CSV in the export menu, and Labels and Group labels of the chart.

- Shown on hover, the description stays while the pointer moves from the "i" onto it, also slowly:
  up to one and a half seconds on the way. So its "Learn more" link can be reached.
- It is the same button as a field's "i". Its name is "About <setting>".
- A menu row stays one line. Next to an item of a menu in levels (the totals), the "i" is for the
  pointer. The item carries its text as its description, so the arrow keys stay on the items.
- Options, Help, "Show explanations" (or `settingInfo`) hides them all.
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

## Performance

The report computes the pivot once per view, and the table body is virtualized. The numbers below
are approximate, in ms. They were measured by hand in the playground on one Mac (darwin/arm64), with
Chromium, Firefox and WebKit from the Playwright version pinned in `package.json`. No test backs
them, and other machines differ.

| Rows | `encode` (once) | `computePivot` | `toGrid` | Change to next frame |
| ---: | ---: | ---: | ---: | ---: |
| 2,000 | 4-7 | 1-4 | 0-3 | 11-34 |
| 4,000 | 6-8 | 2-3 | 0-2 | 10-37 |
| 100,000 | 93-117 | 8-31 | 0-18 | 18-64 |
| 100,000, 100,000 distinct row labels | 114 | 72 | 29 | 112 |

Up to 100,000 rows, a change stays within a frame or two, so the engine runs on the main thread. A
Web Worker would add copying the columns and the grid between threads, for no visible gain.

Above 100,000 rows, the first table takes longer, and the page is frozen while the report builds it.
At 1,000,000 rows ([measured in three browsers](../concepts/limits.md#measured-in-the-browser) with
`npm run bench:browser`):

- the first table: 1 to 2.5 s
- a filter or a field then: about 0.1 s
- the chart: up to 0.15 s

The timings are in the browser's performance timeline as `pivotkit:encode`, `pivotkit:computePivot`
and `pivotkit:toGrid`.

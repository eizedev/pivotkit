---
title: pivotkit-element reference
description: Every attribute, property and event of the pivotkit-element web component, controlled and uncontrolled use, styles, React and Angular pages, types and bundle size.
---

# `<pivot-report>` reference

[Getting started with the web component](../getting-started/web-component.md) shows the installation
and a first example.

## Entries

| Entry | What |
| --- | --- |
| `pivotkit-element` (`dist/index.js`) | Defines `<pivot-report>`. Exports `PivotReportElement`, `define`, `TAG`, `EVENTS` |
| `pivotkit-element/element` (`dist/element.js`) | The same exports, defines nothing: `define("my-report")` registers another tag name |

`define(name)` does nothing when the name is defined already. So a page that loads the package twice,
with two scripts or two copies, throws no error. The first definition stays. The second copy says so
in a console warning with both versions (`PivotReportElement.version`).

Without `customElements`, as in Node or a server render, importing the package defines nothing and
touches no DOM.

## Loading

With a bundler, run `npm install pivotkit-element`, then write `import "pivotkit-element";` once. The
import defines `<pivot-report>`.

`dist/` holds ES modules. The entry loads the files in `dist/chunks/` by relative URL, so serve the
whole `dist/` directory, not `index.js` alone.

From another origin, such as a CDN, the browser fetches module scripts with CORS. The server must send
`Access-Control-Allow-Origin` for `index.js` and every chunk. Subresource Integrity covers only the
`<script integrity>` of the entry. The chunks it imports later cannot carry a hash. So pin a version in
the URL, or host `dist/` yourself, instead of relying on SRI.

The bundle targets ES2022 in Chrome 111, Firefox 113 and Safari 16.4 or later (`target` in
pivotkit-react's `build.js`). pivotkit does not support older browsers.

## Properties and attributes

| Property | Attribute | Type | Default | What |
| --- | --- | --- | --- | --- |
| `data` |  | `object[]` or `{ columns, types, data }` | `[]` | The rows: an array of objects, or columnar data (one array per column, as pivotkit-core's [`encode`](core.md#columnar-input) takes it, without an object per row). Encoded once per array or object, or once per `dataKey`. |
| `dataKey` |  | `string` or `number` |  | The identity of `data`: a new array with the same key is not encoded again. |
| `view` | `view` (JSON) | view |  | Controlled: the view to show, see below. |
| `defaultView` | `default-view` (JSON) | view | empty | Uncontrolled: the start view, see below. |
| `templates` |  | `{ name?, view?, file?, scope?, deletable? }[]` | `[]` | The templates of the Views menu in two groups by `scope`, "Shared views" and "My views" (without `scope` a `deletable` entry is the user's own). [More](#prop-templates) |
| `saveTemplates` | `save-templates` (boolean) | `boolean` | `false` | Offers "Save current view" (Save as… once a view is loaded) and Save on the user's own views of `templates`. A save is a `pivot-template-save` event with the name to keep, an existing one to replace. It wins over `template-store`. |
| `templateStore` | `template-store` | `"browser"` | off | `"browser"`: the element keeps the user's own views in `localStorage` under `pivotkit:views:<storage-key>`, per data (`source-id`): only this browser and device, lost when the site's data is cleared. At most 100 views. [More](#prop-templatestore) |
| `canPublish` | `can-publish` (boolean) | `boolean` | `false` | Offers "Publish as shared view" on the user's views and Save on a shared view loaded (without it Save is greyed out there: "Shared view: you cannot change it. Use Save as."). Both are a `pivot-template-publish` event. The element only shows what the page allows: the server must check who may save, publish or delete. |
| `fieldDefaults` |  | `{ [field]: { agg?, format?, drillFormat?, order?, label?, description?, href?, type? } }` |  | The aggregator and format a field gets in Values (another aggregator in the value's menu keeps the format while the result is in the field's unit, not for a count). [More](#prop-fielddefaults) |
| `labels` |  | partial labels |  | Texts merged over the language's labels (the keys are in pivotkit-react's `LABELS.en`). |
| `limits` |  | `Partial<Limits>` |  | pivotkit-core's [limits](../concepts/limits.md#limits) for the page's data, as the `limits` prop of pivotkit-react. |
| `locale` | `locale` | `string` | `"en-US"` | Numbers, dates, sorting and the language of the labels (`de-*` is German). Without it the element's own `lang` attribute is used. The page's language is not. A locale the browser has no data for, such as `xx-XX`, takes `en-US` with a warning. |
| `theme` | `theme` | `"auto"` or `"light"` or `"dark"` | `"auto"` | `auto` follows the nearest `data-theme="light"` or `data-theme="dark"` on the element or above it (`<html>`), then `prefers-color-scheme`, and changes with them. |
| `height` | `height` | `number` or `string` | `640` | Pixels (`height="480"`) or a CSS length. `"100%"` fills the element, which then needs a height from the page (`pivot-report { height: 70vh }`). [More](#prop-height) |
| `timeZone` | `time-zone` | `string` | `"UTC"` | The zone `data` is encoded in. See pivotkit-core. |
| `fileName` | `file-name` | `string` | `"pivot"` | Name of exported files, without the extension. The element makes it safe. |
| `label` | `label` | `string` | `labels.report` | The name of the report's region landmark. Give each report on a page its own (`label="Tickets"`). |
| `drillDown` | `drill-down` | `boolean` | `true` | The panel with the rows behind a clicked value. `drill-down="false"` turns it off. The chart's menu keeps **Show the rows**: it sends `pivot-cell-click`. |
| `exportData` | `export-data` | `boolean \| { columns?: string[] }` | `false` | Export → Source data: every row and column of the data as a CSV or JSON file (`pivot-data.csv`), for the user's own analysis or the command line. It also gives the drill-down its copy and download. Set it as a boolean attribute (`<pivot-report export-data>`), or a JSON object for some columns only, which the drill-down's exports keep to as well (`export-data='{"columns":["Region","Revenue"]}'`, or the property). Text it cannot read is off and said once in the console. As the React prop [`exportData`](react.md#prop-exportdata). It holds columns no view places and rows the filters leave out: [Security](../security.md#source-data). |
| `drillDownExport` | `drill-down-export` | `boolean` | `false` | The drill-down's copy and download while `export-data` is off, with every column (`<pivot-report drill-down-export>`). As the React prop [`drillDownExport`](react.md#prop-drilldownexport). |
| `drillDownLimit` | `drill-down-limit` | `number` | `1000` | Rows passed to the panel and to `pivot-cell-click`. The panel's exports hold these rows and say when there are more ("1,000 of 4,212 rows"). |
| `tips` | `tips` | `string` | `"on"` | The tips above the result: `"on"`, `"off"` (none, and no switch in More, Help) or the tip ids allowed, comma-separated (`tips="top,cells"`). The ids are in the [React reference](react.md#tips). |
| `storageKey` | `storage-key` | `string` |  | Remembers dismissed tips and the help switches in `localStorage` under `pivotkit:tips:<key>`. Give each element on a page its own. [More](#prop-storagekey) |
| `dismissedTips` |  | `string[]` |  | Dismissed tip ids from the page's own storage (from `pivot-tip-dismiss`). `"*"`: all tips off. `"-explanations"`: "Show explanations" off. `"-fields"`: the field list collapsed to the rail. The report drops entries of other shapes. |
| `fieldInfo` | `field-info` | `"on"` or `"off"` |  | `"on"` or `"off"` decides the "i" of the field descriptions. Unset, the user's "Show explanations" in More, Help decides. Screen readers keep the descriptions. |
| `zoneInfo` | `zone-info` | `"on"` or `"off"` |  | The same for the "i" next to the zone titles. |
| `settingInfo` | `setting-info` | `"on"` or `"off"` |  | The same for the "i" next to the settings that need explaining ("Show explanations"). |
| `sourceId` | `source-id` | `string` |  | The id of the data shown ("sales"): it goes into the [view files](view-file.md) and links the report shares, and a view made for another source asks before it loads ([Sharing](../concepts/sharing.md#the-source-of-a-view-for-developers)). [More](#prop-sourceid) |
| `sourceName` | `source-name` | `string` |  | The name of the data for people ("Sales 2026"), with `source-id`. |
| `schemaUrl` | `schema-url` | `string` |  | The `$schema` of the view files the report writes: a URL (a self-hosted copy of the schema), `""` for none. Unset: pivotkit's published schema. |
| `grow` | `grow` | `"on"` or `"off"` |  | `"on"`: the report grows past its height to keep the result's least height (the page scrolls). `"off"`: it stays inside and the table scrolls. Unset: `"on"` without a `height` attribute, `"off"` with one. |
| `fieldList` | `field-list` | `"open"` or `"collapsed"` |  | `"open"` or `"collapsed"`: the field list of a wide report open or collapsed to a rail, over the user's stored choice. The user can still change it until the page is loaded again. |
| `zones` | `zones` | `"open"` or `"folded"` |  | The zones' start state: open, or folded to their heading row. Unset: the report's height decides. The user can still fold or open them until the page is loaded again ([Layout](react.md#prop-zones)). |
| `sources` |  | `{ id, name? }[]` |  | The other data the page can show: a view made for one of them offers "Switch to “name” and load", a `pivot-source-switch` event. |
| `chartOptions` |  | `object` |  | Plain JSON merged over the chart's ECharts option. It wins over the view's chart settings. Functions and values that are not JSON are left out ([Charts](../concepts/charts.md#chartoptions-for-developers)). |
| `colorMap` |  | `object` |  | A fixed colour per series or slice name across charts: `{ Failed: "#e3000f", Success: ["#287233", "#4caf50"] }`, one colour or one for light and one for dark. The view's own colours win ([Charts](../concepts/charts.md#fixed-colours)). |
| `shareLink` | `share-link` | `boolean` or `string` | off | "Copy link" and opening shared links: the attribute alone (or `"true"`) links to the page's address without its query, a value is the base URL as it is, `"false"` is off ([Sharing](../concepts/sharing.md)). |
| `persistView` | `persist-view` | `"session"` |  | `"session"` keeps the view for this tab (`sessionStorage`, per `storage-key`). |
| `loading` | `loading` (boolean) | `boolean` | `false` | The page is loading the data: the skeleton before the first data, the result covered on later loads. |
| `allowImport` | `allow-import` (boolean) | `boolean` | `false` | People may load a file into the report in the browser: a **Data** button, a file dropped onto the report, a preview first. Nothing is uploaded. [More](#prop-allowimport) |
| `importLimits` |  | `Partial<Limits>` | `limits` | The limits of a file loaded with `allow-import`, merged key by key over `limits`. The page's data keeps `limits`. As the [`importLimits`](react.md#prop-importlimits) prop. |
| `plugins` |  | `ReaderPlugin[]` |  | Reader plugins for more formats with `allow-import`: [pivotkit-xlsx](plugins.md#pivotkit-xlsx) for Excel. CSV, TSV, text and JSON are built in. |
| `importWorkerUrl` |  | `string \| URL \| null` | `null`: next to the element's code | Where the import worker of `allow-import` (`dist/import-worker.js`) is served, relative to the page and of the page's origin: for an app that bundles the element and serves the file at a path of its own. A URL of another origin is refused (said once in the console), and files are read on the page. [More](#prop-allowimport) |

Properties with an attribute reflect it, as native elements do. `report.theme = "dark"` sets
`theme="dark"`, and `null` removes it.

A boolean attribute is on when it is present. The value `"false"`, in any case, turns it off:
`<pivot-report allow-import="false">` offers no file loading. `export-data` also takes a JSON
object, and `share-link` a URL (see their rows).

Setting a boolean property to `false` removes its attribute. `drill-down` is on by default, so its
attribute becomes `"false"` instead.

The element parses `view` and `default-view` as JSON objects. It ignores a text that is not one and
writes a console warning. Setting the property does not write the attribute.

These are properties only: `data`, `dataKey`, `templates`, `sources`, `labels`, `fieldDefaults`,
`limits`, `importLimits`, `plugins`, `dismissedTips`, `chartOptions`, `colorMap` and `importWorkerUrl`.

A view is user input either way. pivotkit-core normalizes it against the data, and it cannot run code.

The element sets `data-pk-theme="light|dark"` on itself: the theme the report shows. It is an
output. Read it or style with it ([below](#styles)), but do not set it.

A framework may set properties before the element is defined, because it renders before the script
has loaded. The element takes those properties over once it is defined.

The element compares `data` by identity, as React does. It does not encode again rows changed in place
or the same array set again. Set a new array (`report.data = [...rows]`) or a new `dataKey`.

On a phone the report's zones sit above the table, so the default 640 px leaves little room for the
table. Give the element more height on narrow screens. The
[example](https://github.com/eizedev/pivotkit/tree/main/examples/element) uses `height="100%"` and
`@media (max-width: 639px) { pivot-report { height: calc(100svh - 24px); } }`. The page scrolls to the
report, and the table scrolls inside it.

## Properties in detail

This section describes in full the properties whose line in the table ends in "More".

### `templates` { #prop-templates }

Type: `{ name?, view?, file?, scope?, deletable? }[]`; default: `[]`.

The templates of the Views menu, in two groups by `scope`: "Shared views" and "My views". Without
`scope`, a `deletable` entry is the user's own. Each template holds a `view` or a view file in
`file`. The empty state also offers the first three. See [Templates and shared
views](../concepts/templates.md).

### `templateStore` { #prop-templatestore }

Attribute: `template-store`. Type: `"browser"`; default: off.

With `"browser"`, the element keeps the user's own views in `localStorage` under
`pivotkit:views:<storage-key>`, per data (`source-id`):

- The views stay in this browser on this device only.
- They are lost when the site's data is cleared.
- The store holds at most 100 views.

The element sends no event for the store's saves and deletes.

### `fieldDefaults` { #prop-fielddefaults }

Type: `{ [field]: { agg?, format?, drillFormat?, order?, label?, description?, href?, type? } }`.

Per field, these keys set:

- `agg` and `format`: the aggregator and format the field gets in Values. Another aggregator in the
  value's menu keeps the format while the result is in the field's unit. A count does not keep it.
- `drillFormat`: the format of its values in the drill-down, else `format`. `"text"` shows an
  identifier as it is.
- `order`: the field's custom order of items on Rows or Columns, also in a view without a sort entry
  for it. Its menu offers it as "Custom order" and "Custom order, reversed".
- `label`, `description`, `href` and `type`: the field's display name, its description behind an
  "i", a "Learn more" link (https) and its column type. See [Field descriptions and
  names](../concepts/fields.md).

Some number fields are identifiers. The report counts them and shows them as they are. This applies
to a field with whole numbers named ID, …Id, …_id, Nr, No, Number, Key or #, when none of `agg`,
`format` and `drillFormat` is set. See [Identifier fields](../concepts/fields.md#identifier-fields).

### `height` { #prop-height }

Attribute: `height`. Type: `number` or `string`; default: `640`.

Pixels (`height="480"`) or a CSS length. `"100%"` fills the element, which then needs a height from
the page (`pivot-report { height: 70vh }`). When the height is lower than the report needs, the
report grows ([layout](react.md#layout)).

### `storageKey` { #prop-storagekey }

Attribute: `storage-key`. Type: `string`.

Remembers dismissed tips and the help switches in `localStorage` under `pivotkit:tips:<key>`. Give
each element on a page its own key. Without it, dismissed tips and the help switches last only until the
page is loaded again.

- With `template-store="browser"`, the element also keeps the user's own views under
  `pivotkit:views:<key>`.
- With `allow-import`, a loaded file survives when you take the element out of the page and put it
  back. The element keeps it under this key, in memory only.

### `sourceId` { #prop-sourceid }

Attribute: `source-id`. Type: `string`.

The id of the data shown, such as "sales". It goes into the [view files](view-file.md) and links the
report shares. A view made for another source asks before it loads
([Sharing](../concepts/sharing.md#the-source-of-a-view-for-developers)).

### `allowImport` { #prop-allowimport }

Attribute: `allow-import`. Type: `boolean`; default: `false`.

People may load a CSV, TSV, text or JSON file into the report. With `plugins`, other formats work
too. The report offers:

- a **Data** button with the data source and **Load data…**
- dropping a file onto the report
- a preview before the data is replaced

The browser reads the file, and nothing is uploaded. Undo and "Back to original data" bring the
page's data back.

Each change of the data shown is a `pivot-data-load` event. While a file's data is shown, its source
id is the file's name and a hash of its name and columns ([How a loaded file is
named](import.md#how-a-loaded-file-is-named)). So `template-store="browser"` keeps views per file.

An element with a `storage-key` can be taken out of the page and put back. Its React root unmounts
once it stays out past the task. When it comes back with the same data, it shows the loaded file again
with its view and its undo steps. This also works when it happens twice in a row. The element keeps
this in the page's memory only, as the React prop does.

The behaviour is described in [Load your own data](../use/load-data.md) and for the React prop
[`allowImport`](react.md#prop-allowimport).

```html
<pivot-report allow-import source-id="sales" source-name="Sales"></pivot-report>
<script type="module">
    import xlsxReader from "/assets/pivotkit-xlsx/dist/index.js";   // Excel workbooks, optional
    const report = document.querySelector("pivot-report");
    report.data = rows;
    report.plugins = [xlsxReader];
    report.importLimits = { rows: 200_000 };   // files people load; the page's rows keep report.limits
    report.addEventListener("pivot-data-load", (e) => {
        if (e.detail.cause === "load" && e.detail.rows > 200_000) e.preventDefault();
    });
</script>
```

#### The import worker { #the-import-worker }

The element reads CSV and JSON files in a worker of its own, `dist/import-worker.js`. It holds
pivotkit-core's readers in one file, about 10 KiB gzip. The element starts it from its chunk by
relative URL, so serve it with `dist/`.

The worker is a file of the page's origin, never a `blob:` URL. So `script-src 'self'` (or
`worker-src`) allows it. Where the worker cannot start, the element reads on the page. Firefox and
WebKit then log the failed worker in the console.

The element resolves `../import-worker.js` against the URL of the file its code is in
(`import.meta.url`). In `dist/`, that file is a chunk in `dist/chunks/`, so the worker is
`dist/import-worker.js`.

An app that bundles the element serves the worker where that URL points, seen from the app's own file
that holds the element's code. That place depends on the bundler's output layout. For Angular's flat
output it is the site's root, and `angular.json` copies the file as an asset:
[Angular](../getting-started/web-component.md#angular).

An app may serve the worker at a path of its own, for example under a base href such as `/reports/`.
It then sets the property `importWorkerUrl` to that URL, relative to the page
(`report.importWorkerUrl = "assets/import-worker.js"`). It is a property only, and the element reads
it when it reads a file. The URL must be of the page's origin, as for every module worker. The element
refuses another origin, says so once in the console and reads the file on the page.

The import UI is the load group "import". The element loads it on first use ([Bundle
size](#bundle-size)).

## Controlled and uncontrolled

As with `<PivotReport>`:

- Uncontrolled (no `view`): the report starts on `defaultView` and keeps the view itself. Every
  change is a `pivot-view-change` event.
    - Setting a different `defaultView`, compared by value, starts the report again on it. The undo
      history starts anew, and Reset points there.
    - The same view again changes nothing. Neither does the view the report last reported. So a page
      that stores every `pivot-view-change` and binds it as `defaultView` (`[defaultView]="stored"`)
      keeps the report and its undo history.
    - Feed the view back unchanged and before the next change. An older view, from a debounced or
      asynchronous store, counts as a new start view and starts the report again.

    This way a framework that sets properties after the element is in the page, such as React 18 or
    Angular, still gets its start view.

- Controlled (`view` set): the report shows that view. A change is a `pivot-view-change` event.
  The report shows the change only when the page sets `view = event.detail.view`. If the page does not
  set it, the report stays on its view.
    - A view the page sets on its own becomes one undo step.
    - `view = undefined` makes the report uncontrolled again. Switching back and forth is not meant for
      normal use.

The report shows a warning above the result for each part of the page's `view` or `defaultView` that
the data cannot use. It shows it once per distinct view, as `<PivotReport>` does
([controlled and uncontrolled](react.md#controlled-and-uncontrolled)).

Undo and redo always stay inside the element. When you remove the element from the page, its React
root unmounts in a microtask. So a move in the same task, such as `parent.append(el)`, keeps the
report and its history. When the element is connected again, it mounts a new report. That report
starts on the last view the element showed, with a new history.

## Events

Every event is a `CustomEvent` that bubbles and is composed. A listener on the element, on a parent
or on the document gets it, with `event.target` the element.

Every other script on the page gets it too. The details carry the view. For `pivot-cell-click` they
also carry the page's own row objects behind the cell. If some scripts of a page must not read the
data it shows, keep those scripts off the page, as you would for the data itself.

| Event | What |
| --- | --- |
| `pivot-view-change` | Every change of the view, normalized.<br><small>`detail`: `{ view }`</small> |
| `pivot-cell-click` | A click (or Enter) on a value, or **Show the rows** or a double click on a chart point: key paths, the value, the number of source rows and the first `drillDownLimit` of them (the page's own row objects).<br><small>`detail`: `{ row, col, value, valueIndex, text, count, rows }`</small> |
| `pivot-template-save` | "Save current view", Save as… and Save of a user's view (with `save-templates`). `scope` is `"user"`. The name may exist: replace that view (an upsert by name).<br><small>`detail`: `{ name, view, scope, source, respondWith }`. `source` the data shown, `{ id, name, params }` (a loaded workbook's sheet in `params.sheet`), or `null`</small> |
| `pivot-template-delete` | Delete of a template marked `deletable`, after the user confirmed in the menu. `scope` is its group (`"shared"` or `"user"`). Not sent for a view of the browser store.<br><small>`detail`: `{ name, scope, respondWith }`</small> |
| `pivot-template-publish` | "Publish as shared view" on one of the user's views, or Save on a shared view (with `can-publish`), after the user confirmed: add it to the shared views, or replace the one of that name, and set `templates`.<br><small>`detail`: `{ name, view, source, respondWith }`. `source` the data the view was made for: the data shown, as for `pivot-template-save`, for a view that names no data of its own. The data a view file or a view of the browser store names (its `id`, `params.sheet`, and `name` when it is the data shown)</small> |
| `pivot-export` | Every exported file before its download and every copy before it goes on the clipboard. Cancelable. [More](#event-pivot-export)<br><small>`detail`: `{ kind, fileName, blob, text, rows }`</small> |
| `pivot-tip-dismiss` | A tip dismissed (`id`), all tips switched off (`id` `"*"`) or back on (`id` `null`), the field list collapsed or opened (`id` `null`), with every dismissed id, for a page that stores them itself and sets `dismissedTips`.<br><small>`detail`: `{ id, dismissed }`</small> |
| `pivot-source-switch` | "Switch to “name” and load" for a view made for one of `sources`: show that data with `view` as its start view. [More](#event-pivot-source-switch)<br><small>`detail`: `{ source, view, name }`</small> |
| `pivot-data-load` | The data shown changed (with `allow-import`): a file loaded (cancelable), the page's data again, one of those undone or redone, or the file shown again after the element was put back. [More](#event-pivot-data-load)<br><small>`detail`: `{ cause, source, file, sheet, rows, columns, notes }`</small> |

The template events wait for the page's answer. Call `event.detail.respondWith(promise)` in the
listener itself. A later call throws `InvalidStateError`.

- When the promise resolves, the report shows "Saved" or "Published", or removes the entry.
- When it rejects, the report shows an error with its message. A rejection without a message shows
  "The server could not save the view." (`labels.toastSaveRejected`).
- Without `respondWith`, the action counts as done at once. This happens with no listener, or with
  `respondWith` after an `await`. The element then logs a console warning, since the user is told
  "saved", "deleted" or "published" either way.

The page then sets `templates` to the new list.

When a listener of `pivot-export` calls `preventDefault()`, the report shows no "Exported" or
"Copied" note. The page kept the file or the text, so it says itself what became of it.

```js
report.saveTemplates = true;
report.addEventListener("pivot-template-save", (e) => {
    e.detail.respondWith(
        fetch("/api/templates", { method: "POST", body: JSON.stringify({ name: e.detail.name, view: e.detail.view }) })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
            .then((list) => (report.templates = list))
    );
});
```

## Events in detail

This section describes in full the events whose line in the table ends in "More".

### `pivot-export` { #event-pivot-export }

`detail`: `{ kind, fileName, blob, text, rows }`.

Sent for every exported file before its download, and for every copy before it goes on the
clipboard. `kind` is one of these:

- `"xlsx"`, `"csv"`, `"html"`, `"png"`, `"svg"`
- `"json"`: the view file of "Download view"
- `"data-csv"` and `"data-json"`: Source data (with `export-data`)
- `"print"`: the HTML report before the print dialog opens. `preventDefault()` prints nothing.
- `"copy-table"` and `"copy-json"`: the copies Export, Copy table and Copy data as JSON
- `"copy-chart"`: Export, Copy chart image, with the PNG before it goes on the clipboard
- `"drill-copy"`, `"drill-json"`, `"drill-csv"` and `"drill-xlsx"`: the drill-down panel's exports

A copy also has its `text` and the `fileName` it would have as a file (`pivot.tsv`). A drill-down
export has `rows: { shown, count }`.

The event is cancelable. `preventDefault()` skips the download or the copy, and the page keeps the
blob, for example to upload it.

The element does not send it for the table's exports of an empty report, where no field is placed.
Those exports are greyed out ("Add a field first."). Source data stays while the data have rows.
Without rows, the element turns it off too and says "The data has no rows yet."

### `pivot-source-switch` { #event-pivot-source-switch }

`detail`: `{ source, view, name }`.

Sent for "Switch to “name” and load" on a view made for one of `sources`. Show that data and set
`defaultView` to `view`. `view` is as the file has it, not normalized. Switching starts the report
anew, and Undo begins there.

The view is untrusted input like any loaded view, since it comes from a file or a link. Hand it only
to a report as its start view, which normalizes it. Never run or render anything from it.

### `pivot-data-load` { #event-pivot-data-load }

`detail`: `{ cause, source, file, sheet, rows, columns, notes }`.

`cause` says what changed:

- `"load"`: a file, sent before the report shows it. `preventDefault()` refuses it and the data stays.
  Only `"load"` is cancelable. It is also sent for another sheet of the workbook shown that a saved
  view opened. If you refuse that, the view is not opened and a note says so.
- `"original"`: "Back to original data" shows the page's data.
- `"undo"` and `"redo"`: one of those steps is undone or redone.
- `"restore"`: an element with `storage-key` is put back into the page and shows the file it had.

The other keys describe the data shown now:

- `source`: its `{ id, name }`. That is the file's, or the element's `source-id` and `source-name`.
- `file`: its `{ name, size, type }`, or `null` for the page's data.
- `sheet`: a workbook's sheet.
- `rows` and `columns` (`[{ name, type }]`): what it holds.
- `notes`: the readers' notes for `"load"` ([codes](import.md#the-table)).

Names and notes come from the file. Show them as text, never as HTML.

## Styles

The report's stylesheet lives in the shadow root. No CSS of the page reaches into the report, and
none of the report's reaches out. What crosses is what crosses every shadow root:

- inherited properties: the font family and size the report inherits through the element, and
  `color-scheme`
- the `--pk-*` custom properties set **on the element**

Every token is declared on the element's `:host`. So a `--pk-*` set higher up the page, such as on
`body`, does not reach the report. A rule of the page on the element wins over the defaults:

```css
pivot-report {
    --pk-accent: #0a7d5a;
    --pk-radius: 4px;
    --pk-font: "Inter", sans-serif;
}
pivot-report[data-pk-theme="dark"] {
    --pk-surface: #101418;
}
```

The [theming page](theming.md) lists the tokens and their defaults. There are no `::part()` names.
The tokens are the styling interface.

The styles reach the shadow root as one constructed stylesheet that every element of the document
shares (`adoptedStyleSheets`). Where a browser has none, or refuses one, the element adds a `<style>`
element to its shadow root instead. A browser test covers this. An element moved into another
document, such as an iframe, after it was created keeps what it had. That case is not tested.

Where the browser has the Popover API, menus, bottom sheets and popups open in the browser's top layer
(`popover="manual"`):

- They sit above the page's own layout, whatever its z-indexes.
- They are placed against the window, whatever the element's ancestors (a `transform`, a `filter`,
  `contain`).
- They stay in the shadow root, so its styles and the tokens set on the element apply
  ([popovers above the page](theming.md#popovers-above-the-page)).

Without the API they are `position: fixed` in the report's layer, stacked by `--pk-layer-z`. Inside
an ancestor with a `transform`, a `filter` or `contain`, the browser places fixed elements relative
to that ancestor. The report handles this case:

- It measures the ancestor's origin and still places them at their button. A browser test with a
  transformed wrapper covers this.
- The field drawer and the drill-down are part of the report's box.

The narrow layout's bottom sheets cover that ancestor, not the window.

The report does not correct the drag preview, which is also `position: fixed`, inside such an
ancestor, and this is not tested. It does not correct a scaled ancestor (`scale()`) either.

## Escape and the host page

While a popover, the drill-down or the narrow field drawer of the report is open, the report listens
for Escape on the whole `document`. It closes only its newest layer, also when the focus is outside
the element, for example on the host page. It calls `preventDefault()` on that Escape. It leaves an
Escape alone that is `defaultPrevented` already.

If your page opens a dialog of its own while a report layer is open, do one of these:

- Handle Escape in the dialog's own `keydown` listener, which runs before the document's, and call
  `preventDefault()`.
- Close the report's layer first.

[Keyboard and screen readers](../use/keyboard.md) lists the keys of the report itself.

## React on the page

The element's React is private to the bundle. It sets no global. A page with a React of its own,
another version or the same, does not affect the element, and the element does not affect it.

The browser tests run a page with its own React that renders `<pivot-report>` in its tree and
renders again every 200 ms. The page uses React 18, and React 19 in the React 19 job.

Each element has its own React root. The elements of a page share one copy of the bundle. A React page
can use pivotkit-react directly and save the second React.

React 18 passes only attributes to a custom element. Set `data` and the other objects in a ref
(`useEffect(() => { ref.current.data = rows; }, [rows])`) and add listeners there. React 19 sets a
prop as a property when the element has one. It listens for a custom event with `on` and the event's
exact name (react.dev, "Custom HTML elements"):

```jsx
// React 19
<pivot-report data={rows} defaultView={start} theme="auto" onpivot-view-change={(e) => save(e.detail.view)} />
```

The test page uses the ref in the React 18 job and these props in the React 19 job. It checks that
`data` arrives as a property.

For TypeScript, write `import type {} from "pivotkit-element/jsx";` once. It declares
`<pivot-report>` with its properties and `on<event>` props in React's JSX. It needs `@types/react`
18.3 or later. The types describe React 19's behaviour.

## Angular and zone.js

[Getting started](../getting-started/web-component.md#angular) has the Angular example: a zoneless
Angular 22 app in `examples/angular/`, which CI builds and tests.

`[data]="rows"` sets the property, since Angular binds properties of an element with the schema. A new
array is a new data set. For the controlled form, bind `[view]="view"` and set `this.view` in the
handler. You may bind the stored view back as `[defaultView]`: the element ignores the view it
reported itself.

Change detection: the element runs React's scheduler, ECharts' pointer listeners and animation
frames in whatever zone created it. A zoneless app, like the example, runs change detection only for
its own bindings, signals and event handlers. Inside Angular's zone (zone.js), each of them may
trigger change detection of the app. This is not measured, since the example is zoneless. If it
shows, create and feed the element outside the zone, and come back in for the app's own state:

```ts
constructor(private zone: NgZone, private host: ElementRef<HTMLElement>) {}

ngAfterViewInit() {
    this.zone.runOutsideAngular(() => {
        const report = document.createElement("pivot-report");
        report.data = this.rows;
        report.addEventListener("pivot-view-change", (e) => this.zone.run(() => this.onView(e)));
        this.host.nativeElement.append(report);
    });
}
```

## Types

`types/` holds the declarations:

- `PivotReportElement` with its properties
- the event map, `PivotReportEventMap`
- the DOM's maps

So `document.createElement("pivot-report")` is a `PivotReportElement`.
`addEventListener("pivot-view-change", (e) => e.detail.view)` knows the detail, on the element and on
the document.

The view type is a structural `PivotView`. The full one is pivotkit-core's `View`.
pivotkit-react's type has the same name and role: a view as a host passes it. The two differ in how
much they check:

- The element's `PivotView` types `rows`, `cols` and `values`, and lets any other key through.
- pivotkit-react's `PivotView` types every key of a view, each part optional. Its old name
  `ViewInput` is deprecated ([PK-DEP-0001](../versioning.md#register)).
- A view typed with the element's `PivotView` may not fit the React one, whose `agg` is one of the
  aggregator names. Pass it through pivotkit-core's `normalize()` first, or cast it.

`pivotkit-element/jsx`, types only, adds the element to React's JSX ([above](#react-on-the-page)).

## Bundle size

The table shows what a page loads. `npm run size -w pivotkit-element` measured it on 2026-11-21,
with an official Node 24 build, esbuild 0.28.2 and gzip level 9 per file. Sizes add up per group.
They are approximate and change with every dependency update.

CI runs the same command on Node 24 and measures the same numbers. It fails when a group is over
`SIZE_BUDGET_KIB` in `build.js`:

- The first load's budget is 182 KiB. It is a hard line: a feature that needs room there makes it by
  moving something out of the first load.
- The budgets of the groups loaded later leave a little room above what CI measures.
- A Node with the system's zlib, such as Homebrew's, measures other sizes. The command says so.

| Loaded | Files | Size | gzip |
| --- | ---: | ---: | ---: |
| First (`index.js` and its static imports: React, ReactDOM, pivotkit-react, pivotkit-core, @dnd-kit, the styles the first render uses) | 12 | 543 KiB | 181.6 KiB |
| Before the first render of a German report only (the German texts of the first render) | 1 | 17 KiB | 5.9 KiB |
| Right after the first render (the tips' table) | 1 | 4 KiB | 1.6 KiB |
| On the first chart (ECharts with bar, line, pie (also the donut), heatmap, treemap, the components they use, the title, the zoom slider, the reference lines' markLine and the high and low points' markPoint among them, the canvas renderer, pivotkit-core's ECharts option and the layout of the chart's labels) | 2 | 752 KiB | 259 KiB |
| On the first export or copy (pivotkit-core's export, and fflate as a chunk it shares with the link; the Export menu and the drill-down's start loading it when they open) | 3 | 28 KiB | 12 KiB |
| On the first shared link, Copy link or loaded link (pivotkit-core's link with fflate) | 2 | 15 KiB | 7 KiB |
| Right after the first render (the menus' panels with their levels, the Filter level with its summary, quick choices, items and rules, the Export menu, the drill-down's panel and its table, sharing's copy, download and load, the English texts and the style rules only they use) | 2 | 183 KiB | 58.9 KiB |
| With the menus, for a German report only (the menus' German texts) | 1 | 22 KiB | 8 KiB |
| When a view has unused parts (their plain words: English, and German for a German report) | 2 | 17 KiB | 6 KiB |
| With `allow-import`, on the first use of the Data menu, a drop or the empty report's Load data… (the import UI with its English and German texts, pivotkit-core's readers) | 6 | 57 KiB | 22.7 KiB |
| With `allow-import`, the worker of a CSV or JSON file (`dist/import-worker.js`, one file) | 1 | 27 KiB | 11 KiB |

A page that copies `dist/` by hand deploys all of it, `dist/chunks/` included:

- Without `dist/chunks/labels-de-*.js`, a German report waits 4 seconds, then shows in English.
- Without `dist/chunks/tips-*.js`, the report shows no tips. The notices that the result is cut or
  empty are in the first load and still show.
- Both say so in the console.

The element bundles ECharts instead of leaving it to the page. A page without a bundler or an import
map would have no way to provide it. Loading it on first use keeps it out of the first load.

The chunk holds only the five chart types the report draws. pivotkit-react's `echarts.js` imports
them by name, and `test/build.test.js` checks the chunk against it.

A page that already has ECharts loads it twice. If a page needs a single copy, use
[pivotkit-react](react.md) with its own React instead.

## Content-Security-Policy

The element works under a strict policy without `'unsafe-inline'` or `'unsafe-eval'`.
[Security](../security.md#content-security-policy) shows what was measured.

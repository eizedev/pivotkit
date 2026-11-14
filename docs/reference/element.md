---
title: pivotkit-element reference
description: Every attribute, property and event of the pivotkit-element web component, controlled and uncontrolled use, styles, React and Angular pages, types and bundle size.
---

# `<pivot-report>` reference

Installation and a first example are in
[Getting started with the web component](../getting-started/web-component.md).

## Entries

| Entry | What |
| --- | --- |
| `pivotkit-element` (`dist/index.js`) | Defines `<pivot-report>`; exports `PivotReportElement`, `define`, `TAG`, `EVENTS` |
| `pivotkit-element/element` (`dist/element.js`) | The same exports, defines nothing: `define("my-report")` registers another tag name |

`define(name)` does nothing when the name is defined already, so a page that loads the package twice
(two scripts, two copies) throws no error; the first definition stays, and the second copy says so in
a console warning with both versions (`PivotReportElement.version`). Without `customElements`
(Node, a server render) importing the package defines nothing and touches no DOM.

## Loading

With a bundler: `npm install pivotkit-element`, then `import "pivotkit-element";` once (it defines
`<pivot-report>`). `dist/` is ES modules; the files in `dist/chunks/` are loaded by relative URL
from the entry, so serve the whole `dist/` directory, not `index.js` alone.

From another origin (a CDN), module scripts are fetched with CORS: the server must send
`Access-Control-Allow-Origin` for `index.js` and every chunk. Subresource Integrity covers only the
`<script integrity>` of the entry; the chunks it imports later cannot carry a hash, so pin a version in
the URL (or host `dist/` yourself) instead of relying on SRI. The bundle targets ES2022 in Chrome 111,
Firefox 113 and Safari 16.4 or later (`target` in pivotkit-react's `build.js`); older browsers are not
supported.

## Properties and attributes

| Property | Attribute | Type | Default | What |
| --- | --- | --- | --- | --- |
| `data` |  | `object[]` or `{ columns, types, data }` | `[]` | The rows: an array of objects, or columnar data (one array per column, as pivotkit-core's [`encode`](core.md#columnar-input) takes it, without an object per row). Encoded once per array or object, or once per `dataKey`. |
| `dataKey` |  | `string` or `number` |  | The identity of `data`: a new array with the same key is not encoded again. |
| `view` | `view` (JSON) | view |  | Controlled: the view to show, see below. |
| `defaultView` | `default-view` (JSON) | view | empty | Uncontrolled: the start view, see below. |
| `templates` |  | `{ name?, view?, file?, scope?, deletable? }[]` | `[]` | The templates of the Views menu in two groups by `scope`, "Shared views" and "My views" (without `scope` a `deletable` entry is the user's own). [More](#prop-templates) |
| `saveTemplates` | `save-templates` (boolean) | `boolean` | `false` | Offers "Save current view" (Save as… once a view is loaded) and Save on the user's own views of `templates`; a save is a `pivot-template-save` event with the name to keep, an existing one to replace. It wins over `template-store`. |
| `templateStore` | `template-store` | `"browser"` | off | `"browser"`: the element keeps the user's own views in `localStorage` under `pivotkit:views:<storage-key>`, per data (`source-id`): only this browser and device, lost when the site's data is cleared; at most 100 views. [More](#prop-templatestore) |
| `canPublish` | `can-publish` (boolean) | `boolean` | `false` | Offers "Publish as shared view" on the user's views and Save on a shared view loaded (without it Save is greyed out there: "Shared view: you cannot change it. Use Save as."); both are a `pivot-template-publish` event. The element only shows what the page allows: the server must check who may save, publish or delete. |
| `fieldDefaults` |  | `{ [field]: { agg?, format?, drillFormat?, order?, label?, description?, href?, type? } }` |  | The aggregator and format a field gets in Values (another aggregator in the value's menu keeps the format while the result is in the field's unit, not for a count). [More](#prop-fielddefaults) |
| `labels` |  | partial labels |  | Texts merged over the language's labels (the keys are in pivotkit-react's `LABELS.en`). |
| `limits` |  | `Partial<Limits>` |  | pivotkit-core's [limits](../concepts/limits.md#limits) for the page's data, as the `limits` prop of pivotkit-react. |
| `locale` | `locale` | `string` | `"en-US"` | Numbers, dates, sorting and the language of the labels (`de-*` is German). Without it the element's own `lang` attribute is used; the page's language is not. |
| `theme` | `theme` | `"auto"` or `"light"` or `"dark"` | `"auto"` | `auto` follows the nearest `data-theme="light"` or `data-theme="dark"` on the element or above it (`<html>`), then `prefers-color-scheme`, and changes with them. |
| `height` | `height` | `number` or `string` | `640` | Pixels (`height="480"`) or a CSS length; `"100%"` fills the element, which then needs a height from the page (`pivot-report { height: 70vh }`). [More](#prop-height) |
| `timeZone` | `time-zone` | `string` | `"UTC"` | The zone `data` is encoded in; see pivotkit-core. |
| `fileName` | `file-name` | `string` | `"pivot"` | Name of exported files, without the extension; made safe. |
| `label` | `label` | `string` | `labels.report` | The name of the report's region landmark; give each report on a page its own (`label="Tickets"`). |
| `drillDown` | `drill-down` | `boolean` | `true` | The panel with the rows behind a clicked value; `drill-down="false"` turns it off. |
| `exportData` | `export-data` | `boolean` | `false` | Export → Source data: every row and column of the data as a CSV or JSON file (`pivot-data.csv`), for the user's own analysis or the command line; a boolean attribute (`<pivot-report export-data>`). It holds columns no view places and rows the filters leave out: [Security](../security.md#source-data). |
| `drillDownLimit` | `drill-down-limit` | `number` | `1000` | Rows passed to the panel and to `pivot-cell-click`; the panel's exports hold these rows and say when there are more ("1,000 of 4,212 rows"). |
| `tips` | `tips` | `string` | `"on"` | The tips above the result: `"on"`, `"off"` (none, and no switch in Options) or the tip ids allowed, comma-separated (`tips="top,cells"`); the ids are in the [React reference](react.md#tips). |
| `storageKey` | `storage-key` | `string` |  | Remembers dismissed tips and the help switches in `localStorage` under `pivotkit:tips:<key>`; give each element on a page its own. [More](#prop-storagekey) |
| `dismissedTips` |  | `string[]` |  | Dismissed tip ids from the page's own storage (from `pivot-tip-dismiss`); `"*"`: all tips off; `"-explanations"`: "Show explanations" off; `"open:<section>"`, `"closed:<section>"`: a menu section opened or folded. |
| `fieldInfo` | `field-info` | `"on"` or `"off"` |  | `"on"` or `"off"` decides the "i" of the field descriptions; unset, the user's "Show explanations" in Options, Help decides. Screen readers keep the descriptions. |
| `zoneInfo` | `zone-info` | `"on"` or `"off"` |  | The same for the "i" next to the zone titles. |
| `settingInfo` | `setting-info` | `"on"` or `"off"` |  | The same for the "i" next to the settings that need explaining ("Show explanations"). |
| `sourceId` | `source-id` | `string` |  | The id of the data shown ("sales"): it goes into the [view files](view-file.md) and links the report shares, and a view made for another source asks before it loads ([Sharing](../concepts/sharing.md#the-source-of-a-view-for-developers)). [More](#prop-sourceid) |
| `sourceName` | `source-name` | `string` |  | The name of the data for people ("Sales 2026"), with `source-id`. |
| `schemaUrl` | `schema-url` | `string` |  | The `$schema` of the view files the report writes: a URL (a self-hosted copy of the schema), `""` for none; unset, pivotkit's published schema. |
| `grow` | `grow` | `"on"` or `"off"` |  | `"on"`: the report grows past its height to keep the result's least height (the page scrolls); `"off"`: it stays inside and the table scrolls. Unset: `"on"` without a `height` attribute, `"off"` with one. |
| `fieldList` | `field-list` | `"open"` or `"collapsed"` |  | `"open"` or `"collapsed"`: the field list of a wide report open or collapsed to a rail, over the user's stored choice; the user can still change it until the page is loaded again. |
| `sources` |  | `{ id, name? }[]` |  | The other data the page can show: a view made for one of them offers "Switch to “name” and load", a `pivot-source-switch` event. |
| `chartOptions` |  | `object` |  | Plain JSON merged over the chart's ECharts option; it wins over the view's chart settings; functions and values that are not JSON are left out ([Charts](../concepts/charts.md#chartoptions-for-developers)). |
| `shareLink` | `share-link` | `boolean` or `string` | off | "Copy link" and opening shared links: the attribute alone (or `"true"`) links to the page's address without its query, a value is the base URL as it is, `"false"` is off ([Sharing](../concepts/sharing.md)). |
| `persistView` | `persist-view` | `"session"` |  | `"session"` keeps the view for this tab (`sessionStorage`, per `storage-key`). |
| `loading` | `loading` (boolean) | `boolean` | `false` | The page is loading the data: the skeleton before the first data, the result covered on later loads. |
| `allowImport` | `allow-import` (boolean) | `boolean` | `false` | People may load a file into the report in the browser: a **Data** button, a file dropped onto the report, a preview first; nothing is uploaded. [More](#prop-allowimport) |
| `importLimits` |  | `Partial<Limits>` | `limits` | The limits of a file loaded with `allow-import`, merged key by key over `limits`; the page's data keeps `limits`. As the [`importLimits`](react.md#prop-importlimits) prop. |
| `plugins` |  | `ReaderPlugin[]` |  | Reader plugins for more formats with `allow-import`: [pivotkit-xlsx](plugins.md#pivotkit-xlsx) for Excel. CSV, TSV, text and JSON are built in. |

Properties with an attribute reflect it, as native elements do: `report.theme = "dark"` sets
`theme="dark"`, `null` removes it. `view` and `default-view` are parsed as JSON objects (a text that
is not one is ignored with a console warning); setting the property does not write the attribute.
Data, templates, sources, labels, field defaults, limits, import limits, plugins and dismissed tips are properties only. A view is user input either
way: pivotkit-core normalizes it against the data and it cannot run code.

The element sets `data-pk-theme="light|dark"` on itself, the theme the report shows. It is an
output: read it or style with it (below), do not set it.

Properties set before the element is defined (a framework that renders before the script has
loaded) are taken over when it is.

`data` is compared by identity, as in React: rows changed in place and the same array set again
are not encoded again. Set a new array (`report.data = [...rows]`), or a new `dataKey`.

On a phone the report's zones sit above the table, so the default 640 px leaves little room for it.
Give the element more height on narrow screens, for example `height="100%"` and
`@media (max-width: 639px) { pivot-report { height: calc(100svh - 24px); } }`, as the
[example](https://github.com/eizedev/pivotkit/tree/main/examples/element) does: the page scrolls to the report, the table scrolls inside it.

## Properties in detail

The properties whose line in the table ends in "More", in full.

### `templates` { #prop-templates }

Type: `{ name?, view?, file?, scope?, deletable? }[]`; default: `[]`.

The templates of the Views menu in two groups by `scope`, "Shared views" and "My views" (without `scope` a `deletable` entry is the user's own); a `view` or a view file in `file`; the first three are also offered in the empty state. See [Templates and shared views](../concepts/templates.md).

### `templateStore` { #prop-templatestore }

Attribute: `template-store`. Type: `"browser"`; default: off.

`"browser"`: the element keeps the user's own views in `localStorage` under `pivotkit:views:<storage-key>`, per data (`source-id`): only this browser and device, lost when the site's data is cleared; at most 100 views. No event is sent for its saves and deletes.

### `fieldDefaults` { #prop-fielddefaults }

Type: `{ [field]: { agg?, format?, drillFormat?, order?, label?, description?, href?, type? } }`.

The aggregator and format a field gets in Values (another aggregator in the value's menu keeps the format while the result is in the field's unit, not for a count); `drillFormat` (else `format`) for its values in the drill-down (`"text"`: an identifier as it is); `order`: the field's custom order of items on Rows or Columns (also in a view without a sort entry for it), offered as "Custom order" and "Custom order, reversed" in its menu; `label`, `description`, `href` and `type`: the field's display name, its description behind an "i", a "Learn more" link (https) and its column type, see [Field descriptions and names](../concepts/fields.md). A number field named ID, …Id, …_id, Nr, No, Number, Key or # with whole numbers, for which none of `agg`, `format` and `drillFormat` is set, is counted and shown as it is: [Identifier fields](../concepts/fields.md#identifier-fields).

### `height` { #prop-height }

Attribute: `height`. Type: `number` or `string`; default: `640`.

Pixels (`height="480"`) or a CSS length; `"100%"` fills the element, which then needs a height from the page (`pivot-report { height: 70vh }`). A height lower than the report needs lets it grow ([layout](react.md#layout)).

### `storageKey` { #prop-storagekey }

Attribute: `storage-key`. Type: `string`.

Remembers dismissed tips and the help switches in `localStorage` under `pivotkit:tips:<key>`; give each element on a page its own. Without it they stay dismissed until the page is loaded again. With `template-store="browser"` the user's own views are kept under `pivotkit:views:<key>` too. With `allow-import` a loaded file survives taking the element out of the page and putting it back under this key (in memory only).

### `sourceId` { #prop-sourceid }

Attribute: `source-id`. Type: `string`.

The id of the data shown ("sales"): it goes into the [view files](view-file.md) and links the report shares, and a view made for another source asks before it loads ([Sharing](../concepts/sharing.md#the-source-of-a-view-for-developers)).

### `allowImport` { #prop-allowimport }

Attribute: `allow-import`. Type: `boolean`; default: `false`.

People may load a CSV, TSV, text or JSON file (and with `plugins` other formats) into the report: a
**Data** button with the data source and **Load data…**, a file dropped onto the report, a preview
before the data is replaced. Read in the browser, nothing is uploaded; Undo and "Back to original
data" bring the page's data back. Each change of the data shown is a `pivot-data-load` event; while a
file's data is shown its source id is the file's name and a hash of its name and columns
([How a loaded file is named](import.md#how-a-loaded-file-is-named)), so `template-store="browser"`
keeps views per file. An element with a `storage-key` that is taken out of
the page and put back (its React root unmounts once it stays out past the task) shows the loaded file
again with its view and its undo steps, if its data is the same, also when that happens twice in
a row; kept in the page's memory only, as for the React prop. Behaviour:
[Load your own data](../use/load-data.md), and as the React prop
[`allowImport`](react.md#prop-allowimport).

The element reads CSV and JSON files in a worker of its own, `dist/import-worker.js` (pivotkit-core's
readers in one file, about 10 KiB gzip), started from its chunk by relative URL: serve it with `dist/`.
It is a file of the page's origin, never a `blob:` URL, so `script-src 'self'` (or `worker-src`)
allows it; where it cannot start, the element reads on the page (and Firefox and WebKit log the
failed worker in the console). The element resolves `../import-worker.js` against the URL of the
file its code is in (`import.meta.url`): in `dist/` that file is a chunk in `dist/chunks/`, so the
worker is `dist/import-worker.js`. An app that bundles the element serves the worker where that URL
points from the app's own file that holds the element's code; where that is depends on the bundler's
output layout. For Angular's flat output it is the site's root, with `angular.json` copying the file
as an asset: [Angular](../getting-started/web-component.md#angular). The import UI is the load group
"import", loaded on first use ([Bundle size](#bundle-size)).

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

## Controlled and uncontrolled

As with `<PivotReport>`:

- Uncontrolled (no `view`): the report starts on `defaultView` and keeps the view itself; every change
  is a `pivot-view-change` event. Setting a different `defaultView` (compared by value) starts the
  report again on it, with a new undo history and Reset pointing there; the same view again changes
  nothing, and so does the view the report last reported: a page that stores every
  `pivot-view-change` and binds it as `defaultView` (`[defaultView]="stored"`) keeps the report and
  its undo history. Feed the view back unchanged and before the next change: an older view (from a
  debounced or asynchronous store) counts as a new start view and starts the report again. That way a framework that sets properties after the element is in the page
  (React 18, Angular) still gets its start view.
- Controlled (`view` set): the report shows that view. A change is a `pivot-view-change` event, and the
  report shows it only when the page sets `view = event.detail.view`; a page that does not set it keeps
  the report on its view. A view the page sets on its own becomes one undo step. `view = undefined`
  makes it uncontrolled again; switching back and forth is not meant for normal use.

What of the page's `view` or `defaultView` the data cannot use shows above the result as a warning,
once per distinct view, as for `<PivotReport>`
([controlled and uncontrolled](react.md#controlled-and-uncontrolled)).

Undo and redo always stay inside the element. When the element is removed from the page, its React
root is unmounted (in a microtask: a move in the same task, `parent.append(el)` say, keeps the report
and its history); connected again, it mounts a new report that starts on the last view it showed, with
a new history.

## Events

Every event is a `CustomEvent` that bubbles and is composed: a listener on the element, on a parent
or on the document gets it, with `event.target` the element. So does every other script on the page:
the details carry the view and, for `pivot-cell-click`, the page's own row objects behind the cell.
A page that shows data some of its scripts must not read keeps those scripts off the page, as it
would for the data itself.

| Event | What |
| --- | --- |
| `pivot-view-change` | Every change of the view, normalized.<br><small>`detail`: `{ view }`</small> |
| `pivot-cell-click` | A click (or Enter) on a value or a chart point: key paths, the value, the number of source rows and the first `drillDownLimit` of them (the page's own row objects).<br><small>`detail`: `{ row, col, value, valueIndex, text, count, rows }`</small> |
| `pivot-template-save` | "Save current view", Save as… and Save of a user's view (with `save-templates`); `scope` is `"user"`. The name may exist: replace that view (an upsert by name).<br><small>`detail`: `{ name, view, scope, source, respondWith }`; `source` the data shown, `{ id, name, params }` (a loaded workbook's sheet in `params.sheet`), or `null`</small> |
| `pivot-template-delete` | Delete of a template marked `deletable`, after the user confirmed in the menu; `scope` is its group (`"shared"` or `"user"`). Not sent for a view of the browser store.<br><small>`detail`: `{ name, scope, respondWith }`</small> |
| `pivot-template-publish` | "Publish as shared view" on one of the user's views, or Save on a shared view (with `can-publish`), after the user confirmed: add it to the shared views, or replace the one of that name, and set `templates`.<br><small>`detail`: `{ name, view, source, respondWith }`</small> |
| `pivot-export` | Every exported file before its download and every copy before it goes on the clipboard; cancelable. [More](#event-pivot-export)<br><small>`detail`: `{ kind, fileName, blob, text, rows }`</small> |
| `pivot-tip-dismiss` | A tip dismissed (`id`), all tips switched off (`id` `"*"`) or back on (`id` `null`), with every dismissed id, for a page that stores them itself and sets `dismissedTips`.<br><small>`detail`: `{ id, dismissed }`</small> |
| `pivot-source-switch` | "Switch to “name” and load" for a view made for one of `sources`: show that data with `view` as its start view. [More](#event-pivot-source-switch)<br><small>`detail`: `{ source, view, name }`</small> |
| `pivot-data-load` | The data shown changed (with `allow-import`): a file loaded (cancelable), the page's data again, one of those undone or redone, or the file shown again after the element was put back. [More](#event-pivot-data-load)<br><small>`detail`: `{ cause, source, file, sheet, rows, columns, notes }`</small> |

The template events wait for the page's answer: call `event.detail.respondWith(promise)` in the
listener itself (later throws `InvalidStateError`). The report shows "Saved" or "Published" (or removes the entry)
when the promise resolves, and an error with its message when it rejects (a rejection without a
message shows "The server could not save the view.", `labels.toastSaveRejected`). Without `respondWith` (no
listener, or `respondWith` after an `await`) the action counts as done at once and the element logs a
console warning, since the user is told "saved", "deleted" or "published" either way. The page then sets
`templates` to the new list.

When a listener of `pivot-export` calls `preventDefault()`, the report shows no "Exported" or
"Copied" note: the page that kept the file or the text says itself what became of it.

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

The events whose line in the table ends in "More", in full.

### `pivot-export` { #event-pivot-export }

`detail`: `{ kind, fileName, blob, text, rows }`.

Every exported file before its download and every copy before it goes on the clipboard: `"xlsx"`, `"csv"`, `"html"`, `"png"`, `"svg"`, `"json"` for the view file of "Download view"; `"data-csv"` and `"data-json"`, Source data (with `export-data`); `"print"`, the HTML report before the print dialog opens (`preventDefault()` prints nothing); the copies `"copy-table"` and `"copy-json"` (Export, Copy table and Copy data as JSON); the drill-down panel's `"drill-copy"`, `"drill-json"`, `"drill-csv"` and `"drill-xlsx"`. A copy also has its `text` and the `fileName` it would have as a file (`pivot.tsv`); a drill-down export has `rows: { shown, count }`. Cancelable: `preventDefault()` skips the download or the copy, the page keeps the blob (to upload it, say). Not sent for the table's exports of an empty report (no field placed): they are greyed out ("Add a field first."); Source data stays.

### `pivot-source-switch` { #event-pivot-source-switch }

`detail`: `{ source, view, name }`.

"Switch to “name” and load" for a view made for one of `sources`: show that data and set `defaultView` to `view` (as the file has it, not normalized). Switching starts the report anew: Undo begins there. The view is untrusted input like any loaded view (it comes from a file or a link): hand it only to a report as its start view, which normalizes it, never run or render anything from it.

### `pivot-data-load` { #event-pivot-data-load }

`detail`: `{ cause, source, file, sheet, rows, columns, notes }`.

`cause` is `"load"` for a file, sent before it is shown: `preventDefault()` refuses it and the data
stays (cancelable for `"load"` only); also for another sheet of the workbook shown that a saved view
opened (refused, the view is not opened and a note says so); `"original"` when "Back to original data" shows the page's
data; `"undo"` and `"redo"` when one of those steps is undone or redone; `"restore"` when an element
with `storage-key` put back into the page shows the file it had. `source` is `{ id, name }` of
the data shown now (the file's, or the element's `source-id` and `source-name`), `file` its
`{ name, size, type }` (`null` for the page's data), `sheet` a workbook's sheet, `rows` and `columns`
(`[{ name, type }]`) what it holds, `notes` the readers' notes for `"load"`
([codes](import.md#the-table)). Names and notes come from the file: show them as text, never as HTML.

## Styles

The report's stylesheet lives in the shadow root: no CSS of the page reaches into the report and none
of the report's reaches out. What does cross is what crosses every shadow root: inherited properties
(the font family and size the report inherits through the element, `color-scheme`) and the `--pk-*`
custom properties set **on the element**. Every token is declared on the element's `:host`, so a
`--pk-*` set higher up the page (on `body`) does not reach the report; a rule of the page on the
element wins over the defaults:

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

The tokens and their defaults are listed in the
[theming page](theming.md). There are no `::part()` names; the
tokens are the styling interface.

The styles reach the shadow root as one constructed stylesheet shared by every element of the
document (`adoptedStyleSheets`). Where a browser has none, or refuses one, the element adds a
`<style>` element to its shadow root instead (a browser test covers it). An element moved into
another document (an iframe) after it was created keeps what it had; that case is not tested.

Menus, bottom sheets and popups open in the browser's top layer (`popover="manual"`, where the
browser has the Popover API): above the page's own layout whatever its z-indexes, placed against the
window whatever the element's ancestors (a `transform`, a `filter`, `contain`), and still in the shadow
root, so its styles and the tokens set on the element apply
([popovers above the page](theming.md#popovers-above-the-page)). Without the API they are `position:
fixed` in the report's layer, stacked by `--pk-layer-z`: inside an ancestor with a `transform`, a
`filter` or `contain` (router animations, dialogs, carousels) fixed elements are placed relative to
that ancestor; the report measures its origin and places them at their button all the same (browser
test with a transformed wrapper), and the narrow layout's bottom sheets cover that ancestor, not the
window. The field drawer and the drill-down are part of the report's box. The drag preview (also
`position: fixed`) is not corrected inside such an ancestor and is not tested; a scaled ancestor
(`scale()`) is not corrected either.

## Escape and the host page

While a popover, the drill-down or the narrow field drawer of the report is open, the report listens
for Escape on the whole `document` and closes its newest layer only, also when the focus is outside
the element (on the host page, say). It calls `preventDefault()` on that Escape, and it leaves an
Escape alone that is `defaultPrevented` already. A host that opens a dialog of its own while a report
layer is open: handle Escape in the dialog's own `keydown` listener (it runs before the document's)
and call `preventDefault()`, or close the report's layer first. The keys of the report itself are in
[Keyboard and screen readers](../use/keyboard.md).

## React on the page

The element's React is private to the bundle: it sets no global, and a page with a React of its own
(another version, or the same) is not affected, nor is the element by it. The browser tests run a
page with its own React 18 and, in the React 19 job, React 19, that renders `<pivot-report>` in its
tree and renders again every 200 ms. Each element has its own React root; the elements of a page share
one copy of the bundle. A React page can use pivotkit-react directly and save the second React.

React 18 passes only attributes to a custom element: set `data` and the other objects in a ref
(`useEffect(() => { ref.current.data = rows; }, [rows])`) and add listeners there. React 19 sets a prop
as a property when the element has one, and listens for a custom event with `on` and the event's
exact name (react.dev, "Custom HTML elements"):

```jsx
// React 19
<pivot-report data={rows} defaultView={start} theme="auto" onpivot-view-change={(e) => save(e.detail.view)} />
```

The test page uses the ref in the React 18 job and these props in the React 19 job, and checks that
`data` arrives as a property. For TypeScript, `import type {} from "pivotkit-element/jsx";` once
declares `<pivot-report>` with its properties and `on<event>` props in React's JSX (needs
`@types/react` 18.3 or later; the types describe React 19's behaviour).

## Angular and zone.js

The Angular example is in [Getting started](../getting-started/web-component.md#angular): a zoneless
Angular 22 app in `examples/angular/`, built and tested in CI.

`[data]="rows"` sets the property (Angular binds properties of an element with the schema); a new
array is a new data set. For the controlled form bind `[view]="view"` and set `this.view` in the
handler. Binding the stored view back as `[defaultView]` is fine: the element ignores the view it
reported itself.

Change detection: the element runs React's scheduler, ECharts' pointer listeners and animation
frames in whatever zone created it. A zoneless app, as the example,
runs change detection only for its own bindings, signals and event handlers. Inside Angular's zone
(zone.js) each of them may trigger change detection of the app. Not measured here, since the example
is zoneless; if it shows, create and feed the element outside the zone
and come back in for the app's own state:

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

`types/` holds the declarations: `PivotReportElement` with its properties, the event map
(`PivotReportEventMap`), and the DOM's maps, so `document.createElement("pivot-report")` is a
`PivotReportElement` and `addEventListener("pivot-view-change", (e) => e.detail.view)` knows the
detail, on the element and on the document. The view type is a structural `PivotView`; the full one is
pivotkit-core's `View`. `pivotkit-element/jsx` (types only) adds the element to React's JSX, see
above.

## Bundle size

What a page loads, measured with `npm run size -w pivotkit-element` on one Mac on 2026-11-13
(esbuild 0.28.2, gzip level 9 per file, sizes add up per group; approximate, they change with every
dependency update). CI runs the same command; it fails when a group is over `SIZE_BUDGET_KIB` in
`build.js` (173 KiB for the first load, about 0.3 above what CI measures; 1 to 7 per cent
above what CI measures for the groups loaded later; CI reads up to about 0.7 KiB more than these
numbers):

| Loaded | Files | Size | gzip |
| --- | ---: | ---: | ---: |
| First (`index.js` and its static imports: React, ReactDOM, pivotkit-react, pivotkit-core, @dnd-kit, styles) | 11 | 528 KiB | 172 KiB |
| On the first chart (ECharts with bar, line, pie (also the donut), heatmap, the components they use, the title among them, the canvas renderer, and the layout of the chart's labels) | 2 | 631 KiB | 216 KiB |
| On the first export or copy (pivotkit-core's export, and fflate as a chunk it shares with the link; the Export menu and the drill-down's start loading it when they open) | 3 | 27 KiB | 12 KiB |
| On the first shared link, Copy link or loaded link (pivotkit-core's link with fflate) | 2 | 15 KiB | 7 KiB |
| Right after the first render (the menus' panels with their levels, the Filter level with its summary, quick choices, items and rules, the Export menu, the drill-down's panel and its table, sharing's copy, download and load, and the English texts only they show) | 1 | 139 KiB | 45 KiB |
| With the menus, for a German report only (the menus' German texts) | 1 | 20 KiB | 7 KiB |
| When a view has unused parts (their plain words: English, and German for a German report) | 2 | 16 KiB | 5 KiB |
| With `allow-import`, on the first use of the Data menu, a drop or the empty report's Load data… (the import UI with its English and German texts, pivotkit-core's readers) | 5 | 50 KiB | 20 KiB |
| With `allow-import`, the worker of a CSV or JSON file (`dist/import-worker.js`, one file) | 1 | 25 KiB | 10 KiB |

ECharts is bundled, not left to the page: a page without a bundler or an import map would have no
way to provide it, and loading it on first use keeps it out of the first load. Only the four chart
types the report draws are in the chunk: pivotkit-react's `echarts.js` imports them by name
(`test/build.test.js` checks the chunk against it). A page that already has ECharts loads it twice; one that needs a single
copy uses [pivotkit-react](react.md) with its own React instead.

## Content-Security-Policy

The element works under a strict policy without `'unsafe-inline'` or `'unsafe-eval'`; what was measured is in [Security](../security.md#content-security-policy).

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

| Property | Attribute | What |
| --- | --- | --- |
| `data` |  | The rows: an array of objects. Encoded once per array, or once per `dataKey`. pivotkit-core takes rows only; columnar data (`{ columns, rows }`) is not supported, map it to objects first.<br><small>Type: `object[]`; default: `[]`</small> |
| `dataKey` |  | The identity of `data`: a new array with the same key is not encoded again.<br><small>Type: `string` or `number`</small> |
| `view` | `view` (JSON) | Controlled: the view to show, see below.<br><small>Type: view</small> |
| `defaultView` | `default-view` (JSON) | Uncontrolled: the start view, see below.<br><small>Type: view; default: empty</small> |
| `templates` |  | The Templates menu; the first three are also offered in the empty state.<br><small>Type: `{ name, view, deletable? }[]`; default: `[]`</small> |
| `saveTemplates` | `save-templates` (boolean) | Offers "Save current view"; a save is a `pivot-template-save` event.<br><small>Type: `boolean`; default: `false`</small> |
| `fieldDefaults` |  | The aggregator and format a field gets in Values; `drillFormat` (else `format`) for its values in the drill-down (`"text"`: an identifier as it is).<br><small>Type: `{ [field]: { agg?, format?, drillFormat? } }`</small> |
| `labels` |  | Texts merged over the language's labels (the keys are in pivotkit-react's `LABELS.en`).<br><small>Type: partial labels</small> |
| `limits` |  | pivotkit-core's limits.<br><small>Type: `Partial<Limits>`</small> |
| `locale` | `locale` | Numbers, dates, sorting and the language of the labels (`de-*` is German). Without it the element's own `lang` attribute is used; the page's language is not.<br><small>Type: `string`; default: `"en-US"`</small> |
| `theme` | `theme` | `auto` follows the nearest `data-theme="light` or `dark"` on the element or above it (`<html>`), then `prefers-color-scheme`, and changes with them.<br><small>Type: `"auto"` or `"light"` or `"dark"`; default: `"auto"`</small> |
| `height` | `height` | Pixels (`height="480"`) or a CSS length; `"100%"` fills the element, which then needs a height from the page (`pivot-report { height: 70vh }`).<br><small>Type: `number` or `string`; default: `640`</small> |
| `timeZone` | `time-zone` | The zone `data` is encoded in; see pivotkit-core.<br><small>Type: `string`; default: `"UTC"`</small> |
| `fileName` | `file-name` | Name of exported files, without the extension; made safe.<br><small>Type: `string`; default: `"pivot"`</small> |
| `label` | `label` | The name of the report's region landmark; give each report on a page its own (`label="Tickets"`).<br><small>Type: `string`; default: `labels.report`</small> |
| `drillDown` | `drill-down` | The panel with the rows behind a clicked value; `drill-down="false"` turns it off.<br><small>Type: `boolean`; default: `true`</small> |
| `drillDownLimit` | `drill-down-limit` | Rows passed to the panel and to `pivot-cell-click`.<br><small>Type: `number`; default: `1000`</small> |

Properties with an attribute reflect it, as native elements do: `report.theme = "dark"` sets
`theme="dark"`, `null` removes it. `view` and `default-view` are parsed as JSON objects (a text that
is not one is ignored with a console warning); setting the property does not write the attribute.
Data, templates, labels, field defaults and limits are properties only. A view is user input either
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

Undo and redo always stay inside the element. When the element is removed from the page, its React
root is unmounted (in a microtask: a move in the same task, `parent.append(el)` say, keeps the report
and its history); connected again, it mounts a new report that starts on the last view it showed, with
a new history.

## Events

Every event is a `CustomEvent` that bubbles and is composed: a listener on the element, on a parent
or on the document gets it, with `event.target` the element.

| Event | What |
| --- | --- |
| `pivot-view-change` | Every change of the view, normalized.<br><small>`detail`: `{ view }`</small> |
| `pivot-cell-click` | A click (or Enter) on a value or a chart point: key paths, the value, the number of source rows and the first `drillDownLimit` of them (the page's own row objects).<br><small>`detail`: `{ row, col, value, valueIndex, text, count, rows }`</small> |
| `pivot-template-save` | "Save current view" (with `save-templates`).<br><small>`detail`: `{ name, view, respondWith }`</small> |
| `pivot-template-delete` | Delete of a template marked `deletable`, after the user confirmed in the menu.<br><small>`detail`: `{ name, respondWith }`</small> |
| `pivot-export` | Every exported file (`"xlsx"`, `"csv"`, `"png"`) before its download. Cancelable: `preventDefault()` skips the download, the page keeps the blob (to upload it, say).<br><small>`detail`: `{ kind, fileName, blob }`</small> |

The template events wait for the page's answer: call `event.detail.respondWith(promise)` in the
listener itself (later throws `InvalidStateError`). The report shows "Saved" (or removes the entry)
when the promise resolves, and an error with its message when it rejects (a rejection without a
message shows "The server could not save the template.", `labels.toastSaveRejected`). Without `respondWith` (no
listener, or `respondWith` after an `await`) the action counts as done at once and the element logs a
console warning, since the user is told "saved" or "deleted" either way. The page then sets
`templates` to the new list.

When a listener of `pivot-export` calls `preventDefault()`, the report shows no "Exported" note: the
page that kept the file says itself what became of it.

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

Menus and popovers are `position: fixed`. Inside an ancestor with a `transform`, a `filter` or
`contain` (router animations, dialogs, carousels) fixed elements are placed relative to that
ancestor; the report measures its origin and places them at their button all the same (browser test
with a transformed wrapper). The narrow layout's bottom sheets, the field drawer and the drill-down
cover that ancestor, not the window, in such a case. The drag preview (also `position: fixed`) is not
corrected there and is not tested; a scaled ancestor (`scale()`) is not corrected either.

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

The Angular example is in [Getting started](../getting-started/web-component.md#angular). Not built or tested in this repository.

`[data]="rows"` sets the property (Angular binds properties of an element with the schema); a new
array is a new data set. For the controlled form bind `[view]="view"` and set `this.view` in the
handler. Binding the stored view back as `[defaultView]` is fine: the element ignores the view it
reported itself.

Change detection: the element runs React's scheduler, ECharts' pointer listeners and animation
frames in whatever zone created it. Inside Angular's zone (zone.js) each of them may trigger change
detection of the app. Not measured here; if it shows, create and feed the element outside the zone
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

What a page loads, measured with `npm run size -w pivotkit-element` on one Mac (esbuild 0.28.2,
gzip level 9 per file, sizes add up per group; approximate, they change with every dependency
update). CI runs the same command; it fails when a group is over `SIZE_BUDGET_KIB` in `build.js`
(about 10 % above these numbers):

| Loaded | Files | Size | gzip |
| --- | ---: | ---: | ---: |
| First (`index.js` and its static imports: React, ReactDOM, pivotkit-react, pivotkit-core, @dnd-kit, styles) | 4 | 386 KiB | 124 KiB |
| On the first chart (ECharts with bar, line, pie, heatmap, the components they use and the canvas renderer) | 1 | 592 KiB | 200 KiB |
| On the first XLSX or CSV export (pivotkit-core's export with fflate) | 1 | 17 KiB | 8 KiB |

ECharts is bundled, not left to the page: a page without a bundler or an import map would have no
way to provide it, and loading it on first use keeps it out of the first load. Only the four chart
types the report draws are in the chunk: pivotkit-react's `echarts.js` imports them by name
(`test/build.test.js` checks the chunk against it). A page that already has ECharts loads it twice; one that needs a single
copy uses [pivotkit-react](react.md) with its own React instead.

## Content-Security-Policy

The element works under a strict policy without `'unsafe-inline'` or `'unsafe-eval'`; what was measured is in [Security](../security.md#content-security-policy).

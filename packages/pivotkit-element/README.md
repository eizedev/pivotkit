# pivotkit-element

The pivot report builder of [pivotkit-react](../pivotkit-react/) as one web component,
`<pivot-report>`, for pages without React: Angular apps, PHP and other server-rendered pages, plain
HTML. It brings its own React 18.3.1 and ReactDOM, pivotkit-react, [pivotkit-core](../pivotkit-core/)
and @dnd-kit, and renders into an open shadow root. Everything the React component does (field list,
drag and drop, table and chart, filters, drill-down, undo, templates, export) works the same; the
[pivotkit-react README](../pivotkit-react/README.md#what-the-user-can-do) describes it.

Version 0.1.0: `npm install pivotkit-element`, or serve its `dist/` directory as below. Try it in the
[example](../../examples/element/).

## Use

```html
<script type="module" src="/assets/pivotkit-element/dist/index.js"></script>

<pivot-report
    locale="de-DE"
    height="640"
    default-view='{"rows":["Region"],"values":[{"field":"Sales","agg":"sum"}]}'
></pivot-report>

<script type="module" src="/assets/report.js"></script>
```

```js
// report.js
const report = document.querySelector("pivot-report");
report.data = rows;                        // an array of objects, property only
report.templates = [{ name: "By region", view: { rows: ["Region"] } }];
report.addEventListener("pivot-view-change", (e) => localStorage.setItem("view", JSON.stringify(e.detail.view)));
```

With a bundler: `npm install pivotkit-element`, then `import "pivotkit-element";` once (it defines
`<pivot-report>`). `dist/` is ES modules; the files in `dist/chunks/` are loaded by relative URL
from the entry, so serve the whole `dist/` directory, not `index.js` alone.

From another origin (a CDN), module scripts are fetched with CORS: the server must send
`Access-Control-Allow-Origin` for `index.js` and every chunk. Subresource Integrity covers only the
`<script integrity>` of the entry; the chunks it imports later cannot carry a hash, so pin a version in
the URL (or host `dist/` yourself) instead of relying on SRI. The bundle targets ES2022 in Chrome 111,
Firefox 113 and Safari 16.4 or later (`target` in pivotkit-react's `build.js`); older browsers are not
supported.

| Entry | What |
| --- | --- |
| `pivotkit-element` (`dist/index.js`) | Defines `<pivot-report>`; exports `PivotReportElement`, `define`, `TAG`, `EVENTS` |
| `pivotkit-element/element` (`dist/element.js`) | The same exports, defines nothing: `define("my-report")` registers another tag name |

`define(name)` does nothing when the name is defined already, so a page that loads the package twice
(two scripts, two copies) throws no error; the first definition stays, and the second copy says so in
a console warning with both versions (`PivotReportElement.version`). Without `customElements`
(Node, a server render) importing the package defines nothing and touches no DOM.

## Properties and attributes

| Property | Attribute | Type | Default | What |
| --- | --- | --- | --- | --- |
| `data` | | `object[]` | `[]` | The rows: an array of objects. Encoded once per array, or once per `dataKey`. pivotkit-core takes rows only; columnar data (`{ columns, rows }`) is not supported, map it to objects first. |
| `dataKey` | | `string \| number` | | The identity of `data`: a new array with the same key is not encoded again. |
| `view` | `view` (JSON) | view | | Controlled: the view to show, see below. |
| `defaultView` | `default-view` (JSON) | view | empty | Uncontrolled: the start view, see below. |
| `templates` | | `{ name, view, deletable? }[]` | `[]` | The Templates menu; the first three are also offered in the empty state. |
| `saveTemplates` | `save-templates` (boolean) | `boolean` | `false` | Offers "Save current view"; a save is a `pivot-template-save` event. |
| `fieldDefaults` | | `{ [field]: { agg?, format?, drillFormat? } }` | | The aggregator and format a field gets in Values; `drillFormat` (else `format`) for its values in the drill-down (`"text"`: an identifier as it is). |
| `labels` | | partial labels | | Texts merged over the language's labels (the keys are in pivotkit-react's `LABELS.en`). |
| `limits` | | `Partial<Limits>` | | pivotkit-core's limits; a layout or data over them shows a message in place of the result. |
| `locale` | `locale` | `string` | `"en-US"` | Numbers, dates, sorting and the language of the labels (`de-*` is German). Without it the element's own `lang` attribute is used; the page's language is not. |
| `theme` | `theme` | `"auto" \| "light" \| "dark"` | `"auto"` | `auto` follows the nearest `data-theme="light\|dark"` on the element or above it (`<html>`), then `prefers-color-scheme`, and changes with them. |
| `height` | `height` | `number \| string` | `640` | Pixels (`height="480"`) or a CSS length; `"100%"` fills the element, which then needs a height from the page (`pivot-report { height: 70vh }`). |
| `timeZone` | `time-zone` | `string` | `"UTC"` | The zone `data` is encoded in; see pivotkit-core. |
| `fileName` | `file-name` | `string` | `"pivot"` | Name of exported files, without the extension; made safe. |
| `label` | `label` | `string` | `labels.report` | The name of the report's region landmark; give each report on a page its own (`label="Tickets"`). |
| `drillDown` | `drill-down` | `boolean` | `true` | The panel with the rows behind a clicked value; `drill-down="false"` turns it off. |
| `drillDownLimit` | `drill-down-limit` | `number` | `1000` | Rows passed to the panel and to `pivot-cell-click`. |

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
[example](../../examples/element/) does: the page scrolls to the report, the table scrolls inside it.

### Controlled and uncontrolled

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
or on the document gets it, with `event.target` the element. So does every other script on the page:
the details carry the view and, for `pivot-cell-click`, the page's own row objects behind the cell.
A page that shows data some of its scripts must not read keeps those scripts off the page, as it
would for the data itself.

| Event | `detail` | What |
| --- | --- | --- |
| `pivot-view-change` | `{ view }` | Every change of the view, normalized. |
| `pivot-cell-click` | `{ row, col, value, valueIndex, text, count, rows }` | A click (or Enter) on a value or a chart point: key paths, the value, the number of source rows and the first `drillDownLimit` of them (the page's own row objects). |
| `pivot-template-save` | `{ name, view, respondWith }` | "Save current view" (with `save-templates`). |
| `pivot-template-delete` | `{ name, respondWith }` | Delete of a template marked `deletable`, after the user confirmed in the menu. |
| `pivot-export` | `{ kind, fileName, blob }` | Every exported file (`"xlsx"`, `"csv"`, `"png"`) before its download. Cancelable: `preventDefault()` skips the download, the page keeps the blob (to upload it, say). |

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

## Theming and styles

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
[pivotkit-react README](../pivotkit-react/README.md#theming). There are no `::part()` names; the
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

## Content-Security-Policy

Measured in the browser tests (`tests/browser/element.spec.js`) in Chromium, Firefox and WebKit of
Playwright 1.64.1, with this policy in a `<meta>` element:

```text
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'
```

- The report renders and is styled: the constructed stylesheet is not blocked by `style-src 'self'`,
  and the inline styles React sets (through `element.style`, the CSSOM) are not blocked either.
- The chart works: ECharts loads from its chunk and draws on a canvas; nothing needs `'unsafe-eval'`.
  Its tooltip shows on hover without a violation: pivotkit-react builds it as DOM nodes with styles
  set through the CSSOM and the data's texts as `textContent`, instead of ECharts' default HTML string
  with inline `style` attributes (which `style-src-attr` would refuse).
- The XLSX and PNG exports download (a blob URL on an `<a download>`; no `fetch` of `data:`); CSV
  takes the same path as XLSX.
- No violation is reported (`securitypolicyviolation`) and nothing is logged; the test checks that the
  policy is in force by adding an inline `<style>`, which is refused.
- The `<style>` fallback is tested on its own page (constructable stylesheets removed), without CSP.

Not covered: the `<style>` fallback (browsers without constructable stylesheets) needs
`style-src 'unsafe-inline'`, since the element has no nonce option; only the `<meta>` form of the
policy was measured, not an HTTP header; `script-src` must allow the origin that serves `dist/` and
its chunks. A page script that sets the properties must be a file (or carry a nonce) under such a policy.

## Bundle size

What a page loads, measured with `npm run size -w pivotkit-element` on one Mac (esbuild 0.28.2,
gzip level 9 per file, sizes add up per group; approximate, they change with every dependency
update). CI runs the same command; it fails when a group is over `SIZE_BUDGET_KIB` in `build.js`
(about 10 % above these numbers):

| Loaded | Files | Size | gzip |
| --- | ---: | ---: | ---: |
| First (`index.js` and its static imports: React, ReactDOM, pivotkit-react, pivotkit-core, @dnd-kit, styles) | 4 | 389 KiB | 124 KiB |
| On the first chart (ECharts with bar, line, pie, heatmap, the components they use and the canvas renderer) | 1 | 592 KiB | 200 KiB |
| On the first XLSX or CSV export (pivotkit-core's export with fflate) | 1 | 17 KiB | 8 KiB |

ECharts is bundled, not left to the page: a page without a bundler or an import map would have no
way to provide it, and loading it on first use keeps it out of the first load. Only the four chart
types the report draws are in the chunk: pivotkit-react's `echarts.js` imports them by name
(`test/build.test.js` checks the chunk against it). A page that already has ECharts loads it twice; one that needs a single
copy uses [pivotkit-react](../pivotkit-react/) with its own React instead.

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

## Angular

Not built or tested in this repository; the element is a standard custom element, so Angular's
property and event bindings apply:

```ts
import { Component, CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import "pivotkit-element";
import type { PivotView } from "pivotkit-element";

@Component({
    selector: "app-ticket-report",
    standalone: true,
    // <pivot-report> is no Angular component: the schema lets the template use it
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    template: `
        <pivot-report
            [data]="rows"
            [defaultView]="start"
            [templates]="templates"
            locale="de-DE"
            height="640"
            (pivot-view-change)="onView($event)"
        ></pivot-report>
    `
})
export class TicketReportComponent {
    rows: object[] = [];
    templates = [];
    start: PivotView = { rows: ["Team"], values: [{ field: "Ticket", agg: "count" }] };

    onView(event: Event) {
        const { view } = (event as CustomEvent<{ view: PivotView }>).detail;
        // store the view
    }
}
```

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

## PHP and server-rendered pages

The server writes the rows (and templates) as JSON into a `<script type="application/json">`, which
the browser does not run, and a module script hands them to the element:

```php
<script type="application/json" id="report-rows">
    <?= json_encode($rows, JSON_HEX_TAG | JSON_HEX_AMP | JSON_THROW_ON_ERROR) ?>
</script>
<pivot-report id="report" locale="de-DE" file-name="tickets"></pivot-report>
<script type="module" src="/assets/pivotkit-element/dist/index.js"></script>
<script type="module" src="/assets/report.js"></script>
```

```js
// report.js
document.getElementById("report").data = JSON.parse(document.getElementById("report-rows").textContent);
```

`JSON_HEX_TAG` writes `<` and `>` as `\u003C` and `\u003E`, so a value containing `</script>`
cannot end the block. A start view as JSON fits in the `default-view` attribute:
`default-view='<?= htmlspecialchars(json_encode($view), ENT_QUOTES) ?>'` (`ENT_QUOTES` also encodes
`'`, which PHP before 8.1 leaves alone by default and the attribute's quotes need). Data never goes
into an attribute.

## Types

`types/` holds the declarations: `PivotReportElement` with its properties, the event map
(`PivotReportEventMap`), and the DOM's maps, so `document.createElement("pivot-report")` is a
`PivotReportElement` and `addEventListener("pivot-view-change", (e) => e.detail.view)` knows the
detail, on the element and on the document. The view type is a structural `PivotView`; the full one is
pivotkit-core's `View`. `pivotkit-element/jsx` (types only) adds the element to React's JSX, see
above.

## Development

```bash
npm run build -w pivotkit-element    # pivotkit-react's dist, then dist/ of this package (esbuild)
npm run size -w pivotkit-element     # the same, with the size of what a page loads, checked against the budget
npm test -w pivotkit-element         # build, then node --test: attributes, events, stylesheet, bundle, Node import
npm run types -w pivotkit-element    # tsc: types/ from the JSDoc, plus src/global.d.ts and src/jsx.d.ts
npm run test:browser                 # Playwright in Chromium, Firefox and WebKit, also of the element pages
```

`build.js` bundles pivotkit-react as it ships (its `dist/`), with `process.env.NODE_ENV` set to
`production` and the package's version as `PivotReportElement.version`, and writes
`dist/THIRD_PARTY_LICENSES.txt` with the license texts of every bundled package, once per name and
version (React, ReactDOM, scheduler and @dnd-kit: MIT; ECharts: Apache-2.0 with its NOTICE; zrender:
BSD-3-Clause; tslib: 0BSD; fflate: MIT). The browser test pages are in `tests/browser/pages/element/`.

## License

[MIT](../../LICENSE); the bundled packages under their own licenses, see `dist/THIRD_PARTY_LICENSES.txt`.

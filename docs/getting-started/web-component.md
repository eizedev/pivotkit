---
title: Getting started with the web component
description: Put <pivot-report> on a page without React - plain HTML, PHP, Angular - set its data, listen to its events and store the view.
---

# Getting started with the web component

`pivotkit-element` is the report builder as one web component, `<pivot-report>`, for pages without
React: Angular apps, PHP and other server-rendered pages, plain HTML. It brings its own React 18.3.1,
pivotkit-react, pivotkit-core and @dnd-kit, and renders into an open shadow root. Everything the
React component does works the same.

## Install

With a bundler:

```bash
npm install pivotkit-element
```

```js
import "pivotkit-element";   // defines <pivot-report>
```

Without a bundler, serve the package's whole `dist/` directory and load its entry as a module. The
files in `dist/chunks/` (ECharts, the export) are loaded by relative URL from the entry when they are
first needed, so `index.js` alone is not enough.

To get `dist/` without a build: `npm install pivotkit-element` and copy
`node_modules/pivotkit-element/dist/` to your web root (the examples below use
`/assets/pivotkit-element/dist/`), or `npm pack pivotkit-element` and take `package/dist/` from the
tarball. A CDN that serves npm packages works the same way, as long as it serves the whole `dist/`
directory of one exact version.

## A complete page to copy { #a-complete-page }

A few commands and one file, no build step:

```bash
mkdir pivot-page && cd pivot-page
npm install pivotkit-element
mkdir -p assets/pivotkit-element && cp -R node_modules/pivotkit-element/dist assets/pivotkit-element/
# put index.html (below) into pivot-page/, then serve the folder:
npx --yes http-server -p 8080 .     # any static server; runs until Ctrl-C; open http://localhost:8080/
```

`index.html`:

```html
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Pivot report</title>
    <script type="module" src="/assets/pivotkit-element/dist/index.js"></script>
</head>
<body>
    <pivot-report height="640" default-view='{"rows":["Region"],"cols":["Product"],"values":[{"field":"Sales","agg":"sum"}]}'></pivot-report>
    <script type="module">
        const rows = [
            { Region: "North", Product: "A", Sales: 120, Date: "2026-01-05" },
            { Region: "North", Product: "B", Sales: 80, Date: "2026-01-20" },
            { Region: "South", Product: "B", Sales: 340, Date: "2026-02-14" },
            { Region: "West", Product: "A", Sales: 210, Date: "2026-03-02" }
        ];
        document.querySelector("pivot-report").data = rows;
    </script>
</body>
</html>
```

The page must be served over HTTP (not opened as a file): the element loads its chunks by URL.

## The first report

The same in parts, as a page with its own script file. `rows` is your data, an array of objects:

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
report.data = rows;                        // an array of objects; a property, never an attribute
report.templates = [{ name: "By region", view: { rows: ["Region"] } }];
report.addEventListener("pivot-view-change", (e) => {
    localStorage.setItem("view", JSON.stringify(e.detail.view));
});
```

- Simple settings are **attributes** (`locale`, `theme`, `height`, `file-name`, ...); the start view
  fits in `default-view` as JSON.
- Data, templates, labels and field defaults are **properties** set from a script.
- Every change is a `pivot-view-change` event; a click on a value is `pivot-cell-click`. All events
  bubble and cross the shadow root, so a listener on the document gets them too.

The [example page](../demo.md#the-web-component-example) shows all of it; its source is in
[`examples/element/`](https://github.com/eizedev/pivotkit/tree/main/examples/element).

## Save views on a server

With `save-templates` the Views menu offers "Save current view" under This view (and Save for a view loaded from the user's own; a save may name a view that exists, which the page replaces). The element asks the page with
a `pivot-template-save` event (`detail`: `name`, `view`, `scope: "user"`) and waits for the answer you pass to `respondWith()`:

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

Call `respondWith()` in the listener itself, not after an `await`. The report shows "Saved" when the
promise resolves and the error's message when it rejects. Shared views, publishing with
`can-publish` (`pivot-template-publish`) and keeping the user's views in the browser instead
(`template-store="browser"`) are in [Templates and shared views](../concepts/templates.md).

## PHP and other server-rendered pages

Write the rows as JSON into a `<script type="application/json">`, which the browser does not run, and
hand them to the element from a module script:

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

`JSON_HEX_TAG` writes `<` and `>` as `\u003C` and `\u003E`, so a value containing `</script>` cannot end
the block. A start view fits in the attribute:
`default-view='<?= htmlspecialchars(json_encode($view), ENT_QUOTES) ?>'` (`ENT_QUOTES` also encodes
`'`, which PHP before 8.1 leaves alone by default and the attribute's quotes need). Data never goes
into an attribute.

## Angular

The element is a standard custom element, so Angular's property and event bindings apply. This
component is shortened from the [Angular example](https://github.com/eizedev/pivotkit/tree/main/examples/angular)
of the repository (Angular 22, zoneless), which CI builds and tests in Chromium, Firefox and WebKit:

```ts
import { Component, CUSTOM_ELEMENTS_SCHEMA, signal } from "@angular/core";
import "pivotkit-element";
import type { PivotView } from "pivotkit-element";

@Component({
    selector: "app-root",
    // <pivot-report> is no Angular component: the schema lets the template use it
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    template: `
        <p>{{ shown() }}</p>
        <pivot-report
            [data]="rows"
            [defaultView]="start"
            locale="en-US"
            allow-import
            (pivot-view-change)="onView($event)"
        ></pivot-report>
    `
})
export class TicketReportComponent {
    // data and views are properties: Angular sets them on the element, never as attributes
    readonly rows = [
        { Ticket: 1, Team: "Billing", Priority: "High" },
        { Ticket: 2, Team: "Network", Priority: "Low" }
    ];
    readonly start: PivotView = { rows: ["Team"], values: [{ field: "Ticket", agg: "count" }] };
    readonly view = signal<PivotView>(this.start);
    readonly shown = () => `Rows: ${this.view().rows?.join(", ") || "none"}; columns: ${this.view().cols?.join(", ") || "none"}`;

    onView(event: Event) {
        // a real app stores the view (a server, the URL); this one shows what it got
        this.view.set((event as CustomEvent<{ view: PivotView }>).detail.view);
    }
}
```

The test checks that the bound rows show in the table, that a change in a field's menu reaches
`onView` and the page shows the new view, that the page's global stylesheet does not style the
report (its shadow root keeps it out), and that a CSV file picked with `allow-import` is read in the
element's import worker. Angular's build bundles `pivotkit-element` with the app; ECharts, the export
and the import UI still load on first use, as chunks of the app's build.

The import worker is a file of its own that a bundler does not copy: copy it as an asset in
`angular.json` (the build's `options`), so it lands next to `main-*.js` at the root of the output:

```json
"assets": [{ "glob": "import-worker.js", "input": "node_modules/pivotkit-element/dist", "output": "/" }]
```

The element looks for it at `../import-worker.js` from the file its code is in, which from Angular's
`main-*.js` is `/import-worker.js` of the site: an app served under a path of its own (a `baseHref`
such as `/reports/`) needs the file at the site's root too. Without it the element reads the file
on the page, and Firefox and WebKit log the worker that failed to load in the console.

Binding the stored view back as `[defaultView]` is fine: the element ignores the view it reported
itself. For the controlled form bind `[view]` and set it in the handler. An app that still runs in
Angular's zone (zone.js) may see extra change detection from the report's scheduler and ECharts'
pointer listeners (not measured); the [element reference](../reference/element.md#angular-and-zonejs)
shows how to create and feed the element outside the zone.

## React pages

A React page can use [pivotkit-react](react.md) directly and save the element's second copy of React.
The element works in a React tree too: React 18 passes only attributes to a custom element, so set
`data` in a ref; React 19 sets properties and listens to `onpivot-view-change`. See
[React on the page](../reference/element.md#react-on-the-page).

## A taller report on phones

On a phone the zones sit above the table, so 640 px leave little room for it. Give the element more
height on narrow screens:

```css
pivot-report { height: 640px; }
@media (max-width: 639px) {
    pivot-report { height: calc(100svh - 24px); }
}
```

```html
<pivot-report height="100%"></pivot-report>
```

## Next steps { #next }

- [Element reference](../reference/element.md): every attribute, property and event, controlled and
  uncontrolled use, CSP and bundle size.
- [Theming](../reference/theming.md): the `--pk-*` tokens, set on the element.
- [Use a report](../use/index.md): what the people using it can do.

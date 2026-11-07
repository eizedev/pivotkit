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

## The first report

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

With `save-templates` the Views menu offers "Save current view" under Saved views. The element asks the page with
a `pivot-template-save` event and waits for the answer you pass to `respondWith()`:

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
promise resolves and the error's message when it rejects.

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
`default-view='<?= htmlspecialchars(json_encode($view), ENT_QUOTES) ?>'`. Data never goes into an
attribute.

## Angular

The element is a standard custom element, so Angular's property and event bindings apply. This
example is not built or tested in the pivotkit repository:

```ts
import { Component, CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import "pivotkit-element";
import type { PivotView } from "pivotkit-element";

@Component({
    selector: "app-ticket-report",
    standalone: true,
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    template: `
        <pivot-report
            [data]="rows"
            [defaultView]="start"
            [templates]="templates"
            locale="de-DE"
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

Binding the stored view back as `[defaultView]` is fine: the element ignores the view it reported
itself. The report's React scheduler and ECharts' pointer listeners run in Angular's zone and may
trigger change detection (not measured); if that shows, create and feed the element outside the zone, as the [element reference](../reference/element.md#angular-and-zonejs)
shows how.

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

## Next

- [Element reference](../reference/element.md): every attribute, property and event, controlled and
  uncontrolled use, CSP and bundle size.
- [Theming](../reference/theming.md): the `--pk-*` tokens, set on the element.
- [Using the report](../guide.md).

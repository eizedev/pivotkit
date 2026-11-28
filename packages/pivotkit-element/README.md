# pivotkit-element

The pivot report builder of [pivotkit](https://pivotkit.eize.dev/) as one web component,
`<pivot-report>`, for pages without React: Angular apps, PHP and other server-rendered pages, plain
HTML. Everything the React component does works the same: field list, drag and drop, table and
chart, filters, drill-down, undo, saved and shared views, export.

![A line chart of monthly revenue per category](https://pivotkit.eize.dev/assets/screenshots/chart-light.png)

## Install

```bash
npm install pivotkit-element
```

- With a bundler, `import "pivotkit-element";` once. That defines `<pivot-report>`.
- Without a bundler, serve the package's whole `dist/` directory. `dist/index.js` loads its chunks by
  relative URL, so `index.js` alone is not enough.
- The package has no runtime dependency. The licenses of what it bundles are in
  `dist/THIRD_PARTY_LICENSES.txt`.
- Browsers: Chrome 111, Firefox 113, Safari 16.4 or later.

pivotkit is 0.x: a minor release can break things. [Versioning](https://pivotkit.eize.dev/versioning/)
says how each break is marked, [Upgrading](https://pivotkit.eize.dev/getting-started/upgrading/) what to do.

## Example

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
// an array of objects, property only
report.data = rows;
report.templates = [{ name: "By region", view: { rows: ["Region"] } }];
report.addEventListener("pivot-view-change", (e) =>
  localStorage.setItem("view", JSON.stringify(e.detail.view))
);
```

## How it works

- Brings its own React ([which version](https://pivotkit.eize.dev/browser-support/#react)),
  [pivotkit-react](https://www.npmjs.com/package/pivotkit-react),
  [pivotkit-core](https://www.npmjs.com/package/pivotkit-core) and @dnd-kit.
- Renders into an open shadow root.
- Loads ECharts on the first chart.

## Where in the docs

| Topic | Page |
| --- | --- |
| Getting started | [Web component guide](https://pivotkit.eize.dev/getting-started/web-component/) |
| Reference | [Element API](https://pivotkit.eize.dev/reference/element/), [Theming](https://pivotkit.eize.dev/reference/theming/), [Localisation](https://pivotkit.eize.dev/reference/localisation/) |
| Integration and usage | [Angular](https://pivotkit.eize.dev/getting-started/web-component/#angular), [PHP and server-rendered pages](https://pivotkit.eize.dev/getting-started/web-component/#php-and-other-server-rendered-pages), [Views](https://pivotkit.eize.dev/concepts/views/), [Recipes](https://pivotkit.eize.dev/embed/recipes/) |
| Security and compatibility | [Security](https://pivotkit.eize.dev/security/), [Browser support](https://pivotkit.eize.dev/browser-support/), [Limits](https://pivotkit.eize.dev/concepts/limits/) |
| Changelog | [CHANGELOG](https://github.com/eizedev/pivotkit/blob/main/packages/pivotkit-element/CHANGELOG.md) |

## License

[MIT](https://github.com/eizedev/pivotkit/blob/main/LICENSE). The bundled packages keep their own
licenses, listed in `dist/THIRD_PARTY_LICENSES.txt`.

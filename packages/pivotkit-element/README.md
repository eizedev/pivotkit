# pivotkit-element

The pivot report builder of [pivotkit](https://pivotkit.eize.dev/) as one web component,
`<pivot-report>`, for pages without React: Angular apps, PHP and other server-rendered pages, plain
HTML. Everything the React component does works the same: field list, drag and drop, table and
chart, filters, drill-down, undo, saved and shared views, export.

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
report.data = rows;                        // an array of objects, property only
report.templates = [{ name: "By region", view: { rows: ["Region"] } }];
report.addEventListener("pivot-view-change", (e) => localStorage.setItem("view", JSON.stringify(e.detail.view)));
```

## How it works

- It brings its own React ([which version](https://pivotkit.eize.dev/browser-support/#react)),
  [pivotkit-react](https://www.npmjs.com/package/pivotkit-react),
  [pivotkit-core](https://www.npmjs.com/package/pivotkit-core) and @dnd-kit.
- It renders into an open shadow root.
- It loads ECharts on the first chart.

![A line chart of monthly revenue per category](https://pivotkit.eize.dev/assets/screenshots/chart-light.png)

## Where in the docs

| Topic | Page |
| --- | --- |
| Getting started: install, first report, saving views on a server | [Getting started with the web component](https://pivotkit.eize.dev/getting-started/web-component/) |
| Loading files and the source data | [Load your own data](https://pivotkit.eize.dev/use/load-data/), [the table or the rows](https://pivotkit.eize.dev/use/export/#the-table-or-the-rows-behind-it) |
| PHP and server-rendered pages | [PHP and other server-rendered pages](https://pivotkit.eize.dev/getting-started/web-component/#php-and-other-server-rendered-pages) |
| Angular | [Angular](https://pivotkit.eize.dev/getting-started/web-component/#angular), [Angular and zone.js](https://pivotkit.eize.dev/reference/element/#angular-and-zonejs) |
| A page with React of its own | [React on the page](https://pivotkit.eize.dev/reference/element/#react-on-the-page) |
| Entries, loading from a CDN | [Entries](https://pivotkit.eize.dev/reference/element/#entries), [Loading](https://pivotkit.eize.dev/reference/element/#loading) |
| Every property and attribute | [Properties and attributes](https://pivotkit.eize.dev/reference/element/#properties-and-attributes) |
| Controlled and uncontrolled | [Controlled and uncontrolled](https://pivotkit.eize.dev/reference/element/#controlled-and-uncontrolled) |
| Events | [Events](https://pivotkit.eize.dev/reference/element/#events) |
| Styles and theming | [Styles](https://pivotkit.eize.dev/reference/element/#styles), [Theming](https://pivotkit.eize.dev/reference/theming/#on-the-web-component) |
| Languages and labels | [Localisation](https://pivotkit.eize.dev/reference/localisation/) |
| The view, saved and shared views | [Views and saved views](https://pivotkit.eize.dev/concepts/views/), [Templates and shared views](https://pivotkit.eize.dev/concepts/templates/), [View file format](https://pivotkit.eize.dev/reference/view-file/) |
| TypeScript | [Types](https://pivotkit.eize.dev/reference/element/#types) |
| Bundle size | [Bundle size](https://pivotkit.eize.dev/reference/element/#bundle-size) |
| Content-Security-Policy | [Security](https://pivotkit.eize.dev/security/#content-security-policy) |
| Limits | [Locale, time zones, limits and errors](https://pivotkit.eize.dev/concepts/limits/#limits) |
| Browser support | [Browser support](https://pivotkit.eize.dev/browser-support/) |
| Recipes | [Recipes](https://pivotkit.eize.dev/embed/recipes/) |
| What the people using the report can do | [Use a report](https://pivotkit.eize.dev/use/) |
| Try it | [Live demo and the element example](https://pivotkit.eize.dev/demo/#the-web-component-example), [feature list](https://pivotkit.eize.dev/features/), [FAQ](https://pivotkit.eize.dev/faq/) |
| Changes | [CHANGELOG](https://github.com/eizedev/pivotkit/blob/main/packages/pivotkit-element/CHANGELOG.md) |

## License

[MIT](https://github.com/eizedev/pivotkit/blob/main/LICENSE). The bundled packages keep their own
licenses, listed in `dist/THIRD_PARTY_LICENSES.txt`.

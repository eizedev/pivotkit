`<PivotReport>` with real public data and generated data to try in the browser.

Real data (snapshots in [data/](data/), fetched once by `npm run docs:data`; the page calls none of
the sources), each with four or five templates phrased as questions:

| `?data=` | What | Source, licence |
| --- | --- | --- |
| `weather` | Daily weather of 14 cities, 2023-2025 | Weather data by [Open-Meteo.com](https://open-meteo.com/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); contains modified Copernicus Climate Change Service information 2023 (ERA5) and 2019 (ERA5-Land), and ECMWF IFS data ([SOURCES.md](data/SOURCES.md)) |
| `countries` | Population, GDP and CO2 per country, 2005-2024 | [World Bank](https://data.worldbank.org/), World Development Indicators, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `earthquakes` | Earthquakes of magnitude 4.5 and more, 2025 | [U.S. Geological Survey](https://earthquake.usgs.gov/), public domain |
| `nobel` | Nobel Prize laureates, 1901-2026 | [Nobel Prize Outreach](https://www.nobelprize.org/about/developer-zone-2/), [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `endoflife` | Release cycles of 489 products with their release, support and end-of-life dates | [endoflife.date](https://endoflife.date/), [MIT](https://github.com/endoflife-date/endoflife.date/blob/master/LICENSE) |

[data/SOURCES.md](data/SOURCES.md) has the requests, what was changed and the terms of each source;
[data/sources.js](data/sources.js) the requests and the mapping from response to rows, which the
fetch script (`scripts/docs-data.js`) and the documentation's "Learn with real data" page share. The
page shows the attribution of the picked data set in its header.

Generated data, for the tests and the benchmarks: IT tickets (team, priority, status, created, lead
hours), sales (region, country, product, month, revenue, units) and assets per source system. The
rows come from a fixed seed, so every machine and every test run sees the same numbers; each of these
data sets has three start presets. The Views menu lists the presets as shared views, and for
endoflife.date also the views of its OpenAPI document (`x-pivotkit-views`, a demo extension the
playground adds to its copy in `src/shared-views.js`; `data/endoflife-openapi.json` stays the API's
document); views you save stay in this browser (`templateStore="browser"`), and the playground lets
everyone publish one as a shared view (`canPublish`), kept in this browser too, since it has no server.

```bash
npm ci
npm run playground          # build, watch and serve on http://localhost:5173
npm run build:playground    # static files in examples/playground/dist/
node examples/playground/serve.js 4173    # serve the static build
```

`dist/` is plain static files (`index.html`, `app.js`, `app.css`, `chunks/`) that open from any web
server, for example GitHub Pages or a test container. The build is esbuild only: the package is built
first and imported as a consumer imports it (`pivotkit-react` and `pivotkit-react/styles.css`).

URL parameters pick the start:

| Parameter | Effect |
| --- | --- |
| `data=weather\|countries\|earthquakes\|nobel\|endoflife\|tickets\|sales\|assets` | The data set. |
| `start=<the template's name in words>` | The start template, as the Start dropdown writes it. |
| `start=empty` or `empty` | An empty report. |
| `preset=0\|1\|2\|3\|4` | The start template by its place in the list. |
| `rows=2000\|4000\|100000` | The number of rows. Generated data only. |
| `lang=en\|de` | The language. |
| `height=480` | The report at that height in px, as a host's card gives it. |
| `grow=on` | With `height`: the report grows past that height when it needs more. |
| `theme=light\|dark` | Sets `<html data-theme>`, as PowerShell Universal does. Without it the report follows the system. |
| `import=off` | No loading of data: the report as a host shows it without `allowImport`. |

The footer shows the engine timings of the last change and the last `onCellClick`. The Data and Start dropdowns write `data` and `start` into the address,
and every change of the report writes its view into the fragment (`#pivot-playground=`, pivotkit's
share format, read back by the report's `shareLink`), so a reload keeps the report. Copy link in
Views copies `data`, `start`, `rows` (generated data) and the view: the playground passes that URL
as `shareLink`, so the viewer's language, theme and height stay out of it.

The header's **How do I…?** button opens the playground's help, never by itself: ten questions
(filter, a date range, top N, a chart, the rows behind a number, save and share, export, your own
file, adding a field, an example). Picking one rings the place in the live report, says in a few
sentences what to do there, and links to the docs page that owns the topic; **Show me** puts the
focus there for the visitor to try it. The questions, their places (test hooks, never classes), the
texts in English and German and the docs links are in [src/help-topics.js](src/help-topics.js);
`tests/playground-help.test.js` fails when a docs page or heading it names is gone, and
`tests/browser/playground-help.spec.js` when a place is not found. On the docs site the links are
relative; served on its own, the playground links to the published site (`site_url` of
`zensical.toml`).

The report is controlled (`view` + `onViewChange`) and the page renders again on every engine timing,
as a host does; the tickets data set gives "Lead hours" an average through `fieldDefaults`, the
assets data set shows its "Inventory number" as it is in the drill-down (`drillFormat: "text"`),
and published views are `deletable`, the presets are not. `?data=markup` is a small data set with labels that
look like HTML, for the browser test that nothing is rendered as markup.

The browser tests in [tests/browser](../../tests/browser/) run against this build and the test pages
of `tests/browser/pages/`, built into `dist/pages/` by `npm run build:playground`. The same command
builds pivotkit-element and copies it with its example ([examples/element](../element/)) into
`dist/packages/pivotkit-element/dist/` and `dist/examples/element/`, so the static server shows the
example at `/examples/element/`.

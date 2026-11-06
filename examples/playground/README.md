# pivotkit playground

`<PivotReport>` with generated data to try in the browser: IT tickets (team, priority, status, created,
lead hours), sales (region, country, product, month, revenue, units) and assets per source system. The
rows come from a fixed seed, so every machine and every test run sees the same numbers. Each data set
has three start presets; templates you save stay in this browser (localStorage).

```bash
npm ci
npm run playground          # build, watch and serve on http://localhost:5173
npm run build:playground    # static files in examples/playground/dist/
node examples/playground/serve.js 4173    # serve the static build
```

`dist/` is plain static files (`index.html`, `app.js`, `app.css`, `chunks/`) that open from any web
server, for example GitHub Pages or a test container. The build is esbuild only: the package is built
first and imported as a consumer imports it (`pivotkit-react` and `pivotkit-react/styles.css`).

URL parameters pick the start: `?data=tickets|sales|assets`, `rows=2000|4000|100000`, `preset=0|1|2`,
`empty`, `lang=en|de`, `theme=light|dark` (sets `<html data-theme>` as PowerShell Universal does;
without it the report follows the system). The footer shows the engine timings of the last change
and the last `onCellClick`.

The report is controlled (`view` + `onViewChange`) and the page renders again on every engine timing,
as a host does; the tickets data set gives "Lead hours" an average through `fieldDefaults`, and saved
templates are `deletable`, the presets are not. `?data=markup` is a small data set with labels that
look like HTML, for the browser test that nothing is rendered as markup.

The browser tests in [tests/browser](../../tests/browser/) run against this build and the test pages
of `tests/browser/pages/`, built into `dist/pages/` by `npm run build:playground`. The same command
builds pivotkit-element and copies it with its example ([examples/element](../element/)) into
`dist/packages/pivotkit-element/dist/` and `dist/examples/element/`, so the static server shows the
example at `/examples/element/`.

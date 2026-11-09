# pivotkit-react

The pivot report builder of [pivotkit](https://pivotkit.eize.dev/) as a React 18/19 component,
`<PivotReport>`: a searchable field list, four drop zones (Rows, Columns, Values, Filters) with drag
and drop and a menu on every field, table and chart (Apache ECharts), filters with value counts,
drill-down to the rows behind a value, undo and redo, saved and shared views as JSON files, and
Excel, CSV and PNG export. Excel's PivotTable is the reference; the engine is
[pivotkit-core](https://www.npmjs.com/package/pivotkit-core).

![The pivot report with real weather data: field list, the Filters, Columns, Rows and Values zones, and the average temperature of 14 cities by month as a colour scale](https://pivotkit.eize.dev/assets/screenshots/report-light.png)

<sub>Weather data by [Open-Meteo.com](https://open-meteo.com/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/));
contains modified Copernicus Climate Change Service information
([attribution](https://pivotkit.eize.dev/learn/#query-it-live)).</sub>

## Install

```bash
npm install pivotkit-react react react-dom echarts
```

| Peer | Range | Why a peer |
| --- | --- | --- |
| `react`, `react-dom` | `>=18.2 <20` | Hooks break with two copies of React in one page. Tested on React 18 and 19. |
| `echarts` | `>=6.1.0 <7` | About 1 MB, and its security updates stay with your app. Loaded on the first chart only. |

TypeScript declarations are included. pivotkit-core (a caret range) and @dnd-kit come with the
package. In 0.x a caret range spans patch
versions only (`^0.3.0` is 0.3.x): an app that also imports pivotkit-core itself must use a version
inside that range, since npm shares one copy only when the ranges overlap.

## Example

```jsx
import { useState } from "react";
import { PivotReport } from "pivotkit-react";
import "pivotkit-react/styles.css";

const start = { rows: ["Team"], cols: ["Priority"], values: [{ field: "Ticket", agg: "count" }] };

export function TicketReport({ rows }) {
    // controlled: the app keeps the view (and stores it); undo stays inside the report
    const [view, setView] = useState(start);
    return <PivotReport data={rows} dataKey="tickets" view={view} onViewChange={setView} locale="de-DE" height={640} />;
}
```

Without app state, `defaultView={start}` starts the report and it keeps the view itself. The view is
plain JSON: the preset, the saved view and the undo step at once. It is user input, checked against
the data; it cannot run code.

## Where in the docs

| Topic | Page |
| --- | --- |
| Getting started: install, first report, saved views, clicks | [Getting started with React](https://pivotkit.eize.dev/getting-started/react/) |
| Bundlers, import maps, PowerShell Universal | [Bundlers and import maps](https://pivotkit.eize.dev/getting-started/react/#bundlers-and-import-maps), [PowerShell Universal](https://pivotkit.eize.dev/getting-started/react/#powershell-universal) |
| Every prop | [Props](https://pivotkit.eize.dev/reference/react/#props), [props in detail](https://pivotkit.eize.dev/reference/react/#props-in-detail) |
| Controlled and uncontrolled | [Controlled and uncontrolled](https://pivotkit.eize.dev/reference/react/#controlled-and-uncontrolled) |
| Tips, layout, menus | [Tips](https://pivotkit.eize.dev/reference/react/#tips), [Layout](https://pivotkit.eize.dev/reference/react/#layout), [Menus](https://pivotkit.eize.dev/reference/react/#menus), [files the package loads](https://pivotkit.eize.dev/reference/react/#files-the-package-loads) |
| The view | [Views and saved views](https://pivotkit.eize.dev/concepts/views/) |
| Saved and shared views, links | [Templates and shared views](https://pivotkit.eize.dev/concepts/templates/), [Sharing](https://pivotkit.eize.dev/concepts/sharing/), [View file format](https://pivotkit.eize.dev/reference/view-file/) |
| Field names, descriptions, defaults | [Field descriptions and names](https://pivotkit.eize.dev/concepts/fields/) |
| Charts and `chartOptions` | [Charts](https://pivotkit.eize.dev/concepts/charts/#chartoptions-for-developers) |
| Theming: the `--pk-*` tokens | [Theming](https://pivotkit.eize.dev/reference/theming/) |
| Languages and labels | [Localisation](https://pivotkit.eize.dev/reference/localisation/) |
| Limits | [Locale, time zones, limits and errors](https://pivotkit.eize.dev/concepts/limits/#limits) |
| Performance | [Performance](https://pivotkit.eize.dev/reference/react/#performance) |
| Security | [Security](https://pivotkit.eize.dev/security/) |
| Browser support | [Browser support](https://pivotkit.eize.dev/browser-support/) |
| Recipes | [Recipes](https://pivotkit.eize.dev/embed/recipes/) |
| What the people using the report can do | [Use a report](https://pivotkit.eize.dev/use/), [Keyboard and screen readers](https://pivotkit.eize.dev/use/keyboard/) |
| Try it | [Live demo](https://pivotkit.eize.dev/demo/), [feature list](https://pivotkit.eize.dev/features/), [FAQ](https://pivotkit.eize.dev/faq/) |
| Changes | [CHANGELOG](https://github.com/eizedev/pivotkit/blob/main/packages/pivotkit-react/CHANGELOG.md) |

## License

[MIT](https://github.com/eizedev/pivotkit/blob/main/LICENSE)

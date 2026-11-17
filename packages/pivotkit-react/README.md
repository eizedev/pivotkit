# pivotkit-react

The pivot report builder of [pivotkit](https://pivotkit.eize.dev/) as a React 18/19 component,
`<PivotReport>`. People build pivot tables and charts from your data by drag and drop. Excel's
PivotTable is the reference. The engine is [pivotkit-core](https://www.npmjs.com/package/pivotkit-core).

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

- The package includes TypeScript declarations.
- pivotkit-core, pivotkit-report and @dnd-kit come with the package. It depends on pivotkit-core with
  a caret range.
- In 0.x a caret range spans patch versions only: `^0.y.z` means 0.y.z and later 0.y patches. If your
  app also imports pivotkit-core itself, use a version inside that range. npm shares one copy only
  when the ranges overlap.

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

Without app state, pass `defaultView={start}` instead, and the report keeps the view itself.

The view is plain JSON. It is the preset, the saved view and the undo step at once. The report treats
it as user input and checks it against the data. A view cannot run code.

## What it does

- A searchable field list.
- Four drop zones: Rows, Columns, Values and Filters, with drag and drop and a menu on every field.
- Table and chart. The chart uses Apache ECharts.
- Filters with value counts.
- Drill-down to the rows behind a value.
- Undo and redo.
- Saved and shared views as JSON files.
- Export to Excel, CSV, HTML report, PNG and SVG, and printing.

Two more features are off until the host turns them on:

- `allowImport`: people load their own CSV, JSON or Excel file, with a preview.
- `exportData`: people download the rows behind the report for the command line. It also gives
  the drill-down its copy and download. `drillDownExport` gives the drill-down those alone.

## Where in the docs

| Topic | Page |
| --- | --- |
| Getting started: install, first report, saved views, clicks | [Getting started with React](https://pivotkit.eize.dev/getting-started/react/) |
| Loading files and the source data | [Load your own data](https://pivotkit.eize.dev/use/load-data/), [the table or the rows](https://pivotkit.eize.dev/use/export/#the-table-or-the-rows-behind-it) |
| Bundlers, import maps, PowerShell Universal | [Bundlers and import maps](https://pivotkit.eize.dev/getting-started/react/#bundlers-and-import-maps), [PowerShell Universal](https://pivotkit.eize.dev/getting-started/react/#powershell-universal) |
| Every prop | [Props](https://pivotkit.eize.dev/reference/react/#props), [props in detail](https://pivotkit.eize.dev/reference/react/#props-in-detail) |
| Controlled and uncontrolled | [Controlled and uncontrolled](https://pivotkit.eize.dev/reference/react/#controlled-and-uncontrolled) |
| Tips, layout, menus | [Tips](https://pivotkit.eize.dev/reference/react/#tips), [Layout](https://pivotkit.eize.dev/reference/react/#layout), [Menus](https://pivotkit.eize.dev/reference/react/#menus), [files the package loads](https://pivotkit.eize.dev/reference/react/#files-the-package-loads) |
| The view | [Views and saved views](https://pivotkit.eize.dev/concepts/views/) |
| Saved and shared views, links | [Templates and shared views](https://pivotkit.eize.dev/concepts/templates/), [Sharing](https://pivotkit.eize.dev/concepts/sharing/), [View file format](https://pivotkit.eize.dev/reference/view-file/) |
| Field names, descriptions, defaults | [Field descriptions and names](https://pivotkit.eize.dev/concepts/fields/) |
| Charts, `colorMap` and `chartOptions` | [Charts](https://pivotkit.eize.dev/concepts/charts/#chartoptions-for-developers) |
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

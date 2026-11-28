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

pivotkit is 0.x: a minor release can break things. [Versioning](https://pivotkit.eize.dev/versioning/)
says how each break is marked, [Upgrading](https://pivotkit.eize.dev/getting-started/upgrading/) what to do.

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
- Four drop zones: Rows, Columns, Values and Filters, with drag and drop, "+ Add" in each zone and a
  menu on every field.
- Table and chart. The chart uses Apache ECharts.
- Filters with value counts.
- Dates grouped by year, quarter, month and more. The footer gives the data's date range, and a
  grouping such as "Month of year" says which years it combines.
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
| Getting started | [React guide](https://pivotkit.eize.dev/getting-started/react/) |
| Reference | [React props, events and layout](https://pivotkit.eize.dev/reference/react/), [Theming](https://pivotkit.eize.dev/reference/theming/), [Localisation](https://pivotkit.eize.dev/reference/localisation/) |
| Views and data | [Views](https://pivotkit.eize.dev/concepts/views/), [Fields](https://pivotkit.eize.dev/concepts/fields/), [Charts](https://pivotkit.eize.dev/concepts/charts/), [Loading data](https://pivotkit.eize.dev/use/load-data/) |
| Security and compatibility | [Security](https://pivotkit.eize.dev/security/), [Browser support](https://pivotkit.eize.dev/browser-support/), [Limits](https://pivotkit.eize.dev/concepts/limits/) |
| Changelog | [CHANGELOG](https://github.com/eizedev/pivotkit/blob/main/packages/pivotkit-react/CHANGELOG.md) |

## License

[MIT](https://github.com/eizedev/pivotkit/blob/main/LICENSE)

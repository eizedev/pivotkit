# pivotkit-react

The pivot report builder of pivotkit as a React 18/19 component: a searchable field list, four drop
zones (Rows, Columns, Values, Filters) with drag and drop and a menu on every field, table and chart
(Apache ECharts), filters with value counts, drill-down to the rows behind a value, undo and redo,
templates as JSON, and Excel, CSV and PNG export. The engine is [pivotkit-core](../pivotkit-core/).

Status: in development, not published to npm yet. Try it in the [playground](../../examples/playground/).

## Install

```bash
npm install pivotkit-react react react-dom echarts
```

React, ReactDOM and ECharts are peer dependencies: the host provides them, so there is one copy of
each in the page (PowerShell Universal provides React 18.3.1 at runtime). `@dnd-kit/core`,
`@dnd-kit/sortable` and `pivotkit-core` are regular dependencies, pinned exactly.

| Peer | Range | Why a peer |
| --- | --- | --- |
| `react`, `react-dom` | `>=18.2 <20` | Hooks break with two copies of React in one page. |
| `echarts` | `>=6.1.0 <7` | About 1 MB; a host that draws its own charts already has it, and its security updates stay with the host. It is loaded on the first chart (`import("echarts/core")` with bar, line, pie and heatmap only), so a report that never shows a chart does not load it. |

## Example

```jsx
import { PivotReport } from "pivotkit-react";
import "pivotkit-react/styles.css";

const presets = [
    { name: "Tickets per team", view: { rows: ["Team"], cols: ["Priority"], values: [{ field: "Ticket", agg: "count" }] } }
];

export function TicketReport({ rows, saved, onSave }) {
    return (
        <PivotReport
            data={rows}
            view={presets[0].view}
            templates={[...presets, ...saved]}
            onSaveTemplate={(name, view) => onSave({ name, view })}
            onCellClick={({ row, col, count }) => console.log(row, col, count)}
            locale="de-DE"
            height={640}
        />
    );
}
```

The view is pivotkit-core's view object: plain JSON that is the preset, the saved template and the
undo step at once. It is user input and is normalized against the data; it cannot run code.

## Props

| Prop | Type | Default | What |
| --- | --- | --- | --- |
| `data` | `object[]` | | The rows; encoded once per array (keep the array stable between renders). |
| `encoded` | `Encoded` | | Data already encoded with pivotkit-core's `encode()`, instead of `data`. |
| `view` | view | empty | The start view: a preset or a template. A different view (by value) starts a new history. |
| `onViewChange` | `(view) => void` | | Every change, as a normalized view. |
| `templates` | `{ name, view }[]` | `[]` | The Templates menu; the first three are also offered in the empty state. |
| `onSaveTemplate` | `(name, view) => void` | | Shows "Save current view" in the Templates menu. The host stores it. |
| `onDeleteTemplate` | `(name) => void` | | Shows a delete button per template. |
| `onCellClick` | `({ row, col, value, valueIndex, text, count, rows }) => void` | | A click (or Enter) on a value or a chart point: key paths of its row and column, the value, the number of source rows and the first `drillDownLimit` of them. |
| `drillDown` | `boolean` | `true` | The panel with the rows behind a clicked value. |
| `drillDownLimit` | `number` | `1000` | Rows passed to the panel and to `onCellClick`. |
| `locale` | `string` | `"en-US"` | Numbers, dates and sorting (a view's own `formatting.locale` wins), and the language of the labels: `de-*` picks German. |
| `timeZone` | `string` | `"UTC"` | The zone `data` is encoded in; see pivotkit-core. |
| `labels` | partial labels | | Texts merged over the language's labels, see below. |
| `theme` | `"auto" \| "light" \| "dark"` | `"auto"` | `auto` follows `<html data-theme="light\|dark">`, then `prefers-color-scheme`, and changes with them. |
| `height` | `number \| string` | `640` | The report's height; the table and the field list scroll inside it. |
| `limits` | `Partial<Limits>` | | pivotkit-core's limits. A layout over `limits.cells` shows a message instead of the table. |
| `className` | `string` | | Added to the root element `.pk-root`. |
| `fileName` | `string` | `"pivot"` | Name of exported files, without the extension. |

Exports: `PivotReport`, `LABELS` (`{ en, de }`), and the types `PivotReportProps`, `CellClick`,
`Template`. The stylesheet is `pivotkit-react/styles.css`.

## What the user can do

- Fields: search the list; drag a field into a zone (the lists and the page scroll while dragging, the
  dragged field is drawn above everything); click a field to add it (numbers to Values, the rest to
  Rows); or use its menu "Add to Rows / Columns / Values / Filters".
- Chips: drag to reorder or to another zone, drag back to the field list or press x to remove (the
  toast offers Undo). The menu of a row or column field has sort (label or value), date grouping
  (year, quarter, month, week, day, hour, weekday and the year combinations), number bins, top or
  bottom N, filter, and move. The menu of a value has the aggregator, "show values as", the number
  format, highlighting (colour scale, data bars), its name, and move.
- Filters: values with row counts, search, select all or none, "only this value", a label condition
  (contains, begins with, ...). A field in the Filters zone filters the whole report.
- Table: sticky header and row labels, groups expand and collapse, subtotals and grand totals on and
  off (Options), a click on a value opens its rows. Field names and value names in the header can be
  dragged into a zone. From 300 body rows on only the visible rows are rendered.
- Chart: bars, stacked bars, horizontal bars, lines, area, pie, heatmap; a click on a bar, a point or a heatmap cell
  opens its rows.
- Toolbar: Table or Chart, Undo (Ctrl/Cmd+Z), Redo (Ctrl/Cmd+Shift+Z or Ctrl+Y), Reset to the start
  view, Options, Templates, Export (XLSX and CSV of the table, PNG of the chart).
- Keyboard: every control is a button or input; menus move with the arrow keys and close with Escape;
  a chip's handle picks it up with Space (arrows move it, Space drops, Escape cancels); the table's
  values move with the arrow keys and open with Enter. Actions are announced in a live region.

## Layout

The report adapts to its own width, not the window's: wide (1024 px and more) has the field list on
the left and the zones in a 2 x 2 grid; medium narrows the field list; narrow (below 640 px) opens the
field list as a drawer from the toolbar, stacks the zones, and shows menus as bottom sheets. Only the
table scrolls sideways.

## Theming

Every colour, size and duration is a CSS custom property on `.pk-root`. The defaults have zero
specificity (`:where()`), so a plain rule on `.pk-root` or on your `className` overrides them. Light
and dark are selected with `data-pk-theme` on the root, which the `theme` prop sets.

```css
/* a host mapping its own theme, for example PowerShell Universal */
.pk-root {
    --pk-accent: var(--host-primary);
    --pk-radius: 4px;
}
html[data-theme="dark"] .pk-root {
    --pk-surface: #101418;
    --pk-text: #e6e6e6;
}
```

| Token | Light | What |
| --- | --- | --- |
| `--pk-font` | the host's | Font family; unset, the report inherits the page's font. |
| `--pk-font-size` | `max(14px, 1em)` | Body text: the host's size, at least 14 px. Other sizes are relative to it. |
| `--pk-surface`, `--pk-surface-2`, `--pk-surface-3`, `--pk-surface-raised` | `#ffffff`, `#f6f7f9`, `#eceff3`, `#ffffff` | Background, panels and zones, hover, popovers |
| `--pk-text`, `--pk-muted` | `#1a1d23`, `#5a6270` | Text, secondary text |
| `--pk-border`, `--pk-border-strong`, `--pk-grid` | `#dde1e7`, `#c3c9d2`, `#edf0f3` | Borders, table lines |
| `--pk-accent`, `--pk-accent-text`, `--pk-accent-soft` | `#2b5fd9`, `#ffffff`, `#e9effc` | Primary buttons, selection, text on the accent, soft highlight |
| `--pk-drop` | `#dfe8fd` | A zone while something is dragged over it |
| `--pk-total`, `--pk-total-strong` | `#f4f6f9`, `#e9edf3` | Subtotal and grand total rows |
| `--pk-danger`, `--pk-focus` | `#b42318`, `#2b5fd9` | Remove and errors; the focus ring |
| `--pk-radius`, `--pk-radius-sm` | `10px`, `7px` | Corners of panels, of buttons and chips |
| `--pk-shadow`, `--pk-shadow-lg` | | Chips and buttons; popovers, drawer, drag preview |
| `--pk-row-h` | `2.45em` | Height of a table row |
| `--pk-panel-w` | `268px` | Width of the field list |
| `--pk-duration`, `--pk-ease` | `180ms` | Animations; `0ms` with `prefers-reduced-motion: reduce` |
| `--pk-type-string`, `--pk-type-number`, `--pk-type-date`, `--pk-type-boolean` | | Field type icons |
| `--pk-chart-1` ... `--pk-chart-8` | `#2a78d6` ... | Chart series colours, in this order; read by ECharts |
| `--pk-heat-low`, `--pk-heat-high` | `#eaf1fb`, `#2a78d6` | Heatmap scale |

The dark defaults are in `styles.css`. Both themes meet WCAG contrast (4.5:1 for text, 3:1 for
interface colours); `test/contrast.test.js` checks it.

## Labels

`locale` picks English or German; `labels` overrides single texts (merged deeply). `labels.core`
holds the texts pivotkit-core writes into the table and the chart.

```jsx
<PivotReport data={rows} locale="de-DE" labels={{ zones: { values: "Kennzahlen" }, core: { grandTotal: "Summe" } }} />
```

All keys are in `LABELS.en` (`src/labels.js`); `{name}` placeholders are filled in.

## Performance

The pivot is computed once per view and the table body is virtualized. Measured in the playground
(Chromium, Firefox and WebKit from Playwright 1.64.1 on darwin/arm64, other machines differ), in ms:

| Rows | `encode` (once) | `computePivot` | `toGrid` | Change to next frame |
| ---: | ---: | ---: | ---: | ---: |
| 2,000 | 4-7 | 1-4 | 0-3 | 11-34 |
| 4,000 | 6-8 | 2-3 | 0-2 | 10-37 |
| 100,000 | 93-117 | 8-31 | 0-18 | 18-64 |
| 100,000, 100,000 distinct row labels | 114 | 72 | 29 | 112 |

A change stays within a frame or two, so the engine runs on the main thread; a Web Worker would add
copying the columns and the grid between threads for no visible gain. The timings are in the
browser's performance timeline as `pivotkit:encode`, `pivotkit:computePivot` and `pivotkit:toGrid`.

## Development

```bash
npm run build -w pivotkit-react    # dist/index.js and dist/styles.css (esbuild)
npm test -w pivotkit-react         # build, then node --test: view changes, labels, theme, layout, server render, contrast
npm run playground                 # the playground with rebuilds on http://localhost:5173
npm run test:browser               # Playwright: the playground in Chromium, Firefox and WebKit
```

The build compiles JSX to `React.createElement`, so the host needs `react` and `react-dom` only (no
JSX runtime), and keeps every dependency as an import for the host's bundler.

## License

[MIT](../../LICENSE)

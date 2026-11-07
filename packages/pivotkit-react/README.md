# pivotkit-react

Documentation: [pivotkit.eize.dev](https://pivotkit.eize.dev/reference/react/) - getting started, every prop, theming, localisation, a [guide for the people using the report](https://pivotkit.eize.dev/guide/) and a [live demo](https://pivotkit.eize.dev/demo/).

The pivot report builder of pivotkit as a React 18/19 component: a searchable field list, four drop
zones (Rows, Columns, Values, Filters) with drag and drop and a menu on every field, table and chart
(Apache ECharts), filters with value counts, drill-down to the rows behind a value, undo and redo,
templates as JSON, and Excel, CSV and PNG export. The engine is [pivotkit-core](https://github.com/eizedev/pivotkit/tree/main/packages/pivotkit-core#readme).

Version 0.1.0. Try it in the [playground](https://pivotkit.eize.dev/demo/).

## Install

```bash
npm install pivotkit-react react react-dom echarts
```

React, ReactDOM and ECharts are peer dependencies: the host provides them, so there is one copy of
each in the page (PowerShell Universal provides React 18.3.1 at runtime). `pivotkit-core` (a caret
range on its current version) and `@dnd-kit/core` and `@dnd-kit/sortable` (pinned exactly) are
regular dependencies. A host that also uses pivotkit-core directly must use a version inside that
range: in 0.x a caret range spans patch versions only (`^0.1.0` matches 0.1.x), and npm shares
one copy of the core only when the ranges overlap.

| Peer | Range | Why a peer |
| --- | --- | --- |
| `react`, `react-dom` | `>=18.2 <20` | Hooks break with two copies of React in one page. CI runs every browser test on React 18 and on React 19. |
| `echarts` | `>=6.1.0 <7` | About 1 MB; a host that draws its own charts already has it, and its security updates stay with the host. It is loaded on the first chart (`dist/echarts.js`: bar, line, pie and heatmap, the components they use and the canvas renderer, imported by name so a bundler keeps only these), so a report that never shows a chart does not load it. |

`dist/index.js` is an ES module whose imports stay bare: `react`, `react-dom`, `pivotkit-core`,
`pivotkit-core/export`, `@dnd-kit/core` and `@dnd-kit/sortable`. On the first chart it loads
`./echarts.js` next to it, whose imports `echarts/core`, `echarts/charts`, `echarts/components` and
`echarts/renderers` stay bare too (named imports only). A host's bundler resolves them; a page without a bundler
maps each to a file with an import map (`tests/browser/pages/build.js` builds such a page, and the
browser tests load the package that way).

## Example

```jsx
import { useState } from "react";
import { PivotReport } from "pivotkit-react";
import "pivotkit-react/styles.css";

const presets = [
    { name: "Tickets per team", view: { rows: ["Team"], cols: ["Priority"], values: [{ field: "Ticket", agg: "count" }] } }
];

export function TicketReport({ rows, saved, saveTemplate, deleteTemplate }) {
    // controlled: the host keeps the view (and stores it); undo stays inside the report
    const [view, setView] = useState(presets[0].view);
    return (
        <PivotReport
            data={rows}
            dataKey="tickets"
            view={view}
            onViewChange={setView}
            templates={[...presets, ...saved.map((t) => ({ ...t, deletable: true }))]}
            onSaveTemplate={(name, v) => saveTemplate({ name, view: v })}
            onDeleteTemplate={(name) => deleteTemplate(name)}
            fieldDefaults={{ "Lead hours": { agg: "average", format: "duration:h" } }}
            onCellClick={({ row, col, count }) => console.log(row, col, count)}
            locale="de-DE"
            height={640}
        />
    );
}
```

Without a host state, `defaultView={presets[0].view}` starts the report and it keeps the view itself.
The view is pivotkit-core's view object: plain JSON that is the preset, the saved template and the
undo step at once. It is user input and is normalized against the data; it cannot run code.

## Props

| Prop | Type | Default | What |
| --- | --- | --- | --- |
| `data` | `object[]` | | The rows; encoded once per array, or once per `dataKey`. |
| `dataKey` | `string \| number` | | The identity of `data`: a host that builds a new array on every render passes a key, and the rows are encoded again only when it changes. |
| `encoded` | `Encoded` | | Data already encoded with pivotkit-core's `encode()`, instead of `data`. |
| `view` | view | | Controlled: the view to show. Pass back what `onViewChange` gives; the undo history stays in the report however often the host renders. A view the host changes on its own becomes one undo step. |
| `defaultView` | view | empty | Uncontrolled: the start view. |
| `onViewChange` | `(view) => void` | | Every change, as a normalized view. |
| `templates` | `{ name, view, deletable? }[]` | `[]` | The Templates menu; the first three are also offered in the empty state. `deletable: true` shows a delete button for that template. Names need not be unique: every entry is shown in order (a saved template may have a preset's name), and `onDeleteTemplate` gets the name. |
| `onSaveTemplate` | `(name, view) => unknown` | | Shows "Save current view". "Saved" is shown when it returns or the promise it returns resolves; an error when it throws or rejects: with the host's message when it gives one (an `Error`, a text), else "The server could not save the template." (`labels.toastSaveRejected`). |
| `onDeleteTemplate` | `(name) => unknown` | | Deletes a template marked `deletable`, after the user confirmed in the menu; the entry goes when it returns or its promise resolves; a failure is shown as for `onSaveTemplate` (`labels.toastDeleteRejected` without a message). |
| `fieldDefaults` | `{ [field]: { agg?, format?, drillFormat?, order? } }` | | The aggregator and the format a field gets when it is added to Values (an average for a duration, say). An aggregator that does not fit the field's type is ignored. Another aggregator picked in the value's menu keeps `format` while the result is in the field's unit (an average to a median), not for a count; a format the user chose stays the same way. In the drill-down, `drillFormat` (else `format`) formats the field's own values: `"text"` shows a numeric identifier as it is (40072, not 40,072), `"date"` a date without its time. `order` is the field's own order of items (`["Spring", "Summer", "Autumn", "Winter"]`): the field is sorted in it when it is placed on Rows or Columns (a `custom` sort in the view, so a template keeps it), and so is a field on Rows or Columns of a view or template without a sort entry for it; its menu offers "Custom order" and "Custom order, reversed", and "A to Z" stays a sort entry of its own; items not listed follow by label. |
| `onCellClick` | `({ row, col, value, valueIndex, text, count, rows }) => void` | | A click (or Enter) on a value or a chart point: key paths of its row and column, the value, the number of source rows and the first `drillDownLimit` of them. A blank cell with no rows behind it is not clickable. |
| `drillDown` | `boolean` | `true` | The panel with the rows behind a clicked value. |
| `drillDownLimit` | `number` | `1000` | Rows passed to the panel and to `onCellClick`. |
| `locale` | `string` | `"en-US"` | Numbers, dates and sorting (a view's own `formatting.locale` wins), and the language of the labels: `de-*` picks German. |
| `timeZone` | `string` | `"UTC"` | The zone `data` is encoded in; see pivotkit-core. |
| `labels` | partial labels | | Texts merged over the language's labels, see below. |
| `theme` | `"auto" \| "light" \| "dark"` | `"auto"` | `auto` follows the nearest `data-theme="light\|dark"` above the report (`<html>`, or a shadow root's host), then `prefers-color-scheme`, and changes with them. |
| `height` | `number \| string` | `640` | The report's height; the table and the field list scroll inside it. |
| `limits` | `Partial<Limits>` | | pivotkit-core's limits. Data over `limits.rows`, or a layout over `limits.work`, `limits.groups`, `limits.pivotCells` or `limits.cells`, shows a message in place of the result that says what to change (`labels.tooManyRows`, `tooMuchWork`, `tooManyGroups`, `tooManyCells`, `tooLarge`). A field beyond `limits.axisFields` or `limits.values` is refused with a note (`zoneFull`); a template with more loads the fields that fit and says so (`templateTrimmed`). |
| `label` | `string` | `labels.report` | The name of the report's region landmark ("Pivot report"). Several reports on one page need one name each (`label="Tickets per team"`), so a screen reader can tell them apart. |
| `className` | `string` | | Added to the root element `.pk-root`. |
| `fileName` | `string` | `"pivot"` | Name of exported files, without the extension; path separators and characters a file system refuses are replaced. |
| `onExport` | `({ kind, fileName, blob }) => unknown` | | Every exported file (`"xlsx"`, `"csv"` or `"png"`, the name with its extension, the file) before it is downloaded; returning `false` skips the download, so the host can keep the file (upload it, say). |

Exports: `PivotReport`, `LABELS` (`{ en, de }`), and the types `PivotReportProps`, `CellClick`,
`ExportFile`, `Template`, `FieldDefaults`, `View`, `ViewInput` (a view as a host passes it), `UiLabels` and
`PartialLabels`. The stylesheet is `pivotkit-react/styles.css`.

## What the user can do

- Fields: search the list; drag a field into a zone (the lists and the page scroll while dragging, the
  dragged field is drawn above everything); click a field to add it (numbers to Values, the rest to
  Rows; a field in Columns or Filters moves to Rows, one in Rows stays and the status line says
  so, and the field's description says which); or use its menu "Add to Rows / Columns / Values / Filters". A date is grouped as soon as it
  is placed, by the span of its values: up to 62 days by day, up to two years by month ("Jan 2025"),
  up to six years by quarter, longer by year; the chip says so ("Created (Month)").
- Chips: drag to reorder or to another zone, drag back to the field list or press x to remove (a note
  under the table offers Undo). A chip shows what is set on it: "3 of 4" for a filter, "Top 5", the
  sort. The menu of a row or column field has sort (label or value, and the custom order of the view
  or of `fieldDefaults`), date grouping (along the time line: year, quarter, month, week, day; or
  across years: quarter, month, week of the year, weekday, hour), number ranges (their size and where
  they start, Excel's "Starting at"; a new size keeps the start, an empty start is 0, a start too far
  from the field's numbers is refused with a note), top or bottom N, filter, and move. The menu of a value has the aggregator (sum,
  count, average, minimum, maximum; the statistics under "More statistics"), "show as" (the header
  then says it: "% of grand total of Revenue"), the number format, highlighting (colour scale, data
  bars), its name, and move; Remove stays at the foot of every menu.
- Filters: values with row counts, search, select all or none, "only this value", a text condition
  (contains, begins with, ...). A field in the Filters zone filters the whole report.
- Notes above the result say what a top N does to totals and percentages ("Country shows the top 5
  only: ..."), what to do next when nothing is in Values, and how to open a value.
- Drill-down: a click on a value opens a panel with the rows behind it (a blank cell with no rows
  behind it opens nothing; the arrow keys still stop on it), formatted as the table
  formats them: dates as dates (with the time when the column has times), numbers in the locale,
  yes/no fields as "Yes" and "No" (`labels.core.true`, `false`), and a field's `fieldDefaults` format.
- Table: sticky header and row labels, groups expand and collapse, subtotals and grand totals on and
  off (Options), a click on a value opens its rows. Field names and value names in the header can be
  dragged into a zone with the mouse; the chips' menus do the same from the keyboard. One value's name
  is a single header over all of its columns, as in Excel. From 300 body rows on only the visible rows
  are rendered. The table is as wide as its columns; the row label columns share at most 40 % of the
  report's main area (each at least 4.5em) and a value's name wraps beyond 30 %, so a long label wraps
  and a phone still shows values next to it (from 300 rows on, where rows have one height, it is cut with an ellipsis: its full text is
  the cell's title, and the status line shows the whole row label of a tapped label or of the focused value).
- Chart: bars, stacked bars, horizontal bars, lines, area, pie, heatmap ("Chart type: Bars" in the
  toolbar); a click on a bar, a point or a heatmap cell opens its rows. At most 50 categories are
  drawn, with a note; more than 8 series, or lines with the dates on Columns, get a hint with "Swap
  rows and columns" (also above the Columns zone). The tooltip is built as DOM nodes with the data's
  texts as text and its styles set through the CSSOM, so a Content-Security-Policy without
  `style-src 'unsafe-inline'` allows it.
- Toolbar: Table or Chart, the chart type, Undo (Ctrl/Cmd+Z), Redo (Ctrl/Cmd+Shift+Z or Ctrl+Y),
  Reset to the start view, Layout (the zones folded into one line or open), Options, Templates,
  Export (XLSX and CSV of the table, PNG of the chart). Every button has its text; when the report is
  too narrow, Reset, Redo, Layout, Templates, Options and the chart type move one by one into a
  "More" menu.
- Notes ("Undone: Region removed", "Exported pivot.xlsx") appear in the status line under the table,
  stay while the pointer or the focus is on them, and errors stay until closed. Adding a field shows
  none: the chip is the feedback.
- Keyboard and screen readers: every control is a button or input of at least 24 x 24 px; menus move
  with the arrow keys and close with Tab or Escape (also when the focus is elsewhere on the page); the
  drill-down, the narrow field drawer and bottom sheets keep the focus inside and give it back. A chip
  or field handle picks it up with Space; Left and Right move it within a zone, Up and Down to the zone
  above or below, with its position announced ("Region is over Rows, position 2 of 3"); Space drops,
  Escape cancels. The table's values move with the arrow keys and open with Enter, an empty one included
  (a screen reader hears "No rows" or "No value", `labels.emptyCell`, `labels.emptyValue`); the table has a
  name and a described hint. The chart canvas has a text alternative (type, values, counts, highest
  and lowest value). The report's `lang` follows its labels. The report is a region landmark named
  by `labels.report` ("Pivot report"), not a `<main>`, so it fits inside the host page's own main
  landmark.

For hosts: while a popover, the drill-down or the narrow field drawer of the report is open, the
report listens for Escape on the whole document and closes its newest layer, also when the focus is
outside the report. A host that opens a dialog of its own over an open report layer gets that Escape
to the report first; close the report's layer before, or open the dialog when none is open.

## Layout

The report adapts to its own width, not the window's: wide (1024 px and more) has the field list on
the left and the zones in a 2 x 2 grid; medium narrows the field list; narrow (below 640 px) opens the
field list as a drawer from the toolbar and shows menus as bottom sheets. The zones stack, one line
each, whenever the area next to the field list is narrower than 640 px (a container query on that
area: the narrow layout, and a medium one such as a half-width card of 650 px). "Swap rows and
columns" shows its icon only, with its name for screen readers and as a tooltip, when the head of the
Columns zone is too narrow for the text. Only the table scrolls sideways.

Below 540 px of height (`COMPACT_HEIGHT` in `PivotReport.jsx`, the border box, measured before the
first paint) the report starts in the compact layout: the zones fold into one line that says what is in them ("Rows: Team · Columns: Priority ·
Values: Count of Ticket"), so the table keeps its room. A click on that line, or Layout in the
toolbar, opens them; Layout folds them again, and stays in the toolbar (not in "More") while they
are folded. The line only shows what is placed: to change a chip, open the zones first. A drag from
the field list or the table opens them while it lasts, so a field can still be dropped. When the
report gets lower while a menu or popover is open, the fold waits until it closes; a focus in the
zones moves to the folded line. The user's choice is state of the mounted report: it
survives the host's renders, and it is not part of the view, so a template does not carry it. In the narrow layout the zones sit above the table, so a report of a fixed
640 px leaves little room for it on a phone: give it more height there, for example
`height="calc(100svh - 24px)"` (the page scrolls to the report, the table scrolls inside it).

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
| `--pk-drop`, `--pk-drop-border` | `#dfe8fd`, `#868e9a` | A zone while something is dragged over it; the dashed edge of a zone (3:1) |
| `--pk-note` | `#eef3fd` | Notes and hints above the result |
| `--pk-scale-low`, `--pk-scale-mid`, `--pk-scale-high` | `#f8696b`, `#ffeb84`, `#63be7b` | A colour scale whose view names no colours |
| `--pk-small`, `--pk-target` | `max(14px, 0.93em)`, `24px` | Secondary text, never below 14 px; the smallest hit area of a control |
| `--pk-shadow-sm`, `--pk-scrim`, `--pk-scrim-light`, `--pk-knob` | | Chip shadow; behind sheets and the drawer; behind the drill-down; the knob of a switch |
| `--pk-total`, `--pk-total-strong` | `#f4f6f9`, `#e9edf3` | Subtotal and grand total rows |
| `--pk-danger`, `--pk-focus` | `#b42318`, `#2b5fd9` | Remove and errors; the focus ring |
| `--pk-radius`, `--pk-radius-sm` | `10px`, `7px` | Corners of panels, of buttons and chips |
| `--pk-shadow`, `--pk-shadow-lg` | | Chips and buttons; popovers, drawer, drag preview |
| `--pk-row-h` | `2.45em` | Height of a table row |
| `--pk-panel-w` | `268px` | Width of the field list; at most 244 px in the medium layout |
| `--pk-duration`, `--pk-ease` | `180ms` | Animations; `0ms` with `prefers-reduced-motion: reduce` |
| `--pk-type-string`, `--pk-type-number`, `--pk-type-date`, `--pk-type-boolean` | | Field type icons |
| `--pk-chart-1` ... `--pk-chart-8` | `#2a78d6` ... | Chart series colours, in this order; read by ECharts |
| `--pk-heat-low`, `--pk-heat-high` | `#eaf1fb`, `#2a78d6` | Heatmap scale |

The dark defaults are in `styles.css`. Both themes meet WCAG contrast (4.5:1 for text, 3:1 for
interface colours); `test/contrast.test.js` checks it.

## Labels

`locale` picks English or German; `labels` overrides single texts (merged deeply; an entry of the
wrong type is ignored). `labels.core` holds the texts pivotkit-core writes into the table and the
chart. Another language is a whole labels object with its own `lang` (the report's `lang`
attribute), passed as `labels`; there is no registry of languages.

```jsx
<PivotReport data={rows} locale="de-DE" labels={{ zones: { values: "Kennzahlen" }, core: { grandTotal: "Summe" } }} />
```

All keys are in `LABELS.en` (`src/labels.js`); `{name}` placeholders are filled in. A count (`rowsCount`,
`drillCount`, `chartCategories`, `chartSeries`) is an object with one text per plural category of
the language, picked with `Intl.PluralRules` for the labels' `lang`:
`{ one: "{count} row", other: "{count} rows" }`; a language with more forms adds them (`few`,
`many`), a missing form falls back to `other`.

## Performance

The pivot is computed once per view and the table body is virtualized. Approximate numbers, measured
by hand in the playground on one Mac (Chromium, Firefox and WebKit from Playwright 1.64.1 on
darwin/arm64); no test backs them and other machines differ, in ms:

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
npm test -w pivotkit-react         # build, then node --test: view changes, history, keyboard moves, labels, chart text, files, server render, contrast
npm run coverage -w pivotkit-react # the same with coverage of the .js modules (the .jsx components are covered by the browser tests, without a number)
npm run playground                 # the playground with rebuilds on http://localhost:5173
npm run test:browser               # Playwright in Chromium, Firefox and WebKit: the playground, a host page with React from an import map, a shadow root
PIVOTKIT_REACT=19 npm run test:browser   # the same on React 19, after npm ci --prefix tests/react19
```

The build compiles JSX to `React.createElement`, so the host needs `react` and `react-dom` only (no
JSX runtime), and keeps every dependency as an import for the host's bundler.

## License

[MIT](https://github.com/eizedev/pivotkit/blob/main/LICENSE)

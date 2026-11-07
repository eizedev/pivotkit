---
title: pivotkit-react reference
description: Every prop of <PivotReport>, the package's exports, its layout at every width and its performance.
---

# pivotkit-react reference

```jsx
import { PivotReport, LABELS } from "pivotkit-react";
import "pivotkit-react/styles.css";
```

Installation and a first example are in [Getting started with React](../getting-started/react.md).

## Props

| Prop | What |
| --- | --- |
| `data` | The rows; encoded once per array, or once per `dataKey`.<br><small>Type: `object[]`</small> |
| `dataKey` | The identity of `data`: a host that builds a new array on every render passes a key, and the rows are encoded again only when it changes.<br><small>Type: `string` or `number`</small> |
| `encoded` | Data already encoded with pivotkit-core's `encode()`, instead of `data`.<br><small>Type: `Encoded`</small> |
| `view` | Controlled: the view to show. Pass back what `onViewChange` gives; the undo history stays in the report however often the host renders. A view the host changes on its own becomes one undo step.<br><small>Type: view</small> |
| `defaultView` | Uncontrolled: the start view.<br><small>Type: view; default: empty</small> |
| `onViewChange` | Every change, as a normalized view.<br><small>Type: `(view) => void`</small> |
| `templates` | The Templates menu; the first three are also offered in the empty state. `deletable: true` shows a delete button for that template. Names need not be unique: every entry is shown in order (a saved template may have a preset's name), and `onDeleteTemplate` gets the name.<br><small>Type: `{ name, view, deletable? }[]`; default: `[]`</small> |
| `onSaveTemplate` | Shows "Save current view". "Saved" is shown when it returns or the promise it returns resolves; an error when it throws or rejects: with the host's message when it gives one (an `Error`, a text), else "The server could not save the template." (`labels.toastSaveRejected`).<br><small>Type: `(name, view) => unknown`</small> |
| `onDeleteTemplate` | Deletes a template marked `deletable`, after the user confirmed in the menu; the entry goes when it returns or its promise resolves; a failure is shown as for `onSaveTemplate` (`labels.toastDeleteRejected` without a message).<br><small>Type: `(name) => unknown`</small> |
| `fieldDefaults` | The aggregator and the format a field gets when it is added to Values (an average for a duration, say). An aggregator that does not fit the field's type is ignored. Another aggregator picked in the value's menu keeps `format` while the result is in the field's unit (an average to a median), not for a count; a format the user chose stays the same way. In the drill-down, `drillFormat` (else `format`) formats the field's own values: `"text"` shows a numeric identifier as it is (40072, not 40,072), `"date"` a date without its time. `order` is the field's own order of items (`["Spring", "Summer", "Autumn", "Winter"]`): the field is sorted in it when it is placed on Rows or Columns (a `custom` sort in the view, so a template keeps it), and so is a field on Rows or Columns of a view or template without a sort entry for it; its menu offers "Custom order" and "Custom order, reversed", and "A to Z" stays a sort entry of its own; items not listed follow by label. `label` is the name the report shows for the field (chips, headers, value names such as "Sum of Net revenue", the drill-down, the chart and the exported files); views and templates keep the field's own name. `description` (plain text, at most 1,000 characters) shows behind an "i" next to the field and on its chips, at the top of its chip menu and on its table headers; `href`, an https link, adds "Learn more". A field without them looks as it does without `fieldDefaults`. `type` reads the field's column as `"number"`, `"date"`, `"string"` or `"boolean"` (pivotkit-core's `encode` `types`). pivotkit-core's `fieldDefaultsFromSchema` builds all of it from a JSON Schema or an OpenAPI document: [Field descriptions and names](../concepts/fields.md).<br><small>Type: `{ [field]: { agg?, format?, drillFormat?, order?, label?, description?, href?, type? } }`</small> |
| `onCellClick` | A click (or Enter) on a value or a chart point: key paths of its row and column, the value, the number of source rows and the first `drillDownLimit` of them. A blank cell with no rows behind it is not clickable and does not call it.<br><small>Type: `({ row, col, value, valueIndex, text, count, rows }) => void`</small> |
| `drillDown` | The panel with the rows behind a clicked value.<br><small>Type: `boolean`; default: `true`</small> |
| `drillDownLimit` | Rows passed to the panel and to `onCellClick`.<br><small>Type: `number`; default: `1000`</small> |
| `locale` | Numbers, dates and sorting (a view's own `formatting.locale` wins), and the language of the labels: `de-*` picks German.<br><small>Type: `string`; default: `"en-US"`</small> |
| `timeZone` | The zone `data` is encoded in; see pivotkit-core.<br><small>Type: `string`; default: `"UTC"`</small> |
| `labels` | Texts merged over the language's labels, see [Localisation](localisation.md).<br><small>Type: partial labels</small> |
| `theme` | `auto` follows the nearest `data-theme="light"` or `data-theme="dark"` above the report (`<html>`, or a shadow root's host), then `prefers-color-scheme`, and changes with them.<br><small>Type: `"auto"` or `"light"` or `"dark"`; default: `"auto"`</small> |
| `height` | The report's height; the table and the field list scroll inside it.<br><small>Type: `number` or `string`; default: `640`</small> |
| `limits` | pivotkit-core's [limits](../concepts/limits.md#limits). Data over `limits.rows`, or a layout over `limits.work`, `groups`, `pivotCells` or `cells`, shows a message in place of the result that says what to change; a field beyond `limits.axisFields` or `limits.values` is refused with a note, and a template with more loads the fields that fit and says so.<br><small>Type: `Partial<Limits>`</small> |
| `label` | The name of the report's region landmark ("Pivot report"). Several reports on one page need one name each (`label="Tickets per team"`), so a screen reader can tell them apart.<br><small>Type: `string`; default: `labels.report`</small> |
| `className` | Added to the root element `.pk-root`.<br><small>Type: `string`</small> |
| `fileName` | Name of exported files, without the extension; path separators and characters a file system refuses are replaced.<br><small>Type: `string`; default: `"pivot"`</small> |
| `onExport` | Every exported file (`"xlsx"`, `"csv"` or `"png"`, the name with its extension, the file) before it is downloaded; returning `false` skips the download, so the host can keep the file (upload it, say).<br><small>Type: `({ kind, fileName, blob }) => unknown`</small> |
| `tips` | The [tips](#tips) above the result: `"on"`, `"off"` (none, and no switch in Options), or the ids of the tips allowed, as an array or a comma-separated text.<br><small>Type: `"on"` or `"off"` or `string` or `string[]`; default: `"on"`</small> |
| `storageKey` | Remembers the dismissed tips in the browser's `localStorage` under `pivotkit:tips:<storageKey>`. Give each report on a page its own key. Without it the tips stay dismissed until the page is loaded again.<br><small>Type: `string`</small> |
| `dismissedTips` | Dismissed tip ids from the host's own storage; `"*"` means the user switched all tips off. A new list (by value) replaces the report's.<br><small>Type: `string[]`</small> |
| `onTipDismiss` | Every change of the dismissed tips: a dismissal (`id` the tip), "Show tips" off (`id` `"*"`), on or "Show dismissed tips again" (`id` `null`), with the whole list to store and pass back as `dismissedTips`.<br><small>Type: `({ id, dismissed }) => void`</small> |

Exports: `PivotReport`, `LABELS` (`{ en, de }`), and the types `PivotReportProps`, `CellClick`,
`ExportFile`, `Template`, `FieldDefaults`, `TipDismiss`, `View`, `ViewInput` (a view as a host passes it), `UiLabels` and
`PartialLabels`. The stylesheet is `pivotkit-react/styles.css`.

## Tips

The report shows short tips above the table or the chart, in the flow (never over it), at most two at
a time and one in a narrow or low report, the most important first. Each has an x that dismisses it
(Tab reaches it; the focus then goes to the next tip). Options has "Show tips" and "Show dismissed
tips again", and a help section with the keyboard shortcuts. A screen reader hears a new tip through a
polite live region. The tips, in the order they are shown, and when:

| Id | Shown when | Button |
| --- | --- | --- |
| `filterEmpty` | The filters leave no row of the data. | Remove filter |
| `top` | A field on Rows or Columns shows its top or bottom N: totals and percentages cover those items only. | |
| `chartCapped` | The chart draws the first 50 of more categories. | |
| `showAs` | A value is shown as a percentage: what 100 % is for that calculation. | |
| `chartDates` | Lines or areas with the dates on Columns (and none on Rows). | Swap rows and columns |
| `chartSeries` | Bars, lines or areas with more than 8 series. | Swap rows and columns |
| `textValue` | A text or yes/no field in Values without a name of its own: it is counted. | |
| `dateUngrouped` | An ungrouped date on Columns with more than 12 columns, or on Rows with more than 60 rows. | Group by (the date's span: month, quarter, year) |
| `manyColumns` | A table with more than 20 columns and fewer rows than columns. | Swap rows and columns |
| `values` | Rows or Columns without a value. | |
| `afterDrag` | After the first drag, for three more changes: Undo and the menus. | |
| `saveTemplate` | After five changes of the view, when `onSaveTemplate` is set. | Save as template (opens Templates) |
| `menus` | The empty report, before the first drag. | |
| `cells` | A table with values, until a value was opened once. | |

The texts are `labels.tips` and `labels.tipActions` ([Localisation](localisation.md)).

## Controlled and uncontrolled

- **Uncontrolled**: pass `defaultView` (or nothing). The report keeps the view itself and reports
  every change through `onViewChange`.
- **Controlled**: pass `view` and set it from `onViewChange`. The undo history stays in the report
  however often the host renders; a view the host changes on its own becomes one undo step.

A host may render the report on every change of its own state: `labels` and `limits` are compared by
value, `data` by identity or by `dataKey`.

## Layout

The report adapts to its own width, not the window's: wide (1024 px and more) has the field list on
the left and the zones in a 2 x 2 grid; medium narrows the field list; narrow (below 640 px) opens the
field list as a drawer from the toolbar and shows menus as bottom sheets. The zones stack, one line
each, whenever the area next to the field list is narrower than 640 px (a container query on that
area: the narrow layout, and a medium one such as a half-width card of 650 px). "Swap rows and
columns" shows its icon only, with its name for screen readers and as a tooltip, when the head of the
Columns zone is too narrow for the text. Only the table scrolls sideways. The row label columns share
at most 40 % of the main area (each at least 4.5em) and a value's name wraps beyond 30 %, so a long
label wraps and a phone still shows values next to two levels of row labels; from 300 rows on, where
rows have one height (too low for two lines), a row label is cut with an ellipsis: its full text is
the cell's title, and the status line under the table shows the whole row label ("Row: Linux /
24.04") of a tapped label or of the value the focus is on.

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

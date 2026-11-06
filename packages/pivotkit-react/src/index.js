/*
 * pivotkit-react: the pivot report builder as a React 18/19 component on pivotkit-core.
 *
 *   import { PivotReport } from "pivotkit-react";
 *   import "pivotkit-react/styles.css";
 *
 *   <PivotReport data={rows} view={preset} onViewChange={save} locale="de-DE" />
 *
 * React, ReactDOM and ECharts are peer dependencies the host provides.
 */

/**
 * @typedef {object} Template
 * @property {string} name
 * @property {object} view  a view of pivotkit-core (JSON)
 */

/**
 * @typedef {object} CellClick
 * @property {any[]} row  key path of the row ([] is the grand total)
 * @property {any[]} col  key path of the column
 * @property {unknown} value  the raw value of the cell
 * @property {number | undefined} valueIndex
 * @property {string | undefined} text  the value as shown
 * @property {number} count  source rows behind the cell
 * @property {object[]} rows  the first `drillDownLimit` of them: the host's row objects (`data`) or
 *   rows rebuilt from `encoded`
 */

/**
 * @typedef {object} PivotReportProps
 * @property {object[]} [data]  the rows; encoded once per array
 * @property {import("pivotkit-core").Encoded} [encoded]  already encoded data, instead of `data`
 * @property {object} [view]  the start view (a preset or template); a new view by value starts over
 * @property {(view: import("pivotkit-core").View) => void} [onViewChange]  every change, normalized
 * @property {Template[]} [templates]
 * @property {(name: string, view: import("pivotkit-core").View) => void} [onSaveTemplate]  shows "Save" when set
 * @property {(name: string) => void} [onDeleteTemplate]  shows a delete button per template when set
 * @property {(cell: CellClick) => void} [onCellClick]
 * @property {boolean} [drillDown]  the panel with the rows behind a clicked value (default true)
 * @property {number} [drillDownLimit]  rows passed to the panel and onCellClick (default 1000)
 * @property {string} [locale]  numbers, dates, sorting and the language of the labels (default "en-US")
 * @property {string} [timeZone]  the zone `data` is encoded in (default "UTC"); see pivotkit-core
 * @property {object} [labels]  partial labels merged over the locale's language (en, de)
 * @property {"auto" | "light" | "dark"} [theme]  "auto" follows <html data-theme>, then the system
 * @property {number | string} [height]  the report's height (default 640 px)
 * @property {Partial<import("pivotkit-core").Limits>} [limits]
 * @property {string} [className]
 * @property {string} [fileName]  name of exported files without extension (default "pivot")
 */

export { PivotReport } from "./PivotReport.jsx";
export { LABELS } from "./labels.js";

/*
 * pivotkit-element: the pivot report builder as the web component <pivot-report>, with its own React.
 * Importing this module defines <pivot-report> (once: a second copy of the package leaves the first
 * definition alone). For another tag name import "pivotkit-element/element" and call define(name).
 *
 *   <script type="module" src=".../pivotkit-element/dist/index.js"></script>
 *   <pivot-report theme="auto" height="640"></pivot-report>
 *   <script type="module">
 *       const report = document.querySelector("pivot-report");
 *       report.data = rows;
 *       report.defaultView = { rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] };
 *       report.addEventListener("pivot-view-change", (e) => save(e.detail.view));
 *   </script>
 */

import { define } from "./element.js";

/**
 * @typedef {import("./element.js").PivotView} PivotView
 * @typedef {import("./element.js").Template} Template
 * @typedef {import("./element.js").FieldDefaults} FieldDefaults
 * @typedef {import("./element.js").CellClick} CellClick
 * @typedef {import("./element.js").ExportFile} ExportFile
 * @typedef {import("./element.js").TemplateSave} TemplateSave
 * @typedef {import("./element.js").TemplateDelete} TemplateDelete
 * @typedef {import("./global.js").PivotReportEventMap} PivotReportEventMap
 */

export { EVENTS, PivotReportElement, TAG, define } from "./element.js";

define();

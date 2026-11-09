/*
 * The menus' panels, loaded on demand (lazy-menus.jsx): the chip menus, the toolbar's chart type,
 * Options, Views and Export panels, the filter and the rows behind a value (drill-down), with the texts
 * only they show (menu-labels.js; another language's are a chunk lazy-menus.jsx loads with them) and the browser store of the templates (view-store.js). A separate
 * module, so the first load of a page stays small; the report loads it right after its first render,
 * before anyone opens a menu.
 */

export { AxisMenu, FilterMenu, ValueMenu } from "./chip-menus.jsx";
export { ChartTypePanel, ExportPanel, LoadCheck, OptionsPanel, ViewsPanel } from "./toolbar-panels.jsx";
export { FilterPopover } from "./filter.jsx";
export { DrillPanel } from "./drill-panel.jsx";
export { addMenuTexts, hasMenuTexts, menuLabels } from "./menu-labels.js";
export { storedViews } from "./view-store.js";
export { prepareExporters, runExport } from "./export-run.js";

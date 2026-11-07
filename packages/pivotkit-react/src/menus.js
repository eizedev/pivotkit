/*
 * The menus' panels, loaded on demand (lazy-menus.jsx): the chip menus, the toolbar's chart type,
 * Options and Views panels, the filter and the rows behind a value (drill-down). A separate module, so the first load of a page stays small; the report
 * loads it right after its first render, before anyone opens a menu.
 */

export { AxisMenu, ValueMenu } from "./chip-menus.jsx";
export { ChartTypePanel, OptionsPanel, ViewsPanel } from "./toolbar-panels.jsx";
export { FilterPopover } from "./filter.jsx";
export { DrillPanel } from "./drill-panel.jsx";

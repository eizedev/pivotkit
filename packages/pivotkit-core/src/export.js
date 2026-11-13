/*
 * pivotkit-core/export: XLSX, CSV, TSV and JSON export of a grid, and CSV and XLSX of source rows (a
 * drill-down's rows), and the colour of a colour scale at a point (scaleColor, as the grid computes
 * it). A separate entry point, so a UI that only renders the grid does not bundle
 * fflate (the zip library behind the XLSX workbook).
 *
 *   import { toXlsx, toCsv, toCsvBytes, toTsv, toJson, rowsToCsv, rowsToCsvBytes, rowsToXlsx } from "pivotkit-core/export";
 */

export { toXlsx } from "./xlsx.js";
export { toCsv, toCsvBytes, toTsv, toJson } from "./csv.js";
export { rowsToCsv, rowsToCsvBytes, rowsToXlsx } from "./rows.js";
export { scaleColor } from "./grid.js";

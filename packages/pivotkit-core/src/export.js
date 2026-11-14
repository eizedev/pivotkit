/*
 * pivotkit-core/export: XLSX, CSV, TSV and JSON export of a grid, CSV and XLSX of source rows (a
 * drill-down's rows), the data itself as CSV or JSON to read again (dataToCsv, dataToJson), and the colour of a colour scale at a point (scaleColor, as the grid computes
 * it). A separate entry point, so a UI that only renders the grid does not bundle
 * fflate (the zip library behind the XLSX workbook).
 *
 *   import { toXlsx, toCsv, toCsvBytes, toTsv, toJson, rowsToCsv, rowsToCsvBytes, rowsToXlsx,
 *       dataToCsv, dataToCsvBytes, dataToJson } from "pivotkit-core/export";
 */

export { toXlsx } from "./xlsx.js";
export { toCsv, toCsvBytes, toTsv, toJson } from "./csv.js";
export { dataToCsv, dataToCsvBytes, dataToJson, rowsToCsv, rowsToCsvBytes, rowsToXlsx } from "./rows.js";
export { scaleColor } from "./grid.js";

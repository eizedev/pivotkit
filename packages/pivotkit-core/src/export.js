/*
 * pivotkit-core/export: XLSX and CSV export of a grid. A separate entry point, so a UI that only
 * renders the grid does not bundle fflate (the zip library behind the XLSX workbook).
 *
 *   import { toXlsx, toCsv, toCsvBytes } from "pivotkit-core/export";
 */

export { toXlsx } from "./xlsx.js";
export { toCsv, toCsvBytes } from "./csv.js";

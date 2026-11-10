/*
 * pivotkit-xlsx: the reader plugin for Excel workbooks (.xlsx) of pivotkit-core/import, contract
 * version 1. This module is the plugin's descriptor only; the reader (reader.js, with read-excel-file
 * and fflate) is loaded when the first workbook is read.
 *
 *   import { readFile } from "pivotkit-core/import";
 *   import xlsxReader from "pivotkit-xlsx";
 *   const table = await readFile(file, { plugins: [xlsxReader] });
 */

/** @type {import("pivotkit-core/import").ReaderPlugin} */
export const xlsxReader = Object.freeze({
    apiVersion: 1,
    kind: "reader",
    name: "xlsx",
    label: "Excel workbook",
    accept: Object.freeze([".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]),
    load: () => import("./reader.js")
});

export default xlsxReader;

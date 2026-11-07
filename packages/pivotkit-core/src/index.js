/*
 * pivotkit-core: the pivot engine without UI. The documented entry points are exported here and in
 * "pivotkit-core/export"; every other module is internal and may change in any release.
 *
 *   const data = encode(rows);                       // typed columns; options.timeZone, default "UTC"
 *   const { view, issues } = normalize(input, data); // a view is user input: names only
 *   const result = computePivot(data, view);         // normalizes again, so any input is safe
 *   const grid = toGrid(result);                     // table cells with merges and formatted text
 *   const option = toEChartsOption(result);          // for an Apache ECharts instance
 *   const unit = suggestDateUnit(data, "Created");     // "day", "yearMonth", ... from the span of a date field
 *   const { defaults, issues } = fieldDefaultsFromSchema(openapi, { schema: "Release" }); // names, descriptions, types
 *   // import { toXlsx, toCsv } from "pivotkit-core/export"
 *
 * Conventions: required inputs first (the subject leads), everything optional in one trailing options
 * object. Locale: view.formatting.locale, then options.locale, then "en-US". Errors: a bad view never
 * throws; a programmer error or a resource limit throws a PivotkitError.
 */

/**
 * @typedef {import("./encode.js").Encoded} Encoded
 * @typedef {import("./encode.js").Column} Column
 * @typedef {import("./encode.js").ColumnType} ColumnType
 * @typedef {import("./encode.js").SchemaField} SchemaField
 * @typedef {import("./view.js").View} View
 * @typedef {import("./view.js").ValueSpec} ValueSpec
 * @typedef {import("./view.js").ValueRef} ValueRef
 * @typedef {import("./view.js").FilterSpec} FilterSpec
 * @typedef {import("./view.js").DerivedSpec} DerivedSpec
 * @typedef {import("./view.js").SortSpec} SortSpec
 * @typedef {import("./view.js").Issue} Issue
 * @typedef {import("./pivot.js").PivotResult} PivotResult
 * @typedef {import("./tree.js").PivotNode} PivotNode
 * @typedef {import("./grid.js").Grid} Grid
 * @typedef {import("./items.js").FieldItem} FieldItem
 * @typedef {import("./grid.js").GridCell} GridCell
 * @typedef {import("./chart.js").ChartTheme} ChartTheme
 * @typedef {import("./format.js").Formatter} Formatter
 * @typedef {import("./limits.js").Limits} Limits
 * @typedef {import("./labels.js").Labels} Labels
 * @typedef {import("./schema.js").SchemaFieldDefaults} SchemaFieldDefaults
 * @typedef {import("./errors.js").PivotkitErrorCode} PivotkitErrorCode
 */

export { encode } from "./encode.js";
export { normalize, validate, migrate, emptyView, viewFields, VIEW_VERSION } from "./view.js";
export { computePivot } from "./pivot.js";
export { findNode, cellRows } from "./tree.js";
export { fieldItems } from "./items.js";
export { suggestDateUnit } from "./derive.js";
export { toGrid } from "./grid.js";
export { toSeries, toEChartsOption } from "./chart.js";
export { createHistory } from "./history.js";
export { formatter, isFormat } from "./format.js";
export { aggregatorsFor } from "./aggregators.js";
export { CATALOG } from "./catalog.js";
export { DEFAULT_LABELS, fieldLabel } from "./labels.js";
export { fieldDefaultsFromSchema } from "./schema.js";
export { DEFAULT_THEME } from "./defaults.js";
export { LIMITS } from "./limits.js";
export { PivotkitError } from "./errors.js";

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
 *   const file = toViewFile(view, { name, source: { id }, data }); // the view file; fromViewFile reads one
 *   // import { parseTemplates, templatesFromSchema } from "pivotkit-core/templates" (named views)
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
 * @typedef {import("./encode.js").ColumnarData} ColumnarData
 * @typedef {import("./view.js").View} View
 * @typedef {import("./view.js").ValueSpec} ValueSpec
 * @typedef {import("./view.js").ValueRef} ValueRef
 * @typedef {import("./view.js").FilterSpec} FilterSpec
 * @typedef {import("./view.js").DerivedSpec} DerivedSpec
 * @typedef {import("./view.js").SortSpec} SortSpec
 * @typedef {import("./view.js").Issue} Issue
 * @typedef {import("./view.js").IssueParams} IssueParams
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
 * @typedef {import("./view-file.js").ViewFileMeta} ViewFileMeta
 * @typedef {import("./view-file.js").ViewFileRead} ViewFileRead
 * @typedef {import("./view-file.js").ViewFileCompatibility} ViewFileCompatibility
 * @typedef {import("./view-file.js").ViewFileSource} ViewFileSource
 * @typedef {import("./text-match.js").TextMatch} TextMatch
 * @typedef {import("./link.js").ViewLinkRead} ViewLinkRead
 */

export { encode } from "./encode.js";
export { normalize, validate, migrate, emptyView, viewFields, VIEW_VERSION, VIEW_ISSUE_CODES, VIEW_ISSUES } from "./view.js";
export { computePivot } from "./pivot.js";
export { findNode, cellRows } from "./tree.js";
export { fieldItems } from "./items.js";
export { suggestDateUnit } from "./derive.js";
export { relativeDateRange } from "./filters.js";
export { foldText, MATCH_DEFAULTS } from "./text-match.js";
export { toGrid } from "./grid.js";
export { autoChartType, toSeries, toEChartsOption } from "./chart.js";
export { createHistory } from "./history.js";
export { formatter, isFormat } from "./format.js";
export { aggregatorsFor } from "./aggregators.js";
export { CATALOG } from "./catalog.js";
export { describeSource, describeView, DESCRIBE_LIMITS } from "./describe.js";
export { DEFAULT_LABELS, fieldLabel } from "./labels.js";
export { fieldDefaultsFromSchema } from "./schema.js";
export { DEFAULT_THEME } from "./defaults.js";
export { LIMITS, OUTSIDE_LIMITS, outsideLimits } from "./limits.js";
export { PivotkitError } from "./errors.js";
export { linkFragment, linkParam, withLinkFragment } from "./link-fragment.js";
export { toViewFile, fromViewFile, viewFileText, viewFileName, viewFileFields, VIEW_FILE_FORMAT, VIEW_FILE_VERSION, VIEW_FILE_SCHEMA, VIEW_FILE_LIMITS } from "./view-file.js";

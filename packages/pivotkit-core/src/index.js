/*
 * pivotkit-core: the pivot engine without UI. The documented entry points are exported here and in
 * "pivotkit-core/export"; every other module is internal and may change in any release.
 *
 *   const data = encode(rows);                       // typed columns; options.timeZone, default "UTC"
 *   const { view, issues } = normalize(input, data); // a view is user input: names only
 *   const result = computePivot(data, view);         // normalizes again, so any input is safe
 *   const grid = toGrid(result);                     // table cells with merges and formatted text
 *   const option = toEChartsOption(result);          // for an Apache ECharts instance
 *   // import { toXlsx, toCsv } from "pivotkit-core/export"
 *
 * Conventions: required inputs first (the subject leads), everything optional in one trailing options
 * object. Locale: view.formatting.locale, then options.locale, then "en-US". Errors: a bad view never
 * throws; a programmer error or a resource limit throws a PivotkitError.
 */

export { encode } from "./encode.js";
export { normalize, validate, migrate, emptyView, viewFields, VIEW_VERSION } from "./view.js";
export { computePivot } from "./pivot.js";
export { findNode, cellRows } from "./tree.js";
export { toGrid } from "./grid.js";
export { toSeries, toEChartsOption } from "./chart.js";
export { createHistory } from "./history.js";
export { formatter, isFormat } from "./format.js";
export { aggregatorsFor } from "./aggregators.js";
export { CATALOG } from "./catalog.js";
export { DEFAULT_LABELS } from "./labels.js";
export { DEFAULT_THEME } from "./defaults.js";
export { LIMITS } from "./limits.js";
export { PivotkitError } from "./errors.js";

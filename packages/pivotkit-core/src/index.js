/*
 * pivotkit-core: the pivot engine without UI.
 *
 *   const data = encode(rows);
 *   const view = normalize(userView, data);        // a view is user input: names only
 *   const result = computePivot(data, view);
 *   const grid = toGrid(result);                   // table cells with merges and formatted text
 *   const xlsx = toXlsx(grid);                     // Uint8Array
 *   const option = toEChartsOption(result);        // for an Apache ECharts instance
 */

export { encode, encodeColumn, makeEncoded, toWallMs, COLUMN_TYPES } from "./encode.js";
export { AGGREGATORS, AGGREGATOR_NAMES, aggregatorFits } from "./aggregators.js";
export { derivedColumn, isoWeek, DERIVE_UNITS } from "./derive.js";
export {
    normalize, validate, emptyView, viewFields, VIEW_VERSION, SHOW_AS, SHOW_AS_ALONG_AXIS, FILTER_TYPES,
    LABEL_OPS, VALUE_OPS, CHART_TYPES, DISPLAY_MODES, LIMITS
} from "./view.js";
export { computePivot, cellRows, findNode, groupBy } from "./pivot.js";
export { toGrid, defaultFormat, valueName, scaleColor } from "./grid.js";
export { toSeries, toEChartsOption } from "./chart.js";
export { toXlsx, toCsv, toCsvBytes, csvSeparator, neutralizeFormula, excelSerial, cellRef, xmlEscape } from "./export.js";
export { createHistory } from "./history.js";
export { formatter, parseFormat, isFormat, excelNumberFormat, formatBytes, formatDuration, FORMAT_NAMES } from "./format.js";
export { DEFAULT_LABELS, labelOf, naturalCompare, ranksOf } from "./labels.js";

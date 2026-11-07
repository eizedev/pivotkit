/*
 * The fixed vocabulary of a view, for a UI's menus: every name normalize() accepts, from the same
 * tables the engine runs on, so a list can never offer something the engine does not know.
 */

import { AGGREGATOR_NAMES } from "./aggregators.js";
import { DERIVE_UNITS } from "./derive.js";
import { COLUMN_TYPES } from "./encode.js";
import { FILTER_TYPES, LABEL_OPS, VALUE_OPS } from "./filters.js";
import { FORMAT_NAMES } from "./format.js";
import { SHOW_AS, SHOW_AS_NAMES } from "./show-as.js";
import { CHART_AXIS_LABELS, CHART_LEGENDS, CHART_TYPES, CHART_VALUE_LABELS, CONDITIONAL_TYPES, DISPLAY_MODES } from "./view.js";

export const CATALOG = Object.freeze({
    aggregators: AGGREGATOR_NAMES,
    /** the aggregators a UI offers first; the others are statistics for fewer people */
    commonAggregators: Object.freeze(["sum", "count", "average", "min", "max"]),
    columnTypes: COLUMN_TYPES,
    deriveUnits: DERIVE_UNITS,
    /** date units along the time line (each value one period of one year: "Jan 2025") */
    timelineUnits: Object.freeze(["year", "yearQuarter", "yearMonth", "yearWeek", "day"]),
    /** date units that repeat every year or day ("Jan" of every year), for comparing periods */
    cyclicUnits: Object.freeze(["quarter", "month", "week", "weekday", "hour"]),
    filterTypes: FILTER_TYPES,
    labelOps: LABEL_OPS,
    valueOps: VALUE_OPS,
    formats: FORMAT_NAMES,
    showAs: SHOW_AS_NAMES,
    /** show-as types that walk along an axis (Excel's "base field") */
    showAsAlongAxis: Object.freeze(SHOW_AS_NAMES.filter((name) => SHOW_AS[name].alongAxis)),
    chartTypes: CHART_TYPES,
    /** how a chart is drawn: its value labels, its legend, its category axis labels */
    chartValueLabels: CHART_VALUE_LABELS,
    chartLegends: CHART_LEGENDS,
    chartAxisLabels: CHART_AXIS_LABELS,
    displayModes: DISPLAY_MODES,
    conditionalTypes: CONDITIONAL_TYPES
});

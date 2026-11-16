/*
 * The fixed vocabulary of a view, for a UI's menus: every name normalize() accepts, from the same
 * tables the engine runs on, so a list can never offer something the engine does not know.
 */

import { AGGREGATOR_NAMES } from "./aggregators.js";
import { CYCLIC_UNITS, DERIVE_UNITS, TIMELINE_UNITS } from "./derive.js";
import { COLUMN_TYPES } from "./encode.js";
import { COMPARE_OPS, COMPARE_PRECISIONS, FILTERS, FILTER_BLANKS, FILTER_TYPES, RELATIVE_ANCHORS, RELATIVE_DIRECTIONS, RELATIVE_MAX_COUNT, RELATIVE_UNITS, TEXT_ON, TEXT_OPS, TOP_TIES } from "./filters.js";
import { MATCH_CASES, MATCH_WHITESPACE } from "./text-match.js";
import { FORMAT_NAMES } from "./format.js";
import { SHOW_AS, SHOW_AS_NAMES } from "./show-as.js";
import { CHART_AXIS_LABELS, CHART_GROUP_LABELS, CHART_LABEL_POSITIONS, CHART_LEGENDS, CHART_TYPES, CHART_VALUE_LABELS, CONDITIONAL_TYPES, DISPLAY_MODES } from "./view.js";

export const CATALOG = Object.freeze({
    aggregators: AGGREGATOR_NAMES,
    /** the aggregators a UI offers first; the others are statistics for fewer people */
    commonAggregators: Object.freeze(["sum", "count", "average", "min", "max"]),
    columnTypes: COLUMN_TYPES,
    deriveUnits: DERIVE_UNITS,
    /** date units along the time line (each value one period of one year: "Jan 2025") */
    timelineUnits: TIMELINE_UNITS,
    /** date units that repeat every year or day ("Jan" of every year), for comparing periods */
    cyclicUnits: CYCLIC_UNITS,
    filterTypes: FILTER_TYPES,
    /** per filter type, the field types it works on ("dateGrouping": a grouping of a date) */
    filterFields: Object.freeze(Object.fromEntries(FILTER_TYPES.map((type) => [type, FILTERS[type].fields]))),
    /** what a filter does with blank items */
    filterBlanks: FILTER_BLANKS,
    /** the comparisons of a text filter, what it compares, and how it folds text */
    textOps: TEXT_OPS,
    textOn: TEXT_ON,
    matchCases: MATCH_CASES,
    matchWhitespace: MATCH_WHITESPACE,
    /** the comparisons of an item with a value and of a value condition */
    compareOps: COMPARE_OPS,
    /** how finely a comparison of dates goes; which groups tied at a top N's cut stay */
    comparePrecisions: COMPARE_PRECISIONS,
    topTies: TOP_TIES,
    /** a relative date range ("the last 5 years"): its units and directions, the most it reaches, what it counts from */
    relativeUnits: RELATIVE_UNITS,
    relativeDirections: RELATIVE_DIRECTIONS,
    relativeMaxCount: RELATIVE_MAX_COUNT,
    relativeAnchors: RELATIVE_ANCHORS,
    formats: FORMAT_NAMES,
    showAs: SHOW_AS_NAMES,
    /** show-as types that walk along an axis (Excel's "base field") */
    showAsAlongAxis: Object.freeze(SHOW_AS_NAMES.filter((name) => SHOW_AS[name].alongAxis)),
    chartTypes: CHART_TYPES,
    /** how a chart is drawn: its value labels, its legend, its category axis labels */
    chartValueLabels: CHART_VALUE_LABELS,
    chartLegends: CHART_LEGENDS,
    chartAxisLabels: CHART_AXIS_LABELS,
    chartGroupLabels: CHART_GROUP_LABELS,
    /** where a pie or a donut writes its value labels */
    chartLabelPositions: CHART_LABEL_POSITIONS,
    displayModes: DISPLAY_MODES,
    conditionalTypes: CONDITIONAL_TYPES
});

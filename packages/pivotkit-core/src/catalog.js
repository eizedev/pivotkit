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
import { CHART_TYPES, CONDITIONAL_TYPES, DISPLAY_MODES } from "./view.js";

export const CATALOG = Object.freeze({
    aggregators: AGGREGATOR_NAMES,
    columnTypes: COLUMN_TYPES,
    deriveUnits: DERIVE_UNITS,
    filterTypes: FILTER_TYPES,
    labelOps: LABEL_OPS,
    valueOps: VALUE_OPS,
    formats: FORMAT_NAMES,
    showAs: SHOW_AS_NAMES,
    /** show-as types that walk along an axis (Excel's "base field") */
    showAsAlongAxis: Object.freeze(SHOW_AS_NAMES.filter((name) => SHOW_AS[name].alongAxis)),
    chartTypes: CHART_TYPES,
    displayModes: DISPLAY_MODES,
    conditionalTypes: CONDITIONAL_TYPES
});

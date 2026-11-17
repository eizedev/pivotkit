/*
 * Whether a value's results add up across a category's series: one check for the chart's tooltip
 * (a stack's total, chart-tooltip.js) and the Display settings (Stacked to 100 %, toolbar-panels.jsx).
 */

import { CATALOG } from "pivotkit-core";

/**
 * Whether a value's results add up across a category's series, so a stack of them has a total: an
 * additive aggregator (sum, count), shown as itself or as a show-as type that adds up
 * (CATALOG.additiveShowAs; one that walks an axis only along the rows, the chart's categories).
 * @param {{ agg?: string, showAs?: { type: string, axis?: string } | null } | undefined} value  the view's value
 */
export function valueAddsUp(value) {
    if (!value || !CATALOG.additiveAggregators.includes(/** @type {string} */ (value.agg))) {
        return false;
    }
    const showAs = value.showAs;
    return !showAs || (CATALOG.additiveShowAs.includes(showAs.type) && (!CATALOG.showAsAlongAxis.includes(showAs.type) || showAs.axis === "rows"));
}

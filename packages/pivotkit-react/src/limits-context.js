/*
 * The host's `limits`, for what the menus compute beside the report (a field's items, the totals a
 * rule compares, the items a Top N shows): with the same limits as the report, a view the report shows
 * is one the menus can count. PivotReport provides it; outside it the core's defaults apply.
 */
import { createContext } from "react";
import { PivotkitError, fieldItems } from "pivotkit-core";

/** @type {React.Context<Partial<import("pivotkit-core").Limits> | undefined>} */
export const LimitsContext = createContext(/** @type {Partial<import("pivotkit-core").Limits> | undefined} */ (undefined));

/**
 * `compute()`, or `fallback` when it stops at one of the limits (LIMIT_EXCEEDED): a menu then leaves
 * its count out, and the report says what is over the limit. Any other error is a defect and is
 * thrown on.
 * @template T, F
 * @param {() => T} compute
 * @param {F} fallback
 * @returns {T | F}
 */
export function belowLimits(compute, fallback) {
    try {
        return compute();
    } catch (error) {
        if (error instanceof PivotkitError && error.code === "LIMIT_EXCEEDED") {
            return fallback;
        }
        throw error;
    }
}

/**
 * fieldItems, or null where the data or the view is over a limit (belowLimits).
 * @param {import("pivotkit-core").Encoded} encoded
 * @param {string} field
 * @param {Parameters<typeof fieldItems>[2]} options
 * @returns {ReturnType<typeof fieldItems>}
 */
export function itemsOf(encoded, field, options) {
    return belowLimits(() => fieldItems(encoded, field, options), null);
}

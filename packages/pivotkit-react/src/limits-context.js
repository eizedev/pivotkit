/*
 * The host's `limits`, for what the menus compute beside the report (a field's items, the totals a
 * rule compares, the items a Top N shows): with the same limits as the report, a view the report shows
 * is one the menus can count. PivotReport provides it; outside it the core's defaults apply.
 */
import { createContext } from "react";
import { fieldItems } from "pivotkit-core";

/** @type {React.Context<Partial<import("pivotkit-core").Limits> | undefined>} */
export const LimitsContext = createContext(/** @type {Partial<import("pivotkit-core").Limits> | undefined} */ (undefined));

/**
 * fieldItems, or null where the data or the view is over a limit: a menu then leaves its counts out,
 * and the report says what is over the limit itself.
 * @param {import("pivotkit-core").Encoded} encoded
 * @param {string} field
 * @param {Parameters<typeof fieldItems>[2]} options
 * @returns {ReturnType<typeof fieldItems>}
 */
export function itemsOf(encoded, field, options) {
    try {
        return fieldItems(encoded, field, options);
    } catch {
        return null;
    }
}

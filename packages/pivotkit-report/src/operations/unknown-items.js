/*
 * itemUnknown: the items of an "in" filter that are none of their field's values.
 */

import { closest, foldText } from "pivotkit-core";
import { findingText } from "./findings.js";
import { isEncoded } from "./view-input.js";

/** The most distinct values of a text field whose items an "in" filter's are checked against (itemUnknown). */
const UNKNOWN_ITEMS_DISTINCT = 1000;

/**
 * With env.unknownItems: an itemUnknown warning for each text item of an "in" filter that is none of
 * its field's values, not even in another case or spacing (that is itemCase), with the closest value
 * as the suggestion. Fields with more than UNKNOWN_ITEMS_DISTINCT values are not checked.
 * @param {any} view  a bare view as given (paths count its filters as written)
 * @param {any} data
 * @param {import("../operations.js").OperationEnv} env
 * @returns {import("./findings.js").Finding[]}
 */
export function unknownItems(view, data, env) {
    if (!env.unknownItems || !isEncoded(data) || !view || !Array.isArray(view.filters)) {
        return [];
    }
    /** @type {import("./findings.js").Finding[]} */
    const out = [];
    view.filters.forEach((filter, i) => {
        if (!filter || filter.type !== "in" || typeof filter.field !== "string" || !Array.isArray(filter.items)) {
            return;
        }
        const wanted = filter.field.trim().toLowerCase();
        const field = data.schema.fields.find((f) => f.name.toLowerCase() === wanted);
        const column = field ? data.column(field.name) : undefined;
        if (!column || column.type !== "string" || column.dict.length > UNKNOWN_ITEMS_DISTINCT) {
            return;
        }
        const exact = new Set(column.dict);
        const folded = new Set(column.dict.map((v) => foldText(String(v))));
        filter.items.forEach((item) => {
            if (typeof item !== "string" || exact.has(item) || folded.has(foldText(item))) {
                return;
            }
            const near = closest(item, column.dict);
            out.push({ severity: "warning", code: "itemUnknown", path: `filters[${i}].items`, field: findingText(field.name), message: findingText(`item ${JSON.stringify(item)} is not one of the listed values of "${field.name}"`), ...(near !== null ? { suggestion: findingText(near) } : {}) });
        });
    });
    return out;
}

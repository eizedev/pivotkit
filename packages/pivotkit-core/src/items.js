/*
 * The distinct values of a field with their row counts, for a UI's filter list ("North (120)"). A
 * derived field of the view (a date grouping, number bins) is resolved like in the pivot, so the list
 * shows the groups the table shows.
 */

import { derivedColumn } from "./derive.js";
import { isEncoded } from "./encode.js";
import { expect } from "./errors.js";
import { keptByRules, todayOf } from "./filters.js";
import { DEFAULT_LABELS, labelOf, ranksOf } from "./labels.js";
import { resolveLimits } from "./limits.js";
import { optionsOf, resolveLocale } from "./util.js";
import { normalize } from "./view.js";

/**
 * @typedef {object} FieldItem
 * @property {string | number | boolean | null} value  the value a filter item names (null is blank;
 *   dates as wall-clock milliseconds)
 * @property {string} label  as the table shows it
 * @property {number} count  source rows with this value, before any filter
 * @property {boolean} kept  whether the field's own rules on its items (a condition on the names, a
 *   comparison of the item, a relative date range) keep it; true without such a rule. Its picks
 *   (include, exclude) and the conditions on totals are not counted.
 */

/**
 * The values of a field in the order the table sorts them by label (blank last), each with its row
 * count over all rows of the data. At most `limits.items` values are listed (`truncated` says when
 * there are more), the number a filter can name.
 * @param {import("./encode.js").Encoded} data  from encode()
 * @param {string} field  a column of the data or a derived field of `options.view`
 * @param {object} [options]
 * @param {unknown} [options.view]  the view whose derived fields and locale apply
 * @param {string} [options.locale]  used when the view names none; default "en-US"
 * @param {Partial<import("./labels.js").Labels>} [options.labels]  texts for blank, true and false
 * @param {Partial<import("./limits.js").Limits>} [options.limits]
 * @param {Date | number | string} [options.now]  today for a relative date range, as computePivot()'s
 * @returns {{ field: string, type: import("./encode.js").ColumnType, items: FieldItem[], truncated: boolean } | null}
 *   null for an unknown field
 */
export function fieldItems(data, field, options) {
    options = optionsOf(options, "fieldItems");
    expect(isEncoded(data), "fieldItems(data, field): data must come from encode()");
    const limits = resolveLimits(options);
    const { view } = normalize(options.view ?? {}, data, { limits: options.limits });
    const locale = resolveLocale(view.formatting.locale, options.locale);
    const labels = { ...DEFAULT_LABELS, ...(options.labels || {}) };
    if (typeof field !== "string") {
        return null;
    }
    const spec = view.derived.find((d) => d.name.toLowerCase() === field.trim().toLowerCase());
    const column = spec ? derivedColumn(data, spec) : data.column(field.trim());
    if (!column) {
        return null;
    }
    // one count per dictionary code; index 0 is blank
    const counts = new Float64Array(column.dict.length + 1);
    for (let i = 0; i < column.codes.length; i++) {
        counts[column.codes[i] + 1]++;
    }
    const ranks = ranksOf(column, locale, data.cache);
    const kept = keptByRules(view, column.name, column, spec ? data.column(spec.field) ?? column : column, locale, () => todayOf(options.now, data.timeZone));
    const keeps = (code) => !kept || kept[code + 1] === 1;
    const codes = [];
    for (let code = 0; code < column.dict.length; code++) {
        if (counts[code + 1] > 0) {
            codes.push(code);
        }
    }
    codes.sort((a, b) => ranks[a] - ranks[b]);
    const items = codes.map((code) => ({ value: column.dict[code], label: labelOf(column, column.dict[code], locale, labels), count: counts[code + 1], kept: keeps(code) }));
    if (counts[0] > 0) {
        items.push({ value: null, label: labelOf(column, null, locale, labels), count: counts[0], kept: keeps(-1) });
    }
    return { field: column.name, type: column.type, items: items.slice(0, limits.items), truncated: items.length > limits.items };
}

/*
 * Display labels of dimension values and the natural sort order of a column's dictionary.
 */

import { collator, dateTimeFormat } from "./intl.js";

const DATE = { dateStyle: "medium", timeZone: "UTC" };
const DATE_TIME = { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" };

/** Default texts of the grid; every one can be replaced through toGrid's `labels` option. */
export const DEFAULT_LABELS = Object.freeze({
    blank: "(blank)",
    total: "{label} Total",
    grandTotal: "Grand Total",
    values: "Values",
    valueName: "{agg} of {field}",
    countRows: "Count",
    true: "true",
    false: "false",
    aggregators: Object.freeze({
        count: "Count",
        countUnique: "Count Unique",
        listUnique: "List Unique",
        sum: "Sum",
        average: "Average",
        median: "Median",
        min: "Min",
        max: "Max",
        stdev: "StdDev",
        stdevp: "StdDevP",
        var: "Var",
        varp: "VarP",
        first: "First",
        last: "Last"
    })
});

/**
 * The label of one dictionary value of a column.
 * @param {import("./encode.js").Column} column
 * @param {string | number | boolean | null} value  null for blank
 * @param {string} locale
 * @param {{ blank?: string, true?: string, false?: string }} [labels]
 */
export function labelOf(column, value, locale, labels = DEFAULT_LABELS) {
    if (value === null || value === undefined) {
        return labels.blank ?? DEFAULT_LABELS.blank;
    }
    if (column.labeler) {
        return column.labeler(value, locale);
    }
    switch (column.type) {
        case "date":
            return dateTimeFormat(locale, column.dateOnly ? DATE : DATE_TIME).format(new Date(value));
        case "boolean":
            return value ? (labels.true ?? "true") : (labels.false ?? "false");
        default:
            return String(value);
    }
}

/**
 * Compares two raw values: numbers (and dates, booleans) by value, text naturally. Blank sorts last.
 * @param {unknown} a
 * @param {unknown} b
 * @param {string} locale
 */
export function naturalCompare(a, b, locale) {
    const aBlank = a === null || a === undefined;
    const bBlank = b === null || b === undefined;
    if (aBlank || bBlank) {
        return aBlank === bBlank ? 0 : aBlank ? 1 : -1;
    }
    const aNum = typeof a === "number" || typeof a === "boolean";
    const bNum = typeof b === "number" || typeof b === "boolean";
    if (aNum && bNum) {
        return Number(a) - Number(b);
    }
    if (aNum !== bNum) {
        // numbers before text, as Excel sorts a mixed column
        return aNum ? -1 : 1;
    }
    return collator(locale).compare(String(a), String(b));
}

/**
 * Rank of every dictionary code of a column in natural order (0 = first), cached on the encoded data
 * (one bounded cache with the derived columns, see LIMITS.cacheEntries).
 * @param {import("./encode.js").Column} column
 * @param {string} locale
 * @param {ReturnType<typeof import("./util.js").createCache>} cache  encoded.cache
 * @returns {Int32Array}
 */
export function ranksOf(column, locale, cache) {
    return cache.getOrSet(`ranks:${column.id}:${locale}`, () => {
        const order = column.dict.map((_, i) => i);
        order.sort((x, y) => naturalCompare(column.dict[x], column.dict[y], locale) || x - y);
        const ranks = new Int32Array(order.length);
        order.forEach((code, rank) => {
            ranks[code] = rank;
        });
        return ranks;
    });
}

/** Replaces {name} placeholders; unknown names stay as they are. */
export function fill(template, values) {
    return String(template).replace(/\{(\w+)\}/g, (all, name) => (Object.hasOwn(values, name) ? String(values[name]) : all));
}

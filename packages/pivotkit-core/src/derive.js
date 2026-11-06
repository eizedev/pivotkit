/*
 * Derived fields: date grouping and number bins, computed from a source column into a new encoded
 * column and cached on the encoded data, so changing the view does not recompute them.
 *
 *   { name: "Order month", field: "OrderDate", by: "yearMonth" }
 *   { name: "Amount band", field: "Amount", by: "bin", size: 100, origin: 0 }
 *
 * DERIVED is the one table of grouping units: the source type each one needs, the type of the column
 * it makes, its value and its label. normalize() and the pivot both read it; a new unit is one entry.
 */

import { dateTimeFormat, numberFormat } from "./intl.js";
import { MS_PER_DAY, decimalsOf, pad } from "./util.js";

/** Bins smaller than this are refused: their labels and keys would no longer be exact. */
export const MIN_BIN_SIZE = 1e-9;

/** ISO 8601 week and its year for wall-clock milliseconds. */
export function isoWeek(ms) {
    const d = new Date(ms);
    const day = (d.getUTCDay() + 6) % 7; // Monday = 0
    const thursday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3);
    const year = new Date(thursday).getUTCFullYear();
    // week 1 is the week with the year's first Thursday (the one that contains 4 January)
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const firstThursday = jan4.getTime() + (3 - ((jan4.getUTCDay() + 6) % 7)) * MS_PER_DAY;
    const week = 1 + Math.round((thursday - firstThursday) / (7 * MS_PER_DAY));
    return { year, week };
}

const monthName = (month, locale) =>
    dateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2000, month - 1, 1)));

// 2024-01-01 was a Monday
const weekdayName = (weekday, locale) =>
    dateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, weekday)));

/**
 * @typedef {object} DerivedUnit
 * @property {"date" | "number"} source  the type of field it groups
 * @property {"date" | "number"} type    the type of the column it makes
 * @property {(d: Date) => number} [value]   date units: the group of a wall-clock date
 * @property {(v: number, locale: string) => string} [label]  number results: the display label
 */

/** @type {Readonly<Record<string, DerivedUnit>>} */
export const DERIVED = Object.freeze({
    year: { source: "date", type: "number", value: (d) => d.getUTCFullYear(), label: (v) => String(v) },
    quarter: { source: "date", type: "number", value: (d) => Math.floor(d.getUTCMonth() / 3) + 1, label: (v) => `Q${v}` },
    month: { source: "date", type: "number", value: (d) => d.getUTCMonth() + 1, label: monthName },
    week: { source: "date", type: "number", value: (d) => isoWeek(d.getTime()).week, label: (v) => `W${pad(v)}` },
    day: { source: "date", type: "date", value: (d) => Math.floor(d.getTime() / MS_PER_DAY) * MS_PER_DAY },
    hour: { source: "date", type: "number", value: (d) => d.getUTCHours(), label: (v) => `${pad(v)}:00` },
    weekday: { source: "date", type: "number", value: (d) => ((d.getUTCDay() + 6) % 7) + 1, label: weekdayName },
    yearQuarter: {
        source: "date",
        type: "number",
        value: (d) => d.getUTCFullYear() * 10 + Math.floor(d.getUTCMonth() / 3) + 1,
        label: (v) => `${Math.floor(v / 10)}-Q${v % 10}`
    },
    yearMonth: {
        source: "date",
        type: "number",
        value: (d) => d.getUTCFullYear() * 100 + d.getUTCMonth() + 1,
        label: (v) => `${Math.floor(v / 100)}-${pad(v % 100)}`
    },
    yearWeek: {
        source: "date",
        type: "number",
        value: (d) => {
            const w = isoWeek(d.getTime());
            return w.year * 100 + w.week;
        },
        label: (v) => `${Math.floor(v / 100)}-W${pad(v % 100)}`
    },
    // number bins: value and label depend on size and origin, see binning()
    bin: { source: "number", type: "number" }
});

/** Names of the grouping units, in the order a UI lists them. */
export const DERIVE_UNITS = Object.freeze(Object.keys(DERIVED));

/**
 * Number bins [lower, upper) of `size` from `origin`. Sizes like 0.1 have no exact binary form, so
 * (v - origin) / size alone puts 0.3 into the bin 0.2 - 0.3. The bin index from that division is
 * therefore corrected against the bounds computed in integers scaled by the decimals of size and
 * origin, which are the decimal numbers the user wrote: 0.3 lands in 0.3 - 0.4, and keys are clean
 * (0.3, not 0.30000000000000004).
 * @param {number} size
 * @param {number} origin
 */
export function binning(size, origin) {
    const decimals = Math.min(20, Math.max(decimalsOf(size), decimalsOf(origin)));
    const scale = 10 ** decimals;
    const sizeS = Math.round(size * scale);
    const originS = Math.round(origin * scale);
    const scaled = decimals <= 15 && sizeS > 0 && Number.isSafeInteger(sizeS) && Number.isSafeInteger(originS);
    /** lower bound of bin k */
    const bound = (k) => {
        const b = originS + k * sizeS;
        return scaled && Number.isSafeInteger(b) ? b / scale : origin + k * size;
    };
    return {
        decimals,
        /** the lower bound of the bin of v; NaN when there is none (overflow, or a bin index beyond
         * 2^53, where neighbouring bins can no longer be told apart: 1e15 in bins of 1e-9) */
        lowerOf(v) {
            let k = Math.floor((v - origin) / size);
            if (!Number.isSafeInteger(k)) {
                return NaN;
            }
            if (v >= bound(k + 1)) {
                k++;
            } else if (v < bound(k)) {
                k--;
            }
            return bound(k);
        },
        /** the upper bound of the bin whose lower bound is lo */
        upperOf(lo) {
            return bound(Math.round((lo - origin) / size) + 1);
        }
    };
}

/**
 * The encoded column of a derived field; null when the source column is missing or of the wrong type.
 * Cached on the encoded data (least recently used go first, see LIMITS.cacheEntries).
 * @param {import("./encode.js").Encoded} encoded
 * @param {{ name: string, field: string, by: string, size?: number, origin?: number }} spec  normalized
 * @returns {import("./encode.js").Column | null}
 */
export function derivedColumn(encoded, spec) {
    const source = encoded.column(spec.field);
    const unit = Object.hasOwn(DERIVED, spec.by) ? DERIVED[spec.by] : null;
    if (!source || !source.values || !unit || source.type !== unit.source) {
        return null;
    }
    const id = `derived:${source.key}:${spec.by}:${spec.size ?? ""}:${spec.origin ?? ""}`;
    const column = encoded.cache.getOrSet(id, () => buildDerived(source, spec, unit, id));
    // the same grouping under another name shares the arrays
    return column.name === spec.name ? column : { ...column, name: spec.name, key: spec.name.toLowerCase() };
}

function buildDerived(source, spec, unit, id) {
    const n = source.values.length;
    const codes = new Int32Array(n);
    const values = new Float64Array(n);
    const dict = [];
    const index = new Map();
    const bins = spec.by === "bin" ? binning(spec.size, spec.origin ?? 0) : null;
    const date = new Date(0);
    for (let i = 0; i < n; i++) {
        const v = source.values[i];
        let key = NaN;
        if (!Number.isNaN(v)) {
            if (bins) {
                key = bins.lowerOf(v);
            } else {
                date.setTime(v);
                key = unit.value(date);
            }
        }
        if (Number.isNaN(key)) {
            codes[i] = -1;
            values[i] = NaN;
            continue;
        }
        let code = index.get(key);
        if (code === undefined) {
            code = dict.length;
            dict.push(key);
            index.set(key, code);
        }
        codes[i] = code;
        values[i] = key;
    }
    /** @type {import("./encode.js").Column} */
    const column = { name: spec.name, key: spec.name.toLowerCase(), id, type: unit.type, codes, dict, values, derived: true };
    if (unit.type === "date") {
        column.dateOnly = true;
    } else if (bins) {
        // lower bound included, upper bound excluded
        column.labeler = (lo, locale) => {
            const f = numberFormat(locale, { maximumFractionDigits: bins.decimals, signDisplay: "negative" });
            return `${f.format(lo)} – ${f.format(bins.upperOf(lo))}`;
        };
    } else {
        column.labeler = unit.label;
    }
    return column;
}

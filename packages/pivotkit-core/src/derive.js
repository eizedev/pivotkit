/*
 * Derived fields: date grouping and number bins, computed from a source column into a new encoded
 * column and cached on the encoded data, so changing the view does not recompute them.
 *
 *   { name: "Order month", field: "OrderDate", by: "yearMonth" }
 *   { name: "Amount band", field: "Amount", by: "bin", size: 100, origin: 0 }
 */

const MS_PER_DAY = 86400000;

/** Units of date grouping; "bin" groups numbers. */
export const DERIVE_UNITS = Object.freeze([
    "year", "quarter", "month", "week", "day", "hour", "weekday", "yearQuarter", "yearMonth", "yearWeek", "bin"
]);

const pad = (n, width = 2) => String(n).padStart(width, "0");

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

const monthNames = new Map();
const weekdayNames = new Map();

function monthName(month, locale) {
    const key = locale ?? "";
    let f = monthNames.get(key);
    if (!f) {
        f = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
        monthNames.set(key, f);
    }
    return f.format(new Date(Date.UTC(2000, month - 1, 1)));
}

function weekdayName(weekday, locale) {
    const key = locale ?? "";
    let f = weekdayNames.get(key);
    if (!f) {
        f = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
        weekdayNames.set(key, f);
    }
    // 2024-01-01 was a Monday
    return f.format(new Date(Date.UTC(2024, 0, weekday)));
}

/** Per unit: value of a wall-clock ms, its label, and whether the derived column is a date. */
const DATE_UNITS = {
    year: { value: (d) => d.getUTCFullYear(), label: (v) => String(v) },
    quarter: { value: (d) => Math.floor(d.getUTCMonth() / 3) + 1, label: (v) => `Q${v}` },
    month: { value: (d) => d.getUTCMonth() + 1, label: (v, locale) => monthName(v, locale) },
    week: { value: (d) => isoWeek(d.getTime()).week, label: (v) => `W${pad(v)}` },
    day: { value: (d) => Math.floor(d.getTime() / MS_PER_DAY) * MS_PER_DAY, date: true },
    hour: { value: (d) => d.getUTCHours(), label: (v) => `${pad(v)}:00` },
    weekday: { value: (d) => ((d.getUTCDay() + 6) % 7) + 1, label: (v, locale) => weekdayName(v, locale) },
    yearQuarter: {
        value: (d) => d.getUTCFullYear() * 10 + Math.floor(d.getUTCMonth() / 3) + 1,
        label: (v) => `${Math.floor(v / 10)}-Q${v % 10}`
    },
    yearMonth: {
        value: (d) => d.getUTCFullYear() * 100 + d.getUTCMonth() + 1,
        label: (v) => `${Math.floor(v / 100)}-${pad(v % 100)}`
    },
    yearWeek: {
        value: (d) => {
            const w = isoWeek(d.getTime());
            return w.year * 100 + w.week;
        },
        label: (v) => `${Math.floor(v / 100)}-W${pad(v % 100)}`
    }
};

const binFormats = new Map();

function binLabel(lo, size, locale) {
    const key = locale ?? "";
    let f = binFormats.get(key);
    if (!f) {
        f = new Intl.NumberFormat(locale, { maximumFractionDigits: 6 });
        binFormats.set(key, f);
    }
    // lower bound included, upper bound excluded
    return `${f.format(lo)} – ${f.format(lo + size)}`;
}

/**
 * The encoded column of a derived field; null when the source column is missing or of the wrong type.
 * @param {import("./encode.js").Encoded} encoded
 * @param {{ name: string, field: string, by: string, size?: number, origin?: number }} spec  normalized
 * @returns {import("./encode.js").Column | null}
 */
export function derivedColumn(encoded, spec) {
    const source = encoded.column(spec.field);
    if (!source || !source.values) {
        return null;
    }
    const isBin = spec.by === "bin";
    if (isBin ? source.type !== "number" : source.type !== "date" || !Object.hasOwn(DATE_UNITS, spec.by)) {
        return null;
    }
    const cacheKey = `derived:${source.key}:${spec.by}:${spec.size ?? ""}:${spec.origin ?? ""}`;
    const cached = encoded.cache.get(cacheKey);
    if (cached) {
        // the same grouping under another name shares the arrays
        return cached.name === spec.name ? cached : { ...cached, name: spec.name, key: spec.name.toLowerCase() };
    }
    const n = source.values.length;
    const codes = new Int32Array(n);
    const values = new Float64Array(n);
    const dict = [];
    const index = new Map();
    const unit = isBin ? null : DATE_UNITS[spec.by];
    const size = isBin ? spec.size : 0;
    const origin = isBin ? spec.origin ?? 0 : 0;
    const date = new Date(0);
    for (let i = 0; i < n; i++) {
        const v = source.values[i];
        if (Number.isNaN(v)) {
            codes[i] = -1;
            values[i] = NaN;
            continue;
        }
        let key;
        if (isBin) {
            key = origin + Math.floor((v - origin) / size) * size;
        } else {
            date.setTime(v);
            key = unit.value(date);
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
    const column = {
        name: spec.name,
        key: spec.name.toLowerCase(),
        type: unit && unit.date ? "date" : "number",
        codes,
        dict,
        values,
        derived: true
    };
    if (unit && unit.date) {
        column.dateOnly = true;
    } else {
        column.labeler = isBin ? (v, locale) => binLabel(v, size, locale) : unit.label;
    }
    encoded.cache.set(cacheKey, column);
    return column;
}

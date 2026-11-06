/*
 * Typed, columnar encoding of the source rows. Every column is a dimension (Int32 codes into a
 * dictionary of distinct values, -1 for blank) and, when it holds numbers, booleans or dates, also a
 * measure (Float64Array, NaN for blank). The pivot works on these arrays only, so 100,000 rows need no
 * per-row objects.
 *
 * Dates are stored as wall-clock milliseconds: the calendar date and clock time as written, encoded as
 * if it were UTC. "2026-03-04T10:00" stays 10:00 on every machine; grouping by month or hour reads the
 * UTC fields of that number. A Date object or an ISO string with an offset is converted to the wall
 * clock of `timeZone` ("local", the default, or "UTC").
 */

/** @typedef {"string" | "number" | "boolean" | "date" | "null"} ColumnType */

/**
 * @typedef {object} Column
 * @property {string} name        the data's own spelling, for display
 * @property {string} key         lower-case name, for case-insensitive matching
 * @property {ColumnType} type
 * @property {Int32Array} codes   per row: index into dict, -1 for blank
 * @property {Array<string | number | boolean>} dict  distinct values in order of first appearance
 * @property {Float64Array | null} values  per row: number, 1/0, or wall-clock ms; NaN for blank
 * @property {boolean} [dateOnly] date columns: true when no value has a clock time
 * @property {boolean} [derived]  computed from another column by a derived field
 * @property {(value: any, locale?: string) => string} [labeler]  display label of a dict value
 */

/**
 * @typedef {object} Encoded
 * @property {number} length
 * @property {Column[]} columns
 * @property {{ fields: Array<{ name: string, type: ColumnType }> }} schema
 * @property {(name: string) => Column | undefined} column  case-insensitive lookup
 * @property {"local" | "UTC"} timeZone
 * @property {Map<string, any>} cache  derived columns and sort ranks, filled on demand
 */

export const COLUMN_TYPES = Object.freeze(["string", "number", "boolean", "date"]);

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const MS_PER_DAY = 86400000;

/**
 * Wall-clock milliseconds of a Date, an ISO date string or epoch milliseconds; NaN if it is none.
 * @param {unknown} value
 * @param {"local" | "UTC"} [timeZone]
 */
export function toWallMs(value, timeZone = "local") {
    let date;
    if (value instanceof Date) {
        date = value;
    } else if (typeof value === "string") {
        const m = ISO_DATE.exec(value.trim());
        if (!m) {
            return NaN;
        }
        const [, y, mo, d, h, mi, s, frac, zone] = m;
        if (!zone) {
            // as written: no time zone conversion at all
            const ms = frac ? Math.round(Number(`0.${frac}`) * 1000) : 0;
            const t = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h || 0), Number(mi || 0), Number(s || 0), ms);
            return validDate(t, Number(y), Number(mo), Number(d)) ? t : NaN;
        }
        date = new Date(value.trim());
    } else if (typeof value === "number" && Number.isFinite(value)) {
        date = new Date(value);
    } else {
        return NaN;
    }
    const t = date.getTime();
    if (Number.isNaN(t)) {
        return NaN;
    }
    if (timeZone === "UTC") {
        return t;
    }
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
}

function validDate(t, y, mo, d) {
    if (Number.isNaN(t)) {
        return false;
    }
    const check = new Date(t);
    // rejects 2026-02-30, which Date.UTC would roll over into March
    return check.getUTCFullYear() === y && check.getUTCMonth() === mo - 1 && check.getUTCDate() === d;
}

function classify(v) {
    if (v === null || v === undefined || v === "") {
        return null;
    }
    switch (typeof v) {
        case "number":
            return Number.isFinite(v) ? "number" : null;
        case "boolean":
            return "boolean";
        case "string":
            return ISO_DATE.test(v.trim()) && !Number.isNaN(toWallMs(v, "UTC")) ? "date" : "string";
        case "bigint":
            return "number";
        default:
            return v instanceof Date ? (Number.isNaN(v.getTime()) ? null : "date") : "string";
    }
}

function inferType(raw) {
    let type = null;
    for (let i = 0; i < raw.length; i++) {
        const t = classify(raw[i]);
        if (t === null || t === type) {
            continue;
        }
        if (type === null) {
            type = t;
        } else {
            return "string";
        }
    }
    return type ?? "null";
}

function toText(v) {
    if (typeof v === "string") {
        return v;
    }
    if (v instanceof Date) {
        return Number.isNaN(v.getTime()) ? "" : v.toISOString();
    }
    if (typeof v === "object") {
        try {
            return JSON.stringify(v) ?? "";
        } catch {
            return String(v);
        }
    }
    return String(v);
}

function toNumberValue(v) {
    if (typeof v === "number") {
        return Number.isFinite(v) ? v : NaN;
    }
    if (typeof v === "bigint") {
        return Number(v);
    }
    if (typeof v === "boolean") {
        return v ? 1 : 0;
    }
    if (typeof v === "string" && v.trim() !== "") {
        const n = Number(v.trim());
        return Number.isFinite(n) ? n : NaN;
    }
    return NaN;
}

function toBooleanValue(v) {
    if (typeof v === "boolean") {
        return v;
    }
    if (typeof v === "number") {
        return Number.isFinite(v) ? v !== 0 : null;
    }
    if (typeof v === "string") {
        const s = v.trim().toLowerCase();
        if (s === "true" || s === "1" || s === "yes") {
            return true;
        }
        if (s === "false" || s === "0" || s === "no") {
            return false;
        }
    }
    return null;
}

/**
 * Builds one encoded column from its raw values.
 * @param {string} name
 * @param {unknown[]} raw
 * @param {ColumnType} type
 * @param {"local" | "UTC"} timeZone
 * @returns {Column}
 */
export function encodeColumn(name, raw, type, timeZone = "local") {
    const n = raw.length;
    const codes = new Int32Array(n);
    const dict = [];
    const index = new Map();
    const values = type === "number" || type === "boolean" || type === "date" ? new Float64Array(n) : null;
    let dateOnly = true;
    for (let i = 0; i < n; i++) {
        const v = raw[i];
        let key;
        if (v === null || v === undefined || v === "") {
            key = null;
        } else if (type === "number") {
            key = toNumberValue(v);
            if (Number.isNaN(key)) {
                key = null;
            }
        } else if (type === "boolean") {
            key = toBooleanValue(v);
        } else if (type === "date") {
            key = toWallMs(v, timeZone);
            if (Number.isNaN(key)) {
                key = null;
            } else if (key % MS_PER_DAY !== 0) {
                dateOnly = false;
            }
        } else {
            key = toText(v);
            if (key === "") {
                key = null;
            }
        }
        if (key === null) {
            codes[i] = -1;
            if (values) {
                values[i] = NaN;
            }
            continue;
        }
        let code = index.get(key);
        if (code === undefined) {
            code = dict.length;
            dict.push(key);
            index.set(key, code);
        }
        codes[i] = code;
        if (values) {
            values[i] = typeof key === "boolean" ? (key ? 1 : 0) : key;
        }
    }
    /** @type {Column} */
    const column = { name, key: name.toLowerCase(), type, codes, dict, values };
    if (type === "date") {
        column.dateOnly = dateOnly;
    }
    return column;
}

/**
 * Encodes an array of row objects.
 *
 * Column names are matched case-insensitively: "Team" and "team" are one column, displayed with the
 * spelling seen first. Types are inferred (number, boolean, date for Date objects and ISO date
 * strings, otherwise string; a column of mixed types is string) unless `options.types` names them.
 *
 * @param {ArrayLike<Record<string, unknown>>} rows
 * @param {object} [options]
 * @param {Record<string, ColumnType>} [options.types]  type per column name (case-insensitive)
 * @param {string[]} [options.columns]  only these columns (case-insensitive), in this order
 * @param {"local" | "UTC"} [options.timeZone]  wall clock for Date objects and ISO strings with an offset
 * @returns {Encoded}
 */
export function encode(rows, options = {}) {
    const list = rows && typeof rows.length === "number" ? rows : [];
    const n = list.length >>> 0;
    const timeZone = options.timeZone === "UTC" ? "UTC" : "local";
    const wanted = Array.isArray(options.columns)
        ? new Set(options.columns.filter((c) => typeof c === "string").map((c) => c.toLowerCase()))
        : null;

    /** @type {Map<string, { name: string, raw: unknown[] }>} */
    const found = new Map();
    for (let r = 0; r < n; r++) {
        const row = list[r];
        if (row === null || typeof row !== "object") {
            continue;
        }
        for (const k of Object.keys(row)) {
            const key = k.toLowerCase();
            let col = found.get(key);
            if (col === undefined) {
                if (wanted && !wanted.has(key)) {
                    continue;
                }
                col = { name: k, raw: new Array(n).fill(null) };
                found.set(key, col);
            }
            col.raw[r] = row[k];
        }
    }

    const typeOverrides = new Map();
    if (options.types && typeof options.types === "object") {
        for (const k of Object.keys(options.types)) {
            const t = options.types[k];
            if (COLUMN_TYPES.includes(t)) {
                typeOverrides.set(k.toLowerCase(), t);
            }
        }
    }

    const order = wanted ? [...wanted].filter((k) => found.has(k)) : [...found.keys()];
    const columns = order.map((key) => {
        const { name, raw } = found.get(key);
        const type = typeOverrides.get(key) ?? inferType(raw);
        return encodeColumn(name, raw, type, timeZone);
    });
    return makeEncoded(n, columns, timeZone);
}

/**
 * @param {number} length
 * @param {Column[]} columns
 * @param {"local" | "UTC"} timeZone
 * @returns {Encoded}
 */
export function makeEncoded(length, columns, timeZone = "local") {
    const byKey = new Map(columns.map((c) => [c.key, c]));
    return {
        length,
        columns,
        schema: { fields: columns.map((c) => ({ name: c.name, type: c.type })) },
        column: (name) => (typeof name === "string" ? byKey.get(name.toLowerCase()) : undefined),
        timeZone,
        cache: new Map()
    };
}

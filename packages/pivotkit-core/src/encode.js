/*
 * Typed, columnar encoding of the source rows. Every column is a dimension (Int32 codes into a
 * dictionary of distinct values, -1 for blank) and, when it holds numbers, booleans or dates, also a
 * measure (Float64Array, NaN for blank). The pivot works on these arrays only, so 100,000 rows need no
 * per-row objects. Dates are wall-clock milliseconds in the data's time zone (see time.js).
 */

import { checkLimit, expect } from "./errors.js";
import { resolveLimits } from "./limits.js";
import { isIsoDate, resolveTimeZone, toWallMs, wallClock } from "./time.js";
import { MS_PER_DAY, createCache, optionsOf } from "./util.js";

/**
 * The type of a column. "null" is a column without any value; it can be counted but not grouped by
 * value or summed meaningfully.
 * @typedef {"string" | "number" | "boolean" | "date" | "null"} ColumnType
 */

/**
 * @typedef {object} Column
 * @property {string} name        the data's own spelling, for display
 * @property {string} key         lower-case name, for case-insensitive matching
 * @property {string} id          identity of the arrays, shared by a derived column under two names
 * @property {ColumnType} type
 * @property {Int32Array} codes   per row: index into dict, -1 for blank
 * @property {Array<string | number | boolean>} dict  distinct values in order of first appearance
 * @property {Float64Array | null} values  per row: number, 1/0, or wall-clock ms; NaN for blank
 * @property {boolean} [dateOnly] date columns: true when no value has a clock time
 * @property {boolean} [derived]  computed from another column by a derived field
 * @property {(value: any, locale: string) => string} [labeler]  display label of a dict value
 */

/**
 * @typedef {object} SchemaField
 * @property {string} name
 * @property {ColumnType} type     the type the column is encoded with
 * @property {ColumnType} detected the type found in the values; "number" for a string column whose
 *   values are all numeric text, so a UI can offer `inferNumbers` or a `types` override
 */

/**
 * @typedef {object} Issue
 * @property {string} path
 * @property {string} message
 */

/**
 * @typedef {object} Encoded
 * @property {number} length
 * @property {Column[]} columns
 * @property {{ fields: SchemaField[] }} schema
 * @property {(name: string) => Column | undefined} column  case-insensitive lookup
 * @property {string} timeZone  the zone Date objects and ISO strings with an offset were read in
 * @property {Issue[]} issues   column names that collide case-insensitively
 * @property {import("./util.js").Cache} cache  internal: derived columns and sort orders (LRU)
 */

/** Column types that can be named in `encode(rows, { types })`. */
export const COLUMN_TYPES = Object.freeze(["string", "number", "boolean", "date"]);

// Numeric text in the plain form a CSV or a form field gives: no hex, no "Infinity", no blanks.
// Unambiguous (each digit can match one way only), so a failed match takes linear time.
const NUMERIC_TEXT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
// Longer text is no number: a double holds 17 significant digits, and the data may come from a user.
const MAX_NUMERIC_TEXT = 100;

/** True for numeric text (leading and trailing blanks ignored). */
function isNumericText(v) {
    const t = v.trim();
    return t.length <= MAX_NUMERIC_TEXT && NUMERIC_TEXT.test(t);
}
const MAX_ISSUES = 100;

const isBlank = (v) => v === null || v === undefined || v === "" || typeof v === "function" || typeof v === "symbol";

function classify(v, inferNumbers) {
    if (isBlank(v)) {
        return null;
    }
    switch (typeof v) {
        case "number":
            return Number.isFinite(v) ? "number" : null;
        case "boolean":
            return "boolean";
        case "string":
            if (isIsoDate(v)) {
                return "date";
            }
            return inferNumbers && isNumericText(v) ? "number" : "string";
        case "bigint":
            return "number";
        default:
            return v instanceof Date ? (Number.isNaN(v.getTime()) ? null : "date") : "string";
    }
}

function inferType(raw, inferNumbers) {
    let type = null;
    for (let i = 0; i < raw.length; i++) {
        const t = classify(raw[i], inferNumbers);
        if (t === "string") {
            // text absorbs every other type: nothing after it can change the result
            return "string";
        }
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
            return "";
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
    if (typeof v === "string" && isNumericText(v)) {
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

/** Per type: raw value -> dictionary key, null for blank. */
const KEY_OF = {
    number: (v) => {
        const n = toNumberValue(v);
        return Number.isNaN(n) ? null : n;
    },
    boolean: toBooleanValue,
    date: (v, toWall) => {
        const ms = toWallMs(v, toWall);
        return Number.isNaN(ms) ? null : ms;
    },
    string: (v) => {
        const t = toText(v);
        return t === "" ? null : t;
    },
    null: () => null
};

/**
 * Builds one encoded column from its raw values.
 * @param {string} name
 * @param {ArrayLike<unknown>} raw
 * @param {ColumnType} type
 * @param {(instant: number) => number} toWall
 * @returns {Column}
 */
function encodeColumn(name, raw, type, toWall) {
    const n = raw.length;
    const codes = new Int32Array(n);
    const dict = [];
    const index = new Map();
    const values = type === "number" || type === "boolean" || type === "date" ? new Float64Array(n) : null;
    const keyOf = KEY_OF[type];
    let dateOnly = true;
    for (let i = 0; i < n; i++) {
        const v = raw[i];
        const key = isBlank(v) ? null : keyOf(v, toWall);
        if (key === null) {
            codes[i] = -1;
            if (values) {
                values[i] = NaN;
            }
            continue;
        }
        if (type === "date" && key % MS_PER_DAY !== 0) {
            dateOnly = false;
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
    const key = name.toLowerCase();
    /** @type {Column} */
    const column = { name, key, id: `column:${key}`, type, codes, dict, values };
    if (type === "date") {
        column.dateOnly = dateOnly;
    }
    return column;
}

/**
 * Columnar input of `encode`: one array per column instead of one object per row, the shape a reader
 * of `pivotkit-core/import` returns and a server can send without repeating every name per row.
 * `data[c][r]` is the value of column `columns[c]` in row `r`; every array has the same length.
 * `types[c]`, when given, is the column's type (as `options.types`, which takes precedence); a
 * missing or `null` entry is inferred.
 * @typedef {object} ColumnarData
 * @property {string[]} columns
 * @property {Array<Exclude<ColumnType, "null"> | null | undefined>} [types]
 * @property {ArrayLike<unknown>[]} data
 */

/**
 * True for the columnar input of `encode` (an object with `columns` and `data` arrays), as opposed to
 * an array of row objects.
 * @param {unknown} input
 * @returns {input is ColumnarData}
 */
export function isColumnar(input) {
    const d = /** @type {any} */ (input);
    return d !== null && typeof d === "object" && !Array.isArray(d) && Array.isArray(d.columns) && Array.isArray(d.data);
}

/** An array or a typed array: the values of one column. */
const isColumnArray = (v) => Array.isArray(v) || (ArrayBuffer.isView(v) && !(v instanceof DataView));

/**
 * Encodes the source data: an array of row objects, or columnar data (`{ columns, types, data }`, one
 * array per column, see `ColumnarData`), which needs no object per row.
 *
 * Column names are matched case-insensitively: "Team" and "team" are one column, displayed with the
 * spelling seen first, and reported in `issues` (in columnar data the later of two such columns is
 * left out). Types are inferred (number, boolean, date for Date objects and ISO date strings,
 * otherwise string; a column of mixed types is string) unless `options.types` or the columnar
 * `types` name them. Functions and symbols are blank.
 *
 * @param {Array<Record<string, unknown>> | ColumnarData} rows
 * @param {object} [options]
 * @param {Record<string, Exclude<ColumnType, "null">>} [options.types]  type per column name (case-insensitive)
 * @param {string[]} [options.columns]  only these columns (case-insensitive), in this order
 * @param {string} [options.timeZone]  "UTC" (default), an IANA name or "local": the wall clock of Date
 *   objects and ISO strings with an offset
 * @param {boolean} [options.inferNumbers]  numeric text ("12", "-3.5") makes a number column
 * @param {Partial<import("./limits.js").Limits>} [options.limits]  `rows` caps the input size
 * @returns {Encoded}
 */
export function encode(rows, options) {
    options = optionsOf(options, "encode");
    const columnar = isColumnar(rows);
    expect(columnar || Array.isArray(rows), "encode(rows): rows must be an array of objects or columnar data { columns, data }");
    const limits = resolveLimits(options);
    const timeZone = resolveTimeZone(options.timeZone);
    const toWall = wallClock(timeZone);
    const inferNumbers = options.inferNumbers === true;
    const wanted = Array.isArray(options.columns)
        ? new Set(options.columns.filter((c) => typeof c === "string").map((c) => c.toLowerCase()))
        : null;

    /** @type {Issue[]} */
    const issues = [];
    const report = (path, message) => {
        if (issues.length < MAX_ISSUES) {
            issues.push({ path, message });
        }
    };
    const { n, found } = columnar
        ? columnsOf(/** @type {ColumnarData} */ (rows), wanted, limits, report)
        : columnsOfRows(/** @type {Array<Record<string, unknown>>} */ (rows), wanted, limits, report);

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
    const detected = new Map();
    const columns = order.map((key) => {
        const { name, raw, type } = found.get(key);
        const plain = inferType(raw, inferNumbers);
        const asNumbers = plain === "string" && !inferNumbers ? inferType(raw, true) : plain;
        detected.set(key, asNumbers);
        return encodeColumn(name, raw, typeOverrides.get(key) ?? type ?? plain, toWall);
    });
    return makeEncoded(n, columns, { timeZone, issues, detected, cacheEntries: limits.cacheEntries });
}

/**
 * @typedef {Map<string, { name: string, raw: ArrayLike<unknown>, type?: Exclude<ColumnType, "null">, spellings?: Set<string> }>} FoundColumns
 */

/**
 * The columns of an array of row objects, by lower-case name.
 * @returns {{ n: number, found: FoundColumns }}
 */
function columnsOfRows(rows, wanted, limits, report) {
    checkLimit("rows", rows.length, limits.rows, "rows");
    const n = rows.length;
    /** @type {Map<string, { name: string, raw: unknown[], spellings: Set<string> }>} */
    const found = new Map();
    for (let r = 0; r < n; r++) {
        const row = rows[r];
        if (row === null || typeof row !== "object") {
            continue;
        }
        const seen = new Set();
        for (const k of Object.keys(row)) {
            const key = k.toLowerCase();
            let col = found.get(key);
            if (col === undefined) {
                if (wanted && !wanted.has(key)) {
                    continue;
                }
                col = { name: k, raw: new Array(n).fill(null), spellings: new Set([k]) };
                found.set(key, col);
            } else if (!col.spellings.has(k)) {
                col.spellings.add(k);
                report(col.name, `"${k}" and "${col.name}" are one column: names match case-insensitively`);
            }
            if (seen.has(key)) {
                report(col.name, `row ${r} has "${k}" next to another spelling of it; the later value is used`);
            }
            seen.add(key);
            col.raw[r] = row[k];
        }
    }
    return { n, found };
}

/**
 * The columns of columnar data, by lower-case name; the arrays are used as they are, not copied.
 * @param {ColumnarData} input
 * @returns {{ n: number, found: FoundColumns }}
 */
function columnsOf(input, wanted, limits, report) {
    const { columns, data, types } = input;
    expect(data.length === columns.length, `encode(data): ${columns.length} column names but ${data.length} arrays in data`);
    expect(types === undefined || types === null || Array.isArray(types), "encode(data): types must be an array, one entry per column");
    const n = data.length === 0 ? 0 : data[0]?.length;
    for (let c = 0; c < data.length; c++) {
        expect(isColumnArray(data[c]), `encode(data): data[${c}] must be an array of the values of column ${c}`);
        expect(data[c].length === n, `encode(data): every column must have the same length; data[0] has ${n} values, data[${c}] ${data[c].length}`);
    }
    checkLimit("rows", n, limits.rows, "rows");
    /** @type {FoundColumns} */
    const found = new Map();
    for (let c = 0; c < columns.length; c++) {
        const name = columns[c];
        expect(typeof name === "string", `encode(data): columns[${c}] must be a string`);
        const key = name.toLowerCase();
        if (wanted && !wanted.has(key)) {
            continue;
        }
        const earlier = found.get(key);
        if (earlier !== undefined) {
            report(earlier.name, `"${name}" and "${earlier.name}" are one column: names match case-insensitively; the later column is left out`);
            continue;
        }
        const t = types ? types[c] : undefined;
        expect(t === undefined || t === null || COLUMN_TYPES.includes(t), `encode(data): types[${c}] must be one of ${COLUMN_TYPES.join(", ")}`);
        found.set(key, { name, raw: data[c], type: t ?? undefined });
    }
    return { n, found };
}

/**
 * @param {number} length
 * @param {Column[]} columns
 * @param {{ timeZone: string, issues: Issue[], detected: Map<string, ColumnType>, cacheEntries: number }} meta
 * @returns {Encoded}
 */
function makeEncoded(length, columns, meta) {
    const byKey = new Map(columns.map((c) => [c.key, c]));
    const encoded = {
        length,
        columns,
        schema: { fields: columns.map((c) => ({ name: c.name, type: c.type, detected: meta.detected.get(c.key) ?? c.type })) },
        column: (name) => (typeof name === "string" ? byKey.get(name.toLowerCase()) : undefined),
        timeZone: meta.timeZone,
        issues: meta.issues
    };
    // internal; not enumerable so the data set prints and compares without it
    Object.defineProperty(encoded, "cache", { value: createCache(meta.cacheEntries), enumerable: false });
    return /** @type {Encoded} */ (encoded);
}

/**
 * True for the output of encode().
 * @param {unknown} data
 * @returns {data is Encoded}
 */
export function isEncoded(data) {
    const d = /** @type {any} */ (data);
    return d !== null && typeof d === "object" && Array.isArray(d.columns) && typeof d.column === "function" && "cache" in d;
}

/*
 * A table packed for a compute worker (a code source's data or an HTTP source's CSV answer, kept in
 * the main thread and computed in a worker): text columns dictionary-coded (codes in the narrowest
 * typed array their count fits, each distinct text once, all of them as one UTF-8 buffer with their
 * ends), whole-number columns in the narrowest integer array their range fits, other number, date
 * and true/false columns as typed arrays, any other column as it is. The typed arrays and the
 * dictionaries' bytes sit on SharedArrayBuffers, so posting a packed table to a worker (or back)
 * copies its mixed columns only, never a value per cell or a text; neither side writes them after
 * packing. Its size (`packedBytes`) is exact for everything but mixed columns, so the load cache
 * counts what it holds.
 */

import { Buffer } from "node:buffer";

/** A text column's code of a blank (null or undefined); a text's code is its place in the dictionary plus one. */
const BLANK = 0;
/** A true/false column's bytes. */
const FALSE = 0;
const TRUE = 1;
const NONE = 2;

/** About the bytes one distinct text takes: two a character and the string's header. */
const textBytes = (text) => 16 + 2 * text.length;

/**
 * The most characters a column's dictionary may have as one buffer (a JS string holds about 2^29);
 * a larger one, or one with a lone surrogate (UTF-8 cannot carry it), stays a list of strings.
 */
const DICT_CHARS = 2 ** 28;

/** The integer arrays a whole-number column may take, narrowest first, with their range. */
const INTEGERS = /** @type {const} */ ([
    [Uint8Array, 0, 255],
    [Int8Array, -128, 127],
    [Uint16Array, 0, 65_535],
    [Int16Array, -32_768, 32_767],
    [Int32Array, -2_147_483_648, 2_147_483_647]
]);

/**
 * @typedef {Uint8Array | Uint16Array | Uint32Array} Codes
 * @typedef {{ name: string, type?: string, kind: "text", codes: Codes, text: Uint8Array, ends: Uint32Array } | { name: string, type?: string, kind: "text", codes: Codes, dict: string[] }
 *   | { name: string, type?: string, kind: "number" | "date", values: Float64Array | Uint8Array | Int8Array | Uint16Array | Int16Array | Int32Array, blank: Uint8Array | null }
 *   | { name: string, type?: string, kind: "boolean", values: Uint8Array }
 *   | { name: string, type?: string, kind: "any", values: unknown[], bytes: number }} PackedColumn
 */

/**
 * @typedef {{ packed: true, length: number, dropped: number, columns: PackedColumn[] }} PackedTable
 *   `length` the rows (also when no column is left), `dropped` the hidden fields left out before packing
 */

/** A typed array on a SharedArrayBuffer of its own. */
function shared(Kind, length) {
    return new Kind(new SharedArrayBuffer(Math.max(1, length) * Kind.BYTES_PER_ELEMENT), 0, length);
}

/**
 * What a column holds: one kind for all its values that are not blank, else "any". This decides
 * only how a column travels, not its type: encode() still infers the type from the unpacked values
 * in the worker (or takes the host's `types`), as it does for any other table. Packing has to pick a
 * typed array before encode runs, and unpackTable gives encode back the very values it would have
 * read, so the two never disagree.
 */
function kindOf(values) {
    let kind = null;
    for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (v === null || v === undefined) {
            continue;
        }
        const k = typeof v === "string" ? "text" : typeof v === "number" ? "number" : typeof v === "boolean" ? "boolean" : v instanceof Date ? "date" : "any";
        if (k === "any" || (kind !== null && k !== kind)) {
            return "any";
        }
        kind = k;
    }
    return kind ?? "text";
}

/**
 * About the bytes a mixed column takes: a reference a cell, and per value its own size (a text by
 * its length in every cell, as two equal texts may be two strings; a Date, a BigInt or a number
 * that is no small integer about 24).
 */
function anyBytes(values) {
    let bytes = 8 * values.length;
    for (const v of values) {
        if (typeof v === "string") {
            bytes += textBytes(v);
        } else if (v instanceof Date || typeof v === "bigint" || (typeof v === "number" && !(Number.isInteger(v) && Math.abs(v) < 2 ** 30))) {
            bytes += 24;
        }
    }
    return bytes;
}

/**
 * Packs one column of plain values.
 * @param {string} name
 * @param {string | undefined} type
 * @param {unknown[]} values
 * @returns {PackedColumn}
 */
function packColumn(name, type, values) {
    const kind = kindOf(values);
    const n = values.length;
    const base = type ? { name, type } : { name };
    if (kind === "text") {
        const all = new Uint32Array(n);
        /** @type {Map<string, number>} */
        const index = new Map();
        /** @type {string[]} */
        const dict = [];
        for (let i = 0; i < n; i++) {
            const v = /** @type {string | null | undefined} */ (values[i]);
            if (v === null || v === undefined) {
                all[i] = BLANK;
                continue;
            }
            let code = index.get(v);
            if (code === undefined) {
                dict.push(v);
                code = dict.length;
                index.set(v, code);
            }
            all[i] = code;
        }
        const codes = shared(dict.length < 256 ? Uint8Array : dict.length < 65_536 ? Uint16Array : Uint32Array, n);
        codes.set(all);
        return /** @type {PackedColumn} */ ({ ...base, kind, codes, ...dictionaryOf(dict) });
    }
    if (kind === "number") {
        const Kind = integerArrayOf(values);
        if (Kind) {
            const out = shared(Kind, n);
            /** @type {Uint8Array | null} */
            let blank = null;
            for (let i = 0; i < n; i++) {
                const v = values[i];
                if (v === null || v === undefined) {
                    blank ??= shared(Uint8Array, n);
                    blank[i] = 1;
                } else {
                    out[i] = /** @type {number} */ (v);
                }
            }
            return /** @type {PackedColumn} */ ({ ...base, kind, values: out, blank });
        }
    }
    if (kind === "number" || kind === "date") {
        const out = shared(Float64Array, n);
        /** @type {Uint8Array | null} */
        let blank = null;
        for (let i = 0; i < n; i++) {
            const v = values[i];
            if (v === null || v === undefined) {
                blank ??= shared(Uint8Array, n);
                blank[i] = 1;
            } else {
                out[i] = kind === "date" ? Date.prototype.getTime.call(v) : v;
            }
        }
        return /** @type {PackedColumn} */ ({ ...base, kind, values: out, blank });
    }
    if (kind === "boolean") {
        const out = shared(Uint8Array, n);
        for (let i = 0; i < n; i++) {
            const v = values[i];
            out[i] = v === true ? TRUE : v === false ? FALSE : NONE;
        }
        return /** @type {PackedColumn} */ ({ ...base, kind, values: out });
    }
    return /** @type {PackedColumn} */ ({ ...base, kind: "any", values, bytes: anyBytes(values) });
}

/**
 * A dictionary as one UTF-8 buffer and each text's end (in UTF-16 units of the joined text) on
 * SharedArrayBuffers; a list of strings when it is too large for one string or holds a lone
 * surrogate (UTF-8 would change it).
 * @param {string[]} dict
 * @returns {{ text: Uint8Array, ends: Uint32Array } | { dict: string[] }}
 */
function dictionaryOf(dict) {
    let chars = 0;
    for (const t of dict) {
        chars += t.length;
    }
    if (chars > DICT_CHARS) {
        return { dict };
    }
    const joined = dict.join("");
    // String.prototype.isWellFormed: Node 20 and later (the type library does not name it yet)
    if (!/** @type {any} */ (joined).isWellFormed()) {
        return { dict };
    }
    const ends = shared(Uint32Array, dict.length);
    let end = 0;
    for (let i = 0; i < dict.length; i++) {
        end += dict[i].length;
        ends[i] = end;
    }
    const text = shared(Uint8Array, Buffer.byteLength(joined, "utf8"));
    Buffer.from(text.buffer, text.byteOffset, text.length).write(joined, "utf8");
    return { text, ends };
}

/** A dictionary's texts back (in a worker). */
function textsOf(column) {
    if ("dict" in column) {
        return column.dict;
    }
    const joined = Buffer.from(column.text.buffer, column.text.byteOffset, column.text.length).toString("utf8");
    const out = new Array(column.ends.length);
    let start = 0;
    for (let i = 0; i < out.length; i++) {
        out[i] = joined.slice(start, column.ends[i]);
        start = column.ends[i];
    }
    return out;
}

/**
 * The narrowest integer array a number column fits: every value a whole number (not -0) within
 * Int32's range; null when one is not (it stays Float64).
 * @param {unknown[]} values
 */
function integerArrayOf(values) {
    let min = 0;
    let max = 0;
    for (let i = 0; i < values.length; i++) {
        const v = /** @type {number | null | undefined} */ (values[i]);
        if (v === null || v === undefined) {
            continue;
        }
        if (!Number.isInteger(v) || Object.is(v, -0) || v < -2_147_483_648 || v > 2_147_483_647) {
            return null;
        }
        min = v < min ? v : min;
        max = v > max ? v : max;
    }
    return INTEGERS.find(([, lo, hi]) => min >= lo && max <= hi)?.[0] ?? null;
}

/**
 * Packs plain columnar data (sources/code.js, after data.js codeTable).
 * @param {{ columns: string[], types?: Array<string | undefined>, data: unknown[][] }} table
 * @param {number} length  the rows, also when no column is left
 * @param {number} dropped  hidden fields already left out
 * @returns {PackedTable}
 */
export function packTable(table, length, dropped) {
    return { packed: true, length, dropped, columns: table.columns.map((name, i) => packColumn(name, table.types?.[i], table.data[i] ?? [])) };
}

/** Whether a value is a packed table (a worker's job). */
export const isPacked = (table) => table !== null && typeof table === "object" && /** @type {any} */ (table).packed === true;

/**
 * The bytes a packed table holds: its typed arrays, its dictionaries' texts, and the estimate of
 * its mixed columns.
 * @param {PackedTable} table
 */
export function packedBytes(table) {
    let bytes = 64;
    for (const column of table.columns) {
        bytes += textBytes(column.name);
        if (column.kind === "text") {
            bytes += column.codes.byteLength;
            if ("dict" in column) {
                for (const text of column.dict) {
                    bytes += 8 + textBytes(text);
                }
            } else {
                bytes += column.text.byteLength + column.ends.byteLength;
            }
        } else if (column.kind === "any") {
            bytes += column.bytes;
        } else {
            bytes += column.values.byteLength + (column.kind !== "boolean" && column.blank ? column.blank.byteLength : 0);
        }
    }
    return bytes;
}

/**
 * A packed table as encode() reads it (in a worker): columnar data, or, without any column, as
 * many empty rows as it had, so the row count stays.
 * @param {PackedTable} table
 * @returns {{ columns: string[], types: Array<string | undefined>, data: unknown[][] } | Array<Record<string, never>>}
 */
export function unpackTable(table) {
    const n = table.length;
    if (table.columns.length === 0) {
        return Array.from({ length: n }, () => ({}));
    }
    const data = table.columns.map((column) => {
        if (column.kind === "text") {
            const { codes } = column;
            const dict = textsOf(column);
            const out = new Array(n);
            for (let i = 0; i < n; i++) {
                out[i] = codes[i] === BLANK ? null : dict[codes[i] - 1];
            }
            return out;
        }
        if (column.kind === "number" || column.kind === "date") {
            const { values, blank } = column;
            const out = new Array(n);
            for (let i = 0; i < n; i++) {
                out[i] = blank?.[i] ? null : column.kind === "date" ? new Date(values[i]) : values[i];
            }
            return out;
        }
        if (column.kind === "boolean") {
            return Array.from(column.values, (v) => (v === TRUE ? true : v === FALSE ? false : null));
        }
        return /** @type {unknown[]} */ (column.values);
    });
    return { columns: table.columns.map((c) => c.name), types: table.columns.map((c) => c.type), data };
}

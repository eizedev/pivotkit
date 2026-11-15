/*
 * The data of a source for an operation: read a file the safe way (pivotkit-cli/files), drop the
 * columns the policy hides, encode, and keep the last few data sets (by the file's identity, size and
 * time, or a table job's key), so a model's run of describe, validate and render reads a file once
 * (a code source's data is kept by sources/run.js). Each data set says when it is from (asOf, sources/as-of.js). Encoding
 * and the operation run inside a compute worker (file sources, tables loaded in the main thread,
 * uploaded files); in the main thread only a code source's rows are read once into a plain table
 * (codeTable), so the host's code stays in its process.
 */

import { stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { LIMITS, PivotkitError, encode } from "pivotkit-core";
import { asCliError, readSafe, readTable } from "pivotkit-cli/files";
import { OperationError } from "pivotkit-report/operations";
import { fieldKey, levelOf } from "./policy.js";
import { sourceStats } from "./stats.js";
import { asOfText } from "./sources/as-of.js";
import { uploadError } from "./sources/inline.js";
import { ownError } from "./sources/run.js";

/**
 * What a worker or the main thread needs to read a source.
 * @typedef {object} SourceSpec
 * @property {string} id
 * @property {"source" | "file" | "inline"} kind
 * @property {string} [path]  a file's real path
 * @property {string[]} [allow]  the allowed directories (file: sources)
 * @property {boolean} [hardLinks]
 * @property {string} [sheet]
 * @property {string} name  how a report names the data
 * @property {{ default: string, fields: Record<string, string> }} levels  the policy's levels (field names in lower case)
 * @property {Partial<import("pivotkit-core").Limits>} limits
 * @property {string} [timeZone]
 * @property {boolean} schedulable
 */

/** The data sets kept per process (a worker or the main thread). */
export const CACHE_ENTRIES = 4;

/** Data sets by key, least recently used first. */
const cache = new Map();

/** The data formats read, by extension. */
const FORMATS = new Set(["csv", "tsv", "txt", "json", "xlsx"]);

/** The names of the columns the levels hide, in lower case. */
const hiddenOf = (levels, columns) => {
    const policy = { default: levels.default, fields: new Map(Object.entries(levels.fields)) };
    return columns.filter((c) => levelOf(policy, c) === "hide").map(fieldKey);
};

/** Columnar data without the hidden columns. */
function withoutHidden(table, hide) {
    if (!hide.length) {
        return { columns: table.columns, types: table.types, data: table.data };
    }
    const keep = table.columns.map((c, i) => (hide.includes(fieldKey(c)) ? -1 : i)).filter((i) => i >= 0);
    return { columns: keep.map((i) => table.columns[i]), types: table.types ? keep.map((i) => table.types[i]) : undefined, data: keep.map((i) => table.data[i]) };
}

/** Reader notes without those about a hidden column: nothing about it reaches the model. */
const cleanNotes = (notes, hide) => notes.filter((n) => !hide.some((h) => fieldKey(n.message).includes(h)));

/** Keeps a data set, the oldest going first. */
function remember(key, value) {
    cache.delete(key);
    cache.set(key, value);
    while (cache.size > CACHE_ENTRIES) {
        cache.delete(cache.keys().next().value);
    }
    return value;
}

/** Any error of reading as an OperationError (no file content, the file's base name only). */
export function asOperationError(error, name) {
    if (error instanceof OperationError) {
        return error;
    }
    if (error instanceof PivotkitError) {
        const code = error.code === "LIMIT_EXCEEDED" ? "LIMIT_EXCEEDED" : error.code === "INVALID_FILE" ? "INVALID_FILE" : error.code === "INVALID_TEMPLATE" ? "INVALID_TEMPLATE" : "INTERNAL";
        if (code === "INVALID_FILE") {
            // a reader's message can quote the file (a JSON parser's snippet): the reason's code only
            const reason = typeof error.details?.reason === "string" ? error.details.reason : "INVALID_FILE";
            return new OperationError(code, `${basename(String(name ?? "file"))}: cannot be read (${reason})`);
        }
        return new OperationError(code, code === "INTERNAL" ? "internal error" : String(error.message).slice(0, 300));
    }
    const cli = asCliError(error, name);
    const byCode = { NOT_FOUND: "FILE_NOT_AVAILABLE", OUTSIDE_ALLOWED_DIR: "FILE_NOT_AVAILABLE", CHANGED: "FILE_NOT_AVAILABLE", ENOENT: "FILE_NOT_AVAILABLE", EACCES: "FILE_NOT_AVAILABLE", EPERM: "FILE_NOT_AVAILABLE", ELOOP: "FILE_NOT_AVAILABLE", ENOTDIR: "FILE_NOT_AVAILABLE", NOT_REGULAR_FILE: "NOT_REGULAR_FILE", EISDIR: "NOT_REGULAR_FILE", HARD_LINK: "HARD_LINK", LIMIT_EXCEEDED: "LIMIT_EXCEEDED" };
    const code = byCode[cli.code] ?? (cli.kind === "limit" ? "LIMIT_EXCEEDED" : cli.kind === "io" ? "INVALID_FILE" : "INTERNAL");
    // a file that is missing, outside the directories or replaced says the same: no probing for files
    const message = code === "FILE_NOT_AVAILABLE" ? `${basename(String(name ?? "file"))}: not available (no such file in the allowed directories)` : code === "INTERNAL" ? "internal error" : cli.message;
    return new OperationError(/** @type {any} */ (code), message);
}

/**
 * The data of a file source, encoded, with the reader's notes.
 * @param {SourceSpec} spec
 * @returns {Promise<import("pivotkit-report/operations").SourceData>}
 */
export async function fileData(spec) {
    // an operator's source is named by its id or title, never by its file: the path is the operator's
    const label = spec.kind === "source" ? spec.name : basename(spec.path ?? "");
    const format = extname(spec.path ?? "").slice(1).toLowerCase();
    if (!FORMATS.has(format)) {
        throw new OperationError("UNSUPPORTED_FORMAT", `${label}: pivotkit reads csv, tsv, txt, json and xlsx files`);
    }
    try {
        const info = await stat(/** @type {string} */ (spec.path));
        const key = JSON.stringify([spec.path, info.dev, info.ino, info.size, info.mtimeMs, spec.sheet ?? null, spec.levels, spec.timeZone ?? null, spec.limits, spec.hardLinks ?? true]);
        // the cache keeps what the file gives; what the source says about it (its name, whether it may be
        // scheduled) is added on every call, since one file can be a source and a file: at once
        const of = (read) => ({ ...read, name: spec.name, schedulable: spec.schedulable });
        if (cache.has(key)) {
            return of(remember(key, cache.get(key)));
        }
        const bytes = await readSafe(/** @type {string} */ (spec.path), { cwd: "/", allow: spec.allow ?? [], maxBytes: spec.limits.fileBytes ?? 52_428_800, hardLinks: spec.hardLinks ?? true });
        const { table, notes } = await readTable(bytes, label, { format, ...(spec.sheet ? { sheet: spec.sheet } : {}), ...(spec.timeZone ? { timeZone: spec.timeZone } : {}), limits: spec.limits });
        const hide = hiddenOf(spec.levels, table.columns);
        const data = encode(withoutHidden(table, hide), { timeZone: spec.timeZone ?? "UTC", limits: spec.limits });
        return of(remember(key, { data, notes: cleanNotes(notes, hide), hidden: hide.length, stats: sourceStats(data), asOf: asOfText(info.mtime) }));
    } catch (e) {
        const error = asOperationError(e, spec.path);
        if (spec.kind !== "source") {
            throw error;
        }
        // the operator's file name stays on the server: the message names the source
        throw error.code === "FILE_NOT_AVAILABLE" ? new OperationError("FILE_NOT_AVAILABLE", `the source ${spec.name} is not available now; tell the operator`) : new OperationError(/** @type {any} */ (error.code), error.message.split(basename(spec.path ?? "")).join(spec.name));
    }
}

/** A loaded table over a limit (limits.rows, limits.columns, limits.importCells), as pivotkit-core words it. */
export const overLimit = (limit, value, max, what) => ownError(new OperationError("LIMIT_EXCEEDED", `${value.toLocaleString("en-US")} ${what} exceed the limit of ${max.toLocaleString("en-US")} (limits.${limit})`));

/**
 * A host's value as a plain value encode() reads without running the host's code: text cut at the
 * longest a loaded table may hold, a Date copied, any other object written as encode writes it
 * (JSON) and cut too. Reading it may run the host's code (a getter, toJSON): its errors are the
 * source's.
 */
function plainOf(value, max) {
    if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
        return value;
    }
    if (typeof value === "string") {
        return value.length > max ? value.slice(0, max) : value;
    }
    if (value instanceof Date) {
        return new Date(Date.prototype.getTime.call(value));
    }
    let text;
    try {
        text = typeof value === "object" ? (JSON.stringify(value) ?? "") : String(value);
    } catch {
        // as encode does with a value it cannot write
        text = "";
    }
    return text.length > max ? text.slice(0, max) : text;
}

/** A row's own keys, at most `max` of them: one key more than that ends the count. */
function keysOf(row, max) {
    const keys = [];
    for (const key in row) {
        if (Object.hasOwn(row, key)) {
            keys.push(key);
            if (keys.length > max) {
                break;
            }
        }
    }
    return keys;
}

/**
 * What a code source's load() gave, read once into plain values (the host's code, getters and toJSON,
 * runs only here, and its errors are the source's): checked against the run limits a file has (rows
 * before any is read, columns, cells), texts cut at limits.textLength, hidden fields left out. Rows
 * (`[{...}]` or `{ rows, asOf }`) or columnar data (`{ columns, types?, data, asOf? }`), always as
 * columnar data (posted to a worker at a third of the cost of row objects).
 * @param {unknown} loaded
 * @param {SourceSpec} spec
 * @returns {{ columnar: { columns: string[], types?: string[], data: unknown[][] }, asOf: unknown, hidden: number }}
 */
function loadedTable(loaded, spec) {
    const limits = { ...LIMITS, ...spec.limits };
    const shape = /** @type {any} */ (loaded);
    const rows = Array.isArray(shape) ? shape : shape && typeof shape === "object" && Array.isArray(shape.rows) && !Array.isArray(shape.columns) ? shape.rows : null;
    const asOf = plainAsOf(Array.isArray(shape) ? undefined : shape?.asOf);
    if (rows) {
        if (rows.length > limits.rows) {
            throw overLimit("rows", rows.length, limits.rows, "rows");
        }
        const keys = new Set();
        /** @type {string[][]} */
        const rowKeys = [];
        for (const row of rows) {
            const own = row !== null && typeof row === "object" ? keysOf(row, limits.columns) : [];
            for (const k of own) {
                keys.add(k);
            }
            if (keys.size > limits.columns) {
                throw overLimit("columns", keys.size, limits.columns, "columns");
            }
            rowKeys.push(own);
        }
        if (rows.length * keys.size > limits.importCells) {
            throw overLimit("importCells", rows.length * keys.size, limits.importCells, "cells");
        }
        const hide = new Set(hiddenOf(spec.levels, [...keys]));
        return { columnar: columnsOfRows(rows, rowKeys, hide, limits.textLength), asOf, hidden: hide.size };
    }
    if (!shape || typeof shape !== "object" || typeof shape.column === "function" || !Array.isArray(shape.columns) || !Array.isArray(shape.data)) {
        throw ownError(new OperationError("INTERNAL", "a code source returns rows, { rows, asOf } or columnar data ({ columns, types, data, asOf }), not encoded data, so hidden fields can be dropped"));
    }
    if (shape.columns.length > limits.columns) {
        throw overLimit("columns", shape.columns.length, limits.columns, "columns");
    }
    const count = shape.data.reduce((n, column) => Math.max(n, Array.isArray(column) ? column.length : 0), 0);
    if (count > limits.rows) {
        throw overLimit("rows", count, limits.rows, "rows");
    }
    if (count * shape.columns.length > limits.importCells) {
        throw overLimit("importCells", count * shape.columns.length, limits.importCells, "cells");
    }
    const columns = Array.from(shape.columns, (c) => String(plainOf(c, limits.textLength)));
    const types = Array.isArray(shape.types) ? Array.from(shape.types, (t) => (typeof t === "string" ? t : undefined)) : undefined;
    const data = columns.map((_, i) => (Array.isArray(shape.data[i]) ? Array.from(shape.data[i], (v) => plainOf(v, limits.textLength)) : []));
    const hide = hiddenOf(spec.levels, columns);
    return { columnar: withoutHidden({ columns, types, data }, hide), asOf, hidden: hide.length };
}

/** A host's asOf as a plain value (a Date read without its own methods). */
const plainAsOf = (value) => (value instanceof Date ? Date.prototype.getTime.call(value) : typeof value === "string" || typeof value === "number" ? value : undefined);

/**
 * Rows as columnar data, read as encode() reads rows: keys that differ only in case are one column,
 * named by its first spelling, a later value of a row wins, a missing value is null. Hidden fields
 * (by their field key) are left out, and their values are never read.
 * @param {unknown[]} rows
 * @param {string[][]} rowKeys  each row's own keys
 * @param {Set<string>} hide  the field keys of the hidden fields
 * @param {number} max  limits.textLength
 */
function columnsOfRows(rows, rowKeys, hide, max) {
    /** @type {Map<string, number>} a column by its name in lower case */
    const index = new Map();
    /** @type {Map<string, number>} each spelling's column, -1 for a hidden field (decided once per spelling) */
    const columnOf = new Map();
    /** @type {string[]} */
    const columns = [];
    /** @type {unknown[][]} */
    const data = [];
    for (let r = 0; r < rows.length; r++) {
        const row = /** @type {Record<string, unknown>} */ (rows[r]);
        for (const k of rowKeys[r]) {
            let c = columnOf.get(k);
            if (c === undefined) {
                c = hide.has(fieldKey(k)) ? -1 : index.get(k.toLowerCase());
                if (c === undefined) {
                    c = columns.length;
                    index.set(k.toLowerCase(), c);
                    columns.push(k);
                    data.push(new Array(rows.length).fill(null));
                }
                columnOf.set(k, c);
            }
            if (c >= 0) {
                data[c][r] = plainOf(row[k], max);
            }
        }
    }
    return { columns, data };
}

/**
 * A code source's loaded data (what its load() gave) as a plain table for a worker (a table job):
 * checked against the run limits, hidden fields dropped (`hidden` counts them, since the worker no
 * longer sees them); asOf the source's own (parsed, sources/as-of.js), else now, fixed here so kept
 * data keeps its time. Keeping and reusing it is sources/run.js's; encoding it is the worker's
 * (tableData). Errors of pivotkit's own checks are marked (ownError); an error of the host's code
 * while its data is read is the source's failure.
 * @param {SourceSpec} spec
 * @param {unknown} loaded
 * @returns {{ table: { columns: string[], types?: string[], data: unknown[][] }, hidden: number, asOf: string }}
 */
export function codeTable(spec, loaded) {
    // the host's code runs here: its errors pass unmarked
    const { columnar, asOf, hidden } = loadedTable(loaded, spec);
    // when the host says the data is from, else when load() gave it
    return { table: columnar, hidden, asOf: (asOf !== undefined ? asOfText(asOf) : null) ?? /** @type {string} */ (asOfText(new Date())) };
}

/**
 * A table loaded in the main thread (an HTTP source's rows, data sent in a request), in a worker:
 * hidden columns dropped, encoded, kept by its key (a key of null: never kept).
 * @param {SourceSpec} spec
 * @param {{ columns: string[], rows: unknown[][] } | { columns: string[], types?: string[], data: unknown[][] }} table  rows as lists in the columns' order, or columnar
 * @param {string | null} key  sources/keys.js tableKeyOf
 * @param {string | null} [asOf]  when the data is from (sources/as-of.js asOfText)
 * @param {import("pivotkit-report/operations").Finding[]} [notes]
 * @param {number} [dropped]  hidden fields the main thread already left out (a code source's), counted with those dropped here
 */
export function tableData(spec, table, key, asOf = null, notes = [], dropped = 0) {
    const of = (read) => ({ ...read, name: spec.name, schedulable: spec.schedulable });
    if (key !== null && cache.has(key)) {
        return of(remember(key, cache.get(key)));
    }
    const columns = Array.isArray(table?.columns) ? table.columns.map(String) : null;
    if (!columns) {
        throw new OperationError("INTERNAL", "a table has columns and rows (or columnar data)");
    }
    const columnar = "data" in table && Array.isArray(table.data) ? { columns, types: table.types, data: table.data } : { columns, data: columns.map((_, i) => /** @type {unknown[][]} */ (/** @type {any} */ (table).rows ?? []).map((row) => (Array.isArray(row) ? row[i] : undefined))) };
    const hide = hiddenOf(spec.levels, columns);
    try {
        const data = encode(/** @type {any} */ (withoutHidden(/** @type {any} */ (columnar), hide)), { timeZone: spec.timeZone ?? "UTC", limits: spec.limits });
        const out = { data, notes: cleanNotes(notes, hide), hidden: hide.length + dropped, stats: sourceStats(data), asOf: asOf ?? asOfText(new Date()) };
        return of(key !== null ? remember(key, out) : out);
    } catch (e) {
        throw asOperationError(e, spec.name);
    }
}

/**
 * A file's bytes handed in (an upload), read in a worker with the server's import limits, then as
 * tableData.
 * @param {SourceSpec} spec
 * @param {{ bytes: Uint8Array, format: string, sheet?: string }} upload
 * @param {string | null} key
 * @param {string | null} [asOf]
 */
export async function uploadData(spec, upload, key, asOf = null) {
    if (key !== null && cache.has(key)) {
        return { ...remember(key, cache.get(key)), name: spec.name, schedulable: spec.schedulable };
    }
    const format = String(upload.format ?? "").toLowerCase();
    if (!FORMATS.has(format)) {
        throw new OperationError("UNSUPPORTED_FORMAT", `${spec.name}: pivotkit reads csv, tsv, txt, json and xlsx files`);
    }
    if (upload.bytes.length > (spec.limits.fileBytes ?? 52_428_800)) {
        throw new OperationError("LIMIT_EXCEEDED", `${spec.name}: the file is larger than the server reads (limits.fileBytes)`);
    }
    let read;
    try {
        read = await readTable(upload.bytes, `${spec.name}.${format}`, { format, ...(upload.sheet ? { sheet: upload.sheet } : {}), ...(spec.timeZone ? { timeZone: spec.timeZone } : {}), limits: spec.limits });
    } catch (e) {
        // the caller's own file (inline:): its reader's sentence, not only a code (sources/inline.js)
        throw spec.kind === "inline" ? await uploadError(e, upload, spec.limits) : asOperationError(e, spec.name);
    }
    return tableData(spec, read.table, key, asOf, read.notes);
}

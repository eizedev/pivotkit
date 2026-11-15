/*
 * The data of a source for an operation: read a file the safe way (pivotkit-cli/files), drop the
 * columns the policy hides, encode, and keep the last few data sets (by the file's identity, size and
 * time, or a table job's key), so a model's run of describe, validate and render reads a file once
 * (a code source's data is kept by sources/run.js). Each data set says when it is from (asOf, sources/as-of.js). Used inside
 * a compute worker (file sources, tables loaded in the main thread, uploaded files) and in the main
 * thread (code sources of a library host).
 */

import { stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { LIMITS, PivotkitError, encode } from "pivotkit-core";
import { asCliError, readSafe, readTable } from "pivotkit-cli/files";
import { OperationError } from "pivotkit-report/operations";
import { fieldKey, levelOf } from "./policy.js";
import { sourceStats } from "./stats.js";
import { asOfText } from "./sources/as-of.js";
import { isOwnError, ownError } from "./sources/run.js";

/**
 * What a worker or the main thread needs to read a source.
 * @typedef {object} SourceSpec
 * @property {string} id
 * @property {"source" | "file"} kind
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
const overLimit = (limit, value, max, what) => ownError(new OperationError("LIMIT_EXCEEDED", `${value.toLocaleString("en-US")} ${what} exceed the limit of ${max.toLocaleString("en-US")} (limits.${limit})`));

/** A value cut to the longest text a loaded table may hold. */
const cut = (value, max) => (typeof value === "string" && value.length > max ? value.slice(0, max) : value);

/**
 * What a code source's load() gave, checked against the run limits a file has (rows, columns, cells)
 * and its texts cut at limits.textLength, on a copy: rows (`[{...}]` or `{ rows, asOf }`) or
 * columnar data (`{ columns, types?, data, asOf? }`), with its asOf.
 * @param {unknown} loaded
 * @param {Partial<import("pivotkit-core").Limits>} given  the server's limits
 * @returns {{ rows: Array<Record<string, unknown>> | null, columnar: { columns: string[], types?: string[], data: unknown[][] } | null, asOf: unknown }}
 */
function loadedTable(loaded, given) {
    const limits = { ...LIMITS, ...given };
    const shape = /** @type {any} */ (loaded);
    const rows = Array.isArray(shape) ? shape : shape && typeof shape === "object" && Array.isArray(shape.rows) && !Array.isArray(shape.columns) ? shape.rows : null;
    if (rows) {
        if (rows.length > limits.rows) {
            throw overLimit("rows", rows.length, limits.rows, "rows");
        }
        const keys = new Set();
        let long = false;
        for (const row of rows) {
            for (const [k, v] of Object.entries(row ?? {})) {
                keys.add(k);
                long ||= typeof v === "string" && v.length > limits.textLength;
            }
            if (keys.size > limits.columns) {
                throw overLimit("columns", keys.size, limits.columns, "columns");
            }
        }
        if (rows.length * keys.size > limits.importCells) {
            throw overLimit("importCells", rows.length * keys.size, limits.importCells, "cells");
        }
        const copy = long ? rows.map((r) => Object.fromEntries(Object.entries(r ?? {}).map(([k, v]) => [k, cut(v, limits.textLength)]))) : rows;
        return { rows: copy, columnar: null, asOf: Array.isArray(shape) ? undefined : shape.asOf };
    }
    if (!shape || typeof shape !== "object" || typeof shape.column === "function" || !Array.isArray(shape.columns) || !Array.isArray(shape.data)) {
        throw ownError(new OperationError("INTERNAL", "a code source returns rows, { rows, asOf } or columnar data ({ columns, types, data, asOf }), not encoded data, so hidden fields can be dropped"));
    }
    const count = shape.data.reduce((n, column) => Math.max(n, Array.isArray(column) ? column.length : 0), 0);
    if (count > limits.rows) {
        throw overLimit("rows", count, limits.rows, "rows");
    }
    if (shape.columns.length > limits.columns) {
        throw overLimit("columns", shape.columns.length, limits.columns, "columns");
    }
    if (count * shape.columns.length > limits.importCells) {
        throw overLimit("importCells", count * shape.columns.length, limits.importCells, "cells");
    }
    const data = shape.data.map((column) => (Array.isArray(column) && column.some((v) => typeof v === "string" && v.length > limits.textLength) ? column.map((v) => cut(v, limits.textLength)) : column));
    return { rows: null, columnar: { columns: shape.columns, types: shape.types, data }, asOf: shape.asOf };
}

/**
 * A code source's loaded data (what its load() gave), checked against the run limits, hidden fields
 * dropped and encoded; asOf the source's own (parsed, sources/as-of.js), else now. Keeping and
 * reusing it is sources/run.js's. pivotkit's own errors are marked (ownError); anything else thrown
 * here comes from the host's data (a getter of its rows) and is the source's failure.
 * @param {SourceSpec} spec
 * @param {unknown} loaded
 */
export function codeTable(spec, loaded) {
    try {
        const { rows, columnar, asOf } = loadedTable(loaded, spec.limits);
        let data;
        let hide;
        if (rows) {
            // rows: the hidden keys dropped from a copy of each row
            const keys = new Set();
            for (const row of rows) {
                for (const k of Object.keys(row ?? {})) {
                    keys.add(k);
                }
            }
            hide = hiddenOf(spec.levels, [...keys]);
            const kept = hide.length ? rows.map((r) => Object.fromEntries(Object.entries(r ?? {}).filter(([k]) => !hide.includes(fieldKey(k))))) : rows;
            data = encode(kept, { timeZone: spec.timeZone ?? "UTC", limits: spec.limits });
        } else {
            const table = /** @type {{ columns: string[], types?: string[], data: unknown[][] }} */ (columnar);
            hide = hiddenOf(spec.levels, table.columns);
            data = encode(/** @type {any} */ (withoutHidden(table, hide)), { timeZone: spec.timeZone ?? "UTC", limits: spec.limits });
        }
        // when the host says the data is from, else when load() gave it
        return { data, notes: [], hidden: hide.length, asOf: (asOf !== undefined ? asOfText(asOf) : null) ?? asOfText(new Date()), stats: sourceStats(data), name: spec.name, schedulable: spec.schedulable };
    } catch (e) {
        if (isOwnError(e)) {
            throw e;
        }
        if (e instanceof PivotkitError) {
            throw ownError(asOperationError(e, spec.name));
        }
        throw e;
    }
}

/**
 * A table loaded in the main thread (an HTTP source's rows, data sent in a request), in a worker:
 * hidden columns dropped, encoded, kept by its key (a key of null: never kept).
 * @param {SourceSpec} spec
 * @param {{ columns: string[], rows: unknown[][] } | { columns: string[], types?: string[], data: unknown[][] }} table  rows as lists in the columns' order, or columnar
 * @param {string | null} key  sources/keys.js tableKeyOf
 * @param {string | null} [asOf]  when the data is from (sources/as-of.js asOfText)
 * @param {import("pivotkit-report/operations").Finding[]} [notes]
 */
export function tableData(spec, table, key, asOf = null, notes = []) {
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
        const out = { data, notes: cleanNotes(notes, hide), hidden: hide.length, stats: sourceStats(data), asOf: asOf ?? asOfText(new Date()) };
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
        throw asOperationError(e, spec.name);
    }
    return tableData(spec, read.table, key, asOf, read.notes);
}

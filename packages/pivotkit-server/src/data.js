/*
 * The data of a source for an operation: read a file the safe way (pivotkit-cli/files), drop the
 * columns the policy hides, encode, and keep the last few data sets (by the file's identity, size and
 * time, or a code source's version), so a model's run of describe, validate and render reads a file
 * once. Used inside a compute worker (file sources) and in the main thread (code sources of a
 * library host).
 */

import { stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { PivotkitError, encode } from "pivotkit-core";
import { asCliError, readSafe, readTable } from "pivotkit-cli/files";
import { OperationError } from "pivotkit-report/operations";

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
const hiddenOf = (levels, columns) => columns.map((c) => String(c).toLowerCase()).filter((c) => (Object.hasOwn(levels.fields, c) ? levels.fields[c] : levels.default) === "hide");

/** Columnar data without the hidden columns. */
function withoutHidden(table, hide) {
    if (!hide.length) {
        return { columns: table.columns, types: table.types, data: table.data };
    }
    const keep = table.columns.map((c, i) => (hide.includes(String(c).toLowerCase()) ? -1 : i)).filter((i) => i >= 0);
    return { columns: keep.map((i) => table.columns[i]), types: keep.map((i) => table.types[i]), data: keep.map((i) => table.data[i]) };
}

/** Reader notes without those about a hidden column: nothing about it reaches the model. */
const cleanNotes = (notes, hide) => notes.filter((n) => !hide.some((h) => n.message.toLowerCase().includes(h)));

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
        return of(remember(key, { data, notes: cleanNotes(notes, hide), hidden: hide.length }));
    } catch (e) {
        const error = asOperationError(e, spec.path);
        if (spec.kind !== "source") {
            throw error;
        }
        // the operator's file name stays on the server: the message names the source
        throw error.code === "FILE_NOT_AVAILABLE" ? new OperationError("FILE_NOT_AVAILABLE", `the source ${spec.name} is not available now; tell the operator`) : new OperationError(/** @type {any} */ (error.code), error.message.split(basename(spec.path ?? "")).join(spec.name));
    }
}

/**
 * The data of a code source (a library host's load()), encoded, with hidden fields dropped.
 * @param {SourceSpec} spec
 * @param {{ load: () => Promise<any>, version?: () => unknown }} source
 */
export async function codeData(spec, source) {
    const version = source.version ? source.version() : null;
    const key = version === null ? null : JSON.stringify(["code", spec.id, version, spec.levels, spec.timeZone ?? null, spec.limits]);
    const of = (read) => ({ ...read, name: spec.name, schedulable: spec.schedulable });
    if (key && cache.has(key)) {
        return of(remember(key, cache.get(key)));
    }
    let loaded;
    try {
        loaded = await source.load();
    } catch (e) {
        // the host's own error stays in the log (its message with --log debug), never in the answer
        throw Object.assign(new OperationError("INTERNAL", "the host could not load this source"), { cause: e });
    }
    const columnar = Array.isArray(loaded) ? loaded : loaded && typeof loaded.column === "function" ? null : loaded;
    if (columnar === null) {
        throw new OperationError("INTERNAL", "a code source returns rows or columnar data ({ columns, types, data }), not encoded data, so hidden fields can be dropped");
    }
    let data;
    let hide;
    if (Array.isArray(columnar)) {
        // rows: the hidden keys dropped from a copy of each row
        const keys = new Set();
        for (const row of columnar) {
            for (const k of Object.keys(row ?? {})) {
                keys.add(k);
            }
        }
        hide = hiddenOf(spec.levels, [...keys]);
        const rows = hide.length ? columnar.map((r) => Object.fromEntries(Object.entries(r ?? {}).filter(([k]) => !hide.includes(k.toLowerCase())))) : columnar;
        data = encode(rows, { timeZone: spec.timeZone ?? "UTC", limits: spec.limits });
    } else {
        hide = hiddenOf(spec.levels, columnar.columns ?? []);
        data = encode(withoutHidden(columnar, hide), { timeZone: spec.timeZone ?? "UTC", limits: spec.limits });
    }
    const out = { data, notes: [], hidden: hide.length };
    return of(key ? remember(key, out) : out);
}

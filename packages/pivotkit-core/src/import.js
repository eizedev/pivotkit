/*
 * pivotkit-core/import: reading a file the user picks into a table for the report, in the browser
 * (nothing is uploaded) or in Node.
 *
 *   import { readFile, BUILT_IN_READERS, retype } from "pivotkit-core/import";
 *   const table = await readFile(file, { plugins: [xlsxReader], signal, onProgress });
 *   const data = encode(table);               // { columns, types, data } is encode's columnar input
 *   const other = retype(table, { Zip: "string" }); // another type, without reading the file again
 *
 * Readers are plugins (contract v1 below): a small descriptor that names the file types it accepts
 * and loads its code on demand. The built-in CSV and JSON readers are plugins too, so this entry stays
 * small and the readers load only when a file is read. A reader plugin package (pivotkit-xlsx) builds
 * its table with `createTable`, so every format is cleaned and typed the same way.
 */

import { PivotkitError } from "./errors.js";
import { resolveLimits } from "./limits.js";
import { IMPORT_TYPES, fileError, fileName, limitError } from "./import-table.js";

export { createTable, retype, noteMessage, cleanText, fileError, limitError, checkFileLimit, bytesOf, readOptions, fileName, dateToIso, IMPORT_NOTE_CODES, IMPORT_TYPES } from "./import-table.js";

/**
 * @typedef {import("./import-table.js").ImportTable} ImportTable
 * @typedef {import("./import-table.js").ImportNote} ImportNote
 * @typedef {import("./import-table.js").ImportType} ImportType
 * @typedef {import("./import-table.js").ImportHints} ImportHints
 * @typedef {import("./import-table.js").ImportProgress} ImportProgress
 * @typedef {import("./import-table.js").ReadOptions} ReadOptions
 */

/** The plugin API version this pivotkit-core supports. */
export const PLUGIN_API_VERSION = 1;

/**
 * A sheet of a file with several (a workbook): what `sheets()` lists.
 * @typedef {object} SheetInfo
 * @property {string} name
 * @property {number} index  0-based, in the file's order
 * @property {boolean} visible  false for a hidden sheet
 */

/**
 * The code of a reader, loaded on demand by `ReaderPlugin.load`.
 * @typedef {object} ReaderModule
 * @property {(file: Blob | ArrayBuffer | Uint8Array, options?: ReadOptions) => Promise<ImportTable>} read
 * @property {(file: Blob | ArrayBuffer | Uint8Array, options?: ReadOptions) => Promise<SheetInfo[]>} [sheets]  for formats with several sheets
 */

/**
 * A reader plugin, contract version 1.
 * @typedef {object} ReaderPlugin
 * @property {1} apiVersion
 * @property {"reader"} kind
 * @property {string} name  unique, lower case: letters, digits and "-" ("csv", "xlsx")
 * @property {string} label  what a file picker shows ("Excel workbook")
 * @property {readonly string[]} accept  file name extensions (".xlsx") and media types ("text/csv")
 * @property {() => Promise<ReaderModule>} load  imports the reader's code, e.g. `() => import("./reader.js")`
 */

const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const EXTENSION = /^\.[a-z0-9]{1,16}$/;
const MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;
const KINDS = ["reader"];

/**
 * Checks a plugin and returns it frozen; throws a PivotkitError (INVALID_ARGUMENT) that says what is
 * wrong. A plugin made for another API version is refused with both versions named.
 * @param {unknown} plugin
 * @returns {ReaderPlugin}
 */
export function validatePlugin(plugin) {
    const p = /** @type {any} */ (plugin);
    const fail = (message) => {
        throw new PivotkitError("INVALID_ARGUMENT", `plugin ${typeof p?.name === "string" ? `"${p.name.slice(0, 64)}" ` : ""}${message}`);
    };
    if (p === null || typeof p !== "object" || Array.isArray(p)) fail("must be an object");
    if (p.apiVersion !== PLUGIN_API_VERSION) {
        fail(`uses plugin API version ${JSON.stringify(p.apiVersion)}; this pivotkit-core supports version ${PLUGIN_API_VERSION}. Use a version of the plugin made for API ${PLUGIN_API_VERSION}, or update pivotkit.`);
    }
    if (!KINDS.includes(p.kind)) fail(`has kind ${JSON.stringify(p.kind)}; API ${PLUGIN_API_VERSION} knows ${KINDS.map((k) => `"${k}"`).join(", ")}`);
    if (typeof p.name !== "string" || !NAME.test(p.name)) fail("needs a name of lower-case letters, digits and \"-\"");
    if (typeof p.label !== "string" || p.label.trim() === "" || p.label.length > 100) fail("needs a label of 1 to 100 characters");
    if (!Array.isArray(p.accept) || p.accept.length === 0 || !p.accept.every((a) => typeof a === "string" && (EXTENSION.test(a) || MEDIA_TYPE.test(a)))) {
        fail('needs accept: file name extensions (".xlsx") and media types ("text/csv"), in lower case');
    }
    if (typeof p.load !== "function") fail("needs load(): a function that imports the reader");
    return Object.freeze({ apiVersion: p.apiVersion, kind: p.kind, name: p.name, label: p.label, accept: [...p.accept], load: p.load });
}

/** The CSV, TSV and text reader of pivotkit-core. */
export const csvReader = validatePlugin({
    apiVersion: 1,
    kind: "reader",
    name: "csv",
    label: "CSV or text",
    accept: [".csv", ".tsv", ".txt", ".tab", "text/csv", "text/tab-separated-values", "text/plain"],
    load: () => import("./import-csv.js")
});

/** The JSON reader of pivotkit-core. */
export const jsonReader = validatePlugin({
    apiVersion: 1,
    kind: "reader",
    name: "json",
    label: "JSON",
    accept: [".json", "application/json"],
    load: () => import("./import-json.js")
});

/** The readers pivotkit-core brings. */
export const BUILT_IN_READERS = Object.freeze([csvReader, jsonReader]);

/**
 * The reader for a file: by its name's extension first, then by its media type; the host's plugins
 * before the built-in ones. Undefined when none accepts it.
 * @param {{ name?: string, type?: string }} file
 * @param {ReaderPlugin[]} [plugins]
 * @returns {ReaderPlugin | undefined}
 */
export function readerFor(file, plugins = []) {
    for (const p of plugins) validatePlugin(p);
    const all = [...plugins, ...BUILT_IN_READERS];
    const name = typeof file?.name === "string" ? file.name.toLowerCase() : "";
    const dot = name.lastIndexOf(".");
    const ext = dot === -1 ? "" : name.slice(dot);
    if (ext) {
        const byExt = all.find((p) => p.accept.includes(ext));
        if (byExt) return byExt;
    }
    const type = typeof file?.type === "string" ? file.type.toLowerCase().split(";")[0].trim() : "";
    return type ? all.find((p) => p.accept.includes(type)) : undefined;
}

/** Loaded reader modules, per plugin. */
const loaded = new WeakMap();

/**
 * The reader module of a plugin, loaded once and checked.
 * @param {ReaderPlugin} plugin
 * @returns {Promise<ReaderModule>}
 */
export async function loadReader(plugin) {
    const p = validatePlugin(plugin);
    let pending = loaded.get(plugin);
    if (!pending) {
        pending = Promise.resolve(p.load()).then((mod) => {
            const any = /** @type {any} */ (mod);
            const m = any?.default && typeof any.read !== "function" ? any.default : any;
            if (!m || typeof m.read !== "function") {
                throw new PivotkitError("INVALID_ARGUMENT", `plugin "${p.name}": its load() must give a module with read(file, options)`);
            }
            if (m.sheets !== undefined && typeof m.sheets !== "function") {
                throw new PivotkitError("INVALID_ARGUMENT", `plugin "${p.name}": sheets must be a function when given`);
            }
            return /** @type {ReaderModule} */ (m);
        });
        pending.catch(() => loaded.delete(plugin));
        loaded.set(plugin, pending);
    }
    return pending;
}

/**
 * Reads a file with the reader that accepts it (`readerFor`). The file's size is checked against
 * `limits.fileBytes` before anything is read.
 * @param {File | Blob} file
 * @param {ReadOptions & { plugins?: ReaderPlugin[], reader?: ReaderPlugin }} [options]  `reader` skips the choice by name
 * @returns {Promise<ImportTable>}
 */
export async function readFile(file, options = {}) {
    const name = fileName(file, options);
    const limits = resolveLimits(options);
    if (file && typeof file === "object" && typeof (/** @type {any} */ (file).size) === "number" && /** @type {any} */ (file).size > limits.fileBytes) {
        throw limitError("fileBytes", /** @type {any} */ (file).size, limits.fileBytes, name, "bytes");
    }
    const plugin = options.reader ?? readerFor(/** @type {any} */ (file), options.plugins);
    if (!plugin) {
        throw fileError("NO_READER", name, "no reader for this kind of file.");
    }
    const reader = await loadReader(plugin);
    const readOptionsOnly = { ...options };
    delete readOptionsOnly.plugins;
    delete readOptionsOnly.reader;
    return checkTable(await reader.read(file, readOptionsOnly), plugin.name);
}

/**
 * The table a reader returned, checked: names, types and one array per column of one length. A
 * plugin that returns something else is a programmer error (INVALID_ARGUMENT naming it).
 * @param {any} table
 * @param {string} plugin
 * @returns {ImportTable}
 */
function checkTable(table, plugin) {
    const fail = (what) => {
        throw new PivotkitError("INVALID_ARGUMENT", `plugin "${plugin}": read() must return a table of pivotkit-core/import (createTable().finish()); ${what}`);
    };
    if (!table || typeof table !== "object" || !Array.isArray(table.columns) || !Array.isArray(table.types) || !Array.isArray(table.data) || !Array.isArray(table.notes)) {
        fail("it needs columns, types, data and notes");
    }
    const n = table.data[0]?.length ?? 0;
    if (table.types.length !== table.columns.length || table.data.length !== table.columns.length) fail("columns, types and data differ in length");
    if (!table.columns.every((c) => typeof c === "string")) fail("a column name is no string");
    if (!table.types.every((t) => IMPORT_TYPES.includes(t))) fail("a type is none of string, number, date, boolean");
    if (!table.data.every((c) => Array.isArray(c) && c.length === n)) fail("the columns differ in length");
    return table;
}

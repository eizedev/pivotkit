/*
 * The built-in JSON reader. Loaded on demand by the reader plugin `jsonReader` of
 * pivotkit-core/import; follows the reader contract (`read(file, options)`).
 *
 * Shapes: an array of objects (one per row); an array of arrays (the first holds the names);
 * `{ columns, rows }` (rows as arrays or objects); the columnar `{ columns, types?, data }` of
 * `encode`; or an object with one such value under a property (`{ "data": [...] }`), which a note
 * names. Nested objects become columns named with a dot ("birth.place"); arrays stay JSON text.
 * Strings stay text unless they are ISO dates, as in `encode`: JSON says what is a number.
 */

import { ROW_STEP, bytesOf, checkFileLimit, createTable, fileError, fileName, pause, readOptions } from "./import-table.js";
import { decodeText } from "./import-text.js";

/** Levels of nested objects that become columns; deeper ones stay JSON text. */
const FLATTEN_DEPTH = 4;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** The rows of a parsed JSON document as one of the shapes, or null. */
function shapeOf(doc) {
    if (Array.isArray(doc)) {
        const first = doc.find((r) => r !== null && r !== undefined);
        if (first === undefined) return { kind: "objects", rows: [] };
        if (Array.isArray(first) && doc.every((r) => r === null || Array.isArray(r))) return { kind: "arrays", rows: doc };
        if (isObject(first) && doc.every((r) => r === null || isObject(r))) return { kind: "objects", rows: doc };
        return null;
    }
    if (!isObject(doc)) return null;
    if (Array.isArray(doc.columns) && Array.isArray(doc.data) && doc.data.every((c) => Array.isArray(c))) {
        return { kind: "columnar", columns: doc.columns, data: doc.data };
    }
    if (Array.isArray(doc.columns) && Array.isArray(doc.rows)) {
        return { kind: doc.rows.every((r) => r === null || Array.isArray(r)) ? "header" : "objects", columns: doc.columns, rows: doc.rows };
    }
    return null;
}

/** The rows of a document, looking one level into an object for the one property that holds them. */
function findRows(doc) {
    const own = shapeOf(doc);
    if (own) return { shape: own, property: null };
    if (!isObject(doc)) return null;
    let found = null;
    for (const key of Object.keys(doc)) {
        const shape = shapeOf(doc[key]);
        if (shape && (shape.kind !== "objects" || shape.rows.length > 0)) {
            const size = shape.rows?.length ?? shape.data?.[0]?.length ?? 0;
            if (!found || size > found.size) found = { shape, property: key, size };
        }
    }
    return found;
}

/**
 * Adds the dotted names of an object's values to `names` (first seen first).
 * @param {Record<string, unknown>} obj
 * @param {string} prefix
 * @param {number} depth
 * @param {Map<string, number>} names
 * @param {() => void} grow  checks the columns limit before a name is added
 * @param {{ nested: string | null }} seen  the first name made from a nested object, for the note
 */
function collectNames(obj, prefix, depth, names, grow, seen) {
    for (const key of Object.keys(obj)) {
        const name = prefix + key;
        const v = obj[key];
        if (isObject(v) && depth < FLATTEN_DEPTH && Object.keys(v).length > 0) {
            collectNames(/** @type {Record<string, unknown>} */ (v), `${name}.`, depth + 1, names, grow, seen);
        } else if (!names.has(name)) {
            if (depth > 0) seen.nested ??= name;
            grow();
            names.set(name, names.size);
        }
    }
}

function fillRow(obj, prefix, depth, names, cells) {
    for (const key of Object.keys(obj)) {
        const name = prefix + key;
        const v = obj[key];
        if (isObject(v) && depth < FLATTEN_DEPTH && Object.keys(v).length > 0) {
            fillRow(v, `${name}.`, depth + 1, names, cells);
        } else {
            const at = names.get(name);
            if (at !== undefined) cells[at] = v;
        }
    }
}

/**
 * Reads a JSON document into a table.
 * @param {Blob | ArrayBuffer | Uint8Array} file
 * @param {import("./import-table.js").ReadOptions} [options]
 * @returns {Promise<import("./import-table.js").ImportTable>}
 */
export async function read(file, options) {
    const o = readOptions(options);
    const name = fileName(file, o);
    o.signal?.throwIfAborted();
    const bytes = await bytesOf(file, o.limits, name);
    o.onProgress?.({ phase: "read", done: bytes.length, total: bytes.length });
    const { text } = decodeText(bytes, name);
    let doc;
    try {
        doc = JSON.parse(text);
    } catch (error) {
        throw fileError("INVALID_JSON", name, `this is no valid JSON (${String(/** @type {Error} */ (error).message).slice(0, 200)}).`);
    }
    o.signal?.throwIfAborted();
    const found = findRows(doc);
    if (!found) {
        throw fileError("NO_TABLE", name, "no table found: the JSON must be an array of objects, an array of arrays, { columns, rows } or { columns, data }, or an object with one of these under a property.");
    }
    const { shape, property } = found;
    const table = createTable({ file: name, limits: o.limits, locale: o.locale, hints: { textNumbers: false } });
    if (property !== null) table.note("JSON_PROPERTY", { property });

    const limits = o.limits;
    let done = 0;
    const step = async (total) => {
        if (++done % ROW_STEP === 0) {
            o.onProgress?.({ phase: "parse", done, total });
            await pause();
            o.signal?.throwIfAborted();
        }
    };

    if (shape.kind === "columnar") {
        const n = shape.data[0]?.length ?? 0;
        if (shape.columns.length !== shape.data.length) {
            throw fileError("NO_TABLE", name, `"columns" names ${shape.columns.length} columns, but "data" holds ${shape.data.length} arrays.`);
        }
        if (!shape.data.every((c) => c.length === n)) {
            throw fileError("NO_TABLE", name, "the arrays in \"data\" have different lengths.");
        }
        checkFileLimit("columns", shape.columns.length, limits.columns, name, "columns");
        checkFileLimit("rows", n, limits.rows, name, "rows");
        table.header(shape.columns);
        for (let r = 0; r < n; r++) {
            table.row(shape.data.map((c) => c[r]));
            await step(n);
        }
    } else if (shape.kind === "arrays" || shape.kind === "header") {
        const rows = shape.rows;
        checkFileLimit("rows", rows.length, limits.rows + 1, name, "rows");
        let r = 0;
        if (shape.kind === "header") {
            table.header(shape.columns);
        } else {
            table.header(rows[0] ?? []);
            r = 1;
        }
        for (; r < rows.length; r++) {
            table.row(rows[r] ?? []);
            await step(rows.length);
        }
    } else {
        const rows = shape.rows;
        checkFileLimit("rows", rows.length, limits.rows, name, "rows");
        /** @type {Map<string, number>} */
        const names = new Map();
        if (Array.isArray(shape.columns)) {
            for (const c of shape.columns) if (typeof c === "string" && !names.has(c)) names.set(c, names.size);
        }
        const grow = () => checkFileLimit("columns", names.size + 1, limits.columns, name, "columns");
        const seen = { nested: null };
        for (const row of rows) {
            if (row) collectNames(/** @type {Record<string, unknown>} */ (row), "", 0, names, grow, seen);
        }
        if (seen.nested) table.note("JSON_FLATTENED", { example: seen.nested });
        table.header([...names.keys()]);
        for (const row of rows) {
            const cells = new Array(names.size).fill(null);
            if (row) fillRow(row, "", 0, names, cells);
            table.row(cells);
            await step(rows.length);
        }
    }
    o.signal?.throwIfAborted();
    return table.finish(o.types);
}

// The reader of the example plugin: loaded on the first JSON Lines file. It parses the format into
// rows and leaves everything else to pivotkit-core's createTable: column names, cleaned values,
// types, limits and notes, the same for every format.
import { bytesOf, createTable, fileError, fileName, readOptions } from "pivotkit-core/import";

/** Lines between two progress reports, abort checks and turns of the event loop. */
const STEP = 16_384;

/**
 * Reads a JSON Lines file into a table.
 * @param {Blob | ArrayBuffer | Uint8Array} file
 * @param {import("pivotkit-core/import").ReadOptions} [options]
 * @returns {Promise<import("pivotkit-core/import").ImportTable>}
 */
export async function read(file, options) {
    // 1. the options with the host's limits merged over the defaults, the file's name for messages
    const o = readOptions(options);
    const name = fileName(file, o);
    o.signal?.throwIfAborted();
    // 2. the bytes, after the size was checked against limits.fileBytes
    const bytes = await bytesOf(file, o.limits, name);
    o.onProgress?.({ phase: "read", done: bytes.length, total: bytes.length });
    let text;
    try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
        throw fileError("WRONG_TYPE", name, "this is no UTF-8 text; JSON Lines files are UTF-8.");
    }
    // 3. the rows: the column names are the keys in the order first seen
    const objects = [];
    const names = new Map();
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === "") continue;
        let value;
        try {
            value = JSON.parse(line);
        } catch {
            throw fileError("INVALID_JSON", name, `line ${i + 1} is no JSON.`, { line: i + 1 });
        }
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
            throw fileError("NO_TABLE", name, `line ${i + 1} is no JSON object.`, { line: i + 1 });
        }
        for (const key of Object.keys(value)) if (!names.has(key)) names.set(key, names.size);
        objects.push(value);
        if (objects.length % STEP === 0) {
            o.onProgress?.({ phase: "parse", done: i, total: lines.length });
            await new Promise((resolve) => setTimeout(resolve, 0));
            o.signal?.throwIfAborted();
        }
    }
    // 4. the table: createTable counts limits.rows, limits.columns and limits.importCells as it grows
    //    and cleans each value; JSON says what is a number, so text is not read as one
    const table = createTable({ file: name, limits: o.limits, locale: o.locale, hints: { textNumbers: false } });
    table.header([...names.keys()]);
    for (const obj of objects) {
        const cells = new Array(names.size).fill(null);
        for (const key of Object.keys(obj)) cells[names.get(key)] = obj[key];
        table.row(cells);
    }
    o.signal?.throwIfAborted();
    // 5. the types: inferred, or the caller's override
    return table.finish(o.types);
}

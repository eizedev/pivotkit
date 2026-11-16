// How much memory a kept data set holds after a CSV with a large hidden column is read the way a
// worker reads it (run by test/memory.test.js with --expose-gc, one mode per process; prints one
// JSON line): "file" through fileData (a file source), "upload" through packedUpload (an HTTP
// source's CSV answer). It measures heapUsed + external after a GC, before and after the read, with
// nothing of the read kept here: what is left is what pivotkit keeps. A kept data set that still
// pointed into the text it was read from (a slice's parent, or the subject V8 keeps of the last
// regular expression run) would hold the whole file, the hidden column included.
//
// No regular expression runs here between the read and the measure, so the last one the read ran
// is the one V8 still holds.
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileData, packedUpload } from "../../src/data.js";
import { tempDir } from "../helpers.js";

const ROWS = 40_000;
const mode = process.argv[2];
/** "twin": the same file without the hidden column, whose retention is what the shown data takes. */
const twin = process.argv[3] === "twin";

/**
 * heapUsed + external after collecting what can be collected: a freed buffer's memory is given back
 * after a turn of the event loop, so a few rounds of a GC and a turn.
 */
async function used() {
    for (let i = 0; i < 5; i++) {
        global.gc?.();
        await new Promise((resolve) => setImmediate(resolve));
    }
    const m = process.memoryUsage();
    return m.heapUsed + m.external;
}

/**
 * The CSV: shown columns with headers and values long enough to be slices (a few distinct regions,
 * a name per row), and a large hidden one.
 */
function csvText() {
    const lines = [`order_identifier,sales_region_name,customer_full_name${twin ? "" : ",internal_memo_text"}`];
    for (let i = 0; i < ROWS; i++) {
        lines.push(`${i},region-${i % 50}-north-long,customer-${String(i).padStart(8, "0")}${twin ? "" : `,${String(i).padStart(10, "0")} ${"hidden ".repeat(50)}`}`);
    }
    return `${lines.join("\n")}\n`;
}

const dir = tempDir("read");
const path = join(dir, "orders.csv");
writeFileSync(path, csvText());
const levels = { default: "show", fields: { internal_memo_text: "hide" } };
const spec = { id: "orders", kind: "file", path, allow: [dir], name: "orders", schedulable: false, levels, limits: {}, hardLinks: true };

const before = await used();
/** Reads and keeps (under a key, as for a caller whose data is kept); returns only what it kept. */
async function read() {
    if (mode === "file") {
        const data = await fileData(spec);
        // the names copied, so this probe keeps nothing of the text itself
        return { columns: structuredClone(data.data.columns.map((c) => c.name)) };
    }
    // the answer's bytes as the worker gets them (a copy posted from the main thread)
    const out = await packedUpload({ ...spec, kind: "http" }, { bytes: structuredClone(new Uint8Array(readFileSync(path))), format: "csv" }, "orders-key", null);
    // the packed table goes to the main thread as a copy (structuredClone stands for postMessage):
    // its names here would still point into the text
    return { columns: structuredClone(out.table.columns.map((c) => (typeof c === "string" ? c : c.name))) };
}
const { columns } = await read();
const retained = (await used()) - before;
console.log(JSON.stringify({ mode, twin, version: process.version, fileBytes: statSync(path).size, retained, columns }));

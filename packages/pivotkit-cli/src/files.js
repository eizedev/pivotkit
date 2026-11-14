/*
 * pivotkit-cli/files: reading and writing files on behalf of a caller, the way the command line does,
 * for pivotkit's other Node front ends (pivotkit-mcp): a regular file read once with its size checked
 * first, allowed directories by real path, new files that never replace one, and a data file read
 * into an import table with pivotkit-xlsx. Node only. Not a sandbox: see safe-files.js for what the
 * checks cannot do (another process of the same user changing the directories while they run).
 */

import { readFile } from "pivotkit-core/import";
import xlsxReader from "pivotkit-xlsx";
import { printable, shortName } from "./errors.js";

export { allowedDirs, cleanFileName, isInside, readSafe, readStdin, writeNew, writeSafe } from "./safe-files.js";
export { CliError, asCliError, printable, shortName } from "./errors.js";

/** The data formats the front ends read, by extension. */
export const DATA_FORMATS = Object.freeze(["csv", "tsv", "txt", "json", "xlsx"]);

/**
 * Reader notes that only say how a file was read (its encoding, separator, sheet): "info". The others
 * say the data differs from the file (a column renamed or dropped, text cut, values not converted):
 * warnings.
 */
export const INFO_NOTES = Object.freeze(new Set(["ENCODING", "SEPARATOR", "SHEET", "USED_RANGE", "JSON_FLATTENED", "LINES_SKIPPED", "ROWS_EMPTY"]));

/**
 * The bytes of a data file as an import table (pivotkit-core/import with pivotkit-xlsx), with the
 * reader's notes as findings named by the file's base name.
 * @param {Uint8Array} bytes
 * @param {string} name  the file's name; its extension (or `format`) says how to read it
 * @param {{ format?: string, sheet?: string, timeZone?: string, limits?: Partial<import("pivotkit-core").Limits> }} [options]
 * @returns {Promise<{ table: any, notes: Array<{ severity: "info" | "warning", code: string, path: string, message: string }> }>}
 */
export async function readTable(bytes, name, { format, sheet, timeZone, limits } = {}) {
    const fileName = format && !name.toLowerCase().endsWith(`.${format}`) ? `${name}.${format}` : name;
    const table = await readFile(new File([/** @type {BlobPart} */ (bytes)], fileName), { plugins: [xlsxReader], ...(limits ? { limits } : {}), ...(sheet ? { sheet } : {}), ...(timeZone ? { timeZone } : {}) });
    return { table, notes: table.notes.map((n) => ({ severity: INFO_NOTES.has(n.code) ? "info" : "warning", code: n.code, path: "", message: printable(`${shortName(name)}: ${n.message}`) })) };
}

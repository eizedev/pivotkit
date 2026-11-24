/*
 * The data of --data: read as an import table with the reader's notes as findings, a workbook's sheet
 * chosen (--sheet, else the one the view names, else the first visible one), and the types a view
 * file lists for its columns applied where every value fits.
 */

import { basename, extname } from "node:path";
import { PivotkitError } from "pivotkit-core";
import { IMPORT_TYPES, readFile, retype } from "pivotkit-core/import";
import xlsxReader from "pivotkit-xlsx";
import { CliError, DATA_FORMATS, INFO_NOTES, asCliError, printable, shortName } from "pivotkit-node/files";

/** The extensions of a data file besides JSON (JSON may be a view as well). */
export const DATA_EXTENSIONS = Object.freeze(DATA_FORMATS.filter((f) => f !== "json"));

/**
 * @typedef {object} Data  the data of a command
 * @property {any} table  the import table
 * @property {string} name  the file's name ("stdin" for stdin)
 * @property {string | null} sheet  the workbook's sheet read, as printed
 * @property {(() => Promise<Array<{ name: string, index: number, visible: boolean }>>) | null} sheets  a workbook's sheets, read when asked
 * @property {any[]} notes  the reader's notes and the sheet's, as findings
 */

/** " (read, hidden)": the words given, or "" for none. @param {...string} words */
const tags = (...words) => (words.some(Boolean) ? ` (${words.filter(Boolean).join(", ")})` : "");

/** A sheet name in a message, quoted as JSON text (a quote in it escaped). */
const quoted = (name) => JSON.stringify(printable(name));

/**
 * A sheet in a message: "Q1", "Hidden" (hidden), "Q2" (read).
 * @param {{ name: string, visible: boolean }} sheet
 * @param {boolean} [read]  the sheet the data was read from
 */
export const sheetLabel = (sheet, read = false) => `${quoted(sheet.name)}${tags(read ? "read" : "", sheet.visible ? "" : "hidden")}`;

/**
 * The sheets of a workbook for a message: "Q1", "Q2", "Hidden" (hidden). Empty when they cannot be read.
 * @param {File} file
 * @param {object} limits
 */
async function sheetList(file, limits) {
    try {
        const reader = await xlsxReader.load();
        const list = await reader.sheets(file, { name: file.name, limits });
        return list.map((s) => sheetLabel(s)).join(", ");
    } catch {
        return "";
    }
}

/**
 * The sheets of a workbook for --json: [{ name, index, visible }].
 * @param {File} file
 * @param {object} limits
 */
async function sheetInfo(file, limits) {
    const reader = await xlsxReader.load();
    return (await reader.sheets(file, { name: file.name, limits })).map((s) => ({ name: printable(s.name), index: s.index, visible: s.visible }));
}

/**
 * The data of --data as an import table, with the reader's notes as warnings. A workbook's sheet:
 * --sheet, else the one the view names (`viewSheet`), else the first visible one; a sheet the
 * workbook does not have is an error that lists the sheets there are.
 * @param {Record<string, any>} values
 * @param {any} ctx
 * @param {string | null} [viewSheet]  source.params.sheet of the view
 * @returns {Promise<Data | null>}
 */
export async function readData(values, ctx, viewSheet = null) {
    const path = values.data;
    if (path === undefined) {
        return null;
    }
    const format = dataFormat(path, values["data-format"]);
    const bytes = await ctx.readInput(path, "the data", ctx.fileLimits.fileBytes, "fileBytes");
    const file = new File([/** @type {BlobPart} */ (bytes)], fileName(path, format));
    const workbook = format === "xlsx";
    const pick = sheetPick(values.sheet, workbook, viewSheet);
    const notes = sheetNotes(path, workbook, viewSheet, pick);
    try {
        const table = await readFile(file, { plugins: [xlsxReader], limits: ctx.limits, ...(pick.sheet ? { sheet: pick.sheet } : {}), ...(ctx.timeZone ? { timeZone: ctx.timeZone } : {}) });
        return dataOf(table, { file, path, workbook, notes, limits: ctx.limits });
    } catch (e) {
        throw await readError(e, { file, path, pick, limits: ctx.limits });
    }
}

/**
 * The format of --data: --data-format, else the file's extension; stdin needs --data-format.
 * @param {string} path
 * @param {string | undefined} given  --data-format
 */
function dataFormat(path, given) {
    const format = given ?? (path === "-" ? null : extname(path).slice(1).toLowerCase());
    if (!format || !DATA_FORMATS.includes(format)) {
        throw new CliError("usage", "DATA_FORMAT", path === "-" ? "--data - needs --data-format csv, json or xlsx" : `${shortName(path)}: unknown kind of data file; give --data-format csv, json or xlsx`);
    }
    return format;
}

/**
 * The name the reader gets: the file's, with the format's extension when it has another one.
 * @param {string} path
 * @param {string} format
 */
const fileName = (path, format) => (path === "-" ? `stdin.${format}` : basename(path).endsWith(`.${format}`) ? basename(path) : `${basename(path)}.${format}`);

/**
 * The sheet to read: --sheet (an empty one, an unset variable in a pipeline: --sheet "$SHEET", counts
 * as not given), else for a workbook the one the view names.
 * @param {unknown} sheetOption  --sheet
 * @param {boolean} workbook
 * @param {string | null} viewSheet
 */
function sheetPick(sheetOption, workbook, viewSheet) {
    const given = sheetOption ? String(sheetOption) : null;
    const fromView = workbook && !given && viewSheet ? viewSheet : null;
    return { given, fromView, sheet: workbook ? (given ?? fromView) : given };
}

/**
 * What the sheet choice says: the view's sheet read or not used, --sheet on a file that has no sheets.
 * @param {string} path
 * @param {boolean} workbook
 * @param {string | null} viewSheet
 * @param {{ given: string | null, fromView: string | null }} pick
 */
function sheetNotes(path, workbook, viewSheet, { given, fromView }) {
    /** @type {any[]} */
    const notes = [];
    if (fromView) {
        notes.push({ severity: "info", code: "viewSheet", path: "source.params.sheet", message: printable(`${shortName(path)}: sheet ${quoted(fromView)}, the one the view names`) });
    } else if (viewSheet && !workbook) {
        notes.push({ severity: "info", code: "viewSheet", path: "source.params.sheet", message: printable(`the view names the sheet ${quoted(viewSheet)}; ${shortName(path)} is no workbook, so it is not used`) });
    }
    if (given && !workbook) {
        notes.push({ severity: "warning", code: "ignoredOption", path: "", message: printable(`--sheet does nothing: ${shortName(path)} is no workbook (only an XLSX file has sheets)`) });
    }
    return notes;
}

/**
 * The data of a table read: its name, the sheet read, the workbook's sheets on demand and the notes.
 * @param {any} table
 * @param {{ file: File, path: string, workbook: boolean, notes: any[], limits: object }} read
 * @returns {Data}
 */
function dataOf(table, { file, path, workbook, notes, limits }) {
    const sheet = table.notes.find((n) => n.code === "SHEET")?.params?.sheet;
    return {
        table,
        name: path === "-" ? "stdin" : basename(path),
        // as printed, so it matches the names of `sheets`
        sheet: typeof sheet === "string" ? printable(sheet) : null,
        // the workbook's sheets, read again only for describe (render and validate do not need them)
        sheets: workbook ? () => sheetInfo(file, limits) : null,
        notes: [...notes, ...table.notes.map((n) => ({ severity: INFO_NOTES.has(n.code) ? "info" : "warning", code: n.code, path: "", message: printable(`${shortName(path)}: ${n.message}`) }))]
    };
}

/**
 * The error of a failed read: a sheet the workbook does not have lists the sheets there are.
 * @param {unknown} e
 * @param {{ file: File, path: string, pick: { sheet: string | null, fromView: string | null }, limits: object }} read
 */
async function readError(e, { file, path, pick, limits }) {
    if (e instanceof PivotkitError && e.details?.reason === "NO_SHEET" && pick.sheet) {
        const list = await sheetList(file, limits);
        const why = pick.fromView ? " (the view's source.params.sheet; give --sheet to read another)" : "";
        return new CliError("io", "NO_SHEET", `${shortName(path)}: the workbook has no sheet ${quoted(pick.sheet)}${why}${list ? `; its sheets: ${list}` : ""}`);
    }
    return asCliError(e, path);
}

/**
 * The data with the types its view file lists for its columns: a CSV cannot say that "2025" is text
 * or that a column of "true" is no boolean, a view file written with the data can. Only a column the
 * reader read as another type is read again (pivotkit-core/import's retype), each an info finding so
 * --json says why; a type that a value of the column does not fit is not applied (a view file made
 * for other data must not blank a column): the column stays as read, with a warning.
 * @param {Data | null} data
 * @param {Array<{ name: string, type: string }>} fields
 * @returns {Data | null}
 */
export function withViewTypes(data, fields) {
    if (!data || !fields.length) {
        return data;
    }
    const byName = new Map(data.table.columns.map((name, c) => [String(name).toLowerCase(), c]));
    let table = data.table;
    const findings = [];
    for (const f of fields) {
        const c = byName.get(String(f.name).toLowerCase());
        if (c === undefined || !IMPORT_TYPES.includes(/** @type {any} */ (f.type)) || table.types[c] === f.type) {
            continue;
        }
        const name = table.columns[c];
        const next = retype(table, { [name]: /** @type {any} */ (f.type) });
        const raw = table.raw[c];
        const lost = raw.findIndex((v, i) => v !== null && String(v).trim() !== "" && (next.data[c][i] === null || next.data[c][i] === undefined));
        if (lost >= 0) {
            findings.push({ severity: "warning", code: "typeFromViewFailed", path: "", message: printable(`${data.name}: "${name}" is ${f.type} in the view file, but its value ${JSON.stringify(String(raw[lost]))} (row ${lost + 1}) is none; read as ${table.types[c]}`) });
            continue;
        }
        table = next;
        findings.push({ severity: "info", code: "typeFromView", path: "", message: printable(`${data.name}: "${name}" read as ${f.type}, the type the view file lists for it`) });
    }
    return findings.length ? { ...data, table, notes: [...data.notes, ...findings] } : data;
}

/*
 * The part every reader of pivotkit-core/import shares (the built-in CSV and JSON readers and reader
 * plugins such as pivotkit-xlsx): a table built row by row, with the header found, column names made
 * usable, values cleaned, limits counted while it grows, column types inferred and what was changed
 * said in notes. A reader parses its format into rows of cells; this module does the rest, so every
 * format gives the same table for the same content.
 *
 * Values of a typed table are what `encode` reads as wall clock: numbers, booleans, text, and dates as
 * ISO text ("2026-11-10", "2026-11-10T08:30:00"; an ISO text with an offset stays as it was written,
 * an instant). `raw` keeps the cleaned values as read, so `retype` can type a column again without
 * reading the file again.
 */

import { PivotkitError } from "./errors.js";
import { resolveLimits } from "./limits.js";
import { parseIso } from "./time.js";

/** The column types a loaded table can have (`encode`'s, without "null"). */
export const IMPORT_TYPES = Object.freeze(["string", "number", "date", "boolean"]);

/**
 * The notes a reader gives, by code: what was read how, and what was changed. `params` holds the
 * names and numbers a text needs; `message` is the English text (`noteMessage`). A UI shows its own
 * text per code.
 */
export const IMPORT_NOTE_CODES = Object.freeze([
    "ENCODING",
    "SEPARATOR",
    "LINES_SKIPPED",
    "COLUMN_RENAMED",
    "COLUMNS_RENAMED_MORE",
    "COLUMN_DROPPED",
    "COLUMNS_ADDED",
    "ROWS_EMPTY",
    "TEXT_CUT",
    "CHARACTERS_REMOVED",
    "DATE_ORDER",
    "VALUES_NOT_CONVERTED",
    "JSON_PROPERTY",
    "JSON_FLATTENED",
    "SHEET",
    "USED_RANGE",
    "ERROR_CELLS"
]);

/**
 * @typedef {"string" | "number" | "date" | "boolean"} ImportType
 *
 * @typedef {object} ImportNote
 * @property {string} code  one of IMPORT_NOTE_CODES
 * @property {Record<string, string | number>} params
 * @property {string} message  English text
 *
 * @typedef {object} ImportHints  how text values were read; `retype` reads them the same way
 * @property {"." | ","} decimal  the decimal mark tried first for numbers in text
 * @property {"dmy" | "mdy"} dateOrder  day/month order of dates written with slashes when the values do not tell
 * @property {boolean} [serialDates]  numbers are Excel serial dates when a column is made a date (spreadsheets)
 * @property {boolean} [textNumbers]  false: text is never inferred as a number or a day/month date, only ISO dates (JSON, whose own types say what is a number)
 *
 * @typedef {object} ImportTable  what a reader returns; `{ columns, types, data }` is `encode`'s columnar input
 * @property {string[]} columns  column names, unique (case-insensitively), cleaned
 * @property {ImportType[]} types  the type of each column
 * @property {unknown[][]} data  one array per column, values of its type; null for blank
 * @property {unknown[][]} raw  one array per column, the cleaned values as read (a text column shares its array with data)
 * @property {ImportType[]} detected  the type inferred for each column, before an override
 * @property {number} rowCount
 * @property {ImportNote[]} notes
 * @property {ImportHints} hints
 *
 * @typedef {object} ImportProgress
 * @property {"read" | "unpack" | "parse" | "type"} phase
 * @property {number} done
 * @property {number} total  in the phase's unit (bytes, characters, rows or columns)
 *
 * @typedef {object} ReadOptions  the options a reader's `read` takes
 * @property {string} [name]  the file name for messages, when the file has none
 * @property {string | number} [sheet]  a spreadsheet's sheet by name or index (0-based); the first visible one by default
 * @property {Partial<import("./limits.js").Limits>} [limits]
 * @property {AbortSignal} [signal]
 * @property {(progress: ImportProgress) => void} [onProgress]
 * @property {Array<ImportType | null | undefined> | Record<string, ImportType>} [types]  type override by position or by column name
 * @property {string} [locale]  decides the order of ambiguous dates written with slashes (en-US: month first)
 */

const MAX_RENAMED_NOTES = 20;
/** Rows the header is looked for in: a title block above the header is rarely longer. */
const HEADER_SAMPLE = 50;
/** Rows between two progress reports and abort checks. */
export const ROW_STEP = 16_384;

// C0 controls except tab, line feed and carriage return (made spaces), DEL, C1 controls, and the
// characters that change the direction of text (U+061C, U+200E, U+200F, U+202A-U+202E, U+2066-U+2069):
// a name like "invoice" + U+202E + "txt.exe" shows reversed.
// eslint-disable-next-line no-control-regex
const REMOVED = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const REMOVED_ANY = new RegExp(REMOVED.source);
const BREAKS = /[\t\r\n\u2028\u2029]+/g;

/**
 * A PivotkitError for a file that cannot be read, naming it.
 * @param {string} reason  machine code: WRONG_TYPE, BINARY, UNCLOSED_QUOTE, INVALID_JSON, NO_TABLE, ...
 * @param {string} file
 * @param {string} message  English text; the file name is put in front
 * @param {Record<string, unknown>} [params]
 */
export function fileError(reason, file, message, params = {}) {
    return new PivotkitError("INVALID_FILE", `"${file}": ${message}`, { reason, file, ...params });
}

/**
 * A LIMIT_EXCEEDED error that names the file, the limit and what to change.
 * @param {string} limit
 * @param {number} value
 * @param {number} max
 * @param {string} file
 * @param {string} what  "rows", "columns", ...
 */
export function limitError(limit, value, max, file, what) {
    const n = (x) => x.toLocaleString("en-US");
    return new PivotkitError(
        "LIMIT_EXCEEDED",
        `"${file}" has more than ${n(max)} ${what} (limits.${limit}): load a smaller extract of it, or a host can raise limits.${limit}`,
        { limit, value, max, file }
    );
}

/**
 * Throws LIMIT_EXCEEDED for the file when `value` is above `max`.
 */
export function checkFileLimit(limit, value, max, file, what) {
    if (value > max) {
        throw limitError(limit, value, max, file, what);
    }
}

/** The file's name for messages. */
export function fileName(file, options) {
    const own = file && typeof file === "object" && typeof (/** @type {any} */ (file).name) === "string" ? /** @type {any} */ (file).name : "";
    return cleanText(String(options?.name ?? own ?? "")).slice(0, 256) || "file";
}

/**
 * The bytes of a file after its size was checked against `limits.fileBytes`: a Blob (a File), an
 * ArrayBuffer or a Uint8Array.
 * @param {Blob | ArrayBuffer | Uint8Array} file
 * @param {import("./limits.js").Limits} limits
 * @param {string} name
 * @returns {Promise<Uint8Array>}
 */
export async function bytesOf(file, limits, name) {
    if (file instanceof Uint8Array) {
        checkFileLimit("fileBytes", file.byteLength, limits.fileBytes, name, "bytes");
        return file;
    }
    if (file instanceof ArrayBuffer) {
        checkFileLimit("fileBytes", file.byteLength, limits.fileBytes, name, "bytes");
        return new Uint8Array(file);
    }
    if (typeof Blob !== "undefined" && file instanceof Blob) {
        checkFileLimit("fileBytes", file.size, limits.fileBytes, name, "bytes");
        return new Uint8Array(await file.arrayBuffer());
    }
    throw new PivotkitError("INVALID_ARGUMENT", "read(file): file must be a File, a Blob, an ArrayBuffer or a Uint8Array");
}

/** The options of a reader with their limits resolved. */
export function readOptions(options) {
    const o = options ?? {};
    if (typeof o !== "object") {
        throw new PivotkitError("INVALID_OPTION", "read(file, options): options must be an object");
    }
    return { ...o, limits: resolveLimits(o) };
}

/** Lets the event loop run (a UI paints, an abort arrives) during a long read. */
export const pause = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * The English text of a note.
 * @param {string} code
 * @param {Record<string, string | number>} p
 */
export function noteMessage(code, p) {
    const n = (x) => (typeof x === "number" ? x.toLocaleString("en-US") : x);
    switch (code) {
        case "ENCODING":
            return `Read as ${p.encoding}.`;
        case "SEPARATOR":
            return `Values separated by ${p.name}.`;
        case "LINES_SKIPPED":
            return `${n(p.count)} line(s) above the column names were skipped (a title block).`;
        case "COLUMN_RENAMED":
            return p.from === "" ? `Column ${n(p.position)} has no name; it is named "${p.to}".` : `Column "${p.from}" is named "${p.to}".`;
        case "COLUMNS_RENAMED_MORE":
            return `${n(p.count)} more columns were renamed.`;
        case "COLUMN_DROPPED":
            return `Column ${n(p.position)} has no name and no values and was left out.`;
        case "COLUMNS_ADDED":
            return `${n(p.rows)} row(s) have more values than there are column names; the extra values are in ${n(p.count)} column(s) named "Column …".`;
        case "ROWS_EMPTY":
            return `${n(p.count)} empty row(s) were left out.`;
        case "TEXT_CUT":
            return `${n(p.count)} value(s) longer than ${n(p.max)} characters were cut.`;
        case "CHARACTERS_REMOVED":
            return `Control or text direction characters were removed from ${n(p.count)} value(s).`;
        case "DATE_ORDER":
            return `Dates in "${p.column}" were read as ${p.order === "mdy" ? "month/day/year" : "day/month/year"}; the values fit both.`;
        case "VALUES_NOT_CONVERTED":
            return `${n(p.count)} value(s) in "${p.column}" are no ${p.type} and are empty.`;
        case "JSON_PROPERTY":
            return `The rows were read from "${p.property}".`;
        case "JSON_FLATTENED":
            return `Nested values became columns named with a dot ("${p.example}").`;
        case "SHEET":
            return Number(p.count) > 1 ? `Read sheet "${p.sheet}" of ${n(p.count)} sheets.` : `Read sheet "${p.sheet}".`;
        case "USED_RANGE":
            return `The sheet's used range reaches row ${n(p.usedRow)}; values end at row ${n(p.lastRow)}, the empty rows below were skipped.`;
        case "ERROR_CELLS":
            return `${n(p.count)} cell(s) hold an Excel error (such as #N/A) and are empty.`;
        default:
            return code;
    }
}

/** A note with its English text. */
export function note(code, params = {}) {
    return { code, params, message: noteMessage(code, params) };
}

/**
 * Text without control and direction characters, line breaks and tabs as one space, trimmed.
 * @param {string} text
 */
export function cleanText(text) {
    return text.replace(REMOVED, "").replace(BREAKS, " ").trim();
}

// ---------------------------------------------------------------------------------------------------
// Reading values from text

const EN_NUMBER = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const DE_NUMBER = /^[+-]?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/;
// a leading zero before another digit: a postcode or an identifier ("01067", "007"), kept as text
const LEADING_ZERO = /^[+-]?0\d/;
// more significant digits than a double holds exactly: an identifier, kept as text
const MAX_DIGITS = 15;
const DOTTED_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const SLASH_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const TRUE_TEXT = new Set(["true", "wahr"]);
const FALSE_TEXT = new Set(["false", "falsch"]);

const pad2 = (x) => String(x).padStart(2, "0");

/** ISO text of a wall-clock date and time; null when the day or time does not exist. */
function isoOf(y, mo, d, h, mi, s) {
    if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) {
        return null;
    }
    const t = new Date(Date.UTC(2000, mo - 1, d));
    t.setUTCFullYear(y);
    if (t.getUTCDate() !== d) {
        return null;
    }
    const day = `${String(y).padStart(4, "0")}-${pad2(mo)}-${pad2(d)}`;
    return h === 0 && mi === 0 && s === 0 ? day : `${day}T${pad2(h)}:${pad2(mi)}:${pad2(s)}`;
}

function dateParts(m) {
    return [+m[1], +m[2], +m[3], m[4] === undefined ? 0 : +m[4], m[5] === undefined ? 0 : +m[5], m[6] === undefined ? 0 : +m[6]];
}

/**
 * A date written as text as ISO text; null when it is no date.
 * @param {string} t  trimmed
 * @param {"dmy" | "mdy"} order  for dates with slashes
 */
export function textToDate(t, order) {
    if (t.length > 40) {
        return null;
    }
    if (parseIso(t) !== null) {
        return t;
    }
    let m = DOTTED_DATE.exec(t);
    if (m) {
        const [d, mo, y, h, mi, s] = dateParts(m);
        return isoOf(y, mo, d, h, mi, s);
    }
    m = SLASH_DATE.exec(t);
    if (m) {
        const [a, b, y, h, mi, s] = dateParts(m);
        return order === "mdy" ? isoOf(y, a, b, h, mi, s) : isoOf(y, b, a, h, mi, s);
    }
    return null;
}

function digitCount(t) {
    let n = 0;
    for (let i = 0; i < t.length; i++) {
        const c = t.charCodeAt(i);
        if (c >= 48 && c <= 57) {
            n++;
        }
    }
    return n;
}

/**
 * A number written as text in a notation; null when it is none. English: "1234.5", no group
 * separators ("1,5" is never 15); German: "1.234,5" or "1234,5".
 * @param {string} t  trimmed
 * @param {"." | ","} decimal
 */
export function textToNumber(t, decimal) {
    if (t.length > 40 || !(decimal === "," ? DE_NUMBER : EN_NUMBER).test(t)) {
        return null;
    }
    const n = Number(decimal === "," ? t.replaceAll(".", "").replace(",", ".") : t);
    return Number.isFinite(n) ? n : null;
}

/** Whether a number written as text must stay text: a leading zero or more digits than a double holds. */
function keepsText(t) {
    if (LEADING_ZERO.test(t)) {
        return true;
    }
    // a whole number of more digits than a double holds exactly is an identifier (a long fraction is not)
    return /^[+-]?\d+$/.test(t) && digitCount(t) > MAX_DIGITS;
}

function textToBoolean(t) {
    const s = t.toLowerCase();
    if (TRUE_TEXT.has(s)) return true;
    if (FALSE_TEXT.has(s)) return false;
    return null;
}

// ---------------------------------------------------------------------------------------------------
// Converting values to a type (shared by inference, an override and retype)

const MS_PER_DAY = 86_400_000;
// Excel's day 0 in the 1900 system (serials from 61 on; Excel counts a 29 February 1900 that never was)
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** ISO wall-clock text of a Date whose UTC fields are the wall clock (as a spreadsheet's dates are read). */
export function dateToIso(d) {
    let ms = d.getTime();
    if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) {
        return null;
    }
    // a spreadsheet's serial date is a fraction of a day: 08:49:40 can come back as 08:49:39.999
    const second = Math.round(ms / 1000) * 1000;
    if (Math.abs(ms - second) <= 2) ms = second;
    const iso = new Date(ms).toISOString(); // "2026-11-10T08:30:00.000Z"
    if (ms % MS_PER_DAY === 0) {
        return iso.slice(0, 10);
    }
    return ms % 1000 === 0 ? iso.slice(0, 19) : iso.slice(0, 23);
}

/**
 * Converters per type: a cleaned value as read -> a value of the type, or undefined when it does not
 * convert (null stays null).
 */
const TO = {
    string(v) {
        if (typeof v === "string") return v;
        if (v instanceof Date) return dateToIso(v) ?? undefined;
        return String(v);
    },
    number(v, hints) {
        if (typeof v === "number") return v;
        if (typeof v === "boolean") return v ? 1 : 0;
        if (typeof v === "string") {
            const first = textToNumber(v, hints.decimal);
            return first ?? textToNumber(v, hints.decimal === "," ? "." : ",") ?? undefined;
        }
        return undefined;
    },
    date(v, hints) {
        if (v instanceof Date) return dateToIso(v) ?? undefined;
        if (typeof v === "string") return textToDate(v, hints.dateOrder) ?? undefined;
        if (typeof v === "number" && hints.serialDates && v > 0 && v < 2_958_466) {
            return dateToIso(new Date(Math.round((EXCEL_EPOCH + v * MS_PER_DAY) / 1000) * 1000)) ?? undefined;
        }
        return undefined;
    },
    boolean(v) {
        if (typeof v === "boolean") return v;
        if (typeof v === "number") return v === 1 ? true : v === 0 ? false : undefined;
        if (typeof v === "string") {
            const b = textToBoolean(v);
            if (b !== null) return b;
            const s = v.toLowerCase();
            if (s === "yes" || s === "1") return true;
            if (s === "no" || s === "0") return false;
        }
        return undefined;
    }
};

/**
 * Converts one column's values as read to a type.
 * @param {unknown[]} raw
 * @param {ImportType} type
 * @param {ImportHints} hints
 * @returns {{ values: unknown[], failed: number }}
 */
export function convertColumn(raw, type, hints) {
    if (type === "string" && raw.every((v) => v === null || typeof v === "string")) {
        return { values: raw, failed: 0 };
    }
    const to = TO[type];
    const values = new Array(raw.length);
    let failed = 0;
    for (let i = 0; i < raw.length; i++) {
        const v = raw[i];
        if (v === null) {
            values[i] = null;
            continue;
        }
        const out = to(v, hints);
        if (out === undefined) {
            values[i] = null;
            failed++;
        } else {
            values[i] = out;
        }
    }
    return { values, failed };
}

/**
 * The type of a column from its values as read, and how its text was read: dates before numbers
 * ("10.11.2026" is a date, not 10112026), a leading zero or a long number keeps text, and the number
 * notation the column's text fits (the hint's decimal mark first when it fits both).
 * @param {unknown[]} raw
 * @param {ImportHints} hints
 * @returns {{ type: ImportType, dateOrder?: "dmy" | "mdy", ambiguousOrder?: boolean, decimal?: "." | "," }}
 */
export function inferColumn(raw, hints) {
    let numbers = 0;
    let booleans = 0;
    let dates = 0;
    let texts = 0;
    for (const v of raw) {
        if (v === null) continue;
        if (typeof v === "number") numbers++;
        else if (typeof v === "boolean") booleans++;
        else if (v instanceof Date) dates++;
        else texts++;
    }
    const filled = numbers + booleans + dates + texts;
    if (filled === 0) {
        return { type: "string" };
    }
    if (texts === 0) {
        // values with types of their own (a spreadsheet, JSON): one kind is that type, a mix is text
        if (numbers === filled) return { type: "number" };
        if (booleans === filled) return { type: "boolean" };
        if (dates === filled) return { type: "date" };
        return { type: "string" };
    }
    if (texts !== filled) {
        // text next to typed values: dates and ISO text are dates, anything else is text
        if (numbers === 0 && booleans === 0 && raw.every((v) => v === null || v instanceof Date || (typeof v === "string" && parseIso(v) !== null))) {
            return { type: "date" };
        }
        return { type: "string" };
    }
    if (hints.textNumbers === false) {
        return { type: raw.every((v) => v === null || parseIso(/** @type {string} */ (v)) !== null) ? "date" : "string" };
    }
    return inferText(/** @type {Array<string | null>} */ (raw), hints);
}

/**
 * The type of a column of text.
 * @param {Array<string | null>} raw
 * @param {ImportHints} hints
 * @returns {{ type: ImportType, dateOrder?: "dmy" | "mdy", ambiguousOrder?: boolean, decimal?: "." | "," }}
 */
function inferText(raw, hints) {
    let bool = true;
    let iso = true;
    let dotted = true;
    let slash = true;
    let dayFirst = false;
    let monthFirst = false;
    let en = true;
    let de = true;
    for (const t of raw) {
        if (t === null) continue;
        if (bool && textToBoolean(t) === null) bool = false;
        if (iso && parseIso(t) === null) iso = false;
        if (dotted && (!DOTTED_DATE.test(t) || textToDate(t, "dmy") === null)) dotted = false;
        if (slash) {
            const m = t.length <= 40 ? SLASH_DATE.exec(t) : null;
            if (!m) {
                slash = false;
            } else {
                if (+m[1] > 12) dayFirst = true;
                if (+m[2] > 12) monthFirst = true;
            }
        }
        if (en || de) {
            if (keepsText(t)) {
                en = false;
                de = false;
            } else {
                if (en && textToNumber(t, ".") === null) en = false;
                if (de && textToNumber(t, ",") === null) de = false;
            }
        }
        if (!bool && !iso && !dotted && !slash && !en && !de) {
            return { type: "string" };
        }
    }
    if (bool) return { type: "boolean" };
    if (iso || dotted) return { type: "date" };
    if (slash && !(dayFirst && monthFirst)) {
        /** @type {"dmy" | "mdy"} */
        const order = dayFirst ? "dmy" : monthFirst ? "mdy" : hints.dateOrder;
        const all = raw.every((t) => t === null || textToDate(t, order) !== null);
        if (all) {
            return { type: "date", dateOrder: order, ambiguousOrder: !dayFirst && !monthFirst };
        }
    }
    if (en && de) return { type: "number", decimal: hints.decimal };
    if (en) return { type: "number", decimal: "." };
    if (de) return { type: "number", decimal: "," };
    return { type: "string" };
}

// ---------------------------------------------------------------------------------------------------
// The table builder

/**
 * A cleaned value as read: text without control and direction characters, line breaks as spaces,
 * trimmed and cut to `max`; a non-finite number, an invalid date and empty text are null; a nested
 * value is its JSON text.
 */
function cleanValue(v, max, counts) {
    if (v === null || v === undefined) return null;
    switch (typeof v) {
        case "string":
            return cleanString(v, max, counts);
        case "number":
            return Number.isFinite(v) ? v : null;
        case "boolean":
            return v;
        case "bigint":
            return Number.isSafeInteger(Number(v)) ? Number(v) : String(v);
        case "object":
            if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
            try {
                return cleanString(JSON.stringify(v) ?? "", max, counts);
            } catch {
                return null;
            }
        default:
            return null;
    }
}

function cleanString(s, max, counts) {
    let t = s;
    if (REMOVED_ANY.test(t)) {
        t = t.replace(REMOVED, "");
        counts.removed++;
    }
    t = t.replace(BREAKS, " ").trim();
    if (t.length > max) {
        t = t.slice(0, max);
        counts.cut++;
    }
    return t === "" ? null : t;
}

/**
 * Builds a table row by row. A reader calls `header()` when its format names the columns (JSON),
 * else the header is found in the first rows: the first row with at least half as many values as the
 * fullest of the first 50 rows; the rows above it are a title block and are skipped.
 *
 * @param {object} options
 * @param {string} options.file  the file name for messages
 * @param {import("./limits.js").Limits} options.limits
 * @param {Partial<ImportHints>} [options.hints]
 * @param {string} [options.locale]
 */
export function createTable(options) {
    const { file, limits } = options;
    /** @type {ImportHints} */
    const hints = {
        decimal: options.hints?.decimal ?? ".",
        dateOrder: options.hints?.dateOrder ?? (!options.locale || /^en-US$/i.test(options.locale) ? "mdy" : "dmy"),
        ...(options.hints?.serialDates ? { serialDates: true } : {}),
        ...(options.hints?.textNumbers === false ? { textNumbers: false } : {})
    };
    /** @type {ImportNote[]} */
    const notes = [];
    const counts = { removed: 0, cut: 0, empty: 0, extraRows: 0 };
    /** @type {unknown[][]} */
    const columns = [];
    /** @type {unknown[] | null} */
    let header = null;
    let headerWidth = 0;
    let rowCount = 0;
    /** @type {unknown[][] | null} */
    let sample = [];

    const addColumn = () => {
        checkFileLimit("columns", columns.length + 1, limits.columns, file, "columns");
        columns.push(new Array(rowCount).fill(null));
    };

    const push = (cells) => {
        let filled = 0;
        const row = new Array(cells.length);
        for (let i = 0; i < cells.length; i++) {
            const v = cleanValue(cells[i], limits.textLength, counts);
            row[i] = v;
            if (v !== null) filled = i + 1;
        }
        if (filled === 0) {
            counts.empty++;
            return;
        }
        if (filled > headerWidth) {
            counts.extraRows++;
        }
        while (columns.length < filled) addColumn();
        rowCount++;
        checkFileLimit("rows", rowCount, limits.rows, file, "rows");
        checkFileLimit("importCells", rowCount * columns.length, limits.importCells, file, "values (rows x columns)");
        for (let c = 0; c < columns.length; c++) {
            columns[c].push(c < filled ? row[c] : null);
        }
    };

    const setHeader = (cells) => {
        header = cells.map((v) => {
            const c = cleanValue(v, limits.name, { removed: 0, cut: 0 });
            return c === null ? null : c instanceof Date ? dateToIso(c) : String(c);
        });
        headerWidth = header.length;
        checkFileLimit("columns", headerWidth, limits.columns, file, "columns");
        for (let c = 0; c < headerWidth; c++) columns.push([]);
    };

    const flushSample = () => {
        const rows = sample ?? [];
        sample = null;
        if (header === null) {
            let max = 0;
            /** @type {number[]} */
            const width = rows.map((r) => {
                let filled = 0;
                for (const v of r) if (cleanValue(v, limits.textLength, { removed: 0, cut: 0 }) !== null) filled++;
                return filled;
            });
            for (const w of width) max = Math.max(max, w);
            let at = width.findIndex((w) => w > 0 && w * 2 >= max);
            if (at < 0) at = rows.length;
            const skipped = width.slice(0, at).filter((w) => w > 0).length;
            if (skipped > 0) notes.push(note("LINES_SKIPPED", { count: at }));
            setHeader(at < rows.length ? rows[at] : []);
            rows.splice(0, at + 1);
        }
        for (const r of rows) push(r);
    };

    return {
        /** The column names, when the format has them apart from the rows. */
        header(cells) {
            setHeader(cells);
        },
        /** One row of cells, in column order. */
        row(cells) {
            if (sample !== null && header === null) {
                sample.push(cells);
                if (sample.length >= HEADER_SAMPLE) flushSample();
                return;
            }
            if (sample !== null) flushSample();
            push(cells);
        },
        get rowCount() {
            return rowCount + (sample?.length ?? 0);
        },
        /** A note of the reader (encoding, separator, sheet, ...). */
        note(code, params) {
            notes.push(note(code, params));
        },
        /**
         * The table, typed: the inferred types, or `types` where given.
         * @param {ReadOptions["types"]} [types]
         * @returns {ImportTable}
         */
        finish(types) {
            if (sample !== null) flushSample();
            return finishTable({ header: header ?? [], columns, rowCount, notes, counts, hints, limits, types });
        }
    };
}

/** Column names: cleaned, "Column N" for an empty one, "Name (2)" for a repeated one (case-insensitive). */
function nameColumns(header, count, notes) {
    const names = [];
    const taken = new Set();
    let renamed = 0;
    const rename = (position, from, to) => {
        renamed++;
        if (renamed <= MAX_RENAMED_NOTES) notes.push(note("COLUMN_RENAMED", { position, from, to }));
    };
    const free = (base) => {
        let name = base;
        for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base} (${i})`;
        return name;
    };
    for (let c = 0; c < count; c++) {
        const given = c < header.length ? header[c] : null;
        let name;
        if (given === null || given === "") {
            name = free(`Column ${c + 1}`);
            if (c < header.length) rename(c + 1, "", name);
        } else {
            name = free(given);
            if (name !== given) rename(c + 1, given, name);
        }
        taken.add(name.toLowerCase());
        names.push(name);
    }
    if (renamed > MAX_RENAMED_NOTES) notes.push(note("COLUMNS_RENAMED_MORE", { count: renamed - MAX_RENAMED_NOTES }));
    return names;
}

function finishTable({ header, columns, rowCount, notes, counts, hints, limits, types }) {
    // columns without a name and without a value go
    const keep = [];
    for (let c = 0; c < columns.length; c++) {
        const named = c < header.length && header[c] !== null && header[c] !== "";
        if (!named && columns[c].every((v) => v === null)) {
            if (c < header.length) notes.push(note("COLUMN_DROPPED", { position: c + 1 }));
            continue;
        }
        keep.push(c);
    }
    const keptHeader = keep.map((c) => (c < header.length ? header[c] : null));
    const names = nameColumns(keptHeader, keep.length, notes);
    const raw = keep.map((c) => columns[c]);
    const added = keep.filter((c) => c >= header.length).length;
    if (counts.extraRows > 0 && added > 0) notes.push(note("COLUMNS_ADDED", { rows: counts.extraRows, count: added }));
    if (counts.empty > 0) notes.push(note("ROWS_EMPTY", { count: counts.empty }));
    if (counts.cut > 0) notes.push(note("TEXT_CUT", { count: counts.cut, max: limits.textLength }));
    if (counts.removed > 0) notes.push(note("CHARACTERS_REMOVED", { count: counts.removed }));
    /** @type {ImportTable} */
    const table = {
        columns: names,
        types: [],
        data: [],
        raw,
        detected: [],
        rowCount,
        notes,
        hints
    };
    const inferred = raw.map((values) => inferColumn(values, hints));
    table.detected = inferred.map((x) => x.type);
    inferred.forEach((x, c) => {
        if (x.ambiguousOrder) notes.push(note("DATE_ORDER", { column: names[c], order: x.dateOrder }));
    });
    return applyTypes(table, types, inferred);
}

/**
 * The table with its columns typed: `types` (by position, or by name case-insensitively) where given,
 * else the inferred type.
 * @param {ImportTable} table
 * @param {ReadOptions["types"]} types
 * @param {Array<ReturnType<typeof inferColumn>>} [inferred]
 * @returns {ImportTable}
 */
function applyTypes(table, types, inferred) {
    const wanted = typesByPosition(table.columns, types);
    const notes = table.notes.filter((x) => x.code !== "VALUES_NOT_CONVERTED");
    const outTypes = [];
    const data = [];
    for (let c = 0; c < table.columns.length; c++) {
        const own = inferred?.[c];
        const type = wanted[c] ?? table.detected[c];
        // a column read in another notation than the table's hint converts in that notation first
        const hints = own && own.type === type ? { ...table.hints, ...(own.decimal ? { decimal: own.decimal } : {}), ...(own.dateOrder ? { dateOrder: own.dateOrder } : {}) } : table.hints;
        if (table.types[c] === type && table.data[c] !== undefined) {
            // the column keeps its type: its values and its note stay as they are
            outTypes.push(type);
            data.push(table.data[c]);
            const kept = table.notes.find((x) => x.code === "VALUES_NOT_CONVERTED" && x.params.column === table.columns[c]);
            if (kept) notes.push(kept);
            continue;
        }
        const { values, failed } = convertColumn(table.raw[c], type, hints);
        if (failed > 0) notes.push(note("VALUES_NOT_CONVERTED", { column: table.columns[c], type, count: failed }));
        outTypes.push(type);
        data.push(values);
    }
    return { ...table, types: outTypes, data, notes };
}

/** `types` (an array by position or an object by name) as one entry per column; invalid entries are ignored. */
function typesByPosition(columns, types) {
    const out = new Array(columns.length).fill(undefined);
    if (Array.isArray(types)) {
        for (let c = 0; c < columns.length; c++) {
            if (IMPORT_TYPES.includes(types[c])) out[c] = types[c];
        }
    } else if (types && typeof types === "object") {
        const byName = new Map();
        for (const k of Object.keys(types)) {
            if (IMPORT_TYPES.includes(types[k])) byName.set(k.toLowerCase(), types[k]);
        }
        columns.forEach((name, c) => {
            out[c] = byName.get(name.toLowerCase());
        });
    }
    return out;
}

/**
 * The table with other column types, from the values as read (`raw`): what the user picks in a
 * preview, without reading the file again. Values that do not convert are blank, with a note.
 * @param {ImportTable} table
 * @param {ReadOptions["types"]} types  by position or by column name; a missing entry keeps the column's current type
 * @returns {ImportTable}
 */
export function retype(table, types) {
    if (!table || !Array.isArray(table.columns) || !Array.isArray(table.raw) || table.raw.length !== table.columns.length) {
        throw new PivotkitError("INVALID_ARGUMENT", "retype(table, types): table must be a table read by a reader, with its raw values");
    }
    const wanted = typesByPosition(table.columns, types);
    const merged = table.columns.map((_, c) => wanted[c] ?? table.types[c] ?? table.detected[c]);
    const inferred = table.raw.map((values, c) => (merged[c] === table.detected[c] ? inferColumn(values, table.hints) : undefined));
    return applyTypes(table, merged, inferred);
}

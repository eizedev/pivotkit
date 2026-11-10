/*
 * The built-in reader of delimited text: CSV, TSV and TXT. Loaded on demand by the reader plugin
 * `csvReader` of pivotkit-core/import; follows the reader contract (`read(file, options)`).
 *
 * - Encoding: byte order mark, else strict UTF-8, else Windows-1252 (import-text.js).
 * - Separator: Excel's "sep=;" first line, else the one of comma, semicolon, tab and pipe that splits
 *   the first lines into the same number of fields most often (a tab first for .tsv).
 * - Fields: RFC 4180 quotes (a quote doubled inside, separators and line breaks inside quotes); a
 *   quote that is never closed is an error with its line. Lines end in CRLF, LF or CR.
 * - The header is found below a title block, values are cleaned and typed by import-table.js.
 */

import { ROW_STEP, bytesOf, createTable, fileError, fileName, pause, readOptions } from "./import-table.js";
import { decodeText } from "./import-text.js";

const CANDIDATES = [",", ";", "\t", "|"];
const SEPARATOR_NAMES = { ",": "commas", ";": "semicolons", "\t": "tabs", "|": "vertical bars" };
/** Characters of the start of a file the separator is guessed from. */
const SAMPLE_CHARS = 65_536;
const SAMPLE_ROWS = 100;
const QUOTE = 34;
const LF = 10;
const CR = 13;

/**
 * Splits text into rows of fields and calls `onRow(fields, line)` for each; returns the position after
 * the last row read. With `sample`, stops quietly at a quote that is not closed (the sample may end
 * inside it) and after `maxRows` rows.
 * @param {string} text
 * @param {string} sep  one character
 * @param {number} start
 * @param {(fields: string[], line: number) => boolean | void} onRow  returns true to stop
 * @param {{ sample?: boolean, file?: string, line?: number }} [opts]  `line`: the line `start` is in; updated to the line reached
 */
export function splitRows(text, sep, start, onRow, opts = {}) {
    const S = sep.charCodeAt(0);
    const n = text.length;
    let i = start;
    let line = opts.line ?? 1;
    while (i < n) {
        const rowLine = line;
        const fields = [];
        for (;;) {
            let value;
            if (text.charCodeAt(i) === QUOTE) {
                const openLine = line;
                let j = i + 1;
                let buf = "";
                for (;;) {
                    const k = text.indexOf('"', j);
                    if (k === -1) {
                        if (opts.sample) return n;
                        throw fileError("UNCLOSED_QUOTE", opts.file ?? "file", `the quote that opens a value in line ${openLine} is never closed.`, { line: openLine });
                    }
                    line += countBreaks(text, j, k);
                    buf += text.slice(j, k);
                    if (text.charCodeAt(k + 1) === QUOTE) {
                        buf += '"';
                        j = k + 2;
                        continue;
                    }
                    i = k + 1;
                    break;
                }
                // text after the closing quote up to the separator belongs to the value (lenient)
                let e = i;
                while (e < n) {
                    const c = text.charCodeAt(e);
                    if (c === S || c === LF || c === CR) break;
                    e++;
                }
                value = e > i ? buf + text.slice(i, e) : buf;
                i = e;
            } else {
                let e = i;
                while (e < n) {
                    const c = text.charCodeAt(e);
                    if (c === S || c === LF || c === CR) break;
                    e++;
                }
                value = text.slice(i, e);
                i = e;
            }
            fields.push(value);
            const c = i < n ? text.charCodeAt(i) : -1;
            if (c === S) {
                i++;
                continue;
            }
            if (c === CR) {
                i += text.charCodeAt(i + 1) === LF ? 2 : 1;
                line++;
            } else if (c === LF) {
                i++;
                line++;
            }
            break;
        }
        if (onRow(fields, rowLine)) {
            break;
        }
    }
    opts.line = line;
    return i;
}

function countBreaks(text, from, to) {
    let count = 0;
    for (let k = from; k < to; k++) {
        const c = text.charCodeAt(k);
        if (c === LF || (c === CR && text.charCodeAt(k + 1) !== LF)) count++;
    }
    return count;
}

/**
 * The separator of delimited text: the candidate that splits the sample's lines into the same number
 * (more than one) of fields most often; on a tie the one with more fields, then the preferred one.
 * @param {string} text
 * @param {number} start
 * @param {string} [preferred]
 */
export function detectSeparator(text, start, preferred) {
    const sample = text.slice(start, start + SAMPLE_CHARS);
    let best = { sep: preferred ?? ",", score: -1, width: 1 };
    const order = preferred ? [preferred, ...CANDIDATES.filter((c) => c !== preferred)] : CANDIDATES;
    for (const sep of order) {
        const widths = new Map();
        let rows = 0;
        splitRows(sample, sep, 0, (fields) => {
            if (!(fields.length === 1 && fields[0] === "")) {
                widths.set(fields.length, (widths.get(fields.length) ?? 0) + 1);
                rows++;
            }
            return rows >= SAMPLE_ROWS;
        }, { sample: true });
        let width = 1;
        let score = 0;
        for (const [w, count] of widths) {
            if (w > 1 && (count > score || (count === score && w > width))) {
                width = w;
                score = count;
            }
        }
        if (width > 1 && (score > best.score || (score === best.score && width > best.width))) {
            best = { sep, score, width };
        }
    }
    return best.sep;
}

/** The decimal mark of a locale ("," for de-DE), "." when it has none or is invalid. */
function localeDecimal(locale) {
    if (!locale) return ".";
    try {
        const part = new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === "decimal");
        return part?.value === "," ? "," : ".";
    } catch {
        return ".";
    }
}

/**
 * Reads delimited text (CSV, TSV, TXT) into a table.
 * @param {Blob | ArrayBuffer | Uint8Array} file
 * @param {import("./import-table.js").ReadOptions & { separator?: string }} [options]  `separator` skips the detection
 * @returns {Promise<import("./import-table.js").ImportTable>}
 */
export async function read(file, options) {
    const o = readOptions(options);
    const name = fileName(file, o);
    o.signal?.throwIfAborted();
    const bytes = await bytesOf(file, o.limits, name);
    o.onProgress?.({ phase: "read", done: bytes.length, total: bytes.length });
    const { text, encoding } = decodeText(bytes, name);
    o.signal?.throwIfAborted();

    let start = 0;
    let sep = typeof o.separator === "string" && o.separator.length === 1 ? o.separator : null;
    const hint = /^sep=(.)\r?\n/i.exec(text.slice(0, 8));
    if (hint) {
        start = hint[0].length;
        sep ??= hint[1];
    }
    sep ??= detectSeparator(text, start, /\.tsv$/i.test(name) ? "\t" : undefined);

    const table = createTable({
        file: name,
        limits: o.limits,
        locale: o.locale,
        hints: { decimal: sep === ";" ? "," : localeDecimal(o.locale) }
    });
    table.note("ENCODING", { encoding });
    table.note("SEPARATOR", { separator: sep, name: SEPARATOR_NAMES[sep] ?? `"${sep}"` });

    // splitRows runs synchronously; between steps of ROW_STEP rows the event loop gets a turn
    let at = start;
    const where = { file: name, line: start > 0 ? 2 : 1 };
    while (at < text.length) {
        let rows = 0;
        at = splitRows(text, sep, at, (fields) => {
            table.row(fields);
            return ++rows >= ROW_STEP;
        }, where);
        o.onProgress?.({ phase: "parse", done: at, total: text.length });
        if (at < text.length) {
            await pause();
            o.signal?.throwIfAborted();
        }
    }
    o.signal?.throwIfAborted();
    return table.finish(o.types);
}

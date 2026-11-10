/*
 * Checks and trims of the XML parts of a workbook, on their bytes, before read-excel-file sees them:
 *
 * - `checkXml`: no document type declaration and no entity declaration (`<!DOCTYPE`, `<!ENTITY`).
 *   An .xlsx never needs either; refusing them rules out entity expansion and external entities
 *   whatever the XML parser does with them.
 * - `createSheetFilter`: the rows of a sheet that hold no value are left out. Excel's used range often
 *   reaches far below the data (formatted empty cells to row 900,000); those rows would otherwise be
 *   unpacked into memory, parsed and turned into empty rows. A row is kept when it has a cell with
 *   content (`</c>`: a value, an inline string or a formula); a row of empty cells (`<c r="A9" s="1"/>`)
 *   or a self-closing `<row/>` goes. Rows are numbered by their cells' `r` attributes, so leaving rows
 *   out moves no value.
 *
 * Not part of the public API.
 */

import { fileError, limitError } from "pivotkit-core/import";

const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const LT = 0x3c;
const BANG = 0x21;
const DOCTYPE = ascii("DOCTYPE");
const ENTITY = ascii("ENTITY");
const SHEET_DATA = ascii("<sheetData");
const SHEET_DATA_END = ascii("</sheetData>");
const ROW = ascii("<row");
const ROW_END = ascii("</row>");
const CELL_END = ascii("</c>");
const ERROR_TYPE = ascii(' t="e"');

/** Index of `pattern` in `buf` from `from`, or -1. */
export function indexOf(buf, pattern, from = 0, to = buf.length) {
    const first = pattern[0];
    const last = to - pattern.length;
    for (let i = buf.indexOf(first, from); i !== -1 && i <= last; i = buf.indexOf(first, i + 1)) {
        let k = 1;
        while (k < pattern.length && buf[i + k] === pattern[k]) k++;
        if (k === pattern.length) return i;
    }
    return -1;
}

/** Whether `buf` at `i` holds `word`, letters compared without case. */
function wordAt(buf, i, word) {
    for (let k = 0; k < word.length; k++) {
        if ((buf[i + k] | 0x20) !== (word[k] | 0x20)) return false;
    }
    return true;
}

/**
 * A check of an XML part's bytes, fed piece by piece: throws at a `<!DOCTYPE` or `<!ENTITY`.
 * @param {string} file
 * @param {string} part
 */
export function createXmlCheck(file, part) {
    let tail = new Uint8Array(0);
    let first = true;
    return (chunk) => {
        // the check reads ASCII bytes: an XML part in UTF-16 or UTF-32 (a byte order mark, zero bytes)
        // could hide a declaration from it, and Excel writes UTF-8
        if ((first && chunk.length >= 2 && ((chunk[0] === 0xfe && chunk[1] === 0xff) || (chunk[0] === 0xff && chunk[1] === 0xfe))) || chunk.indexOf(0) !== -1) {
            throw fileError("XML_DECLARATION", file, `the part "${part}" is not UTF-8 XML, which a workbook always is; it is refused.`, { part });
        }
        first = false;
        const buf = tail.length ? concat(tail, chunk) : chunk;
        // "!" is rare in a workbook's XML (comments, CDATA, text); "<" is in every tag
        for (let i = buf.indexOf(BANG, 1); i !== -1; i = buf.indexOf(BANG, i + 1)) {
            if (buf[i - 1] === LT && (wordAt(buf, i + 1, DOCTYPE) || wordAt(buf, i + 1, ENTITY))) {
                throw fileError("XML_DECLARATION", file, `the part "${part}" declares a document type or entities, which a workbook never needs; it is refused.`, { part });
            }
        }
        tail = buf.slice(Math.max(0, buf.length - 9));
    };
}

/** Checks a whole XML part. */
export function checkXml(bytes, file, part) {
    createXmlCheck(file, part)(bytes);
}

function concat(a, b) {
    const out = new Uint8Array(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return out;
}

/** The row number of a `<row ...>` tag (its `r` attribute), or 0. */
function rowNumber(buf, from, to) {
    for (let i = from; i < to - 3; i++) {
        // ' r="'
        if ((buf[i] === 0x20 || buf[i] === 0x09 || buf[i] === 0x0a || buf[i] === 0x0d) && buf[i + 1] === 0x72 && buf[i + 2] === 0x3d && buf[i + 3] === 0x22) {
            let n = 0;
            for (let k = i + 4; k < to && buf[k] >= 0x30 && buf[k] <= 0x39; k++) n = n * 10 + (buf[k] - 0x30);
            return n;
        }
    }
    return 0;
}

/** The largest row (or start of a sheet before its <sheetData>) the filter holds while it waits for its end. */
const MAX_PENDING = 64 * 1024 * 1024;
const CELL = ascii("<c ");

/** The highest column (1 for A) and row of the cells' `r` attributes in buf[from, to). */
function cellExtent(buf, from, to) {
    let column = 0;
    let row = 0;
    for (let i = indexOf(buf, CELL, from, to); i !== -1; i = indexOf(buf, CELL, i + 3, to)) {
        const gt = buf.indexOf(0x3e, i);
        const stop = gt === -1 || gt > to ? to : gt;
        for (let k = i + 2; k < stop - 3; k++) {
            if ((buf[k] === 0x20 || buf[k] === 0x09) && buf[k + 1] === 0x72 && buf[k + 2] === 0x3d && buf[k + 3] === 0x22) {
                let c = 0;
                let q = k + 4;
                for (; q < stop && ((buf[q] | 0x20) >= 0x61 && (buf[q] | 0x20) <= 0x7a) && c <= 1e7; q++) c = c * 26 + ((buf[q] | 0x20) - 0x60);
                let r = 0;
                for (; q < stop && buf[q] >= 0x30 && buf[q] <= 0x39 && r <= 1e12; q++) r = r * 10 + (buf[q] - 0x30);
                column = Math.max(column, c);
                row = Math.max(row, r);
                break;
            }
        }
    }
    return { column, row };
}

/**
 * Streams a sheet's XML and leaves out its rows without a value. Feed pieces with `push`; the XML
 * kept goes to `out.write`; `end()` gives the row numbers seen.
 *
 * It also checks where the values are against the limits, before read-excel-file sees them: the
 * parser makes a dense array of the sheet's extent (every row up to the last row with a value, each
 * as wide as the widest), so a value in row 1,000,000 or column XFD costs that much memory however
 * small the file is. A value beyond `maxRow` or `maxColumn`, or an extent of more than `maxCells`,
 * stops the read with LIMIT_EXCEEDED.
 * @param {{ write: (bytes: Uint8Array, from?: number, to?: number) => void }} out
 * @param {{ file?: string, maxRow?: number, maxColumn?: number, maxCells?: number }} [limits]
 */
export function createSheetFilter(out, limits = {}) {
    const file = limits.file ?? "file";
    let widest = 0;
    let state = 0; // 0 before <sheetData>, 1 inside, 2 after
    let pending = new Uint8Array(0);
    let lastValueRow = 0;
    let lastRow = 0;
    let dropped = 0;
    let errors = 0;

    const run = (final) => {
        const buf = pending;
        let i = 0;
        while (i < buf.length) {
            if (state === 0) {
                const at = indexOf(buf, SHEET_DATA, i);
                if (at === -1) {
                    const keep = final ? buf.length : Math.max(i, buf.length - SHEET_DATA.length);
                    out.write(buf, i, keep);
                    i = keep;
                    break;
                }
                const close = buf.indexOf(0x3e, at);
                if (close === -1) {
                    out.write(buf, i, at);
                    i = at;
                    break;
                }
                out.write(buf, i, close + 1);
                i = close + 1;
                state = buf[close - 1] === 0x2f ? 2 : 1; // <sheetData/>
                continue;
            }
            if (state === 2) {
                out.write(buf, i, buf.length);
                i = buf.length;
                break;
            }
            // inside <sheetData>: whole rows at a time
            const lt = buf.indexOf(LT, i);
            if (lt === -1) {
                i = buf.length; // whitespace between rows
                break;
            }
            if (indexOf(buf, SHEET_DATA_END, lt, lt + SHEET_DATA_END.length) === lt) {
                state = 2;
                i = lt;
                continue;
            }
            if (indexOf(buf, ROW, lt, lt + ROW.length) !== lt) {
                // anything else in sheetData (a comment, say) is kept as it is
                const gt = buf.indexOf(0x3e, lt);
                if (gt === -1) {
                    i = lt;
                    break;
                }
                out.write(buf, lt, gt + 1);
                i = gt + 1;
                continue;
            }
            const tagEnd = buf.indexOf(0x3e, lt);
            if (tagEnd === -1) {
                i = lt;
                break;
            }
            const number = rowNumber(buf, lt, tagEnd);
            if (buf[tagEnd - 1] === 0x2f) {
                // <row .../>: no cells
                lastRow = Math.max(lastRow, number);
                dropped++;
                i = tagEnd + 1;
                continue;
            }
            const end = indexOf(buf, ROW_END, tagEnd);
            if (end === -1) {
                i = lt;
                break;
            }
            const stop = end + ROW_END.length;
            lastRow = Math.max(lastRow, number);
            if (indexOf(buf, CELL_END, tagEnd, end) !== -1) {
                const extent = cellExtent(buf, tagEnd, end);
                const at = Math.max(number, extent.row);
                widest = Math.max(widest, extent.column);
                if (limits.maxRow !== undefined && at > limits.maxRow) throw limitError("rows", at, limits.maxRow, file, "rows");
                if (limits.maxColumn !== undefined && widest > limits.maxColumn) throw limitError("columns", widest, limits.maxColumn, file, "columns");
                if (limits.maxCells !== undefined && at * widest > limits.maxCells) throw limitError("importCells", at * widest, limits.maxCells, file, "values (rows x columns)");
                out.write(buf, lt, stop);
                lastValueRow = Math.max(lastValueRow, at);
                for (let e = indexOf(buf, ERROR_TYPE, tagEnd, end); e !== -1; e = indexOf(buf, ERROR_TYPE, e + 1, end)) errors++;
            } else {
                dropped++;
            }
            i = stop;
        }
        pending = i < buf.length ? buf.slice(i) : new Uint8Array(0);
        if (pending.length > MAX_PENDING) {
            throw fileError("DAMAGED", file, "a row of the sheet is larger than 64 MiB, or the sheet's XML is broken; the workbook is refused.");
        }
    };

    // pieces wait until they double what is pending, so a long row is scanned a few times, not once per piece
    let waiting = [];
    let size = 0;
    let need = 0;
    const gather = () => {
        if (waiting.length === 1) return waiting[0];
        const all = new Uint8Array(size);
        let at = 0;
        for (const w of waiting) {
            all.set(w, at);
            at += w.length;
        }
        return all;
    };

    return {
        /** @param {Uint8Array} chunk */
        push(chunk) {
            waiting.push(chunk);
            size += chunk.length;
            if (size < need) return;
            pending = gather();
            run(false);
            waiting = pending.length ? [pending] : [];
            size = pending.length;
            need = pending.length * 2;
        },
        /** @returns {{ lastRow: number, lastValueRow: number, dropped: number, errors: number }} */
        end() {
            pending = size ? gather() : new Uint8Array(0);
            waiting = [];
            run(true);
            if (pending.length) out.write(pending);
            return { lastRow, lastValueRow, dropped, errors };
        }
    };
}

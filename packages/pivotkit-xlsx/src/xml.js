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

import { fileError } from "pivotkit-core/import";

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
    return (chunk) => {
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

/**
 * Streams a sheet's XML and leaves out its rows without a value. Feed pieces with `push`; the XML
 * kept goes to `out.write`; `end()` gives the row numbers seen.
 * @param {{ write: (bytes: Uint8Array, from?: number, to?: number) => void }} out
 */
export function createSheetFilter(out) {
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
                out.write(buf, lt, stop);
                lastValueRow = Math.max(lastValueRow, number);
                for (let e = indexOf(buf, ERROR_TYPE, tagEnd, end); e !== -1; e = indexOf(buf, ERROR_TYPE, e + 1, end)) errors++;
            } else {
                dropped++;
            }
            i = stop;
        }
        pending = i < buf.length ? buf.slice(i) : new Uint8Array(0);
    };

    return {
        /** @param {Uint8Array} chunk */
        push(chunk) {
            pending = pending.length ? concat(pending, chunk) : chunk;
            run(false);
        },
        /** @returns {{ lastRow: number, lastValueRow: number, dropped: number, errors: number }} */
        end() {
            run(true);
            if (pending.length) out.write(pending);
            return { lastRow, lastValueRow, dropped, errors };
        }
    };
}

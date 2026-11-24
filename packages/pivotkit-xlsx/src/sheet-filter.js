/*
 * The sheet filter: the rows of a sheet that hold no value are left out. Excel's used range often
 * reaches far below the data (formatted empty cells to row 900,000); those rows would otherwise be
 * unpacked into memory, parsed and turned into empty rows. A row is kept when it has a cell with
 * content (`</c>`: a value, an inline string or a formula); a row of empty cells (`<c r="A9" s="1"/>`)
 * or a self-closing `<row/>` goes. Rows are numbered by their cells' `r` attributes, so leaving rows
 * out moves no value. Anything between rows that is no row, and what follows `</sheetData>` but
 * for the root's end tag, is left out too: read-excel-file reads nothing there. Tags, names and
 * numbers are read as that parser reads them, with any namespace prefix (`<x:row>`).
 *
 * Not part of the public API.
 */

import { fileError, limitError } from "pivotkit-core/import";
import { LT, ascii, isWord } from "./xml-bytes.js";
import { eachAttr, plainValue } from "./xml-attributes.js";
import { createXmlGuard } from "./xml-guard.js";
import { isMarkup, tagName, tokenEnd } from "./xml-tags.js";

/** A row's number from its `r` as read-excel-file reads it (Number(); 0 for none or NaN). */
function rowAt(buf, from, to) {
    const s = plainValue(buf, from, to);
    const n = s === null ? Infinity : Number(s);
    return n > 0 ? n : 0;
}

/** [row, column] of a cell from its `r` as read-excel-file reads it (parseCellAddress: letters, then Number()). */
function cellAt(buf, from, to) {
    // most are "B12": capital letters, then digits (more than 15 differ from Number() in the last
    // places only)
    let k = from;
    let column = 0;
    while (k < to && buf[k] > 0x40 && buf[k] < 0x5b) column = column * 26 + buf[k++] - 0x40;
    const digits = k;
    let row = 0;
    while (k < to && buf[k] > 0x2f && buf[k] < 0x3a) row = row * 10 + buf[k++] - 0x30;
    if (k === to && k > digits && digits > from) return [row, column];
    const s = plainValue(buf, from, to);
    if (s === null) return [Infinity, Infinity];
    column = 0;
    for (let i = 0; i < s.length; i++) {
        const code = s.charCodeAt(i);
        // a row it cannot read (NaN) stops the parser
        if (code >= 0x30 && code <= 0x39) return [Number(s.slice(i)) || 0, column];
        column = column * 26 + code - 64;
    }
    return [0, 0];
}

/** The row number of a row tag whose attributes are buf[from, to): the largest `r`, or 0. */
function rowNumber(buf, from, to) {
    let number = 0;
    eachAttr(buf, from, to, (local, nameEnd, vFrom, vTo) => {
        if (nameEnd - local === 1 && buf[local] === 0x72) number = Math.max(number, rowAt(buf, vFrom, vTo));
    });
    return number;
}

/** The largest row (or start of a sheet before its <sheetData>) the filter holds while it waits for its end. */
const MAX_PENDING = 64 * 1024 * 1024;
/** The size from which a row waiting for its end is squeezed by createXmlGuard. */
const SQUEEZE_AT = 1024 * 1024;
const SHEET_DATA = ascii("sheetData");
const ROW = ascii("row");

/** XML that starts at a "<", through createXmlGuard. */
function squeeze(buf, file, part) {
    /** @type {Uint8Array[]} */
    const pieces = [];
    let size = 0;
    createXmlGuard({ write: (b, from = 0, to = b.length) => {
        pieces.push(b.subarray(from, to));
        size += to - from;
    } }, file, part).write(buf);
    if (pieces.length === 1) return pieces[0];
    const out = new Uint8Array(size);
    let at = 0;
    for (const p of pieces) {
        out.set(p, at);
        at += p.length;
    }
    return out;
}

/**
 * The row whose start tag is buf[lt, gt] ("<row ...>", name buf[name, nameEnd)), read tag by tag as
 * the parser reads it up to its end tag (the start tag's name, prefix and all), comments, CDATA
 * sections and processing instructions skipped whole; null while it does not end in `buf`. Gives where
 * it ends (just after its end tag), whether a cell has content (an end tag `c`), its width as the
 * parser builds it (each cell one more, or its column if that is further), the highest row of its
 * cells' `r` and of the `r` of a row inside it (the parser reads one as a row), the
 * highest shared string a cell names (`t="s"` and its `<v>`, -1 for none) and the cells with an error.
 */
function readRow(buf, name, nameEnd, gt, file, part) {
    let column = 0;
    let row = 0;
    let shared = -1;
    let errors = 0;
    let cells = false;
    let open = false; // in a shared-string cell whose <v> is not read yet
    // a row without a value is left out: its attributes are read only from its first cell's end
    // tag on, then from its start again (most rows of a used range have none; most others end their
    // first cell soon)
    let measure = false;
    for (let lt = buf.indexOf(LT, gt + 1); lt !== -1; lt = buf.indexOf(LT, lt)) {
        const after = tokenEnd(buf, lt, file, part);
        if (after === -1) return null;
        if (isMarkup(buf, lt)) {
            lt = after;
            continue;
        }
        const end = after - 1;
        const [start, local, stop] = tagName(buf, lt);
        if (buf[lt + 1] === 0x2f) {
            if (isWord(buf, start, stop, buf.subarray(name, nameEnd))) {
                return { end: after, cells, column, row, shared, errors };
            }
            if (stop - local === 1 && buf[local] === 0x63 && !cells) {
                cells = measure = true;
                lt = gt + 1;
                continue;
            }
        } else if (measure) {
            const self = buf[end - 1] === 0x2f;
            const attrsEnd = self ? end - 1 : end;
            if (stop - local === 1 && buf[local] === 0x63) {
                // a cell: the parser appends it after the empty cells up to its column, so the row
                // is at least one wider than before, also when cells name one column ("A1", "A2" ...)
                open = false;
                column++;
                eachAttr(buf, stop, attrsEnd, (at, atEnd, vFrom, vTo) => {
                    if (atEnd - at !== 1) return;
                    if (buf[at] === 0x72) {
                        const [r, c] = cellAt(buf, vFrom, vTo);
                        row = Math.max(row, r);
                        column = Math.max(column, c);
                    } else if (buf[at] === 0x74) {
                        // a type that is not plain may be "s" or "e"
                        const type = plainValue(buf, vFrom, vTo);
                        if ((type === null || type === "s") && !self) open = true;
                        if (type === null || type === "e") errors++;
                    }
                });
            } else if (isWord(buf, local, stop, ROW)) {
                row = Math.max(row, rowNumber(buf, stop, attrsEnd));
            } else if (open && !self && stop - local === 1 && buf[local] === 0x76) {
                // a <v> of a shared-string cell names a string (Number() of its text; the parser
                // takes the last <v>, so each counts); a value written otherwise (CDATA, an entity, a
                // comment in it) keeps them all
                const next = buf.indexOf(LT, after);
                if (next === -1) return null;
                const n = buf[next + 1] === 0x2f && plainValue(buf, after, next) ? Number(plainValue(buf, after, next)) : NaN;
                shared = Math.max(shared, n >= 0 ? n : Infinity);
            }
        }
        lt = after;
    }
    return null;
}

/**
 * Streams a sheet's XML and leaves out its rows without a value and everything after `</sheetData>`
 * but the last end tag (the root's): read-excel-file reads nothing there. Feed pieces with `push`; the
 * XML kept goes to `out.write`; `end()` gives the row numbers seen and the highest shared string a
 * kept cell names (-1 for none).
 *
 * It also checks where the values are against the limits, before read-excel-file sees them: the
 * parser makes a dense array of the sheet's extent (every row up to the last row with a value, each
 * as wide as the widest), so a value in row 1,000,000 or column XFD costs that much memory however
 * small the file is. A value beyond `maxRow` or `maxColumn`, or an extent of more than `maxCells`,
 * stops the read with LIMIT_EXCEEDED. Tags, names and numbers are read as the parser reads them
 * (xml-tags.js): with any namespace prefix; what the filter passes on is only rows it read whole, and
 * a row the sheet does not end is left out.
 * @param {{ write: (bytes: Uint8Array, from?: number, to?: number) => void }} out
 * @param {{ file?: string, part?: string, maxRow?: number, maxColumn?: number, maxCells?: number }} [limits]  `file` and `part` name them in messages
 */
export function createSheetFilter(out, limits = {}) {
    const file = limits.file ?? "file";
    const part = limits.part ?? "sheet";
    let widest = 0;
    let state = 0; // 0 before <sheetData>, 1 inside, 2 after
    /** @type {Uint8Array} */
    let pending = new Uint8Array(0);
    let lastValueRow = 0;
    let lastRow = 0;
    let dropped = 0;
    let errors = 0;
    let shared = -1;
    /** After the sheet's data: the last end tag seen. */
    let closing = new Uint8Array(0);

    const run = (final) => {
        const buf = pending;
        let i = 0;
        while (i < buf.length) {
            if (state === 0) {
                // the start tag of the sheet's data (<sheetData>, <x:sheetData>), tag by tag as the
                // parser reads them: not one in a comment, a CDATA section or a quoted value
                let wait = buf.length; // a tag or markup that goes on in the next piece
                let lt = buf.indexOf(LT, i);
                let after = i;
                for (; lt !== -1; lt = buf.indexOf(LT, after)) {
                    after = tokenEnd(buf, lt, file, part);
                    if (after === -1) {
                        wait = lt;
                        break;
                    }
                    if (isMarkup(buf, lt) || buf[lt + 1] === 0x2f) continue;
                    const [, local, stop] = tagName(buf, lt);
                    if (isWord(buf, local, stop, SHEET_DATA)) break;
                }
                if (lt === -1 || wait < buf.length) {
                    const keep = final ? buf.length : wait;
                    out.write(buf, i, keep);
                    i = keep;
                    break;
                }
                out.write(buf, i, after);
                i = after;
                state = buf[after - 2] === 0x2f ? 2 : 1; // <sheetData/>
                continue;
            }
            if (state === 2) {
                // nothing after the sheet's data is read (merged cells, conditional formats, print
                // settings): it is skipped, and only the last end tag (the root's) goes on, in end()
                const lt = buf.indexOf(LT, i);
                if (lt === -1) {
                    i = buf.length;
                    break;
                }
                const gt = buf.indexOf(0x3e, lt);
                if (gt === -1) {
                    i = final ? buf.length : lt;
                    break;
                }
                if (buf[lt + 1] === 0x2f && gt - lt < 1024) closing = buf.slice(lt, gt + 1);
                i = gt + 1;
                continue;
            }
            // inside <sheetData>: whole rows at a time
            const lt = buf.indexOf(LT, i);
            if (lt === -1) {
                i = buf.length; // whitespace between rows
                break;
            }
            const after = tokenEnd(buf, lt, file, part);
            if (after === -1) {
                i = lt;
                break;
            }
            i = after;
            // a comment, CDATA section or processing instruction between rows is left out, where the
            // parser ends it, so a row inside one stays out too
            if (isMarkup(buf, lt)) continue;
            const [name, local, nameEnd] = tagName(buf, lt);
            if (buf[lt + 1] === 0x2f) {
                // the end of the sheet's data; any other end tag is left out
                if (isWord(buf, local, nameEnd, SHEET_DATA)) {
                    out.write(buf, lt, after);
                    state = 2;
                }
                continue;
            }
            // anything but a row in sheetData is left out: read-excel-file reads rows only
            if (!isWord(buf, local, nameEnd, ROW)) continue;
            const self = buf[after - 2] === 0x2f;
            const number = rowNumber(buf, nameEnd, self ? after - 2 : after - 1);
            if (self) {
                // <row .../>: no cells
                lastRow = Math.max(lastRow, number);
                dropped++;
                continue;
            }
            const row = readRow(buf, name, nameEnd, after - 1, file, part);
            if (row === null) {
                i = lt;
                break;
            }
            lastRow = Math.max(lastRow, number);
            if (row.cells) {
                const at = Math.max(number, row.row);
                widest = Math.max(widest, row.column);
                shared = Math.max(shared, row.shared);
                if (limits.maxRow !== undefined && at > limits.maxRow) throw limitError("rows", at, limits.maxRow, file, "rows");
                if (limits.maxColumn !== undefined && widest > limits.maxColumn) throw limitError("columns", widest, limits.maxColumn, file, "columns");
                if (limits.maxCells !== undefined && at * widest > limits.maxCells) throw limitError("importCells", at * widest, limits.maxCells, file, "values (rows x columns)");
                out.write(buf, lt, row.end);
                lastValueRow = Math.max(lastValueRow, at);
                errors += row.errors;
            } else {
                dropped++;
            }
            i = row.end;
        }
        pending = i < buf.length ? buf.slice(i) : new Uint8Array(0);
        // a row waiting for its end that grows large is squeezed (whitespace runs cut, over-long
        // tokens refused) while it waits, so whitespace in a row is never held
        if (state === 1 && pending.length > SQUEEZE_AT) pending = squeeze(pending, file, part);
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
        /** @returns {{ lastRow: number, lastValueRow: number, dropped: number, errors: number, shared: number }} */
        end() {
            pending = size ? gather() : new Uint8Array(0);
            waiting = [];
            run(true);
            // a row the sheet does not end is left out: the parser would read its cells unchecked
            if (pending.length && state !== 1) out.write(pending);
            if (closing.length) out.write(closing);
            // no <sheetData> found: which strings the sheet names is not known
            return { lastRow, lastValueRow, dropped, errors, shared: state === 0 ? Infinity : shared };
        }
    };
}

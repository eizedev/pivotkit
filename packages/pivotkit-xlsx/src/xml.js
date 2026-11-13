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
 *   out moves no value. Anything between rows that is no row, and what follows `</sheetData>` but
 *   for the root's end tag, is left out too: read-excel-file reads nothing there.
 * - `createXmlGuard`: whitespace runs cut and over-long tokens refused, so read-excel-file's parser
 *   gets no token that costs it quadratic time.
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
const COMMENT_START = ascii("<!--");
const COMMENT_END = ascii("-->");
const CDATA_START = ascii("<![CDATA[");
const CDATA_END = ascii("]]>");
const PI_END = ascii("?>");
const GT = ascii(">");
const ROW_END = ascii("</row>");
const CELL_END = ascii("</c>");
// an error cell's type; the byte before it is whitespace (searched without it: a row padded with
// spaces would make every byte a place to compare)
const ERROR_TYPE = ascii('t="e"');

/** Index of `pattern` in `buf[from, to)`, or -1. */
export function indexOf(buf, pattern, from = 0, to = buf.length) {
    const first = pattern[0];
    const last = to - pattern.length;
    // bounded, so a search for the first byte never runs past `to`
    const view = to < buf.length ? buf.subarray(0, to) : buf;
    for (let i = view.indexOf(first, from); i !== -1 && i <= last; i = view.indexOf(first, i + 1)) {
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
        // a declaration split between the last piece and this one is in their joint; the piece is
        // searched as it is, not copied (a piece can be megabytes)
        if (tail.length) search(concat(tail, chunk.subarray(0, 9)));
        search(chunk);
        tail = chunk.length >= 9 ? chunk.slice(chunk.length - 9) : concat(tail, chunk).slice(-9);
    };
    function search(buf) {
        // "!" is rare in a workbook's XML (comments, CDATA, text); "<" is in every tag
        for (let i = buf.indexOf(BANG, 1); i !== -1; i = buf.indexOf(BANG, i + 1)) {
            if (buf[i - 1] === LT && (wordAt(buf, i + 1, DOCTYPE) || wordAt(buf, i + 1, ENTITY))) {
                throw fileError("XML_DECLARATION", file, `the part "${part}" declares a document type or entities, which a workbook never needs; it is refused.`, { part });
            }
        }
    }
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

/**
 * A run of XML whitespace longer than this, in text or between a tag's attributes, is cut to this
 * length: four times the most characters an Excel cell holds (32,767), so no value Excel writes changes.
 */
export const SPACE_RUN = 128 * 1024;
/**
 * The longest text, tag, comment, CDATA section or processing instruction of an XML part handed to
 * read-excel-file, counted after whitespace runs are cut. An Excel cell holds at most 32,767
 * characters (at most about 300 KB as XML); a longer token is refused.
 */
export const MAX_TOKEN = 1024 * 1024;

const TEXT = 0;
const TAG = 1;
const OPENING = 2; // after "<", until it is clear whether a comment, a CDATA section or a tag starts
const MARKUP = 3; // a comment, a CDATA section or a processing instruction: ends at `ending`
const CDATA_HEAD = ascii("![CDATA[");
const COMMENT_HEAD = ascii("!--");
const isSpace = (b) => b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d;

/**
 * Passes an XML part on to `out`, piece by piece, with every run of whitespace in its text and
 * between a tag's attributes cut to SPACE_RUN bytes, and refuses (DAMAGED) a text, tag, comment,
 * CDATA section or processing instruction longer than MAX_TOKEN.
 *
 * read-excel-file parses a sheet in pieces; a token that is not finished at the end of a piece is
 * read again from its start with the next one, and it calls itself once per piece. A token of tens
 * of megabytes (a workbook a few dozen kilobytes small whose XML is padded with spaces) costs it
 * quadratic time, a gigabyte of memory and a stack overflow. Tokens it gets from here are short. The
 * scan follows what that parser takes as one token: a quoted attribute value is part of its tag
 * even with a ">" in it, a comment ends at "-->", a CDATA section at "]]>", a processing
 * instruction at "?>".
 * @param {{ write: (bytes: Uint8Array, from?: number, to?: number) => void }} out
 * @param {string} file  for messages
 * @param {string} part  for messages
 */
export function createXmlGuard(out, file, part) {
    let mode = TEXT;
    let quote = 0; // in a tag: the quote of the attribute value it is in, or 0
    let length = 0; // bytes of the current token passed on
    let spaces = 0; // whitespace bytes in a row, in text or in a tag outside quotes
    /** @type {number[]} */
    let head = []; // the bytes after "<" while OPENING
    // MARKUP ends at ">" after `close1` ("?", "-", "]"), and after `close2` before that unless it is 0
    let close1 = 0;
    let close2 = 0;
    let last1 = 0; // the last two bytes seen in MARKUP
    let last2 = 0;
    const tooLong = () =>
        fileError("DAMAGED", file, `the part "${part}" holds a text or tag of more than 1 MiB (an Excel cell holds at most 32,767 characters); the workbook is refused.`, { part });
    const startsAs = (word) => head.length <= word.length && head.every((b, k) => b === word[k]);
    /** Starts a comment, CDATA section or processing instruction that ends with `close` and ">". */
    const endMarkup = (close) => {
        close1 = close.at(-1) ?? 0;
        close2 = close.length > 1 ? close[0] : 0;
        // the end may overlap the start, as the parser's search for it does ("<!-->", "<?>")
        last1 = head.at(-1) ?? 0;
        last2 = head.at(-2) ?? 0;
        return MARKUP;
    };

    return {
        /**
         * @param {Uint8Array} bytes
         * @param {number} [from]
         * @param {number} [to]
         */
        write(bytes, from = 0, to = bytes.length) {
            // the state in locals while the loops run (a closure's variables are slower to reach)
            let m = mode;
            let q = quote;
            let sp = spaces;
            let len = length;
            // bounded, so a search for "<" never runs past `to`
            const view = to < bytes.length ? bytes.subarray(0, to) : bytes;
            let start = from; // the range not yet passed on
            let i = from;
            while (i < to) {
                if (m === TEXT) {
                    // most text is short ("<v>12</v>") or none ("><"): a few bytes by hand, then a search
                    let stop = i;
                    const near = Math.min(to, i + 16);
                    while (stop < near && bytes[stop] !== LT) stop++;
                    if (stop === near && near < to) {
                        const lt = view.indexOf(LT, near);
                        stop = lt === -1 ? to : lt;
                    }
                    if (sp + (stop - i) > SPACE_RUN) {
                        // a run may pass the cut: byte by byte
                        while (i < stop) {
                            const b = bytes[i];
                            if (b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d) {
                                if (sp === SPACE_RUN) {
                                    // past the cut: the rest of the run is left out
                                    if (start < i) out.write(bytes, start, i);
                                    while (i < stop && isSpace(bytes[i])) i++;
                                    start = i;
                                    continue;
                                }
                                sp++;
                            } else {
                                sp = 0;
                            }
                            i++;
                            if (++len > MAX_TOKEN) throw tooLong();
                        }
                    } else {
                        len += stop - i;
                        if (len > MAX_TOKEN) throw tooLong();
                        // the whitespace at the end of the text, where a run may go on in the next piece
                        let k = stop;
                        while (k > i && isSpace(bytes[k - 1])) k--;
                        sp = k === i ? sp + (stop - i) : stop - k;
                        i = stop;
                    }
                    if (i < to) {
                        // at "<": a tag, unless a comment, CDATA section or processing instruction starts
                        sp = 0;
                        len = 1;
                        i++;
                        if (i < to && bytes[i] !== BANG && bytes[i] !== 0x3f) {
                            m = TAG;
                            q = 0;
                        } else {
                            m = OPENING;
                            head = [];
                        }
                    }
                } else if (m === TAG) {
                    for (; i < to; i++) {
                        const b = bytes[i];
                        if (q !== 0) {
                            if (b === q) q = 0;
                        } else if (b === 0x3e) {
                            break;
                        } else if (b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d) {
                            if (sp === SPACE_RUN) {
                                if (start < i) out.write(bytes, start, i);
                                while (i < to && isSpace(bytes[i])) i++;
                                start = i;
                                i--;
                                continue;
                            }
                            sp++;
                        } else {
                            sp = 0;
                            if (b === 0x22 || b === 0x27) q = b;
                        }
                        if (++len > MAX_TOKEN) throw tooLong();
                    }
                    if (i < to) {
                        m = TEXT;
                        sp = 0;
                        len = 0;
                        i++;
                    }
                } else if (m === OPENING) {
                    const b = bytes[i++];
                    head.push(b);
                    if (++len > MAX_TOKEN) throw tooLong();
                    if (head.length === 1 && b === 0x3f) {
                        m = endMarkup([0x3f]); // <? ... ?>
                    } else if (head[0] === BANG && startsAs(COMMENT_HEAD)) {
                        if (head.length === COMMENT_HEAD.length) m = endMarkup([0x2d, 0x2d]);
                    } else if (head[0] === BANG && startsAs(CDATA_HEAD)) {
                        if (head.length === CDATA_HEAD.length) m = endMarkup([0x5d, 0x5d]);
                    } else {
                        // a tag: what was read of it so far may hold a quote or its end
                        m = TAG;
                        q = 0;
                        sp = 0;
                        for (const h of head) {
                            if (q !== 0) {
                                if (h === q) q = 0;
                            } else if (h === 0x22 || h === 0x27) {
                                q = h;
                            } else if (h === 0x3e) {
                                m = TEXT;
                                len = 0;
                                sp = 0;
                                break;
                            } else {
                                sp = isSpace(h) ? sp + 1 : 0;
                            }
                        }
                    }
                } else {
                    // MARKUP: a comment, a CDATA section or a processing instruction
                    for (; i < to; i++) {
                        const b = bytes[i];
                        if (++len > MAX_TOKEN) throw tooLong();
                        if (b === 0x3e && last1 === close1 && (close2 === 0 || last2 === close2)) {
                            m = TEXT;
                            len = 0;
                            i++;
                            break;
                        }
                        last2 = last1;
                        last1 = b;
                    }
                }
            }
            if (start < to) out.write(bytes, start, to);
            mode = m;
            quote = q;
            spaces = sp;
            length = len;
        }
    };
}

/**
 * Where the value of the attribute `r` of the tag in buf[from, stop) starts, or -1: after whitespace,
 * with whitespace around "=" and either quote, as an XML parser reads it; quoted values are skipped.
 */
function refAt(buf, from, stop) {
    for (let k = from; k < stop; k++) {
        const b = buf[k];
        if (b === 0x22 || b === 0x27) {
            k++;
            while (k < stop && buf[k] !== b) k++;
        } else if (isSpace(b) && buf[k + 1] === 0x72) {
            let q = k + 2;
            while (q < stop && isSpace(buf[q])) q++;
            if (q < stop && buf[q] === 0x3d) {
                q++;
                while (q < stop && isSpace(buf[q])) q++;
                if (q < stop && (buf[q] === 0x22 || buf[q] === 0x27)) {
                    q++;
                    while (q < stop && isSpace(buf[q])) q++;
                    return q;
                }
            }
        }
    }
    return -1;
}

/** Where the tag starting at buf[from] ends: its ">" outside quotes, a "<" (never in a tag), or `to`. */
function tagEndAt(buf, from, to) {
    for (let k = from; k < to; k++) {
        const b = buf[k];
        if (b === 0x3e || b === LT) return k;
        if (b === 0x22 || b === 0x27) {
            k++;
            while (k < to && buf[k] !== b && buf[k] !== LT) k++;
            if (buf[k] === LT) return k;
        }
    }
    return to;
}

/** The row number of a `<row ...>` tag (its `r` attribute), or 0. */
function rowNumber(buf, from, to) {
    const at = refAt(buf, from + 4, to);
    let n = 0;
    if (at !== -1) for (let k = at; k < to && buf[k] >= 0x30 && buf[k] <= 0x39 && n <= 1e12; k++) n = n * 10 + (buf[k] - 0x30);
    return n;
}

/** The largest row (or start of a sheet before its <sheetData>) the filter holds while it waits for its end. */
const MAX_PENDING = 64 * 1024 * 1024;
/** The size from which a row waiting for its end is squeezed by createXmlGuard. */
const SQUEEZE_AT = 1024 * 1024;
const CELL = ascii("<c");

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

/** The highest column (1 for A) and row of the cells' `r` attributes in buf[from, to). */
function cellExtent(buf, from, to) {
    let column = 0;
    let row = 0;
    for (let i = indexOf(buf, CELL, from, to); i !== -1; i = indexOf(buf, CELL, i + 2, to)) {
        if (!isSpace(buf[i + 2])) continue; // <col>, <cfRule>
        // each tag is scanned once, up to its end: the time stays linear in the row's length
        const stop = tagEndAt(buf, i + 1, to);
        let q = refAt(buf, i + 2, stop);
        if (q === -1) continue;
        let c = 0;
        for (; q < stop && ((buf[q] | 0x20) >= 0x61 && (buf[q] | 0x20) <= 0x7a) && c <= 1e7; q++) c = c * 26 + ((buf[q] | 0x20) - 0x60);
        let r = 0;
        for (; q < stop && buf[q] >= 0x30 && buf[q] <= 0x39 && r <= 1e12; q++) r = r * 10 + (buf[q] - 0x30);
        column = Math.max(column, c);
        row = Math.max(row, r);
    }
    return { column, row };
}

/**
 * Streams a sheet's XML and leaves out its rows without a value and everything after `</sheetData>`
 * but the last end tag (the root's): read-excel-file reads nothing there. Feed pieces with `push`; the
 * XML kept goes to `out.write`; `end()` gives the row numbers seen.
 *
 * It also checks where the values are against the limits, before read-excel-file sees them: the
 * parser makes a dense array of the sheet's extent (every row up to the last row with a value, each
 * as wide as the widest), so a value in row 1,000,000 or column XFD costs that much memory however
 * small the file is. A value beyond `maxRow` or `maxColumn`, or an extent of more than `maxCells`,
 * stops the read with LIMIT_EXCEEDED.
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
    /** After the sheet's data: the last end tag seen. */
    let closing = new Uint8Array(0);

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
            if (indexOf(buf, SHEET_DATA_END, lt, lt + SHEET_DATA_END.length) === lt) {
                out.write(buf, lt, lt + SHEET_DATA_END.length);
                state = 2;
                i = lt + SHEET_DATA_END.length;
                continue;
            }
            if (indexOf(buf, ROW, lt, lt + ROW.length) !== lt) {
                // anything else in sheetData (a comment, say) is left out: read-excel-file reads rows
                // only. A comment, CDATA section or processing instruction ends where the parser ends
                // it, so a row inside one stays out too.
                const close = buf[lt + 1] === 0x3f ? PI_END : indexOf(buf, COMMENT_START, lt, lt + 4) === lt ? COMMENT_END : indexOf(buf, CDATA_START, lt, lt + 9) === lt ? CDATA_END : GT;
                const end = indexOf(buf, close, lt + 1);
                if (end === -1) {
                    i = lt;
                    break;
                }
                i = end + close.length;
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
                for (let e = indexOf(buf, ERROR_TYPE, tagEnd, end); e !== -1; e = indexOf(buf, ERROR_TYPE, e + 1, end)) {
                    if (isSpace(buf[e - 1])) errors++;
                }
            } else {
                dropped++;
            }
            i = stop;
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
        /** @returns {{ lastRow: number, lastValueRow: number, dropped: number, errors: number }} */
        end() {
            pending = size ? gather() : new Uint8Array(0);
            waiting = [];
            run(true);
            if (pending.length) out.write(pending);
            if (closing.length) out.write(closing);
            return { lastRow, lastValueRow, dropped, errors };
        }
    };
}

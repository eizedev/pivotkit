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
 *   for the root's end tag, is left out too: read-excel-file reads nothing there. Tags, names and
 *   numbers are read as that parser reads them, with any namespace prefix (`<x:row>`).
 * - `createXmlGuard`: whitespace runs cut, over-long tokens and a "<" inside a tag refused, so
 *   read-excel-file's parser gets no token that costs it quadratic time and reads the same tags as
 *   the checks here.
 * - `createEntryCount`: the shared strings and formats counted, and the shared strings the sheet does
 *   not name left out, so a small file cannot make the parser keep millions of entries.
 *
 * Not part of the public API.
 */

import { fileError, limitError } from "pivotkit-core/import";

const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const LT = 0x3c;
const BANG = 0x21;
const DOCTYPE = ascii("DOCTYPE");
const ENTITY = ascii("ENTITY");
const COMMENT_START = ascii("<!--");
const COMMENT_END = ascii("-->");
const CDATA_START = ascii("<![CDATA[");
const CDATA_END = ascii("]]>");
const PI_END = ascii("?>");
const GT = ascii(">");

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

/** DAMAGED: the part `part` holds `what`. */
const damaged = (file, part, what) => fileError("DAMAGED", file, `the part "${part}" holds ${what}; the workbook is refused.`, { part });

/**
 * The longest text, tag, comment, CDATA section or processing instruction of an XML part handed to
 * read-excel-file, counted after whitespace runs are cut. An Excel cell holds at most 32,767
 * characters (at most about 300 KB as XML); a longer token is refused.
 */
export const MAX_TOKEN = 1024 * 1024;
/**
 * The longest tag: the parser reads a tag byte by byte in JavaScript, again from its start with every
 * piece, where it finds a text's end with a native search. A sheet's tags are a few dozen bytes.
 */
export const MAX_TAG = 256 * 1024;

const TEXT = 0;
const TAG = 1;
const OPENING = 2; // after "<", until it is clear whether a comment, a CDATA section or a tag starts
const MARKUP = 3; // a comment, a CDATA section or a processing instruction: ends at `ending`
const CDATA_HEAD = ascii("![CDATA[");
const COMMENT_HEAD = ascii("!--");
// whitespace as read-excel-file's parser (saxen) reads it: a space, and tab to carriage return
// (0x09-0x0D, form feed and vertical tab too), which ends a tag's name as a space does
const isSpace = (b) => b === 0x20 || (b > 0x08 && b < 0x0e);

/**
 * Passes an XML part on to `out`, piece by piece, with every run of whitespace in its text and
 * between a tag's attributes cut to SPACE_RUN bytes, and refuses (DAMAGED) a tag longer than MAX_TAG
 * and a text, comment, CDATA section or processing instruction longer than MAX_TOKEN.
 *
 * read-excel-file parses a sheet in pieces; a token that is not finished at the end of a piece is
 * read again from its start with the next one, and it calls itself once per piece. A token of tens
 * of megabytes (a workbook a few dozen kilobytes small whose XML is padded with spaces) costs it
 * quadratic time, a gigabyte of memory and a stack overflow. Tokens it gets from here are short. The
 * scan follows what that parser takes as one token: a quoted attribute value is part of its tag
 * even with a ">" in it, a comment ends at "-->", a CDATA section at "]]>", a processing
 * instruction at "?>". A "<" inside a tag, quoted or not, is refused (DAMAGED): XML allows none, and
 * the parser would read the tag on past it where the checks before it see a new tag.
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
        damaged(file, part, "a text of more than 1 MiB (an Excel cell holds at most 32,767 characters)");
    const tagTooLong = () => damaged(file, part, "a tag of more than 256 KiB");
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
                            if (isSpace(b)) {
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
                        if (b === LT) throw ltInTag(file, part);
                        if (q !== 0) {
                            if (b === q) q = 0;
                        } else if (b === 0x3e) {
                            break;
                        } else if (isSpace(b)) {
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
                        if (++len > MAX_TAG) throw tagTooLong();
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
                            if (h === LT) throw ltInTag(file, part);
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
 * How read-excel-file's parser (saxen) reads a tag, as the checks below must read it too: whatever
 * they read otherwise reaches the parser unchecked. Not part of the public API.
 *
 * - A tag ends at its first ">" outside quotes; a quoted value is skipped whole. XML allows no "<" in
 *   a tag, quoted or not, but the parser reads on past one; a tag with one is refused (`tagEnd`, and
 *   createXmlGuard for every part), so a "<" always starts the same tag here as there.
 * - A tag's name is read without its prefix up to the first ":" (`<x:row>` is a row); an attribute's
 *   too, again until no prefix is left (`x:r`, `x:y:r` and `xmlns:a:r` are r; `xmlns:r` is not).
 * - Attributes are read as the parser reads them (`eachAttr`); a value with an entity counts as the
 *   worst it could be (`plainValue`).
 */

/** A "<" in a tag: the workbook is refused. */
const ltInTag = (file, part) => damaged(file, part, 'a "<" in a tag');

/** Whether a byte ends a tag's name. */
const endsName = (b) => b === 0x3e || b === 0x2f || b === LT || isSpace(b);

/**
 * The tag at buf[lt] ("<name" or "</name"): where its name starts, where it starts without its
 * prefix, and where it ends (buf.length while the name goes on past `buf`).
 */
function tagName(buf, lt) {
    const start = buf[lt + 1] === 0x2f ? lt + 2 : lt + 1;
    let local = start;
    let end = start;
    while (end < buf.length && !endsName(buf[end])) {
        if (buf[end] === 0x3a && local === start) local = end + 1;
        end++;
    }
    return [start, local, end];
}

/** Whether buf[start, end) is `word`. */
const isWord = (buf, start, end, word) => end - start === word.length && word.every((b, k) => buf[start + k] === b);

/**
 * Where the tag (or `<!...>` markup) starting at buf[lt] ends, its ">" as the parser finds it (quoted
 * values skipped whole), or -1 while `buf` ends first. Throws at a "<" in it.
 */
function tagEnd(buf, lt, file, part) {
    for (let k = lt + 1, q = 0; k < buf.length; k++) {
        const b = buf[k];
        if (b === LT) throw ltInTag(file, part);
        if (q) {
            if (b === q) q = 0; // the end of a quoted value
        } else if (b === 0x3e) {
            return k;
        } else if (b === 0x22 || b === 0x27) {
            q = b;
        }
    }
    return -1;
}

/** What ends the comment, CDATA section, processing instruction or other markup starting at buf[at]. */
const markupClose = (buf, at) => (buf[at + 1] === 0x3f ? PI_END : indexOf(buf, COMMENT_START, at, at + 4) === at ? COMMENT_END : indexOf(buf, CDATA_START, at, at + 9) === at ? CDATA_END : GT);

/**
 * Where the comment, CDATA section, processing instruction or other markup starting at buf[at] ("<!"
 * or "<?") ends, where the parser ends it (just after its "-->", "]]>", "?>" or ">"), or -1 if not in
 * `buf`. Other markup (`<!x ...>`) ends as a tag ends.
 */
function markupEnd(buf, at, file, part) {
    const close = markupClose(buf, at);
    const end = close === GT ? tagEnd(buf, at, file, part) : indexOf(buf, close, at + 1);
    return end === -1 ? -1 : end + close.length;
}

/** Whether the "<" at buf[lt] starts markup (a comment, CDATA section, processing instruction). */
const isMarkup = (buf, lt) => buf[lt + 1] === BANG || buf[lt + 1] === 0x3f;

/** Just after the tag or markup starting at buf[lt], as the parser reads it; -1 while it goes on past `buf`. */
function tokenEnd(buf, lt, file, part) {
    if (isMarkup(buf, lt)) return markupEnd(buf, lt, file, part);
    const end = tagEnd(buf, lt, file, part);
    return end === -1 ? -1 : end + 1;
}

/** A byte the parser takes in an attribute's name. */
const isNameByte = (w) => (w > 0x60 && w < 0x7b) || (w > 0x40 && w < 0x5b) || (w > 0x2f && w < 0x3b) || w === 0x2e || w === 0x2d || w === 0x5f;
const XMLNS = ascii("xmlns");

/**
 * Calls `each(local, nameEnd, from, to)` for every attribute the parser (saxen) reads in buf[from, to)
 * (a start tag after its name, without its ">" or "/>"), skipping what it skips: a name of letters,
 * digits and ".-_:" right before "=", its value quoted right after, whitespace after the value.
 * `local` is where the name starts without its prefixes, as read-excel-file leaves them out: after
 * a ":" but that of a leading "xmlns:", again until none is left. The parser keeps the first of two attributes with one name and
 * read-excel-file the last with one local name, so callers take every one into account.
 */
function eachAttr(buf, from, to, each) {
    // a port of saxen's getAttrs(), byte by byte; a character it reads beyond the string is none
    parse: for (let i = from; i < to; i++) {
        let skip = false;
        let w = buf[i];
        // (saxen also skips a name that starts with a digit, "." or "-": read here, it counts too)
        if (isSpace(w)) continue;
        let j = i + 1;
        for (; j < to; j++) {
            w = buf[j];
            if (isNameByte(w)) continue;
            if (isSpace(w)) {
                i = j;
                continue parse;
            }
            if (w === 0x3d) break;
            skip = true;
        }
        const name = i;
        const nameEnd = j;
        let value = -1;
        w = j + 1 < to ? buf[j + 1] : -1;
        if (w === 0x22 || w === 0x27) {
            value = j + 2;
            j = buf.subarray(0, to).indexOf(w, value);
            if (j === -1) {
                j = buf.subarray(0, to).indexOf(w === 0x22 ? 0x27 : 0x22, value);
                if (j !== -1) skip = true;
            }
        } else {
            skip = true;
            for (j++; j < to; j++) if (j + 1 < to && isSpace(buf[j + 1])) break;
        }
        if (j === -1) {
            j = to;
            skip = true;
        }
        const valueEnd = j;
        i = j;
        for (; j + 1 < to; j++) {
            if (isSpace(buf[j + 1])) break;
            if (i === j) skip = true;
        }
        i = j + 1;
        if (skip) continue;
        // read-excel-file writes a name without its prefix back into the attributes it is going
        // through, where a later one may be trimmed again (x:y:r gives y:r, then r): trimmed until
        // nothing changes
        let local = name;
        for (let from = -1; from !== local; ) {
            from = local;
            for (let k = from; k < nameEnd; k++) {
                if (buf[k] === 0x3a && !(k - from === 5 && isWord(buf, from, k, XMLNS))) {
                    local = k + 1;
                    break;
                }
            }
        }
        each(local, nameEnd, value, valueEnd);
    }
}

/**
 * The text of an attribute's value buf[from, to) as read-excel-file reads it, or null where it is
 * not plain: an entity (read-excel-file decodes them, a prefixed one maybe twice), a byte beyond
 * ASCII, or more than 64 bytes. Excel writes none of them in an `r` or a `t`; the checks take the
 * worst for them.
 */
function plainValue(buf, from, to) {
    if (to - from > 64) return null;
    let s = "";
    for (let k = from; k < to; k++) {
        if (buf[k] === 0x26 || buf[k] > 0x7f) return null;
        s += String.fromCharCode(buf[k]);
    }
    return s;
}

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
 * it ends (just after its end tag), whether a cell has content (an end tag `c`), the highest column
 * and row of its cells' `r` and of the `r` of a row inside it (the parser reads one as a row), the
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
                // a cell
                open = false;
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
 * stops the read with LIMIT_EXCEEDED. Tags, names and numbers are read as the parser reads them (see
 * above): with any namespace prefix; what the filter passes on is only rows it read whole, and a row
 * the sheet does not end is left out.
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

const ENTRY_NAMES = ["si", "xf", "numFmt"].map(ascii);
/**
 * Passes the shared strings or the styles of a workbook on to `out` and counts what read-excel-file
 * keeps one entry of each for: string items (`<si>`), cell formats (`<xf>`) and number formats
 * (`<numFmt>`), with a namespace prefix (`<x:si>`) too, in either part; comments, CDATA sections and
 * processing instructions are skipped as the parser skips them. More than `max` in all the parts
 * counted with one `total` stop the read with LIMIT_EXCEEDED, before the parser makes millions of
 * entries from a small file. Of the string items only the first `keep` go on (the strings the sheet's
 * cells name; Infinity for the styles): the rest is left out and the root's end tag (`</sst>`,
 * `</x:sst>`) ends the part.
 * @param {{ write: (bytes: Uint8Array, from?: number, to?: number) => void }} out
 * @param {{ file: string, part: string, keep: number, max: number, total: { count: number } }} options
 */
export function createEntryCount(out, { file, part, keep, max, total }) {
    let carry = new Uint8Array(0); // held back: a tag or markup start that goes on in the next piece
    /** @type {Uint8Array | null} */
    let close = null; // in a comment, CDATA section or processing instruction: its end
    let items = 0;
    let cut = false;
    /** @type {Uint8Array | null} */
    let root = null; // the root element's name as written (`sst`, `x:sst`): the end tag after a cut
    /** Passes buf on up to where it must wait for more (returned), or up to the cut (-1). */
    const scan = (buf, final) => {
        let i = 0;
        while (i < buf.length) {
            if (close) {
                const end = indexOf(buf, close, i);
                if (end === -1) return final ? buf.length : Math.max(i, buf.length - close.length + 1);
                i = end + close.length;
                close = null;
                continue;
            }
            const lt = buf.indexOf(LT, i);
            if (lt === -1) return buf.length;
            if (buf[lt + 1] === BANG || buf[lt + 1] === 0x3f) {
                if (!final && lt + 9 > buf.length) return lt;
                close = markupClose(buf, lt);
                i = lt + 1;
                continue;
            }
            // the tag's name, after its prefix
            const [, local, j] = tagName(buf, lt);
            if (j - lt > MAX_TAG) throw damaged(file, part, "a tag of more than 256 KiB");
            if (j === buf.length && !final) return lt;
            if (!root && buf[lt + 1] !== 0x2f) root = buf.slice(lt + 1, j);
            const name = ENTRY_NAMES.find((n) => n.length === j - local && n.every((b, k) => buf[local + k] === b));
            if (name && buf[j] !== LT && buf[lt + 1] !== 0x2f) {
                if (++total.count > max) throw limitError("importCells", total.count, max, file, "shared strings and formats");
                if (name === ENTRY_NAMES[0] && ++items > keep) {
                    out.write(buf, 0, lt);
                    cut = true;
                    return -1;
                }
            }
            i = j;
        }
        return buf.length;
    };
    const push = (buf, final) => {
        if (cut) return;
        if (carry.length) buf = concat(carry, buf);
        const pass = scan(buf, final);
        if (pass > 0) out.write(buf, 0, pass);
        carry = pass === -1 ? carry : buf.slice(pass);
    };
    return {
        /** @param {Uint8Array} chunk */
        write: (chunk) => push(chunk, false),
        /** Passes the held bytes on, or ends the part after the cut. */
        end() {
            push(new Uint8Array(0), true);
            if (cut && root) out.write(concat(concat(ascii("</"), root), GT));
        }
    };
}

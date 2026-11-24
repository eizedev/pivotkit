/*
 * The attributes of a tag as read-excel-file's parser (saxen) reads them: a port of its getAttrs(),
 * byte by byte, and the text of a value as read-excel-file reads it. See xml-tags.js for how the
 * parser reads a tag.
 *
 * Not part of the public API.
 */

import { ascii, isSpace, isWord } from "./xml-bytes.js";

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
export function eachAttr(buf, from, to, each) {
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
export function plainValue(buf, from, to) {
    if (to - from > 64) return null;
    let s = "";
    for (let k = from; k < to; k++) {
        if (buf[k] === 0x26 || buf[k] > 0x7f) return null;
        s += String.fromCharCode(buf[k]);
    }
    return s;
}

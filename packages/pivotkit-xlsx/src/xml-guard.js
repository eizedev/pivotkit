/*
 * The guard every XML part passes before read-excel-file sees it: whitespace runs cut, over-long
 * tokens and a "<" inside a tag refused, so read-excel-file's parser gets no token that costs it
 * quadratic time and reads the same tags as the checks of the sheet filter and the entry count.
 *
 * Not part of the public API.
 */

import { BANG, LT, ascii, damaged, isSpace, ltInTag } from "./xml-bytes.js";

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

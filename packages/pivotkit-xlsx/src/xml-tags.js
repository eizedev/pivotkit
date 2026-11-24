/*
 * How read-excel-file's parser (saxen) reads a tag, as the sheet filter and the entry count must read
 * it too: whatever they read otherwise reaches the parser unchecked. Not part of the public API.
 *
 * - A tag ends at its first ">" outside quotes; a quoted value is skipped whole. XML allows no "<" in
 *   a tag, quoted or not, but the parser reads on past one; a tag with one is refused (`tagEnd`, and
 *   createXmlGuard for every part), so a "<" always starts the same tag here as there.
 * - A tag's name is read without its prefix up to the first ":" (`<x:row>` is a row); an attribute's
 *   too, again until no prefix is left (`x:r`, `x:y:r` and `xmlns:a:r` are r; `xmlns:r` is not).
 * - Attributes are read as the parser reads them (`eachAttr` in xml-attributes.js); a value with an
 *   entity counts as the worst it could be (`plainValue`).
 */

import { BANG, GT, LT, ascii, indexOf, isSpace, ltInTag } from "./xml-bytes.js";

const COMMENT_START = ascii("<!--");
const COMMENT_END = ascii("-->");
const CDATA_START = ascii("<![CDATA[");
const CDATA_END = ascii("]]>");
const PI_END = ascii("?>");

/** Whether a byte ends a tag's name. */
const endsName = (b) => b === 0x3e || b === 0x2f || b === LT || isSpace(b);

/**
 * The tag at buf[lt] ("<name" or "</name"): where its name starts, where it starts without its
 * prefix, and where it ends (buf.length while the name goes on past `buf`).
 */
export function tagName(buf, lt) {
    const start = buf[lt + 1] === 0x2f ? lt + 2 : lt + 1;
    let local = start;
    let end = start;
    while (end < buf.length && !endsName(buf[end])) {
        if (buf[end] === 0x3a && local === start) local = end + 1;
        end++;
    }
    return [start, local, end];
}

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
export const markupClose = (buf, at) => (buf[at + 1] === 0x3f ? PI_END : indexOf(buf, COMMENT_START, at, at + 4) === at ? COMMENT_END : indexOf(buf, CDATA_START, at, at + 9) === at ? CDATA_END : GT);

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
export const isMarkup = (buf, lt) => buf[lt + 1] === BANG || buf[lt + 1] === 0x3f;

/** Just after the tag or markup starting at buf[lt], as the parser reads it; -1 while it goes on past `buf`. */
export function tokenEnd(buf, lt, file, part) {
    if (isMarkup(buf, lt)) return markupEnd(buf, lt, file, part);
    const end = tagEnd(buf, lt, file, part);
    return end === -1 ? -1 : end + 1;
}

/*
 * The check of a workbook's XML parts, on their bytes, before read-excel-file sees them: no document
 * type declaration and no entity declaration (`<!DOCTYPE`, `<!ENTITY`). An .xlsx never needs either;
 * refusing them rules out entity expansion and external entities whatever the XML parser does with
 * them.
 *
 * The other checks and trims of the XML parts are in their own modules: the guard against costly
 * tokens (xml-guard.js), the sheet filter (sheet-filter.js) and the count of shared strings and
 * formats (entry-count.js).
 *
 * Not part of the public API.
 */

import { fileError } from "pivotkit-core/import";
import { BANG, LT, ascii, concat } from "./xml-bytes.js";

const DOCTYPE = ascii("DOCTYPE");
const ENTITY = ascii("ENTITY");

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

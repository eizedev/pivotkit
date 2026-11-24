/*
 * The count of entries: the shared strings and formats counted, and the shared strings the sheet does
 * not name left out, so a small file cannot make the parser keep millions of entries.
 *
 * Not part of the public API.
 */

import { limitError } from "pivotkit-core/import";
import { BANG, GT, LT, ascii, concat, damaged, indexOf } from "./xml-bytes.js";
import { MAX_TAG } from "./xml-guard.js";
import { markupClose, tagName } from "./xml-tags.js";

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

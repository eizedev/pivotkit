/*
 * What the XML checks of a workbook share: byte constants, searches over bytes, how
 * read-excel-file's parser (saxen) reads whitespace, and the refusal of a damaged part.
 *
 * Not part of the public API.
 */

import { fileError } from "pivotkit-core/import";

export const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
export const LT = 0x3c;
export const BANG = 0x21;
export const GT = ascii(">");

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

export function concat(a, b) {
    const out = new Uint8Array(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return out;
}

// whitespace as read-excel-file's parser (saxen) reads it: a space, and tab to carriage return
// (0x09-0x0D, form feed and vertical tab too), which ends a tag's name as a space does
export const isSpace = (b) => b === 0x20 || (b > 0x08 && b < 0x0e);

/**
 * DAMAGED: the part `part` holds `what`.
 * @returns {import("pivotkit-core").PivotkitError}
 */
export const damaged = (file, part, what) => fileError("DAMAGED", file, `the part "${part}" holds ${what}; the workbook is refused.`, { part });

/**
 * A "<" in a tag: the workbook is refused.
 * @returns {import("pivotkit-core").PivotkitError}
 */
export const ltInTag = (file, part) => damaged(file, part, 'a "<" in a tag');

/** Whether buf[start, end) is `word`. */
export const isWord = (buf, start, end, word) => end - start === word.length && word.every((b, k) => buf[start + k] === b);

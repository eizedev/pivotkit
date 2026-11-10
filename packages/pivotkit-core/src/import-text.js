/*
 * Bytes of a text file as text: the encoding from a byte order mark, else strict UTF-8, else
 * Windows-1252 (Excel's "CSV" on a Western Windows), so invalid bytes switch the encoding instead of
 * becoming replacement characters. Files that are no text (a workbook, a PDF, binary data) are refused
 * with what they look like. Part of pivotkit-core/import; not part of the public API.
 */

import { fileError } from "./import-table.js";

/** What a file is by its first bytes, for the files a text reader is handed by mistake. */
const SIGNATURES = [
    { bytes: [0x50, 0x4b, 0x03, 0x04], what: "a ZIP archive (an Excel workbook .xlsx is one); load it with a spreadsheet reader, or save it as CSV" },
    { bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], what: "an old Excel workbook (.xls) or a password-protected file; save it as .xlsx or CSV" },
    { bytes: [0x25, 0x50, 0x44, 0x46], what: "a PDF document" },
    { bytes: [0x1f, 0x8b], what: "a gzip archive; unpack it first" }
];

const startsWith = (bytes, sig) => sig.every((b, i) => bytes[i] === b);

/** True when the bytes look like UTF-16 little endian without a byte order mark: ASCII with a zero byte after each character. */
function looksUtf16le(bytes) {
    const n = Math.min(bytes.length, 4096) & ~1;
    if (n < 8) return false;
    let zeros = 0;
    for (let i = 1; i < n; i += 2) {
        if (bytes[i] === 0 && bytes[i - 1] !== 0) zeros++;
    }
    return zeros > n / 2 * 0.9;
}

/**
 * The text of a file's bytes, and the encoding it was read in.
 * @param {Uint8Array} bytes
 * @param {string} file  for messages
 * @returns {{ text: string, encoding: string }}
 */
export function decodeText(bytes, file) {
    for (const sig of SIGNATURES) {
        if (startsWith(bytes, sig.bytes)) {
            throw fileError("WRONG_TYPE", file, `this is ${sig.what}, not text.`);
        }
    }
    let encoding;
    let start = 0;
    if (startsWith(bytes, [0xef, 0xbb, 0xbf])) {
        encoding = "utf-8";
        start = 3;
    } else if (startsWith(bytes, [0xff, 0xfe])) {
        encoding = "utf-16le";
        start = 2;
    } else if (startsWith(bytes, [0xfe, 0xff])) {
        encoding = "utf-16be";
        start = 2;
    } else if (looksUtf16le(bytes)) {
        encoding = "utf-16le";
    }
    const body = bytes.subarray(start);
    let text;
    if (encoding) {
        text = new TextDecoder(encoding, { fatal: false, ignoreBOM: true }).decode(body);
    } else {
        try {
            text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body);
            encoding = "utf-8";
        } catch {
            text = new TextDecoder("windows-1252", { ignoreBOM: true }).decode(body);
            encoding = "windows-1252";
        }
    }
    // a zero character does not occur in text: the file is binary (or in an encoding not read here)
    const zero = text.indexOf("\0");
    if (zero !== -1 && zero < text.length - 1) {
        throw fileError("BINARY", file, "this file holds binary data, not text.");
    }
    return { text: zero === -1 ? text : text.slice(0, zero), encoding: ENCODING_NAMES[encoding] };
}

const ENCODING_NAMES = { "utf-8": "UTF-8", "utf-16le": "UTF-16 (little endian)", "utf-16be": "UTF-16 (big endian)", "windows-1252": "Windows-1252" };

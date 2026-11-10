/*
 * The ZIP container of an .xlsx file, read and checked by pivotkit-xlsx itself before any XML reaches
 * read-excel-file:
 *
 * - the directory at the end of the file is read first: the number of parts (`limits.archiveEntries`)
 *   and the size they unpack to (`limits.unpackedBytes`) are checked before anything is unpacked, so a
 *   ZIP bomb is refused before it costs memory;
 * - a part is unpacked into a buffer of the size the directory states, never more: a part that
 *   unpacks to more than it claims stops the read;
 * - encrypted parts and unknown compression methods are refused.
 *
 * Not part of the public API.
 */

import { Inflate } from "fflate";
import { fileError } from "pivotkit-core/import";

const EOCD = 0x06054b50;
const EOCD64_LOCATOR = 0x07064b50;
const EOCD64 = 0x06064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
/** Compressed bytes pushed to the inflater at a time: one push unpacks to at most about 1,000 times this. */
const PUSH_BYTES = 16_384;

/**
 * @typedef {object} ZipEntry
 * @property {string} name
 * @property {number} method  0 stored, 8 deflated
 * @property {number} compressedSize
 * @property {number} size  unpacked, as the directory states
 * @property {number} localOffset
 */

const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const u64 = (b, i) => u32(b, i) + u32(b, i + 4) * 2 ** 32;

/**
 * The entries of a ZIP file's central directory, checked against the limits.
 * @param {Uint8Array} bytes
 * @param {string} file  for messages
 * @param {{ archiveEntries: number, unpackedBytes: number }} limits
 * @returns {ZipEntry[]}
 */
export function readDirectory(bytes, file, limits) {
    const broken = (what) => fileError("DAMAGED", file, `the workbook is damaged or cut off (${what}); open it in Excel and save it again.`);
    let end = -1;
    for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 65_557; i--) {
        if (u32(bytes, i) === EOCD) {
            end = i;
            break;
        }
    }
    if (end < 0) throw broken("no ZIP directory");
    let count = u16(bytes, end + 10);
    let size = u32(bytes, end + 12);
    let offset = u32(bytes, end + 16);
    if ((count === 0xffff || offset === 0xffffffff || size === 0xffffffff) && end >= 20 && u32(bytes, end - 20) === EOCD64_LOCATOR) {
        const at = u64(bytes, end - 12);
        if (at + 56 > bytes.length || u32(bytes, at) !== EOCD64) throw broken("ZIP64 directory");
        count = u64(bytes, at + 32);
        size = u64(bytes, at + 40);
        offset = u64(bytes, at + 48);
    }
    if (count > limits.archiveEntries) {
        throw fileError("LIMIT", file, `the workbook has ${count.toLocaleString("en-US")} parts, more than ${limits.archiveEntries.toLocaleString("en-US")} (limits.archiveEntries).`, { limit: "archiveEntries", value: count, max: limits.archiveEntries });
    }
    if (offset + size > bytes.length) throw broken("directory outside the file");
    /** @type {ZipEntry[]} */
    const entries = [];
    let total = 0;
    let p = offset;
    const text = new TextDecoder();
    for (let k = 0; k < count; k++) {
        if (p + 46 > bytes.length || u32(bytes, p) !== CENTRAL) throw broken("directory entry");
        const flags = u16(bytes, p + 8);
        const method = u16(bytes, p + 10);
        let compressedSize = u32(bytes, p + 20);
        let unpacked = u32(bytes, p + 24);
        const nameLength = u16(bytes, p + 28);
        const extraLength = u16(bytes, p + 30);
        const commentLength = u16(bytes, p + 32);
        let localOffset = u32(bytes, p + 42);
        const name = text.decode(bytes.subarray(p + 46, p + 46 + nameLength));
        // ZIP64: the sizes and the offset that do not fit 32 bits are in the extra field 0x0001
        let e = p + 46 + nameLength;
        const extraEnd = e + extraLength;
        while (e + 4 <= extraEnd) {
            const id = u16(bytes, e);
            const len = u16(bytes, e + 2);
            if (id === 0x0001) {
                let q = e + 4;
                if (unpacked === 0xffffffff) (unpacked = u64(bytes, q)), (q += 8);
                if (compressedSize === 0xffffffff) (compressedSize = u64(bytes, q)), (q += 8);
                if (localOffset === 0xffffffff) localOffset = u64(bytes, q);
            }
            e += 4 + len;
        }
        if (flags & 1) {
            throw fileError("ENCRYPTED", file, "the workbook is encrypted; save it without a password, then load it.");
        }
        if (method !== 0 && method !== 8) {
            throw fileError("DAMAGED", file, `a part of the workbook uses compression method ${method}, which is not read; save it again in Excel.`);
        }
        total += unpacked;
        if (total > limits.unpackedBytes) {
            throw fileError("LIMIT", file, `the workbook unpacks to more than ${limits.unpackedBytes.toLocaleString("en-US")} bytes (limits.unpackedBytes): a ZIP bomb, or a workbook too large to load.`, { limit: "unpackedBytes", value: total, max: limits.unpackedBytes });
        }
        entries.push({ name, method, compressedSize, size: unpacked, localOffset });
        p = extraEnd + commentLength;
    }
    return entries;
}

/** Where an entry's data starts and ends, from its local header. */
function dataRange(bytes, entry, file) {
    const at = entry.localOffset;
    if (at + 30 > bytes.length || u32(bytes, at) !== LOCAL) {
        throw fileError("DAMAGED", file, `the workbook is damaged (part "${entry.name}"); open it in Excel and save it again.`);
    }
    const start = at + 30 + u16(bytes, at + 26) + u16(bytes, at + 28);
    const end = start + entry.compressedSize;
    if (end > bytes.length) {
        throw fileError("DAMAGED", file, `the workbook is cut off (part "${entry.name}"); load the whole file.`);
    }
    return [start, end];
}

/**
 * Unpacks an entry, streaming: `onChunk` gets each piece of the unpacked bytes. More bytes than the
 * directory states stop it with an error.
 * @param {Uint8Array} bytes
 * @param {ZipEntry} entry
 * @param {string} file
 * @param {(chunk: Uint8Array) => void} onChunk
 * @param {() => Promise<void> | void} [between]  called between pushes (abort checks, progress)
 */
export async function unpackStream(bytes, entry, file, onChunk, between) {
    const [start, end] = dataRange(bytes, entry, file);
    let produced = 0;
    const take = (chunk) => {
        produced += chunk.length;
        if (produced > entry.size) {
            throw fileError("DAMAGED", file, `the part "${entry.name}" unpacks to more than the ${entry.size.toLocaleString("en-US")} bytes its directory states: a damaged or forged workbook.`);
        }
        if (chunk.length > 0) onChunk(chunk);
    };
    if (entry.method === 0) {
        for (let at = start; at < end; at += 1 << 20) {
            take(bytes.subarray(at, Math.min(end, at + (1 << 20))));
            await between?.();
        }
    } else {
        const inflater = new Inflate((chunk) => take(chunk));
        for (let at = start; at < end; at += PUSH_BYTES) {
            const stop = Math.min(end, at + PUSH_BYTES);
            try {
                inflater.push(bytes.subarray(at, stop), stop === end);
            } catch (error) {
                if (/** @type {any} */ (error)?.code === undefined || typeof (/** @type {any} */ (error).code) !== "number") throw error;
                throw fileError("DAMAGED", file, `the part "${entry.name}" cannot be unpacked; the workbook is damaged or cut off.`);
            }
            await between?.();
        }
    }
    if (produced !== entry.size) {
        throw fileError("DAMAGED", file, `the part "${entry.name}" unpacks to ${produced.toLocaleString("en-US")} bytes, not the ${entry.size.toLocaleString("en-US")} its directory states; the workbook is damaged.`);
    }
}

/**
 * Unpacks an entry into one buffer of the size the directory states.
 * @returns {Promise<Uint8Array>}
 */
export async function unpack(bytes, entry, file, between) {
    const out = new Uint8Array(entry.size);
    let at = 0;
    await unpackStream(bytes, entry, file, (chunk) => {
        out.set(chunk, at);
        at += chunk.length;
    }, between);
    return out;
}

const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
    }
    return t;
})();

/** CRC-32 of bytes, continued from `crc` (start with 0). */
export function crc32(bytes, crc = 0, from = 0, to = bytes.length) {
    let c = ~crc;
    for (let i = from; i < to; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return ~c >>> 0;
}

/**
 * Writes a ZIP without compression into one growing buffer: what read-excel-file gets, so it
 * unpacks nothing (no worker) and the sheet's XML is copied once, while it streams in.
 */
export function createStoredZip(initial = 1 << 20) {
    let buf = new Uint8Array(initial);
    let length = 0;
    const central = [];
    const reserve = (n) => {
        if (length + n <= buf.length) return;
        let size = Math.ceil(buf.length * 1.5);
        while (size < length + n) size = Math.ceil(size * 1.5);
        const grown = new Uint8Array(size);
        grown.set(buf.subarray(0, length));
        buf = grown;
    };
    const put16 = (at, v) => {
        buf[at] = v & 0xff;
        buf[at + 1] = (v >>> 8) & 0xff;
    };
    const put32 = (at, v) => {
        put16(at, v & 0xffff);
        put16(at + 2, v >>> 16);
    };
    return {
        /** Starts a part; `write` its bytes, then `end()`. */
        begin(path) {
            const name = new TextEncoder().encode(path);
            reserve(30 + name.length);
            const header = length;
            put32(header, LOCAL);
            put16(header + 4, 20);
            buf.fill(0, header + 6, header + 26);
            put16(header + 26, name.length);
            put16(header + 28, 0);
            buf.set(name, header + 30);
            length += 30 + name.length;
            const start = length;
            let crc = 0;
            return {
                write(bytes, from = 0, to = bytes.length) {
                    reserve(to - from);
                    buf.set(bytes.subarray(from, to), length);
                    crc = crc32(bytes, crc, from, to);
                    length += to - from;
                },
                end() {
                    const size = length - start;
                    if (size > 0xfffffffe) throw new RangeError("a stored part over 4 GiB");
                    put32(header + 14, crc);
                    put32(header + 18, size);
                    put32(header + 22, size);
                    central.push({ name, crc, size, offset: header });
                }
            };
        },
        add(path, bytes) {
            const part = this.begin(path);
            part.write(bytes);
            part.end();
        },
        /** The finished ZIP (a view of the buffer). */
        finish() {
            const at = length;
            for (const e of central) {
                reserve(46 + e.name.length);
                put32(length, CENTRAL);
                put16(length + 4, 20);
                put16(length + 6, 20);
                buf.fill(0, length + 8, length + 46);
                put32(length + 16, e.crc);
                put32(length + 20, e.size);
                put32(length + 24, e.size);
                put16(length + 28, e.name.length);
                put32(length + 42, e.offset);
                buf.set(e.name, length + 46);
                length += 46 + e.name.length;
            }
            reserve(22);
            put32(length, EOCD);
            buf.fill(0, length + 4, length + 22);
            put16(length + 8, central.length);
            put16(length + 10, central.length);
            put32(length + 12, length - at);
            put32(length + 16, at);
            length += 22;
            return buf.subarray(0, length);
        }
    };
}

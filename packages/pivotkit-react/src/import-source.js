/*
 * The identity of a loaded file, for the saved views of the browser store and the view files: its
 * name and a hash of its name and column names (source.id = name + "#" + the first 16 hex digits of
 * the SHA-256 of the name and the column names, joined with U+0000), the scheme PowerShell
 * Universal's upload demo uses. The same file loaded again finds its views; a file with other or
 * reordered columns is other data. The name shown is cut to SHOWN_MAX characters, never inside a
 * character outside the BMP.
 *
 * SHA-256 is the browser's (crypto.subtle) where the page has it; a page served over plain http on
 * another host than localhost has no crypto.subtle, so a small implementation of its own stands in
 * (FIPS 180-4; tested against Node's). Loaded with the import UI. Pure.
 */

/** Characters of a file name in the source id and the report's source line. */
export const SHOWN_MAX = 120;

/**
 * The name as the report shows it: at most SHOWN_MAX characters, cut with "...".
 * @param {string} name
 */
export function shownName(name) {
    if (name.length <= SHOWN_MAX) {
        return name;
    }
    let cut = SHOWN_MAX - 3;
    const code = name.charCodeAt(cut - 1);
    if (code >= 0xd800 && code <= 0xdbff) {
        cut -= 1;
    }
    return `${name.slice(0, cut)}...`;
}

const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
    0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

/**
 * SHA-256 of bytes, in JavaScript (where crypto.subtle is missing).
 * @param {Uint8Array} bytes
 * @returns {Uint8Array}
 */
export function sha256Bytes(bytes) {
    const bits = bytes.length * 8;
    // the message, a 1 bit, zeros to 56 mod 64 bytes, the length in bits as 64 bits big endian
    const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, Math.floor(bits / 2 ** 32));
    view.setUint32(padded.length - 4, bits >>> 0);
    const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const w = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let at = 0; at < padded.length; at += 64) {
        for (let i = 0; i < 16; i++) {
            w[i] = view.getUint32(at + i * 4);
        }
        for (let i = 16; i < 64; i++) {
            const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }
        let [a, b, c, d, e, f, g, hh] = h;
        for (let i = 0; i < 64; i++) {
            const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
            const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
            hh = g;
            g = f;
            f = e;
            e = (d + t1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (t1 + t2) >>> 0;
        }
        h[0] += a;
        h[1] += b;
        h[2] += c;
        h[3] += d;
        h[4] += e;
        h[5] += f;
        h[6] += g;
        h[7] += hh;
    }
    const out = new Uint8Array(32);
    const outView = new DataView(out.buffer);
    h.forEach((v, i) => outView.setUint32(i * 4, v));
    return out;
}

/**
 * SHA-256 of a text (UTF-8) as lower-case hex: the browser's crypto.subtle where there is one.
 * @param {string} text
 * @param {{ subtle?: SubtleCrypto | null }} [options]  `subtle: null` uses the own implementation (tests)
 * @returns {Promise<string>}
 */
export async function sha256Hex(text, options = {}) {
    const bytes = new TextEncoder().encode(text);
    const subtle = options.subtle !== undefined ? options.subtle : globalThis.crypto?.subtle;
    let digest;
    try {
        digest = subtle ? new Uint8Array(await subtle.digest("SHA-256", bytes)) : sha256Bytes(bytes);
    } catch {
        // a browser that refuses digest() here (an insecure context in some engines): the own one
        digest = sha256Bytes(bytes);
    }
    return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The source id of a loaded file: its shown name, "#" and 16 hex digits of the SHA-256 of its whole
 * name and its column names in their order, joined with U+0000.
 * @param {string} name
 * @param {readonly string[]} columns
 * @param {{ subtle?: SubtleCrypto | null }} [options]
 */
export async function sourceIdOf(name, columns, options) {
    const hex = await sha256Hex([name, ...columns].join("\u0000"), options);
    return `${shownName(name)}#${hex.slice(0, 16)}`;
}

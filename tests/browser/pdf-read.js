// A minimal reader of the PDFs Chromium writes (page.pdf, Skia), for report-pdf.spec.js: the pages in
// order, each with its text (through each font's ToUnicode map, codes of one or two bytes, Tj and TJ,
// hex and literal strings, forms drawn with Do) and the fill colours it sets (`r g b rg`). Enough to
// check what a printed report holds; not a general PDF parser (a classic xref table only: no object
// streams or xref streams, no incremental updates, no encryption, no other filter than FlateDecode).
// A glyph its font's ToUnicode map does not name decodes to "": use the text only to check that
// something is there, never that a text is absent.
import { inflateSync } from "node:zlib";

/**
 * @param {Buffer} pdf
 * @returns {{ count: number, pages: { text: string, fills: string[] }[] }}
 *   count: the page tree's /Count; fills: each colour as "r g b" with 0-255 channels, once
 */
export function readPdf(pdf) {
    const raw = pdf.toString("latin1");
    /** @type {Map<number, { dict: string, stream: Buffer | null }>} */
    const objects = new Map();
    // each object where the cross-reference table puts it (Chromium writes a classic `xref` table),
    // so an "n 0 obj" or "endobj" inside a stream's bytes is never taken for an object's bounds; a
    // stream is kept to its end here and cut at its /Length by streamOf
    const xref = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(raw)?.[1]);
    const table = /^xref\s+(\d+)\s+(\d+)\s+/.exec(raw.slice(xref));
    if (!table) throw new Error("pdf-read: no classic xref table");
    const first = Number(table[1]);
    const entries = raw.slice(xref + table[0].length).match(/(\d{10}) (\d{5}) ([nf])/g).slice(0, Number(table[2]));
    for (const [i, entry] of entries.entries()) {
        const [offset, , kind] = entry.split(" ");
        if (kind !== "n") continue;
        const header = /^\d+ \d+ obj\s*/.exec(raw.slice(Number(offset), Number(offset) + 32));
        const start = Number(offset) + header[0].length;
        const streamAt = raw.slice(start).search(/stream\r?\n|endobj/);
        const dict = raw.slice(start, start + streamAt);
        const isStream = raw.startsWith("stream", start + streamAt);
        objects.set(first + i, { dict, stream: isStream ? Buffer.from(raw.slice(start + streamAt).replace(/^stream\r?\n/, ""), "latin1") : null });
    }
    const ref = (text, key) => {
        const m = new RegExp(`/${key}\\s+(\\d+) 0 R`).exec(text);
        return m ? Number(m[1]) : null;
    };
    /** A stream's bytes, inflated, cut at its /Length. */
    const streamOf = (n) => {
        const o = objects.get(n);
        const lengthRef = ref(o.dict, "Length");
        const length = lengthRef === null ? Number(/\/Length\s+(\d+)/.exec(o.dict)[1]) : Number(objects.get(lengthRef).dict.trim());
        const bytes = o.stream.subarray(0, length);
        return /\/FlateDecode/.test(o.dict) ? inflateSync(bytes) : bytes;
    };
    /** A dictionary entry `/key << ... >>` (nested once) or `/key n 0 R`, as text. */
    const dictOf = (text, key) => {
        const r = ref(text, key);
        if (r !== null) return objects.get(r).dict;
        const at = text.indexOf(`/${key}`);
        if (at === -1) return "";
        let depth = 0;
        const open = text.indexOf("<<", at);
        for (let i = open; i < text.length - 1; i++) {
            if (text.startsWith("<<", i)) (depth++, i++);
            else if (text.startsWith(">>", i)) {
                depth--;
                i++;
                if (depth === 0) return text.slice(open, i + 1);
            }
        }
        return "";
    };
    /** A font's ToUnicode map: code width in bytes and code -> text. */
    const cmapOf = (fontNumber) => {
        const toUnicode = ref(objects.get(fontNumber).dict, "ToUnicode");
        const map = new Map();
        if (toUnicode === null) return { width: 1, map };
        const text = streamOf(toUnicode).toString("latin1");
        const range = /begincodespacerange\s*<([0-9a-fA-F]+)>/.exec(text);
        const width = range ? range[1].length / 2 : 1;
        const utf16 = (hex) => String.fromCharCode(...(hex.match(/..../g) ?? []).map((h) => parseInt(h, 16)));
        for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
            for (const [, code, dst] of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) map.set(parseInt(code, 16), utf16(dst));
        }
        for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
            for (const [, lo, hi, dst, list] of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]+)>|\[([^\]]*)\])/g)) {
                const from = parseInt(lo, 16);
                const to = parseInt(hi, 16);
                const each = list ? [...list.matchAll(/<([0-9a-fA-F]+)>/g)].map((x) => x[1]) : null;
                for (let c = from; c <= to; c++) {
                    if (each) map.set(c, utf16(each[c - from] ?? ""));
                    else {
                        const units = dst.match(/..../g).map((h) => parseInt(h, 16));
                        units[units.length - 1] += c - from;
                        map.set(c, String.fromCharCode(...units));
                    }
                }
            }
        }
        return { width, map };
    };
    const literalBytes = (s) => {
        const out = [];
        for (let i = 0; i < s.length; i++) {
            if (s[i] !== "\\") {
                out.push(s.charCodeAt(i));
                continue;
            }
            const next = s[++i];
            const octal = /^[0-7]{1,3}/.exec(s.slice(i));
            if (octal) {
                out.push(parseInt(octal[0], 8));
                i += octal[0].length - 1;
            } else out.push({ n: 10, r: 13, t: 9, b: 8, f: 12 }[next] ?? next.charCodeAt(0));
        }
        return out;
    };
    const hexBytes = (h) => (h.replace(/\s/g, "").match(/../g) ?? []).map((b) => parseInt(b, 16));
    const decode = (bytes, font) => {
        let s = "";
        for (let i = 0; i + font.width <= bytes.length; i += font.width) {
            let code = 0;
            for (let k = 0; k < font.width; k++) code = code * 256 + bytes[i + k];
            s += font.map.get(code) ?? "";
        }
        return s;
    };
    const STRING = /<([0-9a-fA-F\s]*)>|\(((?:[^()\\]|\\[\s\S])*)\)/g;
    /** The text and fills of a content stream with its resources; forms drawn with Do read the same way. */
    const readContent = (content, resources, out) => {
        const fonts = dictOf(resources, "Font");
        const xobjects = dictOf(resources, "XObject");
        const cmaps = new Map();
        const fontNamed = (name) => {
            if (!cmaps.has(name)) {
                const n = ref(fonts, name);
                cmaps.set(name, n === null ? { width: 1, map: new Map() } : cmapOf(n));
            }
            return cmaps.get(name);
        };
        let font = { width: 1, map: new Map() };
        const ops = /\/([^\s/<>[\]()]+)\s+[-\d.]+\s+Tf|(<[0-9a-fA-F\s]*>|\((?:[^()\\]|\\[\s\S])*\))\s*(?:Tj|')|\[((?:<[^>]*>|\((?:[^()\\]|\\[\s\S])*\)|[^\]])*)\]\s*TJ|\bET\b|([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+rg\b|\/([^\s/<>[\]()]+)\s+Do\b/g;
        for (const m of content.matchAll(ops)) {
            if (m[1]) font = fontNamed(m[1]);
            else if (m[2] || m[3] !== undefined) {
                for (const s of (m[2] ?? m[3]).matchAll(STRING)) out.text += decode(s[1] !== undefined ? hexBytes(s[1]) : literalBytes(s[2]), font);
            } else if (m[0] === "ET") out.text += "\n";
            else if (m[4] !== undefined) out.fills.add([m[4], m[5], m[6]].map((v) => Math.round(Number(v) * 255)).join(" "));
            else if (m[7]) {
                const n = ref(xobjects, m[7]);
                if (n !== null && /\/Subtype\s*\/Form/.test(objects.get(n).dict)) {
                    const own = dictOf(objects.get(n).dict, "Resources");
                    readContent(streamOf(n).toString("latin1"), own || resources, out);
                }
            }
        }
    };
    /** The page tree's leaves in order. */
    const leaves = (n) => {
        const dict = objects.get(n).dict;
        if (/\/Type\s*\/Page\b(?!s)/.test(dict)) return [n];
        const kids = /\/Kids\s*\[([^\]]*)\]/.exec(dict)?.[1] ?? "";
        return [...kids.matchAll(/(\d+) 0 R/g)].flatMap((k) => leaves(Number(k[1])));
    };
    const catalog = [...objects.values()].find((o) => /\/Type\s*\/Catalog/.test(o.dict));
    const root = ref(catalog.dict, "Pages");
    const pages = leaves(root).map((n) => {
        const dict = objects.get(n).dict;
        const contents = /\/Contents\s*\[([^\]]*)\]/.exec(dict)?.[1] ?? /\/Contents\s+\d+ 0 R/.exec(dict)?.[0] ?? "";
        const out = { text: "", fills: new Set() };
        const content = [...contents.matchAll(/(\d+) 0 R/g)].map((c) => streamOf(Number(c[1])).toString("latin1")).join("\n");
        readContent(content, dictOf(dict, "Resources"), out);
        return { text: out.text, fills: [...out.fills] };
    });
    return { count: Number(/\/Count\s+(\d+)/.exec(objects.get(root).dict)[1]), pages };
}

/*
 * The print template: an HTML document with placeholders `{{name}}` from a fixed table (PLACEHOLDERS).
 * A template is trusted like code (the host's file or the CLI user's), so its own markup is not
 * filtered; what pivotkit fills in is not: every text is escaped, and the markup placeholders are built
 * by pivotkit from escaped parts. The check runs once, before anything is rendered: a small tokenizer
 * finds where each placeholder sits, and only two places are allowed:
 *
 * - text content (also inside <title> and <textarea>, whose text the browser never reads as markup;
 *   a markup placeholder only in plain text content);
 * - a quoted value of an attribute of ATTRIBUTES (text placeholders only), or the `content` of a
 *   <meta name="description">.
 *
 * Anything else is refused with PivotkitError INVALID_TEMPLATE, `details.reason` and the placeholder:
 * a placeholder in a comment or a doctype, right after "<" or "</" (where a tag's name starts), in raw text (<script>, <style>, ...), in an attribute's name,
 * an unquoted value or any other attribute (href, src, style, on..., srcdoc, ...), an unknown name
 * (with a "did you mean"), a "{{" without "}}", a NUL character, or a template over TEMPLATE_LIMIT
 * characters (LIMIT_EXCEEDED).
 *
 *   import { parseTemplate, fillTemplate } from "pivotkit-report/template";
 */

import { PivotkitError } from "pivotkit-core";

/** Characters a template may have. */
export const TEMPLATE_LIMIT = 262_144;

/**
 * The placeholders: text (escaped) and markup (built by pivotkit from escaped parts).
 * @type {Readonly<Record<string, "text" | "markup">>}
 */
export const PLACEHOLDERS = Object.freeze({
    title: "text",
    description: "text",
    source: "text",
    generated: "text",
    rows: "text",
    filters: "text",
    summary: "text",
    lang: "text",
    dir: "text",
    style: "markup",
    chart: "markup",
    table: "markup",
    details: "markup"
});

/** Attributes whose quoted value may hold a text placeholder. */
export const ATTRIBUTES = Object.freeze(["lang", "dir", "title", "alt", "class", "aria-label", "aria-description"]);

/** Elements whose content the browser does not read as markup (or not as text): no placeholder inside. */
const RAW_TEXT = new Set(["script", "style", "xmp", "iframe", "noembed", "noframes", "noscript", "plaintext", "template"]);
/** Elements whose content is text, entities read: an escaped text placeholder is safe there. */
const RCDATA = new Set(["title", "textarea"]);

/**
 * @typedef {{ name: string, kind: "text" | "markup" }} Slot
 * @typedef {{ parts: Array<string | Slot>, names: string[] }} Template  the template's text cut at its placeholders
 */

/** Escapes text for HTML text content and quoted attribute values. */
export function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** The edit distance of two short names, for "did you mean". */
function distance(a, b) {
    const row = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        let prev = row[0];
        row[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const keep = row[j];
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = keep;
        }
    }
    return row[b.length];
}

/** The closest placeholder name, when it is close (at most half of its letters differ). */
function closestName(name) {
    let best = null;
    let bestDistance = Infinity;
    for (const known of Object.keys(PLACEHOLDERS)) {
        const d = distance(name.toLowerCase(), known);
        if (d < bestDistance) {
            best = known;
            bestDistance = d;
        }
    }
    return best !== null && bestDistance <= Math.max(1, Math.floor(best.length / 2)) ? best : null;
}

/**
 * @param {string} reason
 * @param {string} message
 * @param {Record<string, unknown>} [details]
 */
function refuse(reason, message, details = {}) {
    return new PivotkitError("INVALID_TEMPLATE", `template: ${message}`, { reason, ...details });
}

/** The line of a position, for messages. */
const lineOf = (source, at) => source.slice(0, at).split("\n").length;

/**
 * Checks a template and cuts it at its placeholders. Throws INVALID_TEMPLATE (see above).
 * @param {string} source
 * @returns {Template}
 */
export function parseTemplate(source) {
    if (typeof source !== "string") {
        throw new PivotkitError("INVALID_ARGUMENT", "parseTemplate(source): source must be a string");
    }
    if (source.length > TEMPLATE_LIMIT) {
        throw new PivotkitError("LIMIT_EXCEEDED", `the template has ${source.length.toLocaleString("en-US")} characters, more than the limit of ${TEMPLATE_LIMIT.toLocaleString("en-US")}`, { limit: "template", value: source.length, max: TEMPLATE_LIMIT });
    }
    if (source.includes("\u0000")) {
        throw refuse("nul", "the template holds a NUL character");
    }
    /** @type {Array<string | Slot>} */
    const parts = [];
    const names = new Set();
    let text = "";
    let i = 0;
    const n = source.length;
    /** A placeholder may not be in `what`: refused when "{{" is in source[from, to). */
    const noSlot = (from, to, reason, what) => {
        const at = source.indexOf("{{", from);
        if (at !== -1 && at < to) {
            const name = /^\{\{\s*([^}\s]*)/.exec(source.slice(at, at + 64))?.[1] ?? "";
            throw refuse(reason, `a placeholder ${name ? `{{${name}}} ` : ""}is not allowed ${what} (line ${lineOf(source, at)})`, { placeholder: name, line: lineOf(source, at) });
        }
    };
    /** Reads the placeholder at i ("{{"), checks its name and kind, returns its end. */
    const slotAt = (at, allowMarkup, where) => {
        const end = source.indexOf("}}", at + 2);
        const next = source.indexOf("{{", at + 2);
        if (end === -1 || (next !== -1 && next < end)) {
            throw refuse("unclosed", `"{{" without "}}" (line ${lineOf(source, at)})`, { line: lineOf(source, at) });
        }
        const name = source.slice(at + 2, end).trim();
        if (!Object.hasOwn(PLACEHOLDERS, name)) {
            const near = /^[\w-]{1,64}$/.test(name) ? closestName(name) : null;
            throw refuse("unknownPlaceholder", `unknown placeholder {{${name.slice(0, 64)}}} (line ${lineOf(source, at)})${near ? `; did you mean {{${near}}}?` : ""}`, { placeholder: name.slice(0, 64), line: lineOf(source, at), ...(near ? { suggestion: near } : {}) });
        }
        const kind = PLACEHOLDERS[name];
        if (kind === "markup" && !allowMarkup) {
            throw refuse("markupInText", `{{${name}}} is markup and is allowed in the document's text only, not ${where} (line ${lineOf(source, at)})`, { placeholder: name, line: lineOf(source, at) });
        }
        return { slot: { name, kind }, end: end + 2 };
    };
    const flush = () => {
        if (text) {
            parts.push(text);
            text = "";
        }
    };
    const pushSlot = (slot) => {
        flush();
        parts.push(slot);
        names.add(slot.name);
    };
    while (i < n) {
        if (source.startsWith("{{", i)) {
            // right after "<" or "</" the text would start a tag: "<" + "img src=x onerror=..."
            if (/<\/?$/.test(source.slice(Math.max(0, i - 2), i))) {
                throw refuse("tagName", `a placeholder is not allowed where a tag's name starts (line ${lineOf(source, i)})`, { line: lineOf(source, i) });
            }
            const { slot, end } = slotAt(i, true, "here");
            pushSlot(slot);
            i = end;
            continue;
        }
        if (source[i] !== "<") {
            text += source[i++];
            continue;
        }
        if (source.startsWith("<!--", i)) {
            const close = source.indexOf("-->", i + 4);
            const end = close === -1 ? n : close + 3;
            noSlot(i, end, "comment", "in a comment");
            text += source.slice(i, end);
            i = end;
            continue;
        }
        if (source[i + 1] === "!" || source[i + 1] === "?") {
            const close = source.indexOf(">", i);
            const end = close === -1 ? n : close + 1;
            noSlot(i, end, "markup", "in a doctype or declaration");
            text += source.slice(i, end);
            i = end;
            continue;
        }
        const tag = /^<(\/?)([a-zA-Z][^\s/>]*)/.exec(source.slice(i, i + 256));
        if (!tag) {
            // a "<" that starts no tag is text
            text += source[i++];
            continue;
        }
        const closing = tag[1] === "/";
        const name = tag[2].toLowerCase();
        // the tag is built on its own: its quoted values are marked until every attribute is known
        flush();
        noSlot(i, i + tag[0].length, "tagName", "in a tag's name");
        text += tag[0];
        i += tag[0].length;
        // the attributes, up to the tag's end
        /** @type {Array<{ name: string, value: string | null }>} */
        const attrs = [];
        /** @type {Array<{ attr: string, start: number, end: number, quote: string }>} */
        const valueRanges = [];
        while (i < n && source[i] !== ">") {
            if (/\s|\//.test(source[i])) {
                text += source[i++];
                continue;
            }
            const attr = /^[^\s/>=]+/.exec(source.slice(i, i + 1024))?.[0] ?? source[i];
            noSlot(i, i + attr.length, "attributeName", "in an attribute's name");
            text += attr;
            i += attr.length;
            let ws = /^\s*/.exec(source.slice(i))?.[0] ?? "";
            if (source[i + ws.length] !== "=") {
                attrs.push({ name: attr.toLowerCase(), value: null });
                continue;
            }
            text += ws + "=";
            i += ws.length + 1;
            ws = /^\s*/.exec(source.slice(i))?.[0] ?? "";
            text += ws;
            i += ws.length;
            const quote = source[i];
            if (quote === '"' || quote === "'") {
                const close = source.indexOf(quote, i + 1);
                const end = close === -1 ? n : close;
                valueRanges.push({ attr: attr.toLowerCase(), start: i + 1, end, quote });
                attrs.push({ name: attr.toLowerCase(), value: source.slice(i + 1, end) });
                // the value is copied below, with its placeholders, once the tag is known
                i = Math.min(n, end + 1);
                text += "\u0000" + (valueRanges.length - 1) + "\u0000";
                continue;
            }
            const value = /^[^\s>]*/.exec(source.slice(i))?.[0] ?? "";
            noSlot(i, i + value.length, "unquoted", `in an unquoted attribute value (${attr})`);
            attrs.push({ name: attr.toLowerCase(), value });
            text += value;
            i += value.length;
        }
        // the quoted values, now that every attribute of the tag is known
        const metaDescription = name === "meta" && attrs.some((a) => a.name === "name" && (a.value ?? "").trim().toLowerCase() === "description");
        const pending = text;
        text = "";
        // eslint-disable-next-line no-control-regex
        const marker = /\u0000(\d+)\u0000/g;
        let last = 0;
        let m;
        while ((m = marker.exec(pending))) {
            text += pending.slice(last, m.index);
            last = m.index + m[0].length;
            const range = valueRanges[Number(m[1])];
            const allowed = ATTRIBUTES.includes(range.attr) || (metaDescription && range.attr === "content");
            if (!allowed) {
                noSlot(range.start, range.end, "attribute", `in the attribute "${range.attr}" (only ${ATTRIBUTES.join(", ")} and the content of <meta name="description">)`);
            }
            text += range.quote;
            let j = range.start;
            while (j < range.end) {
                if (source.startsWith("{{", j)) {
                    const { slot, end } = slotAt(j, false, "in an attribute");
                    pushSlot(slot);
                    j = end;
                } else {
                    text += source[j++];
                }
            }
            text += range.quote;
        }
        text += pending.slice(last);
        if (i < n) {
            text += ">";
            i++;
        }
        if (!closing && (RAW_TEXT.has(name) || RCDATA.has(name))) {
            // the element's content up to its end tag
            const endTag = new RegExp(`</${name}[\\s/>]`, "i");
            const rest = source.slice(i);
            const found = endTag.exec(rest);
            const end = found ? i + found.index : n;
            if (RAW_TEXT.has(name)) {
                noSlot(i, end, "rawText", `inside <${name}>`);
                text += source.slice(i, end);
            } else {
                let j = i;
                while (j < end) {
                    if (source.startsWith("{{", j)) {
                        const { slot, end: e } = slotAt(j, false, `inside <${name}>`);
                        pushSlot(slot);
                        j = e;
                    } else {
                        text += source[j++];
                    }
                }
            }
            i = end;
        }
    }
    flush();
    return { parts, names: [...names] };
}

/**
 * The template with its placeholders filled: text values escaped, markup values as given (built by
 * pivotkit). A placeholder without a value is empty.
 * @param {Template} template  from parseTemplate()
 * @param {Partial<Record<string, string>>} values
 * @returns {string}
 */
export function fillTemplate(template, values) {
    return template.parts
        .map((part) => {
            if (typeof part === "string") {
                return part;
            }
            const value = Object.hasOwn(values, part.name) ? values[part.name] ?? "" : "";
            return part.kind === "text" ? escapeHtml(value) : value;
        })
        .join("");
}

/*
 * The sheets of a workbook (xl/workbook.xml) and the parts they are in (xl/_rels/workbook.xml.rels):
 * names, order, hidden or not, and the path of each worksheet. Both parts are small and plain; their
 * elements are read with patterns over the text after the XML check (xml.js). Not part of the public
 * API.
 */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** XML text with its five named entities and character references decoded. */
export function decodeXml(text) {
    return text.replace(/&(?:#x([0-9a-f]{1,6})|#(\d{1,7})|(amp|lt|gt|quot|apos));/gi, (whole, hex, dec, name) => {
        if (name) return ENTITIES[name.toLowerCase()] ?? whole;
        const code = hex ? parseInt(hex, 16) : Number(dec);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    });
}

/** The attributes of one start tag's text (`name="..."`, prefixes dropped: `r:id` is `id`). */
function attributes(tag) {
    /** @type {Map<string, string>} */
    const out = new Map();
    for (const m of tag.matchAll(/(?:[\w.-]+:)?([\w.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
        if (!out.has(m[1])) out.set(m[1], decodeXml(m[3] ?? m[4] ?? ""));
    }
    return out;
}

/** The start tags of elements named `local` (any namespace prefix). */
function tags(xml, local) {
    return [...xml.matchAll(new RegExp(`<(?:[\\w.-]+:)?${local}\\b([^>]*)>`, "g"))].map((m) => attributes(m[1]));
}

/** "worksheets/sheet1.xml" relative to xl/ (or "/xl/..." absolute) -> "xl/worksheets/sheet1.xml" */
export function partPath(target) {
    const parts = (target.startsWith("/") ? target.slice(1) : `xl/${target}`).split("/");
    const out = [];
    for (const p of parts) {
        if (p === "..") out.pop();
        else if (p !== "." && p !== "") out.push(p);
    }
    return out.join("/");
}

/**
 * The worksheets of a workbook in their order (chart sheets and dialog sheets are not tables).
 * @param {string} workbookXml
 * @param {string} relsXml
 * @returns {Array<{ name: string, index: number, visible: boolean, path: string }>}
 */
export function worksheets(workbookXml, relsXml) {
    const targets = new Map();
    for (const rel of tags(relsXml, "Relationship")) {
        const type = rel.get("Type") ?? "";
        if (/\/worksheet$/.test(type) && rel.has("Id") && rel.has("Target") && rel.get("TargetMode") !== "External") {
            targets.set(rel.get("Id"), partPath(rel.get("Target")));
        }
    }
    const out = [];
    for (const sheet of tags(workbookXml, "sheet")) {
        const path = targets.get(sheet.get("id") ?? "");
        if (path === undefined) continue;
        const state = sheet.get("state");
        out.push({ name: sheet.get("name") ?? "", index: out.length, visible: state !== "hidden" && state !== "veryHidden", path });
    }
    return out;
}

/** The paths of the shared strings and the styles, from the workbook's relationships. */
export function sharedParts(relsXml) {
    const out = { sharedStrings: "xl/sharedStrings.xml", styles: "xl/styles.xml" };
    for (const rel of tags(relsXml, "Relationship")) {
        const type = rel.get("Type") ?? "";
        if (/\/sharedStrings$/.test(type) && rel.has("Target")) out.sharedStrings = partPath(rel.get("Target"));
        if (/\/styles$/.test(type) && rel.has("Target")) out.styles = partPath(rel.get("Target"));
    }
    return out;
}

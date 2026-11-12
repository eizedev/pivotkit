// The view file check of the documentation site: a text or a chosen file, read in this browser with
// the real pivotkit-core (fromViewFile, then normalize against data made from the fields the file
// lists). It says whether the format is right, what normalize() would leave out of the view and
// which fields it needs. Nothing is sent anywhere; everything from the file is shown as text.
import "./validator.css";
import { VIEW_FILE_LIMITS, encode, fromViewFile, normalize, viewFileFields } from "pivotkit-core";

const out = /** @type {HTMLElement} */ (document.getElementById("vf-out"));
const text = /** @type {HTMLTextAreaElement} */ (document.getElementById("vf-text"));

/** A sample value of a column type, so encode() gives the field that type. */
const SAMPLE = { string: "a", number: 1, date: new Date(Date.UTC(2026, 0, 1)), boolean: true, null: null };

/** An element with text (never markup) and children. */
function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    node.append(...children.filter((c) => c !== null && c !== undefined));
    return node;
}

function list(items) {
    return el("ul", {}, ...items.map((i) => el("li", {}, i)));
}

function check(input) {
    out.replaceChildren();
    const read = fromViewFile(input);
    if (read.failed) {
        const why = {
            empty: "Nothing to check: paste a view file or choose one.",
            tooLarge: `Longer than ${VIEW_FILE_LIMITS.text.toLocaleString("en-US")} characters: too large for a view.`,
            notJson: "Not valid JSON.",
            notView: "Not a view: a JSON object with a view is needed.",
            newerFormat: "A newer format version than this pivotkit reads: update pivotkit to open it.",
            newerView: "A newer view version than this pivotkit reads: update pivotkit to open it."
        }[read.failed];
        out.append(el("h2", { className: "vf-bad", textContent: "Cannot be used" }), el("p", { textContent: why }));
        return;
    }
    const fields = read.source?.fields ?? [];
    const row = Object.fromEntries(fields.map((f) => [f.name, SAMPLE[f.type] ?? "a"]));
    const types = Object.fromEntries(fields.map((f) => [f.name, f.type === "null" ? "string" : f.type]));
    const data = encode(fields.length ? [row] : [], { types });
    const normalized = normalize(read.view, data);
    // without source.fields there is no data to check names against: only the shape counts
    const viewIssues = normalized.issues.filter((i) => fields.length || !/^unknown field/.test(i.message));
    const ok = read.issues.length === 0 && viewIssues.length === 0;
    out.append(
        el("h2", { className: ok ? "vf-ok" : "vf-bad", textContent: ok ? "Valid" : "Usable, with notes" }),
        el("p", { textContent: read.envelope ? `A view file, format version ${read.formatVersion}${read.name ? `: “${read.name}”` : ""}${read.source?.id ? `, made for the source “${read.source.id}”` : ""}.` : "A bare view without the view file's envelope: it still loads; a view file also says its source and fields." })
    );
    if (read.issues.length) {
        out.append(el("p", { textContent: "Left out of the envelope:" }), list(read.issues.map((i) => el("span", {}, el("code", { textContent: i.path }), ` ${i.message}`))));
    }
    if (viewIssues.length) {
        out.append(el("p", { textContent: fields.length ? "Left out of the view (checked against the fields the file lists):" : "Left out of the view:" }), list(viewIssues.slice(0, 50).map((i) => el("span", {}, el("code", { textContent: i.path || "(view)" }), ` ${i.message}`))));
    }
    const needs = viewFileFields(read.view);
    const typeOf = new Map(fields.map((f) => [f.name.toLowerCase(), f.type]));
    out.append(
        el("p", { textContent: needs.length ? "Fields the view needs in the data:" : "The view uses no field of the data." }),
        needs.length ? list(needs.map((n) => el("span", {}, el("code", { textContent: n }), typeOf.has(n.toLowerCase()) ? ` (${typeOf.get(n.toLowerCase())})` : " (type not listed)"))) : null
    );
}

document.getElementById("vf-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    check(text.value);
});
document.getElementById("vf-file")?.addEventListener("change", async (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > VIEW_FILE_LIMITS.text) {
        check("x".repeat(VIEW_FILE_LIMITS.text + 1));
        return;
    }
    text.value = await file.text();
    check(text.value);
});

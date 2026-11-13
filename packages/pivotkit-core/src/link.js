/*
 * pivotkit-core/link: a view as a short text for a link (the part after "#pivot=") and back. A separate
 * entry point, like pivotkit-core/export, so a UI that never shares a view does not bundle fflate.
 *
 *   import { encodeViewLink, decodeViewLink, readViewLink } from "pivotkit-core/link";
 *   const text = encodeViewLink(view);              // "1.<deflated JSON, base64url>"
 *   const { view, issues } = decodeViewLink(text);  // the view as parsed JSON, or null; never throws
 *   const link = readViewLink(location.hash, "sales"); // the view of "#pivot-sales=...", its src and name
 *
 * The text is the view's JSON compressed with raw DEFLATE (fflate) and written in base64url, which
 * needs no escaping in a URL. "1." in front names this format, so a later one can be told apart.
 * Decoding is size-capped twice: the text (LINK_LIMITS.text) before anything is decoded, and the
 * inflated JSON (LINK_LIMITS.json) while it is inflated: the compressed bytes go in in small slices
 * and inflating stops at the first slice that passes the cap, so a crafted link (a deflate bomb) can
 * neither make a large allocation nor keep the inflater busy. The decoded view is still user input:
 * pass it through normalize() against the data.
 */

import { deflateSync, strFromU8, strToU8 } from "fflate";
import { inflateCapped } from "./inflate.js";
import { PivotkitError, expect } from "./errors.js";
import { linkFragment } from "./link-fragment.js";
import { resolveLimits } from "./limits.js";
import { isPlainObject } from "./util.js";
import { fromViewFile, paramsOf } from "./view-file.js";

/**
 * The codes of a link's issues: an empty text, one too long, no pivotkit view link, damaged data, a
 * view too large once inflated, no JSON object, not valid JSON. A UI says them in its own words.
 */
export const LINK_ISSUE_CODES = Object.freeze(["linkEmpty", "linkTooLong", "notLink", "linkDamaged", "linkTooLarge", "notView", "notJson"]);

/** The format marker in front of the encoded view. */
const PREFIX = "1.";

/**
 * The most a link may hold: `text` characters of the encoded view (browsers and servers handle URLs
 * of this length; a larger view belongs in a file), `json` characters of the view once inflated.
 */
export const LINK_LIMITS = Object.freeze({ text: 32_000, json: 1_000_000 });

const BASE64URL = /^[A-Za-z0-9_-]*$/;

/** @param {Uint8Array} bytes */
function toBase64Url(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** @param {string} text  base64url without padding */
function fromBase64Url(text) {
    const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
}

/**
 * The text of a link to a view: its JSON, deflated, in base64url, after "1.". Throws a PivotkitError
 * LIMIT_EXCEEDED when the text would be longer than `LINK_LIMITS.text` (a view with long filter lists,
 * say): such a view is shared as a file instead.
 * @param {object} view  a view (normalized or not); only its JSON is written
 * @returns {string}
 */
export function encodeViewLink(view) {
    expect(isPlainObject(view), "encodeViewLink(view): view must be an object");
    const json = JSON.stringify(view);
    const tooLong = (value, max, what) => new PivotkitError("LIMIT_EXCEEDED", `${value.toLocaleString("en-US")} ${what} exceed the limit of ${max.toLocaleString("en-US")} (LINK_LIMITS)`, { limit: "link", value, max });
    if (json.length > LINK_LIMITS.json) {
        throw tooLong(json.length, LINK_LIMITS.json, "characters of the view");
    }
    const text = PREFIX + toBase64Url(deflateSync(strToU8(json), { level: 9 }));
    if (text.length > LINK_LIMITS.text) {
        throw tooLong(text.length, LINK_LIMITS.text, "characters of the link");
    }
    return text;
}

/**
 * The view of a link text (encodeViewLink), as parsed JSON, or null with an issue that says why:
 * an empty or too long text, an unknown format, damaged data, too large a view, no JSON object. Never
 * throws. The view is not normalized: it is user input, normalize() it against the data.
 * @param {unknown} text  the encoded view, as after "#pivot="
 * @returns {{ view: Record<string, unknown> | null, issues: import("./view.js").Issue[] }}
 */
export function decodeViewLink(text) {
    const fail = (message, code) => ({ view: null, issues: [{ path: "", message, code, severity: /** @type {"error"} */ ("error") }] });
    if (typeof text !== "string" || text.trim() === "") {
        return fail("empty link", "linkEmpty");
    }
    const t = text.trim();
    if (t.length > LINK_LIMITS.text) {
        return fail(`link longer than ${LINK_LIMITS.text} characters`, "linkTooLong");
    }
    if (!t.startsWith(PREFIX) || !BASE64URL.test(t.slice(PREFIX.length))) {
        return fail("not a pivotkit view link", "notLink");
    }
    const payload = t.slice(PREFIX.length);
    if (payload === "") {
        return fail("the link is damaged", "linkDamaged");
    }
    let json;
    try {
        const out = inflateCapped(fromBase64Url(payload), LINK_LIMITS.json);
        if (out.bytes === null) {
            return fail(`view larger than ${LINK_LIMITS.json} characters`, "linkTooLarge");
        }
        json = strFromU8(out.bytes);
    } catch {
        return fail("the link is damaged", "linkDamaged");
    }
    try {
        const view = JSON.parse(json);
        return isPlainObject(view) ? { view, issues: [] } : fail("not a view object", "notView");
    } catch {
        return fail("not valid JSON", "notJson");
    }
}

/**
 * @typedef {object} ViewLinkRead
 * @property {Record<string, unknown> | null} view  the view as parsed, not normalized; null without one
 * @property {{ id: string, params?: Record<string, string> } | null} src  the data source the link
 *   names (source.id, and source.params as far as `allowParams` lets them through); null without an id
 * @property {string} name  the view's name, "" without one
 * @property {null | "none" | "link" | "empty" | "tooLarge" | "notJson" | "notView" | "newerFormat" | "newerView"} failed  why
 *   nothing can be used: "none" the fragment has no entry for the key, "link" the text is no link
 *   (`issues` says why), else as fromViewFile's
 * @property {import("./view.js").Issue[]} issues
 */

/**
 * A view from a page's URL fragment: the entry of `key` ("#pivot=" without one, "#pivot-<key>="),
 * decoded (decodeViewLink) and read as a view file (fromViewFile), with the data source it names.
 * The source reference is opaque: `src.id` is the host's name of the data (never an address), and
 * `src.params` only the parameters the host allows by name (`options.allowParams`, none by default);
 * the page resolves them with the viewer's own rights. A bad link never throws (`failed` and `issues`
 * say why); a bad `options.limits` throws INVALID_OPTION, link or not. The view is user input from
 * outside: normalize() it against the data with outsideLimits().
 * @param {unknown} hash  location.hash, with or without "#"
 * @param {string | null} [key]  the report's key
 * @param {{ allowParams?: string[], limits?: Partial<import("./limits.js").Limits> }} [options]
 * @returns {ViewLinkRead}
 */
export function readViewLink(hash, key, options = {}) {
    /** @type {ViewLinkRead} */
    const read = { view: null, src: null, name: "", failed: null, issues: [] };
    // a bad options.limits is the host's error: thrown whether or not the page has a link
    const limits = resolveLimits(options);
    const text = linkFragment(hash, key);
    if (text === null) {
        return { ...read, failed: "none" };
    }
    const decoded = decodeViewLink(text);
    if (!decoded.view) {
        return { ...read, failed: "link", issues: decoded.issues };
    }
    const file = fromViewFile(decoded.view, { limits });
    if (file.failed || !file.view) {
        return { ...read, failed: file.failed ?? "notView", issues: file.issues };
    }
    const allowed = new Set(Array.isArray(options.allowParams) ? options.allowParams : []);
    const issues = [...file.issues];
    /** @type {Record<string, string>} */
    const params = {};
    for (const [name, value] of Object.entries(paramsOf(file.source?.params, limits, () => {}) ?? {})) {
        if (allowed.has(name)) {
            // defined, not assigned: a name such as "__proto__" is a parameter like any other
            Object.defineProperty(params, name, { value, enumerable: true, writable: true, configurable: true });
        } else {
            issues.push({ path: `source.params.${name.slice(0, 100)}`, message: "a parameter the host does not allow; left out" });
        }
    }
    const id = file.source?.id;
    return { view: file.view, src: id ? { id, ...(Object.keys(params).length ? { params } : {}) } : null, name: file.name, failed: null, issues };
}

export { linkFragment, linkParam, withLinkFragment } from "./link-fragment.js";

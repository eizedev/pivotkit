/*
 * pivotkit-core/link: a view as a short text for a link (the part after "#pivot=") and back. A separate
 * entry point, like pivotkit-core/export, so a UI that never shares a view does not bundle fflate.
 *
 *   import { encodeViewLink, decodeViewLink } from "pivotkit-core/link";
 *   const text = encodeViewLink(view);              // "1.<deflated JSON, base64url>"
 *   const { view, issues } = decodeViewLink(text);  // the view as parsed JSON, or null; never throws
 *
 * The text is the view's JSON compressed with raw DEFLATE (fflate) and written in base64url, which
 * needs no escaping in a URL. "1." in front names this format, so a later one can be told apart.
 * Decoding is size-capped twice: the text (LINK_LIMITS.text) before anything is decoded, and the
 * inflated JSON (LINK_LIMITS.json) while it is inflated, so a crafted link cannot make a large
 * allocation. The decoded view is still user input: pass it through normalize() against the data.
 */

import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import { PivotkitError, expect } from "./errors.js";
import { isPlainObject } from "./util.js";

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
    const fail = (message) => ({ view: null, issues: [{ path: "", message }] });
    if (typeof text !== "string" || text.trim() === "") {
        return fail("empty link");
    }
    const t = text.trim();
    if (t.length > LINK_LIMITS.text) {
        return fail(`link longer than ${LINK_LIMITS.text} characters`);
    }
    if (!t.startsWith(PREFIX) || !BASE64URL.test(t.slice(PREFIX.length))) {
        return fail("not a pivotkit view link");
    }
    let json;
    try {
        // one byte more than allowed: inflateSync stops at the end of `out`, so a full buffer means
        // the view is larger than the limit (the rest is never inflated)
        const out = inflateSync(fromBase64Url(t.slice(PREFIX.length)), { out: new Uint8Array(LINK_LIMITS.json + 1) });
        if (out.length > LINK_LIMITS.json) {
            return fail(`view larger than ${LINK_LIMITS.json} characters`);
        }
        json = strFromU8(out);
    } catch {
        return fail("the link is damaged");
    }
    try {
        const view = JSON.parse(json);
        return isPlainObject(view) ? { view, issues: [] } : fail("not a view object");
    } catch {
        return fail("not valid JSON");
    }
}

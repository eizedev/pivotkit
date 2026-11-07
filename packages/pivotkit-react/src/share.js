/*
 * Sharing a view, without a DOM: the link (pivotkit-core/link, loaded on first use, in the URL
 * fragment under "pivot" or "pivot-<storageKey>"), the view kept per tab (sessionStorage), a view
 * loaded from JSON, and what normalize() left out in plain words. Every view that comes in this way is
 * user input: it goes through normalize() against the data before the report shows it.
 */

import { normalize } from "pivotkit-core";
import { fill } from "./labels.js";

/** @type {Promise<typeof import("pivotkit-core/link")> | null} */
let linkModule = null;
/** The link module once loaded: a click can then encode without waiting (a browser may allow a copy only within the click). */
/** @type {typeof import("pivotkit-core/link") | null} */
let linkLoaded = null;

/** pivotkit-core/link (fflate), loaded once, on first use. */
export function loadLink() {
    linkModule ??= import("pivotkit-core/link").then((m) => {
        linkLoaded = m;
        return m;
    });
    return linkModule;
}

/** The link module when it is loaded already, else null (see loadLink). */
export const linkNow = () => linkLoaded;

/**
 * The name of a report's view in the URL fragment: "pivot", or "pivot-<storageKey>" so several reports
 * on one page each have their own.
 * @param {string | undefined} storageKey
 */
export function linkParam(storageKey) {
    return storageKey ? `pivot-${storageKey}` : "pivot";
}

/**
 * The encoded view of a fragment ("#pivot=1.abc&pivot-sales=1.def") under a name, or null.
 * @param {string} hash  location.hash, with or without "#"
 * @param {string} param
 */
export function readLinkParam(hash, param) {
    const text = typeof hash === "string" ? hash.replace(/^#/, "") : "";
    if (!text) {
        return null;
    }
    try {
        const value = new URLSearchParams(text).get(param);
        return value ? value : null;
    } catch {
        return null;
    }
}

/**
 * A URL with the encoded view under `param` in its fragment; other entries of the fragment stay. A
 * fragment that is not a list of name=value pairs (an anchor, "#top") is replaced.
 * @param {string} url
 * @param {string} param
 * @param {string | null} encoded  null removes the entry
 */
export function withLinkParam(url, param, encoded) {
    const at = url.indexOf("#");
    const base = at === -1 ? url : url.slice(0, at);
    const fragment = at === -1 ? "" : url.slice(at + 1);
    const params = new URLSearchParams(fragment.includes("=") ? fragment : "");
    if (encoded) {
        params.set(param, encoded);
    } else {
        params.delete(param);
    }
    const text = params.toString();
    return text ? `${base}#${text}` : base;
}

/**
 * The address a shared link points to: the host's base URL, or the page's own address for `true`; null
 * when links are off.
 * @param {unknown} shareLink  the prop: true, a URL, or anything else for off
 * @param {string | undefined} here  the page's address (location.href)
 * @returns {string | null}
 */
export function shareBase(shareLink, here) {
    if (shareLink === true) {
        return here ?? null;
    }
    return typeof shareLink === "string" && shareLink.trim() ? shareLink.trim() : null;
}

/** The sessionStorage key of a report's view: one per storageKey. */
export const viewStorageName = (key) => `pivotkit:view:${key ?? ""}`;

/**
 * The stored view of a report (persistView="session") as JSON text, or null (none, no storage, blocked).
 * @param {string | undefined} key
 * @param {Pick<Storage, "getItem"> | null | undefined} storage
 */
export function readStoredView(key, storage) {
    if (!storage) {
        return null;
    }
    try {
        return storage.getItem(viewStorageName(key));
    } catch {
        return null;
    }
}

/**
 * Stores a report's view; quietly nothing when the browser refuses (private mode, quota).
 * @param {string | undefined} key
 * @param {Pick<Storage, "setItem"> | null | undefined} storage
 * @param {object} view
 */
export function writeStoredView(key, storage, view) {
    if (!storage) {
        return;
    }
    try {
        storage.setItem(viewStorageName(key), JSON.stringify(view));
    } catch {
        // storage blocked or full: the view lasts until the tab is closed or reloaded
    }
}

/** The characters a view file or pasted JSON may have: the size of pivotkit-core's view limit is far more than any real view. */
export const VIEW_TEXT_MAX = 1_000_000;

/** A field name from an issue message ('unknown field "Region"'), or null. */
const fieldOf = (message) => /^unknown field (".*")$/.exec(message)?.[1];

/**
 * What normalize() left out, in plain words for the person who loaded the view: the fields the data
 * does not have by name, the rest counted. The core's messages stay for developers (onViewChange gets
 * the view only).
 * @param {import("pivotkit-core").Issue[]} issues
 * @param {import("./labels.js").UiLabels} labels
 * @returns {string[]}  one line per kind, at most a few
 */
export function issueLines(issues, labels) {
    const missing = [];
    let other = 0;
    for (const issue of issues) {
        if (issue.message === "unknown key") {
            // a key this version does not know (a template's "name"): nothing the person can act on
            continue;
        }
        const quoted = fieldOf(issue.message);
        let name;
        try {
            name = quoted ? JSON.parse(quoted) : null;
        } catch {
            name = null;
        }
        if (typeof name === "string") {
            if (!missing.includes(name)) {
                missing.push(name);
            }
        } else {
            other += 1;
        }
    }
    const lines = [];
    if (missing.length) {
        const shown = missing.slice(0, 5).map((n) => `“${n.length > 60 ? `${n.slice(0, 59)}…` : n}”`).join(", ");
        lines.push(fill(labels.viewMissingFields, { fields: missing.length > 5 ? `${shown} …` : shown }));
    }
    if (other) {
        lines.push(fill(other === 1 ? labels.viewOtherIssue : labels.viewOtherIssues, { count: other }));
    }
    return lines;
}

/**
 * A view from text someone pasted or a file they chose: JSON of a view (or of a template { name,
 * view }), normalized against the data. `failed` names why nothing could be used: "empty", "tooLarge",
 * "notJson", "notView", "newer".
 * @param {string} text
 * @param {import("pivotkit-core").Encoded} encoded
 * @param {{ limits?: object }} [options]
 * @returns {{ view: import("pivotkit-core").View | null, issues: import("pivotkit-core").Issue[], failed: string | null }}
 */
export function viewFromText(text, encoded, options = {}) {
    if (typeof text !== "string" || text.trim() === "") {
        return { view: null, issues: [], failed: "empty" };
    }
    if (text.length > VIEW_TEXT_MAX) {
        return { view: null, issues: [], failed: "tooLarge" };
    }
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        // a link pasted here is no JSON: the caller tries it as a link
        return { view: null, issues: [], failed: "notJson" };
    }
    return viewFromObject(parsed, encoded, options);
}

/**
 * A parsed view (from JSON or a link), normalized against the data; a template { name, view } gives
 * its view.
 * @param {unknown} parsed
 * @param {import("pivotkit-core").Encoded} encoded
 * @param {{ limits?: object }} [options]
 * @returns {{ view: import("pivotkit-core").View | null, issues: import("pivotkit-core").Issue[], failed: string | null }}
 */
export function viewFromObject(parsed, encoded, options = {}) {
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { view: null, issues: [], failed: "notView" };
    }
    const own = (key) => (Object.hasOwn(parsed, key) ? parsed[key] : undefined);
    const inner = own("view");
    const candidate = inner !== null && typeof inner === "object" && !Array.isArray(inner) && typeof own("name") === "string" ? inner : parsed;
    const { view, issues } = normalize(candidate, encoded, options.limits ? { limits: options.limits } : undefined);
    if (issues.some((i) => i.path === "version")) {
        return { view: null, issues, failed: "newer" };
    }
    if (issues.some((i) => i.path === "")) {
        return { view: null, issues, failed: "notView" };
    }
    return { view, issues, failed: null };
}

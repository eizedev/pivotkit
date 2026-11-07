/*
 * Sharing a view, without a DOM: the link (pivotkit-core/link, loaded on first use, in the URL
 * fragment under "pivot" or "pivot-<storageKey>"), the view kept per tab (sessionStorage), a view
 * loaded from a view file or JSON (pivotkit-core's fromViewFile), what to ask before a view for other
 * data is applied, and what normalize() left out in plain words. Every view that comes in this way is
 * user input: it goes through normalize() against the data before the report shows it.
 */

import { VIEW_FILE_LIMITS, fromViewFile, normalize } from "pivotkit-core";
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

/** The entries of a fragment: its text split at "&", each kept as it is. */
const entries = (fragment) => (fragment ? fragment.split("&") : []);
/** Whether a fragment entry is the one of `param`. */
const isEntry = (entry, param) => entry.startsWith(`${encodeURIComponent(param)}=`);

/**
 * The encoded view of a fragment ("#pivot=1.abc&pivot-sales=1.def") under a name, or null. The
 * fragment is read as it is, not as form data, so a hash route next to it ("#/reports/a?tab=2&pivot=...")
 * does not matter.
 * @param {string} hash  location.hash, with or without "#"
 * @param {string} param
 */
export function readLinkParam(hash, param) {
    const text = typeof hash === "string" ? hash.replace(/^#/, "") : "";
    const entry = entries(text).find((e) => isEntry(e, param));
    const value = entry ? entry.slice(encodeURIComponent(param).length + 1) : "";
    return value ? value : null;
}

/**
 * A URL with the encoded view under `param` in its fragment. Only that entry is added, replaced or
 * removed; the rest of the fragment (another report's entry, a hash route such as "#/reports/a?tab=2",
 * an anchor) stays byte for byte.
 * @param {string} url
 * @param {string} param
 * @param {string | null} encoded  null removes the entry
 */
export function withLinkParam(url, param, encoded) {
    const at = url.indexOf("#");
    const base = at === -1 ? url : url.slice(0, at);
    const kept = entries(at === -1 ? "" : url.slice(at + 1)).filter((e) => !isEntry(e, param));
    const next = encoded ? [...kept, `${encodeURIComponent(param)}=${encoded}`] : kept;
    return next.length ? `${base}#${next.join("&")}` : base;
}

/**
 * The address a shared link points to: the host's base URL as given, or for `true` the page's own
 * address without its query (it may hold tokens or ids the host did not mean to share) and with its
 * fragment (other entries, a hash route); null when links are off.
 * @param {unknown} shareLink  the prop: true, a URL, or anything else for off
 * @param {string | undefined} here  the page's address (location.href)
 * @returns {string | null}
 */
export function shareBase(shareLink, here) {
    if (shareLink === true) {
        if (!here) {
            return null;
        }
        try {
            const url = new URL(here);
            return `${url.origin}${url.pathname}${url.hash}`;
        } catch {
            return null;
        }
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

/** The characters a view file or pasted JSON may have (pivotkit-core's VIEW_FILE_LIMITS.text). */
export const VIEW_TEXT_MAX = VIEW_FILE_LIMITS.text;

/** Field names in quotes, the first five, as the report's notes write them. */
const quoteNames = (names) => {
    const shown = names.slice(0, 5).map((n) => `“${n.length > 60 ? `${n.slice(0, 59)}…` : n}”`).join(", ");
    return names.length > 5 ? `${shown} …` : shown;
};

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
        lines.push(fill(labels.viewMissingFields, { fields: quoteNames(missing) }));
    }
    if (other) {
        lines.push(fill(other === 1 ? labels.viewOtherIssue : labels.viewOtherIssues, { count: other }));
    }
    return lines;
}

/**
 * @typedef {object} LoadedView
 * @property {import("pivotkit-core").View | null} view  normalized against the data; null when nothing can be used
 * @property {import("pivotkit-core").Issue[]} issues  what normalize() left out
 * @property {string | null} failed  why nothing can be used: "empty", "tooLarge", "notJson", "notView", "newer"
 * @property {import("pivotkit-core").ViewFileRead | null} file  the view file as read (name, source, compatible)
 */

/** pivotkit-core's reasons, as the texts of labels.viewFailed name them. */
const FAILED = Object.freeze({ newerFormat: "newer", newerView: "newer" });

/**
 * A view from text someone pasted or a file they chose: a view file (pivotkit-core's fromViewFile), a
 * bare view or a template { name, view }, normalized against the data.
 * @param {string} text
 * @param {import("pivotkit-core").Encoded} encoded
 * @param {{ limits?: object, sourceId?: string }} [options]
 * @returns {LoadedView}
 */
export function viewFromText(text, encoded, options = {}) {
    return viewFromObject(text, encoded, options);
}

/**
 * A view from a parsed object (a link's) or a text, read as a view file and normalized against the
 * data; `file.compatible` says how it fits (the same source by `options.sourceId`, its fields there).
 * @param {unknown} input
 * @param {import("pivotkit-core").Encoded} encoded
 * @param {{ limits?: object, sourceId?: string }} [options]
 * @returns {LoadedView}
 */
export function viewFromObject(input, encoded, options = {}) {
    const file = fromViewFile(input, { data: encoded, sourceId: options.sourceId });
    if (file.failed || !file.view) {
        const failed = file.failed ?? "notView";
        return { view: null, issues: file.issues, failed: Object.hasOwn(FAILED, failed) ? FAILED[failed] : failed, file };
    }
    const { view, issues } = normalize(file.view, encoded, options.limits ? { limits: options.limits } : undefined);
    if (issues.some((i) => i.path === "version")) {
        return { view: null, issues, failed: "newer", file };
    }
    return { view, issues, failed: null, file };
}

/**
 * What to ask before a view for other data is applied, or null when it fits: the lines that say why
 * (the source it was made for, the fields missing, the fields of another type) and, when the host
 * can switch to that source (`sources`), its entry. Names from the file are plain text.
 * @param {LoadedView} loaded
 * @param {import("./labels.js").UiLabels} labels
 * @param {Array<{ id: string, name?: string }>} [sources]  the sources the host can switch to
 * @returns {{ lines: string[], switchTo: { id: string, name: string } | null } | null}
 */
export function loadCheck(loaded, labels, sources = []) {
    const fit = loaded.file?.compatible;
    if (!loaded.view || !fit || fit.ok) {
        return null;
    }
    const lines = [];
    const fileSource = loaded.file?.source;
    const target = fit.source === "other" && fileSource?.id ? sources.find((s) => s && s.id === fileSource.id) : undefined;
    if (fit.source === "other") {
        const name = target?.name || fileSource?.name || fileSource?.id;
        lines.push(name ? fill(labels.loadCheckSource, { source: name }) : labels.loadCheckOtherSource);
    }
    if (fit.missing.length) {
        lines.push(fill(labels.loadCheckMissing, { fields: quoteNames(fit.missing) }));
    }
    if (fit.changed.length) {
        lines.push(fill(labels.loadCheckChanged, { fields: quoteNames(fit.changed.map((c) => c.name)) }));
    }
    return { lines, switchTo: target ? { id: target.id, name: target.name || target.id } : null };
}

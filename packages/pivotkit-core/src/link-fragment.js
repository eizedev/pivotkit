/*
 * Where a view's link sits in a URL fragment: "#pivot=1.abc", or "#pivot-<key>=1.abc" so several
 * reports on one page each have their own ("#pivot-sales=1.abc&pivot-costs=1.def"). The fragment is
 * read as it is, not as form data, so a hash route next to the entry ("#/reports/a?tab=2&pivot=...")
 * does not matter. No fflate here: a UI reads the fragment on its first render and loads
 * pivotkit-core/link (which decodes the text) only when there is one.
 */

/**
 * The name of a report's entry in the fragment: "pivot", or "pivot-<key>".
 * @param {string | undefined | null} [key]  the report's key (pivotkit-react's storageKey)
 */
export const linkParam = (key) => (key ? `pivot-${key}` : "pivot");

/** The entries of a fragment: its text split at "&", each kept as it is. */
const fragmentEntries = (fragment) => (fragment ? fragment.split("&") : []);

/** Whether a fragment entry is the one of `param`. */
const isLinkEntry = (entry, param) => entry.startsWith(`${encodeURIComponent(param)}=`);

/**
 * The link text of a report's entry in a fragment, or null.
 * @param {unknown} hash  location.hash, with or without "#"
 * @param {string | undefined | null} [key]  the report's key: the entry "pivot-<key>", else "pivot"
 * @returns {string | null}
 */
export function linkFragment(hash, key) {
    const param = linkParam(key);
    const text = typeof hash === "string" ? hash.replace(/^#/, "") : "";
    const entry = fragmentEntries(text).find((e) => isLinkEntry(e, param));
    const value = entry ? entry.slice(encodeURIComponent(param).length + 1) : "";
    return value ? value : null;
}

/**
 * A URL with a report's link text in its fragment. Only that entry is added, replaced or removed; the
 * rest of the fragment (another report's entry, a hash route such as "#/reports/a?tab=2", an anchor)
 * stays byte for byte.
 * @param {string} url
 * @param {string | undefined | null} key  the report's key: the entry "pivot-<key>", else "pivot"
 * @param {string | null} text  the link text (encodeViewLink); null removes the entry
 * @returns {string}
 */
export function withLinkFragment(url, key, text) {
    const param = linkParam(key);
    const at = url.indexOf("#");
    const base = at === -1 ? url : url.slice(0, at);
    const kept = fragmentEntries(at === -1 ? "" : url.slice(at + 1)).filter((e) => !isLinkEntry(e, param));
    const next = text ? [...kept, `${encodeURIComponent(param)}=${text}`] : kept;
    return next.length ? `${base}#${next.join("&")}` : base;
}

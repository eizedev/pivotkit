/*
 * Which lines of the warning about a view's unused parts (unused.jsx) still apply to the view shown.
 * A line names a part of the view it came with by its path ("values[0].conditional.colors",
 * "chart.legend", "rows[2]"); it stays while that part of the view shown is what it was when the view
 * was loaded (or given by the host), and goes once the user changed it by hand or removed it: the
 * value with the colour scale that did not fit is gone, the legend has a place of the user's choice.
 * Undo back to the loaded view brings the line back. Pure, tested without a DOM.
 */

const PATH = /^([A-Za-z]+)(?:\[(\d+)\])?(?:\.([A-Za-z]+))?/;
const lower = (v) => (typeof v === "string" ? v.toLowerCase() : v);
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * The part of a view a path names, as JSON: a value of Values by its field and aggregator (its
 * place may differ from the place in the view as given, which may have had entries that were
 * dropped), a setting of an object section (chart.legend), else the whole section (rows, filters), or
 * the whole view for a path that names none ("" for a view that could not be read at all).
 * @param {string | undefined} path  an issue's path in the view as given
 * @param {unknown} raw  the view as given (a file's, a link's, the host's), before normalize()
 * @param {Record<string, any>} view  a normalized view
 * @returns {string | undefined}
 */
export function partOf(path, raw, view) {
    const m = PATH.exec(path ?? "");
    if (!m) {
        return JSON.stringify(view);
    }
    const [, key, index, sub] = m;
    const section = Object.hasOwn(view, key) ? view[key] : undefined;
    if (key === "values" && index !== undefined && Array.isArray(section)) {
        const given = isObject(raw) && Array.isArray(/** @type {any} */ (raw).values) ? /** @type {any} */ (raw).values[Number(index)] : undefined;
        const match = isObject(given) ? section.find((v) => lower(v.field ?? null) === lower(given.field ?? null) && lower(v.agg) === lower(given.agg)) : undefined;
        if (match) {
            return JSON.stringify(match);
        }
    }
    if (sub !== undefined && isObject(section)) {
        return JSON.stringify(Object.hasOwn(section, sub) ? section[sub] : undefined);
    }
    return JSON.stringify(section);
}

/**
 * Whether a line of the warning still applies to the view shown: the part of the view it names is
 * as it was in the view loaded (both normalized). A line without a path (a text) names its zone in
 * `path`, or nothing (it stays).
 * @param {import("./unused.jsx").UnusedNote} note
 * @param {Record<string, any> | null} loaded  the view as loaded, normalized; null: every line stays
 * @param {Record<string, any>} shown  the view shown, normalized
 */
export function stillApplies(note, loaded, shown) {
    if (!loaded) {
        return true;
    }
    if ("issue" in note) {
        return partOf(note.issue.path, note.raw, loaded) === partOf(note.issue.path, note.raw, shown);
    }
    return note.path === undefined || partOf(note.path, null, loaded) === partOf(note.path, null, shown);
}

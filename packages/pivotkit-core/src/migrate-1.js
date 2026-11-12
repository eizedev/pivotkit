/*
 * The step from view version 1 to version 2: version 1's filters in version 2's one condition shape,
 * so that every version-1 view keeps what it keeps (test/v1-golden.test.js holds the proof).
 *
 *   include items     -> in, the items without null; blanks "include" when null was listed, else "exclude"
 *   exclude items     -> in, not: true, the items without null; blanks "exclude" when null was listed, else "include"
 *   label op value    -> text, on: "label", match { case: "insensitive", whitespace: "exact" };
 *                        notEquals and notContains as equals and contains with not: true; blanks as
 *                        version 1 decided them, by matching the text "(blank)"
 *   compare           -> != and notBetween as = and between with not: true; blanks "exclude"
 *   relative          -> blanks "exclude" (version 2's defaults: the last N calendar units, the current one included)
 *   value             -> != and notBetween as = and between with not: true
 *   top               -> as it is (version 2's default ties: "first")
 *
 * One exception, documented: version 1 lower-cased label filters with toLocaleLowerCase() in the
 * runtime's default locale, version 2 with the locale-independent toLowerCase(). In a runtime whose
 * default locale is Turkish, Azeri or Lithuanian, a label filter with an "I" may keep other items.
 *
 * A view without a version is read as version 1. The step only rewrites what version 1 has and
 * version 2 does not (the types include, exclude and label, the operators != and notBetween) and fills
 * `blanks` only where it is missing, so a version-2 view without a version passes it unchanged. The
 * input is user input like any view: what is not a version-1 filter is left for normalize() to report.
 */

import { get, isPlainObject } from "./util.js";

/** The text version 1 matched a blank against: the label of a blank without the host's labels. */
const V1_BLANK = "(blank)";

/** What version 1's label filter decided for a text, folded as it folded (see the exception above). */
function v1Label(op, label, value) {
    const l = label.toLowerCase();
    const v = value.toLowerCase();
    switch (op) {
        case "equals":
            return l === v;
        case "notEquals":
            return l !== v;
        case "contains":
            return l.includes(v);
        case "notContains":
            return !l.includes(v);
        case "beginsWith":
            return l.startsWith(v);
        case "endsWith":
            return l.endsWith(v);
        default:
            return false;
    }
}

/** Version 1's negated operators and their positive one. */
const NEGATED = Object.freeze({ notEquals: "equals", notContains: "contains", "!=": "=", notBetween: "between" });

/** `{ op, not: true }` for a negated operator, `{}` for any other. */
const positive = (op) => (typeof op === "string" && Object.hasOwn(NEGATED, op) ? { op: NEGATED[op], not: true } : {});

/** `blanks` unless the filter has one. */
const blanksOf = (f, blanks) => (get(f, "blanks") === undefined ? { blanks } : {});

/**
 * One filter of version 1 in version 2's shape.
 * @param {unknown} raw
 */
function filterOf(raw) {
    if (!isPlainObject(raw)) {
        return raw;
    }
    const f = /** @type {Record<string, unknown>} */ (raw);
    const type = get(f, "type");
    const op = get(f, "op");
    switch (type) {
        case "include":
        case "exclude": {
            const items = get(f, "items");
            const not = type === "exclude" ? { not: true } : {};
            if (!Array.isArray(items)) {
                return { ...f, type: "in", ...not };
            }
            // version 1 listed the blank as the item null: an include kept it when listed, an
            // exclude kept it when not listed
            const listed = items.includes(null);
            const keptBlank = type === "include" ? listed : !listed;
            return { ...f, type: "in", items: items.filter((i) => i !== null), ...not, ...blanksOf(f, keptBlank ? "include" : "exclude") };
        }
        case "label": {
            const value = get(f, "value");
            const blanks = typeof value === "string" ? blanksOf(f, v1Label(op, V1_BLANK, value) ? "include" : "exclude") : {};
            return { ...f, type: "text", on: "label", match: { case: "insensitive", whitespace: "exact" }, ...positive(op), ...blanks };
        }
        case "compare":
        case "relative":
            return { ...f, ...positive(op), ...blanksOf(f, "exclude") };
        case "value":
            return { ...f, ...positive(op) };
        default:
            return f;
    }
}

/**
 * A version-1 view as version 2 (its `version` is set by the pipeline, view.js runMigrations).
 * @param {Record<string, unknown>} raw
 * @returns {Record<string, unknown>}
 */
export function migrate1(raw) {
    const filters = get(raw, "filters");
    return Array.isArray(filters) ? { ...raw, filters: filters.map(filterOf) } : raw;
}

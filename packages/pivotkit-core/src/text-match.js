/*
 * How text is compared: the one folding that text filters, a UI's search over a field's items and the
 * "did you mean" hints share, so a text that matches in one place matches in the others.
 *
 * - case "insensitive" lower-cases with String.prototype.toLowerCase(), the Unicode default case
 *   mapping, which does not depend on the runtime's locale: a server and a browser fold "I" alike
 *   (toLocaleLowerCase() folds it to a dotless "ı" in a Turkish, Azeri or Lithuanian locale).
 * - whitespace "collapse" turns every run of whitespace into one space and trims the ends. JavaScript's
 *   \s covers the no-break space (U+00A0), the narrow no-break space (U+202F), the ideographic space
 *   (U+3000), tabs and line breaks, so a value copied from a web page or a spreadsheet matches what
 *   is typed. A zero-width space (U+200B) is not whitespace and stays.
 */

/** @typedef {{ case?: "insensitive" | "sensitive", whitespace?: "collapse" | "exact" }} TextMatch */

/** The text matching of a new text filter and of a search: case and runs of whitespace do not matter. */
export const MATCH_DEFAULTS = Object.freeze({ case: "insensitive", whitespace: "collapse" });

/** The cases a text match knows, and the whitespace handling. */
export const MATCH_CASES = Object.freeze(["insensitive", "sensitive"]);
export const MATCH_WHITESPACE = Object.freeze(["collapse", "exact"]);

const WHITESPACE = /\s+/g;

/**
 * A text folded for comparing: lower-cased for `case: "insensitive"`, its whitespace collapsed for
 * `whitespace: "collapse"` (both the default, MATCH_DEFAULTS). Anything that is not a string folds as
 * its String().
 * @param {unknown} text
 * @param {TextMatch} [match]
 * @returns {string}
 */
export function foldText(text, match = MATCH_DEFAULTS) {
    let t = typeof text === "string" ? text : String(text);
    if ((match.whitespace ?? MATCH_DEFAULTS.whitespace) === "collapse") {
        t = t.replace(WHITESPACE, " ").trim();
    }
    return (match.case ?? MATCH_DEFAULTS.case) === "insensitive" ? t.toLowerCase() : t;
}

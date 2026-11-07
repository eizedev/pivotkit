/*
 * Numbers people type into the menus (a value condition, Top N, number ranges), read in the report's
 * locale: "1.000,5" in German and "1,000.5" in English are both 1000.5. A plain number with a point
 * ("1000.5", "-2", "1e6") is accepted in every locale, since that is what people paste; a point
 * followed by groups of three digits in a locale that groups with points ("1.000" in German) is a
 * thousands separator. Anything else is no number (null), so the form can say so instead of guessing.
 */

const cache = new Map();

/** The decimal mark and the grouping mark of a locale. */
function marks(locale) {
    let m = cache.get(locale);
    if (!m) {
        let parts;
        try {
            parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
        } catch {
            parts = new Intl.NumberFormat("en-US").formatToParts(12345.6);
        }
        m = {
            decimal: parts.find((p) => p.type === "decimal")?.value ?? ".",
            group: parts.find((p) => p.type === "group")?.value ?? ","
        };
        cache.set(locale, m);
    }
    return m;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PLAIN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/**
 * A number typed in the report's locale, or null when the text is empty or not a number.
 * @param {string} text
 * @param {string} locale
 * @returns {number | null}
 */
export function parseNumber(text, locale) {
    // spaces of any kind group digits (French writes 1\u202f000,5); a typographic minus is a minus
    const t = String(text ?? "").replace(/[\s\u00a0\u202f]/g, "").replace(/\u2212/g, "-");
    if (t === "") {
        return null;
    }
    const { decimal, group } = marks(locale);
    const g = /[\s\u00a0\u202f]/.test(group) ? "" : escape(group);
    const d = escape(decimal);
    const grouped = g ? `\\d{1,3}(?:${g}\\d{3})+` : "(?!)";
    const local = new RegExp(`^([+-]?)(${grouped}|\\d+)?(?:${d}(\\d+))?$`);
    const match = local.exec(t);
    if (match && (match[2] !== undefined || match[3] !== undefined)) {
        const whole = (match[2] ?? "0").split(group).join("");
        const n = Number(`${match[1]}${whole}${match[3] !== undefined ? `.${match[3]}` : ""}`);
        return Number.isFinite(n) ? n : null;
    }
    if (PLAIN.test(t)) {
        const n = Number(t);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/**
 * A number as a form shows it for editing: the locale's decimal mark, no grouping, all its decimals.
 * @param {number | null | undefined} n
 * @param {string} locale
 */
export function numberText(n, locale) {
    if (typeof n !== "number" || !Number.isFinite(n)) {
        return "";
    }
    try {
        return n.toLocaleString(locale, { useGrouping: false, maximumFractionDigits: 20 });
    } catch {
        return String(n);
    }
}

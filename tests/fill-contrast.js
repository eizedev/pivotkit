// The contrast of text on a coloured fill in both themes, for tests of any package: a label's ink on
// the area under it (a chart's tile or cell, a zone's fill). The themes are the report's light and dark
// tokens (pivotkit-report's kept copy of styles.css, which its tokens test keeps in step); the maths is
// pivotkit-core's contrastOf (WCAG 2.2). A colour that is no hex or rgb() after its var() is resolved
// measures null, so a test sees it instead of passing it.
import { TEXT_CONTRAST, contrastOf } from "../packages/pivotkit-core/src/chart-colors.js";
import { DARK_TOKENS, LIGHT_TOKENS } from "../packages/pivotkit-report/src/tokens.js";

/** The contrast text needs on its fill (WCAG 2.2 AA, normal text). */
export const TEXT_MIN = TEXT_CONTRAST;

/** The --pk-* colour tokens of each theme: the dark theme sets only what differs from the light one. */
export const THEME_TOKENS = Object.freeze({
    light: LIGHT_TOKENS,
    dark: Object.freeze({ ...LIGHT_TOKENS, ...DARK_TOKENS })
});

/**
 * A colour with its var() references resolved against `tokens` (at most a few steps deep).
 * @param {string} value
 * @param {Readonly<Record<string, string>>} tokens
 * @returns {string}
 */
function resolveColor(value, tokens) {
    let out = String(value ?? "").trim();
    for (let step = 0; step < 8; step++) {
        const ref = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(out);
        if (!ref) break;
        out = String(tokens[ref[1]] ?? ref[2] ?? "").trim();
    }
    return out;
}

/**
 * A style as pivotkit-core's chartThemeFrom and decorateOption read it: the theme's tokens, with
 * `extra` over them, var() resolved.
 * @param {Readonly<Record<string, string>>} tokens
 * @param {Readonly<Record<string, string>>} [extra]
 * @returns {{ getPropertyValue(name: string): string }}
 */
function tokenStyle(tokens, extra = {}) {
    const all = { ...tokens, ...extra };
    return { getPropertyValue: (name) => resolveColor(all[name] ?? "", all) };
}

/**
 * The contrast of `ink` on `fill`, both resolved against `tokens`; null when either is no colour
 * contrastOf reads.
 * @param {string} ink
 * @param {string} fill
 * @param {Readonly<Record<string, string>>} [tokens]
 * @returns {number | null}
 */
export function contrastOnFill(ink, fill, tokens = {}) {
    return contrastOf(resolveColor(ink, tokens), resolveColor(fill, tokens));
}

/**
 * Every label's contrast on its fill in both themes: `labelsOf(style, tokens, theme)` gives the labels
 * one theme draws, each `{ name, ink, fill }`.
 * @param {(style: { getPropertyValue(name: string): string }, tokens: Readonly<Record<string, string>>, theme: "light" | "dark") => { name: string, ink: string, fill: string }[]} labelsOf
 * @returns {{ theme: "light" | "dark", name: string, ink: string, fill: string, ratio: number | null }[]}
 */
export function fillContrasts(labelsOf) {
    return /** @type {const} */ (["light", "dark"]).flatMap((theme) => {
        const tokens = THEME_TOKENS[theme];
        return labelsOf(tokenStyle(tokens), tokens, theme).map((l) => ({ theme, ...l, ratio: contrastOnFill(l.ink, l.fill, tokens) }));
    });
}

/**
 * The labels of `fillContrasts` below TEXT_MIN, or unreadable, as lines a failed assertion names.
 * @param {ReturnType<typeof fillContrasts>} measured
 * @param {number} [least]
 */
export const unreadable = (measured, least = TEXT_MIN) => measured.filter((m) => m.ratio === null || m.ratio < least).map((m) => `${m.theme} ${m.name}: ${m.ink} on ${m.fill} = ${m.ratio === null ? "unreadable" : m.ratio.toFixed(2)}`);

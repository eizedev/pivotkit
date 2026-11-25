/*
 * A fixed colour per series or slice by name, for toEChartsOption (chart.js): the view's chart.colors
 * over the host's colorMap. Names match without regard to case; a name in neither keeps the palette's
 * colour. Only a drawn chart needs this module.
 */
import { EXTREME_INKS } from "./defaults.js";

/**
 * A colour a host may name: hex of 3, 4, 6 or 8 digits, rgb(), rgba(), hsl(), hsla() or a CSS colour
 * name. ECharts mixes these, a canvas and an SVG draw them, and none of them is markup or an address.
 */
export const PLAIN_COLOR = /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgba?|hsla?)\([0-9.,%\s/+-]{1,60}\)|[a-z]{3,24})$/i;

/**
 * Whether a host's colour is one to draw: PLAIN_COLOR, and where the runtime knows CSS (a browser), a
 * colour it reads, so a word that is no colour name is left out. A server and the report keep the pattern.
 * @param {string} color
 */
function plainColor(color) {
    const css = /** @type {{ CSS?: { supports?: (property: string, value: string) => boolean } }} */ (globalThis).CSS;
    return PLAIN_COLOR.test(color) && (typeof css?.supports !== "function" || css.supports("color", color));
}

/**
 * The colour of a name and place, or null for every name when no colour is fixed: the view's
 * entries first, then the host's map, else the palette's colour of the place. ECharts hands its
 * palette only to the series without a colour, so a fixed colour would move the others' colours; a
 * colour for every place keeps them where they are.
 * @param {ReadonlyArray<{ name: string, color: string }> | undefined} viewColors  the view's chart.colors
 * @param {unknown} hostMap  the host's colorMap: `{ [name]: color }`; a colour that is not PLAIN_COLOR
 *   is left out
 * @param {readonly string[] | undefined} palette  the theme's colours
 * @returns {(name: unknown, place: number) => string | null}
 */
export function colorLookup(viewColors, hostMap, palette) {
    const colors = new Map();
    if (hostMap !== null && typeof hostMap === "object" && !Array.isArray(hostMap)) {
        for (const name of Object.keys(hostMap)) {
            const color = /** @type {Record<string, unknown>} */ (hostMap)[name];
            if (typeof color === "string" && plainColor(color.trim())) {
                colors.set(name.toLowerCase(), color.trim());
            }
        }
    }
    for (const { name, color } of Array.isArray(viewColors) ? viewColors : []) {
        colors.set(name.toLowerCase(), color);
    }
    const fallback = (/** @type {number} */ place) => (palette?.length ? palette[place % palette.length] : null);
    return (name, place) => (colors.size ? (colors.get(String(name).toLowerCase()) ?? fallback(place)) : null);
}

/**
 * A colour's red, green and blue (0 to 255) from #rgb, #rrggbb or rgb()/rgba(); null for any other form.
 * @param {string} color
 * @returns {[number, number, number] | null}
 */
function rgbOf(color) {
    const c = String(color).trim();
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
    if (hex) {
        const h = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join("") : hex[1];
        return /** @type {[number, number, number]} */ ([0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)));
    }
    const rgb = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/i.exec(c);
    return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

/** WCAG 2's relative luminance of a colour's red, green and blue. */
function luminance(/** @type {[number, number, number]} */ rgb) {
    const [r, g, b] = rgb.map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2's contrast of two colours (1 to 21); null when one is no hex or rgb() colour.
 * @param {string} a
 * @param {string} b
 */
export function contrastOf(a, b) {
    const x = rgbOf(a);
    const y = rgbOf(b);
    if (!x || !y) {
        return null;
    }
    const [l1, l2] = [luminance(x), luminance(y)];
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** The contrast text needs on its background (WCAG 2.2 AA, normal text). */
export const TEXT_CONTRAST = 4.5;

/**
 * The colour of text on a coloured area (#914): of `candidates` (the theme's text and background
 * colours, one dark and one light), the one with the highest WCAG contrast on `fill`. Where none
 * reaches TEXT_CONTRAST (a mid blue between the theme's two), white or black: the one on the best ink's
 * side where it reaches TEXT_CONTRAST, else the other. One of them always reaches 4.58:1 on an opaque
 * colour. A fill it cannot read (not hex or rgb()) gives
 * the first candidate. Used for a heatmap's cell numbers; decorateOption puts a treemap's labels on a
 * background of their own instead (treemapLabels in chart-style.js).
 * @param {string} fill
 * @param {string[]} candidates
 */
export function labelColorOn(fill, candidates) {
    const read = candidates.map((c) => ({ c, ratio: contrastOf(fill, c) })).filter((x) => x.ratio !== null);
    if (!read.length) {
        return candidates[0];
    }
    const best = read.reduce((a, x) => (/** @type {number} */ (x.ratio) > /** @type {number} */ (a.ratio) ? x : a));
    if (/** @type {number} */ (best.ratio) >= TEXT_CONTRAST) {
        return best.c;
    }
    // the extreme on the best ink's side first (a light ink white), so the ink changes side only where it must
    const [black, white] = EXTREME_INKS;
    const light = /** @type {number} */ (contrastOf(best.c, black)) > /** @type {number} */ (contrastOf(best.c, white));
    const [near, far] = light ? [white, black] : [black, white];
    return /** @type {number} */ (contrastOf(fill, near)) >= TEXT_CONTRAST ? near : far;
}

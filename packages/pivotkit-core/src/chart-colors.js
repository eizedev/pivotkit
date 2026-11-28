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
 * A colour's red, green and blue (0 to 255) and its alpha (0 to 1) from #rgb, #rgba, #rrggbb,
 * #rrggbbaa or rgb()/rgba(), with commas or with spaces and a slash, the alpha a number or a
 * percentage; null for any other form.
 * @param {string} color
 * @returns {[number, number, number, number] | null}
 */
function rgbaOf(color) {
    const c = String(color).trim();
    const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(c);
    if (hex) {
        const h = hex[1].length <= 4 ? [...hex[1]].map((d) => d + d).join("") : hex[1];
        const [r, g, b, a = 255] = (h.match(/../g) ?? []).map((x) => parseInt(x, 16));
        return [r, g, b, a / 255];
    }
    const rgb = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)(?:\s*[,/]\s*(\d*\.?\d+)(%?))?\s*\)$/i.exec(c);
    if (!rgb) {
        return null;
    }
    const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]) / (rgb[5] ? 100 : 1);
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Math.min(1, Math.max(0, alpha))];
}

/**
 * `color` as it shows on `under`: a translucent colour mixed with what is under it by its alpha, as a
 * canvas draws it; an opaque one as it is. `under` counts as opaque.
 * @param {[number, number, number, number]} color
 * @param {[number, number, number, number]} under
 * @returns {[number, number, number]}
 */
const shownOn = ([r, g, b, a], under) => /** @type {[number, number, number]} */ ([r, g, b].map((v, i) => v * a + under[i] * (1 - a)));

/** Whether text of luminance `l` has more contrast with black, (l + 0.05) / 0.05, than with white, 1.05 / (l + 0.05). */
const lightSide = (/** @type {number} */ l) => (l + 0.05) / 0.05 > 1.05 / (l + 0.05);

/** WCAG 2's relative luminance of a colour's red, green and blue. */
function luminance(/** @type {[number, number, number]} */ rgb) {
    const [r, g, b] = rgb.map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2's contrast of text in `ink` on `background` (1 to 21), as it is drawn: a translucent ink (a
 * theme's `rgba(0, 0, 0, 0.87)`) is mixed with the background first. The background's own alpha is
 * not counted: it is measured as opaque. Null when one is no hex or rgb() colour.
 * @param {string} ink
 * @param {string} background
 */
export function contrastOf(ink, background) {
    const x = rgbaOf(ink);
    const y = rgbaOf(background);
    if (!x || !y) {
        return null;
    }
    const [l1, l2] = [luminance(shownOn(x, y)), luminance(shownOn([y[0], y[1], y[2], 1], y))];
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
 * the first candidate. Used for a heatmap's cell numbers; a treemap keeps one text colour and darkens its
 * tiles instead (tileFill).
 * @param {string} fill
 * @param {string[]} candidates
 */
export function labelColorOn(fill, candidates) {
    const read = candidates.map((c) => ({ c, ratio: contrastOf(c, fill) })).filter((x) => x.ratio !== null);
    if (!read.length) {
        return candidates[0];
    }
    const best = read.reduce((a, x) => (/** @type {number} */ (x.ratio) > /** @type {number} */ (a.ratio) ? x : a));
    if (/** @type {number} */ (best.ratio) >= TEXT_CONTRAST) {
        return best.c;
    }
    // the extreme on the best ink's side first (a light ink white), so the ink changes side only where it
    // must; the ink's side as it shows on the fill (a translucent ink mixed with it)
    const [black, white] = EXTREME_INKS;
    const ink = /** @type {[number, number, number, number]} */ (rgbaOf(best.c));
    const light = lightSide(luminance(shownOn(ink, /** @type {[number, number, number, number]} */ (rgbaOf(fill)))));
    const [near, far] = light ? [white, black] : [black, white];
    return /** @type {number} */ (contrastOf(near, fill)) >= TEXT_CONTRAST ? near : far;
}

/** A colour's red, green and blue (0 to 255, rounded) as #rrggbb. */
export const hexOf = (/** @type {number[]} */ rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/**
 * The colour a treemap's tile is drawn in so that its text in `ink` reads `floor`:1 on it (#984): the
 * tile's own colour where the ink reaches it, else that colour mixed, a hundredth at a time, with black
 * (a light ink) or white (a dark ink), only as far as the ink needs. Where no mix reaches `floor` (a
 * grey ink and a high floor), black or white. A floor of 1 or less, and a colour or ink it cannot read
 * (not hex or rgb()), keep the tile's colour; alpha is not read, so both count as opaque.
 * @param {string} tile
 * @param {string} ink
 * @param {number} floor
 * @returns {string}
 */
export function tileFill(tile, ink, floor) {
    // alpha is dropped: tile and ink count as opaque
    const from = rgbaOf(tile)?.slice(0, 3);
    const text = rgbaOf(ink);
    if (!from || !text || !(floor > 1) || /** @type {number} */ (contrastOf(ink, tile)) >= floor) {
        return tile;
    }
    // a light ink (more contrast on black than on white) reads on a darker tile, a dark one on a lighter
    const [black, white] = EXTREME_INKS;
    const to = /** @type {number} */ (contrastOf(ink, black)) > /** @type {number} */ (contrastOf(ink, white)) ? [0, 0, 0] : [255, 255, 255];
    for (let step = 1; step < 100; step++) {
        const mixed = hexOf(from.map((v, i) => v + ((to[i] - v) * step) / 100));
        if (/** @type {number} */ (contrastOf(ink, mixed)) >= floor) {
            return mixed;
        }
    }
    return hexOf(to);
}

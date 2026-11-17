/*
 * A fixed colour per series or slice by name, for toEChartsOption (chart.js): the view's chart.colors
 * over the host's colorMap. Names match without regard to case; a name in neither keeps the palette's
 * colour. Only a drawn chart needs this module.
 */

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

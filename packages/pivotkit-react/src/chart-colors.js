/*
 * The host's colorMap for the theme shown (#54): a colour per series or slice name, one for both
 * themes or one for light and one for dark. pivotkit-core's toEChartsOption takes the result as its
 * `colorMap` and checks each colour. Small and pure: the chart and the exports use it.
 */

/**
 * The host's colorMap with one colour per name for `theme`: a text as it is, a list of two the first
 * for light and the second for dark. Other values are left out.
 * @param {unknown} map  the host's colorMap, `{ [name]: color | [light, dark] }`
 * @param {string} theme  "light" or "dark", as the report shows
 * @returns {Record<string, string> | undefined}
 */
export function colorMapFor(map, theme) {
    if (map === null || typeof map !== "object" || Array.isArray(map)) {
        return undefined;
    }
    /** @type {Array<[string, string]>} */
    const entries = [];
    for (const name of Object.keys(map)) {
        const value = /** @type {Record<string, unknown>} */ (map)[name];
        const color = Array.isArray(value) && value.length === 2 ? value[theme === "dark" ? 1 : 0] : value;
        if (typeof color === "string") {
            entries.push([name, color]);
        }
    }
    // Object.fromEntries: each name an own property, "__proto__" too
    return Object.fromEntries(entries);
}

/*
 * The tokens an export writes, as one of the report's themes resolves them, whichever theme it shows:
 * a workbook's colours and an HTML report's tokens are the light theme's (black text in Excel,
 * paper), and an HTML report also gets the dark theme's for a reader whose screen is dark. Loaded
 * with the menus (export-run.js), so the first load does not carry it.
 */

/**
 * Tokens as the report's `theme` resolves them, in either theme the report shows: the light ones for
 * a workbook and an HTML report (so a host's light colours go into them from a dark report too), the
 * dark ones for the HTML report on a dark screen. A report showing the other theme shows this one for
 * the read, on its root and, inside pivotkit-element, on the element whose :host rules declare the
 * tokens, and its own again in the same task, so nothing is drawn in between; --pk-duration is 0ms
 * meanwhile (on the root, important), so no transition of the report's starts on the way there or
 * back. A host's rules on data-pk-theme="dark" (or "light") are read that way; rules on something
 * else (an html[data-theme] of the page) apply in both. Lengths are resolved by the chart's module
 * (chart-decorate.js, tokenLengths), passed in as `more`, read in that theme too.
 * @param {HTMLElement} root  the report's root
 * @param {"light" | "dark"} theme
 * @param {readonly string[]} names
 * @param {() => Record<string, string>} [more]  further tokens read while that theme shows
 * @returns {Record<string, string>}  the tokens that are set
 */
export function themeTokens(root, theme, names, more = () => ({})) {
    const host = /** @type {{ host?: Element }} */ (root.getRootNode()).host;
    const other = theme === "light" ? "dark" : "light";
    const shown = [root, ...(host ? [host] : [])].filter((el) => el.getAttribute("data-pk-theme") === other);
    const read = () => {
        const style = getComputedStyle(root);
        return { ...Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]).filter(([, value]) => value)), ...more() };
    };
    if (!shown.length) {
        return read();
    }
    const kept = [root.style.getPropertyValue("--pk-duration"), root.style.getPropertyPriority("--pk-duration")];
    root.style.setProperty("--pk-duration", "0ms", "important");
    try {
        for (const el of shown) {
            el.setAttribute("data-pk-theme", theme);
        }
        try {
            return read();
        } finally {
            for (const el of shown) {
                el.setAttribute("data-pk-theme", other);
            }
            // the shown theme's style, still without transitions, before the duration comes back
            getComputedStyle(root).getPropertyValue("--pk-duration");
        }
    } finally {
        if (kept[0]) {
            root.style.setProperty("--pk-duration", kept[0], kept[1]);
        } else {
            root.style.removeProperty("--pk-duration");
        }
    }
}

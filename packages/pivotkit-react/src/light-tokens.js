/*
 * The tokens an export writes: a workbook's colours and an HTML report's tokens as the report's light
 * theme resolves them, from a dark report too. Loaded with the menus (export-run.js), so the first
 * load does not carry it.
 */

/**
 * Tokens as the report's light theme resolves them, in either theme: a workbook and an HTML report are
 * light (black text in Excel, paper), so a host's light colours go into them from a dark report too.
 * A dark report shows the light theme for the read, on its root and, inside pivotkit-element, on the
 * element whose :host rules declare the tokens, and the dark one again in the same task, so nothing is
 * drawn in between; --pk-duration is 0ms meanwhile (on the root, important), so no transition of the
 * report's starts on the way there or back. A host's dark rules on data-pk-theme="dark" are left out
 * that way; rules on something else (an html[data-theme] of the page) apply in both. Lengths are the
 * same in both themes: the chart's module resolves them (chart-decorate.js, tokenLengths).
 * @param {HTMLElement} root  the report's root
 * @param {readonly string[]} names
 * @returns {Record<string, string>}  the tokens that are set
 */
export function lightTokens(root, names) {
    const host = /** @type {{ host?: Element }} */ (root.getRootNode()).host;
    const dark = [root, ...(host ? [host] : [])].filter((el) => el.getAttribute("data-pk-theme") === "dark");
    const read = () => {
        const style = getComputedStyle(root);
        return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]).filter(([, value]) => value));
    };
    if (!dark.length) {
        return read();
    }
    const kept = [root.style.getPropertyValue("--pk-duration"), root.style.getPropertyPriority("--pk-duration")];
    root.style.setProperty("--pk-duration", "0ms", "important");
    try {
        for (const el of dark) {
            el.setAttribute("data-pk-theme", "light");
        }
        try {
            return read();
        } finally {
            for (const el of dark) {
                el.setAttribute("data-pk-theme", "dark");
            }
            // the dark theme's style, still without transitions, before the duration comes back
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

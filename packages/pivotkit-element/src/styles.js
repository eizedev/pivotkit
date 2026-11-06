/*
 * The report's styles in the element's shadow root: one constructed stylesheet shared by every
 * element of the document (adoptedStyleSheets), or a <style> element where a browser has no
 * constructable stylesheets or refuses to adopt one (an element moved into another document).
 * Nothing is added to the page's own styles.
 */

import css from "pivotkit-react/styles.css";

/** @type {CSSStyleSheet | null | undefined} undefined: not tried yet; null: not available */
let shared;

/** The shared sheet, built on first use. */
function sheet() {
    if (shared === undefined) {
        try {
            shared = new CSSStyleSheet();
            shared.replaceSync(css);
        } catch {
            shared = null;
        }
    }
    return shared;
}

/**
 * Adds the styles to a shadow root.
 * @param {ShadowRoot} shadow
 * @returns {"adopted" | "style"} how (the browser tests read it from the shadow root instead)
 */
export function adoptStyles(shadow) {
    const s = sheet();
    if (s && "adoptedStyleSheets" in shadow) {
        try {
            shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, s];
            return "adopted";
        } catch {
            // a sheet of another document: fall through to a <style> element
        }
    }
    const style = shadow.ownerDocument.createElement("style");
    style.textContent = css;
    shadow.prepend(style);
    return "style";
}

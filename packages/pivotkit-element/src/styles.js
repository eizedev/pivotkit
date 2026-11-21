/*
 * The report's styles in the element's shadow root: one constructed stylesheet shared by every
 * element of the document (adoptedStyleSheets), or a <style> element where a browser has no
 * constructable stylesheets or refuses to adopt one (an element moved into another document).
 * Nothing is added to the page's own styles.
 *
 * The rules only the menus' panels match load with the menus (build.js, src/css-split.js):
 * addMenuStyles() puts them back in their place, in the shared sheet and in every <style> element.
 */

import { first } from "pivotkit-react/styles.css";
import { joinStyles } from "./css-split.js";

/** The menus' runs of rules, once the menus are loaded. @type {readonly string[] | null} */
let menuRuns = null;

/** @type {CSSStyleSheet | null | undefined} undefined: not tried yet; null: not available */
let shared;

/** The <style> elements of the fallback, held weakly: an element that is gone is not kept. @type {Set<WeakRef<HTMLStyleElement>>} */
const styleElements = new Set();

/** The stylesheet as it is now: the first load's rules, with the menus' once they are here. */
const cssNow = () => joinStyles(first, menuRuns);

/** The shared sheet, built on first use. */
function sheet() {
    if (shared === undefined) {
        try {
            shared = new CSSStyleSheet();
            shared.replaceSync(cssNow());
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
    style.textContent = cssNow();
    styleElements.add(new WeakRef(style));
    shadow.prepend(style);
    return "style";
}

/**
 * The menus' rules, in their place among the others: called once by the menus' module when it loads.
 * @param {readonly string[]} runs
 */
export function addMenuStyles(runs) {
    if (menuRuns) {
        return;
    }
    menuRuns = runs;
    const css = cssNow();
    shared?.replaceSync(css);
    for (const ref of styleElements) {
        const style = ref.deref();
        if (style) {
            style.textContent = css;
        } else {
            styleElements.delete(ref);
        }
    }
}

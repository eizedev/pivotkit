/*
 * The theme a report shows, from its theme prop, the nearest data-theme attribute above it (also
 * across a shadow root: the host page's <html data-theme> or the web component's host) and the
 * system setting; it follows changes of any of them.
 */

import { useCallback, useSyncExternalStore } from "react";
import { resolveTheme } from "./theme.js";

/**
 * The data-theme of the nearest element above `el` that has one, crossing shadow roots.
 * @param {Element | null} el
 */
export function hostTheme(el) {
    /** @type {Node | null} */
    let node = el;
    while (node) {
        if (node.nodeType === 1 && /** @type {Element} */ (node).hasAttribute("data-theme")) {
            return /** @type {Element} */ (node).getAttribute("data-theme");
        }
        node = node.parentNode ?? /** @type {ShadowRoot} */ (node).host ?? null;
    }
    return typeof document !== "undefined" ? document.documentElement.getAttribute("data-theme") : null;
}

const darkQuery = () => (typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null);

/**
 * @param {"auto" | "light" | "dark" | undefined} wanted
 * @param {React.RefObject<HTMLElement | null>} ref  the report's root element
 * @returns {"light" | "dark"}
 */
export function useResolvedTheme(wanted, ref) {
    const subscribe = useCallback(
        (onChange) => {
            if (wanted === "light" || wanted === "dark" || typeof document === "undefined") {
                return () => {};
            }
            const mo = typeof MutationObserver === "function" ? new MutationObserver(onChange) : null;
            // any data-theme in the page; a shadow root's own attributes are seen through its host's subtree
            mo?.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"], subtree: true });
            const mq = darkQuery();
            mq?.addEventListener("change", onChange);
            return () => {
                mo?.disconnect();
                mq?.removeEventListener("change", onChange);
            };
        },
        [wanted]
    );
    const snapshot = () => resolveTheme(wanted, typeof document === "undefined" ? null : hostTheme(ref.current), darkQuery()?.matches ?? false);
    return useSyncExternalStore(subscribe, snapshot, () => resolveTheme(wanted, null, false));
}

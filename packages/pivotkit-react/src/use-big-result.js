/*
 * More room for the result. "Enlarge" lets the result fill the report (the field list, the zones and
 * the tips step aside; Escape or the same button brings them back); "Full screen" puts the whole report
 * on the screen (the Fullscreen API on the report's root, also inside a shadow root; Escape leaves it;
 * not offered where the browser has no such API, such as Safari on an iPhone). Neither is part of the
 * view. And the report's least height: when the host's box is too low for the toolbar, the zones, the
 * tips and a result of its least height, the report grows (the page scrolls) instead of squeezing them.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { rootOf, useEscapeLayer } from "./dom.js";
import { useIsoLayoutEffect } from "./iso.js";

/** Whether the browser can put an element of the page on the full screen. */
function fullScreenSupported() {
    return typeof document !== "undefined" && Boolean(document.fullscreenEnabled) && typeof HTMLElement !== "undefined" && typeof HTMLElement.prototype.requestFullscreen === "function";
}
const never = () => () => {};

/**
 * The report's Enlarge and Full screen states and their toggles.
 * @param {React.RefObject<HTMLElement | null>} root
 */
export function useBigResult(root) {
    const [enlarged, setEnlarged] = useState(false);
    const [full, setFull] = useState(false);
    // read after hydration (the server snapshot is "no"), so a server render and its hydration match
    const fullOk = useSyncExternalStore(never, fullScreenSupported, () => false);
    useEscapeLayer(enlarged, () => setEnlarged(false));
    useEffect(() => {
        const el = root.current;
        if (!el) {
            return undefined;
        }
        const doc = el.ownerDocument;
        // inside a shadow root the document names the host; the shadow root names the report's root
        const sync = () => setFull(/** @type {any} */ (rootOf(el))?.fullscreenElement === el);
        doc.addEventListener("fullscreenchange", sync);
        return () => doc.removeEventListener("fullscreenchange", sync);
    }, [root]);
    const toggleEnlarged = useCallback(() => setEnlarged((on) => !on), []);
    const toggleFull = () => {
        const el = root.current;
        if (!el) {
            return;
        }
        if (/** @type {any} */ (rootOf(el))?.fullscreenElement === el) {
            el.ownerDocument.exitFullscreen?.().catch(() => undefined);
        } else {
            el.requestFullscreen?.().catch(() => undefined);
        }
    };
    return { enlarged, toggleEnlarged, full, fullOk, toggleFull };
}

/**
 * The least height of the report's root (its inline min-height): what its toolbar, zones,
 * tips, the result's own least height (CSS min-height) and the status line need. A host box that is
 * higher changes nothing; a lower one lets the report grow past it, so the page scrolls. Measured
 * after every render and when the report's size changes. The ref holds the last value (`need`, 0:
 * none) and what the report needs with its zones open (`open`), so a box too low for the open zones
 * folds them (PivotReport) instead of growing, and they stay folded until the box has room.
 * @param {React.RefObject<HTMLElement | null>} root
 * @param {React.RefObject<HTMLElement | null>} main  the column with the toolbar, the zones and the result
 * @returns {React.MutableRefObject<{ need: number, open: number }>}
 */
export function useFitHeight(root, main) {
    const fit = useRef({ need: 0, open: 0 });
    // every render may change what the column holds (tips, zones folded or open)
    useIsoLayoutEffect(() => {
        measureFit(root.current, main.current, fit);
    });
    useIsoLayoutEffect(() => {
        const el = root.current;
        if (!el || typeof ResizeObserver !== "function") {
            return undefined;
        }
        // in the next frame: a style set inside the observer's callback would resize what it observes
        // in the same frame (a "ResizeObserver loop" error in WebKit)
        let frame = 0;
        const ro = new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => measureFit(root.current, main.current, fit));
        });
        ro.observe(el);
        return () => {
            cancelAnimationFrame(frame);
            ro.disconnect();
        };
    }, [root, main]);
    return fit;
}

/**
 * Measures the least height (see useFitHeight) and sets it when it changed.
 * @param {HTMLElement | null} el
 * @param {HTMLElement | null} m
 * @param {{ current: { need: number, open: number } }} fit
 */
function measureFit(el, m, fit) {
    const result = m?.querySelector(":scope > .pk-result");
    if (!el || !m || !(result instanceof HTMLElement)) {
        return;
    }
    const least = parseFloat(el.ownerDocument.defaultView?.getComputedStyle(result).minHeight ?? "") || 0;
    // the content of the column with the result at its least height; the rest of the root around it
    const needMain = m.scrollHeight - result.offsetHeight + least;
    const need = Math.ceil(el.offsetHeight - m.clientHeight + needMain);
    // the zones open and shown (not folded, not enlarged): what the open layout needs
    if (!el.hasAttribute("data-pk-layout") && !el.hasAttribute("data-pk-enlarged")) {
        fit.current.open = need;
    }
    if (Math.abs(need - fit.current.need) > 1) {
        fit.current.need = need;
        // inline, so no rule of the page (a card's min-height: 0) squeezes the report below it
        el.style.minHeight = `${need}px`;
    }
}

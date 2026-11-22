/*
 * The report's size classes, from its own box, not the window: the width class ("narrow", "medium",
 * "wide", data-pk-size) and whether it is low (short), which folds the zones (use-zone-fold.js). Also
 * the report's least height (useFitHeight) and Enlarge and Full screen (useBigResult), which the
 * height check reads.
 */

import { useEffect, useRef, useState } from "react";
import { layerOpen } from "./dom.js";
import { useIsoLayoutEffect } from "./iso.js";
import { useBigResult, useFitHeight } from "./use-big-result.js";

/** Width classes of the report (its own width, not the window's). */
const sizeOf = (/** @type {number} */ width) => (width < 640 ? "narrow" : width < 1024 ? "medium" : "wide");

/**
 * Below this height (px, border box) the report starts with its zones folded into one line, the
 * compact layout; a narrow report (its zones stacked, one line each) below COMPACT_HEIGHT_NARROW.
 */
const COMPACT_HEIGHT = 600;
const COMPACT_HEIGHT_NARROW = 820;

/** Whether a report of this width class and height starts compact. */
const compactAt = (size, height) => height < (size === "narrow" ? COMPACT_HEIGHT_NARROW : COMPACT_HEIGHT);

/**
 * Watches the report's box: sets the width class and the measured height class before the first
 * paint, so a low report never shows its zones open for a frame, and again on every resize. A box
 * lower than the open zones need (fit) is low too. `checkLow` gets the check for a change inside a box
 * of the same size (useFitHeight calls it). Returns the cleanup.
 * @param {HTMLElement} el  the report's root
 * @param {{ fit: React.MutableRefObject<import("./use-big-result.js").FitState>, checkLow: React.MutableRefObject<() => void>,
 *   setSize: (size: string) => void, setMeasuredShort: (short: boolean) => void, setShort: (short: boolean) => void }} report
 */
function watchSize(el, { fit, checkLow, setSize, setMeasuredShort, setShort }) {
    const box = el.getBoundingClientRect();
    // the width class before the first paint too: never a frame of the wide layout on a phone
    setSize(sizeOf(box.width));
    const first = compactAt(sizeOf(box.width), box.height);
    setMeasuredShort(first);
    // the layout follows the first measure at once, not once a popover closes
    setShort(first);
    // low: below the size class's height, or too low for what the open zones need (then the
    // report would grow past its box; folded, it fits)
    const low = (/** @type {"narrow" | "medium" | "wide"} */ width, /** @type {number} */ height) => compactAt(width, height) || (fit.current.open > 0 && height <= fit.current.open + 1);
    // what the open zones need changed inside a box of the same size (an edit of the fields, a
    // language, a font): while the user works in the zones' section (a drag, the focus or the
    // pointer in it, or a menu open, such as one of its "+ Add") the check waits, and runs once
    // they have left it, so the area never folds under their hand. A resize of the box and the
    // load decide at once (below).
    let waiting = false;
    // where the user last pressed or put the focus: in the section or a menu (the layer), a pick
    // that closed its menu leaves the focus nowhere for a moment before it reaches the new chip
    let lastInArea = false;
    const inArea = (/** @type {EventTarget | null} */ t) => t instanceof Node && Boolean(el.querySelector(".pk-zone-section")?.contains(t) || el.querySelector(".pk-layer")?.contains(t));
    const note = (/** @type {Event} */ e) => {
        lastInArea = inArea(e.composedPath()[0] ?? e.target);
    };
    el.addEventListener("pointerdown", note, true);
    el.addEventListener("focusin", note, true);
    const busy = () => {
        const section = el.querySelector(".pk-zone-section");
        if (!section) {
            return false;
        }
        const active = /** @type {Document | ShadowRoot} */ (el.getRootNode()).activeElement;
        const focusGone = !active || active === el.ownerDocument.body;
        return Boolean(layerOpen(el.querySelector(".pk-layer")) || section.matches(":hover") || section.matches(":focus-within") || section.querySelector(".pk-dropping") || (lastInArea && focusGone));
    };
    const doc = el.ownerDocument;
    let again = 0;
    const retry = () => {
        clearTimeout(again);
        // after the focus or the pointer has moved on
        again = window.setTimeout(() => waiting && checkLow.current(), 0);
    };
    const watch = (on) => {
        const how = on ? "addEventListener" : "removeEventListener";
        el[how]("pointerout", retry);
        el[how]("focusout", retry);
        doc[how]("pointerup", retry);
    };
    checkLow.current = () => {
        if (busy()) {
            if (!waiting) {
                waiting = true;
                watch(true);
            }
            return;
        }
        if (waiting) {
            waiting = false;
            watch(false);
        }
        const now = el.getBoundingClientRect();
        setMeasuredShort(low(sizeOf(now.width), now.height));
    };
    const release = () => {
        el.removeEventListener("pointerdown", note, true);
        el.removeEventListener("focusin", note, true);
        clearTimeout(again);
        if (waiting) {
            waiting = false;
            watch(false);
        }
    };
    if (typeof ResizeObserver !== "function") {
        return release;
    }
    // Two observers on purpose: this one reads the report's box in its callback, so the width
    // class and the fold follow a resize in the same frame. useFitHeight's measures the column a
    // frame later (setting min-height in the callback would loop) and calls checkLow when what
    // the open zones need changes inside a box of the same size. A box at most 1 px higher than
    // what they need counts as too low (`<= open + 1`): measures round, and a growing report's
    // min-height makes its box exactly as high as it needs.
    const ro = new ResizeObserver(([entry]) => {
        const width = sizeOf(entry.contentRect.width);
        setSize(width);
        setMeasuredShort(low(width, entry.borderBoxSize?.[0]?.blockSize ?? el.getBoundingClientRect().height));
    });
    ro.observe(el);
    return () => {
        checkLow.current = () => {};
        release();
        ro.disconnect();
    };
}

/**
 * @param {{ root: React.RefObject<HTMLElement | null>, main: React.RefObject<HTMLElement | null>, grow: boolean,
 *   layer: HTMLElement | null }} options  main: the column with the toolbar, the zones and the result;
 *   grow: the report may grow past its box; layer: the report's layer of popovers
 */
export function useReportSize({ root, main, grow, layer }) {
    const [size, setSize] = useState("wide");
    // the measured height class, and the one the layout follows: a change waits while a popover is
    // open, so a resize never pulls the zones (and a chip menu's anchor) from under the user
    const [measuredShort, setMeasuredShort] = useState(false);
    const [short, setShort] = useState(false);
    // the low check, also when the open zones need more in a box that keeps its size (#93)
    const checkLow = useRef(() => {});
    // the report's least height: it grows past a host box too low for it (use-big-result.js)
    const fit = useFitHeight(root, main, grow, () => checkLow.current());
    const big = useBigResult(root);
    useIsoLayoutEffect(() => {
        const el = root.current;
        if (!el) {
            return undefined;
        }
        return watchSize(el, { fit, checkLow, setSize, setMeasuredShort, setShort });
    }, []);
    useEffect(() => {
        if (measuredShort === short) {
            return undefined;
        }
        const apply = () => {
            if (!layerOpen(layer)) {
                setShort(measuredShort);
            }
        };
        apply();
        if (!layer || typeof MutationObserver !== "function") {
            return undefined;
        }
        // a popover is open: apply when it closes
        const mo = new MutationObserver(apply);
        mo.observe(layer, { childList: true });
        return () => mo.disconnect();
    }, [measuredShort, short, layer]);
    return { size, short, big };
}

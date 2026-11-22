/*
 * The report's own keys, on its root: Ctrl or Cmd with Z, Shift Z or Y for Undo and Redo anywhere in
 * the report (a click anywhere in it focuses it), and Escape to end Enlarge.
 */

import { layerOpen } from "./dom.js";

/**
 * The root's keydown handler.
 * @param {{ big: { enlarged: boolean, setEnlarged: (on: boolean) => void }, layer: HTMLElement | null, open: boolean,
 *   undo: () => void, redo: () => void }} report  open: a drawer, filter or drill-down of the report is open
 * @returns {(e: React.KeyboardEvent) => void}
 */
export const reportKeys = ({ big, layer, open, undo, redo }) => (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    // Escape ends Enlarge: only inside the report (never a host dialog's key), only once no menu,
    // drawer, filter or drill-down of the report is open (those close first, on their own Escape)
    if (e.key === "Escape" && big.enlarged && !e.defaultPrevented && !layerOpen(layer) && !open) {
        e.preventDefault();
        big.setEnlarged(false);
        return;
    }
    // a modal dialog of the report (the preview of a file) keeps its keys: Undo never changes what is behind it
    if (target.closest("input, textarea, select, [contenteditable], [aria-modal='true']")) {
        return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) {
            redo();
        } else {
            undo();
        }
    } else if (mod && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        redo();
    }
};

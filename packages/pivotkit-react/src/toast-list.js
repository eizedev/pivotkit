// Which notes show at once (toasts.jsx), without React, so node --test checks it.

/** Notes shown at once; older ones would only push the status line apart. */
export const MAX_SHOWN = 2;

/** @typedef {import("./toasts.jsx").Toast} Toast */

/**
 * The notes shown after `toast` comes: at most MAX_SHOWN, the oldest note going first. An error goes
 * only when nothing else is left to go, since it stays until it is closed.
 * @param {Toast[]} list
 * @param {Toast} toast
 * @returns {Toast[]}
 */
export function withToast(list, toast) {
    const all = [...list, toast];
    while (all.length > MAX_SHOWN) {
        const note = all.findIndex((t) => t.tone !== "error");
        all.splice(note === -1 || note === all.length - 1 ? 0 : note, 1);
    }
    return all;
}

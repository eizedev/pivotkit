/*
 * The arrow keys of a group that is one stop of the Tab order. The field list (fields.jsx): the keys
 * move the focus between its fields (up, down, Home, End) and between the controls of a field (left,
 * right). The tabs Table and Chart (view-tabs.jsx): left and right, Home and End. Pure, so it is
 * tested without a DOM.
 */

/** The controls of a field in the list, left to right. */
export const SLOTS = Object.freeze(["handle", "name", "info", "menu"]);

/**
 * The control a key moves the focus to from the focused one, or null for a key the list leaves alone.
 * Up and down keep the column (the menu stays the menu); a row without it takes its name.
 * @param {string} key  KeyboardEvent.key
 * @param {{ row: number, slot: string }} at  the focused control
 * @param {number} rows  the fields shown
 * @param {(row: number) => readonly string[]} slotsOf  the controls a row has, in SLOTS order
 * @returns {{ row: number, slot: string } | null}
 */
export function roveTarget(key, at, rows, slotsOf) {
    if (rows <= 0) {
        return null;
    }
    const fit = (row, slot) => ({ row, slot: slotsOf(row).includes(slot) ? slot : "name" });
    if (key === "ArrowDown" || key === "ArrowUp") {
        return fit(Math.max(0, Math.min(rows - 1, at.row + (key === "ArrowDown" ? 1 : -1))), at.slot);
    }
    if (key === "Home" || key === "End") {
        return fit(key === "Home" ? 0 : rows - 1, at.slot);
    }
    if (key === "ArrowRight" || key === "ArrowLeft") {
        const slots = slotsOf(at.row);
        const i = Math.max(0, slots.indexOf(at.slot));
        return { row: at.row, slot: slots[Math.max(0, Math.min(slots.length - 1, i + (key === "ArrowRight" ? 1 : -1)))] };
    }
    return null;
}

/** The key that opens the menu of the field in focus: Shift+F10 or the context menu key. */
export const opensMenu = (e) => e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey);

/**
 * The tab a key moves the focus to (ARIA tabs, manual activation: the key only moves the focus, Enter
 * or Space shows the tab): left and right wrap around, Home and End go to the ends. Null for any
 * other key.
 * @param {string} key  KeyboardEvent.key
 * @param {number} at  the tab in focus
 * @param {number} count  the tabs
 * @returns {number | null}
 */
export function tabStep(key, at, count) {
    if (count <= 0) {
        return null;
    }
    switch (key) {
        case "ArrowRight":
            return (at + 1) % count;
        case "ArrowLeft":
            return (at - 1 + count) % count;
        case "Home":
            return 0;
        case "End":
            return count - 1;
        default:
            return null;
    }
}

/*
 * Which toolbar buttons move into "More" (toolbar.jsx): a fixed priority (OVERFLOW_ORDER) and the
 * room each button takes with the longest text of the built-in languages (TOOLBAR_ROOM), so the same
 * buttons show at the same width in English and German. Pure, so it is tested without a DOM.
 */

/**
 * The buttons that move into "More" when the toolbar is too narrow, first to go first: a fixed
 * priority. The order never depends on a button's own state (Layout open or folded), so a click never
 * moves it. Redo is not in the list: it stays next to Undo, which always stays.
 */
export const OVERFLOW_ORDER = Object.freeze(["reset", "layout", "views", "options", "chartType"]);

/**
 * The room (em of the toolbar's font) each part of the toolbar takes with the longest text of the
 * built-in languages, the gap after it included. How many buttons move into "More" follows from the
 * toolbar's width and these numbers, not from the texts shown: at the same width the same buttons
 * show in every language. (A host's own longer labels still fit: useOverflow measures as well.)
 */
export const TOOLBAR_ROOM = Object.freeze({
    // measured in Chromium at the playground's font: the longer of English and German with the gap
    // after it, plus 2 %; a wider font still fits, as useOverflow measures as well
    fields: 6.4,
    display: 15.3,
    chartType: 12.9,
    sep: 1,
    undo: 8.75,
    redo: 9.15,
    reset: 9.65,
    layout: 8.4,
    options: 8.75,
    views: 9.1,
    export: 7.5,
    more: 7.2
});

/**
 * How many entries of OVERFLOW_ORDER go into "More" in a toolbar `width` em wide: the fewest with
 * which the rest fits.
 * @param {number} width  in em
 * @param {boolean} narrow  the report is narrow: the Fields button is there too
 */
export function overflowLevel(width, narrow) {
    const room = TOOLBAR_ROOM;
    const fixed = (narrow ? room.fields : 0) + room.display + room.sep + room.undo + room.redo + room.export;
    let level = 0;
    const need = (n) => fixed + OVERFLOW_ORDER.slice(n).reduce((sum, id) => sum + room[id], 0) + (n > 0 ? room.more : 0);
    while (level < OVERFLOW_ORDER.length && need(level) > width) {
        level += 1;
    }
    return level;
}

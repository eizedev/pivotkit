/*
 * Which toolbar buttons move into "More" (toolbar.jsx): a fixed priority (OVERFLOW_ORDER) and the
 * room each button takes with the longest of its texts in every built-in language and the report's
 * own (toolbarRoom: the texts measured in the toolbar's font, plus what a button has around its text),
 * so the same buttons show at the same width in English and German, whatever font the browser draws
 * them in. TOOLBAR_ROOM is the estimate where nothing can be measured. Pure, tested without a DOM.
 */

/**
 * The buttons that move into "More" when the toolbar is too narrow, first to go first: a fixed
 * priority. The order never depends on a button's own state (Layout open or folded), so a click never
 * moves it. Reset goes first: it is wider than "More", which takes its place (New is not). Redo is
 * not in the list: it stays next to Undo, which always stays.
 */
export const OVERFLOW_ORDER = Object.freeze(["reset", "new", "layout", "views", "options", "chartType"]);

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
    new: 9.7,
    layout: 8.4,
    options: 8.75,
    views: 9.1,
    export: 7.5,
    more: 7.2
});

/** The parts of the toolbar that are buttons with a text, and those that open a menu (with a caret). */
const TEXT_BUTTONS = Object.freeze(["fields", "undo", "redo", "reset", "new", "layout"]);
const MENU_BUTTONS = Object.freeze(["chartType", "options", "views", "export", "more"]);

/**
 * Every text each part of the toolbar can show, from several label sets (the built-in languages and
 * the report's own): a list of texts per part; for `display` (Table | Chart) the pairs.
 * @param {ReadonlyArray<any>} sets  labels objects
 * @returns {Record<string, string[]> & { display: string[][] }}
 */
export function toolbarTexts(sets) {
    const out = /** @type {any} */ ({ fields: [], undo: [], redo: [], reset: [], new: [], layout: [], chartType: [], options: [], views: [], export: [], more: [], display: [] });
    const text = (v) => (typeof v === "string" ? v : "");
    for (const l of sets) {
        out.fields.push(text(l.showFields));
        out.undo.push(text(l.undo));
        out.redo.push(text(l.redo));
        out.reset.push(text(l.reset));
        out.new.push(text(l.newReport));
        out.layout.push(text(l.layout));
        out.options.push(text(l.options));
        out.views.push(text(l.views));
        out.export.push(text(l.exportLabel));
        out.more.push(text(l.more));
        out.chartType.push(...Object.values(l.chartTypes ?? {}).map(text));
        out.display.push([text(l.table), text(l.chart)]);
    }
    return out;
}

/**
 * The room (px) each part takes with its widest text: what a button has around its text (`chrome`:
 * a text button's, a menu button's, Table | Chart's; measured from those on screen) plus the widest
 * text (`measure`, in the toolbar's font) plus the gap after it. `sep`: the separator with its margins.
 * @param {ReturnType<typeof toolbarTexts>} texts
 * @param {(text: string, kind: "button" | "display") => number} measure
 * @param {{ text: number, menu: number, display: number, sep: number, gap: number }} chrome
 * @returns {Record<string, number>}
 */
export function toolbarRoom(texts, measure, chrome) {
    const widest = (list, /** @type {"button" | "display"} */ kind = "button") => Math.max(0, ...list.map((t) => measure(t, kind)));
    const room = /** @type {Record<string, number>} */ ({ sep: chrome.sep + chrome.gap });
    for (const id of TEXT_BUTTONS) {
        room[id] = chrome.text + widest(texts[id]) + chrome.gap;
    }
    for (const id of MENU_BUTTONS) {
        room[id] = chrome.menu + widest(texts[id]) + chrome.gap;
    }
    room.display = chrome.display + Math.max(0, ...texts.display.map(([a, b]) => measure(a, "display") + measure(b, "display"))) + chrome.gap;
    return room;
}

/**
 * How many entries of OVERFLOW_ORDER go into "More" in a toolbar `width` wide: the fewest with
 * which the rest fits.
 * @param {number} width  in the unit of `room` (em for TOOLBAR_ROOM, px for toolbarRoom)
 * @param {boolean} narrow  the report is narrow: the Fields button is there too
 * @param {Readonly<Record<string, number>>} [room]
 */
export function overflowLevel(width, narrow, room = TOOLBAR_ROOM) {
    const fixed = (narrow ? room.fields : 0) + room.display + room.sep + room.undo + room.redo + room.export;
    let level = 0;
    const need = (n) => fixed + OVERFLOW_ORDER.slice(n).reduce((sum, id) => sum + room[id], 0) + (n > 0 ? room.more : 0);
    while (level < OVERFLOW_ORDER.length && need(level) > width) {
        level += 1;
    }
    return level;
}

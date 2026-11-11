/*
 * Which toolbar buttons move into "More" (toolbar.jsx): a fixed priority (OVERFLOW_ORDER), the room
 * each button takes with the texts of the report's own language (toolbarRoom: the texts measured in
 * the toolbar's font, plus what a button has around its text) and the toolbar's width. A button moves
 * only when the room left cannot hold it: no reserve for a longer language, and a button that fits
 * stays even when one before it in the order had to go. TOOLBAR_ROOM is the estimate where nothing
 * can be measured. More shows what moved in its groups (MORE_GROUPS). Pure, tested without a DOM.
 */

/**
 * The buttons that move into "More" when the toolbar is too narrow, first to go first: a fixed
 * priority. The order never depends on a button's own state (Layout open or folded, the chart type
 * picked: its room is its longest type's), so a click never moves it. Layout goes first. Start over
 * and Views go last: Start over holds New, which must be as easy to find as Reset, and Views is where
 * a user saves the report. "data" is the place of a Data button (loading data):
 * a toolbar without one leaves it out and pays nothing for it. Redo is not in the list: it stays next
 * to Undo, which always stays, as do Table | Chart and Export.
 */
export const OVERFLOW_ORDER = Object.freeze(["layout", "options", "chartType", "data", "startOver", "views"]);

/**
 * The groups of "More", in order, each with a rule between it and the one before: starting over (its
 * two actions as entries of their own), the report's layout and settings, data, the saved views. A
 * group without an entry in More is not shown.
 */
export const MORE_GROUPS = Object.freeze([Object.freeze(["startOver"]), Object.freeze(["layout", "chartType", "options"]), Object.freeze(["data"]), Object.freeze(["views"])]);

/**
 * The room (em of the toolbar's font) each part of the toolbar takes, the gap after it included: the
 * estimate where the browser cannot measure (a server render, no canvas), with the longer of the
 * built-in languages' texts. The browser measures (toolbarRoom).
 */
export const TOOLBAR_ROOM = Object.freeze({
    fields: 6.4,
    display: 15.3,
    chartType: 12.9,
    sep: 1,
    undo: 8.75,
    redo: 9.15,
    startOver: 10.9,
    layout: 8.4,
    options: 8.75,
    data: 7.4,
    views: 9.1,
    export: 7.5,
    more: 7.2
});

/** The parts of the toolbar that are buttons with a text, and those that open a menu (with a caret). */
const TEXT_BUTTONS = Object.freeze(["fields", "undo", "redo", "layout"]);
const MENU_BUTTONS = Object.freeze(["chartType", "startOver", "options", "data", "views", "export", "more"]);

/**
 * Every text each part of the toolbar can show with the report's labels: a list of texts per part
 * (the chart type: every type's name, so picking one never moves a button); for `display`
 * (Table | Chart) the pair.
 * @param {any} labels
 * @returns {Record<string, string[]> & { display: string[][] }}
 */
export function toolbarTexts(labels) {
    const text = (v) => (typeof v === "string" ? v : "");
    return /** @type {any} */ ({
        fields: [text(labels.showFields)],
        undo: [text(labels.undo)],
        redo: [text(labels.redo)],
        startOver: [text(labels.startOver)],
        layout: [text(labels.layout)],
        options: [text(labels.options)],
        views: [text(labels.views)],
        data: [text(labels.data)],
        export: [text(labels.exportLabel)],
        more: [text(labels.more)],
        chartType: Object.values(labels.chartTypes ?? {}).map(text),
        display: [[text(labels.table), text(labels.chart)]]
    });
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
 * The entries of OVERFLOW_ORDER that go into "More" in a toolbar `width` wide: first as few as the
 * order allows (the first ones go until the rest fits, with "More"), then every one of them that the
 * room left still holds comes back, the last in the order first. A button moves only when the room
 * left really cannot hold it.
 * @param {number} width  in the unit of `room` (em for TOOLBAR_ROOM, px for toolbarRoom)
 * @param {boolean} narrow  the report is narrow: the Fields button is there too
 * @param {ReadonlyArray<string>} present  the entries of OVERFLOW_ORDER this toolbar has
 * @param {Readonly<Record<string, number>>} [room]
 * @returns {string[]}  in the order of OVERFLOW_ORDER
 */
export function overflowHidden(width, narrow, present, room = TOOLBAR_ROOM) {
    const fixed = (narrow ? room.fields : 0) + room.display + room.sep + room.undo + room.redo + room.export;
    const order = OVERFLOW_ORDER.filter((id) => present.includes(id));
    const need = (/** @type {string[]} */ shown) => fixed + shown.reduce((sum, id) => sum + (room[id] ?? 0), 0) + (shown.length < order.length ? room.more : 0);
    let shown = order;
    while (shown.length && need(shown) > width) {
        shown = shown.slice(1);
    }
    // the room left: a button that went first and fits comes back, the later in the order the sooner
    const gone = order.filter((id) => !shown.includes(id));
    for (const id of gone.reverse()) {
        const next = order.filter((o) => o === id || shown.includes(o));
        if (need(next) <= width) {
            shown = next;
        }
    }
    return order.filter((id) => !shown.includes(id));
}

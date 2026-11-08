/*
 * The history of a report as immutable data: every step is a view (as JSON text, so nobody can change
 * it afterwards) and a note that says what it did ("Region removed"), for "Undone: Region removed".
 * use-view-history.js keeps it in React state; these functions are pure, so every rule here is
 * tested without a DOM.
 *
 * Each step also carries a `tag`: the saved view the report shows (view-save.js: its name and where it
 * is kept), or null. Undo and Redo move it with the view, so a name never stays on a view it does
 * not belong to; a step keeps the tag of the one before unless it gives its own (New, Reset: null).
 *
 * The history belongs to one data schema (field names and types). A step on another schema starts a
 * new history from the view the report shows, so new data with the same columns keeps undo.
 */

/** Steps kept for undo. */
export const HISTORY_LIMIT = 100;

/**
 * @typedef {object} HistoryState
 * @property {string} schema   the schema the views were normalized against
 * @property {string} start    the start view, the target of reset
 * @property {string} present  the view the history is at
 * @property {Array<{ view: string, note: string, tag: any }>} past     older views, each with the note of the step that left it
 * @property {Array<{ view: string, note: string, tag: any }>} future   views undone, newest undo last
 * @property {any} tag  the saved view `present` is (an object), or null
 */

/**
 * @param {string} schema
 * @param {string} start  JSON of the start view
 * @param {string} [current]  JSON of the view shown now, default the start
 * @param {any} [tag]  the saved view it is
 * @returns {HistoryState}
 */
export function createState(schema, start, current = start, tag = null) {
    return { schema, start, present: current, past: [], future: [], tag };
}

/**
 * The state a step works on: a new history when the schema changed, and the view the report shows
 * recorded first when it differs from the history (a controlled host passed another view).
 * @param {HistoryState} state
 * @param {{ schema: string, start: string, shown: string, outside: string }} at
 */
export function settle(state, at) {
    let s = state.schema === at.schema ? state : createState(at.schema, at.start, at.shown);
    if (s.present !== at.shown) {
        s = record(s, at.shown, at.outside);
    }
    return s;
}

/**
 * A new step; an unchanged view is none (only its tag changes, when another is given). Clears the
 * steps that were undone.
 * @param {HistoryState} state
 * @param {string} view  JSON
 * @param {string} note
 * @param {any} [tag]  the saved view the step shows; default the tag of the view before
 * @returns {HistoryState}
 */
export function record(state, view, note, tag = state.tag) {
    if (view === state.present) {
        return tag === state.tag ? state : { ...state, tag };
    }
    const past = [...state.past, { view: state.present, note, tag: state.tag }].slice(-HISTORY_LIMIT);
    return { ...state, present: view, past, future: [], tag };
}

/**
 * One step back; `note` says what was undone (null when there was nothing to undo).
 * @param {HistoryState} state
 * @returns {{ state: HistoryState, note: string | null }}
 */
export function undo(state) {
    const last = state.past[state.past.length - 1];
    if (!last) {
        return { state, note: null };
    }
    return {
        state: { ...state, present: last.view, tag: last.tag, past: state.past.slice(0, -1), future: [...state.future, { view: state.present, note: last.note, tag: state.tag }] },
        note: last.note
    };
}

/**
 * One undone step again.
 * @param {HistoryState} state
 * @returns {{ state: HistoryState, note: string | null }}
 */
export function redo(state) {
    const next = state.future[state.future.length - 1];
    if (!next) {
        return { state, note: null };
    }
    return {
        state: { ...state, present: next.view, tag: next.tag, future: state.future.slice(0, -1), past: [...state.past, { view: state.present, note: next.note, tag: state.tag }] },
        note: next.note
    };
}

/**
 * Back to the start view, as one step that can be undone; the start is no saved view (tag null).
 * @param {HistoryState} state
 * @param {string} note
 */
export function reset(state, note) {
    return record(state, state.start, note, null);
}

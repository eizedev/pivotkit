/*
 * Loading a file and going back to the host's data are steps of the report's undo history, next to
 * the view's own steps (view-history.js). The view's history belongs to one data set; these steps
 * keep, for each data set left, the data and the view history it had, so Undo shows that data again
 * with its view and its own steps, and Redo goes forward again: one line of steps, whichever kind.
 *
 * The report's Undo takes a view step while the data shown has one, else a data step (undoData); Redo
 * the same way round. A new step of either kind drops what was undone (withoutFuture). Each data set
 * kept is memory, so at most DATA_STEPS steps are kept back and forth together, the oldest going first.
 * Pure: the data and the histories are values the report hands in. Loaded with the import UI (the
 * report has data steps only once a file was loaded).
 */

/** Data steps kept for Undo and Redo together: each may hold a whole data set. */
export const DATA_STEPS = 3;

/**
 * @typedef {object} DataStep
 * @property {any} data  the data shown before the step: the loaded file's (an object of the report's), or null for the host's
 * @property {import("./view-history.js").HistoryState} history  the view history it had
 * @property {string} note  what the step did ("tickets.csv loaded"), for "Undone: …"
 *
 * @typedef {{ past: DataStep[], future: DataStep[] }} DataSteps
 */

/** No data steps. */
export const NO_DATA_STEPS = Object.freeze({ past: Object.freeze([]), future: Object.freeze([]) });

/**
 * A new data step: the data shown before it, with its history, goes into the past; what was undone
 * goes, and so does that history's own redo (a new step). The oldest step goes past DATA_STEPS (Undo
 * and Redo only move steps between past and future, so the sum never grows there).
 * @param {DataSteps} steps
 * @param {{ data: any, history: import("./view-history.js").HistoryState }} before
 * @param {string} note
 * @returns {DataSteps}
 */
export function pushData(steps, before, note) {
    return { past: [...steps.past, { data: before.data, history: { ...before.history, future: [] }, note }].slice(-DATA_STEPS), future: [] };
}

/**
 * One data step back: the data and history to show, and the steps with the data shown now (and its
 * history as it is, with its redo) kept for Redo. Null when there is none.
 * @param {DataSteps} steps
 * @param {{ data: any, history: import("./view-history.js").HistoryState }} now
 * @returns {{ steps: DataSteps, step: DataStep } | null}
 */
export function undoData(steps, now) {
    const step = steps.past[steps.past.length - 1];
    if (!step) {
        return null;
    }
    return { steps: { past: steps.past.slice(0, -1), future: [...steps.future, { data: now.data, history: now.history, note: step.note }] }, step };
}

/**
 * One data step forward again; null when nothing was undone.
 * @param {DataSteps} steps
 * @param {{ data: any, history: import("./view-history.js").HistoryState }} now
 * @returns {{ steps: DataSteps, step: DataStep } | null}
 */
export function redoData(steps, now) {
    const step = steps.future[steps.future.length - 1];
    if (!step) {
        return null;
    }
    return { steps: { past: [...steps.past, { data: now.data, history: now.history, note: step.note }], future: steps.future.slice(0, -1) }, step };
}

/**
 * The steps without what was undone: a new step of the view drops the data steps undone before it.
 * @param {DataSteps} steps
 * @returns {DataSteps}
 */
export const withoutFuture = (steps) => (steps.future.length ? { past: steps.past, future: [] } : steps);

/**
 * The history the host's data had when it was left last (for "Back to original data": its view comes
 * back), or null when no step holds it.
 * @param {DataSteps} steps
 */
export function hostHistory(steps) {
    for (let i = steps.past.length - 1; i >= 0; i--) {
        if (steps.past[i].data === null) {
            return steps.past[i].history;
        }
    }
    return null;
}

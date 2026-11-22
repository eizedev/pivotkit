/*
 * What the report itself needs of its data steps (data-history.js) in the first load: none to start
 * with, and dropping those undone when the view takes a new step. The rest of the data steps loads
 * with the import UI.
 */

/** No data steps. */
export const NO_DATA_STEPS = Object.freeze({ past: Object.freeze([]), future: Object.freeze([]) });

/**
 * The steps without what was undone: a new step of the view drops the data steps undone before it.
 * @param {import("./data-history.js").DataSteps} steps
 * @returns {import("./data-history.js").DataSteps}
 */
export const withoutFuture = (steps) => (steps.future.length ? { past: steps.past, future: [] } : steps);

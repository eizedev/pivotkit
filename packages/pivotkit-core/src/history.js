/*
 * Undo and redo for a report: a history of view objects. Views are stored as JSON text, so a caller
 * changing an object it pushed does not change the history.
 */


/**
 * @template T
 * @param {T} startView  the view "reset" returns to
 * @param {{ limit?: number }} [options]  how many steps are kept (default 100)
 */
export function createHistory(startView, options = {}) {
    const limit = Math.max(1, Math.floor(options.limit ?? 100));
    const start = JSON.stringify(startView);
    /** @type {string[]} */
    let past = [];
    /** @type {string[]} */
    let future = [];
    let current = start;
    return {
        /** @returns {T} */
        get current() {
            return JSON.parse(current);
        },
        get canUndo() {
            return past.length > 0;
        },
        get canRedo() {
            return future.length > 0;
        },
        /** Records a new view; an unchanged view is not a step. Clears the redo steps. */
        push(view) {
            const next = JSON.stringify(view);
            if (next === current) {
                return false;
            }
            past.push(current);
            if (past.length > limit) {
                past = past.slice(past.length - limit);
            }
            current = next;
            future = [];
            return true;
        },
        /** @returns {T} the view after undoing one step */
        undo() {
            if (past.length) {
                future.push(current);
                current = past.pop();
            }
            return JSON.parse(current);
        },
        /** @returns {T} the view after redoing one step */
        redo() {
            if (future.length) {
                past.push(current);
                current = future.pop();
            }
            return JSON.parse(current);
        },
        /** Back to the start view, as one step that can be undone. */
        reset() {
            this.push(JSON.parse(start));
            return JSON.parse(current);
        }
    };
}

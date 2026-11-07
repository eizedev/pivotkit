/*
 * The events of <pivot-report>: CustomEvents that bubble and cross the shadow root (composed), so a
 * listener on the element, on a parent or on the document gets them. Their names are in EVENTS; the
 * template events carry respondWith(), with which the host hands back the result of its own (often
 * asynchronous) save or delete.
 */

/** The event names, by what they report. */
export const EVENTS = Object.freeze({
    viewChange: "pivot-view-change",
    cellClick: "pivot-cell-click",
    templateSave: "pivot-template-save",
    templateDelete: "pivot-template-delete",
    export: "pivot-export",
    tipDismiss: "pivot-tip-dismiss",
    sourceSwitch: "pivot-source-switch"
});

/**
 * Dispatches an event on the element.
 * @param {EventTarget} target
 * @param {string} type
 * @param {object} detail
 * @param {{ cancelable?: boolean }} [options]
 * @returns {boolean} false when a listener called preventDefault()
 */
export function emit(target, type, detail, options = {}) {
    return target.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, cancelable: Boolean(options.cancelable), detail }));
}

/**
 * Dispatches an event whose listener may answer with `event.detail.respondWith(value or promise)`,
 * called while the event is dispatched (in the listener itself, not later). The returned promise
 * settles with that answer: the report shows "Saved" (or removes the template) when it resolves, and
 * an error with its message when it rejects. Without an answer it resolves at once, with a console
 * warning: the page may have no listener, or call respondWith() too late (after an await).
 * @param {EventTarget} target
 * @param {string} type
 * @param {object} detail
 * @returns {Promise<unknown>}
 */
export function request(target, type, detail) {
    let open = true;
    let answered = false;
    /** @type {unknown} */
    let answer;
    /** @param {unknown} value */
    const respondWith = (value) => {
        if (!open) {
            throw new DOMException(`respondWith() must be called while ${type} is dispatched`, "InvalidStateError");
        }
        if (answered) {
            throw new DOMException(`respondWith() was already called for this ${type} event`, "InvalidStateError");
        }
        answered = true;
        answer = value;
    };
    try {
        emit(target, type, { ...detail, respondWith });
    } finally {
        open = false;
    }
    if (!answered) {
        // the report says "saved" or "deleted" now; whether the page did anything, it cannot know
        const name = /** @type {{ localName?: string }} */ (target).localName ?? "pivot-report";
        console.warn(`<${name}>: no listener answered ${type} with event.detail.respondWith(); the report treats it as done`);
    }
    return Promise.resolve(answer);
}

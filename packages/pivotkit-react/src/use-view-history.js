/*
 * The view of a report and its undo history (view-history.js), controlled or not:
 *
 * - controlled: `view` + `onViewChange`. The report shows the view the host passes. A change calls
 *   onViewChange; the history stays inside the report and keeps its steps when the host passes back
 *   the view it got, however often it renders. A view the host changes on its own becomes a step
 *   ("change from outside") the next time the user acts, so undo goes back over it too.
 * - uncontrolled: `defaultView` is the start; the report keeps the view itself and reports changes.
 *
 * New data with the same columns (schema) keeps the history; another schema starts a new one from the
 * view shown, normalized against the new columns. Reset goes back to the first view the report got.
 *
 * keyOf(view) is a view as the history keeps it (normalized JSON): what viewKey is once it is shown,
 * so a saved view can be compared with the one shown (unsaved changes).
 *
 * restore(view) shows a view the report found itself (the tab's stored view, a shared link) as if it
 * had started on it: a new history at that view, the start (the target of Reset) unchanged.
 */

import { useCallback, useMemo, useState } from "react";
import { emptyView, normalize } from "pivotkit-core";
import { createState, record, redo as redoStep, reset as resetStep, settle, undo as undoStep } from "./view-history.js";
import { withHostOrders } from "./view-ops.js";

/**
 * The identity of a data set's columns: names and types.
 * @param {import("pivotkit-core").Encoded} encoded
 */
export function schemaKeyOf(encoded) {
    return JSON.stringify(encoded.schema.fields.map((f) => [f.name, f.type]));
}

/**
 * @param {{ encoded: import("pivotkit-core").Encoded, view: object | undefined, defaultView: object | undefined,
 *   onViewChange?: (view: import("pivotkit-core").View) => void, limits: object | undefined, outsideNote: string,
 *   orderOf?: (field: string) => unknown[] | undefined }} options  `orderOf`: the host's custom order of a
 *   field (fieldDefaults.order), applied to every view shown (withHostOrders); keep it stable
 * @returns {{ view: import("pivotkit-core").View, viewKey: string, commit: (next: object, note: string) => boolean,
 *   undo: () => string | null, redo: () => string | null, reset: (note: string) => void,
 *   restore: (view: object) => void, keyOf: (view: object) => string, canUndo: boolean, canRedo: boolean, canReset: boolean }}
 */
export function useViewHistory({ encoded, view, defaultView, onViewChange, limits, outsideNote, orderOf }) {
    const controlled = view !== undefined;
    const schema = useMemo(() => schemaKeyOf(encoded), [encoded]);
    const json = useCallback(
        (v) => {
            const normalized = normalize(v ?? emptyView(), encoded, { limits }).view;
            const ordered = orderOf ? withHostOrders(normalized, orderOf) : normalized;
            // the added entries are normalized too: their items take the field's type
            return JSON.stringify(ordered === normalized ? normalized : normalize(ordered, encoded, { limits }).view);
        },
        [encoded, limits, orderOf]
    );
    // the first view the report got is the start: reset goes back to it
    const [initial] = useState(() => (controlled ? view : defaultView) ?? null);
    const start = useMemo(() => json(initial), [json, initial]);
    const [state, setState] = useState(() => createState(schema, start));

    const viewKey = controlled ? JSON.stringify(view) : null;
    const shown = useMemo(() => {
        if (viewKey !== null) {
            return json(JSON.parse(viewKey));
        }
        return state.schema === schema ? state.present : json(JSON.parse(state.present));
    }, [viewKey, json, state, schema]);
    const current = useMemo(() => /** @type {import("pivotkit-core").View} */ (JSON.parse(shown)), [shown]);
    // the history a step works on (pure: a new schema or an outside change, settled)
    const live = useMemo(() => settle(state, { schema, start, shown, outside: outsideNote }), [state, schema, start, shown, outsideNote]);

    const apply = useCallback(
        (next) => {
            setState(next);
            onViewChange?.(JSON.parse(next.present));
        },
        [onViewChange]
    );
    /** Records a change; false when it changes nothing. */
    const commit = useCallback(
        (next, note) => {
            const s = record(live, json(next), note);
            if (s === live) {
                return false;
            }
            apply(s);
            return true;
        },
        [live, json, apply]
    );
    /** The note of the step undone, or null. */
    const undo = useCallback(() => {
        const { state: s, note } = undoStep(live);
        if (note !== null) {
            apply(s);
        }
        return note;
    }, [live, apply]);
    const redo = useCallback(() => {
        const { state: s, note } = redoStep(live);
        if (note !== null) {
            apply(s);
        }
        return note;
    }, [live, apply]);
    const reset = useCallback(
        (note) => {
            const s = resetStep(live, note);
            if (s !== live) {
                apply(s);
            }
        },
        [live, apply]
    );

    const restore = useCallback((next) => apply(createState(schema, start, json(next))), [schema, start, json, apply]);

    const canUndo = live.past.length > 0;
    const canRedo = live.future.length > 0;
    const canReset = live.present !== live.start;
    return useMemo(
        () => ({ view: current, viewKey: shown, commit, undo, redo, reset, restore, keyOf: json, canUndo, canRedo, canReset }),
        [current, shown, commit, undo, redo, reset, restore, json, canUndo, canRedo, canReset]
    );
}

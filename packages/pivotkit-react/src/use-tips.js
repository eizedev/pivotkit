/*
 * The tips and notices above the result (tip-list.jsx): the rows of the tips' table (tips.js) whose
 * condition holds for the report as it is now, at most TIP_LIMIT tips besides the notices, in the
 * report's language, with what their buttons do. Some tips wait for what the user did (useActivity):
 * changes of the view, the first drag, a cell drilled into, the view saved.
 */

import { useCallback, useRef, useState } from "react";
import { groupingName } from "./names.js";
import { NOTICES, activeEntries, tipActionText, tipContext, tipText } from "./notices.js";
import { withoutFilters } from "./tip-state.js";
import { groupField, setChart, setTotal, swapAxes } from "./view-ops.js";

/** What the user did in this session, as far as the tips ask (notices.js: tipContext). */
export function useActivity() {
    // changes of the view in this session, and their number at the first drag
    const changesRef = useRef(0);
    const [changes, setChanges] = useState(0);
    const [dragAt, setDragAt] = useState(/** @type {number | null} */ (null));
    // `changes` when the view was last saved: the tip to save it waits for new changes
    const [savedAt, setSavedAt] = useState(0);
    const [drilled, setDrilled] = useState(false);
    const countChange = useCallback(() => {
        changesRef.current += 1;
        setChanges(changesRef.current);
    }, []);
    // the first drag: a tip about Undo and the menus follows (it counts the change it makes)
    const noteDrag = useCallback(() => setDragAt((at) => at ?? changesRef.current + 1), []);
    const noteSaved = useCallback(() => setSavedAt(changesRef.current), []);
    const noteDrilled = useCallback(() => setDrilled(true), []);
    return { changes, dragAt, savedAt, drilled, countChange, noteDrag, noteSaved, noteDrilled };
}

/**
 * The view a tip's action makes of `view`, with its step's note, or null for an action that is no
 * change of the view.
 * @returns {[object, import("./use-steps.js").StepNote] | null}
 */
function tipStep(action, view, params, { nameOf, labels }) {
    switch (action) {
        case "swap":
            return [swapAxes(view), { step: "swap" }];
        case "removeFilters":
            return [withoutFilters(view), { step: "filtersRemoved" }];
        case "groupDate":
            return [groupField(view, params.source, params.unit, { name: groupingName(nameOf(params.source), params.unit, labels) }).view, { step: "group", field: nameOf(params.source) }];
        case "bars":
            return [setChart(view, "bar"), { step: "chart", type: "bar" }];
        case "auto":
            return [setChart(view, "auto"), { step: "chart", type: "auto" }];
        case "colSubtotalsOff":
            return [setTotal(view, "colSubtotals", false), { step: "totals" }];
        default:
            return null;
    }
}

/**
 * The tips shown now, and what their buttons do.
 * @param {{ table: import("./deferred.js").TipsTable | null, view: import("pivotkit-core").View, display: string,
 *   pivot: ReturnType<typeof import("./use-pivot-result.js").usePivotResult>, encoded: import("pivotkit-core").Encoded, empty: boolean,
 *   typeOf: (field: string) => string, showTable: boolean, activity: ReturnType<typeof useActivity>, canSave: boolean,
 *   dismissed: { allowed: any, dismissed: string[] }, labels: any, locale: string, commit: import("./use-steps.js").Commit,
 *   nameOf: (field: string) => string, openViews: () => void, narrow?: boolean }} report  table: the tips' table once loaded (until then
 *   the notices alone); display: what the result shows; showTable: the table is shown; dismissed: useDismissed's;
 *   openViews: a tip's "Save view" opens the Views menu; narrow: a phone's report, where a notice takes a tip's place
 */
export function tipsShown({ table, view, display, pivot, encoded, empty, typeOf, showTable, activity, canSave, dismissed, labels, locale, commit, nameOf, openViews, narrow = false }) {
    const context = tipContext({ view, display, result: pivot.result, encoded, failed: Boolean(pivot.error), empty, typeOf, fields: labels.core.fields, series: pivot.series, tableShown: showTable, drilled: activity.drilled, changes: activity.changes, dragAt: activity.dragAt, canSave, savedAt: activity.savedAt, chartPlan: pivot.plan });
    const tips = activeEntries(table?.TIPS ?? NOTICES, context, { allowed: dismissed.allowed, dismissed: dismissed.dismissed, noticesCount: narrow }).map((t) => ({
        id: t.id,
        params: t.params,
        icon: t.entry.icon ?? "info",
        notice: t.entry.kind === "notice",
        action: t.entry.action ?? "",
        text: tipText(t.id, t.params, labels, locale),
        actionText: tipActionText(t.entry, t.params, labels)
    }));
    const run = (id, action) => {
        if (action === "saveTemplate") {
            openViews();
            return;
        }
        const step = tipStep(action, view, tips.find((t) => t.id === id)?.params ?? {}, { nameOf, labels });
        if (step) {
            commit(...step);
        }
    };
    return { tips, run };
}

/*
 * The steps of the report's undo history as the user takes them: commit() for every change of the
 * view (the field list, the zones, the toolbar, the table and the chart get it as a prop), Undo,
 * Redo and Reset, each said in a status note. The view's own steps live in useViewHistory; Undo and
 * Redo take a data step (a file loaded, the original data, import-steps.js) once the view has none.
 */

import { useCallback, useEffect, useRef } from "react";
import { fill } from "./labels.js";
import { zoneOverLimit } from "./view-ops.js";

/**
 * @typedef {{ step: string, removed?: boolean, field?: string, zone?: string, name?: string, display?: string, type?: string }} StepNote
 *   what a step did, for "Undone: ..."; `removed`: a removal, which offers Undo
 * @typedef {(next: object, note?: StepNote, tag?: any) => boolean} Commit  a change of the view; `tag`: the
 *   saved view it is (history.tag); false when the view did not change
 */

/**
 * A step's text for "Undone: ...", from its note.
 * @param {any} labels
 * @param {any} note  a StepNote
 */
function stepText(labels, note) {
    const template = Object.hasOwn(labels.steps, note.step) ? labels.steps[note.step] : labels.steps.change;
    return fill(template, {
        field: note.field ?? "",
        name: note.name ?? "",
        zone: labels.zones[note.zone] ?? note.zone ?? "",
        display: note.display === "both" ? labels.bothShown : note.display ? labels[note.display] : "",
        type: note.type ? labels.chartTypes[note.type] : ""
    });
}

/**
 * @param {{ history: ReturnType<typeof import("./use-view-history.js").useViewHistory>, labels: any, limits: object | undefined,
 *   locale: string, announce: (text: string, extra?: object) => void, moveData: ((back: boolean) => string | null) | null,
 *   newStep: () => void, onChange: () => void, onAdded: () => void }} options  moveData: Undo (true) or Redo of a
 *   data step, null without the import UI; newStep: drops the data steps undone; onChange: the view changed by a
 *   step; onAdded: a field was placed by it (use-zone-fold.js: keepOpen)
 */
export function useSteps({ history, labels, limits, locale, announce, moveData, newStep, onChange, onAdded }) {
    // Undo and Redo: the view's own steps first, then a data step (a file loaded, the original data)
    const undo = () => {
        const note = history.canUndo || !moveData ? history.undo() : moveData(true);
        if (note !== null) {
            announce(fill(labels.toastUndone, { step: note }));
        }
    };
    const redo = () => {
        const note = history.canRedo || !moveData ? history.redo() : moveData(false);
        if (note !== null) {
            announce(fill(labels.toastRedone, { step: note }));
        }
    };
    // a status note's Undo runs later, on the history of that moment
    const undoLater = useRef(undo);
    useEffect(() => {
        undoLater.current = undo;
    });
    /** Undo as it is when it runs (a status note's, the import UI's). */
    const undoLatest = useCallback(() => undoLater.current(), []);
    /** A status note's action that takes the step back. */
    const undoAction = useCallback(() => ({ label: labels.undo, run: undoLatest }), [labels, undoLatest]);
    // Reset shows the start view, no saved view: the history's step has no tag (Undo brings it back)
    const reset = useCallback(() => {
        history.reset(labels.steps.reset);
        newStep();
        // as New's note: Undo right there brings the view back
        announce(labels.toastReset, { action: undoAction() });
    }, [history, labels, announce, newStep, undoAction]);
    /**
     * Every change of the view: `note.step` names it for "Undone: ...". Adding needs no note on
     * screen (the chip appears); a removal offers Undo.
     */
    const commit = useCallback(
        /** @type {Commit} */
        (next, note = { step: "change" }, tag = undefined) => {
            // a field beyond the limit of its zone would vanish in normalize(): refuse the step and say so
            const over = note.step === "template" ? null : zoneOverLimit(next, limits);
            if (over) {
                announce(fill(labels.zoneFull, { zone: labels.zones[over.zone], max: over.max.toLocaleString(locale) }), { tone: "error" });
                return false;
            }
            const changed = history.commit(next, stepText(labels, note), tag);
            if (changed && note.step === "added") {
                onAdded();
            }
            if (changed) {
                onChange();
                newStep();
            }
            if (changed && note.removed) {
                announce(fill(labels.toastRemoved, { field: note.field ?? "" }).trim(), { action: undoAction() });
            }
            // whether the view changed: "+ Add" waits for its chip only then
            return changed;
        },
        [history, labels, announce, limits, locale, newStep, onChange, onAdded, undoAction]
    );
    return { commit, undo, redo, reset, undoLatest, undoAction };
}

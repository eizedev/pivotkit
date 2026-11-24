/*
 * A view from a layout (field names): the one way the operations and pivotkit-cli make one, and
 * how an operation's input gives a view or a layout.
 */

import { PivotkitError, describeSource, suggestLayout, viewFromLayout } from "pivotkit-core";
import { OperationError } from "./errors.js";
import { findingText } from "./findings.js";

/** How a note of viewFromLayout or suggestLayout counts as a finding. */
export const LAYOUT_NOTE_SEVERITY = Object.freeze({ noSuggestion: "error", dateGrouped: "info", unusedGroup: "warning", unusedMap: "warning" });

/** A note of a layout as a finding. @param {{ code: string, message: string }} note */
export const noteFinding = (note) => ({ severity: /** @type {"error" | "warning" | "info"} */ (LAYOUT_NOTE_SEVERITY[note.code] ?? "warning"), code: note.code, path: "", message: findingText(note.message) });

/**
 * A view from field names, the one way the operations and pivotkit-cli make one: pivotkit-core's
 * viewFromLayout over the source's field description. With `suggest`, suggestLayout's picks come
 * first and the layout's parts replace them (a suggested grouping stays only while its field stays
 * where the suggestion put it); nothing to group by (noSuggestion) counts only while the layout places
 * no field itself. A layout of another shape is INVALID_INPUT, one too large LIMIT_EXCEEDED.
 * @param {{ rows: number | null, fields: any[] }} description  describeSource's, or env.drafting's narrowing of it
 * @param {import("pivotkit-core").Layout} layout
 * @param {{ suggest?: boolean, locale?: string }} [options]
 * @returns {{ view: Record<string, any>, name: string, picks: import("pivotkit-core").LayoutPick[], notes: import("pivotkit-core").LayoutNote[] }}
 */
export function viewOfLayout(description, layout = {}, options = {}) {
    const locale = options.locale ? { locale: options.locale } : {};
    const suggestion = options.suggest ? suggestLayout(description, locale) : null;
    const merged = { ...(suggestion?.layout ?? {}), ...layout };
    if (suggestion && layout.groups === undefined && (layout.rows || layout.cols) && merged.groups) {
        const placed = new Set([...(merged.rows ?? []), ...(merged.cols ?? [])].map((n) => n.toLowerCase()));
        merged.groups = merged.groups.filter((g) => placed.has(g.field.toLowerCase()));
    }
    let built;
    try {
        built = viewFromLayout(merged, description, locale);
    } catch (e) {
        if (e instanceof PivotkitError) {
            throw new OperationError(e.code === "LIMIT_EXCEEDED" ? "LIMIT_EXCEEDED" : "INVALID_INPUT", `layout: ${String(e.message).replace(/^viewFromLayout: /, "")}`);
        }
        throw e;
    }
    const placed = Boolean(layout.rows?.length || layout.cols?.length);
    const notes = [...(suggestion?.notes ?? []).filter((n) => !(n.code === "noSuggestion" && placed)), ...built.notes];
    // a part the layout gives is no pick of the rules: said as "given", so picks and view agree
    const given = /** @type {const} */ (["rows", "cols", "values"]).filter((part) => layout[part] !== undefined);
    const picks = suggestion ? [...suggestion.picks.filter((p) => !given.includes(p.part)), ...given.map((part) => ({ part, code: /** @type {any} */ ("given"), others: [], text: `${part}: as given` }))] : [];
    return { view: built.view, name: built.name, picks, notes };
}

/** An input gives a view or a layout: exactly one, checked before any data is read. */
export function checkViewOrLayout(input) {
    if (input.view === undefined && input.layout === undefined) {
        throw new OperationError("INVALID_INPUT", "input needs a view or a layout");
    }
    if (input.view !== undefined && input.layout !== undefined) {
        throw new OperationError("INVALID_INPUT", "input takes a view or a layout, not both");
    }
}

/**
 * The description of a source a draft reads: describeSource's, narrowed by the front end's
 * env.drafting where it has one.
 * @param {{ data: any }} source
 * @param {import("../operations.js").OperationEnv} env
 */
export function describedFor(source, env) {
    const described = describeSource(source.data, { items: 0 });
    return env.drafting ? env.drafting(described) : described;
}

/**
 * The view of an input that gives a view or a layout (exactly one; the caller checked it with
 * checkViewOrLayout before it read the data): the layout's view as a view file with its name, and its
 * notes as findings.
 * @param {{ view?: unknown, layout?: any }} input
 * @param {{ data: any }} source
 * @param {import("../operations.js").OperationEnv} env
 */
export function viewOrLayout(input, source, env) {
    if (input.view !== undefined) {
        return { view: input.view, notes: [], fromLayout: false };
    }
    const built = viewOfLayout(describedFor(source, env), input.layout, env.locale ? { locale: env.locale } : {});
    return { view: { format: "pivotkit-view", formatVersion: 2, name: built.name, view: built.view }, notes: built.notes.map(noteFinding), fromLayout: true };
}

/*
 * The area above the result (unused.jsx): what a loaded view (a file, a link, a saved view) left out,
 * or the host's view (`view`, else the first `defaultView`) when it came later, as far as its lines
 * still apply to the view shown (unused-keep.js); then what computePivot() could not use. A loaded
 * view's lines stay until they are dismissed or another view is loaded; the host's view is checked
 * once per distinct view (a host may render the same view again and again), not while the data is
 * still on its way, and not while a file's data is shown (the host's view is the host's data's
 * business then).
 */

import { useCallback, useMemo, useState } from "react";
import { normalize } from "pivotkit-core";
import { stillApplies, unusedNotes } from "./unused-keep.js";

/**
 * The host's view as JSON, to compare it by value; "null" for none, and for one that is no JSON (a
 * cycle, a BigInt): normalize() reports nothing of that kind here.
 * @param {unknown} view
 */
function keyOfHostView(view) {
    try {
        return JSON.stringify(view ?? null) ?? "null";
    } catch {
        return "null";
    }
}

/** The first issues of the result, as lines of the area. */
const resultIssues = (result, empty) => (result && !empty ? result.issues.slice(0, 20) : []);

/**
 * @param {import("./index.js").PivotReportProps} props
 * @param {{ imported: object | null, encoded: import("pivotkit-core").Encoded, limits: object | undefined, keyOf: (view: object) => string,
 *   view: import("pivotkit-core").View, result: any, empty: boolean, locale: string }} report  imported: the file's data shown, null for the host's
 */
export function useUnusedNotes(props, { imported, encoded, limits, keyOf, view, result, empty, locale }) {
    const { view: viewProp, defaultView, loading = false } = props;
    // `loaded`: that view normalized, for the lines that still apply to the view shown; `after`: the
    // host's view then, so a host's broken view given later takes the area over
    const [leftOut, setLeftOut] = useState(/** @type {{ notes: import("./unused.jsx").UnusedNote[], loaded: any, after: string | null }} */ ({ notes: [], loaded: null, after: null }));
    const [dismissedKey, setDismissedKey] = useState(/** @type {string | null} */ (null));
    // views loaded from outside: a new one is a new warning (open again, not dismissed), also with
    // the same parts as the view before
    const [loads, setLoads] = useState(0);
    // the status note of the last load said already that some parts did not fit
    const [said, setSaid] = useState(false);
    const [startView] = useState(() => defaultView);
    const hostKey = keyOfHostView(viewProp !== undefined ? viewProp : startView);
    const hostNotes = useMemo(() => {
        if (hostKey === "null" || loading || imported || encoded.schema.fields.length === 0) {
            return null;
        }
        const raw = JSON.parse(hostKey);
        if (raw === null) {
            return null;
        }
        const notes = unusedNotes(normalize(raw, encoded, { limits }).issues, raw);
        return notes.length ? { notes, loaded: JSON.parse(keyOf(raw)) } : null;
    }, [hostKey, loading, imported, encoded, limits, keyOf]);
    /**
     * A view was loaded from outside: what it left out (`given`: the view as given, null for none) and
     * whether its status note says so. `reopen`: a warning dismissed before shows again (New, which
     * loads nothing, leaves a dismissed host's warning dismissed when the host gives it again).
     */
    const noteLoad = useCallback(
        (/** @type {import("./unused.jsx").UnusedNote[]} */ notes, /** @type {object | null} */ given, /** @type {boolean} */ saidSo, reopen = true) => {
            setLeftOut({ notes, loaded: given ? JSON.parse(keyOf(given)) : null, after: hostKey });
            if (reopen) {
                setDismissedKey(null);
            }
            setLoads((x) => x + 1);
            setSaid(saidSo);
        },
        [keyOf, hostKey]
    );
    const fromHost = hostNotes !== null && leftOut.after !== hostKey;
    const given = fromHost ? hostNotes : leftOut;
    const notes = useMemo(
        () => [...given.notes.filter((n) => stillApplies(n, given.loaded, view)), ...resultIssues(result, empty).map((issue) => ({ issue, raw: view }))],
        [given, result, empty, view]
    );
    // the warning's identity: its view's lines, all of them (one that no longer applies does not open
    // or bring back a warning folded or dismissed), and the load
    const notesKey = useMemo(
        () => JSON.stringify([fromHost ? "host" : loads, ...given.notes.map((n) => ("issue" in n ? [n.issue.path, n.issue.message] : n.text)), ...resultIssues(result, empty).map((i) => [i.path, i.message])]),
        [fromHost, given, loads, result, empty]
    );
    // computation may fail before it gives a locale; the lines still follow the view's
    const fallbackLocale = useMemo(() => {
        const requested = view.formatting?.locale || locale;
        try { new Intl.NumberFormat(requested); return requested; }
        catch { return "en-US"; }
    }, [view.formatting?.locale, locale]);
    return {
        notes,
        notesKey,
        dismissed: dismissedKey === notesKey,
        dismiss: () => setDismissedKey(notesKey),
        // the status note "View loaded; some parts did not fit this data" said it
        quiet: said && !fromHost,
        locale: result?.locale ?? fallbackLocale,
        noteLoad
    };
}

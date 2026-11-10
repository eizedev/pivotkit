/*
 * The warning above the result when a view has parts the report could not use (a template, a link, a
 * loaded file, the host's `view` or `defaultView`): a notice that is open the first time it shows for
 * a view and folds with its title, one line per part in plain words (what it is about, what happened,
 * what is used instead) with the technical path below it for developers, and an x that dismisses it.
 * A line goes once the part of the view it names is changed by hand (unused-keep.js), and comes back
 * with Undo. The plain words load on demand (unused-load.js); until they are here, or when they fail, a line shows the
 * core's short message. An open warning shows its first lines (three, two on a narrow report) and a
 * button for the rest. A screen reader hears the title once, through a polite live region that is
 * always there (not when the status note said it already); the warning never takes the focus.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { fieldLabel } from "pivotkit-core";
import { Icon } from "./icons.jsx";
import { fill, plural } from "./labels.js";
import { valueLabel } from "./names.js";
import { loadUnused, unusedNow, unusedTexts } from "./unused-load.js";

/**
 * @typedef {{ issue: import("pivotkit-core").Issue, raw: unknown } | { text: string, path?: string }} UnusedNote
 *   an issue of normalize() with the view it was given, or a line in words already (a view trimmed to
 *   the limits, with the zone it is about as `path`)
 */

/** The lines an open warning shows before "Show N more": fewer on a narrow report. */
const FIRST = { narrow: 2, wide: 3 };
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * @param {{ notes: UnusedNote[], notesKey: string, dismissed: boolean, onDismiss: (next: HTMLElement | null) => void,
 *   labels: import("./labels.js").UiLabels, locale: string, narrow: boolean, quiet: boolean }} props
 *   `quiet`: the status note said it already (a view loaded partly), so the live region stays empty
 */
export function Unused({ notes, notesKey, dismissed, onDismiss, labels, locale, narrow, quiet }) {
    const lang = labels.lang;
    const show = notes.length > 0 && !dismissed;
    // the view whose warning was folded, and whose lines are all shown: a new view's opens again, short
    const [folded, setFolded] = useState(/** @type {string | null} */ (null));
    const [all, setAll] = useState(/** @type {string | null} */ (null));
    const [got, setGot] = useState(/** @type {{ lang: string, value: import("./unused-load.js").UnusedLoaded } | null} */ (null));
    const box = useRef(/** @type {HTMLDivElement | null} */ (null));
    const now = got?.lang === lang ? got.value : unusedNow(lang);
    const issues = useMemo(() => /** @type {Array<{ issue: import("pivotkit-core").Issue, raw: unknown }>} */ (notes.filter((n) => "issue" in n)), [notes]);
    const wanted = show && issues.length > 0;
    useEffect(() => {
        if (!wanted || now) {
            return undefined;
        }
        let live = true;
        loadUnused(lang).then(
            (value) => live && setGot({ lang, value }),
            // the core's messages stay; the next view with unused parts tries again
            () => undefined
        );
        return () => {
            live = false;
        };
    }, [wanted, now, lang, notesKey]);
    const plain = useMemo(() => {
        if (!now || !wanted) {
            return null;
        }
        /** @type {import("./unused-texts.js").UnusedContext} */
        const ctx = { labels, fill, field: (name) => fieldLabel(name, labels.core), value: (spec) => valueLabel(spec, labels) };
        return now.mod.unusedItems(issues, unusedTexts(now, labels), ctx);
    }, [now, wanted, issues, labels]);
    const title = plural(labels.unusedParts, notes.length, { lang, locale });
    const first = FIRST[narrow ? "narrow" : "wide"];
    // one more line is no reason for a button
    const cut = all !== notesKey && notes.length > first + 1 ? first : notes.length;
    /** The x: the warning goes, the focus to what follows it in the report (a tip, Enlarge, the table). */
    const dismiss = () => {
        const el = box.current;
        const root = el?.closest(".pk-root");
        const next = el && root ? [...root.querySelectorAll(FOCUSABLE)].find((c) => !el.contains(c) && el.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) : null;
        onDismiss(/** @type {HTMLElement | null} */ (next ?? null));
    };
    // each issue's line in plain words, once they are here
    const lineOf = new Map(plain ? issues.map((n, i) => [n, plain[i]]) : []);
    return (
        <>
            {show ? (
                <div className="pk-note pk-issues" data-testid="view-issues" ref={box}>
                    <Icon name="warn" size={16} />
                    <details open={folded !== notesKey} onToggle={(e) => setFolded(e.currentTarget.open ? null : notesKey)}>
                        <summary data-testid="unused-title">{title}</summary>
                        <ul>
                            {notes.slice(0, cut).map((n, i) => {
                                if (!("issue" in n)) {
                                    return <li key={i}>{n.text}</li>;
                                }
                                const line = lineOf.get(n);
                                return (
                                    <li key={i} data-testid="unused-item">
                                        {line ? (
                                            <>
                                                {line.pre}
                                                <strong>{line.subject}</strong>
                                                {line.post}
                                            </>
                                        ) : (
                                            n.issue.message
                                        )}
                                        {n.issue.path || line ? (
                                            <small className="pk-issues-path" data-testid="unused-path">
                                                {labels.unusedPath} <code>{n.issue.path}</code>
                                                {line ? ` · ${n.issue.message}` : null}
                                            </small>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ul>
                        {notes.length > first + 1 ? (
                            <button type="button" className="pk-btn pk-small-btn pk-issues-more" onClick={() => setAll(all === notesKey ? null : notesKey)} data-testid="unused-more">
                                {cut < notes.length ? plural(labels.unusedMore, notes.length - cut, { lang, locale }) : labels.unusedFewer}
                            </button>
                        ) : null}
                    </details>
                    <button type="button" className="pk-icon-btn pk-issues-x" aria-label={labels.dismissIssues} title={labels.dismissIssues} onClick={dismiss} data-testid="dismiss-issues">
                        <Icon name="x" size={14} />
                    </button>
                </div>
            ) : null}
            <div className="pk-sr" aria-live="polite" data-testid="unused-live">
                {show && !quiet ? title : null}
            </div>
        </>
    );
}

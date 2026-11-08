/*
 * The warning above the result when a view has parts the report could not use (a template, a link, a
 * loaded file, the host's view): a notice that is open the first time it shows for a view and folds
 * with its title, one line per part in plain words (what it is about, what happened, what is used
 * instead) with the technical path below it for developers, and an x that dismisses it. The plain
 * words load on demand (unused-load.js); until they are here, or when they fail, a line shows the
 * core's short message. A screen reader hears the title once, through a polite live region that is
 * always there; the warning never takes the focus.
 */

import React, { useEffect, useMemo, useState } from "react";
import { fieldLabel } from "pivotkit-core";
import { Icon } from "./icons.jsx";
import { fill, plural } from "./labels.js";
import { valueLabel } from "./names.js";
import { loadUnused, unusedNow, unusedTexts } from "./unused-load.js";

/**
 * @typedef {{ issue: import("pivotkit-core").Issue, raw: unknown } | { text: string }} UnusedNote
 *   an issue of normalize() with the view it was given, or a line in words already (a view trimmed to the limits)
 */

/**
 * @param {{ notes: UnusedNote[], notesKey: string, dismissed: boolean, onDismiss: () => void,
 *   labels: import("./labels.js").UiLabels, locale: string }} props
 */
export function Unused({ notes, notesKey, dismissed, onDismiss, labels, locale }) {
    const lang = labels.lang;
    const show = notes.length > 0 && !dismissed;
    // the view whose warning was folded: a new view's opens again
    const [folded, setFolded] = useState(/** @type {string | null} */ (null));
    const [got, setGot] = useState(/** @type {{ lang: string, value: import("./unused-load.js").UnusedLoaded } | null} */ (null));
    const now = got?.lang === lang ? got.value : unusedNow(lang);
    const wanted = show && notes.some((n) => "issue" in n);
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
    const texts = useMemo(() => (now ? unusedTexts(now, labels) : null), [now, labels]);
    /** @type {import("./unused-texts.js").UnusedContext} */
    const ctx = { labels, fill, field: (name) => fieldLabel(name, labels.core), value: (spec) => valueLabel(spec, labels) };
    const title = plural(labels.unusedParts, notes.length, { lang, locale });
    return (
        <>
            {show ? (
                <div className="pk-note pk-issues" data-testid="view-issues">
                    <Icon name="warn" size={16} />
                    <details open={folded !== notesKey} onToggle={(e) => setFolded(e.currentTarget.open ? null : notesKey)}>
                        <summary data-testid="unused-title">{title}</summary>
                        <ul>
                            {notes.map((n, k) => {
                                if (!("issue" in n)) {
                                    return <li key={k}>{n.text}</li>;
                                }
                                const plain = now && texts ? now.mod.unusedItem(n.issue, n.raw, texts, ctx) : null;
                                return (
                                    <li key={k} data-testid="unused-item">
                                        {plain ? (
                                            <>
                                                {plain.pre}
                                                <strong>{plain.subject}</strong>
                                                {plain.post}
                                            </>
                                        ) : (
                                            n.issue.message
                                        )}
                                        {n.issue.path || plain ? (
                                            <small className="pk-issues-path" data-testid="unused-path">
                                                {labels.unusedPath} <code>{n.issue.path}</code>
                                                {plain ? ` ${n.issue.message}` : null}
                                            </small>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ul>
                    </details>
                    <button type="button" className="pk-icon-btn pk-issues-x" aria-label={labels.dismissIssues} title={labels.dismissIssues} onClick={onDismiss} data-testid="dismiss-issues">
                        <Icon name="x" size={14} />
                    </button>
                </div>
            ) : null}
            <div className="pk-sr" aria-live="polite" data-testid="unused-live">
                {show ? title : null}
            </div>
        </>
    );
}

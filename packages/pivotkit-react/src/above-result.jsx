/*
 * What stands between the zones and the result: the question before a link made for other data is
 * opened, what a loaded view left out (unused.jsx), the tips and notices (tip-list.jsx), the screen
 * reader's hint about the cells, and while enlarged the fields in one line.
 */

import React from "react";
import { activeIn } from "./dom.js";
import { MenuPanel } from "./lazy-menus.jsx";
import { layoutSummary } from "./names.js";
import { Tips } from "./tip-list.jsx";
import { Unused } from "./unused.jsx";
import { zoneEntries } from "./zones.jsx";

/**
 * @param {{ labels: any, view: import("pivotkit-core").View, types: Map<string, string>, context: { labels: any }, narrow: boolean,
 *   enlarged: boolean, hint: string | null, link: ReturnType<typeof import("./use-share-link.js").useShareLink>,
 *   notes: ReturnType<typeof import("./use-unused-notes.js").useUnusedNotes>, tips: ReturnType<typeof import("./use-tips.js").tipsShown>,
 *   onTipDismiss: (id: string) => void, focusReport: () => void }} props  context: the result's date context; hint: the
 *   cells' hint's id, null without it; focusReport: the focus goes to the report
 */
export function AboveResult({ labels, view, types, context, narrow, enlarged, hint, link, notes, tips, onTipDismiss, focusReport }) {
    // while enlarged, the fields in one line: what the result shows, without the zones
    const summaryParts = enlarged ? layoutSummary(zoneEntries(view, types, context.labels), context.labels) : [];
    return (
        <>
            {link.check ? (
                <div className="pk-link-check" data-testid="link-check">
                    <MenuPanel name="LoadCheck" props={{ check: link.check, labels, title: labels.linkCheckTitle, quiet: link.check.quiet, close: link.closeCheck, onCancel: link.cancelCheck }} />
                </div>
            ) : null}
            {/* what a loaded view left out and what the view asks for that this data has not: it stays
                (the status note goes by itself) until it is dismissed */}
            <Unused
                notes={notes.notes}
                notesKey={notes.notesKey}
                dismissed={notes.dismissed}
                onDismiss={(next) => {
                    notes.dismiss();
                    // what follows the warning, else the report
                    next?.focus({ preventScroll: true });
                    if (!next || activeIn(next) !== next) {
                        focusReport();
                    }
                }}
                labels={labels}
                locale={notes.locale}
                narrow={narrow}
                quiet={notes.quiet}
            />
            <Tips tips={tips.tips} labels={labels} onDismiss={onTipDismiss} onAction={tips.run} focusFallback={focusReport} />
            {hint ? (
                <p id={hint} className="pk-sr" data-testid="cell-hint">
                    {labels.tips.cells}
                </p>
            ) : null}
            {enlarged ? (
                <p className="pk-enlarged-fields" data-testid="enlarged-fields">
                    {summaryParts.length ? summaryParts.map((p) => `${p.title}: ${p.fields}`).join(" · ") : labels.layoutEmpty}
                </p>
            ) : null}
        </>
    );
}

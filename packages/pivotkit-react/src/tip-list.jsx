/*
 * The notices and tips above the result (tips.js decides which): each with its icon, its text, an
 * action button when it has one, and, for a tip, an x that dismisses it (a notice stays: it says that
 * the result is cut or empty). They sit in the flow above the table or chart, never
 * over it. A screen reader hears a new tip through a polite live region that is always there (a
 * region added together with its text is often not read). After a dismissal the focus goes to the
 * next tip's x, else to the report.
 */

import React, { useEffect, useId, useRef } from "react";
import { Icon } from "./icons.jsx";

/**
 * @param {{ tips: Array<{ id: string, text: string, icon: string, action: string, actionText: string, notice?: boolean }>,
 *   labels: import("./labels.js").UiLabels, onDismiss: (id: string) => void, onAction: (id: string, action: string) => void,
 *   focusFallback: () => void }} props
 */
export function Tips({ tips, labels, onDismiss, onAction, focusFallback }) {
    const box = useRef(/** @type {HTMLDivElement | null} */ (null));
    const idBase = useId();
    const refocus = useRef(false);
    useEffect(() => {
        if (!refocus.current) {
            return;
        }
        refocus.current = false;
        const next = /** @type {HTMLElement | null | undefined} */ (box.current?.querySelector(".pk-tip-x"));
        if (next) {
            next.focus({ preventScroll: true });
        } else {
            focusFallback();
        }
    });
    return (
        <>
            {tips.length ? (
                <div className="pk-tips" ref={box} role="group" aria-label={labels.tipsTitle} data-testid="tips">
                    {tips.map((t) => (
                        <div key={t.id} className={`pk-note pk-tip${t.notice ? " pk-notice" : ""}`} data-tip={t.id} data-kind={t.notice ? "notice" : "tip"} data-testid={`tip-${t.id}`}>
                            <Icon name={/** @type {any} */ (t.icon)} size={16} />
                            <span className="pk-tip-text" id={`${idBase}-${t.id}`}>
                                {t.text}
                            </span>
                            {t.action ? (
                                <button type="button" className="pk-btn pk-small-btn" onClick={() => onAction(t.id, t.action)} data-testid={`tip-action-${t.id}`}>
                                    <span className="pk-btn-text">{t.actionText}</span>
                                </button>
                            ) : null}
                            {t.notice ? null : (
                                <button
                                    type="button"
                                    className="pk-icon-btn pk-tip-x"
                                    aria-label={labels.dismissTip}
                                    aria-describedby={`${idBase}-${t.id}`}
                                    title={labels.dismissTip}
                                    onClick={() => {
                                        refocus.current = true;
                                        onDismiss(t.id);
                                    }}
                                >
                                    <Icon name="x" size={14} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            ) : null}
            <div className="pk-sr" aria-live="polite" data-testid="tips-live">
                {tips.map((t) => (
                    <p key={t.id}>{t.text}</p>
                ))}
            </div>
        </>
    );
}

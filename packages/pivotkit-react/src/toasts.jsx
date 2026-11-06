/*
 * Short notes after an action ("Undone: Region removed", "Exported pivot.xlsx"), some with an action
 * button (Undo). They sit in the status line under the table, never over the data, are read out by a
 * polite live region and go away after a few seconds; while the pointer or the focus is on them they
 * stay. Errors stay until they are closed.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./icons.jsx";

/** How long a note stays, in milliseconds. */
export const SHOWN_MS = 6000;
/** Notes shown at once; older ones would only push the status line apart. */
const MAX_SHOWN = 2;

/** @typedef {{ id: number, text: string, action?: { label: string, run: () => void }, tone?: "error" }} Toast */

export function useToasts() {
    const [toasts, setToasts] = useState(/** @type {Toast[]} */ ([]));
    const next = useRef(1);
    const timers = useRef(new Map());
    const paused = useRef(false);
    const dismiss = useCallback((id) => {
        setToasts((list) => list.filter((t) => t.id !== id));
        clearTimeout(timers.current.get(id));
        timers.current.delete(id);
    }, []);
    const arm = useCallback(
        (id) => {
            clearTimeout(timers.current.get(id));
            timers.current.set(id, setTimeout(() => dismiss(id), SHOWN_MS));
        },
        [dismiss]
    );
    const push = useCallback(
        (/** @type {Omit<Toast, "id">} */ toast) => {
            const id = next.current++;
            setToasts((list) => [...list.slice(-(MAX_SHOWN - 1)), { ...toast, id }]);
            if (toast.tone !== "error" && !paused.current) {
                arm(id);
            }
        },
        [arm]
    );
    /** Stops the timers while the user reads or reaches a note; starts them again afterwards. */
    const pause = useCallback(
        (on, list) => {
            paused.current = on;
            for (const t of list) {
                if (on) {
                    clearTimeout(timers.current.get(t.id));
                } else if (t.tone !== "error") {
                    arm(t.id);
                }
            }
        },
        [arm]
    );
    useEffect(() => {
        const map = timers.current;
        return () => map.forEach((t) => clearTimeout(t));
    }, []);
    return { toasts, push, dismiss, pause };
}

/** @param {{ toasts: Toast[], dismiss: (id: number) => void, pause: (on: boolean, list: Toast[]) => void, closeLabel: string }} props */
export function Toasts({ toasts, dismiss, pause, closeLabel }) {
    const hold = () => pause(true, toasts);
    const release = (e) => {
        if (!e || !e.currentTarget.contains(/** @type {Node | null} */ (e.relatedTarget))) {
            pause(false, toasts);
        }
    };
    return (
        <div className="pk-toasts" role="status" aria-live="polite" aria-atomic="false" onMouseEnter={hold} onMouseLeave={() => release(null)} onFocus={hold} onBlur={release}>
            {toasts.map((t) => (
                <div key={t.id} className={`pk-toast${t.tone === "error" ? " pk-error" : ""}`} role={t.tone === "error" ? "alert" : undefined}>
                    {t.tone === "error" ? <Icon name="info" size={14} /> : null}
                    <span className="pk-toast-text">{t.text}</span>
                    {t.action ? (
                        <button
                            type="button"
                            className="pk-link pk-toast-action"
                            onClick={() => {
                                dismiss(t.id);
                                t.action?.run();
                            }}
                        >
                            {t.action.label}
                        </button>
                    ) : null}
                    <button type="button" className="pk-icon-btn pk-toast-x" aria-label={closeLabel} title={closeLabel} onClick={() => dismiss(t.id)}>
                        <Icon name="x" size={14} />
                    </button>
                </div>
            ))}
        </div>
    );
}

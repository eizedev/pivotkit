/*
 * Short notes after an action ("Undone", "Exported pivot.xlsx"), some with an action button (Undo).
 * They are read out by a polite live region and go away after a few seconds.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./icons.jsx";

const SHOWN_MS = 5000;

/** @typedef {{ id: number, text: string, action?: { label: string, run: () => void }, tone?: "error" }} Toast */

export function useToasts() {
    const [toasts, setToasts] = useState(/** @type {Toast[]} */ ([]));
    const next = useRef(1);
    const timers = useRef(new Map());
    const dismiss = useCallback((id) => {
        setToasts((list) => list.filter((t) => t.id !== id));
        clearTimeout(timers.current.get(id));
        timers.current.delete(id);
    }, []);
    const push = useCallback(
        (/** @type {Omit<Toast, "id">} */ toast) => {
            const id = next.current++;
            // the newest three are enough; older ones would only cover the report
            setToasts((list) => [...list.slice(-2), { ...toast, id }]);
            timers.current.set(id, setTimeout(() => dismiss(id), SHOWN_MS));
        },
        [dismiss]
    );
    useEffect(() => {
        const map = timers.current;
        return () => map.forEach((t) => clearTimeout(t));
    }, []);
    return { toasts, push, dismiss };
}

/** @param {{ toasts: Toast[], dismiss: (id: number) => void, closeLabel: string }} props */
export function Toasts({ toasts, dismiss, closeLabel }) {
    return (
        <div className="pk-toasts" role="status" aria-live="polite" aria-atomic="false">
            {toasts.map((t) => (
                <div key={t.id} className={`pk-toast${t.tone === "error" ? " pk-error" : ""}`}>
                    <span className="pk-toast-text">{t.text}</span>
                    {t.action ? (
                        <button
                            type="button"
                            className="pk-link pk-toast-action"
                            onClick={() => {
                                dismiss(t.id);
                                t.action.run();
                            }}
                        >
                            {t.action.label}
                        </button>
                    ) : null}
                    <button type="button" className="pk-icon-btn pk-toast-x" aria-label={closeLabel} onClick={() => dismiss(t.id)}>
                        <Icon name="x" size={14} />
                    </button>
                </div>
            ))}
        </div>
    );
}

/*
 * The "i" next to a field that has a description (fieldDefaults): hovering or focusing it shows the
 * description (and stays while the pointer moves onto it, so its "Learn more" link can be clicked), a
 * click or tap opens it as a small dialog whose link Tab reaches. Escape, a click outside and the
 * focus leaving close it. The button is described by the text for screen readers. A field without a
 * description has no button at all. FieldDescription is the same text at the top of a chip's menu.
 */

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Icon } from "./icons.jsx";
import { fill } from "./labels.js";
import { Popover } from "./popover.jsx";

/** How long (ms) a hover popover waits after the pointer left its button, so the pointer can reach it. */
const LEAVE_DELAY = 250;

/**
 * The description and its link.
 * @param {{ info: import("./field-info.js").FieldInfo, labels: import("./labels.js").UiLabels, link?: boolean, className?: string }} props
 */
export function FieldDescription({ info, labels, link = true, className = "pk-field-desc" }) {
    return (
        <p className={className}>
            <span>{info.description}</span>
            {link && info.href ? (
                <>
                    {" "}
                    <a href={info.href} target="_blank" rel="noopener noreferrer" className="pk-learn-more">
                        {labels.learnMore}
                    </a>
                </>
            ) : null}
        </p>
    );
}

/**
 * @param {{ info: import("./field-info.js").FieldInfo, name: string, labels: import("./labels.js").UiLabels, className?: string }} props
 *   `name`: the field's display name, for the button's name
 */
export function InfoButton({ info, name, labels, className }) {
    // "peek": on hover or focus, the focus stays on the button; "open": clicked, a dialog
    const [mode, setMode] = useState(/** @type {null | "peek" | "open"} */ (null));
    const ref = useRef(/** @type {HTMLButtonElement | null} */ (null));
    // the focus coming back after a close is no request to show it again
    const quiet = useRef(false);
    const leaving = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));
    const id = useId();
    const textId = useId();
    const stay = () => {
        if (leaving.current) {
            clearTimeout(leaving.current);
            leaving.current = null;
        }
    };
    const leaveSoon = () => {
        stay();
        leaving.current = setTimeout(() => setMode((m) => (m === "peek" ? null : m)), LEAVE_DELAY);
    };
    useEffect(() => stay, []);
    const close = useCallback(() => {
        quiet.current = true;
        setMode(null);
        requestAnimationFrame(() => {
            quiet.current = false;
        });
    }, []);
    const label = fill(labels.aboutField, { field: name });
    return (
        <>
            <button
                ref={ref}
                type="button"
                className={`pk-info${className ? ` ${className}` : ""}`}
                aria-label={label}
                aria-describedby={textId}
                aria-expanded={mode === "open"}
                aria-controls={mode ? id : undefined}
                aria-haspopup="dialog"
                data-testid="field-info"
                onPointerEnter={(e) => {
                    if (e.pointerType === "mouse") {
                        stay();
                        setMode((m) => m ?? "peek");
                    }
                }}
                onPointerLeave={(e) => {
                    if (e.pointerType === "mouse" && mode === "peek") {
                        leaveSoon();
                    }
                }}
                onFocus={() => {
                    if (mode === null && !quiet.current) {
                        setMode("peek");
                    }
                }}
                onBlur={(e) => {
                    // the focus moving into the popover (its link) keeps it
                    const to = /** @type {Element | null} */ (e.relatedTarget);
                    if (mode === "peek" && !(to && to.closest?.(".pk-info-pop"))) {
                        setMode(null);
                    }
                }}
                onClick={() => {
                    stay();
                    setMode(mode === "open" ? null : "open");
                }}
            >
                <Icon name="info" size={14} />
            </button>
            {/* hidden: read only as the button's description, not a second time in the page's text */}
            <span id={textId} hidden>
                {info.description}
            </span>
            <Popover
                key={mode ?? "closed"}
                open={mode !== null}
                passive={mode === "peek"}
                anchor={ref}
                onClose={close}
                label={label}
                role={mode === "peek" ? "tooltip" : "dialog"}
                className="pk-info-pop"
                id={id}
                onPointerEnter={stay}
                onPointerLeave={(e) => {
                    if (e.pointerType === "mouse" && mode === "peek") {
                        leaveSoon();
                    }
                }}
            >
                <FieldDescription info={info} labels={labels} />
            </Popover>
        </>
    );
}

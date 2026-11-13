/*
 * The "i" next to a field that has a description (fieldDefaults), and next to a setting that needs
 * explaining (section.jsx, SettingInfo): hovering or focusing it shows the
 * description (and stays while the pointer moves onto it, so its "Learn more" link can be clicked), a
 * click or tap opens it as a small dialog whose link Tab reaches. Escape, a click outside and the
 * focus leaving close it. The button is described by the text for screen readers. A field without a
 * description has no button at all. FieldDescription is the same text at the top of a chip's menu.
 */

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Icon } from "./icons.jsx";
import { fill } from "./labels.js";
import { onTheWay } from "./place.js";
import { Popover } from "./popover.jsx";

/** How long (ms) a hover popover waits after the pointer left its button, so the pointer can reach it. */
const LEAVE_DELAY = 250;

/**
 * The description and its link.
 * @param {{ info: { description: string, href?: string }, labels: import("./labels.js").UiLabels, link?: boolean, className?: string }} props
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
 * @param {{ info: { description: string, href?: string }, name: string, labels: import("./labels.js").UiLabels, className?: string, testId?: string, label?: string,
 *   tabIndex?: number, slot?: string }} props
 *   `name`: the field's display name, for the button's name; `label` names the button instead
 *   ("About Row subtotals" for a setting); `tabIndex`: -1 where a list moves the focus itself, `slot`
 *   its place there (the field list, rove.js)
 */
export function InfoButton({ info, name, labels, className, testId = "field-info", label: named, tabIndex, slot }) {
    // "peek": on hover or focus, the focus stays on the button; "open": clicked, a dialog
    const [mode, setMode] = useState(/** @type {null | "peek" | "open"} */ (null));
    const ref = useRef(/** @type {HTMLButtonElement | null} */ (null));
    // the focus coming back after a close is no request to show it again
    const quiet = useRef(false);
    const leaving = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));
    const id = useId();
    const textId = useId();
    // where the pointer is (client coordinates), followed while the description is shown on hover
    const pointer = useRef(/** @type {{ x: number, y: number } | null} */ (null));
    const stay = () => {
        if (leaving.current) {
            clearTimeout(leaving.current);
            leaving.current = null;
        }
    };
    // the pointer on the button, on its popover or on its way from the one to the other: there the
    // popover stays. Asked of the page (:hover), not only of pointerenter: in WebKit on Linux the
    // popover in the top layer (an "i" inside a menu) got no pointerenter when the pointer moved onto
    // it from the button. And a pointer on its way (beside the i towards a tip moved aside to stay in
    // the window, or in the gap between them) is not leaving, however slowly it moves: CI's WebKit on
    // Linux moves it in steps of about 280 ms, longer than the leave delay (#213)
    const hovered = () => {
        const button = ref.current;
        const root = /** @type {Document | ShadowRoot | null} */ (button?.getRootNode() ?? null);
        const pop = root && "getElementById" in root ? root.getElementById(id) : null;
        return Boolean(
            button?.matches(":hover") || pop?.matches(":hover") || (button && pop && onTheWay(button.getBoundingClientRect(), pop.getBoundingClientRect(), pointer.current))
        );
    };
    const leaveSoon = () => {
        stay();
        const check = () => {
            if (hovered()) {
                leaving.current = setTimeout(check, LEAVE_DELAY);
                return;
            }
            leaving.current = null;
            setMode((m) => (m === "peek" ? null : m));
        };
        leaving.current = setTimeout(check, LEAVE_DELAY);
    };
    useEffect(() => stay, []);
    useEffect(() => {
        const doc = ref.current?.ownerDocument;
        if (mode !== "peek" || !doc) {
            return undefined;
        }
        const follow = (/** @type {PointerEvent} */ e) => {
            pointer.current = { x: e.clientX, y: e.clientY };
        };
        // the pointer leaving the window from the gap: no later move would say it is gone
        const gone = (/** @type {PointerEvent} */ e) => {
            if (!e.relatedTarget) {
                pointer.current = null;
            }
        };
        doc.addEventListener("pointermove", follow, { capture: true, passive: true });
        doc.addEventListener("pointerout", gone, { capture: true, passive: true });
        return () => {
            doc.removeEventListener("pointermove", follow, { capture: true });
            doc.removeEventListener("pointerout", gone, { capture: true });
            pointer.current = null;
        };
    }, [mode]);
    const close = useCallback(() => {
        quiet.current = true;
        setMode(null);
        requestAnimationFrame(() => {
            quiet.current = false;
        });
    }, []);
    const label = named ?? fill(labels.aboutField, { field: name });
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
                tabIndex={tabIndex}
                data-pk-slot={slot}
                data-testid={testId}
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

/*
 * The "i" next to a field that has a description (fieldDefaults): hovering or focusing it shows the
 * description, a click or tap opens it as a small dialog with its "Learn more" link, which Tab
 * reaches. Escape, a click outside and the focus leaving close it. A field without a description has
 * no button at all. FieldDescription is the same text at the top of a chip's menu.
 */

import React, { useCallback, useId, useRef, useState } from "react";
import { Icon } from "./icons.jsx";
import { fill } from "./labels.js";
import { Popover } from "./popover.jsx";

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
    const id = useId();
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
                aria-expanded={mode === "open"}
                aria-controls={mode ? id : undefined}
                aria-haspopup="dialog"
                data-testid="field-info"
                onPointerEnter={(e) => {
                    if (e.pointerType === "mouse" && mode === null) {
                        setMode("peek");
                    }
                }}
                onPointerLeave={(e) => {
                    if (e.pointerType === "mouse" && mode === "peek") {
                        setMode(null);
                    }
                }}
                onFocus={() => {
                    if (mode === null && !quiet.current) {
                        setMode("peek");
                    }
                }}
                onBlur={() => {
                    if (mode === "peek") {
                        setMode(null);
                    }
                }}
                onClick={() => setMode(mode === "open" ? null : "open")}
            >
                <Icon name="info" size={14} />
            </button>
            <Popover key={mode ?? "closed"} open={mode !== null} passive={mode === "peek"} anchor={ref} onClose={close} label={label} role={mode === "peek" ? "tooltip" : "dialog"} className="pk-info-pop" id={id}>
                <FieldDescription info={info} labels={labels} link={mode === "open"} />
            </Popover>
        </>
    );
}

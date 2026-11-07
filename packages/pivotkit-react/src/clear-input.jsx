/*
 * A text input (or textarea) with an "×" that empties it: one control for every text field in the
 * report's menus. The "×" shows while there is text; it and Escape empty the field and keep the focus
 * in it (Escape on an empty field closes the menu as before). The text is removed as an edit of the
 * field's own (execCommand), so the browser's undo (Ctrl+Z in the field) brings it back; where a
 * browser refuses that, the value is set and an input event sent. `onClear` runs after, for a field
 * whose empty value applies at once (a value's name goes back to its default).
 */

import React, { useRef } from "react";
import { Icon } from "./icons.jsx";

/**
 * Empties a text field as an edit of its own, so it can be undone in the field.
 * @param {HTMLInputElement | HTMLTextAreaElement} el
 */
export function emptyField(el) {
    el.focus({ preventScroll: true });
    let done;
    try {
        el.select();
        const doc = /** @type {Document & { execCommand?: (cmd: string) => boolean }} */ (el.ownerDocument);
        done = typeof doc.execCommand === "function" && doc.execCommand("delete") && el.value === "";
    } catch {
        done = false;
    }
    if (!done) {
        // the value setter of the element's class, so React sees the change (its own setter is patched)
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, "");
        el.dispatchEvent(new Event("input", { bubbles: true }));
    }
}

/**
 * @param {{ value: string, onChange: (value: string) => void, onClear?: () => void, clearLabel: string,
 *   multiline?: boolean, className?: string, inputRef?: React.RefObject<any> } & Record<string, any>} props
 *   every other prop goes to the input (type, placeholder, aria-label, data-testid, ...)
 */
export function ClearInput({ value, onChange, onClear, clearLabel, multiline = false, className, inputRef, ...rest }) {
    const own = useRef(/** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (null));
    const ref = inputRef ?? own;
    const clear = () => {
        if (ref.current) {
            emptyField(ref.current);
        }
        onClear?.();
    };
    const onKeyDown = (e) => {
        rest.onKeyDown?.(e);
        if (e.key === "Escape" && value !== "" && !e.defaultPrevented) {
            // the field empties; the menu around it stays open (dom.js closes on an Escape not prevented)
            e.preventDefault();
            e.stopPropagation();
            clear();
        }
    };
    const Tag = multiline ? "textarea" : "input";
    return (
        <span className={`pk-clear-input${multiline ? " pk-clear-multi" : ""}${className ? ` ${className}` : ""}`}>
            <Tag {...rest} ref={ref} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} />
            {value !== "" ? (
                <button
                    type="button"
                    className="pk-clear-x"
                    aria-label={clearLabel}
                    title={clearLabel}
                    // the focus stays in the field: a pointer press on the button does not take it
                    onPointerDown={(e) => e.preventDefault()}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={clear}
                    data-testid="clear-input"
                >
                    <Icon name="x" size={14} />
                </button>
            ) : null}
        </span>
    );
}

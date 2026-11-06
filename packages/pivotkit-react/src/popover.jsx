/*
 * Popovers and menus: anchored to a button, placed inside the viewport (place.js), shown as a bottom
 * sheet on narrow reports. Escape and a click outside close them and focus goes back to the button;
 * arrow keys move between the options. They render into the report's own layer element, so the
 * --pk-* tokens and the theme apply.
 */

import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIsoLayoutEffect } from "./iso.js";
import { Icon } from "./icons.jsx";
import { placePopover } from "./place.js";

/** The layer element and the size class of the report ("wide", "medium", "narrow"). */
export const LayerContext = createContext({ layer: /** @type {HTMLElement | null} */ (null), size: "wide" });

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex='-1'])";
const OPTION = "[data-pk-option]:not([disabled])";

/**
 * @param {{ open: boolean, anchor: React.RefObject<HTMLElement>, onClose: () => void, label: string,
 *   role?: "menu" | "dialog", align?: "start" | "end", className?: string, id?: string, children: React.ReactNode }} props
 */
export function Popover({ open, anchor, onClose, label, role = "dialog", align = "start", className, id, children }) {
    const { layer, size } = useContext(LayerContext);
    const ref = useRef(/** @type {HTMLDivElement | null} */ (null));
    const [pos, setPos] = useState(/** @type {null | { top: number, left: number, maxHeight: number, side: string }} */ (null));
    const sheet = size === "narrow";

    const place = useCallback(() => {
        const el = ref.current;
        const a = anchor.current;
        if (!el || !a || sheet) {
            return;
        }
        const r = a.getBoundingClientRect();
        setPos(placePopover(r, { width: el.offsetWidth, height: el.scrollHeight }, { width: window.innerWidth, height: window.innerHeight }, align));
    }, [anchor, align, sheet]);

    useIsoLayoutEffect(() => {
        if (!open) {
            setPos(null);
            return undefined;
        }
        place();
        const el = ref.current;
        const ro = typeof ResizeObserver === "function" && el ? new ResizeObserver(place) : null;
        if (ro && el) {
            ro.observe(el);
        }
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => {
            ro?.disconnect();
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
        };
    }, [open, place]);

    useEffect(() => {
        if (!open) {
            return undefined;
        }
        const el = ref.current;
        const first = el?.querySelector("[data-autofocus]") ?? el?.querySelector(OPTION) ?? el?.querySelector(FOCUSABLE);
        // after the placement, so the page does not scroll to a popover still at 0,0
        const t = requestAnimationFrame(() => /** @type {HTMLElement | null} */ (first)?.focus({ preventScroll: true }));
        const onDown = (e) => {
            const target = /** @type {Node} */ (e.target);
            if (el && !el.contains(target) && !anchor.current?.contains(target)) {
                onClose();
            }
        };
        document.addEventListener("pointerdown", onDown, true);
        const button = anchor.current;
        return () => {
            cancelAnimationFrame(t);
            document.removeEventListener("pointerdown", onDown, true);
            // focus goes back to the button unless the user moved it somewhere else
            if (button && (document.activeElement === document.body || el?.contains(document.activeElement))) {
                button.focus({ preventScroll: true });
            }
        };
    }, [open, anchor, onClose]);

    if (!open || !layer) {
        return null;
    }
    const onKeyDown = (e) => {
        if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
            return;
        }
        if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
            const options = [...ref.current.querySelectorAll(OPTION)];
            if (options.length === 0 || (e.target instanceof HTMLInputElement && e.target.type !== "checkbox")) {
                return;
            }
            e.preventDefault();
            const at = options.indexOf(/** @type {Element} */ (document.activeElement));
            const next = e.key === "Home" ? 0 : e.key === "End" ? options.length - 1 : (at + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
            /** @type {HTMLElement} */ (options[next]).focus();
        }
    };
    const style = sheet ? undefined : pos ? { top: pos.top, left: pos.left, maxHeight: pos.maxHeight } : { top: 0, left: 0, visibility: /** @type {const} */ ("hidden") };
    return createPortal(
        <>
            {sheet ? <div className="pk-scrim" onClick={onClose} aria-hidden="true" /> : null}
            <div
                ref={ref}
                id={id}
                role={role}
                aria-label={label}
                aria-modal={sheet && role === "dialog" ? true : undefined}
                className={`pk-popover${sheet ? " pk-sheet" : ""}${pos?.side === "above" ? " pk-above" : ""}${className ? ` ${className}` : ""}`}
                style={style}
                onKeyDown={onKeyDown}
            >
                {children}
            </div>
        </>,
        layer
    );
}

/**
 * A button that opens a popover. `children` is a function of `close`.
 * @param {{ label: string, icon?: string, text?: React.ReactNode, showText?: boolean, className?: string,
 *   role?: "menu" | "dialog", align?: "start" | "end", popoverClass?: string, disabled?: boolean,
 *   title?: string, children: (close: () => void) => React.ReactNode, testId?: string }} props
 */
export function MenuButton({ label, icon, text, showText = true, className, role = "menu", align, popoverClass, disabled, title, children, testId }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const id = useId();
    const close = useCallback(() => setOpen(false), []);
    return (
        <>
            <button
                ref={ref}
                type="button"
                className={className ?? "pk-btn"}
                aria-haspopup={role === "menu" ? "menu" : "dialog"}
                aria-expanded={open}
                aria-controls={open ? id : undefined}
                aria-label={showText && text ? undefined : label}
                title={title ?? (showText && text ? undefined : label)}
                disabled={disabled}
                data-testid={testId}
                onClick={() => setOpen((o) => !o)}
            >
                {icon ? <Icon name={/** @type {any} */ (icon)} /> : null}
                {showText && text ? <span className="pk-btn-text">{text}</span> : null}
                {showText && text ? <Icon name="chevronDown" size={14} className="pk-caret" /> : null}
            </button>
            <Popover open={open} anchor={ref} onClose={close} label={label} role={role} align={align} className={popoverClass} id={id}>
                {children(close)}
            </Popover>
        </>
    );
}

/**
 * One option of a menu or of a chip's settings.
 * @param {{ onSelect: () => void, icon?: string, checked?: boolean, children: React.ReactNode, hint?: React.ReactNode,
 *   inMenu?: boolean, disabled?: boolean, danger?: boolean, testId?: string }} props
 */
export function Option({ onSelect, icon, checked, children, hint, inMenu = false, disabled, danger, testId }) {
    const role = inMenu ? (checked === undefined ? "menuitem" : "menuitemradio") : undefined;
    return (
        <button
            type="button"
            role={role}
            aria-checked={inMenu && checked !== undefined ? checked : undefined}
            aria-pressed={!inMenu && checked !== undefined ? checked : undefined}
            className={`pk-option${checked ? " pk-checked" : ""}${danger ? " pk-danger" : ""}`}
            data-pk-option=""
            data-testid={testId}
            disabled={disabled}
            onClick={onSelect}
        >
            <span className="pk-option-icon">{checked ? <Icon name="check" /> : icon ? <Icon name={/** @type {any} */ (icon)} /> : null}</span>
            <span className="pk-option-text">
                {children}
                {hint ? <span className="pk-option-hint">{hint}</span> : null}
            </span>
        </button>
    );
}

/** A titled group of options. */
export function Section({ title, children }) {
    const id = useId();
    return (
        <div className="pk-section" role="group" aria-labelledby={id}>
            <div className="pk-section-title" id={id}>
                {title}
            </div>
            {children}
        </div>
    );
}

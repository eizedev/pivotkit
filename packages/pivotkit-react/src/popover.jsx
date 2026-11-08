/*
 * Popovers and menus: anchored to a button, placed inside the viewport (place.js), shown as a bottom
 * sheet on narrow reports. Escape (wherever the focus is), a click outside and the focus leaving
 * close them, and focus goes back to the button; arrow keys move between the options. A bottom sheet
 * is modal: Tab stays inside. They render into the report's own layer element, so the --pk-* tokens
 * and the theme apply, also inside a shadow root. A popover keeps the mouse wheel to itself: what
 * it cannot scroll further never scrolls the table or the page behind it (wheelStays).
 */

import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FOCUSABLE, activeIn, eventWithin, trapTab, useEscapeLayer } from "./dom.js";
import { useIsoLayoutEffect } from "./iso.js";
import { Icon } from "./icons.jsx";
import { fromOrigin, placePopover, viewportOf } from "./place.js";

/** The layer element and the size class of the report ("wide", "medium", "narrow"). */
export const LayerContext = createContext({ layer: /** @type {HTMLElement | null} */ (null), size: "wide" });

const OPTION = "[data-pk-option]:not([disabled])";

/**
 * Whether a wheel turn inside a popover may scroll something there: an element on its way from the
 * target up to the popover that scrolls in that direction and is not at its end. Else the popover
 * keeps it (preventDefault), so the table or the page behind never scrolls.
 * @param {EventTarget[]} path  the event's composed path
 * @param {Element} popover
 * @param {number} dx
 * @param {number} dy
 */
export function wheelScrollsInside(path, popover, dx, dy) {
    for (const node of path) {
        if (!(node instanceof Element)) {
            continue;
        }
        const style = node.ownerDocument.defaultView?.getComputedStyle(node);
        const scrolls = (overflow) => overflow === "auto" || overflow === "scroll";
        if (style && scrolls(style.overflowY) && ((dy < 0 && node.scrollTop > 0) || (dy > 0 && node.scrollTop + node.clientHeight < node.scrollHeight - 1))) {
            return true;
        }
        if (style && scrolls(style.overflowX) && ((dx < 0 && node.scrollLeft > 0) || (dx > 0 && node.scrollLeft + node.clientWidth < node.scrollWidth - 1))) {
            return true;
        }
        if (node === popover) {
            return false;
        }
    }
    return false;
}

/**
 * @param {{ open: boolean, anchor: React.RefObject<HTMLElement>, onClose: () => void, label?: string,
 *   role?: "menu" | "dialog" | "tooltip", align?: "start" | "end", className?: string, id?: string,
 *   passive?: boolean, fill?: boolean, onPointerEnter?: (e: React.PointerEvent) => void, onPointerLeave?: (e: React.PointerEvent) => void,
 *   children: React.ReactNode }} props
 *   `fill`: a popover with a scrolling middle and a foot that stays in view (the filter, a chip menu)
 *   may cover its anchor when it fits on neither side (place.js)
 *   `passive`: shown on hover or focus of its button (a description): the focus stays where it is,
 *   never a bottom sheet
 */
export function Popover({ open, anchor, onClose, label, role = "dialog", align = "start", className, id, passive = false, fill = false, onPointerEnter, onPointerLeave, children }) {
    const { layer, size } = useContext(LayerContext);
    const ref = useRef(/** @type {HTMLDivElement | null} */ (null));
    const [pos, setPos] = useState(/** @type {null | { top: number, left: number, maxHeight: number, side: string }} */ (null));
    const sheet = size === "narrow" && !passive;

    useIsoLayoutEffect(() => {
        if (!open) {
            setPos(null);
            return undefined;
        }
        const place = () => {
            const el = ref.current;
            const a = anchor.current;
            if (!el || !a || sheet) {
                return;
            }
            const r = a.getBoundingClientRect();
            // its own width (max-content, styles.css), whatever room its last place left it: a size
            // measured at that place would narrow it a little on every placement
            const place = placePopover(r, { width: el.offsetWidth, height: el.scrollHeight }, viewportOf(el.ownerDocument), align, { fill });
            // the origin of the fixed containing block: not the viewport inside a transformed ancestor
            const probe = layer?.querySelector(".pk-origin");
            setPos(probe ? fromOrigin(place, probe.getBoundingClientRect()) : place);
        };
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
    }, [open, anchor, align, sheet, layer, fill]);

    useEscapeLayer(open, onClose);
    // the latest onClose without re-running the open effect: a caller's inline arrow is new on
    // every render, and a re-run would move the focus back to the first control
    const closeRef = useRef(onClose);
    useEffect(() => {
        closeRef.current = onClose;
    });
    useEffect(() => {
        if (!open || passive) {
            return undefined;
        }
        const el = ref.current;
        // the first option that is shown (a folded section's are hidden)
        const shown = (/** @type {Element} */ o) => o.getClientRects().length > 0;
        const first = el?.querySelector("[data-autofocus]") ?? [...(el?.querySelectorAll(OPTION) ?? [])].find(shown) ?? [...(el?.querySelectorAll(FOCUSABLE) ?? [])].find(shown);
        // after the placement, so the page does not scroll to a popover still at 0,0
        const t = requestAnimationFrame(() => /** @type {HTMLElement | null} */ (first)?.focus({ preventScroll: true }));
        const onDown = (e) => {
            if (!eventWithin(e, [el, anchor.current])) {
                closeRef.current();
            }
        };
        const doc = el?.ownerDocument ?? document;
        doc.addEventListener("pointerdown", onDown, true);
        // the wheel stays in the popover (not passive: React's onWheel cannot prevent the scroll)
        const onWheel = (/** @type {WheelEvent} */ e) => {
            if (el && !e.ctrlKey && !wheelScrollsInside(e.composedPath(), el, e.deltaX, e.deltaY)) {
                e.preventDefault();
            }
        };
        el?.addEventListener("wheel", onWheel, { passive: false });
        const button = anchor.current;
        return () => {
            cancelAnimationFrame(t);
            doc.removeEventListener("pointerdown", onDown, true);
            el?.removeEventListener("wheel", onWheel);
            // focus goes back to the button unless the user moved it somewhere else
            const now = activeIn(button);
            if (button && button.isConnected && (!now || now === doc.body || el?.contains(now) || !now.isConnected)) {
                button.focus({ preventScroll: true });
            }
        };
    }, [open, anchor, passive]);

    if (!open || !layer) {
        return null;
    }
    const onKeyDown = (e) => {
        if (role === "menu" && e.key === "Tab") {
            // a menu is left with Tab: it closes and the focus goes back to its button
            e.preventDefault();
            onClose();
            return;
        }
        if (sheet) {
            trapTab(e, ref.current);
        }
        if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
            const options = /** @type {HTMLElement[]} */ ([...(ref.current?.querySelectorAll(OPTION) ?? [])]).filter((o) => o.getClientRects().length > 0);
            if (options.length === 0 || (e.target instanceof HTMLInputElement && e.target.type !== "checkbox")) {
                return;
            }
            e.preventDefault();
            const at = options.indexOf(/** @type {HTMLElement} */ (activeIn(ref.current)));
            const next = e.key === "Home" ? 0 : e.key === "End" ? options.length - 1 : (at + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
            options[next].focus();
        }
    };
    // Tab out of a popover closes it; a click on its button toggles it instead
    const onBlur = (e) => {
        const to = /** @type {Node | null} */ (e.relatedTarget);
        if (to && !ref.current?.contains(to) && !anchor.current?.contains(to)) {
            onClose();
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
                aria-label={passive ? undefined : label}
                aria-modal={sheet && role === "dialog" ? true : undefined}
                className={`pk-popover${sheet ? " pk-sheet" : ""}${pos?.side === "above" ? " pk-above" : ""}${className ? ` ${className}` : ""}`}
                style={style}
                onKeyDown={onKeyDown}
                onBlur={sheet || passive ? undefined : onBlur}
                onPointerEnter={onPointerEnter}
                onPointerLeave={onPointerLeave}
                // a click on text inside keeps the focus here, not on the report around it
                tabIndex={passive ? undefined : -1}
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
 *   title?: string, children: (close: () => void) => React.ReactNode, testId?: string, name?: string,
 *   buttonRef?: React.RefObject<HTMLButtonElement>, tabIndex?: number, slot?: string, fill?: boolean, mark?: React.ReactNode }} props
 *   `tabIndex`: -1 where a list moves the focus itself (the field list); `mark`: after the text (the
 *   dot for unsaved changes on "More")
 */
export function MenuButton({ label, icon, text, showText = true, className, role = "menu", align, popoverClass, disabled, title, children, testId, buttonRef, name, tabIndex, slot, fill, mark }) {
    const [open, setOpen] = useState(false);
    const own = useRef(/** @type {HTMLButtonElement | null} */ (null));
    const ref = buttonRef ?? own;
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
                aria-label={name ?? (showText && text ? undefined : label)}
                title={title ?? (showText && text ? undefined : label)}
                disabled={disabled}
                tabIndex={tabIndex}
                data-pk-slot={slot}
                data-testid={testId}
                onClick={() => setOpen((o) => !o)}
            >
                {icon ? <Icon name={/** @type {any} */ (icon)} /> : null}
                {showText && text ? <span className="pk-btn-text">{text}</span> : null}
                {mark}
                {showText && text ? <Icon name="chevronDown" size={14} className="pk-caret" /> : null}
            </button>
            <Popover open={open} anchor={ref} onClose={close} label={label} role={role} align={align} className={popoverClass} id={id} fill={fill}>
                {children(close)}
            </Popover>
        </>
    );
}

/**
 * One option of a menu or of a chip's settings: one line. `hint` is a short second line that belongs
 * to the option (a date unit's example); `reason` says why a disabled option does nothing and shows
 * only while it is disabled (it is state, not an explanation: those go into an "i").
 * @param {{ onSelect: () => void, icon?: string, checked?: boolean, children: React.ReactNode, hint?: React.ReactNode,
 *   reason?: React.ReactNode, inMenu?: boolean, disabled?: boolean, danger?: boolean, tone?: "accent", testId?: string, current?: boolean }} props
 *   `tone`: "accent" for an option that says what is set (a filter); `current`: the entry shown now
 *   (the view loaded), with a check and aria-current
 */
export function Option({ onSelect, icon, checked, children, hint, reason, inMenu = false, disabled, danger, tone, testId, current }) {
    const second = disabled && reason ? reason : hint;
    const role = inMenu ? (checked === undefined ? "menuitem" : "menuitemradio") : undefined;
    return (
        <button
            type="button"
            role={role}
            aria-checked={inMenu && checked !== undefined ? checked : undefined}
            aria-pressed={!inMenu && checked !== undefined ? checked : undefined}
            aria-current={current ? "true" : undefined}
            className={`pk-option${checked ? " pk-checked" : ""}${danger ? " pk-danger" : ""}${tone === "accent" ? " pk-accent" : ""}`}
            data-pk-option=""
            data-testid={testId}
            disabled={disabled}
            onClick={onSelect}
        >
            <span className="pk-option-icon">{checked || current ? <Icon name="check" /> : icon ? <Icon name={/** @type {any} */ (icon)} /> : null}</span>
            <span className="pk-option-text">
                {children}
                {second ? <span className="pk-option-hint">{second}</span> : null}
            </span>
        </button>
    );
}

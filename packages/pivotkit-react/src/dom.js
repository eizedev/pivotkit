/*
 * DOM helpers that also work inside a shadow root (the web component mounts the report in one):
 * the focused element is read from the node's own root, clicks outside are decided on the event's
 * composed path, and Escape closes only the topmost layer (popover, dialog, drawer) of a page.
 */

import { createContext, useContext, useEffect, useId, useRef } from "react";

/**
 * The prefix of the names of a report's form fields (PivotReport sets one per report instance, after
 * mounting: React's useId is unique inside one React root only, and two web components are two roots).
 */
export const FormNameContext = createContext("pk");

/**
 * A name for a form field (input, select, textarea) of this report: browsers autofill and restore by
 * name, and list a field without a name or id as a problem of the page. A component with several
 * fields adds a suffix of its own to it (`${name}-op`); a group of radios or checkboxes shares one.
 * @returns {string}
 */
export function useFormName() {
    const prefix = useContext(FormNameContext);
    return `${prefix}-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
}

/** Elements that take the focus with Tab. */
export const FOCUSABLE = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";

/**
 * The document or shadow root a node is in.
 * @param {Node | null | undefined} node
 * @returns {Document | ShadowRoot | null}
 */
export function rootOf(node) {
    const root = node && typeof node.getRootNode === "function" ? node.getRootNode() : null;
    if (root && (root.nodeType === 9 || root.nodeType === 11)) {
        return /** @type {Document | ShadowRoot} */ (root);
    }
    return typeof document !== "undefined" ? document : null;
}

/**
 * The focused element of a node's root: inside a shadow root its own activeElement, not the host.
 * @param {Node | null | undefined} node
 * @returns {Element | null}
 */
export function activeIn(node) {
    return rootOf(node)?.activeElement ?? null;
}

/**
 * Whether an event happened inside one of the elements, across shadow root boundaries.
 * @param {Event} event
 * @param {Array<Element | null | undefined>} elements
 */
export function eventWithin(event, elements) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    return elements.some((el) => el && (path.includes(el) || (event.target instanceof Node && el.contains(event.target))));
}

/**
 * The elements of a container that Tab reaches, in order.
 * @param {Element} container
 * @returns {HTMLElement[]}
 */
export function tabbables(container) {
    return /** @type {HTMLElement[]} */ ([...container.querySelectorAll(FOCUSABLE)]).filter((el) => !el.closest("[inert]") && el.getClientRects().length > 0);
}

/**
 * The stops Tab makes in a container, in order: what takes the focus with Tab (a tabindex of 0 or
 * more; a roving list's other items are -1), shown and not inert, and of a group of radios the
 * checked one (else its first), as the browser steps.
 * @param {Element} container
 * @returns {HTMLElement[]}
 */
export function tabStops(container) {
    const all = tabbables(container).filter((el) => el.tabIndex >= 0 && el.ownerDocument.defaultView?.getComputedStyle(el).visibility !== "hidden");
    const radio = (/** @type {Element} */ el) => el instanceof HTMLInputElement && el.type === "radio" && el.name !== "";
    return all.filter((el) => {
        if (!radio(el)) {
            return true;
        }
        const group = all.filter((o) => radio(o) && /** @type {HTMLInputElement} */ (o).name === /** @type {HTMLInputElement} */ (el).name);
        const checked = group.find((o) => /** @type {HTMLInputElement} */ (o).checked);
        return el === (checked ?? group[0]);
    });
}

/**
 * The stop Tab goes to from an element of the page or its shadow root, popovers left out (the one it
 * leaves closes); null at the end of the root, where the browser goes on.
 * @param {HTMLElement} el
 * @returns {HTMLElement | null}
 */
export function stopAfter(el) {
    const root = rootOf(el);
    const scope = root && root.nodeType === 9 ? /** @type {Document} */ (root).body : root;
    if (!scope) {
        return null;
    }
    const stops = tabStops(/** @type {Element} */ (scope)).filter((s) => !s.closest(".pk-popover"));
    const at = stops.indexOf(el);
    return at === -1 ? null : stops[at + 1] ?? null;
}

/**
 * Tab and Shift+Tab inside a popover in the browser's top layer, moved here: WebKit leaves such a
 * popover for the page's body on Tab instead of going to its next control. Moves the focus to the
 * next (or previous) stop inside and returns "moved", or returns "out" when the focus is at the last
 * (first) stop, for the caller to decide; null for any other key or a focus outside the container.
 * @param {KeyboardEvent | React.KeyboardEvent} event
 * @param {Element | null} container
 * @returns {"moved" | "out" | null}
 */
export function tabWithin(event, container) {
    const active = activeIn(container);
    if (event.key !== "Tab" || !container || !active || !container.contains(active)) {
        return null;
    }
    const stops = tabStops(container);
    const at = stops.indexOf(/** @type {HTMLElement} */ (active));
    const next = at === -1 ? (event.shiftKey ? stops.length - 1 : 0) : at + (event.shiftKey ? -1 : 1);
    if (next < 0 || next >= stops.length) {
        return "out";
    }
    event.preventDefault();
    stops[next].focus();
    return "moved";
}

/**
 * Keeps Tab and Shift+Tab inside a container: from the last element to the first and back.
 * @param {KeyboardEvent | React.KeyboardEvent} event
 * @param {Element | null} container
 */
export function trapTab(event, container) {
    if (event.key !== "Tab" || !container) {
        return;
    }
    const list = tabbables(container);
    if (list.length === 0) {
        event.preventDefault();
        return;
    }
    const first = list[0];
    const last = list[list.length - 1];
    const active = activeIn(container);
    if (event.shiftKey && (active === first || !container.contains(active))) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && (active === last || !container.contains(active))) {
        event.preventDefault();
        first.focus();
    }
}

/** Open layers, newest last: Escape closes the newest one only. */
const layers = [];

/**
 * Escape closes this layer while it is open and the newest one, wherever the focus is (also on the
 * page around the report).
 * @param {boolean} open
 * @param {() => void} onClose
 */
export function useEscapeLayer(open, onClose) {
    const close = useRef(onClose);
    useEffect(() => {
        close.current = onClose;
    });
    useEffect(() => {
        if (!open || typeof document === "undefined") {
            return undefined;
        }
        const token = {};
        layers.push(token);
        const onKey = (e) => {
            if (e.key === "Escape" && layers[layers.length - 1] === token && !e.defaultPrevented) {
                e.preventDefault();
                close.current();
            }
        };
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("keydown", onKey);
            layers.splice(layers.indexOf(token), 1);
        };
    }, [open]);
}

/**
 * A modal layer (drill-down, field drawer, bottom sheet): focus moves into it when it opens and back
 * to where it was when it closes; Tab stays inside (`onKeyDown`); Escape closes it.
 * @param {React.RefObject<HTMLElement | null>} ref
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {string} [opener]  a selector for the button that opens the layer, inside the report: the
 *   focus goes there when there was no focused control before (Safari does not focus a clicked button)
 * @returns {{ onKeyDown: (e: React.KeyboardEvent) => void }}
 */
export function useModal(ref, open, onClose, opener) {
    useEscapeLayer(open, onClose);
    useEffect(() => {
        const el = ref.current;
        if (!open || !el) {
            return undefined;
        }
        const was = activeIn(el);
        const plain = !was || was === el.ownerDocument.body || was.classList.contains("pk-root");
        const back = plain && opener ? el.closest(".pk-root")?.querySelector(opener) ?? was : was;
        // on the next frame: the layer may still be inert or hidden in this one
        const t = requestAnimationFrame(() => {
            const first = /** @type {HTMLElement | null} */ (el.querySelector("[data-autofocus]")) ?? tabbables(el)[0] ?? el;
            first.focus({ preventScroll: true });
        });
        return () => {
            cancelAnimationFrame(t);
            const target = /** @type {HTMLElement | null} */ (back);
            const now = activeIn(el);
            // back to where the focus was, unless the user moved it elsewhere on purpose
            if (target && target.isConnected && (!now || el.contains(now) || now === el.ownerDocument.body)) {
                target.focus({ preventScroll: true });
            }
        };
    }, [ref, open, opener]);
    return { onKeyDown: (e) => trapTab(e, ref.current) };
}

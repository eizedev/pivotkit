/*
 * The menus' panels (menus.js) on demand: loadMenus() imports them once (the report calls it after its
 * first render, so they are there before a menu opens); MenuPanel shows one, or a short "Loading…"
 * while they still load, and then moves the focus into the panel as the popover would have done.
 */

import React, { useEffect, useRef, useState } from "react";
import { activeIn } from "./dom.js";

/** @type {Promise<typeof import("./menus.js")> | null} */
let pending = null;
/** @type {typeof import("./menus.js") | null} */
let loaded = null;

/** The menus' panels, imported once. */
export function loadMenus() {
    pending ??= import("./menus.js").then((m) => {
        loaded = m;
        return m;
    });
    return pending;
}

/**
 * One panel of menus.js with its props.
 * @param {{ name: "AxisMenu" | "ValueMenu" | "ChartTypePanel" | "OptionsPanel" | "ViewsPanel" | "FilterPopover" | "DrillPanel", loadingText?: string, props: Record<string, any> }} props
 *   `loadingText`: shown while loading; without it nothing is (a popover or panel of its own)
 */
export function MenuPanel({ name, loadingText, props }) {
    const [mod, setMod] = useState(loaded);
    const box = useRef(/** @type {HTMLDivElement | null} */ (null));
    const late = useRef(false);
    useEffect(() => {
        if (mod) {
            return undefined;
        }
        late.current = true;
        let live = true;
        loadMenus().then(
            (m) => live && setMod(m),
            () => undefined
        );
        return () => {
            live = false;
        };
    }, [mod]);
    useEffect(() => {
        // loaded after the popover opened: the focus goes to its first option, as on an open
        const el = box.current;
        if (!mod || !late.current || !el) {
            return;
        }
        const popover = el.closest(".pk-popover");
        const now = activeIn(el);
        if (popover && (now === popover || !now || !popover.contains(now))) {
            const first = /** @type {HTMLElement | null} */ (popover.querySelector("[data-autofocus], [data-pk-option]:not([disabled])"));
            first?.focus({ preventScroll: true });
        }
    }, [mod]);
    const Panel = mod ? /** @type {any} */ (mod[name]) : null;
    return (
        <div className="pk-menu-panel" ref={box}>
            {Panel ? (
                <Panel {...props} />
            ) : loadingText ? (
                <p className="pk-hint pk-menu-loading" role="status">
                    {loadingText}
                </p>
            ) : null}
        </div>
    );
}

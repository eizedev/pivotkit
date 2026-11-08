/*
 * The menus' panels (menus.js) on demand: loadMenus() imports them once (the report calls it after its
 * first render, so they are there before a menu opens), and with them the menus' texts of the
 * report's language when it is not English (each a chunk of its own: a page in English never loads
 * German, a page switched to German loads them then); MenuPanel shows one, or a short "Loading…"
 * while they still load, and then moves the focus into the panel as the popover would have done. A
 * failed load (offline for a moment, a host that did not deploy dist/menus.js and dist/chunks/) is not
 * kept: the panel says so with "Try again", which imports once more.
 */

import React, { useEffect, useRef, useState } from "react";
import { activeIn } from "./dom.js";

/** @type {Promise<typeof import("./menus.js")> | null} */
let pending = null;
/** @type {typeof import("./menus.js") | null} */
let loaded = null;

/** The menus' texts of the languages besides English (menus.js has English, the fallback). */
const TEXTS = { de: () => import("./menu-labels-de.js").then((m) => m.de) };
/** @type {Map<string, Promise<void>>} */
const textsPending = new Map();

/**
 * The menus' panels, imported once, with the menus' texts of `lang` (added to menus.js's); a failed
 * import is forgotten, so the next call tries again.
 * @param {string} [lang]  the report's language (labels.lang)
 */
export function loadMenus(lang = "en") {
    pending ??= import("./menus.js").then(
        (m) => {
            loaded = m;
            return m;
        },
        (error) => {
            pending = null;
            throw error;
        }
    );
    if (!Object.hasOwn(TEXTS, lang)) {
        return pending;
    }
    let texts = textsPending.get(lang);
    if (!texts) {
        texts = Promise.all([pending, TEXTS[lang]()]).then(([m, t]) => m.addMenuTexts(lang, t));
        texts.catch(() => textsPending.delete(lang));
        textsPending.set(lang, texts);
    }
    return texts.then(() => /** @type {typeof import("./menus.js")} */ (loaded));
}

/** The menus' module at once when it is loaded with the texts of `lang`, else null. */
export const menusNow = (lang = "en") => (loaded && (!Object.hasOwn(TEXTS, lang) || loaded.hasMenuTexts(lang)) ? loaded : null);

/** The first option (or the element marked to take the focus) of the popover around `el`. */
function focusFirst(el) {
    const popover = el.closest(".pk-popover");
    const now = activeIn(el);
    if (popover && (now === popover || !now || !popover.contains(now))) {
        const first = /** @type {HTMLElement | null} */ (popover.querySelector("[data-autofocus], [data-pk-option]:not([disabled]), button:not([disabled])"));
        first?.focus({ preventScroll: true });
    }
}

/**
 * One panel of menus.js with its props.
 * @param {{ name: "AxisMenu" | "ValueMenu" | "ChartTypePanel" | "OptionsPanel" | "ViewsPanel" | "ExportPanel" | "LoadCheck" | "FilterPopover" | "DrillPanel", loadingText?: string, props: Record<string, any> }} props
 *   `loadingText`: shown while loading; without it nothing is (a popover or panel of its own).
 *   `props.labels` gives the texts of a failed load
 */
export function MenuPanel({ name, loadingText, props }) {
    const lang = props.labels?.lang;
    // the module once it is there with the texts of the report's language; `loads` counts the loads
    // that finished, so the panel renders again when one did
    const [, setLoads] = useState(0);
    const mod = menusNow(lang);
    const [failed, setFailed] = useState(false);
    // a new try: the effect below imports again
    const [attempt, setAttempt] = useState(0);
    const box = useRef(/** @type {HTMLDivElement | null} */ (null));
    const late = useRef(false);
    useEffect(() => {
        if (mod) {
            return undefined;
        }
        late.current = true;
        let live = true;
        loadMenus(lang).then(
            () => {
                if (live) {
                    setFailed(false);
                    setLoads((n) => n + 1);
                }
            },
            () => {
                if (live) {
                    setFailed(true);
                }
            }
        );
        return () => {
            live = false;
        };
    }, [mod, attempt, lang]);
    useEffect(() => {
        // loaded after the popover opened, or failed: the focus goes into the panel, as on an open
        if (box.current && ((mod && late.current) || failed)) {
            focusFirst(box.current);
        }
    }, [mod, failed]);
    const Panel = mod ? /** @type {any} */ (mod[name]) : null;
    const labels = props.labels;
    return (
        <div className="pk-menu-panel" ref={box}>
            {Panel ? (
                // the menus' own texts (menu-labels.js) come with them, under the report's labels
                <Panel {...props} labels={labels && mod ? mod.menuLabels(labels) : labels} />
            ) : failed && labels ? (
                <div className="pk-menu-failed" role="alert" data-testid="menu-failed">
                    <p>{labels.menuFailed}</p>
                    <button
                        type="button"
                        className="pk-btn pk-small-btn"
                        data-autofocus=""
                        data-testid="menu-retry"
                        onClick={() => {
                            setFailed(false);
                            setAttempt((n) => n + 1);
                        }}
                    >
                        {labels.tryAgain}
                    </button>
                </div>
            ) : loadingText ? (
                <p className="pk-hint pk-menu-loading" role="status">
                    {loadingText}
                </p>
            ) : null}
        </div>
    );
}

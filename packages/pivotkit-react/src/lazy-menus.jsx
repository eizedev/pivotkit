/*
 * The menus' panels (menus.js) on demand: loadMenus() imports them once (the report calls it after its
 * first render, so they are there before a menu opens), and with them the menus' texts of the
 * report's language when it is not English (menu-texts.js, each a chunk of its own: a page in English
 * never loads German, a page switched to German loads them then; if they fail, English stands in and
 * the next menu tries again); MenuPanel shows one, or a short "Loading…" while they still load, and then moves the focus into the panel as the popover would have done. A
 * failed load (offline for a moment, a host that did not deploy dist/menus.js and dist/chunks/) is not
 * kept: the panel says so with "Try again", which imports once more.
 */

import React, { useEffect, useRef, useState } from "react";
import { activeIn } from "./dom.js";
import { MENU_TEXTS_OF } from "./menu-texts.js";

/** @type {Promise<typeof import("./menus.js")> | null} */
let pending = null;
/** @type {typeof import("./menus.js") | null} */
let loaded = null;

/** @type {Map<string, Promise<void>>} */
const textsPending = new Map();
/** Languages whose texts did not load (a partial copy of dist/, offline): English stands in for now. */
const textsFailed = new Set();
/** @type {Set<() => void>} */
const listeners = new Set();

/** Calls `listener` whenever a language's texts arrived or failed; returns the unsubscribe. */
export function onMenuTexts(listener) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
}

/** Whether a menu of `lang` waits for (or should try once more) its language's texts. */
const wantsTexts = (lang) => Object.hasOwn(MENU_TEXTS_OF, lang) && !loaded?.hasMenuTexts(lang);

/**
 * The menus' panels, imported once, with the menus' texts of `lang` (added to menus.js's). A failed
 * import of the panels is forgotten and rejects, so the next call tries again; texts that fail leave
 * English standing in (the panels resolve), and the next call tries them again.
 * @param {string} [lang]  the report's language (labels.lang)
 * @returns {Promise<typeof import("./menus.js")>}
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
    const menus = pending;
    if (!wantsTexts(lang)) {
        return menus;
    }
    let texts = textsPending.get(lang);
    if (!texts) {
        const done = () => listeners.forEach((f) => f());
        texts = Promise.all([menus, MENU_TEXTS_OF[lang]()]).then(
            ([m, t]) => {
                m.addMenuTexts(lang, t);
                textsFailed.delete(lang);
                done();
            },
            () => {
                textsPending.delete(lang);
                textsFailed.add(lang);
                done();
            }
        );
        textsPending.set(lang, texts);
    }
    return texts.then(() => menus);
}

/**
 * The menus' module at once when it is loaded with the texts of `lang` (or they failed: English
 * stands in), else null; without `lang` the module as soon as it is loaded.
 * @param {string} [lang]
 */
export const menusNow = (lang = "en") => (loaded && (!wantsTexts(lang) || textsFailed.has(lang)) ? loaded : null);

/** The loading line: a live region that is there empty first and then says it, so it is announced. */
function Loading({ text }) {
    const [say, setSay] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setSay(true), 0);
        return () => clearTimeout(t);
    }, []);
    return (
        <p className="pk-hint pk-menu-loading" role="status">
            {say ? text : null}
        </p>
    );
}

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
 * @param {{ name: "AxisMenu" | "FilterMenu" | "ValueMenu" | "ChartTypePanel" | "OptionsPanel" | "ViewsPanel" | "ExportPanel" | "LoadCheck" | "FilterPopover" | "DrillPanel", loadingText?: string, props: Record<string, any> }} props
 *   `loadingText`: shown while loading; without it nothing is (a popover or panel of its own).
 *   `props.labels` gives the texts of a failed load
 */
export function MenuPanel({ name, loadingText, props }) {
    const labels = props.labels;
    const lang = labels?.lang;
    // a language's texts arrived or failed (here or for another panel): render again
    const [, setLoads] = useState(0);
    useEffect(() => onMenuTexts(() => setLoads((n) => n + 1)), []);
    const mod = menusNow(lang);
    // the labels the panel shows; when the language changes while it is open, it stays with the last
    // ones (mounted, its state and focus kept) until the new language's texts are here
    const current = mod && labels ? mod.menuLabels(labels) : null;
    const [kept, setKept] = useState(/** @type {any} */ (null));
    if (current && current !== kept) {
        setKept(current);
    }
    const [failed, setFailed] = useState(false);
    // a new try: the effect below imports again
    const [attempt, setAttempt] = useState(0);
    const box = useRef(/** @type {HTMLDivElement | null} */ (null));
    const late = useRef(false);
    // the language this panel tried to load the texts of: texts that failed get one quiet try per open
    const tried = useRef(/** @type {string | undefined | null} */ (null));
    useEffect(() => {
        if (mod && (!wantsTexts(lang) || tried.current === lang)) {
            return undefined;
        }
        tried.current = lang;
        late.current = !mod;
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
    const shown = mod ?? (kept ? menusNow() : null);
    const Panel = shown ? /** @type {any} */ (shown[name]) : null;
    return (
        <div className="pk-menu-panel" ref={box}>
            {Panel ? (
                // the menus' own texts (menu-labels.js) come with them, under the report's labels
                <Panel {...props} labels={current ?? kept ?? labels} />
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
                <Loading text={loadingText} />
            ) : null}
        </div>
    );
}

/*
 * The menus' module (lazy-menus.jsx), loaded right after the first render, so it is there before
 * anyone opens a menu; with the menu texts of the report's language, again when it changes. Its texts
 * are those of the settings' "i" (HelpContext): while the language changes, the last ones stay until
 * the new language's are here, never English in between.
 */

import { useEffect, useMemo, useState } from "react";
import { loadMenus, menusNow, onMenuTexts } from "./lazy-menus.jsx";

/**
 * @param {any} labels  the report's labels; `labels.lang` the language whose menu texts load
 * @param {boolean} explain  the settings' "i" are shown
 * @returns {{ menus: typeof import("./menus.js") | null, help: { explain: boolean, labels: any } }}  help:
 *   HelpContext's value
 */
export function useMenus(labels, explain) {
    const [menus, setMenus] = useState(/** @type {typeof import("./menus.js") | null} */ (null));
    // a language's menu texts arrived or failed: the help's labels follow (counted, to render again)
    const [, setTexts] = useState(0);
    useEffect(() => onMenuTexts(() => setTexts((n) => n + 1)), []);
    const lang = labels.lang;
    useEffect(() => {
        let live = true;
        loadMenus(lang).then(
            (m) => {
                if (live) {
                    setMenus(() => m);
                }
            },
            () => undefined
        );
        return () => {
            live = false;
        };
    }, [lang]);
    const ready = menus ? menusNow(labels.lang) : null;
    const withTexts = ready ? ready.menuLabels(labels) : null;
    const [keptTexts, setKeptTexts] = useState(/** @type {any} */ (null));
    if (withTexts && withTexts !== keptTexts) {
        setKeptTexts(withTexts);
    }
    const helpLabels = withTexts ?? keptTexts ?? labels;
    const help = useMemo(() => ({ explain, labels: helpLabels }), [explain, helpLabels]);
    return { menus, help };
}

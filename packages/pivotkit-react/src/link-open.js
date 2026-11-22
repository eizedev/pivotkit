/*
 * What a link loads (share.js: loadLink): pivotkit-core/link, which reads and writes the view in a
 * link, and opening a link's view in the report (use-share-link.js). Neither is needed before a link
 * is opened or made, so both stay out of the report's first load.
 */

import { decodeViewLink } from "pivotkit-core/link";
import { loadCheck, viewFromObject } from "./share.js";

export * from "pivotkit-core/link";

/**
 * @typedef {object} LinkReport  the report as a link meets it, at the moment it is opened
 * @property {any} history
 * @property {import("pivotkit-core").Encoded} encoded
 * @property {object | undefined} limits
 * @property {any} labels
 * @property {(text: string, extra?: object) => void} announce
 * @property {string | undefined} sourceId
 * @property {(loaded: import("./share.js").LoadedView, how?: { link?: boolean, restored?: boolean }) => void} loaded
 * @property {unknown} sources
 * @property {unknown} onSourceSwitch
 */

/**
 * Opens the view of a link: at once, or after the check for other data.
 * @param {string} text  the link
 * @param {boolean} asStep  a step Undo takes back, else where the report starts (a new history)
 * @param {LinkReport} report
 * @param {(check: any) => void} setCheck
 */
export function openWith(text, asStep, report, setCheck) {
    const { history: h, encoded: enc, limits: lim, labels: l, announce: say, sourceId: id, loaded: done, sources: list, onSourceSwitch: switchTo } = report;
    const decoded = decodeViewLink(text);
    // a link carries a view file (its link profile) or, made before it, a bare view
    const loaded = decoded.view ? viewFromObject(decoded.view, enc, { limits: lim, sourceId: id }) : null;
    if (!loaded || !loaded.view) {
        say(loaded?.failed === "newer" ? l.viewFailed.newer : l.viewFailed.badLink, { tone: "error" });
        return;
    }
    const open = () => {
        if (asStep) {
            done(loaded, { link: true });
        } else {
            h.restore(/** @type {object} */ (loaded.view));
            done(loaded, { link: true, restored: true });
        }
    };
    // a link made for other data asks first, as a pasted view does
    const check = loadCheck(loaded, l, Array.isArray(list) ? list : []);
    if (!check) {
        open();
        return;
    }
    const target = check.switchTo;
    setCheck({
        lines: check.lines,
        quiet: !asStep,
        load: open,
        switchTo:
            target && typeof switchTo === "function"
                ? { name: target.name, run: () => switchTo({ source: { id: target.id, name: target.name }, view: /** @type {Record<string, unknown>} */ (loaded.file?.view ?? loaded.view), name: loaded.file?.name || undefined }) }
                : undefined
    });
}


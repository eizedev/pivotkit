/*
 * pivotkit-element's deferred.js (its build.js puts this file in that one's place): the German texts
 * load before the first render of a German report, the tips' table after the first render. The
 * report waits for a language's texts, so it never shows English first.
 */

import { addLabels } from "./labels.js";

/** @type {import("./deferred.js").Deferred} */
export const DEFERRED = {
    tips: null,
    loadTips: () => import("./tips.js"),
    loadLabels: { de: () => import("./labels-de.js").then((m) => addLabels("de", m.de)) }
};

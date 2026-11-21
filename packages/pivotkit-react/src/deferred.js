/*
 * The parts of the first load that pivotkit-element loads later, here at once: the German texts
 * (labels-de.js) and the tips' table (tips.js). PivotReport.jsx imports this file as a file of its own
 * (build.js: deferredFile), so pivotkit-element can bundle deferred-late.js in its place. Both files
 * export the same names: what is here, and how to load what is not.
 */

import { de } from "./labels-de.js";
import { addLabels } from "./labels.js";
import { activeTips, tipActionText, tipContext, tipText } from "./tips.js";

addLabels("de", de);

/**
 * @typedef {object} Deferred
 * @property {TipsTable | null} tips  the tips' table and conditions; null until loaded
 * @property {(() => Promise<TipsTable>) | null} loadTips  loads them; null when they are here
 * @property {Readonly<Record<string, () => Promise<void>>>} loadLabels  per language not here yet: adds
 *   its first-load texts (labels.js addLabels)
 */

/** @typedef {Pick<typeof import("./tips.js"), "activeTips" | "tipActionText" | "tipContext" | "tipText">} TipsTable */

/** @type {Deferred} */
export const DEFERRED = { tips: { activeTips, tipActionText, tipContext, tipText }, loadTips: null, loadLabels: {} };

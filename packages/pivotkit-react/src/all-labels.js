/*
 * pivotkit-react/labels: every text of the UI in English and German, for a host that writes a
 * language of its own or reads a text. An entry of its own, so the report's first load (the package's
 * main entry) keeps only its own texts; the menus load theirs with them (menu-labels.js).
 */

import { LABELS as FIRST_LOAD } from "./labels.js";
import { de } from "./menu-labels-de.js";
import { en } from "./menu-labels.js";

/** @type {Readonly<{ en: import("./labels.js").UiLabels, de: import("./labels.js").UiLabels }>} */
export const LABELS = Object.freeze({ en: { ...FIRST_LOAD.en, ...en }, de: { ...FIRST_LOAD.de, ...de } });

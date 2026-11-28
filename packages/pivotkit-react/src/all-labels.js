/*
 * pivotkit-react/labels: every text of the UI in English and German, for a host that writes a
 * language of its own or reads a text. An entry of its own, so the report's first load (the package's
 * main entry) keeps only its own texts; the menus load theirs with them (menu-labels.js), the texts of
 * a view's unused parts (`unused`, unused-texts.js) load when a view has such parts, those of loading
 * data (`dataImport`, import-labels.js) with the import UI, those of a report with a server (`server`,
 * server-labels.js) with its network code.
 */

import { en as firstEn } from "./labels.js";
import { de as firstDe } from "./labels-de.js";
import { de } from "./menu-labels-de.js";
import { en } from "./menu-labels.js";
import { de as unusedDe } from "./unused-texts-de.js";
import { en as unusedEn } from "./unused-texts.js";
import { de as importDe, en as importEn } from "./import-labels.js";
import { de as serverDe, en as serverEn } from "./server-labels.js";

/** @type {Readonly<{ en: import("./labels.js").UiLabels, de: import("./labels.js").UiLabels }>} */
export const LABELS = Object.freeze({ en: { ...firstEn, ...en, unused: unusedEn, dataImport: importEn, server: serverEn }, de: { ...firstDe, ...de, unused: unusedDe, dataImport: importDe, server: serverDe } });

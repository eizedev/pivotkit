/*
 * What several test files share: the keys of a text table, and each language's texts as the menus
 * see them (the first load's texts with the menus' texts over them).
 */
import { LABELS } from "../src/labels.js";
// the German first-load texts: pivotkit-react adds them as it loads (deferred.js)
import "../src/deferred.js";
import { en as menuEn } from "../src/menu-labels.js";
import { de as menuDe } from "../src/menu-labels-de.js";

/**
 * Every key of a text table, nested keys as "a.b", sorted.
 * @param {object} o
 * @returns {string[]}
 */
export const keys = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? keys(v, `${p}${k}.`) : [`${p}${k}`])).sort();

/** The texts of each language as the menus see them. */
export const MENU = Object.freeze({ en: { ...LABELS.en, ...menuEn }, de: { ...LABELS.de, ...menuDe } });

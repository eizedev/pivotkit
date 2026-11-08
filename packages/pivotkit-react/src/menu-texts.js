/*
 * The menus' texts of each language besides English, one loader per language: a dynamic import of
 * its module, which the build makes a file of its own (build.js: the entry "menu-texts-<lang>" of
 * src/menu-labels-<lang>.js), so a report loads only its own language's (lazy-menus.jsx). English is
 * in menu-labels.js, with the menus, the fallback for every language. test/menu-texts.test.js checks
 * that every language of LABELS (labels.js) has its loader and its build entry.
 */

/** @type {Readonly<Record<string, () => Promise<import("./menu-labels.js").MenuTexts>>>} */
export const MENU_TEXTS_OF = Object.freeze({ de: () => import("./menu-labels-de.js").then((m) => m.de) });

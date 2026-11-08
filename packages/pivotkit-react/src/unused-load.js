/*
 * The texts that say a view's unused parts in plain words (unused-texts.js, with the language's own,
 * unused-texts-<lang>.js), loaded on demand: only a report whose view has such parts asks for them.
 * One load per language. When the language's texts fail, English stands in (for the page's life);
 * when English fails, the load is forgotten and the warning keeps the core's short message
 * (unused.jsx) until the next view with unused parts tries again. test/unused.test.js checks that
 * every language of LABELS has a loader.
 */

import { MENU_TEXTS, mergeLabels } from "./labels.js";

/** @type {Readonly<Record<string, () => Promise<Partial<import("./unused-texts.js").UnusedTexts>>>>} */
export const UNUSED_TEXTS_OF = Object.freeze({ de: () => import("./unused-texts-de.js").then((m) => m.de) });

/**
 * @typedef {{ mod: typeof import("./unused-texts.js"), lang: Partial<import("./unused-texts.js").UnusedTexts> | null }} UnusedLoaded
 * @type {Map<string, Promise<UnusedLoaded>>}
 */
const pending = new Map();
/** @type {Map<string, UnusedLoaded>} */
const loaded = new Map();

/** The texts of `lang` when they are here, else null. */
export const unusedNow = (lang) => loaded.get(lang) ?? null;

/**
 * The plain-word texts with those of `lang` (null when it has none, or they failed); rejects when the
 * English module fails.
 * @param {string} lang
 * @returns {Promise<UnusedLoaded>}
 */
export function loadUnused(lang) {
    let p = pending.get(lang);
    if (!p) {
        const own = Object.hasOwn(UNUSED_TEXTS_OF, lang) ? UNUSED_TEXTS_OF[lang]().catch(() => null) : null;
        p = Promise.all([import("./unused-texts.js"), own]).then(
            ([mod, texts]) => {
                const out = { mod, lang: texts };
                loaded.set(lang, out);
                return out;
            },
            (error) => {
                pending.delete(lang);
                throw error;
            }
        );
        pending.set(lang, p);
    }
    return p;
}

/**
 * The texts of a language: English, the language's own over it, a host's `unused` labels over both
 * (kept aside by resolveLabels, as the menus' are).
 * @param {UnusedLoaded} loaded
 * @param {import("./labels.js").UiLabels} labels
 * @returns {import("./unused-texts.js").UnusedTexts}
 */
export function unusedTexts(loaded, labels) {
    const host = /** @type {any} */ (labels)[MENU_TEXTS];
    return mergeLabels(mergeLabels(loaded.mod.en, loaded.lang), host && typeof host === "object" ? host.unused : undefined);
}

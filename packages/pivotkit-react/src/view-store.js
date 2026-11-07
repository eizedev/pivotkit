/*
 * The browser store (`templateStore="browser"`): the user's own views in localStorage under the
 * report's storageKey (templates.js names the item), as view files that name the data they were made
 * for. It loads with the menus (menus.js), not with the first load of a page. Pure, without a DOM:
 * the report reads and writes the text through storage.js.
 */

import { toViewFile } from "pivotkit-core";
import { parseTemplates } from "pivotkit-core/templates";
import { fill } from "./labels.js";

/** The most the browser store keeps per storageKey: views, and characters of their JSON. */
export const VIEW_STORE_LIMITS = Object.freeze({ count: 100, text: 500_000 });

/**
 * The browser store's views from its text, those for the data shown: made for `sourceId` or for no
 * named data. Broken or foreign text gives none (parseTemplates checks and caps it).
 * @param {string | null} raw
 * @param {string | undefined} sourceId
 * @returns {Array<{ name: string, view: Record<string, unknown>, at: number }>}
 */
export function storedViews(raw, sourceId) {
    const all = raw ? parseTemplates(raw).templates : [];
    return all.map((t, at) => ({ name: t.name, view: t.view, id: t.source?.id, at })).filter((t) => !t.id || !sourceId || t.id === sourceId).map(({ name, view, at }) => ({ name, view, at }));
}

/**
 * The browser store's text after a change: `name` saved for `sourceId` (replacing a view of the same
 * name for the same data), or the view at `remove` taken out, when it is still the one named
 * `removeName` (another tab may have changed the store since the menu was drawn). Throws an Error naming the limit when
 * the store would hold more than VIEW_STORE_LIMITS.
 * @param {string | null} raw
 * @param {{ name?: string, view?: object, sourceId?: string, remove?: number, removeName?: string }} change
 * @param {(limit: "count" | "text", max: number) => string} tooMuch  the message for a limit
 * @returns {string | null}  null when nothing is left
 */
export function changedViews(raw, change, tooMuch) {
    const all = raw ? parseTemplates(raw).templates : [];
    let next = all.filter((t, i) => i !== change.remove || (change.removeName !== undefined && t.name !== change.removeName));
    if (change.name && change.view) {
        const id = change.sourceId;
        next = next.filter((t) => t.name !== change.name || (t.source?.id ?? undefined) !== id);
        next.push({ name: change.name, view: /** @type {Record<string, unknown>} */ (change.view), ...(id ? { source: { id } } : {}) });
    }
    if (next.length > VIEW_STORE_LIMITS.count) {
        throw new Error(tooMuch("count", VIEW_STORE_LIMITS.count));
    }
    const text = next.length ? JSON.stringify(next.map((t) => toViewFile(t.view, { name: t.name, source: t.source }, { link: true }))) : null;
    if (text && text.length > VIEW_STORE_LIMITS.text) {
        throw new Error(tooMuch("text", VIEW_STORE_LIMITS.text));
    }
    return text;
}

/**
 * Saves or deletes a view in the browser store (see changedViews). Throws an Error with the reason in
 * the labels' words when the store would hold too much or the browser refused to keep it.
 * @param {string | null} raw  the store's text now
 * @param {{ name?: string, view?: object, sourceId?: string, remove?: number, removeName?: string }} change
 * @param {any} labels  with the menus' texts
 * @param {string} locale  for the numbers
 * @param {(text: string | null) => boolean} keep  writes the text (storage.js: writeItem), false when the browser refused
 */
export function storeViews(raw, change, labels, locale, keep) {
    const text = changedViews(raw, change, (limit, max) => fill(limit === "count" ? labels.storeFull : labels.storeTooLarge, { max: max.toLocaleString(locale) }));
    if (!keep(text)) {
        throw new Error(labels.storeRefused);
    }
}

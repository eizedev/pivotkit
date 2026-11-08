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

/** Whether the console was told once that the stored text is too long to read. */
let warnedLarge = false;

/**
 * Every view of the store's text. A text longer than VIEW_STORE_LIMITS.text (changed by hand, or
 * written by another program) is not parsed: it reads as no views, with one console warning, and
 * the next save replaces it. Broken or foreign text gives none (parseTemplates checks it).
 * @param {string | null} raw
 */
function readAll(raw) {
    if (!raw) {
        return [];
    }
    if (raw.length > VIEW_STORE_LIMITS.text) {
        if (!warnedLarge) {
            warnedLarge = true;
            console.warn(`pivotkit: the browser store of views holds more than ${VIEW_STORE_LIMITS.text} characters; it is not read, and the next save replaces it`);
        }
        return [];
    }
    return parseTemplates(raw).templates;
}

/**
 * The browser store's views from its text, those for the data shown: made for `sourceId` or for no
 * named data.
 * @param {string | null} raw
 * @param {string | undefined} sourceId
 * `sourceId` of an entry: the data it names (none for a view saved without), which tells two views
 * of the same name apart (one for no named data, one for this data).
 * @returns {Array<{ name: string, view: Record<string, unknown>, at: number, sourceId?: string }>}
 */
export function storedViews(raw, sourceId) {
    return readAll(raw)
        .map((t, at) => ({ name: t.name, view: t.view, at, ...(t.source?.id ? { sourceId: t.source.id } : {}) }))
        .filter((t) => !t.sourceId || !sourceId || t.sourceId === sourceId);
}

/**
 * The browser store's text after a change: `name` saved for `sourceId` (replacing a view of the same
 * name for the same data), the view at `replace` written over in its place (Save, and Save as onto a
 * name that exists: its data and its place in the list stay), or the view at `remove` taken out. A
 * delete and a replace check that the view there is still the one named `removeName` or `name`
 * (another tab may have changed the store since the menu was drawn) and throw "changed" when it is
 * not, so the wrong view is never deleted or overwritten. The caps apply to a save
 * only: a store over them (older caps, changed by hand) can always shrink.
 * @param {string | null} raw
 * @param {{ name?: string, view?: object, sourceId?: string, remove?: number, removeName?: string, replace?: number }} change
 * @param {(kind: "count" | "text" | "changed", max: number) => string} message  the Error's message
 * @returns {string | null}  null when nothing is left
 */
export function changedViews(raw, change, message) {
    const all = readAll(raw);
    let next = all;
    if (change.remove !== undefined) {
        if (all[change.remove]?.name !== change.removeName) {
            throw new Error(message("changed", 0));
        }
        next = all.filter((t, i) => i !== change.remove);
    }
    const saving = Boolean(change.name && change.view);
    if (saving && change.replace !== undefined) {
        const old = all[change.replace];
        if (old?.name !== change.name) {
            throw new Error(message("changed", 0));
        }
        next = all.map((t, i) => (i === change.replace ? { name: old.name, view: /** @type {Record<string, unknown>} */ (change.view), ...(old.source ? { source: old.source } : {}) } : t));
    } else if (saving) {
        const id = change.sourceId;
        next = next.filter((t) => t.name !== change.name || (t.source?.id ?? undefined) !== id);
        next.push({ name: /** @type {string} */ (change.name), view: /** @type {Record<string, unknown>} */ (change.view), ...(id ? { source: { id } } : {}) });
        if (next.length > VIEW_STORE_LIMITS.count) {
            throw new Error(message("count", VIEW_STORE_LIMITS.count));
        }
    }
    const text = next.length ? JSON.stringify(next.map((t) => toViewFile(t.view, { name: t.name, source: t.source }, { link: true }))) : null;
    if (saving && text && text.length > VIEW_STORE_LIMITS.text) {
        throw new Error(message("text", VIEW_STORE_LIMITS.text));
    }
    return text;
}

/**
 * Saves or deletes a view in the browser store (see changedViews). Throws an Error with the reason in
 * the labels' words when the store would hold too much, changed since the menu was drawn, or the
 * browser refused to keep it.
 * @param {string | null} raw  the store's text now
 * @param {{ name?: string, view?: object, sourceId?: string, remove?: number, removeName?: string, replace?: number }} change
 * @param {any} labels  with the menus' texts
 * @param {string} locale  for the numbers
 * @param {(text: string | null) => boolean} keep  writes the text (storage.js: writeItem), false when the browser refused
 */
export function storeViews(raw, change, labels, locale, keep) {
    const texts = { count: labels.storeFull, text: labels.storeTooLarge, changed: labels.storeChanged };
    const text = changedViews(raw, change, (kind, max) => fill(texts[kind], { max: max.toLocaleString(locale) }));
    if (!keep(text)) {
        throw new Error(labels.storeRefused);
    }
}

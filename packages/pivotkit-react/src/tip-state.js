/*
 * What the report needs of the tips before their table is here: the ids a host and the storage may
 * name, the switches kept in the same list (all tips, explanations, the field list's rail), reading
 * and writing that list, and the keyboard shortcuts of Help. The table and its conditions are in
 * tips.js, which pivotkit-element loads after the first render (deferred-late.js).
 */

import { readItem, subscribeItem, writeItem } from "./storage.js";
import { emptyPick, filterZoneFields } from "./view-ops.js";

/**
 * Every tip id, for a host's `tips` list and for stored dismissals: the ids of the table in tips.js,
 * in its order (test/tips.test.js checks it). A list of its own, so the stored dismissals keep every id
 * while the table itself is still loading (pivotkit-element).
 */
export const TIP_IDS = Object.freeze(["showAs", "colSubtotals", "chartOverTime", "pieSlices", "pieColumns", "chartDates", "chartTrend", "chartSeries", "textValue", "dateUngrouped", "manyColumns", "afterDrag", "values", "saveTemplate", "menus", "cells"]);

/** The notices of the table in tips.js: shown whenever they hold, whatever the tips settings are. */
export const NOTICE_IDS = Object.freeze(["filterEmpty", "top", "chartCapped"]);

/** The dismissal that switches every tip off ("Show tips" in Options). */
export const ALL_TIPS = "*";

/**
 * The other switch of Options → Help, "Show explanations", kept in the same list (and storage) as the
 * tips: off, it hides every "i" - of the settings, of the zones and of the field descriptions -
 * except those a host forces on (the props settingInfo, zoneInfo and fieldInfo).
 */
export const NO_EXPLANATIONS = "-explanations";
/** The field list collapsed to a rail by the user (a wide or medium report), kept in the same list. */
export const FIELDS_COLLAPSED = "-fields";
/** Entries of the list that are switches, not dismissed tips: "Show dismissed tips again" keeps them. */
export const SWITCHES = Object.freeze([ALL_TIPS, NO_EXPLANATIONS, FIELDS_COLLAPSED]);

/**
 * Whether the field list is collapsed: the user's choice in this session, else the host's
 * `fieldList` ("open" or "collapsed"), else what the user chose before (the list).
 * @param {boolean | null} session
 * @param {unknown} forced
 * @param {readonly string[]} dismissed
 */
export function fieldsCollapsed(session, forced, dismissed) {
    return session ?? (forced === "collapsed" || forced === "open" ? forced === "collapsed" : dismissed.includes(FIELDS_COLLAPSED));
}

/** Entries "Show dismissed tips again" keeps: the switches. */
export const keptOnReset = (id) => SWITCHES.includes(id);

/**
 * Whether one kind of "i" shows: the host's "on" or "off" forces it (and the user's switch leaves it
 * alone), else the user's "Show explanations" in the list, on by default.
 * @param {unknown} forced  the host's prop (settingInfo, zoneInfo or fieldInfo)
 * @param {readonly string[]} dismissed
 * @param {string} [off]  the switch's entry, NO_EXPLANATIONS
 * @returns {{ on: boolean, user: boolean }}  `user`: the user's switch decides
 */
export function helpSwitch(forced, dismissed, off = NO_EXPLANATIONS) {
    if (forced === "on" || forced === "off") {
        return { on: forced === "on", user: false };
    }
    return { on: !dismissed.includes(off), user: true };
}

/**
 * The keyboard shortcuts of the help section in Options: the keys (with "Mod" for Ctrl or ⌘) and
 * the key of their text in labels.shortcuts.
 */
export const SHORTCUTS = Object.freeze([
    { keys: ["Mod", "Z"], text: "undo" },
    { keys: ["Mod", "Shift", "Z"], text: "redo" },
    { keys: ["Arrow keys"], text: "move" },
    { keys: ["Enter"], text: "open" },
    { keys: ["Space"], text: "drag" },
    { keys: ["Escape"], text: "close" },
    { keys: ["Arrow keys"], text: "fields" },
    { keys: ["Shift", "F10"], text: "fieldMenu" }
]);

/**
 * A host's `tips` prop or attribute: "on" (default), "off", or the ids it allows (an array, or a
 * comma-separated text); unknown ids are left out.
 * @param {unknown} value
 * @returns {"on" | "off" | string[]}
 */
export function allowedTips(value) {
    if (value === "off" || value === false) {
        return "off";
    }
    const list = typeof value === "string" && value.trim() !== "on" && value.trim() !== "" ? value.split(",") : Array.isArray(value) ? value : null;
    if (!list) {
        return "on";
    }
    return list.map((id) => String(id).trim()).filter((id) => TIP_IDS.includes(id));
}

/** Dismissed ids from anywhere (storage, a host): known ids and the switches only, once each. */
export function cleanDismissed(value) {
    return Array.isArray(value) ? [...new Set(value.filter((id) => typeof id === "string" && (SWITCHES.includes(id) || TIP_IDS.includes(id))))] : [];
}

/** The localStorage key of a report's tips: one per `storageKey`, so two reports never share one. */
export const storageName = (key) => `pivotkit:tips:${key}`;

/**
 * The stored text of a report's dismissed tips, or null (no key, no storage, blocked). A text, so a
 * React store snapshot of it compares by value.
 * @param {string | undefined} key
 * @param {Pick<Storage, "getItem"> | null | undefined} storage
 * @returns {string | null}
 */
export function readStored(key, storage) {
    return key ? readItem(storageName(key), storage) : null;
}

/** The dismissed ids of a stored text: [] for nothing or broken JSON. @param {string | null} raw */
export function parseStored(raw) {
    if (!raw) {
        return [];
    }
    try {
        return cleanDismissed(JSON.parse(raw));
    } catch {
        return [];
    }
}

/**
 * The dismissed tips stored for a report, or [] (no key, no storage, blocked, broken JSON).
 * @param {string | undefined} key
 * @param {Pick<Storage, "getItem"> | null | undefined} storage
 */
export function readDismissed(key, storage) {
    return parseStored(readStored(key, storage));
}

/**
 * Listens to the stored tips of a key: a write in this page (writeDismissed) or in another tab of
 * the same site. For useSyncExternalStore, so the report reads the storage only after hydration (its
 * server snapshot is "nothing stored").
 * @param {string | undefined} key
 * @param {() => void} callback
 * @returns {() => void}  stops listening
 */
export function subscribeStored(key, callback) {
    return key ? subscribeItem(storageName(key), callback) : () => {};
}

/**
 * Stores the dismissed tips of a report and tells the reports of the page that use the key; nothing
 * without a key or storage, and quietly when the browser refuses (private mode, quota): the tips stay
 * dismissed until the page is loaded again.
 * @param {string | undefined} key
 * @param {Pick<Storage, "setItem" | "removeItem"> | null | undefined} storage
 * @param {readonly string[]} dismissed
 */
export function writeDismissed(key, storage, dismissed) {
    if (key && storage) {
        writeItem(storageName(key), storage, dismissed.length ? JSON.stringify(dismissed) : null);
    }
}

/** The Filters zone fields, kept with empty filters, and every other filter gone: "Remove filter". */
export function withoutFilters(view) {
    return { ...view, filters: filterZoneFields(view).map(emptyPick) };
}

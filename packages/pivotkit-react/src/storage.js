/*
 * The browser's storage, one way for every part of the report that keeps something there (the
 * dismissed tips, the views of the browser store): reads and writes that never throw (a sandboxed
 * frame, private mode or a full quota only lose what was to be kept), and a subscription to an item,
 * told about a write in this page and in another tab of the same site (the storage event). Read with
 * useSyncExternalStore and a server snapshot of "nothing stored", so server rendering and hydration
 * match.
 */

/** The browser's localStorage, or null where it is missing or blocked (a sandboxed frame throws). */
export function localStore() {
    try {
        return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
    } catch {
        return null;
    }
}

/**
 * The stored text of an item, or null (no storage, nothing stored, blocked).
 * @param {string} name
 * @param {Pick<Storage, "getItem"> | null | undefined} storage
 * @returns {string | null}
 */
export function readItem(name, storage) {
    try {
        return storage ? storage.getItem(name) : null;
    } catch {
        return null;
    }
}

/** Who listens to an item in this page, by the item's name. */
const listeners = new Map();

/**
 * Listens to an item: a write in this page (writeItem) or in another tab (the storage event).
 * @param {string} name
 * @param {() => void} callback
 * @returns {() => void}  stops listening
 */
export function subscribeItem(name, callback) {
    const set = listeners.get(name) ?? new Set();
    set.add(callback);
    listeners.set(name, set);
    const onStorage = (e) => {
        if (e.key === null || e.key === name) {
            callback();
        }
    };
    const win = typeof window !== "undefined" ? window : null;
    win?.addEventListener("storage", onStorage);
    return () => {
        set.delete(callback);
        if (set.size === 0) {
            listeners.delete(name);
        }
        win?.removeEventListener("storage", onStorage);
    };
}

/**
 * Stores the text of an item (null removes it) and tells its listeners in this page. False when the
 * browser refused (blocked, private mode, quota); nothing is thrown.
 * @param {string} name
 * @param {Pick<Storage, "setItem" | "removeItem"> | null | undefined} storage
 * @param {string | null} text
 */
export function writeItem(name, storage, text) {
    let ok = false;
    if (storage) {
        try {
            if (text === null) {
                storage.removeItem(name);
            } else {
                storage.setItem(name, text);
            }
            ok = true;
        } catch {
            // storage blocked or full: the caller says what was not kept
        }
    }
    for (const callback of [...(listeners.get(name) ?? [])]) {
        callback();
    }
    return ok;
}

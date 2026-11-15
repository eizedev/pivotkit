/*
 * The process cache of loaded data (code and HTTP sources): their tables by a key (sources/keys.js
 * canonical JSON), least recently used out, bounded three ways so one source or one person cannot
 * push everyone else's data out or fill the memory: at most 64 entries, at most 256 MiB by default
 * (sourceCache.maxMb, set by createContext through sources/run.js setCacheBytes; each entry
 * measured by its kind: a code source's packed table by packed.js packedBytes), at most 8 entries and a quarter of the bytes per owner
 * (a person, or a shared source). A new entry pushes out its own owner's oldest entries first; an
 * entry larger than an owner's share is not kept.
 */

/** The bounds of the process cache. */
export const LOAD_CACHE = Object.freeze({ entries: 64, bytes: 268_435_456, perIdentity: 8 });

/** The share of the bytes one owner may hold. */
export const OWNER_SHARE = 0.25;

/**
 * About how many bytes encoded data takes (a worker's kept data sets, data.js): each column's codes and values, and its dictionary (texts
 * two bytes a character, every entry with a little overhead).
 * @param {any} data  pivotkit-core encode()'s result
 */
export function encodedBytes(data) {
    let bytes = 0;
    for (const column of data?.columns ?? []) {
        bytes += (column.codes?.byteLength ?? 0) + (column.values?.byteLength ?? 0);
        for (const entry of column.dict ?? []) {
            bytes += 16 + (typeof entry === "string" ? entry.length * 2 : 8);
        }
    }
    return bytes;
}

/**
 * @template T
 * @typedef {object} CacheEntry
 * @property {T} value
 * @property {string} identity  whose data it is ("*": everyone's)
 * @property {number} bytes
 */

/**
 * A cache of loaded data.
 * @template T
 * @param {Partial<typeof LOAD_CACHE>} [bounds]
 */
export function createLoadCache(bounds = {}) {
    const { entries, perIdentity } = { ...LOAD_CACHE, ...bounds };
    // the bytes may be set again (sourceCache.maxMb): createContext sets them for the process
    /** @type {number} */
    let bytes = bounds.bytes ?? LOAD_CACHE.bytes;
    /** @type {Map<string, CacheEntry<T>>} least recently used first */
    const map = new Map();
    let total = 0;

    const drop = (key) => {
        const entry = map.get(key);
        if (entry) {
            total -= entry.bytes;
            map.delete(key);
        }
    };

    /** Drops the least recently used entries (of one identity, or of all) while `over()` says so. */
    const trim = (over, identity = null) => {
        for (const [key, entry] of map) {
            if (!over()) {
                return;
            }
            if (identity === null || entry.identity === identity) {
                drop(key);
            }
        }
    };

    return {
        /**
         * An entry's value, now the most recently used, or undefined.
         * @param {string} key
         * @returns {T | undefined}
         */
        get(key) {
            const entry = map.get(key);
            if (!entry) {
                return undefined;
            }
            map.delete(key);
            map.set(key, entry);
            return entry.value;
        },

        /**
         * Keeps a value, the least recently used going first; one larger than the budget is not kept.
         * @param {string} key
         * @param {T} value
         * @param {{ identity: string, bytes: number }} about
         */
        set(key, value, about) {
            drop(key);
            const share = Math.floor(bytes * OWNER_SHARE);
            if (about.bytes > share) {
                return;
            }
            const own = () => [...map.values()].filter((e) => e.identity === about.identity);
            // the owner's own entries go first, so one owner never pushes out the others' data
            trim(() => own().length >= perIdentity || own().reduce((n, e) => n + e.bytes, 0) + about.bytes > share, about.identity);
            trim(() => map.size >= entries || total + about.bytes > bytes);
            map.set(key, { value, identity: about.identity, bytes: about.bytes });
            total += about.bytes;
        },

        /** @param {string} key */
        delete: (key) => drop(key),

        /** The bytes it may hold in all; one owner a quarter of them. */
        limit: () => bytes,

        /**
         * Sets the bytes it may hold, pushing out the least recently used entries over the new bound.
         * @param {number} next
         */
        resize(next) {
            bytes = next;
            trim(() => total > bytes);
        },

        /** How many entries and bytes it holds (tests, check-config). */
        size: () => ({ entries: map.size, bytes: total })
    };
}

/*
 * The process cache of loaded data (code sources, and HTTP sources later): encoded data by a key
 * (sources/keys.js canonical JSON), least recently used out, bounded three ways so one source or one
 * person cannot push everyone else's data out or fill the memory: at most 64 entries, at most 256 MiB
 * of encoded data (measured by encodedBytes), at most 8 entries per identity. An entry larger than
 * the whole budget is not kept.
 */

/** The bounds of the process cache. */
export const LOAD_CACHE = Object.freeze({ entries: 64, bytes: 268_435_456, perIdentity: 8 });

/**
 * About how many bytes encoded data takes: each column's codes and values, and its dictionary (texts
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
    const { entries, bytes, perIdentity } = { ...LOAD_CACHE, ...bounds };
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
            if (about.bytes > bytes) {
                return;
            }
            const count = () => [...map.values()].filter((e) => e.identity === about.identity).length;
            trim(() => count() >= perIdentity, about.identity);
            trim(() => map.size >= entries || total + about.bytes > bytes);
            map.set(key, { value, identity: about.identity, bytes: about.bytes });
            total += about.bytes;
        },

        /** @param {string} key */
        delete: (key) => drop(key),

        /** How many entries and bytes it holds (tests, check-config). */
        size: () => ({ entries: map.size, bytes: total })
    };
}

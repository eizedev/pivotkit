/*
 * One rule for every part of the report that loads on demand (the chart, the menus, the import UI,
 * a link, the exports): imported once and kept; a failed import is forgotten, so the next call tries
 * again, for example after a network error.
 */

/**
 * @template T
 * @param {() => Promise<T>} load  the dynamic import
 * @returns {{ load: () => Promise<T>, now: () => T | null }}  `load` starts or joins the import; `now`
 *   gives the module at once when it is there, else null
 */
export function lazy(load) {
    /** @type {Promise<T> | null} */
    let pending = null;
    /** @type {T | null} */
    let loaded = null;
    return {
        load: () =>
            (pending ??= load().then(
                (m) => (loaded = m),
                (error) => {
                    pending = null;
                    throw error;
                }
            )),
        now: () => loaded
    };
}

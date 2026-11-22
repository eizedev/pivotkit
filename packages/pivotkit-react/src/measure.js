/*
 * The report's own steps on the browser's performance timeline ("pivotkit:computePivot"), so a host
 * can see what the data and the view cost.
 */

/**
 * Runs `fn` and records how long it took as the measure "pivotkit:<name>".
 * @template T
 * @param {string} name
 * @param {() => T} fn
 * @returns {T}
 */
export function measured(name, fn) {
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    const out = fn();
    if (typeof performance !== "undefined" && typeof performance.measure === "function") {
        try {
            performance.measure(`pivotkit:${name}`, { start: t0, end: performance.now() });
        } catch {
            // an old browser without the options form of measure(): no timing, nothing else changes
        }
    }
    return out;
}

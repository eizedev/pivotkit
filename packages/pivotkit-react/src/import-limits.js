/*
 * The limits a loaded file is read and shown with (`importLimits`): the host's import limits over its
 * `limits`, key by key. A host that keeps uploads small (`importLimits: { rows: 1000 }`) does not cap
 * its own data, and a key the import limits leave out is the host's. Nothing is checked here:
 * pivotkit-core's readFile and encode check the result as they check `limits`.
 */

/**
 * @param {unknown} limits  the host's `limits`
 * @param {unknown} importLimits  the host's `importLimits`
 * @returns {Partial<import("pivotkit-core").Limits> | undefined}  to pass as `options.limits`
 */
export function importLimitsOf(limits, importLimits) {
    if (importLimits === null || importLimits === undefined) {
        return /** @type {any} */ (limits ?? undefined);
    }
    // not an object: passed on as it is, so readFile refuses it with its own message
    if (typeof importLimits !== "object" || limits === null || typeof limits !== "object") {
        return /** @type {any} */ (importLimits);
    }
    return { ...limits, ...importLimits };
}

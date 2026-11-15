/*
 * Data sent in the request ("inline:"): not offered in this version. The id is reserved (no
 * configured id can hold ":"), and a request for it gets what any unknown source gets.
 */

/** The reserved source id of data sent in the request. */
export const INLINE_ID = "inline:";

/**
 * The answer to a request for inline data: SOURCE_NOT_FOUND, as for any unknown id.
 * @param {any} reg  the registry's internals (registry.js)
 * @param {string} ref
 * @param {import("../registry.js").Caller} caller
 * @param {any} how
 */
export function resolveInline(reg, ref, caller, how) {
    return reg.notFound(ref, caller, how);
}

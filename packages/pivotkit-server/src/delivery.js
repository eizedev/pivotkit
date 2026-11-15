/*
 * How a written report reaches the person who asked for it: what `output` of a result says (its name,
 * its path on a local server, its address under output.baseUrl) and, where a link needs a word on how
 * to open it, `note`, one sentence the result's message repeats. In this version a written report is
 * delivered as written.
 */

/**
 * @typedef {object} Written  what output.js's writeOutput gives
 * @property {string} name
 * @property {string} [path]
 * @property {string} [url]
 * @property {string} mediaType
 */

/**
 * @typedef {Written & { note?: string }} Delivered
 */

/**
 * The delivery of a written report to a caller.
 * @param {any} _context
 * @param {Written | null} written
 * @param {{ caller: import("./registry.js").Caller, sourceClosed: boolean, surface: "mcp" | "rest", policy: import("./policy.js").Policy }} _how
 *   sourceClosed: a field of the source is not "show" for someone (the server's, the source's or any profile's policy)
 * @returns {Promise<Delivered | null>}
 */
export async function deliver(_context, written, _how) {
    return written;
}

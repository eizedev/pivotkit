/*
 * Scopes as a caller sees them.
 */

/**
 * A hint list_sources gives a caller, or null: none in this version.
 * @param {any} _context
 * @param {import("./registry.js").Caller} _caller
 * @param {Array<{ id: string }>} _sources  the sources the caller may use
 * @returns {string | null}
 */
export function listHint(_context, _caller, _sources) {
    return null;
}

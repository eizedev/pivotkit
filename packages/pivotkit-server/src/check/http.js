/*
 * check-config's section for HTTP sources and their sign-in at the backend.
 *
 * check/index.js says what a section returns. Says nothing until the feature fills it.
 */

/** @type {import("./index.js").Section} */
export async function section(_options, _registry, _runtime) {
    return { lines: [], problems: 0, upgrade: [] };
}

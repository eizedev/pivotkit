/*
 * check-config's section for the operator's controls.
 *
 * check/index.js says what a section returns. Says nothing until the feature fills it.
 */

/** @type {import("./index.js").Section} */
export async function section(_options, _registry, _runtime) {
    return { lines: [], problems: 0, upgrade: [] };
}

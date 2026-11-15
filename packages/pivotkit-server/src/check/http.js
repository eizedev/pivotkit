/*
 * check-config's section for #328 and #329 (HTTP sources and their backend sign-in) (check/index.js says what a section returns). Says nothing
 * until that work fills it.
 */

/** @type {import("./index.js").Section} */
export async function section(_options, _registry, _runtime) {
    return { lines: [], problems: 0, upgrade: [] };
}

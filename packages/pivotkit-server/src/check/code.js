/*
 * check-config's section for #330 (code sources) (check/index.js says what a section returns). Says nothing
 * until that work fills it.
 */

/** @type {import("./index.js").Section} */
export async function section(_options, _registry, _runtime) {
    return { lines: [], problems: 0, upgrade: [] };
}

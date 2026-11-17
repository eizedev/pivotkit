/*
 * Helpers this repository's packages share with pivotkit-core (pivotkit-cli, pivotkit-server), so
 * each is defined once. Not public API: no docs page names them, and any release may change them.
 */

export { limitText } from "./errors.js";
export { referenceLineRules, referenceLines, valueAddsUp } from "./chart-lines.js";

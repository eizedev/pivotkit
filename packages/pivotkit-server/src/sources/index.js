/*
 * The kinds of source and the dispatch to each: `file` (sources/file.js: a configured file and
 * "file:" paths, read in a worker), `code` (sources/code.js: a library host's load()), `http`
 * (sources/http.js) and the reserved id "inline:" (sources/inline.js). The registry resolves a source
 * id to its kind; runResolved runs an operation over it.
 */

import { codeKind } from "./code.js";
import { fileKind } from "./file.js";
import { httpKind } from "./http.js";
import { withoutExtras } from "./input.js";

export { FILE_PREFIX } from "./file.js";
export { INLINE_ID } from "./inline.js";

/** The kinds of a configured source by name. */
export const KINDS = Object.freeze({ file: fileKind, code: codeKind, http: httpKind });

/**
 * The kind of a configured source.
 * @param {{ file?: string, load?: Function, http?: unknown }} source
 * @returns {"file" | "code" | "http"}
 */
export const kindOf = (source) => (source.http ? "http" : source.load ? "code" : "file");

/**
 * Runs an operation over a resolved source (registry.resolve's) with its kind: the input without
 * the extra inputs (params), which the source already took.
 * @param {any} context  createContext's
 * @param {string} op
 * @param {Record<string, any>} input
 * @param {any} resolved
 * @param {import("../registry.js").Caller} caller
 * @returns {Promise<{ outcome: import("pivotkit-report/operations").OperationOutcome, hidden: number, stats: import("../stats.js").SourceStats | null, asOf?: string | null, stale?: { since: string } | null }>}
 */
export function runResolved(context, op, input, resolved, caller) {
    const base = { link: resolved.link, template: resolved.template, locale: context.options.locale, timeZone: context.options.timeZone };
    return KINDS[/** @type {"file" | "code" | "http"} */ (resolved.sourceKind)].run(context.computer, op, withoutExtras(input), resolved, base, caller, context.log);
}

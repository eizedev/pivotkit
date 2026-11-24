/*
 * An operation's input as it reads it: the source's data through the front end, the view read and
 * checked against the limits for a view from outside, and the fields it uses.
 */

import { OUTSIDE_LIMITS, fromViewFile, normalize, outsideLimits, viewFileFields } from "pivotkit-core";
import { OperationError } from "./errors.js";
import { findingText } from "./findings.js";

/** The data of a source, through the front end. */
export async function sourceData(env, source) {
    if (typeof env.data !== "function") {
        throw new OperationError("INVALID_INPUT", "this front end reads no data");
    }
    return env.data(source);
}

/**
 * The view of an input: read as a view file, a template or a bare view.
 * @returns {import("pivotkit-core").ViewFileRead}
 */
export function readView(view) {
    const text = typeof view === "string" ? view : JSON.stringify(view ?? null);
    if (text.length > OUTSIDE_LIMITS.json) {
        throw new OperationError("LIMIT_EXCEEDED", `the view has ${text.length.toLocaleString("en-US")} characters; at most ${OUTSIDE_LIMITS.json.toLocaleString("en-US")}`);
    }
    return fromViewFile(text);
}

/** A failed view read as one finding. */
export const unreadable = (read) => ({ severity: /** @type {const} */ ("error"), code: "viewFile", path: "", message: findingText(`not a view: ${read.issues.at(-1)?.message ?? read.failed}`) });

/** The view file's own notes (a key left out, an old format) as warnings. */
export const fileNotes = (read) => read.issues.map((i) => ({ severity: /** @type {const} */ ("warning"), code: "viewFile", path: findingText(i.path ?? ""), message: findingText(i.message) }));

/**
 * The limits for a view from outside, over the env's.
 * @returns {Partial<import("pivotkit-core").Limits>}
 */
export const viewLimits = (env) => outsideLimits(env.limits);

/**
 * The data's fields a view uses, as the data spells them: the view normalized against the data first,
 * so " Email" and "email" are "Email", and a name the data does not have is no use of anything.
 */
export const usesOf = (view, data, env) => viewFileFields(normalize(view, data, { limits: viewLimits(env) }).view);

/** Whether a source's data is encoded (rows) rather than a field list. */
export const isEncoded = (data) => Boolean(data && typeof data === "object" && !Array.isArray(data) && typeof (/** @type {any} */ (data).column) === "function");

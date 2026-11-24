/*
 * A finding: what an operation says about a view (an error, a warning or a note), with text from
 * outside cleaned and capped.
 */

import { cleanText } from "pivotkit-core/import";

/**
 * @typedef {object} Finding
 * @property {"error" | "warning" | "info"} severity
 * @property {string} code
 * @property {string} path
 * @property {string} message
 * @property {string} [suggestion]  the name or item meant ("did you mean")
 * @property {string} [field]  the data field the finding is about, where it is about one (an item of a filter: itemCase, itemUnknown)
 */

/** The most characters of a name, path or message from outside an operation puts into a finding. */
export const FINDING_TEXT = 200;

/** Text from a view or the data, as a finding carries it: no control or direction characters, capped. */
export function findingText(text) {
    const clean = cleanText(String(text ?? ""));
    return clean.length > FINDING_TEXT ? `${clean.slice(0, FINDING_TEXT - 1)}…` : clean;
}

/**
 * An issue of pivotkit-core (or a reader's note) as a finding.
 * @param {{ severity?: string, code?: string, path?: string, message?: string, params?: { suggestion?: string, field?: string } }} issue
 * @returns {Finding}
 */
export function findingOf(issue) {
    const severity = issue.severity === "warning" ? "warning" : issue.severity === "info" ? "info" : "error";
    return {
        severity,
        code: issue.code ?? "issue",
        path: findingText(issue.path ?? ""),
        message: findingText(issue.message ?? ""),
        ...(issue.params?.suggestion ? { suggestion: findingText(issue.params.suggestion) } : {}),
        ...(issue.params?.field ? { field: findingText(issue.params.field) } : {})
    };
}

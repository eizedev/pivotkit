// The note when a command writes nothing because of the view's findings: errors, or warnings that
// --strict counts as errors. One text for render, describe --suggest and remote mode.

/**
 * @param {{ severity: string }[]} findings
 * @param {string} [what]  "view" or "draft"
 */
export function nothingWritten(findings, what = "view") {
    return findings.some((f) => f.severity === "error")
        ? `nothing written: the ${what} has errors.`
        : `nothing written: --strict counts the ${what}'s warnings as errors.`;
}

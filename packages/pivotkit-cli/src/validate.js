/*
 * pivotkit validate: a view checked by pivotkit-report's validate_view, against the data of --data,
 * else against the fields its view file lists (source.fields). Its errors are the exit code 1; a line
 * says what was checked when it is valid.
 */

import { CliError } from "pivotkit-node/files";
import { readData, withViewTypes } from "./data.js";
import { explained, withDataHint, withJsonPosition } from "./explain.js";
import { operationEnv, runOperation } from "./operation.js";
import { listedFields, readView, viewFields } from "./view.js";

/**
 * @param {string[]} positionals
 * @param {Record<string, any>} values
 * @param {any} ctx
 */
export async function validateCommand(positionals, values, ctx) {
    const view = await readView(positionals, values, ctx);
    const data = withViewTypes(await readData(values, ctx, view.sheet), viewFields(view.view));
    const fields = data ? null : listedFields(view);
    if (!data && fields === null) {
        throw new CliError("usage", "MISSING_DATA", "validate needs data: --data <file>, a view file that lists its fields (source.fields), or a server's source: --source <id> with --url or PIVOTKIT_URL");
    }
    const { result } = await runOperation("validate_view", { source: data?.name || "view file", view: view.view }, operationEnv(ctx, data, fields));
    const { findings: all, ...extra } = result;
    const notes = data?.notes ?? [];
    const fileFindings = all.filter((f) => !notes.includes(f) && f.code === "viewFile");
    const viewFindings = all.filter((f) => !notes.includes(f) && f.code !== "viewFile");
    if (fileFindings.some((f) => f.severity === "error")) {
        return { findings: withDataHint(withJsonPosition(fileFindings, view.view), view, "validate"), extra };
    }
    const findings = [...notes, ...fileFindings, ...explained(viewFindings, view.view, data)];
    return { findings, extra: { ...extra, sheet: data?.sheet ?? null }, note: result.valid ? validNote(viewFindings, data) : null };
}

/**
 * What was checked, said when the view is valid (an invalid view says so through its errors).
 * @param {any[]} viewFindings
 * @param {{ name: string } | null} data
 */
function validNote(viewFindings, data) {
    if (!data) {
        return "valid against the fields the view file lists (source.fields), not against data: give --data to check it with the data";
    }
    const warnings = viewFindings.filter((f) => f.severity === "warning").length;
    return `valid: no errors, ${warnings === 0 ? "no warnings" : `${warnings} warning${warnings === 1 ? "" : "s"}`} (with ${data.name})`;
}

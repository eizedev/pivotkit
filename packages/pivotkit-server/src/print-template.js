/*
 * A source's print template (sources.<id>.template): one reader for a request, the start and
 * check-config, so the three refuse the same file with the same words. The file is read the safe way
 * (no device, no symbolic-link swap, at most TEMPLATE_BYTES) and checked by pivotkit-report's
 * parseTemplate, which a render_view in html runs again on every request (the file may change).
 */

import { readSafe } from "pivotkit-cli/files";
import { parseTemplate } from "pivotkit-report/template";
import { pathOf } from "./config.js";

/** The largest template file read, in bytes (limits.template in messages). */
export const TEMPLATE_BYTES = 1_048_576;

/**
 * An operator's template file as text, read the safe way. Throws the reader's error (CliError or a
 * system error), which the caller words for its audience.
 * @param {string} path  the full path
 * @returns {Promise<string>}
 */
export async function readTemplateFile(path) {
    return new TextDecoder().decode(await readSafe(path, { cwd: "/", allow: [], maxBytes: TEMPLATE_BYTES, limit: "template" }));
}

/**
 * Why a source's template keeps the server from starting, or null: the reader's message (the file's
 * name, never its full path) or the parser's (`unknown placeholder {{titel}} (line 7); did you mean
 * {{title}}?`).
 * @param {import("./config.js").ServerOptions} options
 * @param {string} file  sources.<id>.template as configured
 * @returns {Promise<string | null>}
 */
export async function templateProblem(options, file) {
    let text;
    try {
        text = await readTemplateFile(pathOf(options, file));
    } catch (e) {
        const error = /** @type {any} */ (e);
        // a CliError names the file by its name only; a system error's own message holds the path
        return error?.name === "CliError" ? String(error.message) : `cannot be read (${error?.code === "EACCES" ? `permission denied for the user ${process.getuid?.() ?? ""} the server runs as` : (error?.code ?? "unreadable")})`;
    }
    try {
        parseTemplate(text);
        return null;
    } catch (e) {
        return String(/** @type {any} */ (e)?.message ?? e).replace(/^template: /, "");
    }
}

/**
 * The sources that have a template, in the configuration's order, with why each is refused (null: it
 * is fine).
 * @param {import("./config.js").ServerOptions} options
 * @returns {Promise<Array<{ id: string, file: string, problem: string | null }>>}
 */
export async function checkTemplates(options) {
    const out = [];
    for (const [id, source] of Object.entries(options.sources ?? {})) {
        if (typeof source?.template === "string") {
            out.push({ id, file: source.template, problem: await templateProblem(options, source.template) });
        }
    }
    return out;
}

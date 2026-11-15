/*
 * A source's print template (sources.<id>.template): one reader for a request, the start and
 * check-config, so the three refuse the same file with the same words. The file is read the safe way
 * (no device, no symbolic-link swap, at most TEMPLATE_BYTES) and checked by pivotkit-report's
 * parseTemplate, which a render_view in html runs again on every request (the file may change).
 */

import { basename } from "node:path";
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

/** The reader's codes of a template file that is not there or cannot be read now: said like a missing source file. */
const MISSING = new Set(["NOT_FOUND", "ENOENT", "EACCES", "EPERM", "ENOTDIR", "ELOOP"]);

/**
 * What is wrong with a source's template, if anything. `missing`: the file is not there or cannot be
 * read now (the start warns, as for a missing source file, and the source's html reports fail until
 * it can be read). `problem`: what keeps the server from starting: the parser's message (`unknown
 * placeholder {{titel}} (line 7); did you mean {{title}}?`), a file over the limit, not a regular
 * file. Both name the file by its name, never its full path.
 * @param {import("./config.js").ServerOptions} options
 * @param {string} file  sources.<id>.template as configured
 * @returns {Promise<{ missing: string | null, problem: string | null }>}
 */
export async function templateProblem(options, file) {
    let text;
    try {
        text = await readTemplateFile(pathOf(options, file));
    } catch (e) {
        const error = /** @type {any} */ (e);
        // a CliError names the file by its name only; a system error's own message holds the path
        const message = error?.name === "CliError" ? String(error.message) : `${basename(file)}: cannot be read (${error?.code === "EACCES" ? `permission denied for the user ${process.getuid?.() ?? ""} the server runs as` : (error?.code ?? "unreadable")})`;
        return MISSING.has(error?.code) ? { missing: message, problem: null } : { missing: null, problem: message };
    }
    try {
        parseTemplate(text);
        return { missing: null, problem: null };
    } catch (e) {
        return { missing: null, problem: String(/** @type {any} */ (e)?.message ?? e).replace(/^template: /, "") };
    }
}

/**
 * The sources that have a template, in the configuration's order, with what is wrong with each
 * (templateProblem; both null: it is fine).
 * @param {import("./config.js").ServerOptions} options
 * @returns {Promise<Array<{ id: string, file: string, missing: string | null, problem: string | null }>>}
 */
export async function checkTemplates(options) {
    const out = [];
    for (const [id, source] of Object.entries(options.sources ?? {})) {
        if (typeof source?.template === "string") {
            out.push({ id, file: source.template, ...(await templateProblem(options, source.template)) });
        }
    }
    return out;
}

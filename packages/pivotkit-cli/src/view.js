/*
 * The view of a command: read from --link, a file, stdin or JSON text, with the workbook sheet its
 * file names; --map applied to it; the fields its file lists; and whether a JSON text is a view at all.
 */

import { VIEW_FILE_FORMAT, VIEW_FILE_VERSION, fromViewFile, renameFields, viewFileFields } from "pivotkit-core";
import { readViewLink } from "pivotkit-core/link";
import { CliError, printable } from "pivotkit-node/files";
import { VIEW_BYTES, textOf } from "./inputs.js";
import { mapOf } from "./layout-view.js";

/**
 * A view read as a view file: its text, or a view read from a link (an object).
 * @param {unknown} view
 * @returns {ReturnType<typeof fromViewFile>}
 */
export const viewFileOf = (view) => fromViewFile(typeof view === "string" ? view : JSON.stringify(view));

/**
 * The view of a command: from --link, a file, stdin or JSON text.
 * @param {string[]} positionals
 * @param {Record<string, any>} values
 * @param {any} ctx
 * @returns {Promise<{ view: unknown, name: string, source: string, sheet: string | null, findings?: any[] }>}
 */
export async function readView(positionals, values, ctx) {
    if (values.link !== undefined) {
        return viewOfLink(positionals, values, ctx.limits);
    }
    const arg = positionals[0];
    if (arg === undefined) {
        throw new CliError("usage", "MISSING_VIEW", "a view is needed: a file, - for stdin, JSON text or --link");
    }
    if (arg.trimStart().startsWith("{")) {
        return { view: arg, name: "", source: "argument", sheet: sheetOf(arg, ctx.limits) };
    }
    let bytes;
    try {
        bytes = await ctx.readInput(arg, "the view", VIEW_BYTES, "json");
    } catch (e) {
        // a name that is no file: say what the argument is read as (a mistyped name, JSON text without its {)
        throw e instanceof CliError && e.code === "NOT_FOUND" ? new CliError(e.kind, e.code, `${e.message}: the view is a view file, - for stdin, JSON text or --link`) : e;
    }
    const text = textOf(bytes);
    return { view: text, name: "", source: arg, sheet: sheetOf(text, ctx.limits) };
}

/**
 * The view of --link: the link's view, its name and its workbook sheet (source.params.sheet, the one
 * parameter the CLI uses).
 * @param {string[]} positionals
 * @param {Record<string, any>} values
 * @param {object} limits  --limit's
 */
function viewOfLink(positionals, values, limits) {
    if (positionals[0] !== undefined) {
        throw new CliError("usage", "VIEW_AND_LINK", `give a view or --link, not both: "${positionals[0]}" would be left out`);
    }
    const url = String(values.link);
    const hash = url.includes("#") ? url.slice(url.indexOf("#")) : url;
    const read = readViewLink(hash, values.key ?? null, { limits, allowParams: ["sheet"] });
    if (!read.view) {
        throw new CliError("usage", "BAD_LINK", `--link: not a pivotkit link (${read.failed})`);
    }
    return { view: read.view, name: read.name, source: "link", sheet: read.src?.params?.sheet ?? null };
}

/**
 * The sheet of a workbook a view file names (source.params.sheet, written by pivotkit-react for a
 * loaded workbook's sheet), or null.
 * @param {string} text
 * @param {object} [limits]  --limit's (srcParams and srcParamLength)
 */
function sheetOf(text, limits) {
    const sheet = fromViewFile(text, { limits }).source?.params?.sheet;
    return typeof sheet === "string" && sheet ? sheet : null;
}

/**
 * The fields a view file lists with their types (source.fields), or none: a view as JSON or a link
 * lists none.
 * @param {unknown} view  the view's text, or a view read from a link
 * @returns {Array<{ name: string, type: string }>}
 */
export function viewFields(view) {
    const read = viewFileOf(view);
    return read.failed ? [] : (read.source?.fields ?? []);
}

/**
 * The fields a view file lists (source.fields), or null: a view's schema when there is no data.
 * @param {{ view: unknown }} view
 */
export function listedFields(view) {
    const read = viewFileOf(view.view);
    // a view that cannot be read has no fields, but its finding comes from the operation
    return read.failed ? [] : read.source?.fields?.length ? read.source.fields : null;
}

/**
 * --map on a view read from a file, a link or the argument: its fields renamed (renameFields), the
 * types its view file lists too; a name the view does not use is a warning (unusedMap).
 * @param {{ view: unknown, name: string, source: string, sheet: string | null }} view
 * @param {Record<string, any>} values
 */
export function withMap(view, values) {
    if (!values.map?.length) {
        return view;
    }
    const read = viewFileOf(view.view);
    if (read.failed || !read.view) {
        return view;
    }
    const listed = read.source?.fields ?? [];
    const map = /** @type {Record<string, string>} */ (mapOf(values.map, [...viewFileFields(read.view), ...listed.map((f) => f.name)]));
    let renamed;
    try {
        renamed = renameFields(read.view, map);
    } catch (e) {
        throw new CliError("usage", "BAD_VALUE", `--map: ${printable(String(e.message).replace(/^renameFields: /, ""))}`);
    }
    const lower = new Map(Object.entries(map).map(([from, to]) => [from.toLowerCase(), to]));
    const fields = listed.map((f) => ({ ...f, name: lower.get(f.name.toLowerCase()) ?? f.name }));
    const file = { format: VIEW_FILE_FORMAT, formatVersion: VIEW_FILE_VERSION, name: read.name, ...(read.description ? { description: read.description } : {}), source: { ...(read.source ?? {}), fields }, view: renamed.view };
    return { ...view, view: JSON.stringify(file), findings: mapFindings(map, renamed.unused, listed) };
}

/**
 * What --map did: a name the view does not use is a warning, unless the file lists it among its
 * fields (renamed there); each name used is an info finding.
 * @param {Record<string, string>} map
 * @param {string[]} unused  renameFields' names the view does not use
 * @param {Array<{ name: string }>} listed  the fields the view file lists
 */
function mapFindings(map, unused, listed) {
    const listedInFile = new Set(listed.map((f) => f.name.toLowerCase()));
    return [
        ...unused.filter((n) => !listedInFile.has(n.toLowerCase())).map((n) => ({ severity: "warning", code: "unusedMap", path: "", message: printable(`--map ${n}=...: the view uses no field ${JSON.stringify(n)}`) })),
        ...Object.entries(map)
            .filter(([from]) => !unused.includes(from))
            .map(([from, to]) => ({ severity: "info", code: "mapped", path: "", message: printable(`--map: the view's ${JSON.stringify(from)} is read as ${JSON.stringify(to)}`) }))
    ];
}

/** Whether a JSON text is a view: a view file, a template { name, view }, or an object with a view's keys. */
export function isView(text) {
    let doc;
    try {
        doc = JSON.parse(text);
    } catch {
        return false;
    }
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
        return false;
    }
    if (doc.format === VIEW_FILE_FORMAT || (typeof doc.name === "string" && doc.view && typeof doc.view === "object")) {
        return true;
    }
    const viewKeys = ["rows", "cols", "values", "filters", "derived", "display", "chart", "version"];
    return Object.keys(doc).length > 0 && Object.keys(doc).every((k) => viewKeys.includes(k) || ["sort", "totals", "collapsed", "formatting"].includes(k));
}

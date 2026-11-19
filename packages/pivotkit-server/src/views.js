/*
 * Named views (options/views.js): the views an operator publishes per source, by name. They are read
 * like print templates: from the configuration or from view files, on every request, the safe way (no
 * device, no symbolic-link swap, at most VIEW_BYTES). The start and check-config read them first and
 * refuse what is no view, so a broken file is found before a caller asks for it.
 *
 * A caller passes a name as `view` to render_view, create_link and draft_schedule. present.js puts the
 * view in its place before the operation runs (withNamedView), so the operation and the policy see a
 * view as any other. What a caller learns of a view follows its policy:
 *
 * - A view that uses a field hidden from the caller is not listed, and its name answers as a name
 *   that does not exist.
 * - A link or a draft carries the view itself. A view that holds values of a field the caller may not
 *   see listed (a filter's items, a custom sort order, collapsed groups) gets no link or draft.
 */

import { readdir } from "node:fs/promises";
import { basename } from "node:path";
import { VIEW_ISSUES, closest, fromViewFile, normalize, viewFileFields } from "pivotkit-core";
import { cleanText } from "pivotkit-core/import";
import { readSafe } from "pivotkit-cli/files";
import { OperationError, findingText } from "pivotkit-report/operations";
import { pathOf } from "./config.js";
import { levelOf } from "./policy.js";
import { MAX_VIEWS, VIEW_BYTES, VIEW_NAME } from "./options/views.js";

export { MAX_VIEWS, VIEW_BYTES, VIEW_NAME };

/** The operations that take a view by name. */
export const NAMED_VIEW_OPERATIONS = Object.freeze(new Set(["render_view", "create_link", "draft_schedule"]));

/** Of them, those whose answer carries the view itself: a link's fragment, a draft. */
const CARRIES_VIEW = new Set(["create_link", "draft_schedule"]);

/** The most characters of a view's description in a listing (as a field's description). */
const DESCRIPTION_TEXT = 500;

/** The levels at which a caller may see a field's values listed. */
const VALUES_SEEN = new Set(["show", "values"]);

/** Whether an input's `view` is a name rather than a view or its JSON text. */
export const isViewName = (value) => typeof value === "string" && VIEW_NAME.test(value);

/**
 * @typedef {object} NamedView
 * @property {string} name
 * @property {string} title  the view file's name, else the view's name
 * @property {string} description
 * @property {Record<string, unknown>} doc  what an operation gets as `view`: the file as written, a bare view with its title
 * @property {Record<string, any>} view  the view itself, not normalized
 * @property {string[]} needs  the data's fields it uses, as the view spells them (viewFileFields)
 * @property {string | null} file  the file as check-config names it; null for a view written in the configuration
 */

/**
 * @typedef {object} ViewProblem
 * @property {string} key  the option it is about: "views.<name>" or "viewsDir"
 * @property {string | null} name  the view's name, where the problem is one view's
 * @property {string} text  what is wrong, naming a file or folder as the configuration or the folder's listing spells it
 * @property {boolean} missing  the file or folder is not there or cannot be read now: the server starts
 */

/** The reader's codes of a file that is not there or cannot be read now, as for a print template. */
const MISSING = new Set(["NOT_FOUND", "ENOENT", "EACCES", "EPERM", "ENOTDIR", "ELOOP"]);

/** A file's name in the views folder without ".pivotkit.json" or ".json"; null for a file that is no view file. */
export function nameOfFile(file) {
    if (file.startsWith(".")) {
        return null;
    }
    const lower = file.toLowerCase();
    return lower.endsWith(".pivotkit.json") ? file.slice(0, -".pivotkit.json".length) : lower.endsWith(".json") ? file.slice(0, -".json".length) : null;
}

/**
 * A reader's error as a problem's words, naming the file as the configuration does (`shown`): a
 * CliError's reason after its file name; a system error by its code only (its message holds the full path).
 */
function readProblem(error, shown) {
    const e = /** @type {any} */ (error);
    const reason = e?.name === "CliError" ? String(e.message).replace(/^[^:]*: /, "") : `cannot be read (${e?.code ?? "unreadable"})`;
    return { text: `${findingText(shown)}: ${reason}`, missing: MISSING.has(e?.code) };
}

/**
 * A view as read (a view file's text, or a view written in the configuration) as a NamedView, or
 * what is wrong with it.
 * @param {string} name
 * @param {string | Record<string, unknown>} given
 * @param {string | null} file
 * @returns {{ view: NamedView } | { problem: string }}
 */
function namedOf(name, given, file) {
    const read = fromViewFile(given);
    if (read.failed || !read.view) {
        return { problem: `not a view (${read.issues.at(-1)?.message ?? read.failed})` };
    }
    // what the view's own shape refuses without the data: a list that is none, an unknown key or
    // aggregator; what depends on a field (its filter type) is checked against the data later
    const shape = shapeErrorOf(read.view);
    if (shape) {
        return { problem: `not a view (${shape})` };
    }
    const doc = typeof given === "string" ? JSON.parse(given) : given;
    const title = read.name || name;
    // a bare view takes its title along, so a link and a draft are named after it
    return { view: { name, title, description: read.description, doc: read.envelope || read.name ? doc : { name: title, view: read.view }, view: read.view, needs: viewFileFields(read.view), file } };
}

/**
 * The first error of a view that does not depend on the data (VIEW_ISSUES' schema errors), as
 * "<path>: <message>", or null. Field names are checked against the data later (check-config).
 * @param {Record<string, unknown>} view
 */
function shapeErrorOf(view) {
    let issues;
    try {
        issues = normalize(view, null).issues;
    } catch (e) {
        return String(/** @type {any} */ (e)?.message ?? e);
    }
    const error = issues.find((i) => i.severity === "error" && /** @type {any} */ (VIEW_ISSUES)[i.code]?.schema === true);
    return error ? findingText(`${error.path ? `${error.path}: ` : ""}${error.message}`) : null;
}

/** A view file's text, read the safe way. Throws the reader's error. */
async function readViewFile(path) {
    return new TextDecoder().decode(await readSafe(path, { cwd: "/", allow: [], maxBytes: VIEW_BYTES, limit: "view" }));
}

/**
 * The views a source publishes, in the configuration's order and then the folder's by file name, and
 * what is wrong with the others. Reads the files again on every call (they may change). With `only`,
 * it reads only the file of that name: a request for one view reads one file. The names, their limit
 * and their order come from the configuration and the folder's listing, never from what a file holds.
 * @param {import("./config.js").ServerOptions} options
 * @param {string} id  a configured source's id
 * @param {{ only?: string }} [how]
 * @returns {Promise<{ views: NamedView[], problems: ViewProblem[], names: string[] }>}  names: every view's name, read or not
 */
export async function viewsOf(options, id, how = {}) {
    const source = Object.hasOwn(options.sources ?? {}, id) ? /** @type {any} */ (options.sources)[id] : undefined;
    /** @type {Array<{ key: string, name: string, entry: string | Record<string, unknown>, shown: string | null }>} the views by name, before any is read */
    const named = Object.entries(source?.views ?? {}).map(([name, entry]) => ({ key: `views.${name}`, name, entry, shown: typeof entry === "string" ? entry : null }));
    /** @type {ViewProblem[]} */
    const problems = [];
    if (typeof source?.viewsDir === "string") {
        const folder = source.viewsDir.replace(/[\\/]+$/, "");
        /** @type {import("node:fs").Dirent[]} */
        let entries = [];
        try {
            entries = await readdir(pathOf(options, source.viewsDir), { withFileTypes: true });
        } catch (e) {
            const code = /** @type {any} */ (e)?.code;
            problems.push({ key: "viewsDir", name: null, text: `${findingText(folder)}: ${code === "ENOENT" ? "not found" : `cannot be read (${code ?? "unreadable"})`}`, missing: MISSING.has(code) });
        }
        const files = entries
            .filter((e) => (e.isFile() || e.isSymbolicLink()) && nameOfFile(e.name) !== null)
            .map((e) => e.name)
            .sort();
        const taken = new Set(named.map((v) => v.name));
        for (const [i, file] of files.entries()) {
            const name = /** @type {string} */ (nameOfFile(file));
            if (!VIEW_NAME.test(name)) {
                problems.push({ key: "viewsDir", name: null, text: `${findingText(file)}: its name is no view name: letters, digits, - and _ before .pivotkit.json or .json`, missing: false });
                continue;
            }
            if (taken.has(name)) {
                problems.push({ key: "viewsDir", name, text: `${file}: a view named ${name} is there already`, missing: false });
                continue;
            }
            if (named.length >= MAX_VIEWS) {
                // left out, as a file that cannot be read: the start goes on, check-config says so
                problems.push({ key: "viewsDir", name: null, text: `${files.length - i} more view files left out: at most ${MAX_VIEWS} views per source`, missing: true });
                break;
            }
            taken.add(name);
            named.push({ key: "viewsDir", name, entry: `${folder}/${file}`, shown: file });
        }
    }
    /** @type {NamedView[]} */
    const views = [];
    for (const { key, name, entry, shown } of named) {
        if (how.only !== undefined && name !== how.only) {
            continue;
        }
        try {
            const built = typeof entry === "string" ? namedOf(name, await readViewFile(pathOf(options, entry)), entry) : namedOf(name, entry, null);
            if ("problem" in built) {
                problems.push({ key, name, text: shown ? `${basename(shown)}: ${built.problem}` : built.problem, missing: false });
            } else {
                views.push(built.view);
            }
        } catch (e) {
            problems.push({ key, name, ...readProblem(e, /** @type {string} */ (shown)) });
        }
    }
    return { views, problems, names: named.map((v) => v.name) };
}

/**
 * Every source's views and problems, for the start and check-config: the sources that have views.
 * @param {import("./config.js").ServerOptions} options
 */
export async function checkViews(options) {
    const out = [];
    for (const [id, source] of Object.entries(options.sources ?? {})) {
        if (source?.views !== undefined || source?.viewsDir !== undefined) {
            out.push({ id, ...(await viewsOf(options, id)) });
        }
    }
    return out;
}

/** The problems already logged, per context: a broken file is said once, not on every call. */
const logged = new WeakMap();

/** The most lines warnOnce keeps per context; beyond them a problem is not logged again. */
const LOGGED_MAX = MAX_VIEWS * 10;

/**
 * Logs each problem of a source's views once per context: a file dropped in while the server runs
 * that is no view is left out, and the log says why.
 * @param {any} context
 * @param {string} id
 * @param {ViewProblem[]} problems
 */
function warnOnce(context, id, problems) {
    if (!context?.log || !problems.length) {
        return;
    }
    if (!logged.has(context)) {
        logged.set(context, new Set());
    }
    const seen = logged.get(context);
    for (const p of problems) {
        const line = `sources.${id}.${p.key}: ${p.text}`;
        if (!seen.has(line) && seen.size < LOGGED_MAX) {
            seen.add(line);
            context.log.warn(`${line}; ${p.name ? `the view ${p.name} is` : "its views are"} left out until it can be read (check-config says more)`, { source: id });
        }
    }
}

/** Whether a caller may know of a view: no field it uses is hidden from the caller. */
const knownUnder = (policy, view) => view.needs.every((f) => levelOf(policy, f) !== "hide");

/** An own list of a view, or none. */
const listOf = (obj, key) => (obj && typeof obj === "object" && Object.hasOwn(obj, key) && Array.isArray(obj[key]) ? obj[key] : []);

/**
 * The fields whose values a view holds: a filter's items or values, a custom sort order, the
 * collapsed groups, the chart's hidden series and its colours by series name (of the fields on rows
 * and columns). A grouping
 * counts as its source field.
 * @param {Record<string, any>} view
 * @returns {string[]}
 */
export function valueFields(view) {
    const derived = new Map(listOf(view, "derived").filter((d) => typeof d?.name === "string" && typeof d?.field === "string").map((d) => [d.name.toLowerCase(), d.field]));
    const fieldOf = (name) => derived.get(name.toLowerCase()) ?? name;
    const named = (list) => list.filter((n) => typeof n === "string").map(fieldOf);
    const out = [];
    for (const f of listOf(view, "filters")) {
        if (typeof f?.field === "string" && ["items", "value", "value2"].some((k) => Object.hasOwn(f, k))) {
            out.push(fieldOf(f.field));
        }
    }
    for (const s of listOf(view, "sort")) {
        if (typeof s?.field === "string" && listOf(s, "items").length) {
            out.push(fieldOf(s.field));
        }
    }
    const collapsed = view.collapsed && typeof view.collapsed === "object" ? view.collapsed : {};
    const rows = named(listOf(view, "rows"));
    const cols = named(listOf(view, "cols"));
    if (listOf(collapsed, "rows").length) {
        out.push(...rows);
    }
    if (listOf(collapsed, "cols").length) {
        out.push(...cols);
    }
    // a chart's hidden series and its colours by series name: items of the fields on rows and columns
    if (listOf(view.chart, "hidden").length || listOf(view.chart, "colors").some((c) => c && typeof c === "object")) {
        out.push(...rows, ...cols);
    }
    return [...new Set(out)];
}

/**
 * The views of a source a caller may know of, as list_sources and describe_source name them.
 * @param {any} context  createContext's
 * @param {string} id
 * @param {import("./policy.js").Policy} policy  the caller's for the source
 * @returns {Promise<Array<{ name: string, title: string, description?: string }>>}
 */
export async function viewListFor(context, id, policy) {
    const { views, problems } = await viewsOf(context.options, id);
    warnOnce(context, id, problems);
    return views
        .filter((v) => knownUnder(policy, v))
        .map((v) => {
            const description = cleanText(v.description).slice(0, DESCRIPTION_TEXT);
            return { name: v.name, title: findingText(v.title), ...(description ? { description } : {}) };
        });
}

/**
 * The view of a name for a caller: one the caller may know of (no field it uses is hidden), read
 * alone. INVALID_INPUT, with the nearest name the caller may know of, for any other name: one that
 * is not there and one the caller may not know of answer alike.
 * @param {any} context  createContext's
 * @param {string} id  a configured source's id
 * @param {string} name
 * @param {import("./policy.js").Policy} policy  the caller's for the source
 * @param {{ surface?: "mcp" | "rest" }} [how]
 * @returns {Promise<NamedView>}
 */
export async function findNamedView(context, id, name, policy, how = {}) {
    const { views, problems, names } = await viewsOf(context.options, id, { only: name });
    const found = views.find((v) => v.name === name && knownUnder(policy, v));
    if (found) {
        return found;
    }
    warnOnce(context, id, problems);
    // the nearest name, read alone: suggested only when the caller may know of it
    const nearest = closest(name, names.filter((n) => n !== name));
    const near = nearest && (await viewsOf(context.options, id, { only: nearest })).views.some((v) => knownUnder(policy, v)) ? nearest : null;
    throw new OperationError("INVALID_INPUT", `no view "${name}" for the source ${id}; ${near ? `did you mean "${near}"? ` : ""}${how.surface === "rest" ? "GET /sources" : "list_sources"} lists the views`);
}

/**
 * A `view` that is no name, as it is; INVALID_INPUT for a text that is no JSON of a view either: it
 * was meant as a name, so the error says what a name is.
 * @param {unknown} view
 * @param {{ surface?: "mcp" | "rest" }} [how]
 */
export function checkViewText(view, how = {}) {
    if (typeof view === "string" && !/^\s*[{["]/.test(view)) {
        throw new OperationError("INVALID_INPUT", `view is neither a view's JSON nor a view's name: a name has letters, digits, - and _, at most 80; ${how.surface === "rest" ? "GET /sources" : "list_sources"} lists the views`);
    }
    return view;
}

/**
 * An operation's input with a view's name replaced by the view, for the source the caller resolved,
 * and the view; the input as it is (and no view) when its `view` is no name.
 * @param {any} context  createContext's
 * @param {string} op
 * @param {Record<string, any>} input
 * @param {any} resolved  the registry's resolve of input.source
 * @param {{ surface?: "mcp" | "rest" }} [how]
 * @returns {Promise<{ input: Record<string, any>, named: NamedView | null }>}
 */
export async function withNamedView(context, op, input, resolved, how = {}) {
    if (!isViewName(input?.view)) {
        if (NAMED_VIEW_OPERATIONS.has(op)) {
            checkViewText(input?.view, how);
        }
        return { input, named: null };
    }
    if (!NAMED_VIEW_OPERATIONS.has(op)) {
        throw new OperationError("INVALID_INPUT", `${op} takes the view itself; a view by name works in render_view, create_link and draft_schedule`);
    }
    if (resolved?.spec?.kind !== "source") {
        throw new OperationError("INVALID_INPUT", "a view by name needs a source of the operator's; with a file or data sent along, give the view itself");
    }
    const named = await findNamedView(context, resolved.spec.id, input.view, resolved.policy, how);
    return { input: { ...input, view: named.doc }, named };
}

/**
 * NOT_ALLOWED where an answer would carry a named view (a link, a draft) that holds values of a
 * field the caller may not see listed. Runs after the operation, with the policy bound to the data's
 * statistics, so a field at "values" (also by the automatic rule) counts as listed.
 * @param {string} op
 * @param {NamedView | null} named
 * @param {import("./policy.js").Policy} policy  with statistics (withStats)
 */
export function checkCarriedView(op, named, policy) {
    if (named && CARRIES_VIEW.has(op) && valueFields(named.view).some((f) => !VALUES_SEEN.has(levelOf(policy, f)))) {
        const what = op === "create_link" ? "a link" : "a draft";
        throw new OperationError("NOT_ALLOWED", `the view ${named.name} holds values of a field whose values you may not see, and ${what} would carry them; render_view makes its report as a file`);
    }
}

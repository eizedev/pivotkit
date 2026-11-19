/*
 * check-config's section for the configured sources: per source where its data comes from, its
 * policy, each column's level and why (file sources: their columns and statistics are read once, never
 * to show a value), its scopes, link, print template and named views (read and checked as the start
 * does, print-template.js and views.js); warnings for a policy rule that names no
 * column. HTTP and code sources are described in their own sections; their fields are known only
 * after a load.
 *
 *   Sources (2):
 *     sales: a file
 *       /srv/pivotkit/data/sales.csv
 *       policy: summary by default; Customer hide
 *       field levels (automatic values off):
 *         Region: summary (the default)
 *         ...
 *     vms: an HTTP source, described under HTTP sources
 *       policy: hide by default; name show, cpu show
 *       fields: known only after a load (pivotkit-server check-source vms)
 *
 * What it reads is kept in runtime.columns (by id) and runtime.everyColumn for the later sections
 * (profiles), so no file is read twice. check/index.js says what a section returns.
 */

import { basename, extname } from "node:path";
import { closest, encode } from "pivotkit-core";
import { readSafe, readTable } from "pivotkit-cli/files";
import { findingText } from "pivotkit-report/operations";
import { serverLimitsOf } from "../config.js";
import { autoValuesOf, autoValuesOption, fieldKey, levelInfo, resolvePolicy, withStats } from "../policy.js";
import { sourceStats } from "../stats.js";
import { quotedBreakOf } from "../data.js";
import { allShown } from "../data.js";
import { checkTemplates } from "../print-template.js";
import { checkViews } from "../views.js";
import { HTTP_HEADING } from "./http.js";
import { heading, plain, problem, warning } from "./format.js";

/**
 * The warning for a policy that shows by default and hides fields by name: a deny list, where a
 * column the data gains later (a new one, a renamed one, a row longer than the header shifting a
 * hidden value) is shown without anyone deciding.
 * @param {string} path
 */
const denyListText = (path) => `${path}: "show" by default with hidden fields is a deny list: a column the data gains later is shown unless someone hides it; prefer "hide" by default and give the fields to show the level show`;

/** A column's name as check-config prints it: cleaned of control and direction characters, capped. */
export const nameText = (name) => findingText(name).slice(0, 80);

/** @type {import("./index.js").Section} */
export async function section(options, registry, runtime) {
    const items = [];
    const sources = await registry.check();
    const templates = new Map((await checkTemplates(options)).map((t) => [t.id, t]));
    const views = new Map((await checkViews(options)).map((v) => [v.id, v]));
    // every column of every source by its policy key, in the data's spelling; null: not all known
    /** @type {Map<string, string> | null} */
    let everyColumn = registry.allow.length ? null : new Map();
    // a rule's name as the configuration spells it, by its key: shown where no column has it; a
    // source's own rules over the server's, never another source's spelling
    const spelt = (...policies) => new Map(policies.flatMap((f) => Object.keys(f ?? {})).map((n) => [fieldKey(n), n]));
    items.push(heading(`Sources (${sources.length}):`));
    // a hint, not a warning: list_sources gives a model the description to choose a source by
    const undescribed = sources.filter((s) => !String(options.sources?.[s.id]?.description ?? "").trim()).map((s) => s.id);
    if (undescribed.length) {
        items.push(plain(`no description: ${undescribed.join(", ")} (a model chooses sources by it: sources.<id>.description)`));
    }
    // the exposure limits every source has unless its own policy says otherwise
    const server = resolvePolicy(options.policy);
    items.push(plain(`values listed per shown field: ${server.items} (policy.items)`), plain(server.inline ? `results inline in the tool answer: up to ${server.inline.cells} cells (policy.inline)` : "results inline in the tool answer: off (policy.inline)"));
    if (!sources.length && !registry.allow.length) {
        items.push(warning("no sources and no files by path: callers can use only data they send in a request; name a configuration file (--config or $PIVOTKIT_CONFIG) or a source (--source id=file)"));
    }
    for (const s of sources) {
        const written = options.sources?.[s.id] ?? {};
        const fields = Object.entries(s.policy.fields);
        const columns = s.file && s.exists ? await columnsOf(s.file, written.sheet, options) : { names: null, unnamed: [], longRows: 0, quotedBreak: 0, stats: null, why: null };
        const byKey = new Map((columns.names ?? []).map((c) => [fieldKey(c), c]));
        for (const [key, name] of byKey) {
            everyColumn?.set(key, name);
        }
        if (!columns.names) {
            everyColumn = null;
        }
        // a file's full path on a line of its own: never cut, and the lines around it keep their width
        items.push(...(s.file ? [plain(`${s.id}: a file`), plain(s.file, 2)] : [plain(`${s.id}: ${written.http ? `an HTTP source, described under ${HTTP_HEADING}` : "a code source, described under Code sources"}`)]));
        if (s.file && !s.exists) {
            items.push(problem(`sources.${s.id}.file: ${written.file} is not there`, { effect: `the server starts; ${s.id} answers FILE_NOT_AVAILABLE` }));
        }
        const configured = spelt(options.policy?.fields, written.policy?.fields);
        items.push(plain(`policy: ${s.policy.default} by default${fields.length ? `; ${fields.map(([k, l]) => `${byKey.get(k) ?? configured.get(k) ?? k} ${l}`).join(", ")}` : ""}`, 2));
        if (s.policy.default === "show" && fields.some(([, l]) => l === "hide")) {
            items.push(warning(denyListText(`sources.${s.id}.policy`)));
        }
        // the limits only where this source's policy changes the server's
        if (s.policy.items !== server.items) {
            items.push(plain(`values listed per shown field: ${s.policy.items}`, 2));
        }
        if (Boolean(s.policy.inline) !== Boolean(server.inline) || (s.policy.inline && server.inline && s.policy.inline.cells !== server.inline.cells)) {
            items.push(plain(s.policy.inline ? `results inline in the tool answer: up to ${s.policy.inline.cells} cells` : "results inline in the tool answer: off", 2));
        }
        if (s.scopes.length) items.push(plain(`scopes: ${s.scopes.join(" ")}`, 2));
        if (s.link) items.push(plain(`link: ${s.link}`, 2));
        // the print template, read and parsed as the start does: what the parser refuses stops the
        // start; a file that is not there is like a missing source file (its html reports fail)
        const template = templates.get(s.id);
        if (template) {
            items.push(plain(`template: ${template.file}`, 2));
            if (template.problem) {
                items.push(problem(`sources.${s.id}.template: ${template.problem}`, { stops: true }));
            } else if (template.missing) {
                items.push(problem(`sources.${s.id}.template: ${template.missing}`, { effect: `the server starts; html reports of ${s.id} fail until it can be read` }));
            }
        }
        // the named views, read as the start reads them: what is no view stops the start; a file or
        // folder that is not there leaves its views out
        const named = views.get(s.id);
        if (named) {
            items.push(plain(`views (${named.views.length}):`, 2));
            for (const v of named.views) {
                items.push(plain(`${v.name} (${v.file ?? "in the configuration"}): needs ${v.needs.map(nameText).join(", ") || "no field"}`, 3));
            }
            for (const p of named.problems) {
                items.push(problem(`sources.${s.id}.${p.key}: ${p.text}`, p.missing ? { effect: "the server starts; its views are left out until it can be read" } : { stops: true }));
            }
        }
        // rows longer than the header (data.js withoutLongRows): left out wherever a field is below show;
        // with the source's own policy all show, no caller of it loses them (profiles aside)
        const shownAll = allShown(s.policy);
        if (columns.longRows && !shownAll) {
            items.push(warning(`sources.${s.id}: ${columns.longRows} row${columns.longRows === 1 ? " has" : "s have"} more values than the header (a separator inside a value); ${columns.longRows === 1 ? "it is" : "they are"} left out for callers who do not see every field as show`));
        }
        // a quoted value over several lines (data.js checkedRead): the file is refused below show
        if (columns.quotedBreak && !shownAll) {
            items.push(warning(`sources.${s.id}: a quoted value that starts in line ${columns.quotedBreak} spans several lines; the source is refused for callers who do not see every field as show (an unclosed quote can pull the rows after it, hidden values too, into one cell)`));
        }
        // a value can move into another column only in text formats: the limit of the check above
        if (s.file && !shownAll && /\.(csv|tsv|txt)$/i.test(s.file)) {
            items.push(plain("a value kept back is safe in CSV only when values that hold the separator are quoted and no quoted value spans lines; xlsx or JSON is safer", 2));
        }
        if (columns.why) {
            items.push(warning(`sources.${s.id}: its columns could not be read to check the policy (${columns.why})`));
        }
        if (!s.file) {
            items.push(plain(`fields: known only after a load${written.http ? ` (pivotkit-server check-source ${s.id} loads it)` : ""}`, 2));
        }
        if (columns.names && columns.stats) {
            runtime.columns.set(s.id, columns);
            items.push(...fieldLevelItems(s.id, { ...s.resolved, unnamed: new Set(columns.unnamed.map(fieldKey)) }, columns.names, columns.stats, written.policy, options.policy));
        }
        if (columns.names) {
            for (const name of Object.keys(written.policy?.fields ?? {})) {
                if (!byKey.has(fieldKey(name))) {
                    const near = closest(name, columns.names);
                    items.push(warning(`sources.${s.id}.policy.fields.${name}: no column of ${basename(s.file ?? "")} has this name${near ? `; did you mean "${near}"?` : ""}`));
                }
            }
        }
    }
    // the server's rules and the profiles' hold for every source: a typo matches none of them
    if (everyColumn) {
        const rules = [["policy.fields", options.policy?.fields], ...Object.entries(options.policy?.profiles ?? {}).map(([p, profile]) => [`policy.profiles.${p}.fields`, profile.fields])];
        for (const [path, map] of /** @type {Array<[string, Record<string, string> | undefined]>} */ (rules)) {
            for (const name of Object.keys(map ?? {})) {
                if (!everyColumn.has(fieldKey(name))) {
                    const near = closest(name, [...everyColumn.values()]);
                    items.push(warning(`${path}.${name}: no column of any source has this name${near ? `; did you mean "${near}"?` : ""}`));
                }
            }
        }
    }
    runtime.everyColumn = everyColumn;
    if (registry.allow.length) {
        const filePolicy = resolvePolicy(options.policy, options.files?.policy);
        items.push(heading(`Files by path: allowed in ${registry.allow.join(", ")}`));
        if (options.files?.list) items.push(plain("listed by list_sources"));
        items.push(plain(`policy: ${filePolicy.default} by default`));
        if (filePolicy.default === "show" && [...filePolicy.fields.values()].includes("hide")) {
            items.push(warning(denyListText("files.policy")));
        }
        if (options.files?.hardLinks) items.push(plain("hard links: read"));
    } else {
        items.push(heading("Files by path: off"));
    }
    return { items, upgrade: [] };
}

/**
 * Each column's level and why, one line each (a warning where an explicit "values" field holds values
 * that look like personal or technical data); where the automatic rule is off but could apply (no
 * default written), the text fields it would put at "values" and how to switch it on.
 * @param {string} id
 * @param {import("../policy.js").Policy} resolved  the source's policy (no profile)
 * @param {string[]} names  the columns in the data's spelling
 * @param {import("../stats.js").SourceStats} stats
 * @param {any} sourcePolicy  options.sources[id].policy
 * @param {any} serverPolicy  options.policy
 * @returns {import("./format.js").Item[]}
 */
function fieldLevelItems(id, resolved, names, stats, sourcePolicy, serverPolicy) {
    const policy = withStats(resolved, stats);
    const looking = [];
    const levels = names.map((name) => {
        const info = levelInfo(policy, name);
        const looks = info.level === "values" && !info.auto ? (stats.fields[fieldKey(name)]?.looks ?? []) : [];
        if (looks.length) {
            looking.push(warning(`sources.${id}: the values field ${nameText(name)} holds a value that looks like ${looks.join(", ")}`));
        }
        return plain(`${nameText(name)}: ${info.level} (${info.why})`, 3);
    });
    if (policy.auto) {
        const count = names.filter((n) => levelInfo(policy, n).auto).length;
        return [plain(`field levels (automatic values on: ${count} field${count === 1 ? "" : "s"}; policy.autoValues false turns it off):`, 2), ...levels, ...looking];
    }
    if (!policy.implicitDefault) {
        return [plain("field levels (automatic values: not applied, a default is written):", 2), ...levels, ...looking];
    }
    // off by policy.autoValues: what it would give, to decide whether to switch it on
    const option = autoValuesOption(serverPolicy, sourcePolicy);
    const trial = withStats({ ...resolved, auto: autoValuesOf(option === false ? true : option) }, stats);
    const would = names.filter((n) => levelInfo(trial, n).auto).map((n) => `${nameText(n)} (${levelInfo(trial, n).why.replace(/^auto: /, "")})`);
    return [
        plain("field levels (automatic values off):", 2),
        ...levels,
        ...(would.length ? [plain(`automatic values would list: ${would.join(", ")}`, 2), plain("review them before you switch it on with policy.autoValues: true, or give a field the level values", 2)] : []),
        ...looking
    ];
}

/**
 * The column names of a source file as the server reads them and its statistics, or why they could
 * not be read. quotedBreak: the line of the first quoted value that spans lines (data.js checkedRead), or 0.
 * @returns {Promise<{ names: string[] | null, unnamed: string[], longRows: number, quotedBreak: number, stats: import("../stats.js").SourceStats | null, why: string | null }>}
 */
async function columnsOf(path, sheet, options) {
    const limits = serverLimitsOf(options);
    try {
        const bytes = await readSafe(path, { cwd: "/", allow: [], maxBytes: limits.fileBytes, hardLinks: true });
        const { table } = await readTable(bytes, basename(path), { ...(sheet ? { sheet } : {}), ...(options.timeZone ? { timeZone: options.timeZone } : {}), limits });
        // the statistics as the server counts them: encoded the same way (data.js)
        const stats = sourceStats(encode({ columns: table.columns, types: table.types, data: table.data }, { timeZone: options.timeZone ?? "UTC", limits }));
        return { names: table.columns, unnamed: table.unnamed ?? [], longRows: table.longRows?.length ?? 0, quotedBreak: quotedBreakOf(bytes, extname(path).slice(1).toLowerCase(), table), stats, why: null };
    } catch (e) {
        return { names: null, unnamed: [], longRows: 0, quotedBreak: 0, stats: null, why: String(e?.message ?? e).slice(0, 200) };
    }
}

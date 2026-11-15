/*
 * check-config's section for the configured sources: per source where its data comes from, its
 * policy, each column's level and why (file sources: their columns and statistics are read once, never
 * to show a value), its scopes, link and print template; warnings for a policy rule that names no
 * column. HTTP and code sources are described in their own sections; their fields are known only
 * after a load.
 *
 *   Sources (2):
 *     sales: /srv/pivotkit/data/sales.csv
 *       policy: summary by default; Customer hide
 *       field levels (automatic values off):
 *         Region: summary (the default)
 *         ...
 *     vms: an HTTP source (see HTTP sources)
 *       policy: hide by default; name show, cpu show
 *       fields: known only after a load (pivotkit-server check-source vms)
 *
 * What it reads is kept in runtime.columns (by id) and runtime.everyColumn for the later sections
 * (profiles), so no file is read twice. check/index.js says what a section returns.
 */

import { basename } from "node:path";
import { closest, encode } from "pivotkit-core";
import { readSafe, readTable } from "pivotkit-cli/files";
import { findingText } from "pivotkit-report/operations";
import { serverLimitsOf } from "../config.js";
import { POLICY_DEFAULTS, autoValuesOf, autoValuesOption, fieldKey, levelInfo, resolvePolicy, withStats } from "../policy.js";
import { sourceStats } from "../stats.js";
import { HTTP_HEADING } from "./http.js";
import { heading, plain, problem, warning } from "./format.js";

/** A column's name as check-config prints it: cleaned of control and direction characters, capped. */
export const nameText = (name) => findingText(name).slice(0, 80);

/** @type {import("./index.js").Section} */
export async function section(options, registry, runtime) {
    const items = [];
    const sources = await registry.check();
    // every column of every source by its policy key, in the data's spelling; null: not all known
    /** @type {Map<string, string> | null} */
    let everyColumn = registry.allow.length ? null : new Map();
    // a rule's name as the configuration spells it, by its key: shown where no column has it
    const configured = new Map([options.policy?.fields, ...Object.values(options.sources ?? {}).map((s) => s.policy?.fields)].flatMap((f) => Object.keys(f ?? {})).map((n) => [fieldKey(n), n]));
    items.push(heading(`Sources (${sources.length}):`));
    if (!sources.length && !registry.allow.length) {
        items.push(warning("no sources and no files by path: callers can use only data they send in a request; name a configuration file (--config or $PIVOTKIT_CONFIG) or a source (--source id=file)"));
    }
    for (const s of sources) {
        const written = options.sources?.[s.id] ?? {};
        const fields = Object.entries(s.policy.fields);
        const columns = s.file && s.exists ? await columnsOf(s.file, written.sheet, options) : { names: null, stats: null, why: null };
        const byKey = new Map((columns.names ?? []).map((c) => [fieldKey(c), c]));
        for (const [key, name] of byKey) {
            everyColumn?.set(key, name);
        }
        if (!columns.names) {
            everyColumn = null;
        }
        items.push(plain(`${s.id}: ${s.file ? s.file : written.http ? `an HTTP source (see ${HTTP_HEADING})` : "a code source"}`));
        if (s.file && !s.exists) {
            items.push(problem(`sources.${s.id}.file: ${s.file} is not there`, { effect: `the server starts; ${s.id} answers FILE_NOT_AVAILABLE` }));
        }
        items.push(plain(`policy: ${s.policy.default} by default${fields.length ? `; ${fields.map(([k, l]) => `${byKey.get(k) ?? configured.get(k) ?? k} ${l}`).join(", ")}` : ""}`, 2));
        if (s.policy.items !== POLICY_DEFAULTS.items) {
            items.push(plain(`values listed per shown field: ${s.policy.items}`, 2));
        }
        if (!s.policy.inline) {
            items.push(plain("results inline in the tool answer: off", 2));
        } else if (s.policy.inline.cells !== POLICY_DEFAULTS.inline.cells) {
            items.push(plain(`results inline in the tool answer: up to ${s.policy.inline.cells} cells`, 2));
        }
        if (s.scopes.length) items.push(plain(`scopes: ${s.scopes.join(" ")}`, 2));
        if (s.link) items.push(plain(`link: ${s.link}`, 2));
        if (columns.why) {
            items.push(warning(`sources.${s.id}: its columns could not be read to check the policy (${columns.why})`));
        }
        if (!s.file) {
            items.push(plain(`fields: known only after a load${written.http ? ` (pivotkit-server check-source ${s.id} loads it)` : ""}`, 2));
        }
        if (columns.names && columns.stats) {
            runtime.columns.set(s.id, columns);
            items.push(...fieldLevelItems(s.id, s.resolved, columns.names, columns.stats, written.policy, options.policy));
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
        if (options.files?.hardLinks) items.push(plain("hard links: read"));
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
 * not be read.
 * @returns {Promise<{ names: string[] | null, stats: import("../stats.js").SourceStats | null, why: string | null }>}
 */
async function columnsOf(path, sheet, options) {
    const limits = serverLimitsOf(options);
    try {
        const bytes = await readSafe(path, { cwd: "/", allow: [], maxBytes: limits.fileBytes, hardLinks: true });
        const { table } = await readTable(bytes, basename(path), { ...(sheet ? { sheet } : {}), ...(options.timeZone ? { timeZone: options.timeZone } : {}), limits });
        // the statistics as the server counts them: encoded the same way (data.js)
        const stats = sourceStats(encode({ columns: table.columns, types: table.types, data: table.data }, { timeZone: options.timeZone ?? "UTC", limits }));
        return { names: table.columns, stats, why: null };
    } catch (e) {
        return { names: null, stats: null, why: String(e?.message ?? e).slice(0, 200) };
    }
}

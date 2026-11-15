/*
 * --check-config: what the server would expose with these options, for the operator to read before a
 * client connects. Reads each source file once for its column names (a policy rule that names no
 * column is a typo) and its statistics (each field's level and why: the "values" level and the
 * automatic rule are decided by them), never to show a value.
 */

import { lstat, readFile, realpath } from "node:fs/promises";
import { basename } from "node:path";
import { closest, encode } from "pivotkit-core";
import { isInside, readSafe, readTable } from "pivotkit-cli/files";
import { HTTP_HEADING } from "./check/http.js";
import { OUTPUT_DEFAULTS, maxAgeDaysOf, pathOf, restResourceOf, serverLimitsOf, validateOptions } from "./config.js";
import { TOKEN_MIN, TOKEN_SYNTAX, TOKEN_SYNTAX_TEXT } from "./auth.js";
import { OUTPUT_INSIDE_ALLOWED, cannotCreate, entryOf, outputRefusal, ownFileDirs, plannedPath, writable } from "./context.js";
import { draftCap } from "./present.js";
import { isLoopback } from "./listen.js";
import { createRegistry } from "./registry.js";
import { findingText } from "pivotkit-report/operations";
import { autoValuesOf, autoValuesOption, fieldKey, levelInfo, resolvePolicy, withStats } from "./policy.js";
import { sourceStats } from "./stats.js";
import { SECTIONS, UPGRADING_URL, runSections } from "./check/index.js";
import { secretFileWarning } from "./secrets.js";
import { checkTemplates } from "./print-template.js";

/** How long reports and drafts stay, in words: the age limit, or why there is none. */
function ageText(options, shared) {
    if (shared) {
        // nothing there is deleted by age (a written limit is a problem below)
        return "no age limit: the directory holds other files";
    }
    const days = maxAgeDaysOf(options, shared);
    if (days > 0) {
        return `reports and drafts older than ${days} days are deleted${options.output?.maxAgeDays === undefined ? " (the default)" : ""}`;
    }
    return "no age limit (output.maxAgeDays 0)";
}

/**
 * What the server would expose with these options. The options are checked first as createContext
 * checks them (validateOptions): what it refuses throws the same ConfigError here.
 * @param {import("./config.js").ServerOptions} options
 * @param {{ http?: boolean, env?: Record<string, string | undefined>, name?: string, tokenEnv?: string, rest?: boolean, mcp?: boolean, sections?: ReadonlyArray<{ name: string, section: import("./check/index.js").Section }> }} [runtime]  http: an HTTP server is planned (default false); env: the environment tokens are read from; name: the name the first line starts with (default "pivotkit-mcp"); tokenEnv: the one static token's variable; rest: the REST service is served too; mcp: the MCP server is (default true); sections: the features' sections (default check/index.js SECTIONS; tests)
 * @returns {Promise<{ text: string, problems: number }>}  problems: what would keep the server from starting or a source from working
 */
export async function checkConfig(options, { http = false, env = {}, name = "pivotkit-mcp", tokenEnv = "PIVOTKIT_MCP_TOKEN", rest = false, mcp = true, sections = SECTIONS } = {}) {
    validateOptions(options);
    let problems = 0;
    let unwritable = 0;
    let other = 0;
    const registry = await createRegistry(options);
    const lines = [`${name}: the configuration is valid.`, ""];
    const sources = await registry.check();
    const templates = new Map((await checkTemplates(options)).map((t) => [t.id, t]));
    // every column of every source by its policy key, in the data's spelling; null: not all known
    /** @type {Map<string, string> | null} */
    let everyColumn = registry.allow.length ? null : new Map();
    // a rule's name as the configuration spells it, by its key: shown where no column has it
    const configured = new Map([options.policy?.fields, ...Object.values(options.sources ?? {}).map((s) => s.policy?.fields)].flatMap((f) => Object.keys(f ?? {})).map((n) => [fieldKey(n), n]));
    /** @type {Map<string, { names: string[], stats: any }>} the sources whose columns were read */
    const read = new Map();
    lines.push(`Sources (${sources.length}):`);
    for (const s of sources) {
        const fields = Object.entries(s.policy.fields);
        problems += s.exists ? 0 : 1;
        const columns = s.file && s.exists ? await columnsOf(s.file, options.sources?.[s.id]?.sheet, options) : { names: null, stats: null, why: null };
        const byKey = new Map((columns.names ?? []).map((c) => [fieldKey(c), c]));
        for (const [key, name] of byKey) {
            everyColumn?.set(key, name);
        }
        if (!columns.names) {
            everyColumn = null;
        }
        lines.push(`  ${s.id}: ${s.file ? `${s.file}${s.exists ? "" : "  (NOT FOUND)"}` : options.sources?.[s.id]?.http ? `an HTTP source (see ${HTTP_HEADING})` : "a code source"}`);
        lines.push(`    fields: ${s.policy.default} by default${fields.length ? `; ${fields.map(([k, l]) => `${byKey.get(k) ?? configured.get(k) ?? k} ${l}`).join(", ")}` : ""}; values listed per shown field: ${s.policy.items}; inline results: ${s.policy.inline ? `up to ${s.policy.inline.cells} cells` : "off"}`);
        if (s.scopes.length) lines.push(`    scopes: ${s.scopes.join(" ")}`);
        if (s.link) lines.push(`    link: ${s.link}`);
        // the print template, read and parsed as the start does: what it refuses, the start refuses
        const template = templates.get(s.id);
        if (template) {
            lines.push(`    template: ${template.file}`);
            if (template.problem) {
                other += 1;
                lines.push(`    PROBLEM: sources.${s.id}.template: ${template.problem}`);
            }
        }
        if (columns.why) {
            lines.push(`    warning: its columns could not be read to check the policy (${columns.why})`);
        }
        if (columns.names && columns.stats) {
            read.set(s.id, columns);
            lines.push(...fieldLevelLines(s.resolved, columns.names, columns.stats, options.sources?.[s.id]?.policy, options.policy));
        }
        if (columns.names) {
            for (const name of Object.keys(options.sources?.[s.id]?.policy?.fields ?? {})) {
                if (!byKey.has(fieldKey(name))) {
                    const near = closest(name, columns.names);
                    lines.push(`    warning: sources.${s.id}.policy.fields.${name}: no column of ${basename(s.file ?? "")} has this name${near ? `; did you mean "${near}"?` : ""}`);
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
                    lines.push(`  warning: ${path}.${name}: no column of any source has this name${near ? `; did you mean "${near}"?` : ""}`);
                }
            }
        }
    }
    const filePolicy = resolvePolicy(options.policy, options.files?.policy);
    lines.push("", registry.allow.length ? `Files by path: allowed in ${registry.allow.join(", ")}${options.files?.list ? " (listed)" : ""}; fields ${filePolicy.default} by default; hard links ${options.files?.hardLinks ? "read" : "refused"}` : "Files by path: off");
    const outputDir = options.output?.dir ? pathOf(options, options.output.dir) : null;
    // only ENOENT is missing: any other error (a name too long, a symbolic link loop) cannot be made
    const outputEntry = outputDir ? await entryOf(outputDir) : { info: null, code: null };
    const outputInfo = outputEntry.info;
    const outputFound = outputDir ? Boolean(outputInfo?.isDirectory()) : true;
    // a missing directory is made at start (output.create), when its nearest existing parent lets it be
    const dangling = Boolean(outputDir && !outputInfo && !outputEntry.code && (await entryOf(outputDir, lstat)).info);
    const notMade = outputDir && !outputInfo ? (outputEntry.code ?? (dangling ? "dangling" : options.output?.create === false ? "off" : await cannotCreate(outputDir))) : null;
    const outputState = outputFound ? "" : outputInfo ? "  (NOT FOUND: not a directory)" : notMade === "dangling" ? "  (NOT FOUND: a symbolic link to nothing)" : notMade === "off" ? "  (NOT FOUND: create the directory first, or leave output.create on)" : notMade ? `  (NOT FOUND: ${outputRefusal(notMade, options.output?.create !== false)})` : "  (does not exist yet: will be created at start; check the path)";
    const outputWritable = outputDir && outputFound ? await writable(outputDir) : true;
    problems += outputFound || (!outputInfo && !notMade) ? 0 : 1;
    unwritable += outputWritable ? 0 : 1;
    lines.push(`Output: ${options.output?.dir ?? "none (only inline csv/json where the policy allows)"}${outputState}${outputWritable ? "" : `  (NOT WRITABLE by the user ${process.getuid?.() ?? ""} the server runs as: every report would fail)`}${options.output?.baseUrl ? `, served at ${options.output.baseUrl}` : ""}`);
    // what the start refuses: the directory, or where it will be made, inside an allowed directory
    const outputWhere = outputDir ? (outputInfo ? await realpath(outputDir).catch(() => null) : notMade ? null : await plannedPath(outputDir)) : null;
    if (outputWhere && registry.allow.some((allowed) => isInside(outputWhere, allowed) || isInside(allowed, outputWhere))) {
        other += 1;
        lines.push(`  PROBLEM: output.dir ${OUTPUT_INSIDE_ALLOWED}`);
    }
    if (outputDir && outputFound) {
        const real = await realpath(outputDir).catch(() => outputDir);
        const shared = (await ownFileDirs(options)).includes(real);
        const maxFiles = options.output?.maxFiles ?? OUTPUT_DEFAULTS.maxFiles;
        lines.push(`  at most ${maxFiles} files of pivotkit's (of them ${draftCap(maxFiles)} schedule drafts) and ${options.output?.maxMb ?? OUTPUT_DEFAULTS.maxMb} MB; ${shared ? "it holds the configuration or a source, template or token file, so nothing there is deleted and a full directory refuses new reports" : "when full, the oldest reports are deleted to make room, drafts are kept"}; ${ageText(options, shared)}`);
        if (options.output?.maxAgeDays && shared) {
            other += 1;
            lines.push("  PROBLEM: output.maxAgeDays in a directory that holds the configuration or a source, template or token file: the server will not start; give the reports a directory of their own");
        }
    }
    const auth = options.auth ?? {};
    const mode = auth.mode ?? "none";
    lines.push(`HTTP${http ? "" : " (with --http)"}: ${options.http?.host ?? "127.0.0.1"}:${options.http?.port ?? 3333}; quick-start page ${options.http?.page === false ? "off" : "on"}`);
    lines.push(`Auth: ${mode}${mode === "none" && auth.allowUnauthenticated ? " (also off loopback)" : ""}`);
    if (http && mode === "none" && !auth.allowUnauthenticated && !isLoopback(options.http?.host ?? "127.0.0.1")) {
        other += 1;
        lines.push(`  PROBLEM: ${options.http?.host} is not loopback: the server will not start without auth token or oauth (or auth.allowUnauthenticated)`);
    }
    if (mode === "token") {
        for (const t of auth.tokens?.length ? auth.tokens : [{ name: "token", env: tokenEnv }]) {
            lines.push(`  token ${t.name} from ${t.env ? `$${t.env}` : t.file}: scopes ${t.scopes ? t.scopes.join(" ") || "none" : "all"}${t.profile ? `, profile ${t.profile}` : ""}`);
            const readable = await secretFileWarning(t, options, `the token ${t.name}'s file ${t.file}`);
            if (readable) {
                lines.push(`  ${readable}`);
            }
            if (http) {
                const why = await tokenProblem(t, env, options);
                if (why) {
                    other += 1;
                    lines.push(`  PROBLEM: the token ${t.name} ${why}`);
                }
            }
        }
    }
    if (mode === "oauth") {
        lines.push(`  issuer ${auth.issuer}, resource ${auth.resource}, audience ${(auth.audience ?? [auth.resource]).join(" ")}, required scopes ${(auth.requiredScopes ?? []).join(" ") || "none (any token for this audience)"}`);
        if (String(auth.issuer).startsWith("http:") && !auth.allowInsecureIssuer) {
            other += 1;
            lines.push("  PROBLEM: the issuer must be https:// (auth.allowInsecureIssuer is for tests only)");
        }
    }
    for (const [kind, map] of /** @type {Array<[string, Record<string, string> | undefined]>} */ ([["client", auth.clientProfiles], ["scope", auth.scopeProfiles]])) {
        for (const [key, profile] of Object.entries(map ?? {})) {
            lines.push(`  ${kind} ${key}: profile ${profile}`);
        }
    }
    for (const [profile, p] of Object.entries(options.policy?.profiles ?? {})) {
        const fields = Object.entries(p.fields ?? {});
        lines.push(`Profile ${profile}: fields ${p.default ?? "as each source"} by default${fields.length ? `; ${fields.map(([n, l]) => `${everyColumn?.get(fieldKey(n)) ?? n} ${l}`).join(", ")}` : ""}; a field a source hides stays hidden; no automatic values; file downloads (REST) ${p.results ? "allowed" : `off${p.data === true ? " (data sent in the request still works: data: true)" : ""}`}`);
        // what its callers get per source: a profile never has the automatic rule, so a field a
        // plain caller sees at values may be summary here
        for (const [id, columns] of read) {
            const policy = withStats(resolvePolicy(options.policy, options.sources?.[id]?.policy, p), columns.stats);
            lines.push(`  ${id}: ${columns.names.map((n) => `${nameText(n)} ${levelInfo(policy, n).level}`).join(", ")}`);
        }
    }
    if (rest) {
        const r = options.rest ?? {};
        lines.push(`REST: /api/v1${mode === "oauth" ? `, resource ${restResourceOf(options)}` : ""}; files by path refused; inline results ${r.inline ? "on" : "off"}; CORS ${r.cors?.origins?.length ? r.cors.origins.join(" ") : "off"}; /openapi.json ${r.openapi ?? "auth"}; file downloads ${options.policy?.results ? "allowed by default" : "only for profiles with results: true"}`);
    }
    if (auth.toolScopes) {
        lines.push(`  tool scopes: ${Object.entries(auth.toolScopes).map(([t, s]) => `${t} ${s.join(" ")}`).join("; ")}`);
    }
    // a token's scope that no source, tool or required list names is probably a typo
    const known = new Set([...(auth.requiredScopes ?? []), ...Object.values(auth.toolScopes ?? {}).flat(), ...Object.values(options.sources ?? {}).flatMap((s) => s.scopes ?? []), ...(options.files?.scopes ?? [])]);
    for (const t of auth.tokens ?? []) {
        for (const s of t.scopes ?? []) {
            if (!known.has(s)) {
                lines.push(`  warning: the token ${t.name}'s scope "${s}" is named by no source, tool or required scope`);
            }
        }
    }
    // each feature's section: its lines, its problems counted as PROBLEM lines, what changes for this
    // configuration in this version (the closing block)
    const features = await runSections(sections, options, registry, { http, env, name, tokenEnv, rest, mcp, columns: read });
    lines.push(...features.lines);
    other += features.problems;
    const total = problems + unwritable + other;
    if (total) {
        lines.push("", `${total} problem${total === 1 ? "" : "s"}: see ${[problems ? "NOT FOUND" : "", unwritable ? "NOT WRITABLE" : "", other ? "PROBLEM" : ""].filter(Boolean).join(" and ")} above.`);
    }
    if (features.upgrade.length) {
        lines.push("", `New in this version (what changes with this configuration; ${UPGRADING_URL}):`, ...features.upgrade.map((line) => `  - ${line}`));
    }
    lines[0] = other ? `${name}: the configuration is valid, but the server would not start with it as it is.` : problems ? `${name}: the configuration is valid, but not everything it names is there.` : unwritable ? `${name}: the configuration is valid, but the server could not write its reports.` : lines[0];
    return { text: `${lines.join("\n")}\n`, problems: total };
}

/** Why a static token would keep the server from starting, or null. */
async function tokenProblem(token, env, options) {
    if (token.env) {
        const value = env[token.env] ?? "";
        return value.length < TOKEN_MIN ? `($${token.env}) is not set or shorter than ${TOKEN_MIN} characters` : TOKEN_SYNTAX.test(value) ? null : `($${token.env}) ${TOKEN_SYNTAX_TEXT}`;
    }
    try {
        const value = (await readFile(pathOf(options, token.file), "utf8")).trim();
        return value.length < TOKEN_MIN ? `(${token.file}) is shorter than ${TOKEN_MIN} characters` : TOKEN_SYNTAX.test(value) ? null : `(${token.file}) ${TOKEN_SYNTAX_TEXT}`;
    } catch (e) {
        return `(${token.file}) cannot be read: ${e?.code === "ENOENT" ? "no such file" : e?.code === "EACCES" ? `permission denied for the user ${process.getuid?.() ?? ""} the server runs as` : "unreadable"}`;
    }
}

/**
 * Each column's level and why, one line each (a warning where an explicit "values" field holds values
 * that look like personal or technical data); where the automatic rule is off but could apply (no
 * default written), the text fields it would put at "values" and how to switch it on.
 * @param {import("./policy.js").Policy} resolved  the source's policy (no profile)
 * @param {string[]} names  the columns in the data's spelling
 * @param {import("./stats.js").SourceStats} stats
 * @param {any} sourcePolicy  options.sources[id].policy
 * @param {any} serverPolicy  options.policy
 */
function fieldLevelLines(resolved, names, stats, sourcePolicy, serverPolicy) {
    const policy = withStats(resolved, stats);
    const lines = names.map((name) => {
        const info = levelInfo(policy, name);
        const looks = info.level === "values" && !info.auto ? stats.fields[fieldKey(name)]?.looks ?? [] : [];
        return `      ${nameText(name)}: ${info.level} (${info.why})${looks.length ? `  warning: a value looks like ${looks.join(", ")}` : ""}`;
    });
    if (policy.auto) {
        const count = names.filter((n) => levelInfo(policy, n).auto).length;
        return [`    field levels (automatic values on: ${count} field${count === 1 ? "" : "s"}; policy.autoValues false turns it off):`, ...lines];
    }
    if (!policy.implicitDefault) {
        return ["    field levels (automatic values: not applied, a default is written):", ...lines];
    }
    // off by policy.autoValues: what it would give, to decide whether to switch it on
    const option = autoValuesOption(serverPolicy, sourcePolicy);
    const trial = withStats({ ...resolved, auto: autoValuesOf(option === false ? true : option) }, stats);
    const would = names.filter((n) => levelInfo(trial, n).auto).map((n) => `${nameText(n)} (${levelInfo(trial, n).why.replace(/^auto: /, "")})`);
    return [
        "    field levels (automatic values off):",
        ...lines,
        would.length ? `    automatic values would list: ${would.join(", ")}; review them before you switch it on with policy.autoValues: true, or give a field the level values` : "    automatic values would list no field of this source"
    ];
}

/** A column's name as check-config prints it: cleaned of control and direction characters, capped. */
const nameText = (name) => findingText(name).slice(0, 80);

/**
 * The column names of a source file as the server reads them and its statistics, or why they could
 * not be read.
 * @returns {Promise<{ names: string[] | null, stats: import("./stats.js").SourceStats | null, why: string | null }>}
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

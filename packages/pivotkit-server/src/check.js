/*
 * --check-config: what the server would expose with these options, for the operator to read before a
 * client connects. Reads each source file once for its column names (a policy rule that names no
 * column is a typo), never to show a value.
 */

import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { basename } from "node:path";
import { closest } from "pivotkit-core";
import { isInside, readSafe, readTable } from "pivotkit-cli/files";
import { OUTPUT_DEFAULTS, SERVER_LIMITS, pathOf, restResourceOf } from "./config.js";
import { TOKEN_MIN, TOKEN_SYNTAX, TOKEN_SYNTAX_TEXT } from "./auth.js";
import { OUTPUT_INSIDE_ALLOWED, cannotCreate, ownFileDirs, plannedPath, whyNot, writable } from "./context.js";
import { draftCap } from "./present.js";
import { isLoopback } from "./listen.js";
import { createRegistry } from "./registry.js";
import { fieldKey, resolvePolicy } from "./policy.js";

/**
 * @param {import("./config.js").ServerOptions} options
 * @param {{ http: boolean, env?: Record<string, string | undefined>, name?: string, tokenEnv?: string, rest?: boolean }} runtime  name: the runner's; rest: the REST service is served too
 * @returns {Promise<{ text: string, problems: number }>}  problems: what would keep the server from starting or a source from working
 */
export async function checkConfig(options, { http, env = {}, name = "pivotkit-mcp", tokenEnv = "PIVOTKIT_MCP_TOKEN", rest = false }) {
    let problems = 0;
    let unwritable = 0;
    let other = 0;
    const registry = await createRegistry(options);
    const lines = [`${name}: the configuration is valid.`, ""];
    const sources = await registry.check();
    // every column of every source by its policy key, in the data's spelling; null: not all known
    /** @type {Map<string, string> | null} */
    let everyColumn = registry.allow.length ? null : new Map();
    // a rule's name as the configuration spells it, by its key: shown where no column has it
    const configured = new Map([options.policy?.fields, ...Object.values(options.sources ?? {}).map((s) => s.policy?.fields)].flatMap((f) => Object.keys(f ?? {})).map((n) => [fieldKey(n), n]));
    lines.push(`Sources (${sources.length}):`);
    for (const s of sources) {
        const fields = Object.entries(s.policy.fields);
        problems += s.exists ? 0 : 1;
        const columns = s.file && s.exists ? await columnsOf(s.file, options.sources?.[s.id]?.sheet, options) : { names: null, why: null };
        const byKey = new Map((columns.names ?? []).map((c) => [fieldKey(c), c]));
        for (const [key, name] of byKey) {
            everyColumn?.set(key, name);
        }
        if (!columns.names) {
            everyColumn = null;
        }
        lines.push(`  ${s.id}: ${s.file ? `${s.file}${s.exists ? "" : "  (NOT FOUND)"}` : "a code source"}`);
        lines.push(`    fields: ${s.policy.default} by default${fields.length ? `; ${fields.map(([k, l]) => `${byKey.get(k) ?? configured.get(k) ?? k} ${l}`).join(", ")}` : ""}; values listed per shown field: ${s.policy.items}; inline results: ${s.policy.inline ? `up to ${s.policy.inline.cells} cells` : "off"}`);
        if (s.scopes.length) lines.push(`    scopes: ${s.scopes.join(" ")}`);
        if (s.link) lines.push(`    link: ${s.link}`);
        if (columns.why) {
            lines.push(`    warning: its columns could not be read to check the policy (${columns.why})`);
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
    const outputInfo = outputDir ? await stat(outputDir).catch(() => null) : null;
    const outputFound = outputDir ? Boolean(outputInfo?.isDirectory()) : true;
    // a missing directory is made at start (output.create), when its nearest existing parent lets it be
    const dangling = Boolean(outputDir && !outputInfo && (await lstat(outputDir).catch(() => null)));
    const notMade = outputDir && !outputInfo ? (dangling ? "dangling" : options.output?.create === false ? "off" : await cannotCreate(outputDir)) : null;
    const outputState = outputFound ? "" : outputInfo ? "  (NOT FOUND: not a directory)" : notMade === "dangling" ? "  (NOT FOUND: a symbolic link to nothing)" : notMade === "off" ? "  (NOT FOUND: create the directory first, or leave output.create on)" : notMade ? `  (NOT FOUND: cannot be created: ${whyNot(notMade)})` : "  (does not exist yet: will be created at start; check the path)";
    const outputWritable = outputDir && outputFound ? await writable(outputDir) : true;
    problems += outputFound || (!outputInfo && !notMade) ? 0 : 1;
    unwritable += outputWritable ? 0 : 1;
    lines.push(`Output: ${options.output?.dir ?? "none (only inline csv/json where the policy allows)"}${outputState}${outputWritable ? "" : `  (NOT WRITABLE by the user ${process.getuid?.() ?? ""} the server runs as: every report would fail)`}${options.output?.baseUrl ? `, served at ${options.output.baseUrl}` : ""}`);
    // what the start refuses: the directory, or where it will be made, inside an allowed directory
    const outputWhere = outputDir ? (outputInfo ? await realpath(outputDir).catch(() => null) : notMade ? null : await plannedPath(outputDir)) : null;
    if (outputWhere && registry.allow.some((allowed) => isInside(outputWhere, allowed) || isInside(allowed, outputWhere))) {
        other += 1;
        lines.push(`  PROBLEM: ${OUTPUT_INSIDE_ALLOWED.replace(/^output\.dir: /, "output.dir ")}`);
    }
    if (outputDir && outputFound) {
        const real = await realpath(outputDir).catch(() => outputDir);
        const shared = (await ownFileDirs(options)).includes(real);
        const maxFiles = options.output?.maxFiles ?? OUTPUT_DEFAULTS.maxFiles;
        lines.push(`  at most ${maxFiles} files of pivotkit's (of them ${draftCap(maxFiles)} schedule drafts) and ${options.output?.maxMb ?? OUTPUT_DEFAULTS.maxMb} MB; ${shared ? "it holds the configuration or a source, template or token file, so nothing there is deleted and a full directory refuses new reports" : "when full, the oldest reports are deleted to make room, drafts are kept"}${options.output?.maxAgeDays && !shared ? `; reports and drafts older than ${options.output.maxAgeDays} days are deleted` : ""}`);
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
        lines.push(`Profile ${profile}: fields ${p.default ?? "as each source"} by default${fields.length ? `; ${fields.map(([n, l]) => `${everyColumn?.get(fieldKey(n)) ?? n} ${l}`).join(", ")}` : ""}; a field a source hides stays hidden; file downloads (REST) ${p.results ? "allowed" : "off"}`);
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
    const total = problems + unwritable + other;
    if (total) {
        lines.push("", `${total} problem${total === 1 ? "" : "s"}: see ${[problems ? "NOT FOUND" : "", unwritable ? "NOT WRITABLE" : "", other ? "PROBLEM" : ""].filter(Boolean).join(" and ")} above.`);
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
 * The column names of a source file as the server reads them, or why they could not be read.
 * @returns {Promise<{ names: string[] | null, why: string | null }>}
 */
async function columnsOf(path, sheet, options) {
    const limits = { ...SERVER_LIMITS, ...(options.limits ?? {}) };
    try {
        const bytes = await readSafe(path, { cwd: "/", allow: [], maxBytes: limits.fileBytes, hardLinks: true });
        const { table } = await readTable(bytes, basename(path), { ...(sheet ? { sheet } : {}), ...(options.timeZone ? { timeZone: options.timeZone } : {}), limits });
        return { names: table.columns, why: null };
    } catch (e) {
        return { names: null, why: String(e?.message ?? e).slice(0, 200) };
    }
}

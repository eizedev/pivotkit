/*
 * --check-config: what the server would expose with these options, for the operator to read before a
 * client connects. Reads no data file, only whether each exists.
 */

import { stat } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { pathOf, restResourceOf } from "./config.js";
import { TOKEN_MIN } from "./auth.js";
import { isLoopback } from "./listen.js";
import { createRegistry } from "./registry.js";
import { resolvePolicy } from "./policy.js";

/**
 * @param {import("./config.js").ServerOptions} options
 * @param {{ http: boolean, env?: Record<string, string | undefined>, name?: string, tokenEnv?: string, rest?: boolean }} runtime  name: the runner's; rest: the REST service is served too
 * @returns {Promise<{ text: string, problems: number }>}  problems: what would keep the server from starting or a source from working
 */
export async function checkConfig(options, { http, env = {}, name = "pivotkit-mcp", tokenEnv = "PIVOTKIT_MCP_TOKEN", rest = false }) {
    let problems = 0;
    let other = 0;
    const registry = await createRegistry(options);
    const lines = [`${name}: the configuration is valid.`, ""];
    const sources = await registry.check();
    lines.push(`Sources (${sources.length}):`);
    for (const s of sources) {
        const fields = Object.entries(s.policy.fields);
        problems += s.exists ? 0 : 1;
        lines.push(`  ${s.id}: ${s.file ? `${s.file}${s.exists ? "" : "  (NOT FOUND)"}` : "a code source"}`);
        lines.push(`    fields: ${s.policy.default} by default${fields.length ? `; ${fields.map(([n, l]) => `${n} ${l}`).join(", ")}` : ""}; values listed per shown field: ${s.policy.items}; inline results: ${s.policy.inline ? `up to ${s.policy.inline.cells} cells` : "off"}`);
        if (s.scopes.length) lines.push(`    scopes: ${s.scopes.join(" ")}`);
        if (s.link) lines.push(`    link: ${s.link}`);
    }
    const filePolicy = resolvePolicy(options.policy, options.files?.policy);
    lines.push("", registry.allow.length ? `Files by path: allowed in ${registry.allow.join(", ")}${options.files?.list ? " (listed)" : ""}; fields ${filePolicy.default} by default; hard links ${options.files?.hardLinks ? "read" : "refused"}` : "Files by path: off");
    const outputOk = options.output?.dir ? await stat(pathOf(options, options.output.dir)).then((i) => i.isDirectory()).catch(() => false) : true;
    problems += outputOk ? 0 : 1;
    lines.push(`Output: ${options.output?.dir ?? "none (only inline csv/json where the policy allows)"}${outputOk ? "" : "  (NOT FOUND: create the directory first)"}${options.output?.baseUrl ? `, served at ${options.output.baseUrl}` : ""}`);
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
        lines.push(`Profile ${profile}: fields ${p.default ?? "as each source"} by default${fields.length ? `; ${fields.map(([n, l]) => `${n} ${l}`).join(", ")}` : ""}; a field a source hides stays hidden; file downloads (REST) ${p.results ? "allowed" : "off"}`);
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
    const total = problems + other;
    if (total) {
        lines.push("", `${total} problem${total === 1 ? "" : "s"}: see ${[problems ? "NOT FOUND" : "", other ? "PROBLEM" : ""].filter(Boolean).join(" and ")} above.`);
    }
    lines[0] = other ? `${name}: the configuration is valid, but the server would not start with it as it is.` : problems ? `${name}: the configuration is valid, but not everything it names is there.` : lines[0];
    return { text: `${lines.join("\n")}\n`, problems: total };
}

/** Why a static token would keep the server from starting, or null. */
async function tokenProblem(token, env, options) {
    if (token.env) {
        return (env[token.env] ?? "").length >= TOKEN_MIN ? null : `($${token.env}) is not set or shorter than ${TOKEN_MIN} characters`;
    }
    try {
        return (await readFile(pathOf(options, token.file), "utf8")).trim().length >= TOKEN_MIN ? null : `(${token.file}) is shorter than ${TOKEN_MIN} characters`;
    } catch (e) {
        return `(${token.file}) cannot be read: ${e?.code === "ENOENT" ? "no such file" : e?.code === "EACCES" ? `permission denied for the user ${process.getuid?.() ?? ""} the server runs as` : "unreadable"}`;
    }
}

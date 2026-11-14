/*
 * --check-config: what the server would expose with these options, for the operator to read before a
 * client connects. Reads no data file, only whether each exists.
 */

import { stat } from "node:fs/promises";
import { pathOf } from "./config.js";
import { createRegistry } from "./registry.js";
import { resolvePolicy } from "./policy.js";

/**
 * @param {import("./config.js").McpOptions} options
 * @param {{ http: boolean, env: Record<string, string | undefined> }} runtime
 * @returns {Promise<{ text: string, problems: number }>}  problems: what would keep the server from starting or a source from working
 */
export async function checkConfig(options, { http }) {
    let problems = 0;
    const registry = await createRegistry(options);
    const lines = ["pivotkit-mcp: the configuration is valid.", ""];
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
    if (mode === "token") {
        for (const t of auth.tokens?.length ? auth.tokens : [{ name: "token", env: "PIVOTKIT_MCP_TOKEN" }]) {
            lines.push(`  token ${t.name} from ${t.env ? `$${t.env}` : t.file}: scopes ${t.scopes ? t.scopes.join(" ") || "none" : "all"}`);
        }
    }
    if (mode === "oauth") {
        lines.push(`  issuer ${auth.issuer}, resource ${auth.resource}, audience ${(auth.audience ?? [auth.resource]).join(" ")}, required scopes ${(auth.requiredScopes ?? []).join(" ") || "none (any token for this audience)"}`);
        if (String(auth.issuer).startsWith("http:") && !auth.allowInsecureIssuer) {
            problems += 1;
            lines.push("  PROBLEM: the issuer must be https:// (auth.allowInsecureIssuer is for tests only)");
        }
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
    if (problems) {
        lines.push("", `${problems} problem${problems === 1 ? "" : "s"}: see NOT FOUND above.`);
    }
    lines[0] = problems ? "pivotkit-mcp: the configuration is valid, but not everything it names is there." : lines[0];
    return { text: `${lines.join("\n")}\n`, problems };
}

/*
 * --check-config: what the server would expose with these options, for the operator to read before a
 * client connects. Reads no data file, only whether each exists.
 */

import { createRegistry } from "./registry.js";
import { resolvePolicy } from "./policy.js";

/**
 * @param {import("./config.js").McpOptions} options
 * @param {{ http: boolean, env: Record<string, string | undefined> }} runtime
 */
export async function checkConfig(options, { http }) {
    const registry = await createRegistry(options);
    const lines = ["pivotkit-mcp: the configuration is valid.", ""];
    const sources = await registry.check();
    lines.push(`Sources (${sources.length}):`);
    for (const s of sources) {
        const fields = Object.entries(s.policy.fields);
        lines.push(`  ${s.id}: ${s.file ? `${s.file}${s.exists ? "" : "  (NOT FOUND)"}` : "a code source"}`);
        lines.push(`    fields: ${s.policy.default} by default${fields.length ? `; ${fields.map(([n, l]) => `${n} ${l}`).join(", ")}` : ""}; values listed per shown field: ${s.policy.items}; inline results: ${s.policy.inline ? `up to ${s.policy.inline.cells} cells` : "off"}`);
        if (s.scopes.length) lines.push(`    scopes: ${s.scopes.join(" ")}`);
        if (s.link) lines.push(`    link: ${s.link}`);
    }
    const filePolicy = resolvePolicy(options.policy, options.files?.policy);
    lines.push("", registry.allow.length ? `Files by path: allowed in ${registry.allow.join(", ")}${options.files?.list ? " (listed)" : ""}; fields ${filePolicy.default} by default; hard links ${options.files?.hardLinks ? "read" : "refused"}` : "Files by path: off");
    lines.push(`Output: ${options.output?.dir ?? "none (only inline csv/json where the policy allows)"}${options.output?.baseUrl ? `, served at ${options.output.baseUrl}` : ""}`);
    if (http) {
        const auth = options.auth ?? {};
        lines.push(`HTTP: ${options.http?.host ?? "127.0.0.1"}:${options.http?.port ?? 3333}, auth ${auth.mode ?? "none"}${auth.mode === "oauth" ? ` (issuer ${auth.issuer}, resource ${auth.resource}, required scopes ${(auth.requiredScopes ?? []).join(" ") || "none"})` : ""}; quick-start page ${options.http?.page === false ? "off" : "on"}`);
    }
    return `${lines.join("\n")}\n`;
}

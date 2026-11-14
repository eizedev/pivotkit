/*
 * The quick-start page at / of the HTTP transport: what this server is, its endpoint, the client
 * configurations to copy, the auth mode, and (when the operator allows) the sources' ids and titles.
 * No script, no external resource, every value escaped; it is served without authentication, so it
 * holds nothing the operator has not chosen to show.
 */

import { OPERATIONS } from "pivotkit-report/operations";

/** Text as HTML. */
const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** A block of code to copy. */
const code = (text) => `<pre><code>${esc(text)}</code></pre>`;

/**
 * @param {{ endpoint: string, version: string, auth: string, issuer: string | null, sources: Array<{ id: string, title: string }> | null }} info
 */
export function quickStartPage({ endpoint, version, auth, issuer, sources }) {
    const header = auth === "token" ? { Authorization: "Bearer <token>" } : null;
    const generic = { mcpServers: { pivotkit: { type: "http", url: endpoint, ...(header ? { headers: header } : {}) } } };
    const vscode = { servers: { pivotkit: { type: "http", url: endpoint, ...(header ? { headers: header } : {}) } } };
    const claudeCode = `claude mcp add --transport http pivotkit ${endpoint}${header ? ' --header "Authorization: Bearer <token>"' : ""}`;
    const authText =
        auth === "oauth"
            ? `OAuth: your client signs you in at ${esc(issuer ?? "the authorization server")} when it first connects.`
            : auth === "token"
              ? "A token: ask the operator for yours and put it where the examples say &lt;token&gt;."
              : "No sign-in: this server is meant for this computer or a network the operator trusts.";
    const tools = Object.values(OPERATIONS)
        .map((op) => `<li><code>${esc(op.name)}</code>: ${esc(op.title)}</li>`)
        .join("");
    const list = sources?.length ? `<h2>Sources</h2><ul>${sources.map((s) => `<li><code>${esc(s.id)}</code>${s.title !== s.id ? `: ${esc(s.title)}` : ""}</li>`).join("")}</ul>` : "";
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>pivotkit MCP server</title>
<style>
:root { color-scheme: light dark; --bg: #ffffff; --fg: #1f2328; --muted: #59636e; --box: #f6f8fa; --line: #d1d9e0; }
@media (prefers-color-scheme: dark) { :root { --bg: #0d1117; --fg: #e6edf3; --muted: #9198a1; --box: #161b22; --line: #3d444d; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, sans-serif; }
main { max-width: 46rem; margin: 0 auto; padding: 2rem 1rem; }
h1 { font-size: 1.5rem; margin: 0 0 .25rem; } h2 { font-size: 1.1rem; margin-top: 2rem; }
p.muted { color: var(--muted); margin-top: 0; }
pre { background: var(--box); border: 1px solid var(--line); border-radius: 6px; padding: .75rem; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
code { font: 14px/1.4 ui-monospace, monospace; }
a { color: inherit; }
</style></head>
<body><main>
<h1>pivotkit MCP server</h1>
<p class="muted">Version ${esc(version)}. An MCP server for pivot reports: an AI client describes data sources, writes and checks report views and has reports made into files or links, without reading the data itself.</p>
<h2>Endpoint</h2>${code(endpoint)}
<p>${authText}</p>
<h2>Claude Code</h2>${code(claudeCode)}
<h2>VS Code (.vscode/mcp.json)</h2>${code(JSON.stringify(vscode, null, 2))}
<h2>Other clients</h2>
<p>Clients that take an MCP server as JSON (Claude Desktop and others: see your client's documentation for where):</p>${code(JSON.stringify(generic, null, 2))}
<h2>Tools</h2><ul>${tools}</ul>
${list}
<h2>Documentation</h2>
<p><a href="https://pivotkit.eize.dev/getting-started/mcp/">Getting started</a> · <a href="https://pivotkit.eize.dev/reference/mcp/">Reference</a> · <a href="https://pivotkit.eize.dev/security/">Security</a></p>
</main></body></html>
`;
}

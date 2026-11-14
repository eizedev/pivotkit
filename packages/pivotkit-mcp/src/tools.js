/*
 * The MCP tools: one per operation of pivotkit-report's table, registered on an McpServer with the
 * table's words and the schemas pivotkit-server presents (presentedInput, presentedOutput). The work
 * after the operation (policy, output files, inline results, the short text) is pivotkit-server's
 * present(), which the REST service shares; what is MCP's here: the descriptions a model reads, the
 * annotations, the scope challenge and the tool result's shape.
 */

import { fromJsonSchema } from "@modelcontextprotocol/server";
import { OPERATIONS, OperationError } from "pivotkit-report/operations";
import { present, presentedInput, presentedOutput } from "pivotkit-server";

/** The tool's description: the operation's, plus what the model must know about this server. */
function descriptionOf(name) {
    const base = OPERATIONS[name].description;
    if (name === "describe_source") {
        return `${base} Each field has a level: show (values may be listed), summary (name, type and counts only), and fields the operator hides are not listed at all.`;
    }
    if (name === "render_view") {
        return `${base} Only csv and json can come back inline (when every field the view uses is shown and the result is small); xlsx, html and svg are files for the user. When the result says withheld, you have not seen the numbers: do not state any. Give the user the result's message.`;
    }
    return base;
}

/** The annotations of a tool from the table's. */
const annotationsOf = (op) => ({ title: op.title, readOnlyHint: op.annotations.readOnly, destructiveHint: false, idempotentHint: op.annotations.idempotent, openWorldHint: false });

/** A tool error as the model gets it: its code and message. */
const errorResult = (code, message) => ({ isError: true, content: [{ type: "text", text: `${code}: ${message}` }] });

/** A tool's result: a short text without data, the JSON, and the structured content. */
const okResult = (summary, structured) => ({ content: [{ type: "text", text: `${summary}\n${JSON.stringify(structured)}` }], structuredContent: structured });

/** A source as a log line names it: an id, or a file by its base name. */
const logSource = (source) => (typeof source !== "string" ? undefined : source.startsWith("file:") ? `file:${source.split(/[\\/]/).pop()?.slice(0, 80)}` : source.slice(0, 80));

/**
 * Registers the tools on a server for one caller.
 * @param {import("@modelcontextprotocol/server").McpServer} server
 * @param {any} context  createMcpContext's
 * @param {import("pivotkit-server").Caller} caller
 */
export function registerTools(server, context, caller) {
    for (const name of Object.keys(OPERATIONS)) {
        const op = OPERATIONS[name];
        const scopes = context.options.auth?.toolScopes?.[name] ?? [];
        server.registerTool(
            name,
            {
                title: op.title,
                description: descriptionOf(name),
                inputSchema: fromJsonSchema(/** @type {any} */ (presentedInput(name))),
                outputSchema: fromJsonSchema(/** @type {any} */ (presentedOutput(name))),
                annotations: annotationsOf(op),
                ...(scopes.length && context.authMode === "oauth"
                    ? {
                          scopeChallenge: ({ authInfo }) => {
                              const held = new Set(authInfo?.scopes ?? []);
                              const needed = [...(context.options.auth?.requiredScopes ?? []), ...scopes];
                              return needed.every((s) => held.has(s)) ? undefined : { scopes: /** @type {[string, ...string[]]} */ (needed), errorDescription: `${name} needs the scopes ${needed.join(" ")}` };
                          }
                      }
                    : {})
            },
            async (/** @type {any} */ args) => {
                const started = Date.now();
                const entry = { tool: name, client: caller.client, source: logSource(args?.source) };
                try {
                    if (caller.scopes !== null && !scopes.every((s) => caller.scopes?.has(s))) {
                        throw new OperationError("NOT_ALLOWED", `your token may not use ${name}`);
                    }
                    const { text, result } = await present(context, name, args ?? {}, caller);
                    context.log.call({ ...entry, ok: true, ms: Date.now() - started });
                    return /** @type {any} */ (okResult(text, result));
                } catch (e) {
                    const error = e instanceof OperationError ? e : null;
                    if (!error) {
                        context.log.error(e, entry);
                    }
                    context.log.call({ ...entry, ok: false, code: error?.code ?? "INTERNAL", ms: Date.now() - started });
                    return errorResult(error?.code ?? "INTERNAL", error ? error.message : "internal error");
                }
            }
        );
    }
}

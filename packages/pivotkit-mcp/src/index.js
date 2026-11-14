/*
 * pivotkit-mcp: an MCP server for pivotkit. A model lists and describes data sources, writes and
 * validates views, renders reports into files and makes links, without reading the data itself;
 * the operator's exposure policy says what it may see. Built on pivotkit-server, which holds what
 * the MCP server and the REST service share (options, sources, policy, workers, output, sign-in).
 *
 *   import { createMcpContext, createHttpHandler } from "pivotkit-mcp";
 *   const context = await createMcpContext({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" } });
 *   // stdio: serveStdio((ctx) => context.server(ctx)) from "@modelcontextprotocol/server/stdio"
 *   // HTTP:  const handler = await createHttpHandler(context); handler.fetch(request)
 */

export { createMcpContext, callerOf, INSTRUCTIONS, SKILLS_DIR, VERSION } from "./context.js";
export { createHttpHandler, listen } from "./http.js";
export { run } from "./runner.js";
export { ConfigError, loadConfig, validateOptions, OPTION_KEYS, SERVER_LIMITS, COMPUTE_DEFAULTS, DEFAULT_ALGORITHMS, POLICY_LEVELS, POLICY_DEFAULTS } from "pivotkit-server";

/**
 * @typedef {import("pivotkit-server").ServerOptions} McpOptions
 * @typedef {import("pivotkit-server").SourceOptions} SourceOptions
 * @typedef {import("pivotkit-server").PolicyOptions} PolicyOptions
 * @typedef {import("pivotkit-server").AuthOptions} AuthOptions
 */

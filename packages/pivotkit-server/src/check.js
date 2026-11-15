/*
 * --check-config: what the server would expose with these options, for the operator to read before a
 * client connects. The options are checked as the start checks them; each concern says what it found
 * in its section (check/<name>.js, in check/index.js SECTIONS' order), and check/format.js puts it on
 * the page: the verdict and the counts first, then every PROBLEM, then the sections. Source files are
 * read once for their column names and statistics, never to show a value.
 */

import { validateOptions } from "./config.js";
import { createRegistry } from "./registry.js";
import { SECTIONS, UPGRADING_URL, runSections } from "./check/index.js";
import { render } from "./check/format.js";

/**
 * What the server would expose with these options. The options are checked first as createContext
 * checks them (validateOptions): what it refuses throws the same ConfigError here.
 * @param {import("./config.js").ServerOptions} options
 * @param {{ http?: boolean, env?: Record<string, string | undefined>, name?: string, tokenEnv?: string, rest?: boolean, mcp?: boolean, discover?: (issuer: string, how: { signal: AbortSignal }) => Promise<unknown>, sections?: ReadonlyArray<{ name: string, section: import("./check/index.js").Section }> }} [runtime]  http: an HTTP server is planned (default false); env: the environment secrets are read from; name: the name the first line starts with (default "pivotkit-mcp"); tokenEnv: the one static token's variable; rest: the REST service is served too; mcp: the MCP server is (default true); discover: loads an issuer's metadata (the runners pass auth.js discover; without it no issuer is asked); sections: the sections (default check/index.js SECTIONS; tests)
 * @returns {Promise<{ text: string, problems: number, warnings: number, stops: number }>}  problems: what keeps the server from starting (stops) or a source or feature from working; warnings: what to look at
 */
export async function checkConfig(options, { http = false, env = {}, name = "pivotkit-mcp", tokenEnv = "PIVOTKIT_MCP_TOKEN", rest = false, mcp = true, discover, sections = SECTIONS } = {}) {
    validateOptions(options);
    const registry = await createRegistry(options);
    const runtime = { http, env, name, tokenEnv, rest, mcp, discover, columns: new Map(), everyColumn: null };
    const said = await runSections(sections, options, registry, runtime);
    return render(name, said.sections, said.upgrade, UPGRADING_URL);
}

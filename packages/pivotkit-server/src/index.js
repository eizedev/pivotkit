/*
 * pivotkit-server: what pivotkit's front ends without a browser share over HTTP and stdio: the
 * options and their checks, the source registry, the exposure policy with its profiles, the compute
 * workers, the output directory, the log, authentication (static tokens, OAuth 2.1 resource server),
 * the Host check and present(), which turns an operation's result into what a caller gets. The REST
 * service is the subpath pivotkit-server/rest; the MCP server is the package pivotkit-mcp.
 *
 *   import { createContext, present, callerOf } from "pivotkit-server";
 *   const context = await createContext({ sources: { sales: { file: "data/sales.csv" } } });
 *   const { result } = await present(context, "describe_source", { source: "sales" }, callerOf("none"));
 */

export { createContext, callerOf, VERSION, TOKEN_ENV } from "./context.js";
export { present, presentedInput, presentedOutput, renderFile, findingsText } from "./present.js";
export { ConfigError, loadConfig, validateOptions, pathOf, restResourceOf, OPTION_KEYS, SERVER_LIMITS, COMPUTE_DEFAULTS, DEFAULT_ALGORITHMS, ENDPOINTS, REST_BASE, SOURCE_ID } from "./config.js";
export { POLICY_LEVELS, POLICY_DEFAULTS } from "./policy.js";
export { createAuthCore, AuthRefusal, bearerOf, discover, scopesOf, profileOf, resourceMetadataUrlOf, TOKEN_MIN } from "./auth.js";
export { allowedHosts, hostRefusal, clientAddress, LOCAL_HOSTS } from "./checks.js";
export { serveFetch, isLoopback, GRACE_MS } from "./listen.js";
export { checkConfig } from "./check.js";
export { OperationError } from "pivotkit-report/operations";
export { optionsFrom, flagLines, SERVER_FLAGS } from "./flags.js";
export { serve, createServerHandler, DEFAULT_PORT } from "./serve.js";

/**
 * @typedef {import("./config.js").ServerOptions} ServerOptions
 * @typedef {import("./config.js").SourceOptions} SourceOptions
 * @typedef {import("./config.js").PolicyOptions} PolicyOptions
 * @typedef {import("./config.js").AuthOptions} AuthOptions
 * @typedef {import("./config.js").RestOptions} RestOptions
 * @typedef {import("./registry.js").Caller} Caller
 * @typedef {import("./context.js").ContextRuntime} ContextRuntime
 * @typedef {import("./context.js").ServerContext} ServerContext
 * @typedef {import("./present.js").PresentOptions} PresentOptions
 * @typedef {import("./listen.js").FetchHandler} FetchHandler
 */

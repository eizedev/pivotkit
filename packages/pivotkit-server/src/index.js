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
export { createAuthCore, AuthRefusal, bearerOf, discover, scopesOf, profileOf, groupRefusal, groupsOf, GROUPS_REFUSED, NOT_IN_GROUP, resourceMetadataUrlOf, TOKEN_MIN } from "./auth.js";
export { allowedHosts, hostRefusal, clientAddress, LOCAL_HOSTS } from "./checks.js";
export { createLimits, REQUEST_LIMITS, bodyBytesOf, limitKeyOf } from "./limits.js";
export { serveFetch, isLoopback, connectionLimitsOf, refusedText, GRACE_MS, CONNECTION_LIMITS, BODY_BYTES, MAX_BODY_BYTES, SIGNED_IN, takeSignIn, peekSignIn, bodyCapOf } from "./listen.js";
export { callerFields, CALLER_LOG_FIELDS, flushed, LOG_DEFAULTS, LOG_LEVELS, LOG_FORMATS, REFUSED_REASONS, SEVERITY, SOURCE_LOG_TEXT, logSettingsOf, logUnanswered, noteAnswered, noteProtocolRefusal, refusalReason, startErrorLine, startFields } from "./log.js";
export { newRequestId, withRequestId, requestId, errorDetails, isRequestId, REQUEST_ID, requestScope, requestScopeFor, withRequestScope, withRequestIdHeader, traceIdOf, upstreamRequestIdOf } from "./request-id.js";
export { serverTextOf } from "./rest/problem.js";
export { offeredScopes } from "./scopes.js";
export { INLINE_ID, MCP_DATA_CAP, REST_DATA_BYTES, inlineLogFields } from "./sources/inline.js";
export { readSecret, secretFileWarning, SecretError } from "./secrets.js";
export { SECRET_REF } from "./options/shared.js";
export { checkConfig } from "./check.js";
export { createDownloadHandler, linksOf, DOWNLOADS_PATH, CALLBACK_PATH, DOWNLOAD_BODY_BYTES } from "./downloads.js";
export { OperationError } from "pivotkit-report/operations";
export { SourceError, SOURCE_ERROR_CODES } from "./sources/run.js";
export { CODE_DEFAULTS } from "./options/code.js";
export { optionsFrom, flagLines, httpFlags, startFormatOf, SERVER_FLAGS, SHARED_FLAGS } from "./flags.js";
export { serve, createServerHandler, DEFAULT_PORT } from "./serve.js";

/**
 * @typedef {import("./config.js").ServerOptions} ServerOptions
 * @typedef {import("./config.js").SourceOptions} SourceOptions
 * @typedef {import("./sources/code.js").SourceCaller} SourceCaller
 * @typedef {import("./sources/code.js").SourceLoad} SourceLoad
 * @typedef {import("./sources/code.js").SharedSourceLoad} SharedSourceLoad
 * @typedef {import("./sources/code.js").SourceVersion} SourceVersion
 * @typedef {import("./sources/code.js").LoadResult} LoadResult
 * @typedef {import("./sources/code.js").SourceParams} SourceParams
 * @typedef {import("./config.js").PolicyOptions} PolicyOptions
 * @typedef {import("./config.js").AuthOptions} AuthOptions
 * @typedef {import("./config.js").RestOptions} RestOptions
 * @typedef {import("./registry.js").Caller} Caller
 * @typedef {import("./context.js").ContextRuntime} ContextRuntime
 * @typedef {import("./context.js").ServerContext} ServerContext
 * @typedef {import("./present.js").PresentOptions} PresentOptions
 * @typedef {import("./listen.js").FetchHandler} FetchHandler
 */

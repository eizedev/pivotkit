/*
 * `pivotkit-server serve`: one HTTP server on one port for the REST service (/api/v1,
 * /openapi.json) and, when pivotkit-mcp is installed and enabled, the MCP endpoint (/mcp, its
 * quick-start page at /), the server's own download links (/downloads, downloads.js), with /healthz
 * (the process answers) and /readyz (it can take work: the issuer loaded, workers up, the output
 * directory writable).
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigError } from "./config.js";
import { TOKEN_ENV, VERSION, createContext } from "./context.js";

export { TOKEN_ENV };
import { allowedHosts, hostRefusal } from "./checks.js";
import { connectionLimitsOf, isLoopback, refusedText, serveFetch } from "./listen.js";
import { bodyBytesOf } from "./limits.js";
import { DOWNLOADS_PATH, DOWNLOAD_BODY_BYTES, createDownloadHandler } from "./downloads.js";
import { createRestHandler, REST_BODY_BYTES } from "./rest/handler.js";
import { problem } from "./rest/problem.js";
import { logUnanswered, noteAnswered, refusalReason, startFields } from "./log.js";
import { requestScopeFor, withRequestIdHeader, withRequestScope } from "./request-id.js";

/** The default port. */
export const DEFAULT_PORT = 3333;


/** The MCP server's package: imported by name at run time, so pivotkit-server does not depend on it. */
export const MCP_PACKAGE = "pivotkit-mcp";

/**
 * pivotkit-mcp, when it is installed beside this package; null when not. A pivotkit-mcp of another
 * release, which imports a name the pivotkit-server it finds does not export, is a ConfigError that
 * names both versions (releaseMismatch).
 * @returns {Promise<any>}
 */
export async function loadMcp() {
    try {
        return await import(MCP_PACKAGE);
    } catch (e) {
        // only pivotkit-mcp itself missing; a pivotkit-mcp whose own dependency is missing is an error
        if (e?.code === "ERR_MODULE_NOT_FOUND" && String(e.message).includes(`Cannot find package '${MCP_PACKAGE}'`)) {
            return null;
        }
        // a missing export is a SyntaxError of the import, before any of pivotkit-mcp runs; only one
        // of pivotkit-server's (or a subpath's, pivotkit-server/policy) is a mismatch of the two
        if (e instanceof SyntaxError && /requested module 'pivotkit-server(?:\/[^']*)?'/.test(String(e.message))) {
            throw await releaseMismatch(e);
        }
        throw e;
    }
}

/** The package.json nearest above a file, or null. */
function packageOf(file) {
    for (let dir = dirname(file); ; dir = dirname(dir)) {
        const path = join(dir, "package.json");
        if (existsSync(path)) {
            return JSON.parse(readFileSync(path, "utf8"));
        }
        if (dirname(dir) === dir) {
            return null;
        }
    }
}

/**
 * The error for a pivotkit-mcp that does not fit the pivotkit-server it finds: its version, that
 * pivotkit-server's version, the range pivotkit-mcp declares, and the update guide. A version it
 * cannot read is left out, the import's own message kept.
 * @param {SyntaxError} e
 */
async function releaseMismatch(e) {
    let mcp = null;
    let server = null;
    try {
        const entry = fileURLToPath(import.meta.resolve(MCP_PACKAGE));
        mcp = packageOf(entry);
        server = packageOf(createRequire(entry).resolve("pivotkit-server"));
    } catch {
        // the versions it could read
    }
    const needs = mcp?.dependencies?.["pivotkit-server"];
    const { UPGRADING_URL } = await import("./check/index.js");
    return new ConfigError(
        `pivotkit-mcp ${mcp?.version ?? "(version unknown)"} does not fit pivotkit-server ${server?.version ?? VERSION} (${needs ? `it needs pivotkit-server ${needs}; ` : ""}${e.message}). ` +
            `Install pivotkit-server and pivotkit-mcp of one release in one command: ${UPGRADING_URL}#update`
    );
}

/**
 * The combined fetch handler of a set of options: REST and, if enabled, MCP over one context.
 * @param {import("./config.js").ServerOptions} options
 * @param {{ env: Record<string, string | undefined>, stderr: { write(t: string): unknown }, loopback: boolean }} runtime
 * @returns {Promise<import("./listen.js").FetchHandler & { context: any, enable: string[], downloads: ReturnType<typeof createDownloadHandler>, close(): Promise<void> }>}
 */
export async function createServerHandler(options, runtime) {
    const asked = options.http?.enable;
    const mcpModule = !asked || asked.includes("mcp") ? await loadMcp() : null;
    if (asked?.includes("mcp") && !mcpModule) {
        throw new ConfigError('http.enable: "mcp" needs the package pivotkit-mcp beside pivotkit-server (npm install pivotkit-mcp)');
    }
    const enable = asked ?? ["rest", ...(mcpModule ? ["mcp"] : [])];
    /** @type {any} */
    const own = { showPaths: false, stderr: runtime.stderr, tokenEnv: TOKEN_ENV, env: runtime.env, service: { name: "pivotkit-server", version: VERSION } };
    const context = mcpModule ? await mcpModule.createMcpContext(options, own) : await createContext(options, own);
    // what is made so far, closed again when a later step fails (their timers would run on)
    /** @type {ReturnType<typeof createDownloadHandler> | null} */
    let made = null;
    /** @type {any} */
    let rest = null;
    try {
        // the download links' route: before REST and MCP (a browser's form POST carries an Origin
        // that is not an MCP client's), shared with pivotkit-mcp's handler on this context
        const downloads = createDownloadHandler(context, { env: runtime.env, loopback: runtime.loopback });
        made = downloads;
        const isDownload = (request) => downloads.handles(new URL(request.url).pathname);
        rest = enable.includes("rest") ? await createRestHandler(context, { env: runtime.env, loopback: runtime.loopback }) : null;
        const mcp = enable.includes("mcp") && mcpModule ? await mcpModule.createHttpHandler(context, { env: runtime.env, loopback: runtime.loopback }) : null;
        const hosts = allowedHosts(options);
        const trustProxy = options.http?.trustProxy ?? false;
        const isRest = (request) => rest?.handles(new URL(request.url).pathname) ?? false;

        /** Whether /readyz last found the server ready (it starts out so): a line is written only when that changes. */
        let wasReady = true;

        /** /healthz and /readyz, after the Host check: a probe writes no line; /readyz one when readiness changes. */
        async function health(request) {
            const path = new URL(request.url).pathname;
            if ((request.method !== "GET" && request.method !== "HEAD") || (path !== "/healthz" && path !== "/readyz")) {
                return null;
            }
            const refused = hostRefusal(request, hosts);
            if (refused) {
                context.log.refused({ status: 403, reason: refusalReason("FORBIDDEN_HOST"), host: String(request.headers.get("host") ?? "").slice(0, 100) });
                return problem("FORBIDDEN_HOST", refused);
            }
            // a probe's answer is not a refusal: no line of its own, none from the HTTP edge's check
            noteAnswered();
            if (path === "/healthz") {
                return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
            }
            const ready = await context.ready();
            if (ready.ok !== wasReady) {
                wasReady = ready.ok;
                if (ready.ok) {
                    context.log.info("ready again: the server takes work");
                } else {
                    context.log.warn(`not ready: ${ready.reason}`);
                }
            }
            return Response.json(ready, { status: ready.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
        }

        /** The route family of a request, for a refused line written by logUnanswered (REST's and MCP's own handlers name theirs). */
        const routeFamily = (request) => (isDownload(request) ? { path: DOWNLOADS_PATH, notFound: /** @type {const} */ ("info") } : {});

        /** The routes, in order: health, download links, REST, MCP. */
        const routes = {
            async precheck(request, info) {
                if (isDownload(request)) {
                    return downloads.precheck(request);
                }
                if (rest && isRest(request)) {
                    return rest.precheck(request, info);
                }
                if (!mcp) {
                    const refused = hostRefusal(request, hosts);
                    if (refused) {
                        context.log.refused({ status: 403, reason: refusalReason("FORBIDDEN_HOST"), host: String(request.headers.get("host") ?? "").slice(0, 100) });
                        return problem("FORBIDDEN_HOST", refused);
                    }
                    const declared = Number(request.headers.get("content-length") ?? 0);
                    if (declared > REST_BODY_BYTES) {
                        context.log.refused({ status: 413, reason: refusalReason("BODY_TOO_LARGE"), limit: REST_BODY_BYTES, size: declared });
                        return problem("BODY_TOO_LARGE", "the body is larger than 2 MiB, the most this service takes");
                    }
                    return null;
                }
                return mcp.precheck(request, info);
            },
            async fetch(request, info) {
                const early = await health(request);
                if (early) {
                    return early;
                }
                if (isDownload(request)) {
                    return downloads.fetch(request);
                }
                if (rest && isRest(request)) {
                    return rest.fetch(request, info);
                }
                if (mcp) {
                    return mcp.fetch(request, info);
                }
                const refused = hostRefusal(request, hosts);
                if (!refused) {
                    // a path nobody serves: on the debug log only, so a scan does not fill the log
                    context.log.refused({ status: 404, reason: refusalReason("NOT_FOUND") }, { level: "debug" });
                }
                return refused ? problem("FORBIDDEN_HOST", refused) : problem("NOT_FOUND", "no such route; the REST service is at /api/v1 (GET /openapi.json)");
            }
        };

        return {
            context,
            enable,
            downloads,
            /** @type {import("./listen.js").FetchHandler["precheck"]} */
            async precheck(request, info = { address: "" }) {
                // the request's scope: serveFetch's, or made here for a host that serves the handler itself
                const scope = requestScopeFor(request, info, { trustProxy });
                const answer = await logUnanswered(context.log, scope, await withRequestScope(scope, () => routes.precheck(request, info)), routeFamily(request));
                return answer && withRequestIdHeader(answer, scope.id);
            },
            /** @type {import("./listen.js").FetchHandler["fetch"]} */
            async fetch(request, info = { address: "" }) {
                const scope = requestScopeFor(request, info, { trustProxy });
                // every 4xx answer has a line: the routes' own, or a refused line by its status
                const response = await logUnanswered(context.log, scope, await withRequestScope(scope, () => routes.fetch(request, info)), routeFamily(request));
                return withRequestIdHeader(/** @type {Response} */ (response), scope.id);
            },
            problem: (status, path, info) => (downloads.handles(path.split("?")[0]) ? downloads.problem(status) : mcp && !rest?.handles(path.split("?")[0]) && mcp.problem ? mcp.problem(status, path, info) : rest ? rest.problem(status, path, info) : problem(status === 413 ? "BODY_TOO_LARGE" : "INVALID_INPUT", status === 413 ? "the body is larger than 2 MiB, the most this service takes" : "the request cannot be read")),
            async close() {
                downloads.close();
                await rest?.close();
                await mcp?.close();
                await context.close();
            }
        };
    } catch (e) {
        made?.close();
        await rest?.close().catch(() => undefined);
        await context.close();
        throw e;
    }
}

/**
 * Serves REST (and MCP) over HTTP.
 * @param {import("./config.js").ServerOptions} options
 * @param {{ env: Record<string, string | undefined>, stderr: { write(t: string): unknown } }} runtime
 * @returns {Promise<{ port: number, url: string, context: any, enable: string[], close(): Promise<void> }>}
 */
export async function serve(options, runtime) {
    const host = options.http?.host ?? "127.0.0.1";
    const port = options.http?.port ?? DEFAULT_PORT;
    if (!isLoopback(host) && (options.auth?.mode ?? "none") === "none" && !options.auth?.allowUnauthenticated) {
        throw new ConfigError(`--host ${host}: an address other than loopback needs --auth token or oauth (or --allow-unauthenticated for a network you trust)`);
    }
    const handler = await createServerHandler(options, { ...runtime, loopback: isLoopback(host) });
    let listening;
    try {
        const bodyBytes = bodyBytesOf(options);
        // a download takes no body: the form of a one-time link sends none
        listening = await serveFetch(handler, { host, port, bodyBytes: (request, info) => (handler.downloads.handles(new URL(request.url).pathname) ? DOWNLOAD_BODY_BYTES : bodyBytes(request, info)), graceMs: options.http?.graceMs, limits: connectionLimitsOf(options), trustProxy: options.http?.trustProxy ?? false, onClientError: (entry) => handler.context.log.refused({ ...entry, reason: refusalReason("INVALID_INPUT") }), onRefused: (entry) => handler.context.log.warn(refusedText(entry), entry) });
    } catch (e) {
        await handler.close();
        throw e;
    }
    const url = `http://${host.includes(":") ? `[${host}]` : host}:${listening.port}`;
    handler.downloads.listening(url);
    // what would fail on the first call is said now: a source file that is not there, a test issuer
    for (const s of await handler.context.registry.check()) {
        if (!s.exists) {
            handler.context.log.warn(`the source ${s.id} names a file that is not there; its calls answer FILE_NOT_AVAILABLE`);
        }
    }
    if (options.auth?.mode === "oauth" && options.auth.allowInsecureIssuer) {
        handler.context.log.warn("auth.allowInsecureIssuer: an http:// issuer is accepted; for a test issuer on this machine only");
    }
    handler.context.log.started({ version: VERSION, transport: "http", url, serves: handler.enable, auth: options.auth?.mode ?? "none", sources: handler.context.registry.ids().length, output: Boolean(handler.context.output), ...startFields(options, handler.context.registry, handler.context.log) });
    void handler.context.countAutoValues();
    return {
        port: listening.port,
        url,
        context: handler.context,
        enable: handler.enable,
        async close() {
            const started = Date.now();
            await listening.close();
            await handler.close();
            handler.context.log.stopped({ ms: Date.now() - started });
        }
    };
}

/*
 * Streamable HTTP: a fetch handler (Request in, Response out) around the SDK's createMcpHandler, and
 * `listen()`, the runner's node:http server for it. Every request passes, in this order:
 *
 * 1. the Host check (localhost names, the public URL's host, --allow-host): DNS rebinding;
 *    the server's own download links (/downloads, pivotkit-server's createDownloadHandler) are
 *    answered right after it, before the Origin check and the body cap, which are the MCP clients';
 * 2. the Origin check: a present Origin must be allowed (none by default), else 403;
 * 3. the routes without authentication: /healthz, the OAuth discovery documents, the quick-start page
 *    at / (a browser that opens /mcp is sent there);
 * 4. for /mcp: the refused-token limit of the address, authentication (auth.js, once per request:
 *    the precheck's result is kept for the route), the caller's rate and concurrency limits
 *    (mcp.rateLimit, mcp.concurrency, as the REST service has them), then the SDK, which checks the
 *    protocol's headers and body.
 *
 * No sessions: the SDK builds a server per request from the shared context.
 */

import { createMcpHandler, hostHeaderValidationResponse, originValidationResponse } from "@modelcontextprotocol/server";
import { BODY_BYTES, ConfigError, DEFAULT_PORT, DOWNLOAD_BODY_BYTES, DOWNLOADS_PATH, SIGNED_IN, allowedHosts, callerOf, clientAddress, connectionLimitsOf, createDownloadHandler, createLimits, isLoopback, limitKeyOf, logNotes, logUnanswered, noteProtocolRefusal, openAddressRefusal, prepareHttpServe, refusalReason, refusedText, requestScopeFor, serveFetch, startFields, takeSignIn, withRequestIdHeader, withRequestScope } from "pivotkit-server";
import { MCP_TOKEN_ENV, createMcpContext } from "./context.js";
import { createAuth, refusedClientOf } from "./auth.js";
import { quickStartPage } from "./page.js";

/** The MCP endpoint's path. */
export const ENDPOINT = "/mcp";

export { BODY_BYTES, DEFAULT_PORT, isLoopback };

/** The route family of the download links: a link nobody has (404) is logged at info, since a person asks the operator about it. */
const DOWNLOAD_FAMILY = Object.freeze({ path: DOWNLOADS_PATH, notFound: /** @type {const} */ ("info") });

/** The headers every answer of this server carries. */
const SAFE_HEADERS = { "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };

/** A copy of a response with the safe headers added. */
function withSafeHeaders(response) {
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(SAFE_HEADERS)) {
        headers.set(k, v);
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** A JSON-RPC error answer with a status and headers. */
const rpcError = (status, code, message, headers = {}) => Response.json({ jsonrpc: "2.0", error: { code, message }, id: null }, { status, headers });

/**
 * A response whose `release` runs once its body is read to the end or given up (a stream the client
 * leaves), or at once when it has none: a caller's slot is held while its answer is still streaming.
 */
function releasing(response, release) {
    if (!response.body) {
        release();
        return response;
    }
    let released = false;
    const once = () => {
        if (!released) {
            released = true;
            release();
        }
    };
    const reader = response.body.getReader();
    const body = new ReadableStream({
        async pull(controller) {
            try {
                const { done, value } = await reader.read();
                if (done) {
                    once();
                    controller.close();
                } else {
                    controller.enqueue(value);
                }
            } catch (e) {
                once();
                controller.error(e);
            }
        },
        cancel(reason) {
            once();
            return reader.cancel(reason);
        }
    });
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

/** Whether a GET is a browser opening the page, not an MCP client. */
function isBrowser(request) {
    const accept = request.headers.get("accept") ?? "";
    const mcp = [...request.headers.keys()].some((k) => k.startsWith("mcp-")) || request.headers.has("authorization");
    return request.method === "GET" && accept.includes("text/html") && !accept.includes("text/event-stream") && !mcp;
}

/** How the SDK names a refusal of its own ("Rejected inbound request (name-header-mismatch): ..."): lower-case words and dashes. */
const SDK_REFUSAL = /^Rejected inbound request \(([a-z0-9-]{1,60})\)/;

/**
 * A request the protocol layer refused: noted for the request's one `refused` line, which the HTTP
 * edge writes with the answer's status (logUnanswered): its error's class and the SDK's fixed name for
 * the refusal, never the message, which can quote the body (a parameter's value, a cell of data sent
 * in the request); the message only at debug, for the operator who sets the server up.
 * @param {any} log
 * @param {unknown} error
 */
function protocolRefusal(log, error) {
    const message = String(/** @type {any} */ (error)?.message ?? error);
    const named = SDK_REFUSAL.exec(message)?.[1];
    const protocol = { error: (error instanceof Error ? error.name : "Error").slice(0, 60), ...(named ? { refusal: named } : {}), detail: message.slice(0, 500) };
    if (!noteProtocolRefusal(protocol)) {
        // outside a request (no answer to put it on): a warning of its own
        log.warn(`request refused by the protocol layer: ${protocol.error}${named ? ` (${named})` : ""}`);
    }
}

/**
 * The fetch handler of a context.
 * @param {any} context  createMcpContext's
 * @param {{ env?: Record<string, string | undefined>, loopback?: boolean }} [runtime]
 * @returns {Promise<{ fetch(request: Request): Promise<Response>, precheck(request: Request): Promise<Response | null>, problem(status: number): Response, close(): Promise<void>, auth: any, downloads: any }>}
 */
export async function createHttpHandler(context, runtime = {}) {
    const http = context.options.http ?? {};
    const publicUrl = http.publicUrl ? new URL(http.publicUrl) : null;
    const hosts = allowedHosts(context.options);
    const origins = http.allowOrigins ?? [];
    const auth = await createAuth(context, { env: runtime.env ?? process.env, loopback: runtime.loopback ?? isLoopback(http.host ?? "127.0.0.1") });
    // the SDK reports requests it refused (a wrong protocol header, headers and body that disagree)
    // here: a client's mistake, a warning
    const handler = createMcpHandler((ctx) => context.server(ctx), { legacy: "stateless", maxRequestBodySize: BODY_BYTES, onerror: (e) => protocolRefusal(context.log, e) });
    const limits = createLimits(context.options.mcp);
    /**
     * Whom a request's limits count for (pivotkit-server's limitKeyOf): the caller its token makes;
     * without a token (auth none) the one local caller.
     * @param {any} authInfo
     */
    const limitKeyOfAuth = (authInfo) => {
        try {
            return limitKeyOf(callerOf(authInfo ? auth.mode : "none", authInfo, context.options.auth));
        } catch {
            // a caller the gate refused already (groups): never reaches here; its client then
            return `client:${String(authInfo?.clientId ?? "client")}`;
        }
    };
    const trustProxy = http.trustProxy ?? false;
    const downloads = createDownloadHandler(context, { env: runtime.env ?? process.env, loopback: runtime.loopback ?? isLoopback(http.host ?? "127.0.0.1") });
    const page = http.page === false ? null : { sources: typeof http.page === "object" && http.page.sources !== undefined ? http.page.sources : auth.mode === "none" };

    /**
     * The token of a request to /mcp, within the refused-token limit of its address: the caller's
     * authInfo (null with auth none), or the answer to send.
     * @param {Request} request
     * @param {string} address
     */
    async function signIn(request, address) {
        const wait = address && auth.mode !== "none" ? limits.blocked(address) : 0;
        const authInfo = await auth.gate(request);
        if (authInfo instanceof Response) {
            if (authInfo.status === 401 && wait) {
                context.log.refused({ status: 429, path: ENDPOINT, reason: refusalReason("RATE_LIMITED") });
                return rpcError(429, -32000, "too many refused tokens from this address; wait before you try again", { "retry-after": String(wait) });
            }
            const client = refusedClientOf(authInfo);
            context.log.refused({ status: authInfo.status, path: ENDPOINT, reason: gateReason(authInfo.status, client, request), ...(client ? { client } : {}) });
            if (authInfo.status === 401 && address) {
                limits.failed(address);
            }
        }
        return authInfo;
    }

    /**
     * The SDK's answer to a Host or Origin that is not allowed, with its refused line; null when both pass.
     * @param {Request} request
     */
    function hostOrOrigin(request) {
        const byHost = hostHeaderValidationResponse(request, hosts);
        const refused = byHost ?? originValidationResponse(request, origins);
        if (refused) {
            context.log.refused({ status: refused.status, reason: refusalReason(byHost ? "FORBIDDEN_HOST" : "FORBIDDEN_ORIGIN"), host: String(request.headers.get("host") ?? "").slice(0, 100), origin: String(request.headers.get("origin") ?? "").slice(0, 100) });
        }
        return refused ?? null;
    }

    /** @param {Request} request @param {{ address?: string, [SIGNED_IN]?: any }} info */
    async function route(request, info) {
        const url = new URL(request.url);
        if (downloads.handles(url.pathname)) {
            return downloads.fetch(request);
        }
        const refused = hostOrOrigin(request);
        if (refused) {
            return refused;
        }
        if (url.pathname === "/healthz" && request.method === "GET") {
            return Response.json({ ok: true });
        }
        if (url.pathname.startsWith("/.well-known/")) {
            return auth.metadata(request) ?? new Response("not found", { status: 404 });
        }
        if (url.pathname === "/" && request.method === "GET") {
            if (!page) {
                return new Response("not found", { status: 404 });
            }
            const endpoint = publicUrl ? new URL(ENDPOINT, publicUrl).href : `${url.protocol}//${url.host}${ENDPOINT}`;
            const html = quickStartPage({ endpoint, version: context.version, auth: auth.mode, issuer: auth.mode === "oauth" ? context.options.auth?.issuer : null, sources: page.sources ? context.registry.titles().filter((s) => !s.scopes.length) : null });
            return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'", "cache-control": "no-store" } });
        }
        if (url.pathname !== ENDPOINT) {
            // a path nobody serves: on the debug log only, so a scan does not fill the log
            context.log.refused({ status: 404, reason: refusalReason("NOT_FOUND") }, { level: "debug" });
            return new Response("not found", { status: 404 });
        }
        if (isBrowser(request)) {
            return new Response(null, { status: 302, headers: { location: "/" } });
        }
        const kept = takeSignIn(info);
        const authInfo = kept !== undefined ? kept.authInfo : await signIn(request, clientAddress(request, info.address ?? "", trustProxy));
        if (authInfo instanceof Response) {
            return authInfo;
        }
        // stateless: only POST reaches the protocol layer; any other method is answered here, as the
        // SDK would, before it takes a caller's slot (a HEAD's answer is never read to its end)
        if (request.method !== "POST") {
            // a client that opens a stream with GET: routine for a stateless server, on the debug log only
            context.log.refused({ status: 405, path: ENDPOINT, reason: refusalReason("METHOD_NOT_ALLOWED") }, { level: "debug" });
            return rpcError(405, -32000, "Method not allowed.", { allow: "POST" });
        }
        const client = authInfo ? String(authInfo.clientId ?? "client") : "local";
        // counted per person (a client's people do not share one bucket), the client's own cap beside it
        const limitKey = limitKeyOfAuth(authInfo);
        const wait = limits.take(limitKey, client);
        if (wait) {
            context.log.refused({ status: 429, path: ENDPOINT, reason: refusalReason("RATE_LIMITED"), limit: limits.rateBy(limitKey, client), client });
            return rpcError(429, -32000, "too many requests; wait before the next", { "retry-after": String(wait) });
        }
        if (!limits.enter(limitKey, client)) {
            context.log.refused({ status: 429, path: ENDPOINT, reason: refusalReason("RATE_LIMITED"), limit: limits.fullBy(limitKey, client), client });
            return rpcError(429, -32000, "too many requests at once; wait for one to finish", { "retry-after": "1" });
        }
        try {
            return releasing(await handler.fetch(request, authInfo ? { authInfo } : {}), () => limits.leave(limitKey, client));
        } catch (e) {
            limits.leave(limitKey, client);
            throw e;
        }
    }

    return {
        auth,
        downloads,
        /** The answer for a body that cannot be read, as JSON-RPC, with its refused line. */
        problem(status, _path, info = {}) {
            const scope = requestScopeFor(null, info, { trustProxy });
            withRequestScope(scope, () => context.log.refused({ status, path: ENDPOINT, reason: refusalReason(status === 413 ? "BODY_TOO_LARGE" : "INVALID_INPUT"), ...(status === 413 ? { limit: BODY_BYTES } : {}) }));
            return withRequestIdHeader(bodyProblem(status), scope.id);
        },
        /**
         * The checks a request's headers allow, before its body is read: Host, Origin, the declared
         * size, and the token for /mcp (kept in `info` for fetch, so it is checked once). A Response
         * to send, or null to go on.
         * @param {Request} request  without its body
         * @param {{ address?: string, [SIGNED_IN]?: any }} [info]  the client's address; serveFetch hands the same object to fetch
         */
        async precheck(request, info = {}) {
            // the request's scope: serveFetch's, or made here for a host that serves the handler itself
            const scope = requestScopeFor(request, info, { trustProxy });
            const answer = await logUnanswered(context.log, scope, await withRequestScope(scope, () => check(request, info)), routeFamily(request));
            return answer && withRequestIdHeader(answer, scope.id);
        },
        /**
         * @param {Request} request
         * @param {{ address?: string, [SIGNED_IN]?: any }} [info]
         */
        async fetch(request, info = {}) {
            const scope = requestScopeFor(request, info, { trustProxy });
            // a 4xx without a line of its own (the SDK answers a body that is not JSON or an
            // unsupported protocol version without reporting it) gets a refused line
            const response = await logUnanswered(context.log, scope, await withRequestScope(scope, () => answer(request, info)), routeFamily(request));
            return withRequestIdHeader(/** @type {Response} */ (response), scope.id);
        },
        async close() {
            downloads.close();
            limits.close();
            auth.close?.();
            await handler.close();
        }
    };

    /**
     * The route family of a request, for a refused line written by logUnanswered: /mcp or /downloads.
     * @param {Request} request
     */
    function routeFamily(request) {
        const path = new URL(request.url).pathname;
        return path === ENDPOINT ? { path: ENDPOINT } : downloads.handles(path) ? DOWNLOAD_FAMILY : {};
    }

    /**
     * The checks before the body is read (precheck's work).
     * @param {Request} request
     * @param {{ address?: string, [SIGNED_IN]?: any }} info
     */
    async function check(request, info) {
        if (downloads.handles(new URL(request.url).pathname)) {
            return downloads.precheck(request);
        }
        const refused = hostOrOrigin(request);
        if (refused) {
            return withSafeHeaders(refused);
        }
        const declared = Number(request.headers.get("content-length") ?? 0);
        if (declared > BODY_BYTES) {
            context.log.refused({ status: 413, path: ENDPOINT, reason: refusalReason("BODY_TOO_LARGE"), limit: BODY_BYTES, size: declared });
            return withSafeHeaders(Response.json({ jsonrpc: "2.0", error: { code: -32600, message: "request body too large" }, id: null }, { status: 413 }));
        }
        if (new URL(request.url).pathname === ENDPOINT && request.method === "POST") {
            const authInfo = await signIn(request, clientAddress(request, info.address ?? "", trustProxy));
            if (authInfo instanceof Response) {
                return withSafeHeaders(authInfo);
            }
            info[SIGNED_IN] = { authInfo };
        }
        return null;
    }

    /**
     * The answer to a request (fetch's work).
     * @param {Request} request
     * @param {{ address?: string, [SIGNED_IN]?: any }} info
     */
    async function answer(request, info) {
        try {
            return withSafeHeaders(await route(request, info));
        } catch (e) {
            context.log.error(e, { where: "http" });
            return withSafeHeaders(Response.json({ jsonrpc: "2.0", error: { code: -32603, message: "internal error" }, id: null }, { status: 500 }));
        }
    }
}

/**
 * The reason of a refusal by the token check (auth.js gate): 401 the token's, 403 the groups (a
 * client named) or the scopes, 503 the issuer not loaded yet, 400 a token in the address.
 * @param {number} status
 * @param {string | undefined} client  refusedClientOf's
 * @param {Request} request
 */
function gateReason(status, client, request) {
    if (status === 401) {
        return refusalReason("INVALID_TOKEN", request);
    }
    if (status === 403) {
        return refusalReason(client ? "NOT_ALLOWED" : "INSUFFICIENT_SCOPE");
    }
    return refusalReason(status === 503 ? "AUTH_NOT_READY" : "TOKEN_IN_ADDRESS");
}

/** The answer for a body that cannot be read: a JSON-RPC error. */
const bodyProblem = (status) => Response.json({ jsonrpc: "2.0", error: { code: -32600, message: status === 413 ? "request body too large" : "bad request" }, id: null }, { status });

/**
 * The runner's HTTP server: builds the context and the handler and listens. With a state directory
 * (runtime.stateDir, pivotkit-server's state.js) a token and keys that are missing are made first.
 * @param {import("pivotkit-server").ServerOptions} given
 * @param {{ env: Record<string, string | undefined>, stderr: { write(t: string): unknown }, stateDir?: string | null }} runtime
 * @returns {Promise<{ port: number, url: string, close(): Promise<void>, context: any }>}
 */
export async function listen(given, runtime) {
    const host = given.http?.host ?? "127.0.0.1";
    const port = given.http?.port ?? DEFAULT_PORT;
    const { options, notes } = await prepareHttpServe(given, { env: runtime.env, host, tokenEnv: MCP_TOKEN_ENV, stateDir: runtime.stateDir });
    if (!isLoopback(host) && (options.auth?.mode ?? "none") === "none" && !options.auth?.allowUnauthenticated) {
        throw new ConfigError(openAddressRefusal(host));
    }
    const context = await createMcpContext(options, { showPaths: false, stderr: runtime.stderr, env: runtime.env });
    logNotes(context.log, notes);
    let handler;
    let listening;
    try {
        handler = await createHttpHandler(context, { env: runtime.env, loopback: isLoopback(host) });
        const downloads = handler.downloads;
        const isDownload = (path) => downloads.handles(path.split("?")[0]);
        listening = await serveFetch({ precheck: (request, info) => handler.precheck(request, info), fetch: (request, info) => handler.fetch(request, info), problem: (status, path, info) => (isDownload(path) ? downloads.problem(status) : handler.problem(status, path, info)) }, { host, port, bodyBytes: (request) => (isDownload(new URL(request.url).pathname) ? DOWNLOAD_BODY_BYTES : BODY_BYTES), graceMs: options.http?.graceMs, limits: connectionLimitsOf(options), trustProxy: options.http?.trustProxy ?? false, onClientError: (entry) => context.log.refused({ ...entry, reason: refusalReason("INVALID_INPUT") }), onInternalError: () => context.log.refused({ status: 500, reason: refusalReason("INTERNAL") }), onRefused: (entry) => context.log.warn(refusedText(entry), entry) });
    } catch (e) {
        await handler?.close();
        await context.close();
        throw e;
    }
    const url = `http://${host.includes(":") ? `[${host}]` : host}:${listening.port}${ENDPOINT}`;
    handler.downloads.listening(url);
    context.log.started({ version: context.version, transport: "http", url, auth: handler.auth.mode, sources: context.registry.ids().length, files: context.registry.allow.length > 0, output: Boolean(context.output), ...startFields(options, context.registry, context.log) });
    void context.countAutoValues();
    return {
        port: listening.port,
        url,
        context,
        async close() {
            const started = Date.now();
            await listening.close();
            await handler.close();
            await context.close();
            context.log.stopped({ ms: Date.now() - started });
        }
    };
}

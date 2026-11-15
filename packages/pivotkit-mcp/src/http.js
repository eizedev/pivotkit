/*
 * Streamable HTTP: a fetch handler (Request in, Response out) around the SDK's createMcpHandler, and
 * `listen()`, the runner's node:http server for it. Every request passes, in this order:
 *
 * 1. the Host check (localhost names, the public URL's host, --allow-host): DNS rebinding;
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
import { BODY_BYTES, ConfigError, DEFAULT_PORT, SIGNED_IN, allowedHosts, clientAddress, connectionLimitsOf, createLimits, isLoopback, refusedText, serveFetch, takeSignIn } from "pivotkit-server";
import { createMcpContext } from "./context.js";
import { createAuth, refusedClientOf } from "./auth.js";
import { quickStartPage } from "./page.js";

/** The MCP endpoint's path. */
export const ENDPOINT = "/mcp";

export { BODY_BYTES, DEFAULT_PORT, isLoopback };

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

/**
 * The fetch handler of a context.
 * @param {any} context  createMcpContext's
 * @param {{ env?: Record<string, string | undefined>, loopback?: boolean }} [runtime]
 * @returns {Promise<{ fetch(request: Request): Promise<Response>, precheck(request: Request): Promise<Response | null>, problem(status: number): Response, close(): Promise<void>, auth: any }>}
 */
export async function createHttpHandler(context, runtime = {}) {
    const http = context.options.http ?? {};
    const publicUrl = http.publicUrl ? new URL(http.publicUrl) : null;
    const hosts = allowedHosts(context.options);
    const origins = http.allowOrigins ?? [];
    const auth = await createAuth(context, { env: runtime.env ?? process.env, loopback: runtime.loopback ?? isLoopback(http.host ?? "127.0.0.1") });
    // the SDK reports requests it refused (no JSON, a wrong protocol header) here: a client's mistake, a warning
    const handler = createMcpHandler((ctx) => context.server(ctx), { legacy: "stateless", maxRequestBodySize: BODY_BYTES, onerror: (e) => context.log.warn(`request refused by the protocol layer: ${String(e?.message ?? e).slice(0, 200)}`) });
    const limits = createLimits(context.options.mcp);
    const trustProxy = http.trustProxy ?? false;
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
                context.log.refused({ status: 429, path: ENDPOINT });
                return rpcError(429, -32000, "too many refused tokens from this address; wait before you try again", { "retry-after": String(wait) });
            }
            const client = refusedClientOf(authInfo);
            context.log.refused({ status: authInfo.status, path: ENDPOINT, ...(client ? { client } : {}) });
            if (authInfo.status === 401 && address) {
                limits.failed(address);
            }
        }
        return authInfo;
    }

    /** @param {Request} request @param {{ address?: string, [SIGNED_IN]?: any }} info */
    async function route(request, info) {
        const url = new URL(request.url);
        const refused = hostHeaderValidationResponse(request, hosts) ?? originValidationResponse(request, origins);
        if (refused) {
            context.log.refused({ status: refused.status, host: String(request.headers.get("host") ?? "").slice(0, 100), origin: String(request.headers.get("origin") ?? "").slice(0, 100) });
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
            return rpcError(405, -32000, "Method not allowed.", { allow: "POST" });
        }
        const client = authInfo ? String(authInfo.clientId ?? "client") : "local";
        const wait = limits.take(client);
        if (wait) {
            return rpcError(429, -32000, "too many requests; wait before the next", { "retry-after": String(wait) });
        }
        if (!limits.enter(client)) {
            return rpcError(429, -32000, "too many requests at once; wait for one to finish", { "retry-after": "1" });
        }
        try {
            return releasing(await handler.fetch(request, authInfo ? { authInfo } : {}), () => limits.leave(client));
        } catch (e) {
            limits.leave(client);
            throw e;
        }
    }

    return {
        auth,
        /** The answer for a body that cannot be read, as JSON-RPC. */
        problem: (status) => bodyProblem(status),
        /**
         * The checks a request's headers allow, before its body is read: Host, Origin, the declared
         * size, and the token for /mcp (kept in `info` for fetch, so it is checked once). A Response
         * to send, or null to go on.
         * @param {Request} request  without its body
         * @param {{ address?: string, [SIGNED_IN]?: any }} [info]  the client's address; serveFetch hands the same object to fetch
         */
        async precheck(request, info = {}) {
            const refused = hostHeaderValidationResponse(request, hosts) ?? originValidationResponse(request, origins);
            if (refused) {
                context.log.refused({ status: refused.status, host: String(request.headers.get("host") ?? "").slice(0, 100), origin: String(request.headers.get("origin") ?? "").slice(0, 100) });
                return withSafeHeaders(refused);
            }
            if (Number(request.headers.get("content-length") ?? 0) > BODY_BYTES) {
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
        },
        /**
         * @param {Request} request
         * @param {{ address?: string, [SIGNED_IN]?: any }} [info]
         */
        async fetch(request, info = {}) {
            try {
                return withSafeHeaders(await route(request, info));
            } catch (e) {
                context.log.error(e, { where: "http" });
                return withSafeHeaders(Response.json({ jsonrpc: "2.0", error: { code: -32603, message: "internal error" }, id: null }, { status: 500 }));
            }
        },
        async close() {
            auth.close?.();
            await handler.close();
        }
    };
}

/** The answer for a body that cannot be read: a JSON-RPC error. */
const bodyProblem = (status) => Response.json({ jsonrpc: "2.0", error: { code: -32600, message: status === 413 ? "request body too large" : "bad request" }, id: null }, { status });

/**
 * The runner's HTTP server: builds the context and the handler and listens.
 * @param {import("pivotkit-server").ServerOptions} options
 * @param {{ env: Record<string, string | undefined>, stderr: { write(t: string): unknown } }} runtime
 * @returns {Promise<{ port: number, url: string, close(): Promise<void>, context: any }>}
 */
export async function listen(options, runtime) {
    const host = options.http?.host ?? "127.0.0.1";
    const port = options.http?.port ?? DEFAULT_PORT;
    if (!isLoopback(host) && (options.auth?.mode ?? "none") === "none" && !options.auth?.allowUnauthenticated) {
        throw new ConfigError(`--host ${host}: an address other than loopback needs --auth token or oauth (or --allow-unauthenticated for a network you trust)`);
    }
    const context = await createMcpContext(options, { showPaths: false, stderr: runtime.stderr });
    let handler;
    let listening;
    try {
        handler = await createHttpHandler(context, { env: runtime.env, loopback: isLoopback(host) });
        listening = await serveFetch({ precheck: (request, info) => handler.precheck(request, info), fetch: (request, info) => handler.fetch(request, info), problem: bodyProblem }, { host, port, bodyBytes: BODY_BYTES, graceMs: options.http?.graceMs, limits: connectionLimitsOf(options), onRefused: (entry) => context.log.warn(refusedText(entry), entry) });
    } catch (e) {
        await handler?.close();
        await context.close();
        throw e;
    }
    const url = `http://${host.includes(":") ? `[${host}]` : host}:${listening.port}${ENDPOINT}`;
    context.log.info("started", { version: context.version, transport: "http", url, auth: handler.auth.mode, sources: context.registry.ids().length, files: context.registry.allow.length > 0, output: Boolean(context.output) });
    void context.countAutoValues();
    return {
        port: listening.port,
        url,
        context,
        async close() {
            await listening.close();
            await handler.close();
            await context.close();
        }
    };
}

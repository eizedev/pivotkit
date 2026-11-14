/*
 * Streamable HTTP: a fetch handler (Request in, Response out) around the SDK's createMcpHandler, and
 * `listen()`, the runner's node:http server for it. Every request passes, in this order:
 *
 * 1. the Host check (localhost names, the public URL's host, --allow-host): DNS rebinding;
 * 2. the Origin check: a present Origin must be allowed (none by default), else 403;
 * 3. the routes without authentication: /healthz, the OAuth discovery documents, the quick-start page
 *    at / (a browser that opens /mcp is sent there);
 * 4. authentication (auth.js) for /mcp, then the SDK, which checks the protocol's headers and body.
 *
 * No sessions: the SDK builds a server per request from the shared context.
 */

import { createServer } from "node:http";
import { createMcpHandler, hostHeaderValidationResponse, localhostAllowedHostnames, originValidationResponse } from "@modelcontextprotocol/server";
import { ConfigError } from "./config.js";
import { createMcpContext } from "./context.js";
import { createAuth } from "./auth.js";
import { quickStartPage } from "./page.js";

/** The most bytes of a request body. */
export const BODY_BYTES = 2_097_152;

/** The MCP endpoint's path. */
export const ENDPOINT = "/mcp";

/** The default port. */
export const DEFAULT_PORT = 3333;

/** Whether an address is loopback. */
export const isLoopback = (host) => host === "127.0.0.1" || host === "::1" || host === "localhost" || /^127\./.test(host);

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
 * @returns {Promise<{ fetch(request: Request): Promise<Response>, close(): Promise<void>, auth: any }>}
 */
export async function createHttpHandler(context, runtime = {}) {
    const http = context.options.http ?? {};
    const publicUrl = http.publicUrl ? new URL(http.publicUrl) : null;
    const hosts = [...localhostAllowedHostnames(), ...(publicUrl ? [publicUrl.hostname] : []), ...(http.allowHosts ?? [])];
    const origins = http.allowOrigins ?? [];
    const auth = await createAuth(context.options, { env: runtime.env ?? process.env, log: context.log, loopback: runtime.loopback ?? isLoopback(http.host ?? "127.0.0.1") });
    const handler = createMcpHandler((ctx) => context.server(ctx), { legacy: "stateless", maxRequestBodySize: BODY_BYTES, onerror: (e) => context.log.error(e, { where: "http" }) });
    const page = http.page === false ? null : { sources: typeof http.page === "object" && http.page.sources !== undefined ? http.page.sources : auth.mode === "none" };

    async function route(request) {
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
        const authInfo = await auth.gate(request);
        if (authInfo instanceof Response) {
            context.log.refused({ status: authInfo.status, path: ENDPOINT });
            return authInfo;
        }
        return handler.fetch(request, authInfo ? { authInfo } : {});
    }

    return {
        auth,
        async fetch(request) {
            try {
                return withSafeHeaders(await route(request));
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

/**
 * Reads a node:http request's body, at most `max` bytes, while it streams. Beyond that it rejects
 * with status 413 and drains what follows (up to 4 x max, then the connection is cut), so the client
 * gets the answer instead of a reset connection.
 */
function readBody(req, max) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let over = false;
        req.on("data", (chunk) => {
            size += chunk.length;
            if (over) {
                if (size > max * 4) {
                    req.destroy();
                }
                return;
            }
            if (size > max) {
                over = true;
                chunks.length = 0;
                reject(Object.assign(new Error("too large"), { status: 413 }));
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
    });
}

/**
 * The runner's HTTP server: builds the context and the handler and listens.
 * @param {import("./config.js").McpOptions} options
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
    const handler = await createHttpHandler(context, { env: runtime.env, loopback: isLoopback(host) });
    const server = createServer({ maxHeaderSize: 16_384, requestTimeout: 120_000, headersTimeout: 15_000 }, async (req, res) => {
        const abort = new AbortController();
        res.on("close", () => abort.abort());
        try {
            const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req, BODY_BYTES);
            const headers = new Headers();
            for (const [k, v] of Object.entries(req.headers)) {
                if (v !== undefined) {
                    headers.set(k, Array.isArray(v) ? v.join(", ") : v);
                }
            }
            // the address as the client asked for it; the Host check decides whether it is allowed
            const request = new Request(`http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`, { method: req.method, headers, body, signal: abort.signal });
            const response = await handler.fetch(request);
            res.writeHead(response.status, Object.fromEntries(response.headers));
            if (response.body) {
                for await (const chunk of response.body) {
                    res.write(chunk);
                }
            }
            res.end();
        } catch (e) {
            if (!res.headersSent) {
                res.writeHead(e?.status === 413 ? 413 : 400, { "content-type": "application/json", connection: "close" });
            }
            res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32600, message: e?.status === 413 ? "request body too large" : "bad request" }, id: null }));
        }
    });
    server.keepAliveTimeout = 5_000;
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve(undefined));
    });
    const address = server.address();
    const actual = typeof address === "object" && address ? address.port : port;
    const url = `http://${host.includes(":") ? `[${host}]` : host}:${actual}${ENDPOINT}`;
    context.log.info("started", { version: context.version, transport: "http", url, auth: handler.auth.mode, sources: context.registry.ids().length, files: context.registry.allow.length > 0, output: Boolean(context.output) });
    return {
        port: actual,
        url,
        context,
        async close() {
            const closed = new Promise((resolve) => server.close(() => resolve(undefined)));
            server.closeAllConnections();
            await closed;
            await handler.close();
            await context.close();
        }
    };
}

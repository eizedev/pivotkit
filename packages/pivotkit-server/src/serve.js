/*
 * `pivotkit-server serve`: one HTTP server on one port for the REST service (/api/v1,
 * /openapi.json) and, when pivotkit-mcp is installed and enabled, the MCP endpoint (/mcp, its
 * quick-start page at /), with /healthz (the process answers) and /readyz (it can take work: the
 * issuer loaded, workers up, the output directory writable).
 */

import { ConfigError } from "./config.js";
import { VERSION, createContext } from "./context.js";
import { allowedHosts, hostRefusal } from "./checks.js";
import { isLoopback, serveFetch } from "./listen.js";
import { createRestHandler, REST_BODY_BYTES } from "./rest/handler.js";
import { problem } from "./rest/problem.js";

/** The default port. */
export const DEFAULT_PORT = 3333;

/** The variable of the one static token when auth.tokens is empty. */
export const TOKEN_ENV = "PIVOTKIT_TOKEN";

/** The MCP server's package: imported by name at run time, so pivotkit-server does not depend on it. */
export const MCP_PACKAGE = "pivotkit-mcp";

/**
 * pivotkit-mcp, when it is installed beside this package; null when not.
 * @returns {Promise<any>}
 */
export async function loadMcp() {
    try {
        return await import(MCP_PACKAGE);
    } catch (e) {
        if (e?.code === "ERR_MODULE_NOT_FOUND" && String(e.message).includes("pivotkit-mcp")) {
            return null;
        }
        throw e;
    }
}

/**
 * The combined fetch handler of a set of options: REST and, if enabled, MCP over one context.
 * @param {import("./config.js").ServerOptions} options
 * @param {{ env: Record<string, string | undefined>, stderr: { write(t: string): unknown }, loopback: boolean }} runtime
 * @returns {Promise<import("./listen.js").FetchHandler & { context: any, enable: string[], close(): Promise<void> }>}
 */
export async function createServerHandler(options, runtime) {
    const asked = options.http?.enable;
    const mcpModule = !asked || asked.includes("mcp") ? await loadMcp() : null;
    if (asked?.includes("mcp") && !mcpModule) {
        throw new ConfigError('http.enable: "mcp" needs the package pivotkit-mcp beside pivotkit-server (npm install pivotkit-mcp)');
    }
    const enable = asked ?? ["rest", ...(mcpModule ? ["mcp"] : [])];
    /** @type {any} */
    const context = mcpModule ? await mcpModule.createMcpContext(options, { showPaths: false, stderr: runtime.stderr, tokenEnv: TOKEN_ENV }) : await createContext(options, { showPaths: false, stderr: runtime.stderr, tokenEnv: TOKEN_ENV });
    try {
        const rest = enable.includes("rest") ? await createRestHandler(context, { env: runtime.env, loopback: runtime.loopback }) : null;
        const mcp = enable.includes("mcp") && mcpModule ? await mcpModule.createHttpHandler(context, { env: runtime.env, loopback: runtime.loopback }) : null;
        const hosts = allowedHosts(options);
        const isRest = (request) => rest?.handles(new URL(request.url).pathname) ?? false;

        /** /healthz and /readyz, after the Host check. */
        async function health(request) {
            const path = new URL(request.url).pathname;
            if (request.method !== "GET" || (path !== "/healthz" && path !== "/readyz")) {
                return null;
            }
            const refused = hostRefusal(request, hosts);
            if (refused) {
                return problem("FORBIDDEN_HOST", refused);
            }
            if (path === "/healthz") {
                return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
            }
            const ready = await context.ready();
            return Response.json(ready, { status: ready.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
        }

        return {
            context,
            enable,
            /** @type {import("./listen.js").FetchHandler["precheck"]} */
            async precheck(request, info) {
                if (rest && isRest(request)) {
                    return rest.precheck(request, info);
                }
                if (!mcp) {
                    const refused = hostRefusal(request, hosts);
                    if (refused) {
                        return problem("FORBIDDEN_HOST", refused);
                    }
                    return Number(request.headers.get("content-length") ?? 0) > REST_BODY_BYTES ? problem("BODY_TOO_LARGE", "the body is larger than the service takes") : null;
                }
                return mcp.precheck(request, info);
            },
            /** @type {import("./listen.js").FetchHandler["fetch"]} */
            async fetch(request, info) {
                const early = await health(request);
                if (early) {
                    return early;
                }
                if (rest && isRest(request)) {
                    return rest.fetch(request, info);
                }
                if (mcp) {
                    return mcp.fetch(request);
                }
                const refused = hostRefusal(request, hosts);
                return refused ? problem("FORBIDDEN_HOST", refused) : problem("NOT_FOUND", "no such route; the REST service is at /api/v1 (GET /openapi.json)");
            },
            problem: (status) => problem(status === 413 ? "BODY_TOO_LARGE" : "INVALID_INPUT", status === 413 ? "the body is larger than the service takes" : "the request cannot be read"),
            async close() {
                await rest?.close();
                await mcp?.close();
                await context.close();
            }
        };
    } catch (e) {
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
        listening = await serveFetch(handler, { host, port, bodyBytes: REST_BODY_BYTES, graceMs: options.http?.graceMs });
    } catch (e) {
        await handler.close();
        throw e;
    }
    const url = `http://${host.includes(":") ? `[${host}]` : host}:${listening.port}`;
    handler.context.log.info("started", { version: VERSION, transport: "http", url, serves: handler.enable, auth: options.auth?.mode ?? "none", sources: handler.context.registry.ids().length, output: Boolean(handler.context.output) });
    return {
        port: listening.port,
        url,
        context: handler.context,
        enable: handler.enable,
        async close() {
            await listening.close();
            await handler.close();
        }
    };
}

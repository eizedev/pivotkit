/*
 * The REST service as a fetch handler (Request in, Response out): the routes of REST_ROUTES under
 * /api/v1, the OpenAPI document at /openapi.json and, with OAuth, the Protected Resource Metadata of
 * /api/v1. Every request passes, in this order:
 *
 * 1. the Host check (DNS rebinding);
 * 2. CORS: a request with an Origin must come from rest.cors.origins (none by default); a preflight
 *    (OPTIONS) is answered here, before authentication;
 * 3. the route (404, 405);
 * 4. the refused-token limit of the address, then authentication (bearer only: a cookie, Basic or a
 *    token in the address is never read), the REST audience and required scopes (OAuth);
 * 5. the caller's rate limit and concurrency, the operation's scopes (auth.toolScopes);
 * 6. the body: JSON only, capped, checked against the operation's input schema;
 * 7. present() (policy, output, inline) or, for the file route, the file itself.
 */

import { OperationError, checkInput } from "pivotkit-report/operations";
import { RENDER_FORMATS } from "pivotkit-report";
import { REST_BASE, restResourceOf } from "../config.js";
import { AuthRefusal, bearerOf, resourceMetadataUrlOf } from "../auth.js";
import { allowedHosts, clientAddress, hostRefusal } from "../checks.js";
import { callerOf } from "../context.js";
import { isLoopback } from "../listen.js";
import { present, presentedInput, renderFile } from "../present.js";
import { createLimits } from "./limits.js";
import { openApiDocument } from "./openapi.js";
import { SAFE_HEADERS, json, problem } from "./problem.js";
import { REST_ROUTES } from "./routes.js";

/** The most bytes of a request body. */
export const REST_BODY_BYTES = 2_097_152;

/** The headers a browser may read from an answer (CORS). */
const EXPOSED = "content-disposition, retry-after, www-authenticate";

/** A route's path as a pattern: "{id}" is one path segment. */
const patternOf = (path) => new RegExp(`^${path.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{(\w+)\}/g, "(?<$1>[^/]+)")}$`);
const MATCHERS = REST_ROUTES.map((route) => ({ route, pattern: patternOf(route.path) }));

/** The PRM path of the REST resource. */
const PRM_PATH = `/.well-known/oauth-protected-resource${REST_BASE}`;

/** A file's name without a path, a reserved or a control character, at most 80 characters. */
const safeName = (name) =>
    [...String(name ?? "report")]
        .map((c) => (c.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(c) ? "_" : c))
        .join("")
        .slice(0, 80) || "report";

/** A file's name for Content-Disposition: its own characters as filename*, a plain ASCII copy as filename. */
function disposition(name) {
    const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * Reads a JSON body, at most `max` bytes, while it streams.
 * @param {Request} request
 * @param {number} max
 */
async function readJson(request, max) {
    if (Number(request.headers.get("content-length") ?? 0) > max) {
        throw Object.assign(new Error("too large"), { problem: "BODY_TOO_LARGE" });
    }
    const chunks = [];
    let size = 0;
    if (request.body) {
        const reader = request.body.getReader();
        for (;;) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            size += value.length;
            if (size > max) {
                await reader.cancel().catch(() => undefined);
                throw Object.assign(new Error("too large"), { problem: "BODY_TOO_LARGE" });
            }
            chunks.push(value);
        }
    }
    const text = new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
    if (!text.trim()) {
        return {};
    }
    try {
        return JSON.parse(text);
    } catch {
        throw new OperationError("INVALID_INPUT", "the body is not valid JSON");
    }
}

/**
 * The REST service of a context.
 * @param {any} context  createContext's
 * @param {{ env?: Record<string, string | undefined>, loopback?: boolean }} [runtime]  env: where static tokens are read (default process.env); loopback: whether the server listens on loopback only
 * @returns {Promise<{ fetch(request: Request, info?: { address?: string }): Promise<Response>, precheck(request: Request, info?: { address?: string }): Promise<Response | null>, handles(path: string): boolean, close(): Promise<void>, openapi(): Record<string, unknown> }>}
 */
export async function createRestHandler(context, runtime = {}) {
    const options = context.options;
    const rest = options.rest ?? {};
    const hosts = allowedHosts(options);
    const origins = new Set(rest.cors?.origins ?? []);
    const authOptions = options.auth ?? {};
    const mode = authOptions.mode ?? "none";
    const core = await context.auth({ env: runtime.env, loopback: runtime.loopback ?? isLoopback(options.http?.host ?? "127.0.0.1") });
    const resource = new URL(restResourceOf(options));
    const audience = rest.audience?.length ? rest.audience : [resource.href.replace(/\/$/, ""), resource.href];
    const requiredScopes = rest.requiredScopes ?? authOptions.requiredScopes ?? [];
    const metadataUrl = mode === "oauth" ? resourceMetadataUrlOf(resource) : null;
    const limits = createLimits(rest);
    const trustProxy = options.http?.trustProxy ?? false;
    let document = null;
    const openapi = () => (document ??= openApiDocument({ auth: authOptions, publicUrl: options.http?.publicUrl, issuer: core.metadata?.() ?? null, resource: resource.href, requiredScopes }));

    /** The WWW-Authenticate challenge of a refusal. */
    function challenge(error, description, scopes = requiredScopes) {
        if (mode !== "oauth") {
            return 'Bearer realm="pivotkit"';
        }
        const parts = [`error="${error}"`, `error_description="${description.replace(/["\\]/g, "")}"`, ...(scopes.length ? [`scope="${scopes.join(" ")}"`] : []), `resource_metadata="${metadataUrl}"`];
        return `Bearer ${parts.join(", ")}`;
    }

    /**
     * The verified caller of a request, or the refusal to send.
     * @returns {Promise<{ caller: import("../registry.js").Caller } | { refused: Response }>}
     */
    async function authenticate(request, address) {
        if (mode === "none") {
            return { caller: callerOf("none", undefined) };
        }
        const wait = limits.blocked(address);
        if (wait) {
            return { refused: problem("RATE_LIMITED", "too many refused tokens from this address; wait before you try again", { headers: { "retry-after": String(wait) } }) };
        }
        try {
            let authInfo;
            if (mode === "token") {
                authInfo = await core.check(request);
            } else {
                const bearer = /** @type {{ token?: string, refused?: string }} */ (bearerOf(request));
                if (!bearer.token) {
                    throw new AuthRefusal(401, "invalid_token", bearer.refused ?? "no token");
                }
                authInfo = await core.verify(bearer.token, { audience, resource });
                if (!requiredScopes.every((s) => authInfo.scopes.includes(s))) {
                    return { refused: problem("INSUFFICIENT_SCOPE", `this service needs the scopes ${requiredScopes.join(" ")}`, { headers: { "www-authenticate": challenge("insufficient_scope", "insufficient scope") } }) };
                }
            }
            return { caller: callerOf(mode, authInfo, authOptions) };
        } catch (e) {
            if (!(e instanceof AuthRefusal)) {
                throw e;
            }
            if (e.status === 503) {
                return { refused: problem("AUTH_NOT_READY", e.message, { headers: { "retry-after": "10" } }) };
            }
            limits.failed(address);
            return { refused: problem("INVALID_TOKEN", e.message, { headers: { "www-authenticate": challenge("invalid_token", e.message) } }) };
        }
    }

    /** CORS headers for an allowed origin. */
    const corsOf = (origin) => (origin ? { "access-control-allow-origin": origin, vary: "Origin", "access-control-expose-headers": EXPOSED } : {});

    /** A copy of a response with the CORS headers of the request's origin. */
    function withCors(response, origin) {
        if (!origin) {
            return response;
        }
        const headers = new Headers(response.headers);
        for (const [k, v] of Object.entries(corsOf(origin))) {
            headers.set(k, v);
        }
        return new Response(response.body, { status: response.status, headers });
    }

    /** Whether a path is the REST service's. */
    const handles = (path) => path === REST_BASE || path.startsWith(`${REST_BASE}/`) || path === "/openapi.json" || path === PRM_PATH;

    /** Runs a route for a caller. */
    async function run(match, request, caller, entry) {
        const { route } = match;
        const scopes = authOptions.toolScopes?.[route.operation] ?? [];
        if (caller.scopes !== null && !scopes.every((s) => caller.scopes?.has(s))) {
            return problem("INSUFFICIENT_SCOPE", `${route.operation} needs the scopes ${scopes.join(" ")}`, mode === "oauth" ? { headers: { "www-authenticate": challenge("insufficient_scope", `${route.operation} needs more scopes`, [...requiredScopes, ...scopes]) } } : {});
        }
        /** @type {any} */
        let input = {};
        if (route.method === "POST") {
            const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
            if (type !== "application/json") {
                return problem("UNSUPPORTED_MEDIA_TYPE", "send the input as JSON (Content-Type: application/json)");
            }
            input = await readJson(request, REST_BODY_BYTES);
        } else if (match.params?.id !== undefined) {
            let id;
            try {
                id = decodeURIComponent(match.params.id);
            } catch {
                throw new OperationError("INVALID_INPUT", "the source id is not a valid address part");
            }
            input = { source: id };
        }
        if (input === null || typeof input !== "object" || Array.isArray(input)) {
            throw new OperationError("INVALID_INPUT", "the body is a JSON object");
        }
        entry.source = typeof input.source === "string" ? input.source.slice(0, 80) : undefined;
        // before the schema's pattern says the same in fewer words
        if (typeof input.source === "string" && input.source.startsWith("file:")) {
            throw new OperationError("FILES_NOT_ALLOWED", "this service reads no files by path: use a source id from GET /sources");
        }
        checkInput(presentedInput(route.operation, { files: false }), input);
        if (route.answer === "file") {
            const { result, file } = await renderFile(context, input, caller);
            if (!file) {
                return problem("VIEW_HAS_ERRORS", "the view has errors; fix them (see findings) and render again", { extra: { findings: result.findings } });
            }
            const format = RENDER_FORMATS[result.format] ?? RENDER_FORMATS.xlsx;
            const name = `${safeName(file.name)}.${format.extension}`;
            context.log.download({ operation: route.operation, client: caller.client, source: entry.source, format: result.format, bytes: file.bytes.length });
            return new Response(/** @type {any} */ (file.bytes), {
                status: 200,
                headers: { ...SAFE_HEADERS, "content-type": format.mediaType, "content-disposition": disposition(name), "content-security-policy": "sandbox; default-src 'none'", "content-length": String(file.bytes.length) }
            });
        }
        const { result } = await present(context, route.operation, input, caller, { surface: "rest", inline: rest.inline === true, files: false });
        return json(result);
    }

    /** @param {Request} request @param {{ address?: string }} info */
    async function route(request, info) {
        const url = new URL(request.url);
        const refusedHost = hostRefusal(request, hosts);
        if (refusedHost) {
            context.log.refused({ status: 403, host: String(request.headers.get("host") ?? "").slice(0, 100) });
            return problem("FORBIDDEN_HOST", refusedHost);
        }
        const origin = request.headers.get("origin");
        if (origin && !origins.has(origin)) {
            context.log.refused({ status: 403, origin: origin.slice(0, 100) });
            return problem("FORBIDDEN_ORIGIN", "this origin may not call the service (rest.cors.origins)");
        }
        if (request.method === "OPTIONS" && origin) {
            return new Response(null, { status: 204, headers: { ...corsOf(origin), "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "authorization, content-type", "access-control-max-age": String(rest.cors?.maxAge ?? 600) } });
        }
        const address = clientAddress(request, info.address ?? "", trustProxy);
        const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
        if (path === PRM_PATH) {
            if (mode !== "oauth") {
                return problem("NOT_FOUND", "no such route");
            }
            const metadata = core.metadata();
            if (!metadata) {
                return problem("AUTH_NOT_READY", "", { headers: { "retry-after": "10" } });
            }
            return json({ resource: resource.href, authorization_servers: [metadata.issuer], ...(authOptions.scopesSupported?.length || requiredScopes.length ? { scopes_supported: authOptions.scopesSupported ?? requiredScopes } : {}), resource_name: "pivotkit REST", resource_documentation: "https://pivotkit.eize.dev/reference/rest/" }, 200, { "access-control-allow-origin": "*", "cache-control": "max-age=300" });
        }
        if (path === "/openapi.json") {
            if ((rest.openapi ?? "auth") === "off" || request.method !== "GET") {
                return problem(request.method !== "GET" && rest.openapi !== "off" ? "METHOD_NOT_ALLOWED" : "NOT_FOUND", "no such route");
            }
            if ((rest.openapi ?? "auth") === "auth") {
                const who = await authenticate(request, address);
                if ("refused" in who) {
                    return who.refused;
                }
            }
            return json(openapi());
        }
        const sub = path.startsWith(REST_BASE) ? path.slice(REST_BASE.length) : null;
        const candidates = sub === null ? [] : MATCHERS.map(({ route: r, pattern }) => ({ route: r, params: pattern.exec(sub)?.groups ?? (pattern.test(sub) ? {} : null) })).filter((m) => m.params !== null);
        if (!candidates.length) {
            return problem("NOT_FOUND", "no such route; GET /openapi.json lists them");
        }
        const match = candidates.find((m) => m.route.method === request.method);
        if (!match) {
            return problem("METHOD_NOT_ALLOWED", `use ${[...new Set(candidates.map((m) => m.route.method))].join(" or ")}`, { headers: { allow: [...new Set(candidates.map((m) => m.route.method))].join(", ") } });
        }
        const who = await authenticate(request, address);
        if ("refused" in who) {
            context.log.refused({ status: who.refused.status, path: REST_BASE });
            return who.refused;
        }
        const { caller } = who;
        const wait = limits.take(caller.client);
        if (wait) {
            return problem("RATE_LIMITED", "too many requests; wait before the next", { headers: { "retry-after": String(wait) } });
        }
        if (!limits.enter(caller.client)) {
            return problem("RATE_LIMITED", "too many requests at once; wait for one to finish", { headers: { "retry-after": "1" } });
        }
        const started = Date.now();
        /** @type {Record<string, unknown>} */
        const entry = { operation: match.route.operation, route: `${match.route.method} ${match.route.path}`, client: caller.client, ...(trustProxy ? { address } : {}) };
        let response;
        try {
            response = await run(match, request, caller, entry);
        } catch (e) {
            const error = e instanceof OperationError ? e : null;
            if (e?.problem) {
                response = problem(e.problem, "the body is larger than the service takes");
            } else {
                if (!error) {
                    context.log.error(e, { where: "rest", operation: match.route.operation });
                }
                const code = error?.code ?? "INTERNAL";
                response = problem(code, error ? error.message : "internal error", code === "BUSY" || code === "NOT_READY" ? { headers: { "retry-after": "5" } } : {});
            }
        } finally {
            limits.leave(caller.client);
        }
        const body = response.headers.get("content-type")?.includes("problem") ? await response.clone().json().catch(() => null) : null;
        context.log.request({ ...entry, status: response.status, ...(body?.code ? { code: body.code } : {}), ms: Date.now() - started });
        return response;
    }

    return {
        handles,
        openapi,
        /**
         * The checks a request's headers allow, before its body is read: Host, Origin, the declared
         * size and, for a POST to an operation, the token. A Response to send, or null to go on.
         * @param {Request} request  without its body
         * @param {{ address?: string }} [info]
         */
        async precheck(request, info = {}) {
            const refusedHost = hostRefusal(request, hosts);
            if (refusedHost) {
                return problem("FORBIDDEN_HOST", refusedHost);
            }
            const origin = request.headers.get("origin");
            if (origin && !origins.has(origin)) {
                return problem("FORBIDDEN_ORIGIN", "this origin may not call the service (rest.cors.origins)");
            }
            if (Number(request.headers.get("content-length") ?? 0) > REST_BODY_BYTES) {
                return withCors(problem("BODY_TOO_LARGE", "the body is larger than the service takes"), origin);
            }
            if (request.method === "POST" && new URL(request.url).pathname.startsWith(`${REST_BASE}/`)) {
                const who = await authenticate(request, clientAddress(request, info.address ?? "", trustProxy));
                if ("refused" in who) {
                    context.log.refused({ status: who.refused.status, path: REST_BASE });
                    return withCors(who.refused, origin);
                }
            }
            return null;
        },
        /**
         * @param {Request} request
         * @param {{ address?: string }} [info]  the client's address (listen() gives it), for the limits
         */
        async fetch(request, info = {}) {
            const origin = request.headers.get("origin");
            try {
                const response = await route(request, info);
                return origin && origins.has(origin) ? withCors(response, origin) : response;
            } catch (e) {
                context.log.error(e, { where: "rest" });
                return problem("INTERNAL", "internal error");
            }
        },
        async close() {}
    };
}

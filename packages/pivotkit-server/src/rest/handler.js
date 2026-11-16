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
 * 6. the body: JSON (or, for a caller that may send data, multipart/form-data with a file:
 *    rest/multipart.js), capped (2 MiB; rest.data.maxBytes for a caller that may send data,
 *    limits.js), checked against the operation's input schema;
 * 7. present() (policy, output, inline) or, for the file route, the file itself.
 */

import { OperationError, checkInput } from "pivotkit-report/operations";
import { RENDER_FORMATS } from "pivotkit-report";
import { REST_BASE, restResourceOf } from "../config.js";
import { AuthRefusal, bearerOf, groupRefusal, resourceMetadataUrlOf } from "../auth.js";
import { allowedHosts, clientAddress, hostRefusal } from "../checks.js";
import { callerOf } from "../context.js";
import { BODY_BYTES, SIGNED_IN, isLoopback, peekSignIn, takeSignIn } from "../listen.js";
import { INPUT_DEPTH, jsonDepth, present, presentedInput, renderFile, saveLogFields } from "../present.js";
import { LARGE_BODIES, bodyTooLargeText, createLargeBodies, createLimits, isRestPost, restBodyBytesAt, restBodyBytesFor, restBodyCeilingOf } from "../limits.js";
import { INLINE_ID, checkTableSize, dataRefusal, inlineLogFields, maySendData, restDataOffered } from "../sources/inline.js";
import { readMultipart } from "./multipart.js";
import { openApiDocument } from "./openapi.js";
import { SAFE_HEADERS, json, problem, problemOf, withRequestIdMember } from "./problem.js";
import { callerFields, logUnanswered, refusalReason } from "../log.js";
import { requestId, requestScopeFor, withRequestIdHeader, withRequestScope } from "../request-id.js";
import { offeredScopes } from "../scopes.js";
import { REST_ROUTES } from "./routes.js";

/** The most bytes of a request body (the server's, MCP's too); larger only for a caller that may send data (limits.js restBodyBytesFor). */
export const REST_BODY_BYTES = BODY_BYTES;

/** The headers a browser may read from an answer (CORS). */
const EXPOSED = "content-disposition, retry-after, www-authenticate, x-request-id";

/** A route's path as a pattern: "{id}" is one path segment. */
const patternOf = (path) => new RegExp(`^${path.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{(\w+)\}/g, "(?<$1>[^/]+)")}$`);
const MATCHERS = REST_ROUTES.map((route) => ({ route, pattern: patternOf(route.path) }));

/** The PRM path of the REST resource. */
const PRM_PATH = `/.well-known/oauth-protected-resource${REST_BASE}`;

/** The direction controls a name could hide its real extension with ("gnp.exe" shown as "exe.png"). */
const BIDI = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/;

/** A file's name without a path, a reserved or a control character, at most 80 characters. */
const safeName = (name) =>
    // by code point, so a cut never splits a character in two; a lone surrogate is no character
    [.../** @type {any} */ (String(name ?? "report")).toWellFormed()]
        .slice(0, 80)
        .map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || BIDI.test(c) || '\\/:*?"<>|'.includes(c) ? "_" : c))
        .join("") || "report";

/** A file's name for Content-Disposition: its own characters as filename*, a plain ASCII copy as filename. */
function disposition(name) {
    const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    // RFC 5987: encodeURIComponent leaves ' ( ) * as they are, which attr-char does not allow
    const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Where a request keeps its place for a large body (createLargeBodies): the function that gives it back. */
const LARGE_PLACE = Symbol("large body place");

/**
 * Reads a body, at most `max` bytes, while it streams.
 * @param {Request} request
 * @param {number} max
 * @param {string} [detail]  what a body over it is told
 */
export async function readBytes(request, max, detail) {
    const tooLarge = () => Object.assign(new Error("too large"), { problem: "BODY_TOO_LARGE", ...(detail ? { detail } : {}) });
    if (Number(request.headers.get("content-length") ?? 0) > max) {
        throw tooLarge();
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
                throw tooLarge();
            }
            chunks.push(value);
        }
    }
    return Buffer.concat(chunks);
}

/**
 * Reads a JSON body, at most `max` bytes, while it streams. Its nesting is counted on the bytes before
 * it is parsed: JSON.parse of a body of millions of brackets would hold the thread and gigabytes.
 * @param {Request} request
 * @param {number} max
 * @param {string} [detail]  what a body over `max` is told
 */
async function readJson(request, max, detail) {
    const bytes = await readBytes(request, max, detail);
    if (jsonDepth(bytes, INPUT_DEPTH) > INPUT_DEPTH) {
        throw new OperationError("INVALID_INPUT", `the input is nested deeper than ${INPUT_DEPTH} levels`);
    }
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
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
 * @returns {Promise<{ fetch(request: Request, info?: { address?: string }): Promise<Response>, precheck(request: Request, info?: { address?: string }): Promise<Response | null>, problem(status: 400 | 413, path: string, info?: Record<string | symbol, any>): Response, release(info: Record<string | symbol, any>): void, handles(path: string): boolean, close(): Promise<void>, openapi(): Record<string, unknown> }>}
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
    if (mode === "oauth" && !requiredScopes.length && !Object.keys(authOptions.toolScopes ?? {}).length) {
        context.log.warn("REST: no required scopes (rest.requiredScopes, auth.requiredScopes) and no auth.toolScopes: any token of the issuer for the REST audience gets everything its profile allows");
    }
    const limits = createLimits(rest);
    // the largest body anyone may send: a larger declared size is refused before the token is checked
    const ceiling = restBodyCeilingOf(options);
    // the large bodies read at once, over all callers (limits.js)
    const largeBodies = createLargeBodies(LARGE_BODIES);
    let warnedAddress = false;
    const trustProxy = options.http?.trustProxy ?? false;
    let document = null;
    const openapi = () => (document ??= openApiDocument({ auth: authOptions, publicUrl: options.http?.publicUrl, issuer: core.metadata?.() ?? null, resource: resource.href, requiredScopes, offers: context.offers?.rest }));

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
     * @returns {Promise<{ caller: import("../registry.js").Caller } | { refused: Response, reason: string, client?: string }>}  reason: the refused line's (log.js refusalReason); client: the app of a verified token refused for its person's groups, for the log
     */
    async function authenticate(request, address) {
        if (mode === "none") {
            return { caller: callerOf("none", undefined) };
        }
        // refused tokens are counted per address; without one (a host that gives none) they are not
        // counted at all, rather than every caller sharing one count that a stranger could fill
        if (!address && !warnedAddress) {
            warnedAddress = true;
            context.log.warn("rest: requests come without the client's address (fetch(request, { address })): refused tokens are not limited");
        }
        // a valid token always passes; a refused one from an address over the limit is told to wait
        // (tokens have at least 32 random characters: the limit slows scripts, guessing gets nowhere)
        const wait = address ? limits.blocked(address) : 0;
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
                    return { reason: refusalReason("INSUFFICIENT_SCOPE"), refused: problem("INSUFFICIENT_SCOPE", `this service needs the scopes ${requiredScopes.join(" ")}`, { headers: { "www-authenticate": challenge("insufficient_scope", "insufficient scope") } }) };
                }
                // a person whose groups the token does not carry (auth.groupProfiles): not a bad token
                const refusedGroups = groupRefusal(authOptions, authInfo);
                if (refusedGroups) {
                    return { reason: refusalReason("NOT_ALLOWED"), refused: problem("NOT_ALLOWED", refusedGroups), client: String(authInfo.clientId) };
                }
            }
            return { caller: callerOf(mode, authInfo, authOptions) };
        } catch (e) {
            if (!(e instanceof AuthRefusal)) {
                throw e;
            }
            if (e.status === 503) {
                return { reason: refusalReason("AUTH_NOT_READY"), refused: problem("AUTH_NOT_READY", e.message, { headers: { "retry-after": "10" } }) };
            }
            if (wait) {
                return { reason: refusalReason("RATE_LIMITED"), refused: problem("RATE_LIMITED", "too many refused tokens from this address; wait before you try again", { headers: { "retry-after": String(wait) } }) };
            }
            if (address) {
                limits.failed(address);
            }
            return { reason: refusalReason("INVALID_TOKEN", request), refused: problem("INVALID_TOKEN", e.message, { headers: { "www-authenticate": challenge("invalid_token", e.message) } }) };
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

    /**
     * GET /sources/{id} of a source whose params are missing: the route takes none, so the refusal
     * names the one that does.
     * @param {unknown} e
     * @param {string} id
     */
    function withDescribeHint(e, id) {
        if (!(e instanceof OperationError) || e.code !== "INVALID_INPUT" || !/ needs params\./.test(e.message)) {
            return e;
        }
        return new OperationError("INVALID_INPUT", `${e.message}. GET /sources/{id} takes no params: send them with POST /sources/describe, {"source": ${JSON.stringify(id)}, "params": {...}}`, e.details);
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
        /** @type {Awaited<ReturnType<typeof readMultipart>>["upload"] | null} a file sent in a multipart body */
        let upload = null;
        const takesSource = route.takesSource;
        if (route.method === "POST") {
            const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
            const cap = takesSource ? restBodyBytesFor(options, caller) : BODY_BYTES;
            const detail = bodyTooLargeText(options, cap);
            if (type === "multipart/form-data" && takesSource) {
                if (!maySendData(options, caller, "rest")) {
                    throw dataRefusal("rest", { offered: restDataOffered(options) });
                }
                ({ input, upload } = await readMultipart(await readBytes(request, cap, detail), request.headers.get("content-type") ?? "", route.operation, context.offers?.rest, route.answer === "file"));
            } else if (type !== "application/json") {
                return problem("UNSUPPORTED_MEDIA_TYPE", `send the input as JSON (Content-Type: application/json)${takesSource && maySendData(options, caller, "rest") ? ", or a file with it as multipart/form-data" : ""}`);
            } else {
                input = await readJson(request, cap, detail);
            }
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
            throw new OperationError("INVALID_INPUT", "the body must be a JSON object");
        }
        // the log names a configured source or data sent in the request (how much, never a value);
        // anything else a caller typed (a name, a path) is not kept
        entry.source = context.registry.logName(input.source);
        // the file route takes no save (its input refuses it): its line never says saved
        Object.assign(entry, inlineLogFields(input, upload), route.answer === "file" ? {} : saveLogFields(route.operation, input));
        // before the schema's pattern says the same in fewer words
        if (typeof input.source === "string" && input.source.startsWith("file:")) {
            throw new OperationError("FILES_NOT_ALLOWED", "this service reads no files by path: use a source id from GET /sources");
        }
        // a caller that may not send data is refused as such, before the schema (which offers no
        // data on a server that offers it to nobody) answers with a key it does not know
        if (input.source === INLINE_ID && !maySendData(options, caller, "rest")) {
            throw dataRefusal("rest", { offered: restDataOffered(options) });
        }
        if (!upload) {
            // a table too large is refused by its size, before the schema goes through its cells
            if (input.source === INLINE_ID && maySendData(options, caller, "rest")) {
                checkTableSize(input.data, { limits: context.registry.limits });
            }
            checkInput(presentedInput(route.operation, { files: false, offers: context.offers?.rest, fileRoute: route.answer === "file" }), input);
        }
        if (route.answer === "file") {
            const { result, file } = await renderFile(context, input, caller, { signal: request.signal, ...(upload ? { upload } : {}) });
            if (!file) {
                return problem("VIEW_HAS_ERRORS", "the view has errors; fix them (see findings) and render again", { extra: { findings: result.findings } });
            }
            const format = RENDER_FORMATS[result.format] ?? RENDER_FORMATS.xlsx;
            const name = `${safeName(file.name)}.${format.extension}`;
            context.log.download({ operation: route.operation, ...callerFields(caller), requestId: entry.requestId, source: entry.source, format: result.format, bytes: file.bytes.length, status: 200 });
            return new Response(/** @type {any} */ (file.bytes), {
                status: 200,
                headers: { ...SAFE_HEADERS, "content-type": format.mediaType, "content-disposition": disposition(name), "content-security-policy": "sandbox; default-src 'none'", "content-length": String(file.bytes.length) }
            });
        }
        const { result } = await present(context, route.operation, input, caller, { surface: "rest", inline: rest.inline === true, files: false, signal: request.signal, ...(upload ? { upload } : {}) }).catch((e) => {
            throw match.params?.id !== undefined ? withDescribeHint(e, input.source) : e;
        });
        return json(result);
    }

    /** @param {Request} request @param {{ address?: string, [SIGNED_IN]?: any }} info */
    async function route(request, info) {
        const url = new URL(request.url);
        const refusedHost = hostRefusal(request, hosts);
        if (refusedHost) {
            context.log.refused({ status: 403, reason: refusalReason("FORBIDDEN_HOST"), host: String(request.headers.get("host") ?? "").slice(0, 100) });
            return problem("FORBIDDEN_HOST", refusedHost);
        }
        const origin = request.headers.get("origin");
        if (origin && !origins.has(origin)) {
            context.log.refused({ status: 403, reason: refusalReason("FORBIDDEN_ORIGIN"), origin: origin.slice(0, 100) });
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
            const offered = offeredScopes(options, "rest");
            return json({ resource: resource.href, authorization_servers: [metadata.issuer], ...(offered ? { scopes_supported: offered } : {}), resource_name: "pivotkit REST", resource_documentation: "https://pivotkit.eize.dev/reference/rest/" }, 200, { "cache-control": "max-age=300" });
        }
        if (path === "/openapi.json") {
            if ((rest.openapi ?? "auth") === "off" || request.method !== "GET") {
                return problem(request.method !== "GET" && rest.openapi !== "off" ? "METHOD_NOT_ALLOWED" : "NOT_FOUND", "no such route");
            }
            if ((rest.openapi ?? "auth") === "auth") {
                const who = await authenticate(request, address);
                if ("refused" in who) {
                    context.log.refused({ status: who.refused.status, path: "/openapi.json", reason: who.reason, ...("client" in who ? { client: who.client } : {}) });
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
        // HEAD is GET without the body (node:http leaves it out)
        const method = request.method === "HEAD" ? "GET" : request.method;
        const match = candidates.find((m) => m.route.method === method);
        if (!match) {
            return problem("METHOD_NOT_ALLOWED", `use ${[...new Set(candidates.map((m) => m.route.method))].join(" or ")}`, { headers: { allow: [...new Set(candidates.map((m) => m.route.method))].join(", ") } });
        }
        // the precheck of a POST signed it in already (serveFetch hands it the same info)
        const who = takeSignIn(info) ?? (await authenticate(request, address));
        if ("refused" in who) {
            context.log.refused({ status: who.refused.status, path: REST_BASE, reason: who.reason, ...("client" in who ? { client: who.client } : {}) });
            return who.refused;
        }
        const { caller } = who;
        const wait = limits.take(caller.client);
        if (wait) {
            context.log.refused({ status: 429, path: REST_BASE, reason: refusalReason("RATE_LIMITED"), limit: "rate", ...callerFields(caller) });
            return problem("RATE_LIMITED", "too many requests; wait before the next", { headers: { "retry-after": String(wait) } });
        }
        if (!limits.enter(caller.client)) {
            context.log.refused({ status: 429, path: REST_BASE, reason: refusalReason("RATE_LIMITED"), limit: "concurrency", ...callerFields(caller) });
            return problem("RATE_LIMITED", "too many requests at once; wait for one to finish", { headers: { "retry-after": "1" } });
        }
        const started = Date.now();
        const id = /** @type {string} */ (requestId());
        /** @type {Record<string, unknown>} */
        const entry = { operation: match.route.operation, route: `${match.route.method} ${match.route.path}`, ...callerFields(caller), requestId: id };
        let response;
        try {
            response = await run(match, request, caller, entry);
        } catch (e) {
            const error = e instanceof OperationError ? e : null;
            if (e?.problem) {
                response = problem(e.problem, e.detail ?? "the body is larger than the service takes");
            } else {
                if (!error || (error.code === "INTERNAL" && error.cause)) {
                    context.log.error(error?.cause ?? e, { where: "rest", operation: match.route.operation, requestId: id });
                }
                response = problemOf(error ?? e);
            }
        } finally {
            limits.leave(caller.client);
        }
        const body = response.headers.get("content-type")?.includes("problem") ? await response.clone().json().catch(() => null) : null;
        context.log.request({ ...entry, status: response.status, ...(body?.code ? { code: body.code } : {}), ms: Date.now() - started });
        return response;
    }

    /**
     * Gives back a place for a large body the precheck took for a request, once (fetch when the
     * request ran, problem when its body could not be read, serveFetch when the handler threw).
     * @param {Record<string | symbol, any>} info
     */
    function release(info) {
        const give = info[LARGE_PLACE];
        delete info[LARGE_PLACE];
        give?.();
    }

    return {
        handles,
        openapi,
        /**
         * The checks a request's headers allow, before its body is read: Host, Origin, the declared
         * size and, for a POST to an operation, the token. A Response to send, or null to go on.
         * @param {Request} request  without its body
         * @param {{ address?: string, [SIGNED_IN]?: any }} [info]  serveFetch hands the same object to fetch: the sign-in is kept there
         */
        async precheck(request, info = {}) {
            // the request's scope (its id, trace and addresses), made here or by serveFetch and kept in
            // info for the route: its refusals name it too
            const scope = requestScopeFor(request, info, { trustProxy });
            const answer = await logUnanswered(context.log, scope, await withRequestScope(scope, () => check(request, info)), routeFamily(request));
            return answer && withRequestIdHeader(await withRequestIdMember(answer, scope.id), scope.id);
        },
        /**
         * @param {Request} request
         * @param {{ address?: string, [SIGNED_IN]?: any }} [info]  the client's address (listen() gives it), for the limits
         */
        async fetch(request, info = {}) {
            // the request's id (the precheck's, when it ran): on every log line of the request, in its
            // work (a source's code, an error's details) and in an error's answer
            const scope = requestScopeFor(request, info, { trustProxy });
            try {
                const response = await logUnanswered(context.log, scope, await withRequestScope(scope, () => answer(request, info)), routeFamily(request));
                return withRequestIdHeader(await withRequestIdMember(/** @type {Response} */ (response), scope.id), scope.id);
            } finally {
                // a place for a large body, held since the precheck: given back once the request ran
                release(info);
            }
        },
        release,
        /**
         * The answer to a body that cannot be read (serveFetch's problem): 413 or 400, with the
         * request's id, also on a log line.
         * @param {400 | 413} status
         * @param {string} path  the request's
         * @param {Record<string | symbol, any>} [info]
         */
        problem(status, path, info = {}) {
            const scope = requestScopeFor(null, info, { trustProxy });
            // the body was not read (too large, or the client left): its place is free again
            release(info);
            const cap = restBodyBytesAt(options, peekSignIn(info)?.caller, new URL(path, "http://localhost").pathname);
            withRequestScope(scope, () => context.log.refused({ status, path: REST_BASE, reason: refusalReason(status === 413 ? "BODY_TOO_LARGE" : "INVALID_INPUT"), ...(status === 413 ? { limit: cap } : {}) }));
            return withRequestIdHeader(problem(status === 413 ? "BODY_TOO_LARGE" : "INVALID_INPUT", status === 413 ? bodyTooLargeText(options, cap) : "the request cannot be read", { headers: { connection: "close" }, extra: { requestId: scope.id } }), scope.id);
        },
        async close() {
            limits.close();
        }
    };

    /**
     * The route family of a request, for a refused line written by logUnanswered: /api/v1 or /openapi.json.
     * @param {Request} request
     */
    function routeFamily(request) {
        const path = new URL(request.url).pathname;
        return path.startsWith(REST_BASE) ? { path: REST_BASE } : path.startsWith("/openapi.json") ? { path: "/openapi.json" } : {};
    }

    /**
     * The checks a request's headers allow (precheck's work).
     * @param {Request} request
     * @param {{ address?: string, [SIGNED_IN]?: any }} info
     */
    async function check(request, info) {
        const refusedHost = hostRefusal(request, hosts);
        if (refusedHost) {
            context.log.refused({ status: 403, reason: refusalReason("FORBIDDEN_HOST"), host: String(request.headers.get("host") ?? "").slice(0, 100) });
            return problem("FORBIDDEN_HOST", refusedHost);
        }
        const origin = request.headers.get("origin");
        if (origin && !origins.has(origin)) {
            context.log.refused({ status: 403, reason: refusalReason("FORBIDDEN_ORIGIN"), origin: origin.slice(0, 100) });
            return problem("FORBIDDEN_ORIGIN", "this origin may not call the service (rest.cors.origins)");
        }
        // the declared size: over what anyone may send, refused before the token is checked; over what
        // this caller may send (rest.data.maxBytes only for one that may send data), once it is known
        const length = request.headers.get("content-length");
        const declared = Number(length ?? 0);
        const tooLarge = (cap) => {
            context.log.refused({ status: 413, path: REST_BASE, reason: refusalReason("BODY_TOO_LARGE"), limit: cap, size: declared });
            return withCors(problem("BODY_TOO_LARGE", bodyTooLargeText(options, cap)), origin);
        };
        if (declared > ceiling) {
            return tooLarge(ceiling);
        }
        if (!isRestPost(request)) {
            return declared > BODY_BYTES ? tooLarge(BODY_BYTES) : null;
        }
        const who = await authenticate(request, clientAddress(request, info.address ?? "", trustProxy));
        if ("refused" in who) {
            context.log.refused({ status: who.refused.status, path: REST_BASE, reason: who.reason, ...("client" in who ? { client: who.client } : {}) });
            return withCors(who.refused, origin);
        }
        info[SIGNED_IN] = who;
        const cap = restBodyBytesAt(options, who.caller, new URL(request.url).pathname);
        if (declared > cap) {
            return tooLarge(cap);
        }
        // a body that may be larger than everyone's (declared so, or of no declared size) holds one of
        // the few places for large bodies while it is read and its request runs
        if (cap > BODY_BYTES && (length === null || declared > BODY_BYTES)) {
            const give = largeBodies.take(who.caller.client);
            if (!give) {
                context.log.refused({ status: 503, path: REST_BASE, reason: refusalReason("BUSY") });
                return withCors(problem("BUSY", "", { headers: { "retry-after": "2" }, extra: { retryable: true } }), origin);
            }
            info[LARGE_PLACE] = give;
        }
        return null;
    }

    /**
     * The answer to a request (fetch's work).
     * @param {Request} request
     * @param {{ address?: string, [SIGNED_IN]?: any }} info
     */
    async function answer(request, info) {
        const origin = request.headers.get("origin");
        try {
            const response = await route(request, info);
            return origin && origins.has(origin) ? withCors(response, origin) : response;
        } catch (e) {
            context.log.error(e, { where: "rest" });
            return problem("INTERNAL", "internal error");
        }
    }
}

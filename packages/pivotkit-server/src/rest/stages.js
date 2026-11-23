/*
 * The stages a REST request passes, in order (handler.js holds the service they share):
 *
 * - precheck: before the body is read. The Host and the Origin, the declared size, the sign-in of a
 *   POST, and a place for a body larger than everyone's.
 * - serve: the Host and the Origin again (a host may call fetch without precheck), a CORS preflight,
 *   the service's documents (discovery.js), the route (404, 405), the sign-in, the caller's rate
 *   limit and concurrency, then runOperation, and the request's log line.
 * - runOperation: the operation's scopes, the input (readInput: JSON, or a file with it), the checks
 *   of the input, then the answer: present(), the file (answer-file.js) or the rows (records.js).
 * - failureAnswer: an error of runOperation as the problem it answers.
 */

import { OperationError, checkInput } from "pivotkit-report/operations";
import { OPENAPI_PATH, REST_BASE } from "../config.js";
import { clientAddress, hostRefusal } from "../checks.js";
import { BODY_BYTES, SIGNED_IN, takeSignIn } from "../listen.js";
import { present, presentedInput, saveLogFields } from "../present.js";
import { bodyTooLargeText, isRestPost, limitKeyOf, restBodyBytesAt, restBodyBytesFor } from "../limits.js";
import { INLINE_ID, checkTableSize, dataRefusal, inlineLogFields, maySendData, restDataOffered } from "../sources/inline.js";
import { checkParamsOffered } from "../sources/input.js";
import { callerFields, refusalReason } from "../log.js";
import { requestId } from "../request-id.js";
import { BodyError, readBytes, readJson } from "./body.js";
import { readMultipart } from "./multipart.js";
import { answerFile } from "./answer-file.js";
import { PRM_PATH } from "./discovery.js";
import { json } from "./problem.js";
import { REST_ROUTES } from "./routes.js";

/**
 * What the stages share: made once per handler (handler.js createRestHandler).
 * @typedef {object} RestService
 * @property {any} context  createContext's
 * @property {Record<string, any>} rest  options.rest
 * @property {(code: string, detail: string, more?: any) => Response} problem  bound to the operator's docs
 * @property {(error: unknown, more?: any) => Response} problemOf
 * @property {(log: any, request: Request, refused: string) => Response} hostProblem
 * @property {string[]} hosts  the allowed Host headers
 * @property {Set<string>} origins  rest.cors.origins
 * @property {boolean} trustProxy
 * @property {string} noRoute  the 404's detail (config.js noRouteDetail)
 * @property {number} ceiling  the largest body anyone may send
 * @property {{ take(client: string): (() => void) | null }} largeBodies
 * @property {ReturnType<typeof import("../limits.js").createLimits>} limits
 * @property {ReturnType<typeof import("./sign-in.js").createRestSignIn>} signIn
 * @property {ReturnType<typeof import("./discovery.js").createDiscovery>} discovery
 * @property {{ answer(input: any, caller: any, how: any): Promise<Response> }} records  the rows route's (records.js)
 * @property {"none" | "token" | "oauth"} mode  auth.mode
 * @property {string[]} requiredScopes
 */

/** Where a request keeps its place for a large body (precheck): the function that gives it back. */
export const LARGE_PLACE = Symbol("large body place");

/** The headers a browser may read from an answer (CORS). */
const EXPOSED = "content-disposition, retry-after, www-authenticate, x-request-id";

/** A route's path as a pattern: "{id}" is one path segment. */
const patternOf = (path) => new RegExp(`^${path.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{(\w+)\}/g, "(?<$1>[^/]+)")}$`);
const MATCHERS = REST_ROUTES.map((route) => ({ route, pattern: patternOf(route.path) }));

/** CORS headers for an allowed origin. */
const corsOf = (origin) => (origin ? { "access-control-allow-origin": origin, vary: "Origin", "access-control-expose-headers": EXPOSED } : {});

/** A copy of a response with the CORS headers of the request's origin. */
export function withCors(response, origin) {
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
 * The refusal of a request's Host (DNS rebinding) or Origin (rest.cors.origins), or null.
 * @param {RestService} service
 * @param {Request} request
 */
function refuseHostOrOrigin({ context, problem, hostProblem, hosts, origins }, request) {
    const refusedHost = hostRefusal(request, hosts);
    if (refusedHost) {
        return hostProblem(context.log, request, refusedHost);
    }
    const origin = request.headers.get("origin");
    if (origin && !origins.has(origin)) {
        context.log.refused({ status: 403, reason: refusalReason("FORBIDDEN_ORIGIN"), origin: origin.slice(0, 100) });
        return problem("FORBIDDEN_ORIGIN", "this origin may not call the service (rest.cors.origins)");
    }
    return null;
}

/**
 * What a request's headers allow, before its body is read: a Response to send, or null to go on.
 * @param {RestService} service
 * @param {Request} request
 * @param {Record<string | symbol, any>} info  serveFetch's: the sign-in and the large body's place are kept on it
 */
export async function precheck(service, request, info) {
    const { context, problem, ceiling, signIn, largeBodies } = service;
    const options = context.options;
    const refused = refuseHostOrOrigin(service, request);
    if (refused) {
        return refused;
    }
    const origin = request.headers.get("origin");
    // the declared size: over what anyone may send, refused before the token is checked; over what
    // this caller may send (rest.data.maxBytes only for one that may send data), once it is known
    const length = request.headers.get("content-length");
    const declared = Number(length ?? 0);
    const tooLarge = (cap) => {
        context.log.refused({ status: 413, path: REST_BASE, reason: refusalReason("BODY_TOO_LARGE"), limit: cap, size: declared });
        return withCors(problem("BODY_TOO_LARGE", bodyTooLargeText(options, cap)), origin);
    };
    const address = clientAddress(request, info.address ?? "", service.trustProxy);
    if (declared > ceiling) {
        if (isRestPost(request)) {
            // refused whoever calls; a caller whose token holds is kept as signed in all the same,
            // since listen.js drains a refused body against the cap of the caller the precheck
            // signed in (four times it): a client that reads only after sending its whole body
            // gets this 413 rather than a reset, and a caller without a valid token keeps the
            // small bound
            const who = await signIn.authenticate(request, address);
            if (!("refused" in who)) {
                info[SIGNED_IN] = who;
            }
        }
        return tooLarge(ceiling);
    }
    if (!isRestPost(request)) {
        return declared > BODY_BYTES ? tooLarge(BODY_BYTES) : null;
    }
    const who = await signIn.authenticate(request, address);
    if ("refused" in who) {
        return withCors(signIn.refuse(who, REST_BASE), origin);
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
 * The routes a path under /api/v1 matches, and the one of the request's method.
 * @param {string} path  without a trailing slash
 * @param {string} method  the request's (HEAD is GET without the body: node:http leaves it out)
 */
function matchRoute(path, method) {
    const sub = path.startsWith(REST_BASE) ? path.slice(REST_BASE.length) : null;
    const candidates = sub === null ? [] : MATCHERS.map(({ route, pattern }) => ({ route, params: pattern.exec(sub)?.groups ?? (pattern.test(sub) ? {} : null) })).filter((m) => m.params !== null);
    const wanted = method === "HEAD" ? "GET" : method;
    return { sub, candidates, match: candidates.find((m) => m.route.method === wanted) ?? null };
}

/** The methods of a set of routes, once each. */
const methodsOf = (candidates) => [...new Set(candidates.map((m) => m.route.method))];

/**
 * The answer to a request.
 * @param {RestService} service
 * @param {Request} request
 * @param {Record<string | symbol, any>} info
 */
export async function serve(service, request, info) {
    const { context, rest, problem, signIn, discovery } = service;
    const refused = refuseHostOrOrigin(service, request);
    if (refused) {
        return refused;
    }
    const origin = request.headers.get("origin");
    if (request.method === "OPTIONS" && origin) {
        return new Response(null, { status: 204, headers: { ...corsOf(origin), "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "authorization, content-type", "access-control-max-age": String(rest.cors?.maxAge ?? 600) } });
    }
    const address = clientAddress(request, info.address ?? "", service.trustProxy);
    const url = new URL(request.url);
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
    if (path === PRM_PATH) {
        return discovery.resourceMetadata();
    }
    if (path === OPENAPI_PATH) {
        return serveOpenApi(service, request, address);
    }
    const { sub, candidates, match } = matchRoute(path, request.method);
    if (!candidates.length) {
        return problem("NOT_FOUND", service.noRoute);
    }
    if (!match) {
        const allow = methodsOf(candidates);
        return problem("METHOD_NOT_ALLOWED", `use ${allow.join(" or ")}`, { headers: { allow: allow.join(", ") } });
    }
    // the precheck of a POST signed it in already (serveFetch hands it the same info)
    const who = takeSignIn(info) ?? (await signIn.authenticate(request, address));
    if ("refused" in who) {
        return signIn.refuse(who, REST_BASE);
    }
    const { caller } = who;
    const leave = enterLimits(service, caller);
    if (leave instanceof Response) {
        return leave;
    }
    const started = Date.now();
    const id = /** @type {string} */ (requestId());
    /** @type {Record<string, unknown>} */
    const entry = { operation: match.route.operation, route: `${match.route.method} ${match.route.path}`, ...callerFields(caller), requestId: id };
    let response;
    try {
        response = await runOperation(service, match, request, caller, entry);
    } catch (e) {
        response = failureAnswer(service, e, { match, candidates, sub, id });
    } finally {
        leave();
    }
    const body = response.headers.get("content-type")?.includes("problem") ? await response.clone().json().catch(() => null) : null;
    context.log.request({ ...entry, status: response.status, ...(body?.code ? { code: body.code } : {}), ms: Date.now() - started });
    return response;
}

/**
 * /openapi.json: off (rest.openapi), open, or for a signed-in caller only (the default).
 * @param {RestService} service
 * @param {Request} request
 * @param {string} address
 */
async function serveOpenApi({ rest, problem, signIn, discovery }, request, address) {
    const shown = rest.openapi ?? "auth";
    if (shown === "off" || request.method !== "GET") {
        return problem(request.method !== "GET" && shown !== "off" ? "METHOD_NOT_ALLOWED" : "NOT_FOUND", "no such route");
    }
    if (shown === "auth") {
        const who = await signIn.authenticate(request, address);
        if ("refused" in who) {
            return signIn.refuse(who, OPENAPI_PATH);
        }
    }
    return json(discovery.openapi());
}

/**
 * The caller's rate limit and concurrency, counted per person (a client's people do not share one
 * bucket) with the client's own cap beside it: the function that leaves again, or the refusal.
 * @param {RestService} service
 * @param {import("../registry.js").Caller} caller
 * @returns {(() => void) | Response}
 */
function enterLimits({ context, limits, problem }, caller) {
    const limitKey = limitKeyOf(caller);
    const wait = limits.take(limitKey, caller.client);
    if (wait) {
        context.log.refused({ status: 429, path: REST_BASE, reason: refusalReason("RATE_LIMITED"), limit: limits.rateBy(limitKey, caller.client), ...callerFields(caller) });
        return problem("RATE_LIMITED", "too many requests; wait before the next", { headers: { "retry-after": String(wait) } });
    }
    if (!limits.enter(limitKey, caller.client)) {
        context.log.refused({ status: 429, path: REST_BASE, reason: refusalReason("RATE_LIMITED"), limit: limits.fullBy(limitKey, caller.client), ...callerFields(caller) });
        return problem("RATE_LIMITED", "too many requests at once; wait for one to finish", { headers: { "retry-after": "1" } });
    }
    return () => limits.leave(limitKey, caller.client);
}

/**
 * Runs a route's operation for a caller.
 * @param {RestService} service
 * @param {{ route: any, params: Record<string, string> }} match
 * @param {Request} request
 * @param {import("../registry.js").Caller} caller
 * @param {Record<string, unknown>} entry  the request's log line
 */
async function runOperation(service, match, request, caller, entry) {
    const { context, rest, problem, signIn, records, mode, requiredScopes } = service;
    const options = context.options;
    const { route } = match;
    const scopes = options.auth?.toolScopes?.[route.operation] ?? [];
    if (caller.scopes !== null && !scopes.every((s) => caller.scopes?.has(s))) {
        return problem("INSUFFICIENT_SCOPE", `${route.operation} needs the scopes ${scopes.join(" ")}`, mode === "oauth" ? { headers: { "www-authenticate": signIn.challenge("insufficient_scope", `${route.operation} needs more scopes`, [...requiredScopes, ...scopes]) } } : {});
    }
    const { input, upload } = await readInput(context, match, request, caller);
    // the log names a configured source or data sent in the request (how much, never a value);
    // anything else a caller typed (a name, a path) is not kept
    entry.source = context.registry.logName(input.source);
    if (route.answer === "records") {
        // no operation of the table: its own input, checks and streamed answer (records.js)
        return records.answer(input, caller, { signal: request.signal, entry });
    }
    // the file route takes no save (its input refuses it): its line never says saved
    Object.assign(entry, inlineLogFields(input, upload), route.answer === "file" ? {} : saveLogFields(route.operation, input));
    checkOperationInput(context, route, input, caller, upload);
    if (route.answer === "file") {
        return answerFile(context, input, caller, { signal: request.signal, upload, entry, operation: route.operation, problem });
    }
    const { result } = await present(context, route.operation, input, caller, { surface: "rest", inline: rest.inline === true, files: false, signal: request.signal, ...(upload ? { upload } : {}) }).catch((e) => {
        throw match.params?.id !== undefined ? withDescribeHint(e, input.source) : e;
    });
    return json(result);
}

/**
 * A request's input: a POST's body (JSON, or for a route that takes a source and a caller that may
 * send data, multipart/form-data with a file), a GET's source id from the path, else none.
 * @param {any} context
 * @param {{ route: any, params: Record<string, string> }} match
 * @param {Request} request
 * @param {import("../registry.js").Caller} caller
 * @returns {Promise<{ input: Record<string, any>, upload: Awaited<ReturnType<typeof readMultipart>>["upload"] | null }>}  upload: a file sent in a multipart body
 */
async function readInput(context, { route, params }, request, caller) {
    const options = context.options;
    /** @type {any} */
    let input = {};
    let upload = null;
    if (route.method === "POST") {
        const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
        const cap = route.takesSource ? restBodyBytesFor(options, caller) : BODY_BYTES;
        const detail = bodyTooLargeText(options, cap);
        if (type === "multipart/form-data" && route.takesSource) {
            if (!maySendData(options, caller, "rest")) {
                throw dataRefusal("rest", { offered: restDataOffered(options) });
            }
            ({ input, upload } = await readMultipart(await readBytes(request, cap, detail), request.headers.get("content-type") ?? "", route.operation, context.offers?.rest, route.answer === "file"));
        } else if (type !== "application/json") {
            throw new BodyError("UNSUPPORTED_MEDIA_TYPE", `send the input as JSON (Content-Type: application/json)${route.takesSource && maySendData(options, caller, "rest") ? ", or a file with it as multipart/form-data" : ""}`);
        } else {
            input = await readJson(request, cap, detail);
        }
    } else if (params?.id !== undefined) {
        try {
            input = { source: decodeURIComponent(params.id) };
        } catch {
            throw new OperationError("INVALID_INPUT", "the source id is not a valid address part");
        }
    }
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
        throw new OperationError("INVALID_INPUT", "the body must be a JSON object");
    }
    return { input, upload };
}

/**
 * The checks of an operation's input, in the order whose refusal says most: no file path, data only
 * from a caller that may send it, a table's size before its cells, the params on offer, the schema.
 * A multipart body's input was checked against its own schema (multipart.js).
 * @param {any} context
 * @param {any} route
 * @param {Record<string, any>} input
 * @param {import("../registry.js").Caller} caller
 * @param {unknown} upload
 */
function checkOperationInput(context, route, input, caller, upload) {
    const options = context.options;
    // before the schema's pattern says the same in fewer words
    if (typeof input.source === "string" && input.source.startsWith("file:")) {
        throw new OperationError("FILES_NOT_ALLOWED", "this service reads no files by path: use a source id from GET /sources");
    }
    // a caller that may not send data is refused as such, before the schema (which offers no
    // data on a server that offers it to nobody) answers with a key it does not know
    if (input.source === INLINE_ID && !maySendData(options, caller, "rest")) {
        throw dataRefusal("rest", { offered: restDataOffered(options) });
    }
    if (upload) {
        return;
    }
    // a table too large is refused by its size, before the schema goes through its cells
    if (input.source === INLINE_ID) {
        checkTableSize(input.data, { limits: context.registry.limits });
    }
    checkParamsOffered(route.operation, input, context.offers?.rest);
    checkInput(presentedInput(route.operation, { files: false, offers: context.offers?.rest, fileRoute: route.answer === "file" }), input);
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

/**
 * An error of runOperation as its answer: a BodyError's problem, an operation's problem (an
 * unexpected error logged, answered INTERNAL), or a route's own path read as an id.
 * @param {RestService} service
 * @param {unknown} e
 * @param {{ match: any, candidates: any[], sub: string | null, id: string }} where
 */
function failureAnswer({ context, problem, problemOf }, e, { match, candidates, sub, id }) {
    if (e instanceof BodyError) {
        return problem(e.code, e.message);
    }
    const error = e instanceof OperationError ? e : null;
    if (!error || (error.code === "INTERNAL" && error.cause)) {
        context.log.error(error?.cause ?? e, { where: "rest", operation: match.route.operation, requestId: id });
    }
    // GET /sources/records or /sources/describe: the id is a POST route's own path. A source of that
    // id the caller cannot use answers as that route's wrong method, alike for one there is none of
    // and one hidden from the caller.
    if (error?.code === "SOURCE_NOT_FOUND" && match.route.id === "getSource") {
        const allow = methodsOf(candidates.filter((m) => !m.route.path.includes("{")));
        if (allow.length) {
            return problem("METHOD_NOT_ALLOWED", `use ${allow.join(" or ")} ${REST_BASE}${sub}`, { headers: { allow: allow.join(", ") } });
        }
    }
    return problemOf(error ?? e);
}

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
 * - answer: serve with the CORS headers of an allowed origin; an error no stage caught is INTERNAL.
 * - release: gives back the place for a large body that precheck took.
 */

import { OperationError } from "pivotkit-report/operations";
import { REST_BASE } from "pivotkit-node/rest";
import { OPENAPI_PATH } from "../config.js";
import { clientAddress, hostRefusal } from "../checks.js";
import { BODY_BYTES, SIGNED_IN, takeSignIn } from "../listen.js";
import { present, saveLogFields } from "../present.js";
import { bodyTooLargeText, isRestPost, limitKeyOf, restBodyBytesAt } from "../limits.js";
import { inlineLogFields } from "../sources/inline.js";
import { callerFields, refusalReason } from "../log.js";
import { requestId } from "../request-id.js";
import { BodyError } from "./body.js";
import { checkOperationInput, readInput, withDescribeHint } from "./input.js";
import { matchRoute, methodsOf } from "./match.js";
import { answerFile } from "./answer-file.js";
import { PRM_PATH } from "./discovery.js";
import { json } from "./problem.js";

/**
 * What the stages share: made once per handler (handler.js createRestHandler).
 * @typedef {object} RestService
 * @property {any} context  createContext's
 * @property {Record<string, any>} rest  options.rest
 * @property {import("./problem.js").Problem} problem  bound to the operator's docs
 * @property {(error: unknown, more?: any) => Response} problemOf
 * @property {(log: any, request: Request, refused: string) => Response} hostProblem
 * @property {string[]} hosts  the allowed Host headers
 * @property {Set<string>} origins  rest.cors.origins
 * @property {boolean} trustProxy
 * @property {string} noRoute  the 404's detail (config.js noRouteDetail)
 * @property {number} ceiling  the largest body anyone may send
 * @property {{ take(client: string): (() => void) | null, held(): number }} largeBodies
 * @property {ReturnType<typeof import("../limits.js").createLimits>} limits
 * @property {ReturnType<typeof import("./sign-in.js").createRestSignIn>} signIn
 * @property {ReturnType<typeof import("./discovery.js").createDiscovery>} discovery
 * @property {{ answer(input: any, caller: any, how: any): Promise<Response> }} records  the rows route's (records.js)
 */

/** Where a request keeps its place for a large body (precheck): the function that gives it back. */
const LARGE_PLACE = Symbol("large body place");

/** The headers a browser may read from an answer (CORS). */
const EXPOSED = "content-disposition, retry-after, www-authenticate, x-request-id";

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
        context.log.debug("REST: a large body holds one of the places for large bodies", { held: largeBodies.held() });
    }
    return null;
}

/**
 * The answer to a request.
 * @param {RestService} service
 * @param {Request} request
 * @param {Record<string | symbol, any>} info
 */
async function serve(service, request, info) {
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
        // serveFetch drops a HEAD answer's body
        return discovery.resourceMetadata(request.method);
    }
    if (path === OPENAPI_PATH) {
        return serveOpenApi(service, request, address);
    }
    const routing = matchRoute(path, request.method);
    const { candidates, match } = routing;
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
    const entered = enterLimits(service, caller);
    if ("refused" in entered) {
        return entered.refused;
    }
    const started = Date.now();
    const id = /** @type {string} */ (requestId());
    /** @type {Record<string, unknown>} */
    const entry = { operation: match.route.operation, route: `${match.route.method} ${match.route.path}`, ...callerFields(caller), requestId: id };
    let response;
    try {
        response = await runOperation(service, match, request, caller, entry);
    } catch (e) {
        response = failureAnswer(service, e, routing, id);
    } finally {
        entered.leave();
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
    if (shown === "off") {
        return problem("NOT_FOUND", "no such route");
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
        return problem("METHOD_NOT_ALLOWED", "use GET or HEAD", { headers: { allow: "GET, HEAD" } });
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
 * @returns {{ leave: () => void } | { refused: Response }}
 */
function enterLimits({ context, limits, problem }, caller) {
    const limitKey = limitKeyOf(caller);
    const wait = limits.take(limitKey, caller.client);
    if (wait) {
        context.log.refused({ status: 429, path: REST_BASE, reason: refusalReason("RATE_LIMITED"), limit: limits.rateBy(limitKey, caller.client), ...callerFields(caller) });
        return { refused: problem("RATE_LIMITED", "too many requests; wait before the next", { headers: { "retry-after": String(wait) } }) };
    }
    if (!limits.enter(limitKey, caller.client)) {
        context.log.refused({ status: 429, path: REST_BASE, reason: refusalReason("RATE_LIMITED"), limit: limits.fullBy(limitKey, caller.client), ...callerFields(caller) });
        return { refused: problem("RATE_LIMITED", "too many requests at once; wait for one to finish", { headers: { "retry-after": "1" } }) };
    }
    return { leave: () => limits.leave(limitKey, caller.client) };
}

/**
 * Runs a route's operation for a caller.
 * @param {RestService} service
 * @param {import("./match.js").RouteMatch} match
 * @param {Request} request
 * @param {import("../registry.js").Caller} caller
 * @param {Record<string, unknown>} entry  the request's log line
 */
async function runOperation(service, match, request, caller, entry) {
    const { context, rest, problem, signIn, records } = service;
    const options = context.options;
    const { route } = match;
    const scopes = options.auth?.toolScopes?.[route.operation] ?? [];
    if (caller.scopes !== null && !scopes.every((s) => caller.scopes?.has(s))) {
        return signIn.insufficientScope(route.operation, scopes);
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
 * An error of runOperation as its answer: a BodyError's problem, an operation's problem (an
 * unexpected error logged, answered INTERNAL), or a route's own path read as an id.
 * @param {RestService} service
 * @param {unknown} e
 * @param {import("./match.js").Routing} routing  the request's, with its match
 * @param {string} id  the request's id
 */
function failureAnswer({ context, problem, problemOf }, e, { match, candidates, sub }, id) {
    if (e instanceof BodyError) {
        return problem(e.code, e.message);
    }
    const error = e instanceof OperationError ? e : null;
    if (!error || (error.code === "INTERNAL" && error.cause)) {
        context.log.error(error?.cause ?? e, { where: "rest", operation: match?.route.operation, requestId: id });
    }
    // GET /sources/records or /sources/describe: the id is a POST route's own path. A source of that
    // id the caller cannot use answers as that route's wrong method, alike for one there is none of
    // and one hidden from the caller.
    if (error?.code === "SOURCE_NOT_FOUND" && match?.route.id === "getSource") {
        const allow = methodsOf(candidates.filter((m) => !m.route.path.includes("{")));
        if (allow.length) {
            return problem("METHOD_NOT_ALLOWED", `use ${allow.join(" or ")} ${REST_BASE}${sub}`, { headers: { allow: allow.join(", ") } });
        }
    }
    return problemOf(error ?? e);
}

/**
 * The answer to a request (createRouteHandler's answer): serve's, with the CORS headers of an allowed
 * origin. An error no stage caught is logged and answered INTERNAL.
 * @param {RestService} service
 * @param {Request} request
 * @param {Record<string | symbol, any>} info
 */
export async function answer(service, request, info) {
    const origin = request.headers.get("origin");
    try {
        const response = await serve(service, request, info);
        return origin && service.origins.has(origin) ? withCors(response, origin) : response;
    } catch (e) {
        service.context.log.error(e, { where: "rest" });
        return service.problem("INTERNAL", "internal error");
    }
}

/**
 * Gives back a place for a large body precheck took for a request, once (fetch when the request
 * ran, problem when its body could not be read, serveFetch when the handler threw).
 * @param {Record<string | symbol, any>} info
 */
export function release(info) {
    const give = info[LARGE_PLACE];
    delete info[LARGE_PLACE];
    give?.();
}

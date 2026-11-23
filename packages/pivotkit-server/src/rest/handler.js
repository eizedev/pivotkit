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
 *    token in the address is never read), the REST audience and required scopes (OAuth): sign-in.js;
 * 5. the caller's rate limit and concurrency, the operation's scopes (auth.toolScopes);
 * 6. the body: JSON (body.js) or, for a caller that may send data, multipart/form-data with a file
 *    (multipart.js), capped (2 MiB; rest.data.maxBytes for a caller that may send data, limits.js),
 *    checked against the operation's input schema;
 * 7. present() (policy, output, inline), for the file route the file itself (answer-file.js), or
 *    for the rows route the source's rows, written in pieces (records.js).
 *
 * stages.js runs these steps in this order; this file makes what they share and hands the
 * stages to createRouteHandler.
 */

import { REST_BASE } from "pivotkit-node/rest";
import { OPENAPI_PATH, noRouteDetail, restResourceOf } from "../config.js";
import { resourceMetadataUrlOf } from "../auth.js";
import { allowedHosts } from "../checks.js";
import { isLoopback, peekSignIn } from "../listen.js";
import { LARGE_BODIES, bodyTooLargeText, createLargeBodies, createLimits, restBodyBytesAt, restBodyCeilingOf } from "../limits.js";
import { problemsFor, withRequestIdMember } from "./problem.js";
import { brandingOfContext } from "../branding.js";
import { createRouteHandler } from "../route-handler.js";
import { createRecords } from "../records.js";
import { createRestSignIn } from "./sign-in.js";
import { PRM_PATH, createDiscovery } from "./discovery.js";
import { answer, precheck, release } from "./stages.js";

/**
 * The REST service of a context.
 * @param {any} context  createContext's
 * @param {{ env?: Record<string, string | undefined>, loopback?: boolean }} [runtime]  env: where static tokens are read (default process.env); loopback: whether the server listens on loopback only
 * @returns {Promise<{ fetch(request: Request, info?: { address?: string }): Promise<Response>, precheck(request: Request, info?: { address?: string }): Promise<Response | null>, problem(status: 400 | 413, path: string, info?: Record<string | symbol, any>): Response, release(info: Record<string | symbol, any>): void, handles(path: string): boolean, close(): Promise<void>, openapi(): Record<string, unknown> }>}
 */
export async function createRestHandler(context, runtime = {}) {
    const options = context.options;
    // the operator's name and documentation links (branding.js), on every answer of this handler
    const branding = brandingOfContext(context);
    const { problem, problemOf, hostProblem } = problemsFor(branding.docs);
    const rest = options.rest ?? {};
    const authOptions = options.auth ?? {};
    const mode = authOptions.mode ?? "none";
    const core = await context.auth({ env: runtime.env, loopback: runtime.loopback ?? isLoopback(options.http?.host ?? "127.0.0.1") });
    const resource = new URL(restResourceOf(options));
    const requiredScopes = rest.requiredScopes ?? authOptions.requiredScopes ?? [];
    if (mode === "oauth" && !requiredScopes.length && !Object.keys(authOptions.toolScopes ?? {}).length) {
        context.log.warn("REST: no required scopes (rest.requiredScopes, auth.requiredScopes) and no auth.toolScopes: any token of the issuer for the REST audience gets everything its profile allows");
    }
    const limits = createLimits(rest);
    /** @type {import("./stages.js").RestService} */
    const service = {
        context,
        rest,
        problem,
        problemOf,
        hostProblem,
        hosts: allowedHosts(options),
        origins: new Set(rest.cors?.origins ?? []),
        trustProxy: options.http?.trustProxy ?? false,
        // the 404 of a route nobody serves: it names the service's and the document's full address
        noRoute: noRouteDetail(options),
        // the largest body anyone may send: a larger declared size is refused before the token is checked
        ceiling: restBodyCeilingOf(options),
        // the large bodies read at once, over all callers (limits.js)
        largeBodies: createLargeBodies(LARGE_BODIES),
        limits,
        signIn: createRestSignIn(context, {
            core,
            audience: rest.audience?.length ? rest.audience : [resource.href.replace(/\/$/, ""), resource.href],
            resource,
            requiredScopes,
            mode,
            metadataUrl: mode === "oauth" ? resourceMetadataUrlOf(resource) : null,
            limits,
            slug: branding.slug,
            problem
        }),
        discovery: createDiscovery(context, { core, mode, resource, requiredScopes, branding, problem }),
        // the rows route's places (rest.records.concurrency, one per person)
        records: createRecords(context)
    };

    // the scope, the refused line of an unlogged error, the id in the answer's header and problem body
    const routes = createRouteHandler(context, {
        check: (request, info) => precheck(service, request, info),
        answer: (request, info) => answer(service, request, info),
        familyOf: routeFamily,
        finish: withRequestIdMember,
        // a place for a large body, held since the precheck: given back once the request ran or its body could not be read
        release,
        unreadable: {
            path: REST_BASE,
            limitOf: (path, info) => restBodyBytesAt(options, peekSignIn(info)?.caller, new URL(path, "http://localhost").pathname),
            answer: (status, cap, id) => problem(status === 413 ? "BODY_TOO_LARGE" : "INVALID_INPUT", status === 413 ? bodyTooLargeText(options, cap) : "the request cannot be read", { headers: { connection: "close" }, extra: { requestId: id } })
        }
    });

    return {
        handles,
        openapi: service.discovery.openapi,
        precheck: routes.precheck,
        fetch: routes.fetch,
        release,
        problem: routes.problem,
        async close() {
            limits.close();
        }
    };
}

/** Whether a path is the REST service's. */
const handles = (path) => path === REST_BASE || path.startsWith(`${REST_BASE}/`) || path === OPENAPI_PATH || path === PRM_PATH;

/**
 * The route family of a request, for a refused line written by logUnanswered: /api/v1 or /openapi.json.
 * @param {Request} request
 */
function routeFamily(request) {
    const path = new URL(request.url).pathname;
    return path.startsWith(REST_BASE) ? { path: REST_BASE } : path.startsWith(OPENAPI_PATH) ? { path: OPENAPI_PATH } : {};
}

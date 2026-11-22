/*
 * The handler of one route family (REST, MCP, download links, and the server that hosts them on one
 * port). Every family runs its requests the same way, so this is the one copy of it:
 *
 * - the request's scope (requestScopeFor: its id, trace and addresses), made by serveFetch or here,
 *   kept in `info` so the precheck, the route and the answer to an unreadable body name one id;
 * - a `refused` line for an error answer that wrote no line of its own (logUnanswered);
 * - X-Request-Id on every answer.
 *
 * A family supplies only its own part: `check` (what the headers allow before the body is read),
 * `answer` (the route), and how it answers a body that cannot be read.
 */

import { logUnanswered, refusalReason } from "./log.js";
import { requestScopeFor, withRequestIdHeader, withRequestScope } from "./request-id.js";

/**
 * @typedef {{ address?: string, [key: symbol]: any }} RequestInfo  serveFetch's: `address` is the socket's peer; the same object reaches precheck, fetch and problem
 * @typedef {{ path?: string, notFound?: "info" }} RouteFamily  what a refused line of logUnanswered names
 * @typedef {(request: Request, info: RequestInfo) => Promise<Response | null>} Check
 * @typedef {(request: Request, info: RequestInfo) => Promise<Response>} Answer
 */

/**
 * The handler of a route family. Its log is the context's; with the context's http.trustProxy the
 * forwarded client is the request's address.
 * @param {{ log: any, options: Record<string, any> }} context
 * @param {object} family
 * @param {Check} family.check  the checks before the body is read: a Response to send, or null to go on
 * @param {Answer} family.answer  the route
 * @param {(request: Request) => RouteFamily} [family.familyOf]  the family a refused line names (none: no path)
 * @param {(response: Response, id: string) => Response | Promise<Response>} [family.finish]  the family's last touch on every answer (REST: the id in a problem's body)
 * @param {(info: RequestInfo) => void} [family.release]  gives back what the precheck held, after the route ran or its body could not be read
 * @param {object} [family.unreadable]  the answer to a body that cannot be read (too large, or the client left)
 * @param {string} family.unreadable.path  the path its refused line names
 * @param {(path: string, info: RequestInfo) => number} family.unreadable.limitOf  the body cap a 413 names
 * @param {(status: 400 | 413, limit: number, id: string) => Response} family.unreadable.answer
 */
export function createRouteHandler(context, { check, answer, familyOf = () => ({}), finish = (response) => response, release = () => {}, unreadable }) {
    const log = context.log;
    const trustProxy = context.options.http?.trustProxy ?? false;
    /**
     * Runs a step of the family inside the request's scope, with a refused line for an unlogged error
     * answer and the id on the answer.
     * @param {Check | Answer} step
     * @param {Request} request
     * @param {RequestInfo} info
     */
    async function run(step, request, info) {
        const scope = requestScopeFor(request, info, { trustProxy });
        const response = await logUnanswered(log, scope, await withRequestScope(scope, () => step(request, info)), familyOf(request));
        return response && withRequestIdHeader(await finish(response, scope.id), scope.id);
    }

    return {
        /**
         * The checks a request's headers allow, before its body is read. A Response to send, or null to go on.
         * @param {Request} request  without its body
         * @param {RequestInfo} [info]
         */
        precheck: (request, info = {}) => run(check, request, info),
        /**
         * @param {Request} request
         * @param {RequestInfo} [info]
         * @returns {Promise<Response>}
         */
        async fetch(request, info = {}) {
            try {
                return /** @type {Response} */ (await run(answer, request, info));
            } finally {
                release(info);
            }
        },
        /**
         * The answer to a body that cannot be read (serveFetch's problem): 413 or 400, with the
         * request's id, also on a refused line.
         * @param {400 | 413} status
         * @param {string} path  the request's
         * @param {RequestInfo} [info]
         */
        problem(status, path, info = {}) {
            if (!unreadable) {
                throw new TypeError("this route family has no answer to a body that cannot be read");
            }
            const scope = requestScopeFor(null, info, { trustProxy });
            // the body was not read: what the precheck held is free again
            release(info);
            const limit = unreadable.limitOf(path, info);
            withRequestScope(scope, () => log.refused({ status, path: unreadable.path, reason: refusalReason(status === 413 ? "BODY_TOO_LARGE" : "INVALID_INPUT"), ...(status === 413 ? { limit } : {}) }));
            return withRequestIdHeader(unreadable.answer(status, limit, scope.id), scope.id);
        }
    };
}

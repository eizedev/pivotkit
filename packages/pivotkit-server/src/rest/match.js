/*
 * Which REST route a request is for: its path under /api/v1 against REST_ROUTES ("{id}" is one path
 * segment), then its method. A path that some route matches with another method is a 405.
 */

import { REST_BASE } from "pivotkit-node/rest";
import { REST_ROUTES } from "./routes.js";

/** A route's path as a pattern: "{id}" is one path segment. */
const patternOf = (path) => new RegExp(`^${path.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{(\w+)\}/g, "(?<$1>[^/]+)")}$`);
const MATCHERS = REST_ROUTES.map((route) => ({ route, pattern: patternOf(route.path) }));

/**
 * @typedef {{ route: typeof REST_ROUTES[number], params: Record<string, string> }} RouteMatch
 * @typedef {{ sub: string | null, candidates: RouteMatch[], match: RouteMatch | null }} Routing
 *   sub: the path below /api/v1 (null outside it); candidates: the routes of that path, any method; match: the one of the request's method
 */

/**
 * The routes a path under /api/v1 matches, and the one of the request's method.
 * @param {string} path  without a trailing slash
 * @param {string} method  the request's (HEAD is GET without the body: node:http leaves it out)
 * @returns {Routing}
 */
export function matchRoute(path, method) {
    const sub = path.startsWith(REST_BASE) ? path.slice(REST_BASE.length) : null;
    const candidates = sub === null ? [] : MATCHERS.map(({ route, pattern }) => ({ route, params: pattern.exec(sub)?.groups ?? (pattern.test(sub) ? {} : null) })).filter((m) => m.params !== null);
    const wanted = method === "HEAD" ? "GET" : method;
    return { sub, candidates, match: candidates.find((m) => m.route.method === wanted) ?? null };
}

/**
 * The methods of a set of routes, once each.
 * @param {RouteMatch[]} candidates
 */
export const methodsOf = (candidates) => [...new Set(candidates.map((m) => m.route.method))];

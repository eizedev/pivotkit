/*
 * The request limits of the REST service (rest.rateLimit, rest.concurrency) and of the MCP endpoint
 * (mcp.rateLimit, mcp.concurrency), each its own, in the memory of one process (a second instance behind a load
 * balancer counts on its own): a token bucket per caller (rest.rateLimit.perMinute, .burst), a count
 * of refused tokens per address over the last minute (.failedAuthPerMinute: someone trying tokens is
 * stopped before the next one is checked), and the requests of one caller at once
 * (rest.concurrency). Every map is bounded: the oldest key goes first. And the cap of a request's
 * body (bodyBytesOf): larger only for a REST caller, signed in, that may send data.
 */

import { REST_BASE } from "./config.js";
import { BODY_BYTES, peekSignIn } from "./listen.js";
import { REST_ROUTES } from "./rest/routes.js";
import { bytesText, maySendData, restDataBytesOf, restDataOffered } from "./sources/inline.js";

/** A request's path as the REST routes match it: without a trailing slash. */
const routePath = (pathname) => (pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname);

/** The paths of the POST routes whose operation takes a source: where data may be sent. */
const DATA_PATHS = new Set(REST_ROUTES.filter((r) => r.method === "POST" && r.takesSource).map((r) => `${REST_BASE}${r.path}`));

/**
 * Whether a request is a POST to the REST service (the routes whose body is read; a sign-in comes
 * before it in the precheck).
 * @param {Request} request
 */
export const isRestPost = (request) => request.method === "POST" && new URL(request.url).pathname.startsWith(`${REST_BASE}/`);

/**
 * Whether a path is a POST route of the REST service that takes a source, where a caller may send
 * data and so a larger body.
 * @param {string} pathname
 */
export const isDataPath = (pathname) => DATA_PATHS.has(routePath(pathname));

/**
 * The most bytes of a REST request's body for a caller: rest.data.maxBytes for one that may send data
 * (sources/inline.js), else BODY_BYTES.
 * @param {import("./config.js").ServerOptions} options
 * @param {import("./registry.js").Caller | null | undefined} caller  null: not signed in
 */
export const restBodyBytesFor = (options, caller) => (caller && maySendData(options, caller, "rest") ? restDataBytesOf(options) : BODY_BYTES);

/**
 * The most bytes of a body to a path of the REST service for a caller: restBodyBytesFor on a route
 * that takes a source, BODY_BYTES on any other.
 * @param {import("./config.js").ServerOptions} options
 * @param {import("./registry.js").Caller | null | undefined} caller
 * @param {string} pathname
 */
export const restBodyBytesAt = (options, caller, pathname) => (isDataPath(pathname) ? restBodyBytesFor(options, caller) : BODY_BYTES);

/**
 * What a body over a cap is told: the cap that applied and how a caller may send more.
 * @param {import("./config.js").ServerOptions} options
 * @param {number} cap
 */
export function bodyTooLargeText(options, cap) {
    const more = cap > BODY_BYTES ? "" : restDataOffered(options) ? `; a profile with data: true may send up to ${bytesText(restDataBytesOf(options))} (rest.data.maxBytes)` : "; the operator can allow more to a profile with data: true (rest.data.maxBytes)";
    return `the body is larger than ${bytesText(cap)}, the most this service takes from you${more}`;
}

/** The most large bodies (over BODY_BYTES) the REST service reads at once, whoever sends them. */
export const LARGE_BODIES = 2;

/**
 * The places for large bodies: a caller that may send data holds one while its body is read and its
 * request runs, so a few such callers cannot fill the memory together.
 * @param {number} [size]
 */
export function createLargeBodies(size = LARGE_BODIES) {
    let held = 0;
    return {
        /** A place, or null when all are held: a function that gives it back (once). */
        take() {
            if (held >= size) {
                return null;
            }
            held++;
            let given = false;
            return () => {
                if (!given) {
                    given = true;
                    held--;
                }
            };
        },
        /** The places held (tests). */
        held: () => held
    };
}

/**
 * The most bytes any REST request's body may have, whoever calls: what a body's declared size is
 * checked against before the caller is signed in.
 * @param {import("./config.js").ServerOptions} options
 */
export const restBodyCeilingOf = (options) => (restDataOffered(options) ? Math.max(BODY_BYTES, restDataBytesOf(options)) : BODY_BYTES);

/**
 * The most bytes of a request's body, decided per request after the precheck signed the caller in
 * (serveFetch's bodyBytes; listen.js peekSignIn reads the sign-in): restBodyBytesAt a POST to a
 * REST route that takes a source by a caller the precheck signed in, BODY_BYTES for everything else
 * (the MCP endpoint's too). listen.js's bodyCapOf gives a caller the precheck did not sign in BODY_BYTES whatever this says.
 * @param {import("./config.js").ServerOptions} options
 * @returns {(request: Request, info: Record<string | symbol, any>) => number}
 */
export function bodyBytesOf(options) {
    if (!restDataOffered(options)) {
        return () => BODY_BYTES;
    }
    return (request, info) => {
        return request.method === "POST" ? restBodyBytesAt(options, peekSignIn(info)?.caller, new URL(request.url).pathname) : BODY_BYTES;
    };
}

/** The defaults, the same for both front ends. */
export const REQUEST_LIMITS = Object.freeze({ perMinute: 120, burst: 30, failedAuthPerMinute: 30, concurrency: 4 });

/** The most keys a limiter keeps. */
const KEYS = 10_000;

/** Keeps a map at most KEYS entries, the oldest going first. */
function bound(map) {
    while (map.size > KEYS) {
        map.delete(map.keys().next().value);
    }
}

/**
 * @param {{ rateLimit?: { perMinute?: number, burst?: number, failedAuthPerMinute?: number }, concurrency?: number }} [rest]  rest.* or mcp.*
 * @param {() => number} [now]  milliseconds (tests)
 */
export function createLimits(rest = {}, now = Date.now) {
    const perMinute = rest.rateLimit?.perMinute ?? REQUEST_LIMITS.perMinute;
    const burst = rest.rateLimit?.burst ?? REQUEST_LIMITS.burst;
    const failedPerMinute = rest.rateLimit?.failedAuthPerMinute ?? REQUEST_LIMITS.failedAuthPerMinute;
    const concurrency = rest.concurrency ?? REQUEST_LIMITS.concurrency;
    /** @type {Map<string, { tokens: number, at: number }>} */
    const buckets = new Map();
    /** @type {Map<string, number[]>} */
    const failures = new Map();
    /** @type {Map<string, number>} */
    const running = new Map();

    return {
        /**
         * Takes one request from a caller's bucket; the seconds to wait when it is empty, else 0.
         * @param {string} key
         */
        take(key) {
            const t = now();
            const bucket = buckets.get(key) ?? { tokens: burst, at: t };
            bucket.tokens = Math.min(burst, bucket.tokens + ((t - bucket.at) / 60_000) * perMinute);
            bucket.at = t;
            buckets.delete(key);
            buckets.set(key, bucket);
            bound(buckets);
            if (bucket.tokens < 1) {
                return Math.max(1, Math.ceil(((1 - bucket.tokens) / perMinute) * 60));
            }
            bucket.tokens -= 1;
            return 0;
        },
        /**
         * Whether an address has had too many refused tokens in the last minute; the seconds to wait.
         * @param {string} address
         */
        blocked(address) {
            const t = now();
            const list = (failures.get(address) ?? []).filter((at) => t - at < 60_000);
            if (list.length) {
                failures.set(address, list);
            } else {
                failures.delete(address);
            }
            return list.length >= failedPerMinute ? Math.max(1, Math.ceil((60_000 - (t - list[0])) / 1000)) : 0;
        },
        /** Counts a refused token for an address. */
        failed(address) {
            const list = failures.get(address) ?? [];
            list.push(now());
            failures.delete(address);
            failures.set(address, list.slice(-failedPerMinute));
            bound(failures);
        },
        /**
         * Starts a request of a caller, or false when it has `concurrency` running.
         * @param {string} key
         */
        enter(key) {
            const n = running.get(key) ?? 0;
            if (n >= concurrency) {
                return false;
            }
            running.set(key, n + 1);
            return true;
        },
        /** Ends a request of a caller. */
        leave(key) {
            const n = (running.get(key) ?? 1) - 1;
            if (n > 0) {
                running.set(key, n);
            } else {
                running.delete(key);
            }
        }
    };
}

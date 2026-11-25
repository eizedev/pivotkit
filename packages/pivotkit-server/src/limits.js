/*
 * The request limits of the REST service (rest.rateLimit, rest.concurrency) and of the MCP endpoint
 * (mcp.rateLimit, mcp.concurrency), each its own, in the memory of one process (a second instance behind a load
 * balancer counts on its own): a token bucket per person, or per client for a token without a
 * person (limitKeyOf; rest.rateLimit.perMinute, .burst), a count
 * of refused tokens per address over the last minute (.failedAuthPerMinute: someone trying tokens is
 * stopped before the next one is checked), and the requests of one caller at once
 * (rest.concurrency; a client's people together at most REQUEST_LIMITS.clientShare times that). Every map is bounded: the oldest key goes first; and every minute (an unref'd
 * timer, cleared by close()) the entries that no longer count are dropped: an address whose refused
 * tokens are all older than a minute, a caller whose bucket has filled up again (a full bucket is the
 * same as none). So an address is kept at most two minutes after its last refused token, a caller's
 * name at most until its bucket is full again plus a minute. And the cap of a request's
 * body (bodyBytesOf): larger only for a REST caller, signed in, that may send data.
 */

import { identityKey } from "./auth.js";
import { REST_BASE } from "pivotkit-node/rest";
import { BODY_BYTES, peekSignIn } from "./listen.js";
import { REST_ROUTES } from "./rest/routes.js";
import { maySendData, restDataBytesOf, restDataOffered } from "./sources/inline.js";
import { bytesText } from "./text.js";

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
 * A few places, at most `size` held at once and one per holder: the large bodies (a caller that may
 * send data holds one while its body is read and its request runs, so a few such callers cannot fill
 * the memory together) and the rows requests (records.js: one per person while its answer is written).
 * @param {number} size
 */
export function createPlaces(size) {
    /** @type {Set<string>} the holders */
    const holders = new Set();
    return {
        /**
         * A place for a holder, or null when all are held or the holder holds one: a function that
         * gives it back (once).
         * @param {string} holder  a caller's limit key (large bodies), a person's identity key (rows)
         */
        take(holder) {
            if (holders.size >= size || holders.has(holder)) {
                return null;
            }
            holders.add(holder);
            let given = false;
            return () => {
                if (!given) {
                    given = true;
                    holders.delete(holder);
                }
            };
        },
        /** The places held (tests). */
        held: () => holders.size
    };
}

/**
 * The places for large bodies (createPlaces), by the caller's limit key (limitKeyOf: the person, or
 * the client of a token without one), so one caller cannot take every place itself.
 * @param {number} [size]
 */
export const createLargeBodies = (size = LARGE_BODIES) => createPlaces(size);

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

/**
 * The defaults, the same for both front ends. clientShare: the requests of all the people of one
 * client (an OAuth client id, a static token) at once, as a multiple of concurrency, so a client
 * cannot run unlimited requests through many people.
 */
export const REQUEST_LIMITS = Object.freeze({ perMinute: 120, burst: 30, failedAuthPerMinute: 30, concurrency: 4, clientShare: 8 });

/**
 * Who a caller's rate and concurrency limits count for: the person (identityKey: an OAuth token's
 * issuer and subject, a static token's name, "local"), else the client (an OAuth token without a
 * usable subject). Prefixed, so a client's name never meets a person's key.
 * @param {import("./registry.js").Caller} caller
 */
export function limitKeyOf(caller) {
    const person = identityKey(caller);
    return person ? `person:${person}` : `client:${caller.client}`;
}

/** The most keys a limiter keeps. */
const KEYS = 10_000;

/** Keeps a map at most KEYS entries, the oldest going first. */
function bound(map) {
    while (map.size > KEYS) {
        map.delete(map.keys().next().value);
    }
}

/** How often the entries that no longer count are dropped: a minute. */
const PRUNE_MS = 60_000;

/**
 * @param {{ rateLimit?: { perMinute?: number, burst?: number, failedAuthPerMinute?: number }, concurrency?: number }} [rest]  rest.* or mcp.*
 * @param {() => number} [now]  milliseconds (tests)
 * @param {{ pruneEveryMs?: number }} [how]  pruneEveryMs: how often entries that no longer count are dropped (tests)
 */
export function createLimits(rest = {}, now = Date.now, how = {}) {
    const perMinute = rest.rateLimit?.perMinute ?? REQUEST_LIMITS.perMinute;
    const burst = rest.rateLimit?.burst ?? REQUEST_LIMITS.burst;
    const failedPerMinute = rest.rateLimit?.failedAuthPerMinute ?? REQUEST_LIMITS.failedAuthPerMinute;
    const concurrency = rest.concurrency ?? REQUEST_LIMITS.concurrency;
    const clientConcurrency = concurrency * REQUEST_LIMITS.clientShare;
    /** @type {Map<string, { tokens: number, at: number }>} */
    const buckets = new Map();
    /** @type {Map<string, { tokens: number, at: number }>} each client's bucket, over all its people (clientShare times a person's) */
    const clientBuckets = new Map();
    const share = REQUEST_LIMITS.clientShare;
    /**
     * Takes one from a bucket of `map` (rate per minute, at most `size`); the seconds to wait, else 0.
     * @param {Map<string, { tokens: number, at: number }>} map
     */
    const takeFrom = (map, key, rate, size, t) => {
        const bucket = map.get(key) ?? { tokens: size, at: t };
        bucket.tokens = Math.min(size, bucket.tokens + ((t - bucket.at) / 60_000) * rate);
        bucket.at = t;
        map.delete(key);
        map.set(key, bucket);
        bound(map);
        return bucket.tokens < 1 ? Math.max(1, Math.ceil(((1 - bucket.tokens) / rate) * 60)) : 0;
    };
    /** @type {Map<string, number[]>} */
    const failures = new Map();
    /** @type {Map<string, number>} */
    const running = new Map();
    /** @type {Map<string, number>} the requests running per client, over all its people */
    const runningOfClient = new Map();
    const add = (map, key, n) => {
        const left = (map.get(key) ?? 0) + n;
        if (left > 0) {
            map.set(key, left);
        } else {
            map.delete(key);
        }
    };

    /** Drops the addresses without a refused token in the last minute and the buckets that are full again. */
    function prune() {
        const t = now();
        for (const [address, list] of failures) {
            if (!list.some((at) => t - at < 60_000)) {
                failures.delete(address);
            }
        }
        for (const [key, bucket] of buckets) {
            if (bucket.tokens + ((t - bucket.at) / 60_000) * perMinute >= burst) {
                buckets.delete(key);
            }
        }
        for (const [key, bucket] of clientBuckets) {
            if (bucket.tokens + ((t - bucket.at) / 60_000) * perMinute * share >= burst * share) {
                clientBuckets.delete(key);
            }
        }
    }
    const pruning = setInterval(prune, how.pruneEveryMs ?? PRUNE_MS);
    pruning.unref?.();

    return {
        /**
         * Takes one request from a caller's bucket and from its client's (clientShare times as large,
         * so people of one client, a subject claim a user could change included, cannot take without
         * end); the seconds to wait when either is empty, else 0. A refused request takes from neither.
         * @param {string} key  limitKeyOf's
         * @param {string} [client]  the caller's client (default: the key)
         */
        take(key, client = key) {
            const t = now();
            const own = takeFrom(buckets, key, perMinute, burst, t);
            const all = takeFrom(clientBuckets, client, perMinute * share, burst * share, t);
            if (own || all) {
                return Math.max(own, all);
            }
            /** @type {{ tokens: number }} */ (buckets.get(key)).tokens -= 1;
            /** @type {{ tokens: number }} */ (clientBuckets.get(client)).tokens -= 1;
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
         * Starts a request of a caller, or false when it has `concurrency` running or its client has
         * `concurrency` times REQUEST_LIMITS.clientShare running over all its people.
         * @param {string} key  limitKeyOf's
         * @param {string} [client]  the caller's client (default: the key)
         */
        enter(key, client = key) {
            if ((running.get(key) ?? 0) >= concurrency || (runningOfClient.get(client) ?? 0) >= clientConcurrency) {
                return false;
            }
            add(running, key, 1);
            add(runningOfClient, client, 1);
            return true;
        },
        /**
         * Which bucket a refused take met: "rate" (the caller's own) or "clientRate" (its client's
         * people together), for the refusal's log line.
         * @param {string} key
         * @param {string} [client]
         * @returns {"rate" | "clientRate"}
         */
        rateBy(key, client = key) {
            return (buckets.get(key)?.tokens ?? burst) < 1 ? "rate" : (clientBuckets.get(client)?.tokens ?? burst * share) < 1 ? "clientRate" : "rate";
        },
        /**
         * Which limit a refused enter met: "concurrency" (the caller's own) or "clientShare" (its
         * client's people together), for the refusal's log line.
         * @param {string} key
         * @param {string} [client]
         * @returns {"concurrency" | "clientShare"}
         */
        fullBy(key, client = key) {
            return (running.get(key) ?? 0) >= concurrency ? "concurrency" : (runningOfClient.get(client) ?? 0) >= clientConcurrency ? "clientShare" : "concurrency";
        },
        /** Ends a request of a caller (enter's key and client). */
        leave(key, client = key) {
            add(running, key, -1);
            add(runningOfClient, client, -1);
        },
        /** How many addresses and callers are kept (tests). */
        size: () => ({ addresses: failures.size, callers: buckets.size }),
        /** Drops now what the timer drops (tests). */
        prune,
        /** Stops dropping entries on a timer (the server closes). */
        close() {
            clearInterval(pruning);
        }
    };
}

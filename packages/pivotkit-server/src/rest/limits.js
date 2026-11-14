/*
 * The REST service's request limits, in the memory of one process (a second instance behind a load
 * balancer counts on its own): a token bucket per caller (rest.rateLimit.perMinute, .burst), a count
 * of refused tokens per address over the last minute (.failedAuthPerMinute: someone trying tokens is
 * stopped before the next one is checked), and the requests of one caller at once
 * (rest.concurrency). Every map is bounded: the oldest key goes first.
 */

/** The defaults. */
export const REST_LIMITS = Object.freeze({ perMinute: 120, burst: 30, failedAuthPerMinute: 30, concurrency: 4 });

/** The most keys a limiter keeps. */
const KEYS = 10_000;

/** Keeps a map at most KEYS entries, the oldest going first. */
function bound(map) {
    while (map.size > KEYS) {
        map.delete(map.keys().next().value);
    }
}

/**
 * @param {import("../config.js").RestOptions} [rest]
 * @param {() => number} [now]  milliseconds (tests)
 */
export function createLimits(rest = {}, now = Date.now) {
    const perMinute = rest.rateLimit?.perMinute ?? REST_LIMITS.perMinute;
    const burst = rest.rateLimit?.burst ?? REST_LIMITS.burst;
    const failedPerMinute = rest.rateLimit?.failedAuthPerMinute ?? REST_LIMITS.failedAuthPerMinute;
    const concurrency = rest.concurrency ?? REST_LIMITS.concurrency;
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

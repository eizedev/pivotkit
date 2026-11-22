/*
 * The options of code sources (a library host's sources.<id>.load).
 *
 * The keys this feature adds, by slot (options/shared.js SLOTS), and the rules between them; the
 * defaults of the shared keys ttl, maxStale and timeMs (options/base.js) for a code source. A key is
 * declared here once, never also in config.js or another fragment (options/index.js refuses a second
 * declaration).
 */

import { LOAD_CACHE, OWNER_SHARE } from "../sources/cache.js";
import { ConfigError, throwRange } from "./shared.js";

export const NAME = "code";

/** @type {Readonly<Partial<Record<import("./shared.js").Slot, Record<string, any>>>>} */
export const KEYS = Object.freeze({
    top: { sourceCache: { object: { maxMb: "integer" } } },
    source: { cacheShared: "boolean", perPerson: "boolean" }
});

/** The megabytes (MiB) the process keeps of loaded code and HTTP source data by default: sources/cache.js LOAD_CACHE. */
export const SOURCE_CACHE_MB = LOAD_CACHE.bytes / 1_048_576;

/** The largest sourceCache.maxMb: 64 GiB. */
export const SOURCE_CACHE_MAX_MB = 65_536;

/**
 * The bytes the process keeps of loaded code and HTTP source data (sourceCache.maxMb), and the
 * largest table one owner (a person, or a shared source) may have kept: a quarter of them.
 * @param {import("../config.js").ServerOptions} options
 */
export function sourceCacheOf(options) {
    const bytes = (options.sourceCache?.maxMb ?? SOURCE_CACHE_MB) * 1_048_576;
    return { bytes, share: Math.floor(bytes * OWNER_SHARE) };
}

/**
 * A code source's defaults: the longest load (ms), how long a load is reused (seconds; null: only
 * while version() gives the same), how long last good data may stand in after a transient failure
 * (seconds; 0: never), and whether one copy of the data serves all callers. A source with perPerson
 * (its data differs per caller) counts as closed for links (delivery.js): only the person who asked
 * can open its reports.
 */
export const CODE_DEFAULTS = Object.freeze({ timeMs: 30_000, ttl: /** @type {number | null} */ (null), maxStale: 3600, cacheShared: false });

/** The longest timeMs of a code source: ten minutes (a caller waits that long at most). */
export const CODE_TIME_MAX = 600_000;

/**
 * Checks the rules between these keys; throws ConfigError.
 * @param {import("../config.js").ServerOptions} options
 * @param {import("./shared.js").RangeProblem} [range]  where a value out of its range goes (validateOptions collects them)
 */
export function validate(options, range = throwRange) {
    const maxMb = options.sourceCache?.maxMb;
    if (maxMb !== undefined && (maxMb < 1 || maxMb > SOURCE_CACHE_MAX_MB)) {
        range(`sourceCache.maxMb: from 1 to ${SOURCE_CACHE_MAX_MB}`);
    }
    for (const [id, source] of Object.entries(options.sources ?? {})) {
        if (/** @type {any} */ (source).cacheShared !== undefined && !source.load) {
            throw new ConfigError(`sources.${id}.cacheShared: only a code source (load) takes cacheShared`);
        }
        if (/** @type {any} */ (source).perPerson !== undefined && !source.load) {
            throw new ConfigError(`sources.${id}.perPerson: only a code source (load) takes perPerson`);
        }
        if (/** @type {any} */ (source).perPerson === true && /** @type {any} */ (source).cacheShared === true) {
            throw new ConfigError(`sources.${id}.perPerson: a source with cacheShared serves one copy to all callers, so its data is not per person; leave out one of them`);
        }
        if (!source.load) {
            continue;
        }
        if (source.timeMs !== undefined && source.timeMs > CODE_TIME_MAX) {
            range(`sources.${id}.timeMs: at most ${CODE_TIME_MAX} (ten minutes)`);
        }
    }
}

/*
 * The options of code sources (a library host's sources.<id>.load).
 *
 * The keys this feature adds, by slot (options/shared.js SLOTS), and the rules between them; the
 * defaults of the shared keys ttl, maxStale and timeMs (options/base.js) for a code source. A key is
 * declared here once, never also in config.js or another fragment (options/index.js refuses a second
 * declaration).
 */

import { ConfigError } from "./shared.js";

export const NAME = "code";

/** @type {Readonly<Partial<Record<import("./shared.js").Slot, Record<string, any>>>>} */
export const KEYS = Object.freeze({
    source: { cacheShared: "boolean" }
});

/**
 * A code source's defaults: the longest load (ms), how long a load is reused (seconds; null: only
 * while version() gives the same), how long last good data may stand in after a transient failure
 * (seconds; 0: never), and whether one copy of the data serves all callers.
 */
export const CODE_DEFAULTS = Object.freeze({ timeMs: 30_000, ttl: /** @type {number | null} */ (null), maxStale: 3600, cacheShared: false });

/** The longest timeMs of a code source: ten minutes (a caller waits that long at most). */
export const CODE_TIME_MAX = 600_000;

/**
 * Checks the rules between these keys; throws ConfigError.
 * @param {import("../config.js").ServerOptions} options
 */
export function validate(options) {
    for (const [id, source] of Object.entries(options.sources ?? {})) {
        if (/** @type {any} */ (source).cacheShared !== undefined && !source.load) {
            throw new ConfigError(`sources.${id}.cacheShared: only a code source (load) takes cacheShared`);
        }
        if (!source.load) {
            continue;
        }
        if (source.timeMs !== undefined && source.timeMs > CODE_TIME_MAX) {
            throw new ConfigError(`sources.${id}.timeMs: at most ${CODE_TIME_MAX} (ten minutes)`);
        }
    }
}

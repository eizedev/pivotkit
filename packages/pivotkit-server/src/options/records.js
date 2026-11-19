/*
 * The options of the rows route (POST /api/v1/sources/records, records.js). Three keys share the
 * name `records`; they govern one route:
 *
 * - `policy.profiles.<p>.records`: the source ids a profile may read the rows of. Off by default.
 *   The server's policy, a source's policy and files.policy do not take it: the right is a
 *   profile's, per source.
 * - `rest.records`: the server's bounds of the route: rows and cells per answer, rows requests at
 *   once, the idle time of a reader and the time to write an answer.
 * - `sources.<id>.records.maxRows`: a lower row limit for one source, never above the server's.
 *
 * A key is declared here once, never also in config.js or another fragment (options/index.js refuses a
 * second declaration).
 */

import { ConfigError } from "./shared.js";
import { COMPUTE_DEFAULTS } from "../config.js";

export const NAME = "records";

/** @type {Readonly<Partial<Record<import("./shared.js").Slot, Record<string, any>>>>} */
export const KEYS = Object.freeze({
    policy: { records: "strings" },
    rest: { records: { object: { maxRows: "integer", maxCells: "integer", concurrency: "integer", idleMs: "integer", writeMs: "integer" } } },
    source: { records: { object: { maxRows: "integer" } } }
});

/**
 * The route's bounds where the operator sets none. Each is a first guess until real row counts and
 * the measurement in the docs (docs/reference/rest.md, "Sizing") say more.
 */
export const RECORDS_DEFAULTS = Object.freeze({ maxRows: 50_000, maxCells: 1_000_000, concurrency: 1, idleMs: 30_000, writeMs: 10_000 });

/** The largest value each bound takes: well above a source's rows (limits.rows) and an HTTP request's life. */
export const RECORDS_MAX = Object.freeze({ maxRows: 10_000_000, maxCells: 100_000_000, concurrency: 64, idleMs: 600_000, writeMs: 600_000 });

/** The least idle time: a reader that reads a piece within it keeps its slot. */
export const RECORDS_IDLE_MIN = 1_000;

/** The least time to write an answer. */
export const RECORDS_WRITE_MIN = 1_000;

/** The server's compute.timeMs: the whole rows job ends within it. */
const computeTimeOf = (options) => options.compute?.timeMs ?? COMPUTE_DEFAULTS.timeMs;

/**
 * The route's bounds for a server: the operator's over the defaults. writeMs by default is never
 * above compute.timeMs, which ends the whole job anyway.
 * @param {import("../config.js").ServerOptions} options
 * @returns {{ maxRows: number, maxCells: number, concurrency: number, idleMs: number, writeMs: number }}
 */
export const recordsBoundsOf = (options) => ({ ...RECORDS_DEFAULTS, writeMs: Math.min(RECORDS_DEFAULTS.writeMs, computeTimeOf(options)), ...(options.rest?.records ?? {}) });

/**
 * The row limit of one source: the server's, or the source's own where it is lower.
 * @param {import("../config.js").ServerOptions} options
 * @param {string} id
 */
export function sourceMaxRowsOf(options, id) {
    const server = recordsBoundsOf(options).maxRows;
    const own = Object.hasOwn(options.sources ?? {}, id) ? /** @type {any} */ (options.sources?.[id])?.records?.maxRows : undefined;
    return own === undefined ? server : Math.min(own, server);
}

/**
 * The source ids a profile may read the rows of (an empty list without the right).
 * @param {import("../config.js").ServerOptions} options
 * @param {string | null | undefined} profile
 * @returns {string[]}
 */
export function recordsOfProfile(options, profile) {
    const profiles = options.policy?.profiles ?? {};
    if (!profile || !Object.hasOwn(profiles, profile)) {
        return [];
    }
    return [.../** @type {any} */ (profiles[profile]).records ?? []];
}

/**
 * Checks the rules between these keys; throws ConfigError.
 * @param {import("../config.js").ServerOptions} options
 */
export function validate(options) {
    const places = /** @type {Array<[string, any]>} */ ([["policy", options.policy], ["files.policy", options.files?.policy], ...Object.entries(options.sources ?? {}).map(([id, source]) => [`sources.${id}.policy`, source.policy])]);
    for (const [path, policy] of places) {
        if (policy?.records !== undefined) {
            throw new ConfigError(`${path}.records: the rows of a source are granted per profile (policy.profiles.<name>.records), never to every caller or per source`);
        }
    }
    const bounds = options.rest?.records ?? {};
    for (const key of /** @type {Array<keyof typeof RECORDS_MAX>} */ (["maxRows", "maxCells", "concurrency", "idleMs", "writeMs"])) {
        const value = bounds[key];
        const least = key === "idleMs" ? RECORDS_IDLE_MIN : key === "writeMs" ? RECORDS_WRITE_MIN : 1;
        if (value !== undefined && (value < least || value > RECORDS_MAX[key])) {
            throw new ConfigError(`rest.records.${key}: from ${least} to ${RECORDS_MAX[key]}`);
        }
    }
    if (bounds.writeMs !== undefined && bounds.writeMs > computeTimeOf(options)) {
        throw new ConfigError(`rest.records.writeMs: ${bounds.writeMs} is above compute.timeMs (${computeTimeOf(options)}), which cuts the answer first`);
    }
    const server = recordsBoundsOf(options).maxRows;
    for (const [id, source] of Object.entries(options.sources ?? {})) {
        const own = /** @type {any} */ (source).records?.maxRows;
        if (own === undefined) {
            continue;
        }
        if (own < 1) {
            throw new ConfigError(`sources.${id}.records.maxRows: 1 or more`);
        }
        if (own > server) {
            throw new ConfigError(`sources.${id}.records.maxRows: ${own} is above the server's limit rest.records.maxRows (${server}); a source's limit can only be lower`);
        }
    }
}

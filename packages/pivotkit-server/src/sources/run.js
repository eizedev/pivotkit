/*
 * How a source's data is loaded in the main thread (a code source's load(), an HTTP source's
 * requests): one place for the time limit, coalescing, the load limits, the kept data and the last
 * good data, so every kind of source behaves the same.
 *
 * - Time limit: the load's signal is aborted at `timeMs`; the call answers SOURCE_UNAVAILABLE
 *   (retryable) or last good data. A load that ignores the abort runs on and keeps its slot until it
 *   ends; its result is kept under its key, unless a refusal was recorded for that key meanwhile.
 * - Coalescing: one load in flight per key; callers with the same key share it.
 * - Load limits: at most LOAD_LIMITS.perSource loads in flight per source, LOAD_LIMITS.perIdentity of
 *   them for one identity, so one person trying many values cannot take every slot.
 * - Kept data (sources/cache.js): reused while the source's version is the same, or for `ttl` seconds.
 * - Last good data: after a transient failure only (this module's time limit, a network error, a
 *   SourceError with transient: true), for at most `maxStale` seconds. Any other failure answers at
 *   once and drops what was kept for its key, so a lost access is never covered by the cache.
 *
 * A key of null (a caller without an identity) keeps nothing, shares no load and gets no last good
 * data. A source's own errors never reach a caller with their words: a SourceError gives its code and
 * its publicMessage (shown only for codes below 500), anything else is SOURCE_UNAVAILABLE.
 */

import { cleanText } from "pivotkit-core/import";
import { OperationError } from "pivotkit-report/operations";
import { errorDetails } from "../request-id.js";
import { createLoadCache } from "./cache.js";

/** How many loads run at once per source, and per identity within a source. */
export const LOAD_LIMITS = Object.freeze({ perSource: 4, perIdentity: 2 });

/** The codes a source may answer with a SourceError. */
export const SOURCE_ERROR_CODES = Object.freeze(["NOT_ALLOWED", "INVALID_INPUT", "DATA_NOT_AVAILABLE", "SOURCE_UNAVAILABLE"]);

/** A backend's HTTP statuses that mean "try again later". */
export const TRANSIENT_STATUSES = Object.freeze([429, 502, 503, 504]);

/**
 * The error codes of a network failure that may pass (Node's and undici's), looked for on an error,
 * its causes and an AggregateError's errors.
 */
export const NETWORK_CODES = Object.freeze(["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EPIPE", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_CLOSED"]);

/** The most characters of a SourceError's publicMessage a caller gets. */
export const PUBLIC_MESSAGE_MAX = 300;

/** What a caller is told for each code when the source gives no publicMessage. */
const DEFAULT_TEXT = Object.freeze({
    NOT_ALLOWED: "you may not see this source's data",
    INVALID_INPUT: "the source did not accept these parameters",
    DATA_NOT_AVAILABLE: "the source has no data you may see for these parameters",
    SOURCE_UNAVAILABLE: "the source is not available right now"
});

/**
 * An error a source's code throws to say what went wrong in words a caller may read:
 *
 *   throw new SourceError("NOT_ALLOWED", { publicMessage: "You may not see this team's tickets." });
 *   throw new SourceError("SOURCE_UNAVAILABLE", { transient: true });   // last good data may stand in
 *
 * `code` is one of SOURCE_ERROR_CODES; `publicMessage` is the only text of the source that reaches a
 * caller (for the codes below 500; SOURCE_UNAVAILABLE always says a fixed text); `transient: true`
 * allows last good data; `status` is a backend's HTTP status, for the log (429, 502, 503 and 504 make
 * the error transient when `transient` is not given).
 */
export class SourceError extends Error {
    /**
     * @param {"NOT_ALLOWED" | "INVALID_INPUT" | "DATA_NOT_AVAILABLE" | "SOURCE_UNAVAILABLE"} code
     * @param {{ transient?: boolean, publicMessage?: string, status?: number }} [how]
     */
    constructor(code, how = {}) {
        if (!SOURCE_ERROR_CODES.includes(code)) {
            throw new TypeError(`SourceError: the code is one of ${SOURCE_ERROR_CODES.join(", ")}`);
        }
        const status = Number.isInteger(how.status) ? /** @type {number} */ (how.status) : undefined;
        super(`${code}${status !== undefined ? ` (status ${status})` : ""}`);
        this.name = "SourceError";
        /** @type {"NOT_ALLOWED" | "INVALID_INPUT" | "DATA_NOT_AVAILABLE" | "SOURCE_UNAVAILABLE"} */
        this.code = code;
        /** @type {boolean} */
        this.transient = typeof how.transient === "boolean" ? how.transient : status !== undefined && TRANSIENT_STATUSES.includes(status);
        /** @type {string | undefined} */
        this.publicMessage = typeof how.publicMessage === "string" ? how.publicMessage : undefined;
        /** @type {number | undefined} */
        this.status = status;
    }
}

/** Marks the error of this module's time limit. */
const TIMED_OUT = Symbol("pivotkit.timedOut");

/** Reads a property of something a source threw; a getter that throws reads as nothing. */
const read = (value, key) => {
    try {
        return value !== null && typeof value === "object" ? value[key] : undefined;
    } catch {
        return undefined;
    }
};

/** Whether an error, its causes or an AggregateError's errors carry a network code that may pass. */
function hasNetworkCode(error, depth = 0) {
    if (depth > 4 || error === null || typeof error !== "object") {
        return false;
    }
    const code = read(error, "code");
    if (typeof code === "string" && NETWORK_CODES.includes(code)) {
        return true;
    }
    const errors = read(error, "errors");
    return hasNetworkCode(read(error, "cause"), depth + 1) || (Array.isArray(errors) && errors.slice(0, 8).some((e) => hasNetworkCode(e, depth + 1)));
}

/**
 * Whether a failed load may pass by itself, so last good data may stand in: this module's time limit,
 * a network error, or a SourceError that says so. Anything else (a plain Error, a refusal) is not.
 * @param {unknown} error
 */
export function isTransient(error) {
    if (error instanceof SourceError) {
        return error.transient === true;
    }
    return Boolean(read(error, TIMED_OUT)) || hasNetworkCode(error);
}

/**
 * What a caller gets for a source's failure: a SourceError's code with its publicMessage (cleaned,
 * capped) or the code's own words; anything else (whatever it is, an OperationError of the source's
 * own too) SOURCE_UNAVAILABLE, retryable when the failure is transient. The source's error is the
 * cause, for the log.
 * @param {unknown} error
 * @returns {OperationError}
 */
export function sourceFailure(error) {
    const transient = isTransient(error);
    if (error instanceof SourceError && SOURCE_ERROR_CODES.includes(error.code) && error.code !== "SOURCE_UNAVAILABLE") {
        const text = typeof error.publicMessage === "string" ? cleanText(error.publicMessage).trim().slice(0, PUBLIC_MESSAGE_MAX) : "";
        return Object.assign(new OperationError(error.code, text || DEFAULT_TEXT[error.code], errorDetails({ retryable: false })), { cause: error });
    }
    return Object.assign(new OperationError("SOURCE_UNAVAILABLE", DEFAULT_TEXT.SOURCE_UNAVAILABLE, errorDetails({ retryable: transient })), { cause: error });
}

/** How a log line names a failure, never with the source's words. */
const kindOf = (error) => (read(error, TIMED_OUT) ? "time limit" : error instanceof SourceError ? `SourceError ${error.code}${error.status !== undefined ? ` (status ${error.status})` : ""}` : hasNetworkCode(error) ? "network error" : String(read(error, "name") ?? "error").slice(0, 60));

/** A time in ms as a dataAsOf-like text, for stale.since. */
const isoOf = (ms) => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");

/** @typedef {{ value: any, version: string | null, loadedAt: number }} Kept  a kept load: its value, the version it was loaded at, when */

/** The most keys whose last refusal is remembered (for late results of loads over the time limit). */
const REFUSALS = 1024;

/**
 * A loader of data with its own cache, loads in flight and refusals. The server has one
 * (`runLoad`); tests make their own.
 * @param {{ cache?: ReturnType<typeof createLoadCache>, limits?: Partial<typeof LOAD_LIMITS> }} [parts]
 */
export function createLoadRunner(parts = {}) {
    /** @type {{ get(key: string): Kept | undefined, set(key: string, value: Kept, about: { identity: string, bytes: number }): void, delete(key: string): void, size(): { entries: number, bytes: number } }} */
    const cache = /** @type {any} */ (parts.cache ?? createLoadCache());
    const limits = { ...LOAD_LIMITS, ...(parts.limits ?? {}) };
    /** @type {Map<string, Promise<any>>} loads in flight by key */
    const inflight = new Map();
    /** @type {Map<string, number>} when each key was last refused */
    const refusedAt = new Map();
    /** @type {Map<string, { total: number, by: Map<string, number> }>} loads running per source, per identity */
    const running = new Map();

    const refuse = (key) => {
        cache.delete(key);
        refusedAt.delete(key);
        refusedAt.set(key, Date.now());
        if (refusedAt.size > REFUSALS) {
            refusedAt.delete(/** @type {string} */ (refusedAt.keys().next().value));
        }
    };

    const slotsOf = (source) => {
        if (!running.has(source)) {
            running.set(source, { total: 0, by: new Map() });
        }
        return /** @type {{ total: number, by: Map<string, number> }} */ (running.get(source));
    };
    const take = (source, bucket) => {
        const slots = slotsOf(source);
        slots.total++;
        slots.by.set(bucket, (slots.by.get(bucket) ?? 0) + 1);
    };
    const give = (source, bucket) => {
        const slots = slotsOf(source);
        slots.total--;
        const left = (slots.by.get(bucket) ?? 1) - 1;
        if (left > 0) {
            slots.by.set(bucket, left);
        } else {
            slots.by.delete(bucket);
        }
        if (slots.total <= 0) {
            running.delete(source);
        }
    };

    /**
     * Loads data, or reuses what is kept.
     * @template R, V
     * @param {string | null} key  canonical JSON of what decides the data (sources/keys.js); null: nothing is kept or shared
     * @param {(signal: AbortSignal) => Promise<R>} load  the source's load; its errors are the source's own
     * @param {object} how
     * @param {(raw: R) => V} how.prepare  pivotkit's work on what the load gave (limits, encoding); its OperationErrors pass as they are
     * @param {string} how.source  the source (its load limits); unique per configured source
     * @param {string} how.label  how the log names the source (its id)
     * @param {string} how.bucket  whose load it is, for the load limits (an identity, or the client's name without one)
     * @param {string} how.owner  whose kept data it is, for the cache's bound per identity
     * @param {number} how.timeMs
     * @param {number | null} [how.ttl]  seconds a load is reused (null: only while its version is the same)
     * @param {number} how.maxStale  seconds last good data may stand in (0: never)
     * @param {(() => unknown) | null} [how.version]  the source's version: kept data is reused while it is the same; null from it keeps nothing fresh
     * @param {(value: V) => number} how.sizeOf  the bytes a value takes in the cache
     * @param {any} how.log  the server's log
     * @param {AbortSignal} [how.signal]  the caller's own (a request that went away)
     * @returns {Promise<{ value: V, stale: { since: string } | null }>}
     */
    async function runLoad(key, load, how) {
        let version = null;
        if (how.version) {
            try {
                const given = await how.version();
                version = given === null || given === undefined ? null : JSON.stringify(given);
            } catch (e) {
                return failed(key, e, how);
            }
        }
        const kept = key !== null ? cache.get(key) : undefined;
        if (kept && freshOf(kept, version, how.ttl)) {
            return { value: kept.value, stale: null };
        }
        if (key !== null && inflight.has(key)) {
            return inflight.get(key);
        }
        const slots = running.get(how.source);
        if ((slots?.total ?? 0) >= limits.perSource || (slots?.by.get(how.bucket) ?? 0) >= limits.perIdentity) {
            how.log.warn(`the source ${how.label} has too many loads running; a call was refused`, { source: how.label });
            throw new OperationError("SOURCE_UNAVAILABLE", DEFAULT_TEXT.SOURCE_UNAVAILABLE, errorDetails({ retryable: true, retryAfter: 1 }));
        }
        const work = start(key, load, how, version);
        if (key !== null) {
            inflight.set(key, work);
            work.finally(() => inflight.get(key) === work && inflight.delete(key)).catch(() => undefined);
        }
        return work;
    }

    /** Starts a load with its time limit and slot. */
    async function start(key, load, how, version) {
        const started = Date.now();
        const controller = new AbortController();
        const signal = how.signal ? AbortSignal.any([controller.signal, how.signal]) : controller.signal;
        take(how.source, how.bucket);
        const loading = Promise.resolve().then(() => load(signal));
        // the slot is the load's until it really ends, also when it ignores the abort
        loading.then(
            () => give(how.source, how.bucket),
            () => give(how.source, how.bucket)
        );
        /** @type {ReturnType<typeof setTimeout> | undefined} */
        let timer;
        const limit = new Promise((_, reject) => {
            timer = setTimeout(() => {
                reject(Object.assign(new Error(`the source took longer than ${how.timeMs} ms`), { [TIMED_OUT]: true }));
                controller.abort(new DOMException(`the source took longer than ${how.timeMs} ms`, "TimeoutError"));
            }, how.timeMs);
        });
        let raw;
        try {
            raw = await Promise.race([loading, limit]);
        } catch (e) {
            if (read(e, TIMED_OUT)) {
                how.log.warn(`the source ${how.label} took longer than ${how.timeMs} ms (timeMs); its load was aborted`, { source: how.label });
                // a late result is kept for the next call, unless the key was refused meanwhile
                loading.then(
                    (late) => {
                        if (key !== null && !((refusedAt.get(key) ?? 0) >= started)) {
                            keep(key, late, how, version, started);
                        }
                    },
                    () => undefined
                );
            }
            return failed(key, e, how);
        } finally {
            clearTimeout(timer);
        }
        const value = how.prepare(raw);
        if (key !== null) {
            remember(key, value, how, version, started);
        }
        return { value, stale: null };
    }

    /** Prepares a late load's result and keeps it; a result that cannot be prepared is not kept. */
    function keep(key, raw, how, version, started) {
        try {
            remember(key, how.prepare(raw), how, version, started);
        } catch {
            // the next call loads again and says why
        }
    }

    /** Keeps a value with when it was loaded and its version. */
    function remember(key, value, how, version, loadedAt) {
        if (version === null && !how.ttl && !(how.maxStale > 0)) {
            return;
        }
        cache.set(key, { value, version, loadedAt }, { identity: how.owner, bytes: how.sizeOf(value) });
    }

    /**
     * A failed load: last good data after a transient failure (and the warning that says so), else
     * the caller's error; a failure that is not transient drops what was kept for the key.
     */
    function failed(key, error, how) {
        const answer = sourceFailure(error);
        const transient = isTransient(error);
        if (!transient) {
            if (key !== null) {
                refuse(key);
            }
            if (error instanceof SourceError) {
                how.log.debug(`the source ${how.label} refused: ${kindOf(error)}`, { source: how.label });
            } else {
                // the source's own message only with --log debug (log.error)
                how.log.error(error, { source: how.label });
            }
            throw answer;
        }
        const kept = key !== null && how.maxStale > 0 ? cache.get(key) : undefined;
        if (kept && Date.now() - kept.loadedAt <= how.maxStale * 1000) {
            how.log.warn(`the source ${how.label} could not be loaded (${kindOf(error)}); its last good data from ${isoOf(kept.loadedAt)} stands in`, { source: how.label });
            return { value: kept.value, stale: { since: isoOf(kept.loadedAt) } };
        }
        how.log.warn(`the source ${how.label} could not be loaded (${kindOf(error)})`, { source: how.label });
        throw answer;
    }

    return { runLoad, size: () => cache.size(), running: (source) => running.get(source)?.total ?? 0 };
}

/**
 * Whether kept data may be reused: with a version, while it is the same (and within `ttl` when set);
 * without one, within `ttl`.
 */
function freshOf(kept, version, ttl) {
    const young = typeof ttl === "number" && ttl > 0 && Date.now() - kept.loadedAt < ttl * 1000;
    return version !== null ? kept.version === version && (typeof ttl !== "number" || young) : young;
}

/** The server's one loader (one per process: the cache's bounds hold for all sources together). */
export const loadRunner = createLoadRunner();

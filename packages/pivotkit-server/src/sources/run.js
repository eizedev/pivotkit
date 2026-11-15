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

/** Why a source is unavailable, when it is not "right now": each picks a fixed text (rest/problem.js serverTextOf). */
export const SOURCE_REASONS = Object.freeze(["refused", "setup"]);

/** A backend's HTTP statuses that mean "try again later". */
export const TRANSIENT_STATUSES = Object.freeze([429, 502, 503, 504]);

/**
 * The error codes of a network failure that may pass (Node's and undici's), looked for on an error,
 * its causes and an AggregateError's errors.
 */
export const NETWORK_CODES = Object.freeze(["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"]);

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
 * caller (for the codes below 500; SOURCE_UNAVAILABLE always says a fixed text of pivotkit's). For
 * SOURCE_UNAVAILABLE only: `transient: true` allows last good data, `status` (a backend's HTTP status,
 * also for the log) of 429, 502, 503 or 504 makes it transient when `transient` is not given,
 * `retryAfter` (seconds) is passed on as Retry-After, and `reason` picks which of pivotkit's fixed
 * texts the caller reads (SOURCE_REASONS: "refused", the backend refused pivotkit's access;
 * "setup", the source is not set up correctly; none: not available right now). A refusal (the other
 * codes) is never transient.
 */
export class SourceError extends Error {
    /**
     * @param {"NOT_ALLOWED" | "INVALID_INPUT" | "DATA_NOT_AVAILABLE" | "SOURCE_UNAVAILABLE"} code
     * @param {{ transient?: boolean, publicMessage?: string, status?: number, retryAfter?: number, reason?: "refused" | "setup" }} [how]
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
        this.transient = code === "SOURCE_UNAVAILABLE" && (typeof how.transient === "boolean" ? how.transient : status !== undefined && TRANSIENT_STATUSES.includes(status));
        /** @type {string | undefined} */
        this.publicMessage = typeof how.publicMessage === "string" ? how.publicMessage : undefined;
        /** @type {number | undefined} */
        this.status = status;
        /** @type {number | undefined} seconds, as OperationError's details take them */
        this.retryAfter = Number.isSafeInteger(how.retryAfter) && /** @type {number} */ (how.retryAfter) >= 0 ? how.retryAfter : undefined;
        /** @type {"refused" | "setup" | undefined} */
        this.reason = code === "SOURCE_UNAVAILABLE" && SOURCE_REASONS.includes(/** @type {any} */ (how.reason)) ? how.reason : undefined;
    }
}

/** Marks the error of this module's time limit. */
const TIMED_OUT = Symbol("pivotkit.timedOut");

/** Marks an error pivotkit made itself while it prepared loaded data (a run limit), which passes as it is. */
const OWN = Symbol("pivotkit.ownError");

/**
 * Marks an OperationError as pivotkit's own (a `prepare` step's run limit), so runLoad passes it on
 * as it is; any other error of `prepare` (a host's getter that throws while its rows are read) is the
 * source's failure.
 * @template {Error} E
 * @param {E} error
 * @returns {E}
 */
export const ownError = (error) => Object.defineProperty(error, OWN, { value: true });

/** Whether an error is one ownError marked. */
export const isOwnError = (error) => Boolean(read(error, OWN));

/** What a caller that went away gets (nobody reads it): its signal's reason, or an AbortError. */
const callerGone = (signal) => (signal.reason instanceof Error ? signal.reason : new DOMException("the caller went away", "AbortError"));

/** A source's failure inside a shared load: each caller turns it into its own answer (sourceFailure, with its request id). */
class LoadFailure {
    /** @param {unknown} error */
    constructor(error) {
        this.error = error;
    }
}

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
        return error.code === "SOURCE_UNAVAILABLE" && error.transient === true;
    }
    return Boolean(read(error, TIMED_OUT)) || hasNetworkCode(error);
}

/**
 * What a caller gets for a source's failure: a SourceError's code with its publicMessage (cleaned,
 * capped) or the code's own words; pivotkit's own error (ownError: a limit of the source's settings)
 * as it is; anything else (whatever it is, an OperationError of the source's own too)
 * SOURCE_UNAVAILABLE, retryable when the failure is transient, with the SourceError's `reason` (which
 * fixed text the caller reads). The source's error is the cause, for the log.
 * @param {unknown} error
 * @returns {OperationError}
 */
export function sourceFailure(error) {
    if (isOwnError(error)) {
        // pivotkit's own (a limit of the source's settings): as it is
        return /** @type {OperationError} */ (error);
    }
    const transient = isTransient(error);
    if (error instanceof SourceError && SOURCE_ERROR_CODES.includes(error.code) && error.code !== "SOURCE_UNAVAILABLE") {
        // cut without leaving half of a character outside the Basic Multilingual Plane
        const text = typeof error.publicMessage === "string" ? cleanText(error.publicMessage).trim().slice(0, PUBLIC_MESSAGE_MAX).replace(/[\uD800-\uDBFF]$/, "") : "";
        return Object.assign(new OperationError(error.code, text || DEFAULT_TEXT[error.code], errorDetails({ retryable: false })), { cause: error });
    }
    const retryAfter = error instanceof SourceError && transient ? error.retryAfter : undefined;
    const reason = error instanceof SourceError ? error.reason : undefined;
    return Object.assign(new OperationError("SOURCE_UNAVAILABLE", DEFAULT_TEXT.SOURCE_UNAVAILABLE, errorDetails({ retryable: transient, ...(retryAfter !== undefined ? { retryAfter } : {}) })), { cause: error, ...(reason ? { reason } : {}) });
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
    /** @type {{ get(key: string): Kept | undefined, set(key: string, value: Kept, about: { identity: string, bytes: number }): void, delete(key: string): void, size(): { entries: number, bytes: number }, limit(): number, resize(bytes: number): void }} */
    const cache = /** @type {any} */ (parts.cache ?? createLoadCache());
    const limits = { ...LOAD_LIMITS, ...(parts.limits ?? {}) };
    /** @typedef {{ controller: AbortController, waiting: number, cancelled: boolean, work: Promise<any> }} Shared  a load in flight with the callers waiting for it */
    /** @type {Map<string, Shared>} loads in flight by key */
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
     * @param {(raw: R) => V} how.prepare  pivotkit's work on what the load gave (limits, encoding); errors it marks with ownError pass as they are, any other is the source's failure
     * @param {string} how.source  the source (its load limits); unique per configured source
     * @param {string} how.label  how the log names the source (its id)
     * @param {string} how.bucket  whose load it is, for the load limits (an identity, or the client's name without one)
     * @param {string} how.owner  whose kept data it is, for the cache's bounds per owner
     * @param {number} how.timeMs
     * @param {number | null} [how.ttl]  seconds a load is reused (null: only while its version is the same)
     * @param {number} how.maxStale  seconds last good data may stand in (0: never)
     * @param {(() => unknown) | null} [how.version]  the source's version, called at once on every call (not awaited): kept data is reused while it is the same; null from it keeps nothing fresh
     * @param {(value: V) => number} how.sizeOf  the bytes a value takes in the cache
     * @param {any} how.log  the server's log
     * @param {AbortSignal} [how.signal]  the caller's own (a request that went away): a shared load is aborted only when every caller waiting for it went away
     * @returns {Promise<{ value: V, stale: { since: string } | null }>}
     */
    async function runLoad(key, load, how) {
        try {
            return await attempt(key, load, how);
        } catch (e) {
            // made here, in the caller's own request, so its id is the caller's even for a shared load
            throw e instanceof LoadFailure ? sourceFailure(e.error) : e;
        }
    }

    /** runLoad's work; a source's failure comes out as a LoadFailure. */
    async function attempt(key, load, how) {
        if (how.signal?.aborted) {
            throw callerGone(how.signal);
        }
        let version = null;
        if (how.version) {
            try {
                // called as it always was, at once: a promise is no version (it would never change)
                const given = how.version();
                if (given !== null && typeof given === "object" && typeof (/** @type {any} */ (given).then) === "function") {
                    // its rejection is handled here, or it would end the process as unhandled
                    Promise.resolve(given).then(undefined, () => undefined);
                    throw new TypeError("version() returns a value, not a promise");
                }
                version = given === null || given === undefined ? null : (JSON.stringify(given) ?? null);
            } catch (e) {
                return failed(key, e, how);
            }
        }
        const kept = key !== null ? cache.get(key) : undefined;
        if (kept && freshOf(kept, version, how.ttl)) {
            return { value: kept.value, stale: null };
        }
        let shared = key !== null ? inflight.get(key) : undefined;
        if (!shared) {
            const slots = running.get(how.source);
            if ((slots?.total ?? 0) >= limits.perSource || (slots?.by.get(how.bucket) ?? 0) >= limits.perIdentity) {
                how.log.warn(`the source ${how.label} has too many loads running; a call was refused`, { source: how.label });
                throw new OperationError("SOURCE_UNAVAILABLE", DEFAULT_TEXT.SOURCE_UNAVAILABLE, errorDetails({ retryable: true, retryAfter: 1 }));
            }
            shared = start(key, load, how, version);
            if (key !== null) {
                const own = shared;
                inflight.set(key, own);
                own.work.finally(() => inflight.get(key) === own && inflight.delete(key)).catch(() => undefined);
            }
        }
        return join(shared, key, how.signal);
    }

    /**
     * Waits for a load as one of its callers. A caller whose signal fires stops waiting; the load is
     * aborted only when every caller waiting for it went away, and that is no failure of the source.
     */
    function join(shared, key, signal) {
        if (!signal) {
            shared.waiting++;
            return shared.work.finally(() => shared.waiting--);
        }
        if (signal.aborted) {
            return Promise.reject(callerGone(signal));
        }
        shared.waiting++;
        return new Promise((resolve, reject) => {
            const leave = () => {
                shared.waiting--;
                reject(callerGone(signal));
                if (shared.waiting === 0) {
                    shared.cancelled = true;
                    if (key !== null && inflight.get(key) === shared) {
                        inflight.delete(key);
                    }
                    shared.controller.abort(new DOMException("every caller went away", "AbortError"));
                }
            };
            signal.addEventListener("abort", leave, { once: true });
            shared.work.then(
                (value) => {
                    signal.removeEventListener("abort", leave);
                    // a caller that left was counted out by leave already
                    shared.waiting -= signal.aborted ? 0 : 1;
                    resolve(value);
                },
                (e) => {
                    signal.removeEventListener("abort", leave);
                    shared.waiting -= signal.aborted ? 0 : 1;
                    reject(e);
                }
            );
        });
    }

    /** Starts a load with its time limit and slot: { work, controller, waiting, cancelled }. */
    function start(key, load, how, version) {
        const shared = { controller: new AbortController(), waiting: 0, cancelled: false, work: /** @type {Promise<any>} */ (Promise.resolve()) };
        shared.work = run(shared, key, load, how, version);
        // a caller that went away does not wait for the result; nobody else may see its failure
        shared.work.catch(() => undefined);
        return shared;
    }

    /** The load itself. */
    async function run(shared, key, load, how, version) {
        const started = Date.now();
        const { controller } = shared;
        take(how.source, how.bucket);
        const loading = Promise.resolve().then(() => load(controller.signal));
        // a load still running long after its time limit ignores the signal: it keeps its slot until
        // it ends (the operator restarts a host whose loads hang), and the log says so once
        const hung = setTimeout(() => how.log.warn(`the source ${how.label} still holds a load slot ${2 * how.timeMs} ms after it started: its load ignores the abort signal`, { source: how.label }), 2 * how.timeMs);
        hung.unref?.();
        // the slot is the load's until it really ends, also when it ignores the abort
        loading.then(
            () => (clearTimeout(hung), give(how.source, how.bucket)),
            () => (clearTimeout(hung), give(how.source, how.bucket))
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
            if (shared.cancelled) {
                // every caller went away: not the source's failure, nothing is refused or dropped
                throw new OperationError("SOURCE_UNAVAILABLE", DEFAULT_TEXT.SOURCE_UNAVAILABLE, errorDetails({ retryable: true }));
            }
            if (read(e, TIMED_OUT)) {
                how.log.warn(`the source ${how.label} took longer than ${how.timeMs} ms (timeMs); its load was aborted`, { source: how.label });
                // a late result is kept for the next call, unless the key was refused meanwhile or a
                // later load is kept already
                loading.then(
                    (late) => {
                        if (key !== null && !((refusedAt.get(key) ?? 0) >= started) && !((cache.get(key)?.loadedAt ?? -Infinity) >= started)) {
                            keep(key, late, how, version);
                        }
                    },
                    () => undefined
                );
            }
            return failed(key, e, how);
        } finally {
            clearTimeout(timer);
        }
        let value;
        try {
            value = how.prepare(raw);
        } catch (e) {
            if (isOwnError(e)) {
                throw e;
            }
            // the host's code ran while its data was read (a getter): the source's failure
            return failed(key, e, how);
        }
        if (key !== null) {
            remember(key, value, how, version, Date.now());
        }
        return { value, stale: null };
    }

    /** Prepares a late load's result and keeps it; a result that cannot be prepared is not kept. */
    function keep(key, raw, how, version) {
        try {
            remember(key, how.prepare(raw), how, version, Date.now());
        } catch {
            // the next call loads again and says why
        }
    }

    /** Keeps a value with when its load ended (ttl and stale's since count from then) and its version. */
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
        const answer = new LoadFailure(error);
        const transient = isTransient(error);
        if (!transient) {
            if (key !== null) {
                refuse(key);
            }
            if (error instanceof SourceError || isOwnError(error)) {
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

    return {
        runLoad,
        size: () => cache.size(),
        running: (source) => running.get(source)?.total ?? 0,
        /** The bytes the load cache may hold (sourceCache.maxMb); one owner's share is OWNER_SHARE of them. */
        cacheBytes: () => cache.limit(),
        /** @param {number} bytes */
        setCacheBytes: (bytes) => cache.resize(bytes)
    };
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

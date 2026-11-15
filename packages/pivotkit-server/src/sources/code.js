/*
 * Code sources of a library host (sources.<id>.load): the host's own function, called in the main
 * thread (the host's code stays in its process), the operation with it. Every load is
 * load(params, { caller, signal }) and version(params, { caller }): `params` the caller's checked
 * values ({} for a source without params), `caller` a frozen view of the caller (auth.js callerView,
 * never a token; null for a source with cacheShared), `signal` aborted at the source's timeMs.
 *
 * Loading goes through sources/run.js (time limit, coalescing, load limits, kept data, last good
 * data). The data is kept per identity (with the client, its scopes, the groups and claims), the
 * values and the policy's levels; with cacheShared one copy for all callers; for a caller without an
 * identity not at all. A code source is the operator's code: the frozen caller guards against
 * mistakes, it is not a sandbox.
 */

import { randomBytes } from "node:crypto";

/**
 * Who calls, as a code source sees it: a frozen copy without any token. `scopes` is null when the
 * caller holds every scope (no OAuth); `subject` and `issuer` are null without OAuth; `claims` only
 * those the configuration names.
 * @typedef {Readonly<{ subject: string | null, issuer: string | null, client: string, profile: string | null, scopes: readonly string[] | null, groups: readonly string[], claims?: Readonly<Record<string, string | number | boolean>> }>} SourceCaller
 */

/** @typedef {Readonly<Record<string, string | number | boolean>>} SourceParams  a caller's checked values ({} without declared params) */

/** @typedef {Date | string | number} SourceAsOf  when the data is from: a Date, an ISO 8601 text or epoch milliseconds */

/**
 * What a code source's load returns: rows, rows with their time, or columnar data (one array per
 * column), never encode()'s result.
 * @typedef {Array<Record<string, unknown>> | { rows: Array<Record<string, unknown>>, asOf?: SourceAsOf } | { columns: string[], types?: Array<"string" | "number" | "date" | "boolean">, data: unknown[][], asOf?: SourceAsOf }} LoadResult
 */

/** @typedef {(params: SourceParams, how: { caller: SourceCaller, signal: AbortSignal }) => LoadResult | Promise<LoadResult>} SourceLoad  a code source's load; signal is aborted at its timeMs */
/** @typedef {(params: SourceParams, how: { caller: null, signal: AbortSignal }) => LoadResult | Promise<LoadResult>} SharedSourceLoad  load of a source with cacheShared: true */
/** @typedef {(params: SourceParams, how: { caller: SourceCaller }) => unknown} SourceVersion  a value (not a promise) that changes when the data changes */
/** @typedef {(params: SourceParams, how: { caller: null }) => unknown} SharedSourceVersion */
import { callerView, identityKey } from "../auth.js";
import { codeTable } from "../data.js";
import { CODE_DEFAULTS } from "../options/code.js";
import { encodedBytes } from "./cache.js";
import { canonicalJson, privatePart } from "./keys.js";
import { loadRunner } from "./run.js";

/** What a source without params gets as its params. */
const NO_PARAMS = Object.freeze({});

/** A random name per configured source object, so two servers' sources of the same id never share data. */
const names = new WeakMap();
const nameOf = (source) => {
    if (!names.has(source)) {
        names.set(source, randomBytes(9).toString("base64url"));
    }
    return names.get(source);
};

/**
 * The identity a code source's kept data is bound to: the person with the client, its scopes, the
 * groups and the claims (a code source may answer differently for each of them), as a keyed digest;
 * "*" for a source shared by all callers; null without an identity (nothing is kept).
 * @param {import("../registry.js").Caller} caller
 * @param {boolean} shared
 */
function ownerOf(caller, shared) {
    if (shared) {
        return "*";
    }
    const person = identityKey(caller, { client: true });
    return person === null ? null : privatePart([person, [...(caller.groups ?? [])].sort(), caller.claims ?? {}]);
}

/**
 * Loads a code source's data for a caller (or reuses it): sources/run.js with the source's limits.
 * @param {any} resolved  registry.resolve's
 * @param {import("../registry.js").Caller} caller
 * @param {any} log
 * @param {AbortSignal} [signal]  the caller's request: the call stops waiting when it fires
 * @returns {Promise<{ data: any, stale: { since: string } | null }>}
 */
export async function loadCode(resolved, caller, log, signal = undefined) {
    const source = resolved.source;
    const spec = resolved.spec;
    const shared = source.cacheShared === true;
    const params = resolved.params ?? NO_PARAMS;
    const view = shared ? null : callerView(caller);
    const owner = ownerOf(caller, shared);
    const name = nameOf(source);
    // the load limits and the cache's bound count per person (any client), or per client for a
    // caller without an identity
    const person = identityKey(caller) ?? `client:${caller.client}`;
    // the values and the owner only as a keyed digest: a key holds no group, claim or value in clear text
    const key = owner === null ? null : canonicalJson(["code", name, spec.id, privatePart([params, owner]), spec.levels, spec.timeZone ?? null, spec.limits]);
    const ran = await loadRunner.runLoad(key, (signal) => source.load(params, { caller: view, signal }), {
        prepare: (loaded) => codeTable(spec, loaded),
        source: name,
        label: spec.id,
        bucket: person,
        owner: shared ? `shared:${name}` : person,
        timeMs: source.timeMs ?? CODE_DEFAULTS.timeMs,
        ttl: source.ttl ?? CODE_DEFAULTS.ttl,
        maxStale: source.maxStale ?? CODE_DEFAULTS.maxStale,
        version: source.version ? () => source.version(params, { caller: view }) : null,
        sizeOf: (read) => encodedBytes(read.data),
        log,
        ...(signal ? { signal } : {})
    });
    return { data: ran.value, stale: ran.stale };
}

export const codeKind = Object.freeze({
    async specOf() {
        return { allow: [], hardLinks: true };
    },

    /**
     * Runs an operation over the host's data in this thread.
     * @param {any} computer
     * @param {string} op
     * @param {any} input
     * @param {any} resolved
     * @param {any} base
     * @param {import("../registry.js").Caller} caller
     * @param {any} log  the server's log
     * @param {{ signal?: AbortSignal }} [how]  signal: the caller's request
     */
    run(computer, op, input, resolved, base, caller, log, how = {}) {
        return computer.run(op, input, { ...base, spec: resolved.spec }, { read: () => loadCode(resolved, caller, log, how.signal) });
    }
});

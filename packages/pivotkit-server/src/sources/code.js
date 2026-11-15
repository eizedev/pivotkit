/*
 * Code sources of a library host (sources.<id>.load): the host's own function, called in the main
 * thread (the host's code stays in its process); its rows are read once into a packed table there
 * (packed.js), and the operation over them runs in a worker as a table job (compute.js, bounded by
 * compute.timeMs and compute.memoryMb), as an HTTP source's do. Every load is
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
import { packedBytes } from "../packed.js";
import { LOAD_CACHE, OWNER_SHARE } from "./cache.js";
import { canonicalJson, tableKeyOf } from "./keys.js";
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
 * groups and the claims (a code source may answer differently for each of them); "*" for a source
 * shared by all callers; null without an identity (nothing is kept).
 * @param {import("../registry.js").Caller} caller
 * @param {boolean} shared
 */
function ownerOf(caller, shared) {
    if (shared) {
        return "*";
    }
    const person = identityKey(caller, { client: true });
    return person === null ? null : canonicalJson([person, [...(caller.groups ?? [])].sort(), caller.claims ?? {}]);
}

/**
 * Loads a code source's data for a caller (or reuses it): sources/run.js with the source's limits.
 * `tableKey` names this load's table for the worker (a new load has a new one, so a worker never
 * answers from an older table): null without an identity, for a load that is not reused (no `ttl`
 * and no `version`: every call loads, and a key per call would only push other data out of the
 * workers), and for a load larger than the load cache keeps.
 * @param {any} resolved  registry.resolve's
 * @param {import("../registry.js").Caller} caller
 * @param {any} log
 * @param {AbortSignal} [signal]  the caller's request: the call stops waiting when it fires
 * @returns {Promise<{ value: { table: import("../packed.js").PackedTable, asOf: string, serial: string, bytes: number }, stale: { since: string } | null, tableKey: string | null }>}
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
    const key = owner === null ? null : canonicalJson(["code", name, spec.id, params, owner, spec.levels, spec.timeZone ?? null, spec.limits]);
    const ran = await loadRunner.runLoad(key, (signal) => source.load(params, { caller: view, signal }), {
        prepare: (loaded) => {
            const read = codeTable(spec, loaded);
            return { ...read, serial: randomBytes(9).toString("base64url"), bytes: packedBytes(read.table) };
        },
        source: name,
        label: spec.id,
        bucket: person,
        owner: shared ? `shared:${name}` : person,
        timeMs: source.timeMs ?? CODE_DEFAULTS.timeMs,
        ttl: source.ttl ?? CODE_DEFAULTS.ttl,
        maxStale: source.maxStale ?? CODE_DEFAULTS.maxStale,
        version: source.version ? () => source.version(params, { caller: view }) : null,
        sizeOf: (read) => read.bytes,
        log,
        ...(signal ? { signal } : {})
    });
    // this load's table (its serial) for the same owner as the load's key, only for a load the
    // load cache keeps and reuses; a caller without an identity gets no key either
    const reused = (source.ttl ?? CODE_DEFAULTS.ttl ?? 0) > 0 || typeof source.version === "function";
    const kept = reused && ran.value.bytes <= LOAD_CACHE.bytes * OWNER_SHARE;
    const tableKey = !kept ? null : tableKeyOf({ kind: "code", id: `${name}:${spec.id}`, configHash: canonicalJson([ran.value.serial, spec.timeZone ?? null]), params, identity: owner, levels: spec.levels, limits: spec.limits });
    return { value: ran.value, stale: ran.stale, tableKey };
}

export const codeKind = Object.freeze({
    async specOf() {
        return { allow: [], hardLinks: true };
    },

    /**
     * Loads the host's data in this thread and runs the operation over it in a worker.
     * @param {any} computer
     * @param {string} op
     * @param {any} input
     * @param {any} resolved
     * @param {any} base
     * @param {import("../registry.js").Caller} caller
     * @param {any} log  the server's log
     * @param {{ signal?: AbortSignal }} [how]  signal: the caller's request
     */
    async run(computer, op, input, resolved, base, caller, log, how = {}) {
        const { value, stale, tableKey } = await loadCode(resolved, caller, log, how.signal);
        const ran = await computer.run(op, input, { ...base, spec: resolved.spec, table: value.table, tableKey, asOf: value.asOf });
        return { ...ran, asOf: ran.asOf ?? value.asOf, stale };
    }
});

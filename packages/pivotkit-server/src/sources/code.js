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
import { callerView, identityKey } from "../auth.js";
import { codeTable } from "../data.js";
import { CODE_DEFAULTS } from "../options/code.js";
import { encodedBytes } from "./cache.js";
import { canonicalJson } from "./keys.js";
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
 * @param {any} resolved  registry.resolve's
 * @param {import("../registry.js").Caller} caller
 * @param {any} log
 * @returns {Promise<{ data: any, stale: { since: string } | null }>}
 */
export async function loadCode(resolved, caller, log) {
    const source = resolved.source;
    const spec = resolved.spec;
    const shared = source.cacheShared === true;
    const params = resolved.params ?? NO_PARAMS;
    const view = shared ? null : callerView(caller);
    const owner = ownerOf(caller, shared);
    const name = nameOf(source);
    const key = owner === null ? null : canonicalJson(["code", name, spec.id, params, owner, spec.levels, spec.timeZone ?? null, spec.limits]);
    const ran = await loadRunner.runLoad(key, (signal) => source.load(params, { caller: view, signal }), {
        prepare: (loaded) => codeTable(spec, loaded),
        source: name,
        label: spec.id,
        // the load limits count per person (any client), or per client for a caller without an identity
        bucket: identityKey(caller) ?? `client:${caller.client}`,
        owner: `${name}:${owner}`,
        timeMs: source.timeMs ?? CODE_DEFAULTS.timeMs,
        ttl: source.ttl ?? CODE_DEFAULTS.ttl,
        maxStale: source.maxStale ?? CODE_DEFAULTS.maxStale,
        version: source.version ? () => source.version(params, { caller: view }) : null,
        sizeOf: (read) => encodedBytes(read.data),
        log
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
     */
    run(computer, op, input, resolved, base, caller, log) {
        return computer.run(op, input, { ...base, spec: resolved.spec }, { read: () => loadCode(resolved, caller, log) });
    }
});

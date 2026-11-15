/*
 * Code sources of a library host (sources.<id>.load): the host's own function, called in the main
 * thread (the host's code stays in its process), the operation with it. A source that declares params
 * gets the caller's values and a frozen view of the caller (auth.js callerView, never a token):
 * load(params, { caller }), version(params, { caller }); its data is kept per identity and values, and
 * not at all for a caller without an identity. A source without params is called as load() and
 * version(), as always.
 */

import { callerView, identityKey } from "../auth.js";
import { canonicalJson } from "./keys.js";

/** A code source with its params and caller bound, for data.js codeData. */
function bound(source, params, caller) {
    const view = callerView(caller);
    const identity = identityKey(caller);
    return {
        load: () => source.load(params, { caller: view }),
        // the cache's key: the host's version with the values and the identity; none without an identity
        ...(source.version && identity !== null ? { version: () => [source.version(params, { caller: view }), canonicalJson(params), identity] } : {})
    };
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
     */
    run(computer, op, input, resolved, base, caller) {
        const source = resolved.params === null ? resolved.source : bound(resolved.source, resolved.params, caller);
        return computer.run(op, input, { ...base, spec: resolved.spec }, source);
    }
});

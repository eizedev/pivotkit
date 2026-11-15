/*
 * check-config's section for code sources (a library host's load; only when check-config is given
 * options, a configuration file cannot hold a function): per source how long a load may take, how its
 * data is kept and whether last good data may stand in, the size of the load cache (also for HTTP
 * sources) and the upgrade notes that apply.
 *
 * check/index.js says what a section returns.
 */

import { CODE_DEFAULTS, sourceCacheOf } from "../options/code.js";
import { isClosedForDelivery } from "../registry.js";
import { heading, plain } from "./format.js";

/**
 * How a code source's data is kept, in words: how long, and for whom.
 * @param {import("../config.js").SourceOptions} source
 */
function keptOf(source) {
    const ttl = source.ttl ?? CODE_DEFAULTS.ttl;
    const shared = source.cacheShared ?? CODE_DEFAULTS.cacheShared;
    const how = ttl ? `reused for ${ttl} s${source.version ? " while version() is the same" : ""}` : source.version ? "reused while version() is the same" : "loaded on every call";
    return [how, shared ? "shared by all callers (load gets caller null)" : /** @type {any} */ (source).perPerson ? "data per caller, per person (perPerson: no plain links to its reports)" : "data per caller"];
}

/** @type {import("./index.js").Section} */
export async function section(options, _registry, _runtime) {
    const code = Object.entries(options.sources ?? {}).filter(([, s]) => typeof s.load === "function");
    const loaded = code.length > 0 || Object.values(options.sources ?? {}).some((s) => s.http);
    const { bytes, share } = sourceCacheOf(options);
    const mb = (n) => `${Math.round((n / 1_048_576) * 10) / 10} MiB`;
    const cache = [
        heading(`Kept loads: at most ${mb(bytes)} (sourceCache.maxMb)`),
        plain("the data code and HTTP sources loaded, kept for their next calls"),
        plain(`a table over ${mb(share)} (a quarter) is not kept and loads on every call`),
        plain("with several contexts in one process, the largest setting applies")
    ];
    if (!code.length) {
        return { items: loaded ? cache : [], upgrade: [] };
    }
    const items = [heading(`Code sources (${code.length}):`)];
    for (const [id, source] of code) {
        const maxStale = source.maxStale ?? CODE_DEFAULTS.maxStale;
        items.push(plain(`${id}: load up to ${source.timeMs ?? CODE_DEFAULTS.timeMs} ms`), ...keptOf(source).map((t) => plain(t, 2)), plain(`last good data: ${maxStale > 0 ? `up to ${maxStale} s after a transient failure` : "off"}`, 2));
        // an open source's reports get plain links: whether load answers each caller differently is
        // the host's to say (pivotkit cannot see it)
        if (!source.cacheShared && !isClosedForDelivery(options, id)) {
            items.push(plain("reports over it get plain links (every field is shown)", 2), plain("if load answers each caller differently, set perPerson: true, so only the person who asked can open them", 2));
        }
    }
    return { items: [...items, ...cache], upgrade: ["code sources with a time limit and data per caller"] };
}

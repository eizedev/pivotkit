/*
 * check-config's section for code sources (a library host's load; only when check-config is given
 * options, a configuration file cannot hold a function): per source how long a load may take, how its
 * data is kept and whether last good data may stand in, the size of the load cache (also for HTTP
 * sources) and the upgrade notes that apply.
 *
 * check/index.js says what a section returns.
 */

import { CODE_DEFAULTS, sourceCacheOf } from "../options/code.js";

/**
 * How a code source's data is kept, in words.
 * @param {import("../config.js").SourceOptions} source
 */
function keptOf(source) {
    const ttl = source.ttl ?? CODE_DEFAULTS.ttl;
    const shared = source.cacheShared ?? CODE_DEFAULTS.cacheShared;
    const how = ttl ? `reused for ${ttl} s${source.version ? " while version() is the same" : ""}` : source.version ? "reused while version() is the same" : "loaded on every call";
    return `${how}; ${shared ? "shared by all callers (load gets caller null)" : "data per caller"}`;
}

/** @type {import("./index.js").Section} */
export async function section(options, _registry, _runtime) {
    const code = Object.entries(options.sources ?? {}).filter(([, s]) => typeof s.load === "function");
    const loaded = code.length > 0 || Object.values(options.sources ?? {}).some((s) => s.http);
    const { bytes, share } = sourceCacheOf(options);
    const mb = (n) => `${Math.round((n / 1_048_576) * 10) / 10} MiB`;
    const cacheLine = `Kept loads of code and HTTP sources: at most ${mb(bytes)} in all, tables up to ${mb(share)} per person or shared source (sourceCache.maxMb); a larger table loads on every call`;
    if (!code.length) {
        return { lines: loaded ? [cacheLine] : [], problems: 0, upgrade: [] };
    }
    const lines = [`Code sources (${code.length}):`];
    for (const [id, source] of code) {
        const maxStale = source.maxStale ?? CODE_DEFAULTS.maxStale;
        lines.push(`  ${id}: load up to ${source.timeMs ?? CODE_DEFAULTS.timeMs} ms, ${keptOf(source)}; last good data ${maxStale > 0 ? `up to ${maxStale} s after a transient failure` : "off"}`);
    }
    lines.push(`  ${cacheLine}`);
    const upgrade = [
        `Code sources: load gets (params, { caller, signal }) and is aborted after timeMs (default ${CODE_DEFAULTS.timeMs} ms); a failing load answers SOURCE_UNAVAILABLE (502), not INTERNAL; data is kept per caller unless cacheShared; after a transient failure last good data up to maxStale (default ${CODE_DEFAULTS.maxStale} s) stands in`
    ];
    return { lines, problems: 0, upgrade };
}

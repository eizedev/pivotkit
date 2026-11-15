/*
 * check-config's section for HTTP sources (options/http.js): per source where it asks (the template,
 * never a value), where the rows are, its limits and how its data is kept; which backends may reach
 * loopback and private addresses; warnings for a parameter no template uses and for header or query
 * names that look like a secret's with a literal value (the value is never printed). It calls no
 * backend: `pivotkit-server check-source <id>` does that.
 *
 *   HTTP sources (1):
 *     vms: backend platform (https://api.example.com/v1) /customers/{customer}/vms, rows at /items, next page at /next, up to 10 pages / 20 MiB / 15 s, kept 300 s per caller, last good data up to 3600 s; links: none; schedules: yes
 *       params: customer (string, pattern), state (running|stopped)
 *     intranet: backend platform may reach loopback and private addresses (sources vms)
 *
 * check/index.js says what a section returns.
 */

import { httpSettingsOf } from "../options/http.js";
import { bytesText } from "../sources/inline.js";
import { paramsList } from "../sources/params.js";

/** A parameter as the section lists it: its name, and its type, enum, pattern or format. */
function paramText(p, declared) {
    const d = declared[p.name] ?? {};
    const what = p.enum ? p.enum.join("|") : [p.type, d.pattern ? "pattern" : d.format === "date" ? "date" : null, p.required ? "required" : null].filter(Boolean).join(", ");
    return `${p.name} (${what})`;
}

/** @type {import("./index.js").Section} */
export async function section(options, _registry, _runtime) {
    const http = Object.entries(options.sources ?? {}).filter(([, s]) => s.http);
    if (!http.length) {
        return { lines: [], problems: 0, upgrade: [] };
    }
    if (options.httpSources?.enabled === false) {
        return { lines: ["", `HTTP sources: off (httpSources.enabled: false); ${http.length} configured source${http.length === 1 ? " is" : "s are"} ignored`], problems: 0, upgrade: [] };
    }
    const lines = ["", `HTTP sources (${http.length}):`];
    /** @type {Map<string, string[]>} the sources that may reach private addresses, by backend (or source) */
    const intranet = new Map();
    for (const [id, source] of http) {
        const s = httpSettingsOf(source);
        const where = s.backend ? `backend ${s.backend} (${s.backendUrl}) ${s.template.text.slice(s.backendUrl?.replace(/\/+$/, "").length ?? 0)}` : s.template.text;
        const query = s.template.query.length ? `?${s.template.query.map((q) => `${q.name}=${q.param ? `{${q.param}}` : "..."}`).join("&")}` : "";
        const reads = s.format === "csv" ? "a CSV body" : `rows at ${s.rowsText || "the body"}`;
        const kept = `${s.ttl > 0 ? `kept ${s.ttl} s per caller` : "loaded on every call (shared while in flight)"}, last good data ${s.maxStale > 0 ? `up to ${s.maxStale} s` : "off"}`;
        lines.push(`  ${id}: ${where}${query}, ${reads}${s.pagingText ? `, ${s.pagingText}` : ""}, up to ${s.paging ? `${s.maxPages} pages / ` : ""}${bytesText(s.maxBytes)} / ${s.timeMs / 1000} s, ${kept}; links: ${source.link ? "via the source's page only" : "none"}; schedules: yes`);
        const listed = paramsList(source.params);
        if (listed.length) {
            lines.push(`    params: ${listed.map((p) => paramText(p, source.params ?? {})).join(", ")}`);
        }
        for (const name of s.unused) {
            lines.push(`    warning: sources.${id}.params.${name}: no part of the address uses it, so the backend never gets it`);
        }
        for (const name of s.secretLooking) {
            lines.push(`    warning: sources.${id}: the ${name} has a literal value and its name looks like a secret's; a secret written in the configuration file is read by everyone who can read the file`);
        }
        if (s.intranet) {
            const owner = s.backend ? `backend ${s.backend}` : `source ${id}`;
            intranet.set(owner, [...(intranet.get(owner) ?? []), id]);
        }
    }
    for (const [owner, ids] of intranet) {
        lines.push(`  intranet: ${owner} may reach loopback and private addresses (source${ids.length === 1 ? "" : "s"} ${ids.join(", ")})`);
    }
    return { lines, problems: 0, upgrade: [] };
}

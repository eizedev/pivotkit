/*
 * check-config's section for HTTP sources (options/http.js): per source where it asks (the template,
 * never a value), where the rows are, its limits and how its data is kept; which backends may reach
 * loopback and private addresses; warnings for a parameter no template uses and for header or query
 * names that look like a secret's with a literal value (the value is never printed); the backend's
 * sign-in (http.auth): how it is made and where its secrets come from, a PROBLEM for a variable that
 * is not set or a file that cannot be read (never the value or its length), a warning for a secret
 * file other users can read. It calls no backend and no token endpoint: `pivotkit-server
 * check-source <id>` does that.
 *
 *   HTTP sources (1):
 *     vms: backend platform (https://api.example.com/v1) /customers/{customer}/vms?state={state}, rows at /items, next page at /next, up to 10 pages / 20 MiB / 15 s, kept 300 s per caller, last good data up to 3600 s; links: create_link makes none (no sources.<id>.link); schedules: draft_schedule drafts them with the caller's params
 *       params: customer (string, pattern), state (running|stopped)
 *       backend auth: client credentials as pivotkit-backend (secret from a file) at https://auth.example.com/application/o/token/
 *     intranet: backend platform may reach loopback and private addresses (sources vms)
 *
 * check/index.js says what a section returns.
 */

import { isIP } from "node:net";
import { callerOf } from "../auth.js";
import { serverLimitsOf } from "../config.js";
import { httpSettingsOf } from "../options/http.js";
import { addressRefusal } from "../sources/fetch.js";
import { bytesText } from "../sources/inline.js";
import { paramsList } from "../sources/params.js";
import { personBound } from "../sources/auth.js";
import { readSecret, secretFileWarning } from "../secrets.js";

/** The section's heading, which check.js's list of sources points to. */
export const HTTP_HEADING = "HTTP sources";

/**
 * Whether a host is sure to be a loopback or private address: "localhost" and its names, or such an
 * IP address written as the host (a name's address is known only when it is looked up).
 * @param {string} host
 */
const localHost = (host) => {
    const bare = host.replace(/^\[|\]$/g, "").toLowerCase();
    return bare === "localhost" || bare.endsWith(".localhost") || (isIP(bare) !== 0 && addressRefusal(bare, { allowPrivate: false }) === "private");
};

/** A parameter as the section lists it: its name, and its type, enum, pattern or format. */
function paramText(p, declared) {
    const d = declared[p.name] ?? {};
    const what = p.enum ? p.enum.join("|") : [p.type, d.pattern ? "pattern" : d.format === "date" ? "date" : null, p.required ? "required" : null].filter(Boolean).join(", ");
    return `${p.name} (${what})`;
}

/** Where a secret comes from, in words (never its value). */
const fromText = (ref) => (ref.env ? `$${ref.env}` : "a file");

/**
 * How a backend's sign-in is made, in words.
 * @param {import("../options/http.js").BackendAuth} auth
 */
function authText(auth) {
    if (auth.kind === "header") {
        return `header ${auth.name} from ${fromText(auth.value)}`;
    }
    const at = (url) => `${new URL(url).origin}${new URL(url).pathname}`;
    if (auth.kind === "clientCredentials") {
        const secret = auth.clientSecret ? `secret from ${fromText(auth.clientSecret)}` : `assertion from ${fromText(/** @type {any} */ (auth.assertion))}`;
        return `client credentials as ${auth.clientId} (${secret}) at ${at(auth.tokenUrl)}${auth.scope ? `, scope ${auth.scope}` : ""}`;
    }
    const target = [auth.audience !== null ? `audience ${auth.audience}` : null, auth.resource !== null ? `resource ${auth.resource}` : null].filter(Boolean).join(" and ");
    return `token exchange for ${target} at ${auth.tokenUrl ? at(auth.tokenUrl) : "the issuer's token endpoint"} as ${auth.clientId} (secret from ${fromText(auth.clientSecret)}), each token reused up to ${auth.maxAgeSeconds} s; only for a signed-in person`;
}

/**
 * The secrets of a sign-in checked: a PROBLEM line for one that cannot be read, a warning for a file
 * other users can read.
 * @param {import("../options/http.js").BackendAuth} auth
 * @param {import("../config.js").ServerOptions} options
 * @param {Record<string, string | undefined>} env
 * @returns {Promise<{ lines: string[], problems: number }>}
 */
async function secretLines(auth, options, env) {
    /** @type {Array<[string, any]>} */
    const refs = auth.kind === "header" ? [["value", auth.value]] : auth.kind === "clientCredentials" ? [["clientSecret", auth.clientSecret], ["assertion", auth.assertion]] : [["clientSecret", auth.clientSecret]];
    const lines = [];
    let problems = 0;
    for (const [key, ref] of refs) {
        if (!ref) {
            continue;
        }
        try {
            await readSecret(ref, options, env);
        } catch (e) {
            lines.push(`    PROBLEM: ${auth.at}.${key}: ${/** @type {Error} */ (e).message}`);
            problems++;
            continue;
        }
        const warning = await secretFileWarning(ref, options, `${auth.at}.${key} (${ref.file})`);
        if (warning) {
            lines.push(`    ${warning}`);
        }
    }
    return { lines, problems };
}

/** @type {import("./index.js").Section} */
export async function section(options, registry, runtime) {
    const http = Object.entries(options.sources ?? {}).filter(([, s]) => s.http);
    if (!http.length) {
        return { lines: [], problems: 0, upgrade: [] };
    }
    if (options.httpSources?.enabled === false) {
        return { lines: ["", `${HTTP_HEADING}: off (httpSources.enabled: false); ${http.length} configured source${http.length === 1 ? " is" : "s are"} ignored`], problems: 0, upgrade: [] };
    }
    const lines = ["", `${HTTP_HEADING} (${http.length}):`];
    // links and schedules as list_sources says them (a caller holding every scope)
    const sourcesListed = new Map(registry ? (await registry.list(callerOf("none", undefined))).map((e) => [e.id, e]) : []);
    /** @type {Map<string, string[]>} the sources that may reach private addresses, by backend (or source) */
    const intranet = new Map();
    let problems = 0;
    /** @type {Set<object>} the sign-ins whose secrets were checked (a backend's is shared by its sources) */
    const checked = new Set();
    for (const [id, source] of http) {
        const s = httpSettingsOf(source);
        const where = s.backend ? `backend ${s.backend} (${s.backendUrl}) ${s.template.text.slice(s.backendUrl?.replace(/\/+$/, "").length ?? 0)}` : s.template.text;
        const query = s.template.query.length ? `?${s.template.query.map((q) => `${q.name}=${q.param ? `{${q.param}}` : "..."}`).join("&")}` : "";
        const reads = s.format === "csv" ? "a CSV body" : `rows at ${s.rowsText || "the body"}`;
        const kept = `${s.ttl > 0 ? `kept ${s.ttl} s per caller` : "loaded on every call (shared while in flight)"}, last good data ${s.maxStale > 0 ? `up to ${s.maxStale} s` : "off"}`;
        // what a load reads at most: maxBytes, within limits.fileBytes
        const fileBytes = /** @type {number} */ (serverLimitsOf(options).fileBytes);
        const bytes = Math.min(s.maxBytes, fileBytes);
        const entry = sourcesListed.get(id);
        const links = source.link ? "create_link links to the source's page (sources.<id>.link)" : "create_link makes none (no sources.<id>.link)";
        const bound = personBound(options, source);
        const schedules = bound ? `draft_schedule makes none (${s.auth?.kind === "tokenExchange" ? "token exchange" : "a claim"}: the data is the signed-in person's)` : entry?.schedulable === false ? "draft_schedule makes none" : "draft_schedule drafts them with the caller's params";
        lines.push(`  ${id}: ${where}${query}, ${reads}${s.pagingText ? `, ${s.pagingText}` : ""}, up to ${s.paging ? `${s.maxPages} pages / ` : ""}${bytesText(bytes)} / ${s.timeMs / 1000} s, ${kept}; links: ${links}; schedules: ${schedules}`);
        const host = new URL(s.template.origin).hostname;
        if (!s.intranet && localHost(host)) {
            lines.push(`    warning: sources.${id}: ${host} is a loopback or private address, which is refused unless ${s.backend ? `the backend has intranet: true (httpSources.backends.${s.backend}.intranet)` : `the source has http.intranet: true`}`);
        }
        if (s.maxBytes > fileBytes) {
            lines.push(`    warning: sources.${id}: maxBytes (${bytesText(s.maxBytes)}) is over limits.fileBytes (${bytesText(fileBytes)}); a load reads at most ${bytesText(fileBytes)}`);
        }
        const listed = paramsList(source.params);
        if (listed.length) {
            lines.push(`    params: ${listed.map((p) => paramText(p, source.params ?? {})).join(", ")}`);
        }
        if (s.auth) {
            lines.push(`    backend auth: ${authText(s.auth)}${s.auth.at.startsWith("httpSources.") ? ` (${s.auth.at.replace(/\.[^.]+$/, "")})` : ""}`);
            if (!checked.has(s.auth)) {
                checked.add(s.auth);
                const said = await secretLines(s.auth, options, runtime?.env ?? process.env);
                lines.push(...said.lines);
                problems += said.problems;
            }
        }
        const claimed = Object.entries(source.params ?? {}).filter(([, p]) => p?.claim !== undefined);
        if (claimed.length) {
            lines.push(`    from the sign-in: ${claimed.map(([name, p]) => `${name} (claim ${p.claim}${p.claim === "email" ? ", verified only" : ""})`).join(", ")}; listed only for a signed-in person`);
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
    return { lines, problems, upgrade: [] };
}

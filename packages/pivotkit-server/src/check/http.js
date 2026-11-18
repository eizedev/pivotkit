/*
 * check-config's section for HTTP sources (options/http.js): per source where it asks (the template,
 * never a value), where the rows are, its limits and how its data is kept; which backends may reach
 * loopback and private addresses; warnings for a parameter no template uses and for header or query
 * names that look like a secret's with a literal value (the value is never printed); the backend
 * authentication (http.auth): how it is made and where its secrets come from (a file by its full
 * path), a PROBLEM for a variable that is not set or a file that cannot be read (never the value or
 * its length; the server starts and the sources that use it answer SOURCE_UNAVAILABLE), a warning for
 * a secret file other users can read and for a backend's authentication no source uses. It calls no
 * backend and no token endpoint: `pivotkit-server check-source <id>` does that.
 *
 *   HTTP sources (1):
 *     vms: backend platform (https://api.example.com/v1)
 *       GET /customers/{customer}/vms?state={state}
 *       rows at /items
 *       up to 20 MiB / 15 s
 *       kept 300 s per caller
 *       last good data: up to 3600 s
 *       create_link: none (no sources.<id>.link)
 *       draft_schedule: drafts with the caller's params
 *       params: customer (string, pattern), state (running|stopped)
 *       backend authentication: client credentials as pivotkit-backend at
 *         https://auth.example.com/application/o/token/ (httpSources.backends.platform)
 *         client secret from the file secrets/backend-secret (/etc/pivotkit/secrets/backend-secret)
 *
 * check/index.js says what a section returns.
 */

import { isIP } from "node:net";
import { callerOf } from "../auth.js";
import { serverLimitsOf } from "../config.js";
import { backendAuthOf, httpSettingsOf } from "../options/http.js";
import { addressRefusal } from "../sources/fetch.js";
import { bytesText } from "../text.js";
import { paramsList } from "../sources/params.js";
import { personBound } from "../sources/auth.js";
import { secretFileWarning } from "../secrets.js";
import { secretsOf } from "../sources/auth.js";
import { heading, plain, problem, secretText, warning } from "./format.js";

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


/**
 * How a backend's authentication is made, in words: the first line, then where each secret comes
 * from.
 * @param {import("../options/http.js").BackendAuth} auth
 * @param {import("../config.js").ServerOptions} options
 * @returns {string[]}
 */
function authLines(auth, options) {
    if (auth.kind === "header") {
        return [`header ${auth.name}`, `value from ${secretText(options, auth.value)}`];
    }
    const at = (url) => `${new URL(url).origin}${new URL(url).pathname}`;
    if (auth.kind === "clientCredentials") {
        const secret = auth.clientSecret ? `client secret from ${secretText(options, auth.clientSecret)}` : `assertion from ${secretText(options, /** @type {any} */ (auth.assertion))}`;
        return [`client credentials as ${auth.clientId} at ${at(auth.tokenUrl)}${auth.scope ? `, scope ${auth.scope}` : ""}`, secret];
    }
    const target = [auth.audience !== null ? `audience ${auth.audience}` : null, auth.resource !== null ? `resource ${auth.resource}` : null].filter(Boolean).join(" and ");
    return [
        `token exchange for ${target} at ${auth.tokenUrl ? at(auth.tokenUrl) : "the issuer's token endpoint"} as ${auth.clientId}`,
        `client secret from ${secretText(options, auth.clientSecret)}`,
        `each token reused up to ${auth.maxAgeSeconds} s; only for a signed-in person`
    ];
}

/**
 * The secrets of a backend's authentication checked: a PROBLEM for one that cannot be read (the
 * server starts; the sources that use it answer SOURCE_UNAVAILABLE), or a WARNING where no source
 * uses it; a WARNING for a file other users can read and for a token endpoint on a private address.
 * @param {import("../options/http.js").BackendAuth} auth
 * @param {import("../config.js").ServerOptions} options
 * @param {Record<string, string | undefined>} env
 * @param {string[]} users  the sources that use it (none: a backend's authentication every source replaces)
 * @returns {Promise<import("./format.js").Item[]>}
 */
async function secretItems(auth, options, env, users) {
    const items = [];
    for (const secret of await secretsOf(auth, options, env)) {
        if (secret.problem) {
            items.push(users.length ? problem(`${secret.at}: ${secret.problem}`, { effect: `the server starts; ${users.join(", ")} answer${users.length === 1 ? "s" : ""} SOURCE_UNAVAILABLE` }) : warning(`${secret.at}: ${secret.problem}`));
            continue;
        }
        const readable = await secretFileWarning(secret.ref, options, `${secret.at} (${/** @type {any} */ (secret.ref).file})`);
        if (readable) {
            items.push(warning(readable));
        }
    }
    if (auth.kind !== "header") {
        const url = auth.tokenUrl ? new URL(auth.tokenUrl) : null;
        if (url && !auth.intranet && localHost(url.hostname)) {
            items.push(warning(`${auth.at}.tokenUrl: ${url.hostname} is a loopback or private address, which is refused unless intranet: true is set there`));
        }
        if (url && auth.kind === "tokenExchange" && auth.issuer && URL.canParse(auth.issuer) && new URL(auth.issuer).origin !== url.origin) {
            items.push(warning(`${auth.at}.tokenUrl: the person's token goes to ${url.host}, not to the issuer's ${new URL(auth.issuer).host}; check that this is the provider's token endpoint`));
        }
    }
    // RFC 8693 leaves scope optional; Authentik then issues a token with no scopes at all
    if (auth.kind === "tokenExchange" && auth.scope === null) {
        items.push(warning(`${auth.at}: no scope; some providers, Authentik among them, then issue a token without scopes. Set scope to the narrowest the backend needs`));
    }
    return items;
}

/** @type {import("./index.js").Section} */
export async function section(options, registry, runtime) {
    const http = Object.entries(options.sources ?? {}).filter(([, s]) => s.http);
    if (!http.length) {
        return { items: [], upgrade: [] };
    }
    if (options.httpSources?.enabled === false) {
        return { items: [heading(`${HTTP_HEADING}: off (httpSources.enabled: false)`), plain(`${http.length} configured source${http.length === 1 ? " is" : "s are"} ignored`)], upgrade: [] };
    }
    const items = [heading(`${HTTP_HEADING} (${http.length}):`)];
    const env = runtime?.env ?? process.env;
    // links and schedules as list_sources says them (a caller holding every scope)
    const sourcesListed = new Map(registry ? (await registry.list(callerOf("none", undefined))).map((e) => [e.id, e]) : []);
    /** @type {Map<string, string[]>} the sources that may reach private addresses, by backend (or source) */
    const intranet = new Map();
    // each authentication with the sources that use it (a backend's is shared by its sources)
    /** @type {Map<object, string[]>} */
    const users = new Map();
    for (const [id, source] of http) {
        const auth = httpSettingsOf(source).auth;
        if (auth) users.set(auth, [...(users.get(auth) ?? []), id]);
    }
    /** @type {Set<object>} the authentications whose secrets were checked */
    const checked = new Set();
    for (const [id, source] of http) {
        const s = httpSettingsOf(source);
        const path = s.backend ? s.template.text.slice(s.backendUrl?.replace(/\/+$/, "").length ?? 0) : s.template.text;
        const query = s.template.query.length ? `?${s.template.query.map((q) => `${q.name}=${q.param ? `{${q.param}}` : "..."}`).join("&")}` : "";
        // what a load reads at most: maxBytes, within limits.fileBytes
        const fileBytes = /** @type {number} */ (serverLimitsOf(options).fileBytes);
        const bytes = Math.min(s.maxBytes, fileBytes);
        const entry = sourcesListed.get(id);
        const bound = personBound(options, source);
        items.push(plain(s.backend ? `${id}: backend ${s.backend} (${s.backendUrl})` : `${id}:`));
        items.push(plain(`GET ${path}${query}`, 2));
        items.push(plain(s.format === "csv" ? "reads a CSV body" : `rows at ${s.rowsText || "the body"}`, 2));
        if (s.pagingText) items.push(plain(s.pagingText, 2));
        items.push(plain(`up to ${s.paging ? `${s.maxPages} pages / ` : ""}${bytesText(bytes)} / ${s.timeMs / 1000} s`, 2));
        items.push(plain(s.ttl > 0 ? `kept ${s.ttl} s per caller` : "loaded on every call (shared while in flight)", 2));
        items.push(plain(`last good data: ${s.maxStale > 0 ? `up to ${s.maxStale} s` : "off"}`, 2));
        items.push(plain(`create_link: ${source.link ? "links to the source's page (sources.<id>.link)" : "none (no sources.<id>.link)"}`, 2));
        items.push(plain(`draft_schedule: ${bound ? `none (${s.auth?.kind === "tokenExchange" ? "token exchange" : "a claim"}: the data is the signed-in person's)` : entry?.schedulable === false ? "none" : "drafts with the caller's params"}`, 2));
        const host = new URL(s.template.origin).hostname;
        if (!s.intranet && localHost(host)) {
            items.push(warning(`sources.${id}: ${host} is a loopback or private address, which is refused unless ${s.backend ? `the backend has intranet: true (httpSources.backends.${s.backend}.intranet)` : `the source has http.intranet: true`}`));
        }
        if (s.maxBytes > fileBytes) {
            items.push(warning(`sources.${id}: maxBytes (${bytesText(s.maxBytes)}) is over limits.fileBytes (${bytesText(fileBytes)}); a load reads at most ${bytesText(fileBytes)}`));
        }
        const listed = paramsList(source.params);
        if (listed.length) {
            items.push(plain(`params: ${listed.map((p) => paramText(p, source.params ?? {})).join(", ")}`, 2));
        }
        if (s.auth) {
            const [first, ...rest] = authLines(s.auth, options);
            items.push(plain(`backend authentication: ${first}${s.auth.at.startsWith("httpSources.") ? ` (${s.auth.at.replace(/\.[^.]+$/, "")})` : ""}`, 2), ...rest.map((t) => plain(t, 3)));
            if (!checked.has(s.auth)) {
                checked.add(s.auth);
                items.push(...(await secretItems(s.auth, options, env, users.get(s.auth) ?? [id])));
            }
        }
        const claimed = Object.entries(source.params ?? {}).filter(([, p]) => p?.claim !== undefined);
        if (claimed.length) {
            items.push(plain(`from the person's token: ${claimed.map(([name, p]) => `${name} (claim ${p.claim}${p.claim === "email" ? ", verified only" : ""})`).join(", ")}; listed only for a signed-in person`, 2));
        }
        for (const name of s.unused) {
            items.push(warning(`sources.${id}.params.${name}: no part of the address uses it, so the backend never gets it`));
        }
        for (const name of s.secretLooking) {
            items.push(warning(`sources.${id}: the ${name} has a literal value and its name looks like a secret's; a secret written in the configuration file is read by everyone who can read the file`));
        }
        if (s.intranet) {
            const owner = s.backend ? `backend ${s.backend}` : `source ${id}`;
            intranet.set(owner, [...(intranet.get(owner) ?? []), id]);
        }
    }
    for (const [owner, ids] of intranet) {
        items.push(plain(`intranet: ${owner} may reach loopback and private addresses (source${ids.length === 1 ? "" : "s"} ${ids.join(", ")})`));
    }
    // a backend's authentication that every source of it replaces with its own: its secrets still
    // checked, as warnings (a later source without http.auth would use it)
    for (const [name, backend] of Object.entries(options.httpSources?.backends ?? {})) {
        if (backend.auth === undefined || http.some(([, s]) => s.http?.backend === name && s.http.auth === undefined)) {
            continue;
        }
        items.push(warning(`httpSources.backends.${name}.auth is not used by any source (a source with its own http.auth replaces it)`));
        items.push(...(await secretItems(backendAuthOf(options, backend.auth, `httpSources.backends.${name}.auth`, {}), options, env, [])));
    }
    return { items, upgrade: [] };
}

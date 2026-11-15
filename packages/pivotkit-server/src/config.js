/*
 * The server's options, shared by the MCP server and the REST service: one table of every key with
 * its type (OPTION_KEYS, composed from this module's keys and each feature's fragment in options/), the check of an options object against it (validateOptions: an unknown key
 * is an error with "did you mean"), and the configuration file (loadConfig: JSON, paths relative to
 * the file). The runners' flags are made from the same table, so the docs' configuration reference,
 * the help and the checks cannot drift apart.
 */

import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { LIMITS, closest } from "pivotkit-core";
import { OPERATION_NAMES } from "pivotkit-report/operations";
import { REST_BASE, SOURCE_ID } from "pivotkit-cli/rest";
import { POLICY_LEVELS } from "./policy.js";
import { STATS_DISTINCT } from "./stats.js";
import { FRAGMENTS, composeSlots } from "./options/index.js";
import { ConfigError } from "./options/shared.js";

/** The error of a wrong option (options/shared.js, so a fragment can throw it without importing this module). */
export { ConfigError } from "./options/shared.js";

/**
 * @typedef {object} PolicyOptions
 * @property {"show" | "values" | "summary" | "hide"} [default]  the level of a field without its own (default "summary")
 * @property {Record<string, "show" | "values" | "summary" | "hide">} [fields]  levels by field name (case-insensitive)
 * @property {number} [items]  values listed per "show" field (default 20)
 * @property {number} [valuesMax]  server and source only: the most distinct values a "values" field may have (default 50, at most 1000)
 * @property {boolean | { maxDistinct?: number, minRowsPerValue?: number, minRows?: number, deny?: string[] }} [autoValues]  server and source only: the automatic "values" level for text fields that look like categories, where no default is written (default false)
 * @property {boolean} [rows]  show the row count (default true)
 * @property {boolean} [counts]  show distinct and blank counts (default true)
 * @property {{ cells?: number, bytes?: number } | false} [inline]  results that may come back in the tool result (default 500 cells, 32 KiB)
 * @property {boolean} [results]  REST: the caller may download a rendered file (POST /api/v1/views/render/file; default false)
 * @property {boolean} [data]  server and profiles only: the caller may send its own data (source "inline:"); REST only with true, MCP unless false
 * @property {Record<string, PolicyOptions>} [profiles]  server level only: named policies bound to tokens, OAuth clients, groups or scopes (auth.tokens[].profile, auth.clientProfiles, auth.groupProfiles, auth.scopeProfiles, auth.defaultProfile)
 */

/**
 * @typedef {object} SourceOptionsBase  what every source takes; SourceOptions adds load, version and cacheShared
 * @property {string} [file]  a CSV, TSV, JSON or XLSX file (relative to the config file)
 * @property {string} [title]
 * @property {string} [description]
 * @property {string} [sheet]  a workbook's sheet
 * @property {string} [link]  the address of the page that shows this source's reports (create_link)
 * @property {string} [linkKey]  the report's key on that page, when it has more than one
 * @property {string} [template]  an HTML print template file for render_view's html
 * @property {string[]} [scopes]  OAuth scopes a caller needs to see and use the source
 * @property {PolicyOptions} [policy]
 * @property {Record<string, { type: "string" | "integer" | "number" | "boolean", required?: boolean, description?: string, example?: string | number | boolean, enum?: Array<string | number>, pattern?: string, minLength?: number, maxLength?: number, minimum?: number, maximum?: number, format?: "date", default?: string | number | boolean, claim?: string }>} [params]  values a caller passes with the source (a code source gets them: load(params, { caller })); claim: filled from that claim of the caller's verified token, never from the caller
 * @property {Record<string, { description?: string }>} [fields]  the operator's words about fields, shown by describe_source (at most 500 characters each)
 * @property {import("./options/http.js").HttpSourceOptions} [http]  an HTTP source: the backend's address and how to read its answer (instead of file or load)
 * @property {number} [ttl]  code and HTTP sources: seconds a load is reused (code: default only while version() gives the same; HTTP: 60)
 * @property {number} [maxStale]  code and HTTP sources: seconds the last good data stands in after a transient failure (default 3600; 0: never)
 * @property {number} [timeMs]  code and HTTP sources: the longest load, in ms (code: default 30000, HTTP: 15000; the signal is aborted then)
 */

/**
 * A source: a file, or a library host's code source (load instead of file; sources/code.js), whose
 * load gets the caller unless cacheShared is true (then null: one copy of the data for all callers).
 * version is called at once on every call (never awaited) and must be cheap; kept data is reused
 * while it gives the same value.
 * @typedef {SourceOptionsBase & ({ load?: import("./sources/code.js").SourceLoad, version?: import("./sources/code.js").SourceVersion, cacheShared?: false } | { load: import("./sources/code.js").SharedSourceLoad, version?: import("./sources/code.js").SharedSourceVersion, cacheShared: true })} SourceOptions
 */

/**
 * @typedef {object} ServerOptions
 * @property {Record<string, SourceOptions>} [sources]
 * @property {{ allowDirs?: string[], list?: boolean, hardLinks?: boolean, scopes?: string[], policy?: PolicyOptions }} [files]
 * @property {{ dir?: string, create?: boolean, baseUrl?: string, maxFiles?: number, maxMb?: number, maxAgeDays?: number, downloads?: import("./options/downloads.js").DownloadOptions }} [output]  create: make a missing dir at start (default true); downloads: the server's own download links
 * @property {PolicyOptions} [policy]
 * @property {Partial<import("pivotkit-core").Limits>} [limits]
 * @property {string} [locale]
 * @property {string} [timeZone]
 * @property {{ workers?: number, timeMs?: number, memoryMb?: number, queueMs?: number }} [compute]
 * @property {{ host?: string, port?: number, publicUrl?: string, allowHosts?: string[], allowOrigins?: string[], page?: boolean | { sources?: boolean }, enable?: Array<"mcp" | "rest">, trustProxy?: boolean, graceMs?: number, maxConnectionsPerAddress?: number }} [http]
 * @property {AuthOptions} [auth]
 * @property {RestOptions} [rest]
 * @property {{ rateLimit?: { perMinute?: number, burst?: number, failedAuthPerMinute?: number }, concurrency?: number, data?: false | { rows?: number, cells?: number, bytes?: number } }} [mcp]  the MCP endpoint over HTTP: its limits per caller, and per address for refused tokens; data: inline data off, or a lower cap
 * @property {import("./options/http.js").HttpSourcesOptions} [httpSources]  HTTP sources on or off, IP addresses as hosts, backends defined once
 * @property {"info" | "debug" | "off"} [log]
 * @property {{ subject?: "off" | "hash" | "plain", key?: { env?: string, file?: string } }} [audit]  the person in the log lines of calls, requests and downloads (default off)
 * @property {string} [baseDir]  where relative paths start (loadConfig sets the config file's directory; default the working directory)
 */

/** @typedef {ServerOptions} McpOptions  the same options under the MCP server's name */

/**
 * @typedef {object} RestOptions
 * @property {string} [resource]  OAuth: the REST service's resource (default the origin of auth.resource with /api/v1)
 * @property {string[]} [audience]  OAuth: the audiences a REST token may carry (default the resource)
 * @property {string[]} [requiredScopes]  OAuth: scopes every REST call needs (default auth.requiredScopes)
 * @property {{ origins?: string[], maxAge?: number }} [cors]  browser origins allowed to call (exact origins; none by default)
 * @property {"auth" | "public" | "off"} [openapi]  /openapi.json: for authenticated callers (default), for anyone, or not served
 * @property {boolean} [inline]  csv and json results may come back in the JSON answer (default false)
 * @property {{ perMinute?: number, burst?: number, failedAuthPerMinute?: number }} [rateLimit]  per caller, and per address for refused tokens
 * @property {number} [concurrency]  requests of one caller at once (default 4)
 * @property {{ maxBytes?: number }} [data]  the largest body of a caller that may send data (default 10 MiB, at most 64 MiB)
 */

/**
 * @typedef {object} AuthOptions
 * @property {"none" | "token" | "oauth"} [mode]
 * @property {boolean} [allowUnauthenticated]  "none" on an address other than loopback
 * @property {Array<{ name: string, env?: string, file?: string, scopes?: string[], profile?: string }>} [tokens]
 * @property {string} [issuer]
 * @property {string} [resource]
 * @property {string[]} [audience]
 * @property {string[]} [algorithms]
 * @property {string} [jwksUri]
 * @property {string[]} [scopesSupported]
 * @property {string[]} [requiredScopes]
 * @property {Record<string, string[]>} [toolScopes]
 * @property {string} [scopeClaim]
 * @property {string} [subjectClaim]  the claim that names the person (default "sub"): the identity caches and bindings use
 * @property {number} [clockTolerance]
 * @property {string} [requireTyp]
 * @property {boolean} [allowInsecureIssuer]
 * @property {Record<string, string>} [clientProfiles]  OAuth client id to policy profile
 * @property {Record<string, string>} [scopeProfiles]  OAuth scope to policy profile
 * @property {string} [groupsClaim]  the claim with a person's groups, a list (default "groups")
 * @property {string} [groupsSeparator]  also accept a text groups claim, split by this separator
 * @property {Array<{ group: string, profile: string }>} [groupProfiles]  a person's group to policy profile; the first matching entry wins
 * @property {string} [defaultProfile]  the profile of a signed-in caller no token, client, group or scope entry names
 * @property {boolean} [offerSourceScopes]  offer the sources' scopes in the OAuth metadata (default false)
 */

/** The import limits a server uses unless the operator sets them: lower than a command line's. */
export const SERVER_LIMITS = Object.freeze({ fileBytes: 52_428_800, unpackedBytes: 52_428_800 });

/**
 * The limits a server's sources are read with: SERVER_LIMITS under the operator's `limits` (the
 * registry's, check-config's and check-source's alike).
 * @param {ServerOptions} options
 * @returns {{ fileBytes: number, unpackedBytes: number, [limit: string]: number }}
 */
export const serverLimitsOf = (options) => ({ ...SERVER_LIMITS, ...(options.limits ?? {}) });

/** The defaults of the compute pool. */
export const COMPUTE_DEFAULTS = Object.freeze({ workers: 2, timeMs: 30_000, memoryMb: 1024, queueMs: 10_000 });

/** How many reports and drafts the output directory holds, and how many megabytes, before its oldest go. */
export const OUTPUT_DEFAULTS = Object.freeze({ maxFiles: 1000, maxMb: 1024 });

/** The JWT signature algorithms accepted by default: asymmetric only. */
export const DEFAULT_ALGORITHMS = Object.freeze(["RS256", "PS256", "ES256", "EdDSA"]);

// A small schema language for the options: "string", "boolean", "integer", "strings" (array of
// strings), "function", { enum: [...] }, { object: {...} } (known keys), { map: <schema> } (any keys),
// { custom: (value) => problems } (a check of its own, each problem "<key path>: <what>").
//
// The table is composed: config.js's own keys below, grouped by slot (options/shared.js SLOTS), and
// each feature's fragment (options/<feature>.js) adds its keys to a slot. A key is declared once.

/** The parts of the HTTP server the runner of pivotkit-server can serve. */
export const ENDPOINTS = Object.freeze(["mcp", "rest"]);

/** A key whose schema is built from the composed slots (a top-level object, a source's policy). */
const SLOT = Symbol("slot");

/** A request limit's keys, the same for rest.* and mcp.*. */
const RATE_LIMIT = { object: { perMinute: "integer", burst: "integer", failedAuthPerMinute: "integer" } };

/** config.js's own keys by slot; the order is the one "known: ..." lists print. */
const BASE_SLOTS = {
    top: { sources: SLOT, files: SLOT, output: SLOT, policy: SLOT, limits: { map: "integer" }, locale: "string", timeZone: "string", compute: { object: { workers: "integer", timeMs: "integer", memoryMb: "integer", queueMs: "integer" } }, http: SLOT, auth: SLOT, mcp: SLOT, rest: SLOT, log: { enum: ["info", "debug", "off"] }, baseDir: "string" },
    source: { file: "string", load: "function", version: "function", title: "string", description: "string", sheet: "string", link: "string", linkKey: "string", template: "string", scopes: "strings", policy: SLOT },
    // a profile's and files.policy's keys; a source's and the server's add the "values" settings,
    // which belong to the data, not to a caller (a profile never gets the automatic rule) or a file: path
    policy: { default: { enum: POLICY_LEVELS }, fields: { map: { enum: POLICY_LEVELS } }, items: "integer", rows: "boolean", counts: "boolean", inline: { or: [{ const: false }, { object: { cells: "integer", bytes: "integer" } }] }, results: "boolean" },
    http: { host: "string", port: "integer", publicUrl: "string", allowHosts: "strings", allowOrigins: "strings", page: { or: [{ const: false }, { const: true }, { object: { sources: "boolean" } }] }, enable: { list: { enum: ENDPOINTS } }, trustProxy: "boolean", graceMs: "integer", maxConnectionsPerAddress: "integer" },
    auth: {
        mode: { enum: ["none", "token", "oauth"] },
        allowUnauthenticated: "boolean",
        tokens: { list: { object: { name: "string", env: "string", file: "string", scopes: "strings", profile: "string" } } },
        issuer: "string",
        resource: "string",
        audience: "strings",
        algorithms: "strings",
        jwksUri: "string",
        scopesSupported: "strings",
        requiredScopes: "strings",
        toolScopes: { map: "strings" },
        scopeClaim: "string",
        subjectClaim: "string",
        clockTolerance: "integer",
        requireTyp: "string",
        allowInsecureIssuer: "boolean",
        clientProfiles: { map: "string" },
        scopeProfiles: { map: "string" }
    },
    mcp: { rateLimit: RATE_LIMIT, concurrency: "integer" },
    rest: { resource: "string", audience: "strings", requiredScopes: "strings", cors: { object: { origins: "strings", maxAge: "integer" } }, openapi: { enum: ["auth", "public", "off"] }, inline: "boolean", rateLimit: RATE_LIMIT, concurrency: "integer" },
    output: { dir: "string", create: "boolean", baseUrl: "string", maxFiles: "integer", maxMb: "integer", maxAgeDays: "integer" }
};

const SLOTS = composeSlots(/** @type {any} */ (BASE_SLOTS), FRAGMENTS);
const POLICY = { object: SLOTS.policy };
const AUTO_VALUES_OPTION = { or: ["boolean", { object: { maxDistinct: "integer", minRowsPerValue: "integer", minRows: "integer", deny: "strings" } }] };
/** A source's policy. */
const SOURCE_POLICY = { object: { ...POLICY.object, valuesMax: "integer", autoValues: AUTO_VALUES_OPTION } };
/** The server's policy: a source's, plus the named profiles. */
const SERVER_POLICY = { object: { ...SOURCE_POLICY.object, profiles: { map: POLICY } } };
/** The schemas of the top-level keys built from a slot. */
const FROM_SLOTS = {
    sources: { map: { object: Object.fromEntries(Object.entries(SLOTS.source).map(([key, schema]) => [key, schema === SLOT ? SOURCE_POLICY : schema])) } },
    files: { object: { allowDirs: "strings", list: "boolean", hardLinks: "boolean", scopes: "strings", policy: POLICY } },
    output: { object: SLOTS.output },
    policy: SERVER_POLICY,
    http: { object: SLOTS.http },
    auth: { object: SLOTS.auth },
    mcp: { object: SLOTS.mcp },
    rest: { object: SLOTS.rest }
};

/** Every option, nested as the options object is. */
export const OPTION_KEYS = Object.freeze(Object.fromEntries(Object.entries(SLOTS.top).map(([key, schema]) => [key, schema === SLOT ? FROM_SLOTS[/** @type {keyof typeof FROM_SLOTS} */ (key)] : schema])));

/** A source id: letters, digits, "_", "-", "." (no "file:", no path); pivotkit-cli/rest's, which the CLI checks an id against. */
export { SOURCE_ID } from "pivotkit-cli/rest";

/** Checks a value against a schema of the small language above; throws ConfigError with the key's path. */
function check(value, schema, path) {
    const fail = (what) => {
        throw new ConfigError(path ? `${path}: ${what}` : `the options: ${what}`);
    };
    if (schema === "string") {
        return typeof value === "string" || fail("must be a text");
    }
    if (schema === "boolean") {
        return typeof value === "boolean" || fail("must be true or false");
    }
    if (schema === "integer") {
        return (Number.isSafeInteger(value) && value >= 0) || fail("must be a whole number of 0 or more");
    }
    if (schema === "function") {
        return typeof value === "function" || fail("must be a function (a library host's option; not in a config file)");
    }
    if (schema === "strings") {
        return (Array.isArray(value) && value.every((v) => typeof v === "string")) || fail("must be a list of texts");
    }
    if (schema.custom) {
        const problems = schema.custom(value);
        return !problems.length || fail(problems.join("; "));
    }
    if (schema.enum) {
        return schema.enum.includes(value) || fail(`must be one of ${schema.enum.join(", ")}${typeof value === "string" && closest(value, schema.enum) ? `; did you mean ${closest(value, schema.enum)}?` : ""}`);
    }
    if ("const" in schema) {
        return value === schema.const || fail(`must be ${JSON.stringify(schema.const)}`);
    }
    if (schema.or) {
        const errors = [];
        for (const option of schema.or) {
            try {
                return check(value, option, path);
            } catch (e) {
                errors.push(e.message);
            }
        }
        return fail(errors.map((e) => e.slice(path.length + 2)).join(", or "));
    }
    if (schema.list) {
        if (!Array.isArray(value)) {
            fail("must be a list");
        }
        value.forEach((v, i) => check(v, schema.list, `${path}[${i}]`));
        return true;
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return fail("must be an object");
    }
    for (const [key, v] of Object.entries(value)) {
        const inner = schema.map ?? (Object.hasOwn(schema.object, key) ? schema.object[key] : null);
        if (!inner) {
            const near = closest(key, Object.keys(schema.object));
            fail(`unknown key "${key.slice(0, 60)}"${near ? `; did you mean "${near}"?` : ""} (known: ${Object.keys(schema.object).join(", ")})`);
        }
        if (v !== undefined) {
            check(v, inner, path ? `${path}.${key}` : key);
        }
    }
    return true;
}

/**
 * Checks an options object: every key known, every value of its type, and the rules between keys.
 * Throws ConfigError with the key's path and what to do.
 * @param {ServerOptions} options
 * @returns {ServerOptions}  the same object
 */
export function validateOptions(options) {
    check(options, { object: OPTION_KEYS }, "");
    for (const [id, source] of Object.entries(options.sources ?? {})) {
        if (!SOURCE_ID.test(id)) {
            throw new ConfigError(`sources.${id.slice(0, 60)}: an id is letters, digits, "_", "-" and "." (at most 64), starting with a letter or digit`);
        }
        if ([source.file, source.load, /** @type {any} */ (source).http].filter(Boolean).length !== 1) {
            throw new ConfigError(`sources.${id}: give either file or load, or http (exactly one of them)`);
        }
        if (source.link !== undefined) {
            urlOf(source.link, `sources.${id}.link`);
        }
    }
    for (const key of Object.keys(options.limits ?? {})) {
        if (!Object.hasOwn(LIMITS, key)) {
            const near = closest(key, Object.keys(LIMITS));
            throw new ConfigError(`limits.${key}: unknown limit${near ? `; did you mean "${near}"?` : ""}`);
        }
    }
    for (const tool of Object.keys(options.auth?.toolScopes ?? {})) {
        if (!OPERATION_NAMES.includes(tool)) {
            const near = closest(tool, [...OPERATION_NAMES]) ?? OPERATION_NAMES.find((n) => n.split("_").includes(tool.toLowerCase()));
            throw new ConfigError(`auth.toolScopes.${tool}: no such tool${near ? `; did you mean "${near}"?` : ""}`);
        }
    }
    for (const [i, token] of (options.auth?.tokens ?? []).entries()) {
        if (!token.name || Boolean(token.env) === Boolean(token.file)) {
            throw new ConfigError(`auth.tokens[${i}]: a token has a name and either env (the variable that holds it) or file`);
        }
    }
    if (options.auth?.mode === "oauth") {
        for (const key of ["issuer", "resource"]) {
            if (!options.auth[key]) {
                throw new ConfigError(`auth.${key}: needed for auth.mode "oauth"`);
            }
        }
        urlOf(options.auth.issuer, "auth.issuer");
        urlOf(options.auth.resource, "auth.resource");
        for (const alg of options.auth.algorithms ?? []) {
            if (/^(none|HS\d+)$/i.test(alg)) {
                throw new ConfigError(`auth.algorithms: ${alg} is not accepted (no "none", no shared-secret HMAC)`);
            }
        }
    }
    const profiles = Object.keys(options.policy?.profiles ?? {});
    const profileRefs = [...(options.auth?.tokens ?? []).map((t, i) => [`auth.tokens[${i}].profile`, t.profile]), ...Object.entries(options.auth?.clientProfiles ?? {}).map(([k, v]) => [`auth.clientProfiles.${k}`, v]), ...Object.entries(options.auth?.scopeProfiles ?? {}).map(([k, v]) => [`auth.scopeProfiles.${k}`, v])];
    for (const [path, name] of profileRefs) {
        if (name !== undefined && !profiles.includes(name)) {
            const near = closest(String(name), profiles);
            throw new ConfigError(`${path}: no profile "${String(name).slice(0, 60)}" in policy.profiles${near ? `; did you mean "${near}"?` : ""}`);
        }
    }
    for (const [name, profile] of Object.entries(options.policy?.profiles ?? {})) {
        if (!SOURCE_ID.test(name)) {
            throw new ConfigError(`policy.profiles.${name.slice(0, 60)}: a profile's name is letters, digits, "_", "-" and "." (at most 64)`);
        }
        if (profile.default === "hide") {
            throw new ConfigError(`policy.profiles.${name}.default: "hide" would drop every field; list the fields to hide in fields`);
        }
    }
    for (const [path, policy] of /** @type {Array<[string, any]>} */ ([["policy", options.policy], ...Object.entries(options.sources ?? {}).map(([id, source]) => [`sources.${id}.policy`, source.policy])])) {
        for (const [key, value] of /** @type {Array<[string, number | undefined]>} */ ([["valuesMax", policy?.valuesMax], ["autoValues.maxDistinct", policy?.autoValues?.maxDistinct]])) {
            if (value !== undefined && (value < 1 || value > STATS_DISTINCT)) {
                throw new ConfigError(`${path}.${key}: 1 to ${STATS_DISTINCT}`);
            }
        }
        for (const key of ["minRows", "minRowsPerValue"]) {
            if (policy?.autoValues?.[key] !== undefined && policy.autoValues[key] < 1) {
                throw new ConfigError(`${path}.autoValues.${key}: must be 1 or more`);
            }
        }
    }
    if (options.rest?.resource) {
        urlOf(options.rest.resource, "rest.resource");
    }
    for (const [i, origin] of (options.rest?.cors?.origins ?? []).entries()) {
        let url = null;
        try {
            url = new URL(origin);
        } catch {
            // reported below
        }
        if (!url || url.origin !== origin || (url.protocol !== "https:" && url.protocol !== "http:")) {
            throw new ConfigError(`rest.cors.origins[${i}]: an origin is scheme, host and port as a browser sends it (https://app.example.com), without a path${origin === "*" ? '; "*" is not accepted: list each origin' : ""}`);
        }
    }
    if (options.http?.publicUrl) {
        urlOf(options.http.publicUrl, "http.publicUrl");
    }
    if (options.output?.baseUrl) {
        urlOf(options.output.baseUrl, "output.baseUrl");
    }
    if (options.http?.maxConnectionsPerAddress !== undefined && options.http.maxConnectionsPerAddress > 256) {
        throw new ConfigError("http.maxConnectionsPerAddress: 0 (no bound, the default) to 256");
    }
    if (options.compute?.workers !== undefined && options.compute.workers > 16) {
        throw new ConfigError("compute.workers: at most 16");
    }
    for (const [path, value] of /** @type {Array<[string, number | undefined]>} */ ([["compute.workers", options.compute?.workers], ["compute.timeMs", options.compute?.timeMs], ["compute.memoryMb", options.compute?.memoryMb], ["output.maxFiles", options.output?.maxFiles], ["output.maxMb", options.output?.maxMb], ["output.maxAgeDays", options.output?.maxAgeDays], ["rest.concurrency", options.rest?.concurrency], ["rest.rateLimit.perMinute", options.rest?.rateLimit?.perMinute], ["rest.rateLimit.burst", options.rest?.rateLimit?.burst], ["rest.rateLimit.failedAuthPerMinute", options.rest?.rateLimit?.failedAuthPerMinute], ["mcp.concurrency", options.mcp?.concurrency], ["mcp.rateLimit.perMinute", options.mcp?.rateLimit?.perMinute], ["mcp.rateLimit.burst", options.mcp?.rateLimit?.burst], ["mcp.rateLimit.failedAuthPerMinute", options.mcp?.rateLimit?.failedAuthPerMinute], ["http.port", options.http?.port === 0 ? undefined : options.http?.port]])) {
        if (value !== undefined && value < 1) {
            throw new ConfigError(`${path}: must be 1 or more`);
        }
    }
    // each feature's own rules, in the fragments' order
    for (const fragment of FRAGMENTS) {
        fragment.validate(options);
    }
    return options;
}

/** An http(s) address, or a ConfigError. */
function urlOf(text, path) {
    let url;
    try {
        url = new URL(text);
    } catch {
        throw new ConfigError(`${path}: not an address (https://...)`);
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new ConfigError(`${path}: must start with https:// (or http://)`);
    }
    return url;
}

/**
 * Reads a configuration file (JSON) into options: checked, `baseDir` set to the file's directory so
 * relative paths start there.
 * @param {string} file
 * @returns {Promise<ServerOptions>}
 */
export async function loadConfig(file) {
    let text;
    try {
        text = await readFile(file, "utf8");
    } catch (e) {
        throw new ConfigError(`${file}: ${e?.code === "ENOENT" ? "not found" : "cannot be read"}`);
    }
    let options;
    try {
        options = JSON.parse(text.replace(/^\uFEFF/, ""));
    } catch (e) {
        throw new ConfigError(`${file}: not valid JSON (${String(e.message).slice(0, 120)})`);
    }
    validateOptions(options);
    return { ...options, baseDir: options.baseDir ? resolve(dirname(resolve(file)), options.baseDir) : dirname(resolve(file)) };
}

/** The REST service's path (pivotkit-cli/rest's, the CLI's remote mode names it). */
export { REST_BASE } from "pivotkit-cli/rest";

/**
 * The REST service's OAuth resource: rest.resource, else the origin of auth.resource with /api/v1
 * (an audience of its own, so a token for the MCP endpoint does not reach REST).
 * @param {ServerOptions} options
 */
export const restResourceOf = (options) => options.rest?.resource ?? new URL(REST_BASE, options.auth?.resource ?? options.http?.publicUrl ?? "http://localhost").href;

/** A path of the options, relative to `baseDir` (or the working directory). */
export const pathOf = (options, path) => (isAbsolute(path) ? path : resolve(options.baseDir ?? process.cwd(), path));

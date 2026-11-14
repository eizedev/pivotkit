/*
 * The server's options: one table of every key with its type, default and words (OPTION_KEYS), the
 * check of an options object against it (validateOptions: an unknown key is an error with "did you
 * mean"), and the configuration file (loadConfig: JSON, paths relative to the file). The runner's
 * flags are made from the same table (runner.js), so the docs' configuration reference, the help and
 * the checks cannot drift apart.
 */

import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { LIMITS, closest } from "pivotkit-core";
import { OPERATION_NAMES } from "pivotkit-report/operations";
import { POLICY_LEVELS } from "./policy.js";

export class ConfigError extends Error {
    /** @param {string} message */
    constructor(message) {
        super(message);
        this.name = "ConfigError";
        this.code = "CONFIG";
    }
}

/**
 * @typedef {object} PolicyOptions
 * @property {"show" | "summary" | "hide"} [default]  the level of a field without its own (default "summary")
 * @property {Record<string, "show" | "summary" | "hide">} [fields]  levels by field name (case-insensitive)
 * @property {number} [items]  values listed per "show" field (default 20)
 * @property {boolean} [rows]  show the row count (default true)
 * @property {boolean} [counts]  show distinct and blank counts (default true)
 * @property {{ cells?: number, bytes?: number } | false} [inline]  results that may come back in the tool result (default 500 cells, 32 KiB)
 */

/**
 * @typedef {object} SourceOptions
 * @property {string} [file]  a CSV, TSV, JSON or XLSX file (relative to the config file)
 * @property {() => Promise<unknown>} [load]  a library host's loader: rows, columnar data or encode()'s result (instead of file)
 * @property {() => unknown} [version]  with load: changes when the data changes (the cache's key)
 * @property {string} [title]
 * @property {string} [description]
 * @property {string} [sheet]  a workbook's sheet
 * @property {string} [link]  the address of the page that shows this source's reports (create_link)
 * @property {string} [linkKey]  the report's key on that page, when it has more than one
 * @property {string} [template]  an HTML print template file for render_view's html
 * @property {string[]} [scopes]  OAuth scopes a caller needs to see and use the source
 * @property {PolicyOptions} [policy]
 */

/**
 * @typedef {object} McpOptions
 * @property {Record<string, SourceOptions>} [sources]
 * @property {{ allowDirs?: string[], list?: boolean, hardLinks?: boolean, scopes?: string[], policy?: PolicyOptions }} [files]
 * @property {{ dir?: string, baseUrl?: string, maxFiles?: number }} [output]
 * @property {PolicyOptions} [policy]
 * @property {Partial<import("pivotkit-core").Limits>} [limits]
 * @property {string} [locale]
 * @property {string} [timeZone]
 * @property {{ workers?: number, timeMs?: number, memoryMb?: number, queueMs?: number }} [compute]
 * @property {{ host?: string, port?: number, publicUrl?: string, allowHosts?: string[], allowOrigins?: string[], page?: boolean | { sources?: boolean } }} [http]
 * @property {AuthOptions} [auth]
 * @property {"info" | "debug" | "off"} [log]
 * @property {string} [baseDir]  where relative paths start (loadConfig sets the config file's directory; default the working directory)
 */

/**
 * @typedef {object} AuthOptions
 * @property {"none" | "token" | "oauth"} [mode]
 * @property {boolean} [allowUnauthenticated]  "none" on an address other than loopback
 * @property {Array<{ name: string, env?: string, file?: string, scopes?: string[] }>} [tokens]
 * @property {string} [issuer]
 * @property {string} [resource]
 * @property {string[]} [audience]
 * @property {string[]} [algorithms]
 * @property {string} [jwksUri]
 * @property {string[]} [scopesSupported]
 * @property {string[]} [requiredScopes]
 * @property {Record<string, string[]>} [toolScopes]
 * @property {string} [scopeClaim]
 * @property {number} [clockTolerance]
 * @property {string} [requireTyp]
 * @property {boolean} [allowInsecureIssuer]
 */

/** The import limits a server uses unless the operator sets them: lower than a command line's. */
export const SERVER_LIMITS = Object.freeze({ fileBytes: 52_428_800, unpackedBytes: 52_428_800 });

/** The defaults of the compute pool. */
export const COMPUTE_DEFAULTS = Object.freeze({ workers: 2, timeMs: 30_000, memoryMb: 1024, queueMs: 10_000 });

/** The JWT signature algorithms accepted by default: asymmetric only. */
export const DEFAULT_ALGORITHMS = Object.freeze(["RS256", "PS256", "ES256", "EdDSA"]);

// A small schema language for the options: "string", "boolean", "integer", "strings" (array of
// strings), "function", { enum: [...] }, { object: {...} } (known keys), { map: <schema> } (any keys)
const POLICY = { object: { default: { enum: POLICY_LEVELS }, fields: { map: { enum: POLICY_LEVELS } }, items: "integer", rows: "boolean", counts: "boolean", inline: { or: [{ const: false }, { object: { cells: "integer", bytes: "integer" } }] } } };

/** Every option, nested as the options object is. */
export const OPTION_KEYS = Object.freeze({
    sources: { map: { object: { file: "string", load: "function", version: "function", title: "string", description: "string", sheet: "string", link: "string", linkKey: "string", template: "string", scopes: "strings", policy: POLICY } } },
    files: { object: { allowDirs: "strings", list: "boolean", hardLinks: "boolean", scopes: "strings", policy: POLICY } },
    output: { object: { dir: "string", baseUrl: "string", maxFiles: "integer" } },
    policy: POLICY,
    limits: { map: "integer" },
    locale: "string",
    timeZone: "string",
    compute: { object: { workers: "integer", timeMs: "integer", memoryMb: "integer", queueMs: "integer" } },
    http: { object: { host: "string", port: "integer", publicUrl: "string", allowHosts: "strings", allowOrigins: "strings", page: { or: [{ const: false }, { const: true }, { object: { sources: "boolean" } }] } } },
    auth: {
        object: {
            mode: { enum: ["none", "token", "oauth"] },
            allowUnauthenticated: "boolean",
            tokens: { list: { object: { name: "string", env: "string", file: "string", scopes: "strings" } } },
            issuer: "string",
            resource: "string",
            audience: "strings",
            algorithms: "strings",
            jwksUri: "string",
            scopesSupported: "strings",
            requiredScopes: "strings",
            toolScopes: { map: "strings" },
            scopeClaim: "string",
            clockTolerance: "integer",
            requireTyp: "string",
            allowInsecureIssuer: "boolean"
        }
    },
    log: { enum: ["info", "debug", "off"] },
    baseDir: "string"
});

/** A source id: letters, digits, "_", "-", "." (no "file:", no path). */
export const SOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

/** Checks a value against a schema of the small language above; throws ConfigError with the key's path. */
function check(value, schema, path) {
    const fail = (what) => {
        throw new ConfigError(`${path}: ${what}`);
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
 * @param {McpOptions} options
 * @returns {McpOptions}  the same object
 */
export function validateOptions(options) {
    check(options, { object: OPTION_KEYS }, "");
    for (const [id, source] of Object.entries(options.sources ?? {})) {
        if (!SOURCE_ID.test(id)) {
            throw new ConfigError(`sources.${id.slice(0, 60)}: an id is letters, digits, "_", "-" and "." (at most 64), starting with a letter or digit`);
        }
        if (Boolean(source.file) === Boolean(source.load)) {
            throw new ConfigError(`sources.${id}: give either file or load`);
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
    if (options.http?.publicUrl) {
        urlOf(options.http.publicUrl, "http.publicUrl");
    }
    if (options.output?.baseUrl) {
        urlOf(options.output.baseUrl, "output.baseUrl");
    }
    if (options.compute?.workers !== undefined && options.compute.workers > 16) {
        throw new ConfigError("compute.workers: at most 16");
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
 * @returns {Promise<McpOptions>}
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

/** A path of the options, relative to `baseDir` (or the working directory). */
export const pathOf = (options, path) => (isAbsolute(path) ? path : resolve(options.baseDir ?? process.cwd(), path));

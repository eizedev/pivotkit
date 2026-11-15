/*
 * The options of the upload target (output.upload): a store the operator names, to which a written
 * report is uploaded (upload.js), and whose link the result shows instead of a file on this server
 * (delivery.js decides which report goes there).
 *
 * Two ways to reach a store, exactly one of them:
 *
 * - `url`: an https:// address template with {id}, {name} and {format}, the request's `method`
 *   (PUT or POST) and `headers`; the link is read from the answer (`link`: a JSON Pointer or
 *   "header:location") or, for a PUT, is the address itself.
 * - `presign`: a POST of JSON to the operator's presign service (with the operator's `headers`), whose
 *   answer names the address to upload to (`uploadUrl`, on `allowOrigins`), headers for that upload
 *   (`uploadHeaders`), the link (`link`) and when it expires (`expiresAt`).
 *
 * Everything is checked at start and compiled once (uploadSettingsOf). A header's value is a text or
 * `{ "prefix": "Bearer ", "value": <secret reference> }`; a header that looks like a credential takes
 * a reference only.
 *
 * A key is declared here once, never also in config.js or another fragment (options/index.js refuses a
 * second declaration).
 */

import { OUTPUT_DEFAULTS } from "../config.js";
import { HEADER_NAME, HEADER_VALUE, SECRET_NAME, pointerKeys, pointerProblem } from "./http.js";
import { ConfigError, SECRET_REF } from "./shared.js";

export const NAME = "upload";

/** What the store's links do, as the operator declares it: anyone with the link, once, or only the person after signing in at the store. */
export const UPLOAD_BINDINGS = Object.freeze(["none", "once", "signIn"]);

/** The defaults: PUT, 30 s for presign and upload together, keep the local file, links anyone can open. */
export const UPLOAD_DEFAULTS = Object.freeze({ method: "PUT", timeMs: 30_000, keepLocal: true, bind: "none" });

/** The shortest and longest time an upload may take. */
export const UPLOAD_TIME_MS = Object.freeze({ min: 1000, max: 600_000 });

/** The placeholders an address template may hold. */
export const TEMPLATE_NAMES = Object.freeze(["id", "name", "format"]);

/** Headers the operator may not set: the connection's own. */
const CONNECTION_HEADERS = /^(host|content-length|content-type|transfer-encoding|connection|te|trailer|upgrade|keep-alive|accept-encoding|proxy-.*|x-forwarded-.*|forwarded)$/i;

/** Headers that carry a credential: a secret reference only, never a text in the configuration. */
const CREDENTIAL_HEADERS = /^(authorization|cookie)$/i;

/** A header's value in the configuration: a text, or a secret reference with an optional prefix. */
const HEADER = { or: ["string", { object: { prefix: "string", value: SECRET_REF } }] };

const HEADERS = { map: HEADER };

/** @type {Readonly<Partial<Record<import("./shared.js").Slot, Record<string, any>>>>} */
export const KEYS = Object.freeze({
    output: {
        upload: {
            object: {
                url: "string",
                headers: HEADERS,
                link: "string",
                expiresAt: "string",
                presign: { object: { url: "string", headers: HEADERS, uploadUrl: "string", uploadHeaders: "string", link: "string", expiresAt: "string", allowOrigins: "strings" } },
                linkOrigins: "strings",
                method: { enum: ["PUT", "POST"] },
                timeMs: "integer",
                maxBytes: "integer",
                keepLocal: "boolean",
                bind: { enum: UPLOAD_BINDINGS },
                intranet: "boolean"
            }
        }
    }
});

/**
 * @typedef {object} UploadOptions  output.upload as written
 * @property {string} [url]  an https:// address template with {id}, {name} and {format}; or presign
 * @property {Record<string, string | SecretHeader>} [headers]  with url: sent to the store
 * @property {string} [link]  with url: a JSON Pointer into the answer, or "header:location" (default for a PUT: the address)
 * @property {string} [expiresAt]  with url: a JSON Pointer into the answer
 * @property {{ url: string, headers?: Record<string, string | SecretHeader>, uploadUrl: string, uploadHeaders?: string, link: string, expiresAt?: string, allowOrigins?: string[] }} [presign]
 * @property {string[]} [linkOrigins]  default: the origin of url or presign.url
 * @property {"PUT" | "POST"} [method]  default PUT
 * @property {number} [timeMs]  presign and upload together, 1000 to 600000 (default 30000)
 * @property {number} [maxBytes]  default output.maxMb
 * @property {boolean} [keepLocal]  default true
 * @property {"none" | "once" | "signIn"} [bind]  what the store's links do (default "none")
 * @property {boolean} [intranet]  loopback and private addresses may be reached (default false)
 */

/**
 * @typedef {{ prefix?: string, value: { env?: string, file?: string } }} SecretHeader
 * @typedef {Record<string, string | SecretHeader>} UploadHeaders  names in lower case
 */

/**
 * @typedef {object} UploadSettings  output.upload as upload.js uses it, compiled once
 * @property {"url" | "presign"} mode
 * @property {string | null} template  mode url: the address template
 * @property {{ url: string, uploadUrl: string[], uploadHeaders: string[] | null, link: string[], expiresAt: string[] | null, allowOrigins: string[] } | null} presign
 * @property {UploadHeaders} headers  mode url: to the upload address; mode presign: to the presign address only
 * @property {{ pointer: string[] } | { header: "location" } | null} link  mode url: where the link is (null: the address uploaded to)
 * @property {string[] | null} expiresAt  mode url: where the expiry is in the answer
 * @property {string[]} linkOrigins
 * @property {"PUT" | "POST"} method
 * @property {number} timeMs  presign and upload together
 * @property {number} maxBytes
 * @property {boolean} keepLocal
 * @property {"none" | "once" | "signIn"} bind
 * @property {boolean} intranet  loopback and private addresses may be reached
 * @property {string} target  the presign or template address, for check-config
 */

/** The compiled settings, by the configured object. */
const compiled = new WeakMap();

/**
 * The upload target's settings, or null without one.
 * @param {import("../config.js").ServerOptions} options
 * @returns {UploadSettings | null}
 */
export function uploadSettingsOf(options) {
    const upload = options.output?.upload;
    if (!upload) {
        return null;
    }
    let settings = compiled.get(upload);
    if (!settings) {
        settings = compile(options);
        compiled.set(upload, settings);
    }
    return settings;
}

/** The origin of an https:// address without user name or password, or null. */
function httpsOrigin(text) {
    try {
        const url = new URL(text);
        return url.protocol === "https:" && !url.username && !url.password ? url.origin : null;
    } catch {
        return null;
    }
}

/**
 * A list of origins as written: each exactly an https:// origin ("https://files.example.com", no path).
 * @param {string[]} list
 * @param {string} path
 */
function originsOf(list, path) {
    if (!list.length) {
        throw new ConfigError(`${path}: at least one origin, or leave it out`);
    }
    return list.map((text, i) => {
        const origin = httpsOrigin(text);
        if (!origin || origin !== text.replace(/\/$/, "")) {
            throw new ConfigError(`${path}[${i}]: an https:// origin, scheme and host (and port) without a path ("https://files.example.com")`);
        }
        return origin;
    });
}

/**
 * Checks the headers of the configuration; returns them with names in lower case.
 * @param {Record<string, string | SecretHeader> | undefined} headers
 * @param {string} path
 * @returns {UploadHeaders}
 */
function headersOf(headers, path) {
    /** @type {UploadHeaders} */
    const out = {};
    for (const [name, value] of Object.entries(headers ?? {})) {
        if (!HEADER_NAME.test(name)) {
            throw new ConfigError(`${path}.${name.slice(0, 60)}: not a header name`);
        }
        if (CONNECTION_HEADERS.test(name)) {
            throw new ConfigError(`${path}.${name}: this header is set by the connection (content-type is the report's)`);
        }
        if (typeof value === "string") {
            if (CREDENTIAL_HEADERS.test(name) || SECRET_NAME.test(name)) {
                throw new ConfigError(`${path}.${name}: looks like a credential; give it as { "prefix": "Bearer ", "value": { "env": "NAME" } } (or "file"), never as a text in the configuration`);
            }
            if (!HEADER_VALUE.test(value)) {
                throw new ConfigError(`${path}.${name}: a value without line breaks, NUL or characters outside Latin-1, at most 1000 characters`);
            }
        } else if (value.prefix !== undefined && !HEADER_VALUE.test(value.prefix)) {
            throw new ConfigError(`${path}.${name}.prefix: a text without line breaks, NUL or characters outside Latin-1`);
        }
        out[name.toLowerCase()] = value;
    }
    return out;
}

/** A JSON Pointer of the configuration as keys; "" (the whole answer) is no place for a text. */
function pointerOf(text, path) {
    const problem = pointerProblem(text);
    if (problem || text === "") {
        throw new ConfigError(`${path}: ${problem ?? 'a JSON Pointer to a text in the answer ("/downloadUrl")'}`);
    }
    return pointerKeys(text);
}

/**
 * Checks an address template: https://, the host written out, only {id}, {name} and {format} after it.
 * @param {string} template
 */
function checkTemplate(template) {
    const at = "output.upload.url";
    const names = [...template.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]);
    const unknown = names.find((n) => !TEMPLATE_NAMES.includes(n));
    if (unknown !== undefined) {
        throw new ConfigError(`${at}: {${unknown.slice(0, 40)}} is not a placeholder; the address may hold {id} (random), {name} (the report's name) and {format}`);
    }
    if (/[{}]/.test(template.replace(/\{(id|name|format)\}/g, ""))) {
        throw new ConfigError(`${at}: a "{" or "}" outside {id}, {name} and {format}`);
    }
    const origin = httpsOrigin(template.replace(/\{(id|name|format)\}/g, "x"));
    if (!origin || !template.startsWith(`${origin}/`) || origin.includes("{")) {
        throw new ConfigError(`${at}: an https:// address with the host written out, without user name or password, and the placeholders in its path or query ("https://store.example.com/reports/{id}/{name}.{format}")`);
    }
    if (template.includes("#")) {
        throw new ConfigError(`${at}: an address without a fragment (#)`);
    }
    return origin;
}

/**
 * The settings, checked; throws ConfigError.
 * @param {import("../config.js").ServerOptions} options
 * @returns {UploadSettings}
 */
function compile(options) {
    const u = /** @type {any} */ (options.output?.upload);
    if ((u.url === undefined) === (u.presign === undefined)) {
        throw new ConfigError("output.upload: give exactly one of url (an address template) or presign (a service that names the address)");
    }
    const method = u.method ?? UPLOAD_DEFAULTS.method;
    let origin;
    let presign = null;
    if (u.presign) {
        for (const key of ["headers", "link", "expiresAt"]) {
            if (u[key] !== undefined) {
                throw new ConfigError(`output.upload.${key}: with presign, set it in output.upload.presign.${key}`);
            }
        }
        const p = u.presign;
        origin = httpsOrigin(p.url ?? "");
        if (!origin) {
            throw new ConfigError("output.upload.presign.url: an https:// address without user name or password");
        }
        for (const key of ["uploadUrl", "link"]) {
            if (p[key] === undefined) {
                throw new ConfigError(`output.upload.presign.${key}: the JSON Pointer to the ${key === "link" ? "link to show" : "address to upload to"} in the presign service's answer is missing ("/${key === "link" ? "downloadUrl" : "uploadUrl"}")`);
            }
        }
        presign = {
            url: p.url,
            uploadUrl: pointerOf(p.uploadUrl, "output.upload.presign.uploadUrl"),
            uploadHeaders: p.uploadHeaders === undefined ? null : pointerOf(p.uploadHeaders, "output.upload.presign.uploadHeaders"),
            link: pointerOf(p.link, "output.upload.presign.link"),
            expiresAt: p.expiresAt === undefined ? null : pointerOf(p.expiresAt, "output.upload.presign.expiresAt"),
            allowOrigins: p.allowOrigins === undefined ? [origin] : originsOf(p.allowOrigins, "output.upload.presign.allowOrigins")
        };
    } else {
        origin = checkTemplate(u.url);
        if (method === "POST" && u.link === undefined) {
            throw new ConfigError('output.upload.link: a POST names the stored report in its answer: give the JSON Pointer to the link ("/url") or "header:location"');
        }
    }
    let link = null;
    if (u.link !== undefined) {
        link = u.link.toLowerCase() === "header:location" ? { header: /** @type {"location"} */ ("location") } : { pointer: pointerOf(u.link, "output.upload.link") };
    }
    const timeMs = u.timeMs ?? UPLOAD_DEFAULTS.timeMs;
    if (timeMs < UPLOAD_TIME_MS.min || timeMs > UPLOAD_TIME_MS.max) {
        throw new ConfigError(`output.upload.timeMs: from ${UPLOAD_TIME_MS.min} to ${UPLOAD_TIME_MS.max} (10 minutes)`);
    }
    if (u.maxBytes !== undefined && u.maxBytes < 1) {
        throw new ConfigError("output.upload.maxBytes: 1 or more (the largest report uploaded, in bytes)");
    }
    return {
        mode: presign ? "presign" : "url",
        template: presign ? null : u.url,
        presign,
        headers: headersOf(presign ? u.presign.headers : u.headers, presign ? "output.upload.presign.headers" : "output.upload.headers"),
        link,
        expiresAt: u.expiresAt === undefined ? null : pointerOf(u.expiresAt, "output.upload.expiresAt"),
        linkOrigins: u.linkOrigins === undefined ? [origin] : originsOf(u.linkOrigins, "output.upload.linkOrigins"),
        method,
        timeMs,
        maxBytes: u.maxBytes ?? (options.output?.maxMb ?? OUTPUT_DEFAULTS.maxMb) * 1_048_576,
        keepLocal: u.keepLocal ?? UPLOAD_DEFAULTS.keepLocal,
        bind: u.bind ?? UPLOAD_DEFAULTS.bind,
        intranet: u.intranet === true,
        target: presign ? presign.url : u.url
    };
}

/**
 * Checks the rules between these keys; throws ConfigError.
 * @param {import("../config.js").ServerOptions} options
 */
export function validate(options) {
    if (!options.output?.upload) {
        return;
    }
    if (!options.output.dir) {
        throw new ConfigError("output.upload: needs output.dir (a report is written there first, then uploaded)");
    }
    if (options.output.baseUrl) {
        throw new ConfigError("output.upload: next to output.baseUrl: choose one (the store's links, or the web server at output.baseUrl)");
    }
    uploadSettingsOf(options);
}

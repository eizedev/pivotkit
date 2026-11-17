/*
 * The upload target (output.upload, options/upload.js): a written report is sent to the operator's
 * store, and the store's link is what the result shows. delivery.js decides which report goes there
 * and calls upload() after the local write.
 *
 *   const { url, expiresAt } = await upload(context, { path, bytes }, { id, filename, name, extension, mediaType, sha256 });
 *
 * - Presign: a POST of JSON { filename, mediaType, bytes, sha256 } to the operator's presign address,
 *   with the operator's headers (its credentials go there and nowhere else). The answer, read up to
 *   64 KiB, names the address to upload to (https:// and on presign.allowOrigins), headers for that
 *   upload (no connection or credential headers), the link and when it expires.
 * - Template: the operator's address with {id} (random), {name} (the report's name as a safe slug) and
 *   {format}, with the operator's headers.
 * - The upload streams the file from disk through guardedFetch (no redirects; loopback and private
 *   addresses only with intranet). At most two uploads run at once; the time for waiting, presign and
 *   upload together is timeMs. A PUT is tried once more after a failure that may pass (a dropped
 *   connection, 502, 503, 504) while time is left; a POST never is.
 * - The link is checked before it is shown: https://, no user name or password, no control
 *   characters, at most 2048 characters, its origin on linkOrigins.
 *
 * A failure is an UploadFailure with a code of its own (never an address, an answer's body or a
 * header's value); delivery.js answers UPLOAD_FAILED with a fixed text and logs the code (the code
 * would tell a caller about the store's setup, so it stays on the log).
 */

import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { readSecret } from "./secrets.js";
import { GuardedFetchError, guardedFetch } from "./sources/fetch.js";
import { pointerValue } from "./sources/http.js";
import { HEADER_NAME } from "./options/http.js";
import { uploadMaxBytes, uploadSettingsOf } from "./options/upload.js";

/**
 * Which guardedFetch uploads: the server's, or a test's own (createGuardedFetch with a certificate and
 * a lookup of its own). Not part of the package's API; no option reaches it.
 */
export const uploadMeans = { fetch: guardedFetch };

/** The most uploads at once, per server. */
export const UPLOAD_SLOTS = 2;

/** The most bytes of an answer of the presign service or the store. */
export const ANSWER_BYTES = 65_536;

/** The longest link shown, and the longest address uploaded to (presigned addresses carry a signature). */
export const LINK_MAX = 2048;
const UPLOAD_URL_MAX = 8192;

/** The longest report name in an address. */
const NAME_MAX = 80;

/** Headers the presign service may not ask for: the connection's own, the body's (its type and encoding are the report's), credentials and proxy headers. */
const REFUSED_UPLOAD_HEADERS = /^(host|content-length|content-type|content-encoding|expect|authorization|cookie|proxy-.*|x-forwarded-.*|forwarded|connection|keep-alive|te|trailer|transfer-encoding|upgrade|accept-encoding)$/i;

/** The most uploads waiting for a slot; one more is refused at once (TIMEOUT, retryable). */
export const UPLOAD_QUEUE_MAX = 32;

/** A header's value the presign service asks for: printable Latin-1 and tab (longer than a configured one: a signed session token). */
const UPLOAD_HEADER_VALUE = /^[\t\x20-\x7e\x80-\xff]{0,4096}$/;

/** The most headers the presign service may ask for. */
const UPLOAD_HEADERS_MAX = 20;

/** Control characters (C0, DEL, C1): never in an address taken from an answer. */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

/** The latest expiry taken from a store: a year ahead. */
const EXPIRY_MAX_MS = 366 * 86_400_000;

/**
 * An upload that failed. `code` says what (TOO_LARGE, SECRET, PRESIGN_<status>, PRESIGN_ANSWER,
 * UPLOAD_URL_<problem>, UPLOAD_HEADERS, STORE_<status>, STORE_ANSWER, LINK_<problem>, TIMEOUT, or
 * PRESIGN_/STORE_ and a guardedFetch code);
 * `retryable` whether the same request may work later. The message is the code: no address, answer
 * or header value.
 */
export class UploadFailure extends Error {
    /**
     * @param {string} code
     * @param {boolean} retryable
     */
    constructor(code, retryable) {
        super(`upload: ${code}`);
        this.name = "UploadFailure";
        this.code = code;
        this.retryable = retryable;
    }
}

/**
 * A report's name as a part of an address: letters, digits, ".", "_" and "-", at most 80 characters,
 * never "." or "..".
 * @param {string} name
 */
export function nameSlug(name) {
    const slug = String(name)
        .normalize("NFKD")
        // the accents NFKD took apart ("Ü" as "U" and a combining mark)
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/-{2,}/g, "-")
        .slice(0, NAME_MAX)
        // after the cut, so a name cut after a "-" does not end in one
        .replace(/^[-.]+|-+$/g, "");
    return slug === "" || slug === "." || slug === ".." ? "report" : slug;
}

/**
 * The address of the template, filled.
 * @param {string} template
 * @param {{ id: string, name: string, format: string }} values
 */
export function fillTemplate(template, values) {
    return template.replace(/\{(id|name|format)\}/g, (_, key) => encodeURIComponent(key === "name" ? nameSlug(values.name) : values[/** @type {"id" | "format"} */ (key)]));
}

/**
 * An address from an answer, checked: https://, no user name or password, no control characters, at
 * most `max` characters, its origin on the list. Returns the parsed address, or what is wrong with it:
 * MISSING (no text), LENGTH, CHARS (control characters), PARSE, SCHEME (not https://), USERINFO,
 * ORIGIN (not on the list).
 * @param {unknown} text
 * @param {string[]} origins
 * @param {number} max
 * @param {string} [base]  for a relative address (a Location header)
 * @returns {{ url: URL, problem: null } | { url: null, problem: string }}
 */
export function addressCheck(text, origins, max, base) {
    const no = (problem) => ({ url: null, problem });
    // the raw text first: URL drops tabs and line breaks without a word
    if (typeof text !== "string" || text === "") {
        return no("MISSING");
    }
    if (text.length > max) {
        return no("LENGTH");
    }
    if (CONTROL.test(text)) {
        return no("CHARS");
    }
    let url;
    try {
        url = base ? new URL(text, base) : new URL(text);
    } catch {
        return no("PARSE");
    }
    if (url.protocol !== "https:") {
        return no("SCHEME");
    }
    if (url.username || url.password) {
        return no("USERINFO");
    }
    if (url.href.length > max) {
        return no("LENGTH");
    }
    return origins.includes(url.origin) ? { url, problem: null } : no("ORIGIN");
}

/** addressCheck's address, or null. */
export const checkedAddress = (text, origins, max, base) => addressCheck(text, origins, max, base).url;

/**
 * An expiry a store answered, in the one form (ISO 8601 in UTC to the second), or null: a time in the
 * future, at most a year ahead; a number counts seconds since 1970.
 * @param {unknown} value
 * @param {number} [now]
 */
export function expiryOf(value, now = Date.now()) {
    let ms = NaN;
    if (typeof value === "number" && Number.isFinite(value)) {
        ms = value * 1000;
    } else if (typeof value === "string" && value.length <= 40 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
        ms = Date.parse(value);
    }
    if (!Number.isFinite(ms) || ms <= now || ms > now + EXPIRY_MAX_MS) {
        return null;
    }
    return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");
}

/** The uploads running and waiting, per context. */
const slots = new WeakMap();

/**
 * Runs fn when one of the context's slots is free; gives up when the deadline passes first.
 * @template T
 * @param {object} context
 * @param {number} deadline
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function inSlot(context, deadline, fn) {
    let state = slots.get(context);
    if (!state) {
        state = { running: 0, waiting: /** @type {Array<() => void>} */ ([]) };
        slots.set(context, state);
    }
    const s = state;
    if (s.running >= UPLOAD_SLOTS && s.waiting.length >= UPLOAD_QUEUE_MAX) {
        throw new UploadFailure("TIMEOUT", true);
    }
    if (s.running >= UPLOAD_SLOTS) {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                s.waiting.splice(s.waiting.indexOf(go), 1);
                reject(new UploadFailure("TIMEOUT", true));
            }, Math.max(deadline - Date.now(), 0));
            const go = () => {
                clearTimeout(timer);
                resolve(undefined);
            };
            s.waiting.push(go);
        });
    } else {
        s.running++;
    }
    try {
        return await fn();
    } finally {
        const next = s.waiting.shift();
        if (next) {
            // the slot passes to the next upload
            next();
        } else {
            s.running--;
        }
    }
}

/**
 * The operator's headers with their secrets read now (a rotated secret works without a restart).
 * @param {import("./options/upload.js").UploadHeaders} headers
 * @param {any} options
 * @returns {Promise<Record<string, string>>}
 */
async function operatorHeaders(headers, options) {
    /** @type {Record<string, string>} */
    const out = {};
    for (const [name, value] of Object.entries(headers)) {
        if (typeof value === "string") {
            out[name] = value;
            continue;
        }
        const secret = await readSecret(value.value, options).catch(() => {
            throw new UploadFailure("SECRET", false);
        });
        out[name] = `${value.prefix ?? ""}${secret}`;
    }
    return out;
}

/** A guardedFetch error as an upload failure, by its code. */
const fetchFailure = (e, step) => (e instanceof GuardedFetchError ? new UploadFailure(e.code === "TIMEOUT" ? "TIMEOUT" : `${step}_${e.code}`, e.transient) : e instanceof UploadFailure ? e : new UploadFailure(`${step}_FAILED`, false));

/** Whether a store's answer status may pass when tried again. */
const transientStatus = (status) => status === 429 || status === 502 || status === 503 || status === 504;

/** An answer's body as JSON, or undefined. */
function jsonOf(body) {
    try {
        return JSON.parse(new TextDecoder().decode(body));
    } catch {
        return undefined;
    }
}

/**
 * The headers the presign service asks the upload to carry, checked.
 * @param {unknown} value
 * @returns {Record<string, string>}
 */
function uploadHeadersOf(value) {
    if (value === undefined) {
        return {};
    }
    if (value === null || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > UPLOAD_HEADERS_MAX) {
        throw new UploadFailure("UPLOAD_HEADERS", false);
    }
    /** @type {Record<string, string>} */
    const out = {};
    for (const [name, text] of Object.entries(value)) {
        if (!HEADER_NAME.test(name) || REFUSED_UPLOAD_HEADERS.test(name) || typeof text !== "string" || !UPLOAD_HEADER_VALUE.test(text)) {
            throw new UploadFailure("UPLOAD_HEADERS", false);
        }
        out[name.toLowerCase()] = text;
    }
    return out;
}

/**
 * @typedef {object} UploadFile
 * @property {string} path  the written report
 * @property {number} bytes  its size
 */

/**
 * @typedef {object} UploadMeta
 * @property {string} filename  the name the person sees ("sales-by-region.xlsx", output.js fileSlug)
 * @property {string} name  the report's name, without the format
 * @property {string} extension  the format ("xlsx")
 * @property {string} mediaType
 * @property {string} sha256  hex
 * @property {string} [subject]  a signIn store's report: the person's binding (subjectBindingOf), sent to the presign service
 */

/**
 * Uploads a written report to the operator's store; its link and, when the store said it, until when
 * that works. Throws UploadFailure.
 * @param {any} context
 * @param {UploadFile} file
 * @param {UploadMeta} meta
 * @returns {Promise<{ url: string, expiresAt?: string }>}
 */
export async function upload(context, file, meta) {
    const settings = /** @type {import("./options/upload.js").UploadSettings} */ (uploadSettingsOf(context.options));
    if (file.bytes > uploadMaxBytes(settings, context.output.maxMb)) {
        throw new UploadFailure("TOO_LARGE", false);
    }
    const deadline = Date.now() + settings.timeMs;
    const left = () => {
        const ms = deadline - Date.now();
        if (ms <= 0) {
            throw new UploadFailure("TIMEOUT", true);
        }
        return ms;
    };
    const fetch = uploadMeans.fetch;
    const rules = { allowPrivate: settings.intranet, maxBytes: ANSWER_BYTES };
    return inSlot(context, deadline, async () => {
        const headers = await operatorHeaders(settings.headers, context.options);
        /** @type {URL} */
        let target;
        /** @type {Record<string, string>} */
        let sendHeaders;
        /** @type {unknown} */
        let linkText;
        /** @type {unknown} */
        let expiry;
        const presign = settings.presign;
        if (presign) {
            let answer;
            try {
                answer = await fetch(presign.url, { ...rules, method: "POST", headers: { ...headers, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ filename: meta.filename, mediaType: meta.mediaType, bytes: file.bytes, sha256: meta.sha256, ...(meta.subject ? { subject: meta.subject } : {}) }), timeMs: left() });
            } catch (e) {
                throw fetchFailure(e, "PRESIGN");
            }
            if (answer.status < 200 || answer.status > 299) {
                throw new UploadFailure(`PRESIGN_${answer.status}`, transientStatus(answer.status));
            }
            const body = jsonOf(answer.body);
            if (body === null || typeof body !== "object" || Array.isArray(body)) {
                throw new UploadFailure("PRESIGN_ANSWER", false);
            }
            const address = addressCheck(pointerValue(body, presign.uploadUrl), presign.allowOrigins, UPLOAD_URL_MAX);
            if (!address.url) {
                throw new UploadFailure(`UPLOAD_URL_${address.problem}`, false);
            }
            target = address.url;
            sendHeaders = uploadHeadersOf(presign.uploadHeaders ? pointerValue(body, presign.uploadHeaders) : undefined);
            linkText = pointerValue(body, presign.link);
            expiry = presign.expiresAt ? pointerValue(body, presign.expiresAt) : undefined;
        } else {
            target = new URL(fillTemplate(/** @type {string} */ (settings.template), { id: randomBytes(16).toString("base64url"), name: meta.name, format: meta.extension }));
            sendHeaders = headers;
        }
        const put = settings.method === "PUT";
        let stored;
        for (let attempt = 0; ; attempt++) {
            // a stream per attempt, closed whatever happens: a request refused before it sent the body never reads it
            const body = createReadStream(file.path);
            try {
                stored = await fetch(target, { ...rules, method: settings.method, headers: { "content-type": meta.mediaType, ...sendHeaders, "content-length": String(file.bytes) }, body, timeMs: left() });
            } catch (e) {
                const failure = fetchFailure(e, "STORE");
                if (put && attempt === 0 && failure.retryable && failure.code !== "TIMEOUT") {
                    continue;
                }
                throw failure;
            } finally {
                body.destroy();
            }
            if (stored.status >= 200 && stored.status <= 299) {
                break;
            }
            if (put && attempt === 0 && transientStatus(stored.status) && stored.status !== 429) {
                continue;
            }
            throw new UploadFailure(`STORE_${stored.status}`, transientStatus(stored.status));
        }
        if (!presign) {
            const link = settings.link;
            if (link && "header" in link) {
                linkText = stored.headers.location;
            } else if (link && "pointer" in link) {
                const body = jsonOf(stored.body);
                if (body === undefined) {
                    throw new UploadFailure("STORE_ANSWER", false);
                }
                linkText = pointerValue(body, link.pointer);
            } else {
                linkText = target.href;
            }
            expiry = settings.expiresAt ? pointerValue(jsonOf(stored.body), settings.expiresAt) : undefined;
        }
        // a relative Location is the store's own address
        const { url, problem } = addressCheck(linkText, settings.linkOrigins, LINK_MAX, presign ? undefined : target.href);
        if (!url) {
            // the store holds the report by now: it stays there (the operator's store cleans it up)
            throw new UploadFailure(`LINK_${problem}`, false);
        }
        const expiresAt = expiry === undefined ? null : expiryOf(expiry);
        return { url: url.href, ...(expiresAt ? { expiresAt } : {}) };
    });
}

/*
 * The one way pivotkit-server makes a request to another server (an HTTP source, a token endpoint,
 * an upload target, an OpenAPI document by URL): guardedFetch.
 *
 * - https: only (plain http only through createGuardedFetch's allowHttpLoopback, to a loopback
 *   address: tests); no user name or password in the address.
 * - No redirect is followed: a 3xx answer is refused (REDIRECT).
 * - The address checked is the one the socket connects to: a lookup function on the connection
 *   itself (node:http's `lookup` option, which node:net calls when it connects, with `all: true`
 *   under the family autodetection), not a separate DNS question beforehand, so a name that answers
 *   differently the second time cannot pass. An IP address in the URL is checked before the request
 *   (node:net looks nothing up for one) and the socket's remote address once more after it connects.
 *   Always refused: 0.0.0.0/8, ::, link-local 169.254.0.0/16 and fe80::/10, multicast, 240.0.0.0/4
 *   with the broadcast address, the cloud metadata addresses fd00:ec2::254 and 100.100.100.200, also
 *   as IPv4-mapped, IPv4-compatible and NAT64 (64:ff9b::/96) IPv6 addresses. Loopback, private and
 *   shared ranges are refused only with allowPrivate: false.
 * - Every request has its own connection (agent: false): no socket is shared between requests with
 *   different rules. Proxy variables of the environment are not used.
 * - The body is counted while it streams, after decompression: over maxBytes the request is ended
 *   (TOO_LARGE); the whole request, body included, ends after timeMs (TIMEOUT).
 *
 * Built on node:http and node:https rather than the global fetch: Node documents `lookup` for
 * http.request and net's socket.connect, while a lookup for the global fetch needs an undici
 * Agent (`connect.lookup`) from the npm package undici, whose dispatcher must match the undici
 * version bundled with each Node release.
 */

import { lookup as dnsLookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP, isIPv4, isIPv6 } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

/** The defaults of a request: 20 MiB, 15 s. */
export const FETCH_DEFAULTS = Object.freeze({ maxBytes: 20_971_520, timeMs: 15_000 });

/** Headers a caller of guardedFetch may not set: the connection is guardedFetch's. */
const OWN_HEADERS = /^(host|connection|content-length|transfer-encoding|te|trailer|upgrade|keep-alive|proxy-.*|accept-encoding)$/i;

/** Network errors after which the same request may work again. */
const TRANSIENT = new Set(["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "EPIPE", "ENETUNREACH", "EHOSTUNREACH", "ECONNABORTED", "UND_ERR_SOCKET"]);

/**
 * A request guardedFetch refused or could not finish. `code` is one of BAD_URL, NOT_HTTPS, USERINFO,
 * BAD_HEADER, REFUSED_ADDRESS, REDIRECT, TOO_LARGE, TIMEOUT, ABORTED, BAD_ENCODING, NETWORK;
 * `transient` says whether the same request may work later. The message never holds the address's
 * path or query.
 */
export class GuardedFetchError extends Error {
    /**
     * @param {string} code
     * @param {string} message
     * @param {{ transient?: boolean, cause?: unknown, status?: number }} [more]
     */
    constructor(code, message, more = {}) {
        super(message, more.cause !== undefined ? { cause: more.cause } : undefined);
        this.name = "GuardedFetchError";
        this.code = code;
        this.transient = more.transient ?? false;
        if (more.status !== undefined) {
            this.status = more.status;
        }
    }
}

/**
 * An IP address as its bytes, or null.
 * @param {string} text
 * @returns {{ v: 4 | 6, bytes: number[] } | null}
 */
export function ipBytes(text) {
    const address = String(text).replace(/^\[|\]$/g, "").replace(/%.*$/, "");
    if (isIPv4(address)) {
        return { v: 4, bytes: address.split(".").map(Number) };
    }
    if (!isIPv6(address)) {
        return null;
    }
    let tail = [];
    let head = address;
    // a dotted IPv4 address at the end ("::ffff:169.254.169.254") is the last two groups
    const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(address);
    if (dotted) {
        const v4 = dotted[1].split(".").map(Number);
        tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
        head = address.slice(0, -dotted[1].length);
        head = head.endsWith("::") ? head : head.slice(0, -1);
    }
    const [left, right] = head.includes("::") ? head.split("::") : [head, null];
    const groups = (part) => (part ? part.split(":").filter((g) => g !== "").map((g) => parseInt(g, 16)) : []);
    const l = groups(left);
    const r = right === null ? [] : groups(right);
    const missing = 8 - l.length - r.length - tail.length;
    const words = right === null ? [...l, ...tail] : [...l, ...new Array(Math.max(missing, 0)).fill(0), ...r, ...tail];
    if (words.length !== 8) {
        return null;
    }
    return { v: 6, bytes: words.flatMap((w) => [w >> 8, w & 255]) };
}

/**
 * Why an IPv4 address is refused: "always", "private" or null.
 * @param {number[]} bytes
 */
function v4Rule(bytes) {
    const [a, b, c, d] = bytes;
    if (a === 0 || (a === 169 && b === 254) || a >= 224 || (a === 100 && b === 100 && c === 100 && d === 200)) {
        return "always";
    }
    if (a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0 && c === 0)) {
        return "private";
    }
    return null;
}

/**
 * Why an address is refused under the rules of a request ("always" or "private"), or null when it
 * may be connected to. A text that is no IP address is refused.
 * @param {string} address
 * @param {{ allowPrivate?: boolean }} [how]
 * @returns {string | null}
 */
export function addressRefusal(address, how = {}) {
    const ip = ipBytes(address);
    if (!ip) {
        return "always";
    }
    let rule;
    if (ip.v === 4) {
        rule = v4Rule(ip.bytes);
    } else {
        const b = ip.bytes;
        const zeros = (n) => b.slice(0, n).every((x) => x === 0);
        const v4 = b.slice(12);
        if (zeros(10) && b[10] === 255 && b[11] === 255) {
            // IPv4-mapped ::ffff:a.b.c.d
            rule = v4Rule(v4);
        } else if (b[0] === 0 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && b.slice(4, 12).every((x) => x === 0)) {
            // NAT64 64:ff9b::a.b.c.d reaches the IPv4 address through a gateway
            rule = v4Rule(v4);
        } else if (zeros(15) && b[15] === 1) {
            rule = "private";
        } else if (zeros(16)) {
            rule = "always";
        } else if (zeros(12)) {
            // IPv4-compatible ::a.b.c.d (deprecated)
            rule = v4Rule(v4);
        } else if (b[0] === 0xff || (b[0] === 0xfe && (b[1] & 0xc0) === 0x80)) {
            // multicast ff00::/8, link-local fe80::/10
            rule = "always";
        } else if (b[0] === 0xfd && b[1] === 0 && b[2] === 0x0e && b[3] === 0xc2 && b.slice(4, 14).every((x) => x === 0) && b[14] === 0x02 && b[15] === 0x54) {
            // fd00:ec2::254, a cloud's metadata service
            rule = "always";
        } else if ((b[0] & 0xfe) === 0xfc || (b[0] === 0xfe && (b[1] & 0xc0) === 0xc0)) {
            // unique local fc00::/7, the old site-local fec0::/10
            rule = "private";
        } else {
            rule = null;
        }
    }
    if (rule === "private" && how.allowPrivate !== false) {
        return null;
    }
    return rule;
}

/** Whether an address is a loopback address (127.0.0.0/8, ::1, ::ffff:127.x). */
const isLoopback = (address) => {
    const ip = ipBytes(address);
    if (!ip) {
        return false;
    }
    const b = ip.bytes;
    return ip.v === 4 ? b[0] === 127 : (b.slice(0, 15).every((x) => x === 0) && b[15] === 1) || (b.slice(0, 10).every((x) => x === 0) && b[10] === 255 && b[11] === 255 && b[12] === 127);
};

/** A refusal of an address as the error a request ends with. */
const refused = (rule) => new GuardedFetchError("REFUSED_ADDRESS", rule === "always" ? "the address is never connected to (link-local, metadata, multicast or unspecified)" : "the address is a loopback or private one, which this request may not reach");

/**
 * A lookup for a connection that refuses addresses the rules do not allow; every address a name has
 * is checked, and one refused refuses the name (a name that answers with a public and a metadata
 * address is not to be trusted).
 * @param {Function} lookup  dns.lookup or a stand-in (tests)
 * @param {{ allowPrivate?: boolean, plainHttp: boolean }} rules
 */
function guardedLookup(lookup, rules) {
    return (/** @type {string} */ hostname, /** @type {any} */ options, /** @type {Function} */ callback) => {
        if (typeof options === "function") {
            callback = options;
            options = {};
        }
        lookup(hostname, { ...options, all: true }, (/** @type {any} */ error, /** @type {any} */ addresses) => {
            if (error) {
                callback(error);
                return;
            }
            const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: isIP(addresses) }];
            if (!list.length) {
                callback(new GuardedFetchError("NETWORK", "the name has no address", { transient: true }));
                return;
            }
            for (const entry of list) {
                const rule = addressRefusal(entry.address, rules);
                if (rule || (rules.plainHttp && !isLoopback(entry.address))) {
                    callback(rule ? refused(rule) : new GuardedFetchError("NOT_HTTPS", "plain http goes to a loopback address only"));
                    return;
                }
            }
            if (options.all) {
                callback(null, list);
            } else {
                callback(null, list[0].address, list[0].family);
            }
        });
    };
}

/** The decoder of a content encoding, or null for none; undefined for one not known. */
function decoderOf(encoding) {
    const e = String(encoding ?? "").trim().toLowerCase();
    if (e === "" || e === "identity") {
        return null;
    }
    if (e === "gzip" || e === "x-gzip") {
        return createGunzip();
    }
    if (e === "deflate") {
        return createInflate();
    }
    if (e === "br") {
        return createBrotliDecompress();
    }
    return undefined;
}

/**
 * @typedef {object} GuardedRequest
 * @property {string} [method]  default GET
 * @property {Record<string, string>} [headers]
 * @property {string | Uint8Array} [body]
 * @property {AbortSignal} [signal]
 * @property {number} [maxBytes]  the most bytes of the body, decoded (default 20 MiB)
 * @property {number} [timeMs]  the whole request's time (default 15 s)
 * @property {boolean} [allowPrivate]  loopback and private addresses may be reached (default true)
 */

/**
 * @typedef {object} GuardedResponse
 * @property {number} status
 * @property {Record<string, string>} headers  lower-case names; repeated ones joined with ", "
 * @property {Uint8Array} body  decoded
 */

/**
 * A guardedFetch with other means for tests: a stand-in for dns.lookup, plain http to loopback, a
 * certificate authority to trust. Not part of the package's API.
 * @param {{ lookup?: Function, allowHttpLoopback?: boolean, ca?: string | Buffer }} [means]
 * @returns {(url: string | URL, request?: GuardedRequest) => Promise<GuardedResponse>}
 */
export function createGuardedFetch(means = {}) {
    const lookup = means.lookup ?? dnsLookup;
    return async function guarded(target, request = {}) {
        let url;
        try {
            url = new URL(String(target));
        } catch {
            throw new GuardedFetchError("BAD_URL", "not an address");
        }
        const plainHttp = url.protocol === "http:";
        if (url.protocol !== "https:" && !(plainHttp && means.allowHttpLoopback)) {
            throw new GuardedFetchError("NOT_HTTPS", "only https:// addresses are fetched");
        }
        if (url.username || url.password) {
            throw new GuardedFetchError("USERINFO", "an address with a user name or password is refused");
        }
        const rules = { allowPrivate: request.allowPrivate !== false, plainHttp };
        const host = url.hostname.replace(/^\[|\]$/g, "");
        if (isIP(host)) {
            const rule = addressRefusal(host, rules);
            if (rule) {
                throw refused(rule);
            }
            if (plainHttp && !isLoopback(host)) {
                throw new GuardedFetchError("NOT_HTTPS", "plain http goes to a loopback address only");
            }
        }
        /** @type {Record<string, string>} */
        const headers = {};
        for (const [name, value] of Object.entries(request.headers ?? {})) {
            if (OWN_HEADERS.test(name) || /[\r\n\0]/.test(String(value))) {
                throw new GuardedFetchError("BAD_HEADER", `the header ${JSON.stringify(name.slice(0, 40))} is guardedFetch's own or holds a line break`);
            }
            headers[name.toLowerCase()] = String(value);
        }
        headers["accept-encoding"] = "gzip, deflate, br";
        const body = typeof request.body === "string" ? Buffer.from(request.body, "utf8") : request.body ? Buffer.from(request.body.buffer, request.body.byteOffset, request.body.byteLength) : null;
        if (body) {
            headers["content-length"] = String(body.length);
        }
        const maxBytes = request.maxBytes ?? FETCH_DEFAULTS.maxBytes;
        const timeMs = request.timeMs ?? FETCH_DEFAULTS.timeMs;
        return new Promise((resolve, reject) => {
            let settled = false;
            /** @type {import("node:http").ClientRequest} */
            let req;
            const fail = (/** @type {GuardedFetchError} */ error) => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    request.signal?.removeEventListener("abort", onAbort);
                    reject(error);
                }
                req?.destroy();
            };
            const timer = setTimeout(() => fail(new GuardedFetchError("TIMEOUT", `no complete answer within ${timeMs} ms`, { transient: true })), timeMs);
            const onAbort = () => fail(new GuardedFetchError("ABORTED", "the request was cancelled"));
            if (request.signal?.aborted) {
                onAbort();
                return;
            }
            request.signal?.addEventListener("abort", onAbort, { once: true });
            const options = {
                method: request.method ?? "GET",
                headers,
                agent: false,
                lookup: guardedLookup(lookup, rules),
                ...(means.ca ? { ca: means.ca } : {})
            };
            req = (plainHttp ? http : https).request(url, options, (res) => {
                const status = res.statusCode ?? 0;
                if (status >= 300 && status < 400) {
                    res.resume();
                    fail(new GuardedFetchError("REDIRECT", `the server answered ${status}, a redirect, which is not followed`, { status }));
                    return;
                }
                const length = Number(res.headers["content-length"]);
                const decoder = decoderOf(res.headers["content-encoding"]);
                if (decoder === undefined) {
                    res.resume();
                    fail(new GuardedFetchError("BAD_ENCODING", "the answer's content encoding is not one pivotkit reads"));
                    return;
                }
                if (!decoder && Number.isFinite(length) && length > maxBytes) {
                    res.resume();
                    fail(new GuardedFetchError("TOO_LARGE", `the answer is larger than ${maxBytes} bytes`));
                    return;
                }
                const stream = decoder ? res.pipe(decoder) : res;
                /** @type {Buffer[]} */
                const chunks = [];
                let size = 0;
                stream.on("data", (/** @type {Buffer} */ chunk) => {
                    size += chunk.length;
                    if (size > maxBytes) {
                        decoder?.destroy();
                        fail(new GuardedFetchError("TOO_LARGE", `the answer is larger than ${maxBytes} bytes`));
                        return;
                    }
                    chunks.push(chunk);
                });
                stream.on("error", (/** @type {any} */ e) => fail(decoder && e?.code?.startsWith?.("Z_") ? new GuardedFetchError("BAD_ENCODING", "the answer's compressed body is broken") : networkError(e)));
                res.on("aborted", () => fail(new GuardedFetchError("NETWORK", "the connection closed before the answer was complete", { transient: true })));
                stream.on("end", () => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    clearTimeout(timer);
                    request.signal?.removeEventListener("abort", onAbort);
                    /** @type {Record<string, string>} */
                    const out = {};
                    for (const [name, value] of Object.entries(res.headers)) {
                        if (value !== undefined && name !== "set-cookie") {
                            out[name] = Array.isArray(value) ? value.join(", ") : String(value);
                        }
                    }
                    const all = Buffer.concat(chunks);
                    resolve({ status, headers: out, body: new Uint8Array(all.buffer, all.byteOffset, all.byteLength) });
                });
            });
            // the address the socket reached, checked once more (an IP address in the URL is never looked up)
            req.on("socket", (socket) => {
                const check = () => {
                    const remote = socket.remoteAddress ?? "";
                    const rule = addressRefusal(remote, rules);
                    if (rule || (plainHttp && !isLoopback(remote))) {
                        fail(rule ? refused(rule) : new GuardedFetchError("NOT_HTTPS", "plain http goes to a loopback address only"));
                    }
                };
                if (socket.remoteAddress) {
                    check();
                } else {
                    socket.once("connect", check);
                }
            });
            req.on("error", (e) => fail(e instanceof GuardedFetchError ? e : networkError(e)));
            req.end(body ?? undefined);
        });
    };
}

/** A network error as a GuardedFetchError (its code only, never an address). */
function networkError(e) {
    if (e instanceof GuardedFetchError) {
        return e;
    }
    // the family autodetection gives an AggregateError of each try; the lookup's own refusal is in it
    const inner = /** @type {any} */ (e)?.errors?.find?.((x) => x instanceof GuardedFetchError);
    if (inner) {
        return inner;
    }
    const code = String(/** @type {any} */ (e)?.code ?? /** @type {any} */ (e)?.errors?.[0]?.code ?? "unknown");
    return new GuardedFetchError("NETWORK", `the connection failed (${code.slice(0, 40)})`, { transient: TRANSIENT.has(code), cause: e });
}

/**
 * Fetches an address under the rules above.
 * @type {(url: string | URL, request?: GuardedRequest) => Promise<GuardedResponse>}
 */
export const guardedFetch = createGuardedFetch();

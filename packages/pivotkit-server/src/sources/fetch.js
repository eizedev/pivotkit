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
 *   with the broadcast address, the cloud metadata addresses fd00:ec2::254, 100.100.100.200,
 *   168.63.129.16 and 192.0.0.192, also where an IPv6 address carries an IPv4 one (mapped ::ffff:0:0/96, SIIT
 *   ::ffff:0:0:0/96, compatible ::/96, NAT64 64:ff9b::/96 and 64:ff9b:1::/48, 6to4 2002::/16,
 *   Teredo 2001::/32): the IPv4 address is taken out and its rule applies. Loopback, private and
 *   shared ranges are refused only with allowPrivate: false. An IP address written in the URL is
 *   refused unless allowIpLiterals is set (a backend is configured by name).
 * - Every request has its own connection (agent: false): no socket is shared between requests with
 *   different rules, and the proxy of the environment (NODE_USE_ENV_PROXY with HTTP(S)_PROXY, which
 *   node:http's global agent follows) is not used, so no proxy connects past the address check
 *   (test/fetch.test.js).
 * - The body is counted while it streams, after decompression: over maxBytes the request is ended
 *   (TOO_LARGE); the whole request, body included, ends after timeMs (TIMEOUT).
 *
 * Built on node:http and node:https rather than the global fetch. Node documents `lookup` as an
 * option of http.request ("Custom lookup function. Default: dns.lookup()") and of net's
 * socket.connect, which calls it with `all: true` under autoSelectFamily (Node 22 docs: http.html,
 * net.html). The global fetch takes a lookup only through a custom `dispatcher`, which "must be
 * compatible with undici's Dispatcher class" (globals.html, fetch, "Custom dispatcher"); Node
 * exports no such class, so it would take the npm package undici as a new dependency, kept
 * compatible with the undici each Node release bundles (process.versions.undici), for which the
 * docs give no rule.
 */

import { lookup as dnsLookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP, isIPv4, isIPv6 } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

/** The functions createGuardedFetch made. */
const guardedFetches = new WeakSet();

/** The defaults of a request: 20 MiB, 15 s. */
export const FETCH_DEFAULTS = Object.freeze({ maxBytes: 20_971_520, timeMs: 15_000 });

/** Headers a caller of guardedFetch may not set: the connection is guardedFetch's. */
const OWN_HEADERS = /^(host|connection|content-length|transfer-encoding|te|trailer|upgrade|keep-alive|proxy-.*|accept-encoding)$/i;

/** The methods a request may have. */
const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);

/** A header's name (RFC 9110 token). */
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/** A header's value: Latin-1 without control characters but tab. */
const HEADER_VALUE = /^[\t\x20-\x7e\x80-\xff]*$/;

/** Network errors after which the same request may work again. */
const TRANSIENT = new Set(["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "EPIPE", "ENETUNREACH", "EHOSTUNREACH", "ECONNABORTED", "UND_ERR_SOCKET"]);

/**
 * A request guardedFetch refused or could not finish. `code` is one of BAD_URL, NOT_HTTPS, USERINFO,
 * BAD_HEADER, BAD_METHOD, BAD_BODY, IP_LITERAL, REFUSED_ADDRESS, REDIRECT, TOO_LARGE, TIMEOUT, ABORTED, BAD_ENCODING, NETWORK;
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
    if (a === 0 || (a === 169 && b === 254) || a >= 224 || (a === 100 && b === 100 && c === 100 && d === 200) || (a === 168 && b === 63 && c === 129 && d === 16) || (a === 192 && b === 0 && c === 0 && d === 192)) {
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
        const embedded = embeddedV4(b);
        if (embedded.length) {
            // an IPv6 form that reaches an IPv4 address: the strictest rule of the addresses it may carry
            const rules = embedded.map(v4Rule);
            rule = rules.includes("always") ? "always" : rules.includes("private") ? "private" : null;
        } else if (zeros(15) && b[15] === 1) {
            rule = "private";
        } else if (zeros(16)) {
            rule = "always";
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

/**
 * The IPv4 addresses an IPv6 address carries (empty for none): mapped ::ffff:0:0/96, SIIT
 * ::ffff:0:0:0/96, NAT64 64:ff9b::/96 and the local 64:ff9b:1::/48 (RFC 8215; the IPv4 address at
 * either place RFC 6052 allows), 6to4 2002::/16, Teredo 2001::/32 (its server and its client, stored
 * inverted). IPv4-compatible ::/96 is left to the caller (:: and ::1 are not IPv4).
 * @param {number[]} b  the 16 bytes
 * @returns {number[][]}
 */
function embeddedV4(b) {
    const zeros = (from, to) => b.slice(from, to).every((x) => x === 0);
    const tail = b.slice(12);
    if (zeros(0, 10) && b[10] === 255 && b[11] === 255) {
        return [tail];
    }
    if (zeros(0, 8) && b[8] === 255 && b[9] === 255 && b[10] === 0 && b[11] === 0) {
        return [tail];
    }
    if (b[0] === 0 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) {
        if (zeros(4, 12)) {
            return [tail];
        }
        if (b[4] === 0 && b[5] === 1) {
            return [tail, [b[6], b[7], b[9], b[10]]];
        }
    }
    if (b[0] === 0x20 && b[1] === 0x02) {
        return [b.slice(2, 6)];
    }
    if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0 && b[3] === 0) {
        return [b.slice(4, 8), tail.map((x) => x ^ 0xff)];
    }
    if (zeros(0, 12) && !(zeros(12, 15) && b[15] <= 1)) {
        // IPv4-compatible ::a.b.c.d (deprecated)
        return [tail];
    }
    return [];
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
 * @property {string | Uint8Array | AsyncIterable<Uint8Array>} [body]  a stream (a file's read stream) needs a content-length header
 * @property {AbortSignal} [signal]
 * @property {number} [maxBytes]  the most bytes of the body, decoded (default 20 MiB)
 * @property {number} [timeMs]  the whole request's time (default 15 s)
 * @property {boolean} [allowPrivate]  loopback and private addresses may be reached (default true)
 * @property {boolean} [allowIpLiterals]  an IP address may be the URL's host (default false)
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
    guardedFetches.add(guarded);
    return guarded;

    /** @type {(target: string | URL, request?: GuardedRequest) => Promise<GuardedResponse>} */
    async function guarded(target, request = {}) {
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
        if (isIP(host) && !request.allowIpLiterals) {
            throw new GuardedFetchError("IP_LITERAL", "an IP address as the host is refused; name the server");
        }
        if (isIP(host)) {
            const rule = addressRefusal(host, rules);
            if (rule) {
                throw refused(rule);
            }
            if (plainHttp && !isLoopback(host)) {
                throw new GuardedFetchError("NOT_HTTPS", "plain http goes to a loopback address only");
            }
        }
        const method = request.method ?? "GET";
        if (!METHODS.has(method)) {
            throw new GuardedFetchError("BAD_METHOD", `the method is one of ${[...METHODS].join(", ")}`);
        }
        const streamed = isStream(request.body);
        /** @type {Record<string, string>} */
        const headers = {};
        for (const [name, value] of Object.entries(request.headers ?? {})) {
            // a streamed body states its length (an upload of a file): the one header of the connection a caller gives
            if (streamed && name.toLowerCase() === "content-length") {
                if (!/^\d{1,15}$/.test(String(value))) {
                    throw new GuardedFetchError("BAD_HEADER", "content-length is a number of bytes");
                }
                continue;
            }
            if (!TOKEN.test(name) || OWN_HEADERS.test(name) || !HEADER_VALUE.test(String(value))) {
                throw new GuardedFetchError("BAD_HEADER", `the header ${JSON.stringify(String(name).slice(0, 40))} is no header name, is guardedFetch's own, or its value holds a line break or a character outside Latin-1`);
            }
            headers[name.toLowerCase()] = String(value);
        }
        headers["accept-encoding"] = "gzip, deflate, br";
        const length = streamed ? Object.entries(request.headers ?? {}).find(([name]) => name.toLowerCase() === "content-length")?.[1] : undefined;
        if (streamed && length === undefined) {
            throw new GuardedFetchError("BAD_BODY", "a streamed body needs its content-length");
        }
        const given = /** @type {any} */ (request.body);
        const body = streamed ? null : typeof given === "string" ? Buffer.from(given, "utf8") : given ? Buffer.from(given.buffer, given.byteOffset, given.byteLength) : null;
        if (body) {
            headers["content-length"] = String(body.length);
        } else if (streamed) {
            headers["content-length"] = String(length);
        }
        const maxBytes = request.maxBytes ?? FETCH_DEFAULTS.maxBytes;
        const timeMs = request.timeMs ?? FETCH_DEFAULTS.timeMs;
        return new Promise((resolve, reject) => {
            let settled = false;
            /** @type {import("node:http").ClientRequest | undefined} */
            let req;
            /** @type {ReturnType<typeof setTimeout> | undefined} */
            let timer;
            const fail = (/** @type {GuardedFetchError} */ error) => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    request.signal?.removeEventListener("abort", onAbort);
                    reject(error);
                }
                req?.destroy();
            };
            const onAbort = () => fail(new GuardedFetchError("ABORTED", "the request was cancelled"));
            if (request.signal?.aborted) {
                onAbort();
                return;
            }
            const options = {
                method,
                headers,
                agent: false,
                lookup: guardedLookup(lookup, rules),
                ...(means.ca ? { ca: means.ca } : {})
            };
            try {
                req = (plainHttp ? http : https).request(url, options, (res) => {
                    const status = res.statusCode ?? 0;
                    if (status >= 300 && status < 400 && status !== 304) {
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
            } catch (e) {
                // node:http refuses an option it cannot send (a header it does not take): never a raw error
                fail(new GuardedFetchError("BAD_HEADER", "the request cannot be sent as given", { cause: e }));
                return;
            }
            timer = setTimeout(() => fail(new GuardedFetchError("TIMEOUT", `no complete answer within ${timeMs} ms`, { transient: true })), timeMs);
            request.signal?.addEventListener("abort", onAbort, { once: true });
            // the address the socket reached, checked again once it is connected: a second line behind
            // the lookup's check (an IP address in the URL is never looked up); by then a plain http
            // request may already be on its way, so the lookup's check is the one that keeps it back
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
            if (streamed) {
                sendStream(req, /** @type {AsyncIterable<Uint8Array>} */ (given), Number(length)).catch((e) => fail(e instanceof GuardedFetchError ? e : new GuardedFetchError("BAD_BODY", "the body could not be read", { cause: e })));
            } else {
                req.end(body ?? undefined);
            }
        });
    };
}

/** Whether a body is a stream (an async iterable of bytes, such as a file's read stream). */
const isStream = (body) => Boolean(body) && typeof body !== "string" && !(body instanceof Uint8Array) && typeof body[Symbol.asyncIterator] === "function";

/**
 * Sends a streamed body, waiting for the socket to drain, and ends the request; a body that is longer
 * or shorter than the length it stated is not sent whole (BAD_BODY). It stops once the request is
 * destroyed or ended (refused, timed out, answered), and the source stream is destroyed in every
 * case, so its file is closed.
 * @param {import("node:http").ClientRequest} req
 * @param {AsyncIterable<Uint8Array>} stream
 * @param {number} length
 */
async function sendStream(req, stream, length) {
    const gone = () => req.destroyed || req.writableEnded;
    try {
        let sent = 0;
        for await (const chunk of stream) {
            if (gone()) {
                return;
            }
            sent += chunk.length;
            if (sent > length) {
                throw new GuardedFetchError("BAD_BODY", "the body is longer than its content-length");
            }
            if (!req.write(chunk)) {
                // one pair of listeners per wait, both removed again: no listener piles up over many drains
                await new Promise((resolve) => {
                    const done = () => {
                        req.off("drain", done);
                        req.off("close", done);
                        resolve(undefined);
                    };
                    req.on("drain", done);
                    req.on("close", done);
                });
                if (gone()) {
                    return;
                }
            }
        }
        if (gone()) {
            return;
        }
        if (sent !== length) {
            throw new GuardedFetchError("BAD_BODY", "the body is shorter than its content-length");
        }
        req.end();
    } finally {
        /** @type {any} */ (stream).destroy?.();
    }
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

/**
 * Whether a function is a guardedFetch (made by createGuardedFetch), so a module that is handed one
 * (the token exchange of auth.js) can refuse anything else.
 * @param {unknown} fn
 */
export const isGuardedFetch = (fn) => typeof fn === "function" && guardedFetches.has(/** @type {any} */ (fn));

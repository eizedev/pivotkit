/*
 * pivotkit-node/net: how pivotkit-cli and pivotkit-server read what the network hands them: an IP
 * address as its bytes, whether a host or an address is loopback, a Retry-After header, and the
 * system code of a connection that failed with what that code means. Each front end keeps its own error class and words; the
 * reading is here, once.
 */

import { isIPv4, isIPv6 } from "node:net";

/**
 * An IP address as its bytes, or null. Brackets and a zone ("%eth0") are dropped first.
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
 * Whether an address's bytes are loopback: 127.0.0.0/8 or ::1, and with `mapped` also the IPv4-mapped
 * ::ffff:127.0.0.0/104.
 * @param {{ v: 4 | 6, bytes: number[] } | null} ip
 * @param {boolean} mapped
 */
function loopbackBytes(ip, mapped) {
    if (!ip) {
        return false;
    }
    const b = ip.bytes;
    const zeros = (to) => b.slice(0, to).every((x) => x === 0);
    return ip.v === 4 ? b[0] === 127 : (zeros(15) && b[15] === 1) || (mapped && zeros(10) && b[10] === 255 && b[11] === 255 && b[12] === 127);
}

/**
 * Whether a host is loopback.
 *
 * By default it reads a host as a URL or the configuration writes it: "localhost", an IPv4 address
 * of 127.0.0.0/8 or "::1", brackets allowed ("[::1]"), any case. Only these spellings: a name such as
 * "127.example.com" is no loopback, and neither is an IPv4-mapped "[::ffff:7f00:1]".
 *
 * `address: true` reads an IP address a lookup gave or a socket reached: every spelling counts, a
 * zone is dropped, and the IPv4-mapped ::ffff:127.0.0.0/104 is loopback too. A name never is.
 * @param {string} host
 * @param {{ address?: boolean }} [how]
 */
export function isLoopback(host, how) {
    if (how?.address === true) {
        return loopbackBytes(ipBytes(String(host ?? "")), true);
    }
    const plain = String(host ?? "").toLowerCase().replace(/^\[(.*)\]$/, "$1");
    return plain === "localhost" || ((plain === "::1" || isIPv4(plain)) && loopbackBytes(ipBytes(plain), false));
}

/**
 * A Retry-After header in seconds: a number of seconds, or an HTTP date (one that has passed is 0).
 * Null without one and for one that is neither. Each caller caps the result by its own rule.
 *
 * `maxDigits` is the longest text read as a number of seconds; a longer one is read as a date.
 * @param {unknown} value
 * @param {{ maxDigits?: number }} [how]
 * @returns {number | null}
 */
export function retryAfterSeconds(value, { maxDigits = Infinity } = {}) {
    if (typeof value !== "string" || !value.trim()) {
        return null;
    }
    const text = value.trim();
    const seconds = /^\d+$/.test(text) && text.length <= maxDigits ? Number(text) : Math.ceil((Date.parse(value) - Date.now()) / 1000);
    return Number.isFinite(seconds) ? Math.max(seconds, 0) : null;
}

/**
 * Where each kind of client puts the code of a failed connection, in the order it is looked for.
 * node:http and node:https put it on the error, or on each error of an AggregateError when they tried
 * IPv6 and IPv4. Node's fetch puts it on the error's cause, sometimes one level deeper; a client that
 * uses fetch and node:http (the command line's remote mode) looks there first, then on the error.
 */
const CODE_PLACES = Object.freeze({
    node: [(e) => e?.code, (e) => e?.errors?.[0]?.code],
    fetch: [(e) => e?.cause?.code, (e) => e?.code, (e) => e?.cause?.cause?.code]
});

/**
 * The system code of a connection that failed (ECONNREFUSED, UND_ERR_SOCKET, a TLS code), or null.
 * `client` says where to look (CODE_PLACES); the first code `accept` takes wins.
 * @param {unknown} error
 * @param {{ client: "node" | "fetch", accept?: (code: unknown) => boolean }} how  by default any code that is there
 * @returns {unknown}
 */
export function networkCodeOf(error, { client, accept = (code) => code !== undefined && code !== null }) {
    const e = /** @type {any} */ (error);
    return CODE_PLACES[client].map((place) => place(e)).find(accept) ?? null;
}

/**
 * The system codes of a failed connection that pivotkit knows, each once, with what it means:
 *
 * - `text`: the command line's words for it (remote mode's "the server cannot be reached: ...")
 * - `retry`: pivotkit-server's guardedFetch marks a request that failed so as transient
 * - `passes`: a source's load that failed so may pass by itself, so last good data may stand in
 *   (sources/run.js; Node's and undici's codes, also on a cause or an AggregateError's errors)
 *
 * The two readings of "may work again" differ by code; each stays as its caller had it.
 * @type {Readonly<Record<string, Readonly<{ text?: string, retry?: true, passes?: true }>>>}
 */
export const NETWORK_FAILURES = Object.freeze({
    ECONNREFUSED: { text: "the connection was refused (is the server running on that port?)", retry: true, passes: true },
    ENOTFOUND: { text: "the host name is not known", retry: true, passes: true },
    EAI_AGAIN: { text: "the host name cannot be looked up now", retry: true, passes: true },
    ECONNRESET: { text: "the connection was reset", retry: true, passes: true },
    EPIPE: { text: "the connection was closed", retry: true },
    ETIMEDOUT: { text: "the connection timed out", retry: true, passes: true },
    EHOSTUNREACH: { text: "the host cannot be reached", retry: true },
    ENETUNREACH: { text: "the network cannot be reached", retry: true },
    ECONNABORTED: { retry: true },
    UND_ERR_SOCKET: { text: "the connection was closed", retry: true, passes: true },
    UND_ERR_CONNECT_TIMEOUT: { text: "the connection timed out", passes: true },
    UND_ERR_HEADERS_TIMEOUT: { passes: true },
    UND_ERR_BODY_TIMEOUT: { passes: true },
    CERT_HAS_EXPIRED: { text: "the server's certificate has expired" },
    DEPTH_ZERO_SELF_SIGNED_CERT: { text: "the server's certificate is self-signed and not trusted" },
    SELF_SIGNED_CERT_IN_CHAIN: { text: "the server's certificate is not trusted (a self-signed certificate in its chain)" },
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: { text: "the server's certificate cannot be verified" },
    UNABLE_TO_GET_ISSUER_CERT_LOCALLY: { text: "the server's certificate cannot be verified (its issuer is not known here; NODE_EXTRA_CA_CERTS adds one)" },
    ERR_TLS_CERT_ALTNAME_INVALID: { text: "the server's certificate is for another host name" },
    ERR_SSL_WRONG_VERSION_NUMBER: { text: "the server does not speak TLS on that port (http instead of https?)" },
    EPROTO: { text: "the TLS handshake failed (http instead of https on that port?)" }
});

/**
 * What pivotkit knows of a failed connection's code (NETWORK_FAILURES), or an empty entry.
 * @param {unknown} code
 * @returns {Readonly<{ text?: string, retry?: true, passes?: true }>}
 */
export const networkFailureOf = (code) => (typeof code === "string" && Object.hasOwn(NETWORK_FAILURES, code) ? NETWORK_FAILURES[code] : {});

/*
 * The id of a request: 8 random bytes in base64url, carried through the request's work with
 * AsyncLocalStorage, so an error deep inside a source can name it and the request's log line can say
 * the same id. A person quotes it to the operator; it says nothing about the request itself. The
 * REST service runs each request, the MCP server each tool call, inside withRequestId; their log lines
 * carry the id, and a problem or tool error of an error with details names it. Outside a request,
 * errorDetails makes a fresh id per error.
 *
 * Besides its id, a request's scope holds what correlates it with the systems around it: a trace id
 * (W3C Trace Context: the one of a strictly parsed incoming `traceparent`, else a new one), an
 * incoming `X-Request-Id` after a length and character check (upstreamRequestId: a proxy's id, never
 * the server's own), and the client's address: behind a trusted proxy the forwarded one, with the
 * socket's peer (the proxy) beside it. The
 * HTTP edge (listen.js serveFetch, and each front end's handler for hosts that serve it themselves)
 * makes the scope once per request (requestScopeFor); the log adds its fields to every line written
 * inside it.
 *
 *   await withRequestId(newRequestId(), () => present(...));
 *   throw new OperationError("SOURCE_UNAVAILABLE", "...", errorDetails({ retryable: true }));
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { clientAddress } from "./checks.js";

/**
 * What the work running now belongs to.
 * @typedef {object} RequestScope
 * @property {string} id  the request's id (REQUEST_ID)
 * @property {string} traceId  32 lower-case hex characters
 * @property {string} [upstreamRequestId]  an incoming X-Request-Id that passed UPSTREAM_REQUEST_ID
 * @property {string} [address]  the client as best known: with http.trustProxy the forwarded one (the last entry of X-Forwarded-For), "invalid" for one that is no IP address; else the socket's peer
 * @property {string} [peerAddress]  the socket's peer, only where it differs from address (the proxy)
 */

/** The scope of the work running now. */
const current = new AsyncLocalStorage();

/** A new request id: 8 random bytes, base64url (11 characters). */
export const newRequestId = () => randomBytes(8).toString("base64url");

/** The form of a request id. */
export const REQUEST_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Runs fn with a request id that requestId() reads inside it (also across awaits).
 * @template T
 * @param {string} id
 * @param {() => T} fn
 * @returns {T}
 */
export const withRequestId = (id, fn) => current.run({ ...(current.getStore() ?? { traceId: newTraceId() }), id }, fn);

/**
 * Runs fn inside a request's scope (requestScopeFor's): requestId() and requestScope() read it.
 * @template T
 * @param {RequestScope} scope
 * @param {() => T} fn
 * @returns {T}
 */
export const withRequestScope = (scope, fn) => current.run(scope, fn);

/** The scope of the work running now, or null outside one. */
export const requestScope = () => /** @type {RequestScope | undefined} */ (current.getStore()) ?? null;

/** A new trace id: 16 random bytes in lower-case hex, as W3C Trace Context writes one. */
export const newTraceId = () => randomBytes(16).toString("hex");

/** A traceparent of version 00: version, trace id, parent id and flags, lower-case hex, nothing else. */
const TRACEPARENT_00 = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;

/** A traceparent of a later version: the same four fields first; what follows starts with "-". */
const TRACEPARENT_LATER = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}(?:-.*)?$/;

/**
 * The trace id of a traceparent header, or null for one that does not parse (W3C Trace Context,
 * level 1): lower-case hex only, version ff and the all-zero trace or parent id refused, version 00
 * exactly 55 characters, a later version its four fields first. A header sent twice (joined with a
 * comma) does not parse.
 * @param {string | null | undefined} header
 * @returns {string | null}
 */
export function traceIdOf(header) {
    if (typeof header !== "string" || header.length < 55 || header.length > 512) {
        return null;
    }
    const value = header.trim();
    const zero = (hex) => /^0+$/.test(hex);
    const v00 = TRACEPARENT_00.exec(value);
    if (v00) {
        return zero(v00[1]) || zero(v00[2]) ? null : v00[1];
    }
    const later = TRACEPARENT_LATER.exec(value);
    if (!later || later[1] === "00" || later[1] === "ff" || zero(later[2]) || zero(later[3])) {
        return null;
    }
    return later[2];
}

/**
 * An incoming X-Request-Id as it may be logged: 1 to 128 characters of letters, digits and
 * `_ . : + / = -` (UUIDs, hex ids, the ids proxies make); anything else is not logged.
 */
export const UPSTREAM_REQUEST_ID = /^[A-Za-z0-9_.:+/=-]{1,128}$/;

/**
 * An incoming X-Request-Id that passes UPSTREAM_REQUEST_ID, or undefined.
 * @param {string | null | undefined} header
 */
export const upstreamRequestIdOf = (header) => (typeof header === "string" && UPSTREAM_REQUEST_ID.test(header) ? header : undefined);

/** A socket's address as it is logged ("::ffff:192.0.2.10" is 192.0.2.10). */
const plainAddress = (address) => String(address ?? "").replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, "");

/** What a forwarded address is logged as when it is no IP address: never the proxy's in its place. */
export const INVALID_ADDRESS = "invalid";

/**
 * The addresses of a request's lines: `address` the client as best known, `peerAddress` the socket's
 * peer where that differs. With trustProxy and an X-Forwarded-For, address is its last entry when
 * that is an IP address, else "invalid" (a header the proxy should not have passed; the request is
 * never put on the proxy's address); without, the socket's peer alone.
 * @param {Request | null} request
 * @param {string | undefined} socket
 * @param {boolean} trustProxy
 * @returns {{ address?: string, peerAddress?: string }}
 */
function addressesOf(request, socket, trustProxy) {
    const peer = plainAddress(socket);
    if (!trustProxy || !request?.headers.has("x-forwarded-for")) {
        return peer ? { address: peer } : {};
    }
    const forwarded = plainAddress(clientAddress(request, "", true).replace(/^\[|\]$/g, ""));
    const address = isIP(forwarded) ? forwarded : INVALID_ADDRESS;
    return { address, ...(peer && peer !== address ? { peerAddress: peer } : {}) };
}

/** Where requestScopeFor keeps a request's scope in serveFetch's `info`. */
const SCOPE_KEY = Symbol("pivotkit.requestScope");

/**
 * The scope of the request `info` belongs to: made on first use (its id requestIdFor's), then the
 * same, so the HTTP edge and the front end's handler name one id and one trace.
 * @param {Request | null} request  its headers are read (null: none, for an answer made without the request)
 * @param {Record<string | symbol, any>} info  serveFetch's: `address` is the socket's peer
 * @param {{ trustProxy?: boolean }} [how]  trustProxy: the forwarded client is the address (addressesOf)
 * @returns {RequestScope}
 */
export function requestScopeFor(request, info, { trustProxy = false } = {}) {
    if (!Object.hasOwn(info, SCOPE_KEY)) {
        const headers = request?.headers ?? new Headers();
        const upstream = upstreamRequestIdOf(headers.get("x-request-id"));
        info[SCOPE_KEY] = Object.freeze({
            id: requestIdFor(info),
            traceId: traceIdOf(headers.get("traceparent")) ?? newTraceId(),
            ...(upstream ? { upstreamRequestId: upstream } : {}),
            ...addressesOf(request, info.address, trustProxy)
        });
    } else if (trustProxy && request?.headers.has("x-forwarded-for") && !info[SCOPE_KEY].peerAddress && info[SCOPE_KEY].address === plainAddress(info.address)) {
        // made first by a host's serveFetch without trustProxy: the front end's setting wins
        info[SCOPE_KEY] = Object.freeze({ ...info[SCOPE_KEY], ...addressesOf(request, info.address, true) });
    }
    return info[SCOPE_KEY];
}

/**
 * A response with the request's id as X-Request-Id (a copy when its headers are immutable): every
 * answer names the id the log lines of its request carry.
 * @param {Response} response
 * @param {string} id
 * @returns {Response}
 */
export function withRequestIdHeader(response, id) {
    if (response.headers.get("x-request-id") === id) {
        return response;
    }
    try {
        response.headers.set("x-request-id", id);
        return response;
    } catch {
        const headers = new Headers(response.headers);
        headers.set("x-request-id", id);
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
}

/**
 * Where a front end keeps a request's id in serveFetch's `info`, so the precheck, the route and an
 * answer to a body that cannot be read name the same id.
 */
const INFO_KEY = Symbol("pivotkit.requestId");

/**
 * The id of the request `info` belongs to: made on first use, then the same.
 * @param {Record<string | symbol, any>} info
 * @returns {string}
 */
export function requestIdFor(info) {
    if (!Object.hasOwn(info, INFO_KEY)) {
        info[INFO_KEY] = newRequestId();
    }
    return info[INFO_KEY];
}

/** Whether a value is a request id of pivotkit's form (an error's details may come from a source's code). */
export const isRequestId = (value) => typeof value === "string" && REQUEST_ID.test(value);

/** The request id of the work running now, or null outside withRequestId. */
export const requestId = () => /** @type {RequestScope | undefined} */ (current.getStore())?.id ?? null;

/**
 * The details of an OperationError a person can act on: the running request's id (a new one when
 * none runs, so an error always carries one), whether trying again may work, and after how long.
 * @param {{ retryable: boolean, retryAfter?: number }} how
 * @returns {import("pivotkit-report/operations").OperationErrorDetails}
 */
export function errorDetails({ retryable, retryAfter }) {
    return { requestId: requestId() ?? newRequestId(), retryable, ...(retryAfter !== undefined ? { retryAfter } : {}) };
}

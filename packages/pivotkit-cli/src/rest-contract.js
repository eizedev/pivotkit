/*
 * pivotkit-cli/rest: what the REST service of pivotkit-server and its client, the command line in
 * remote mode, must agree on: the base path, the source ids, the token syntax, the problem codes and
 * which addresses are loopback. pivotkit-server depends on pivotkit-cli (not the other way round), so
 * the one copy lives here and pivotkit-server re-exports it under the same names.
 */

import { isIPv4 } from "node:net";
import { OPERATION_ERRORS } from "pivotkit-report/operations";

/**
 * The extra field of the REST service's protected-resource metadata (RFC 9728 lets a resource add
 * its own) that names the public client `pivotkit login` signs in with (rest.signIn.clientId).
 */
export const SIGN_IN_CLIENT_FIELD = "pivotkit_client_id";

/** A sign-in client's ID: printable, no spaces, at most 200 characters. */
export const CLIENT_ID_SYNTAX = /^[\x21-\x7e]{1,200}$/;

/** The REST service's path under its origin. */
export const REST_BASE = "/api/v1";

/** A source id: letters, digits, "_", "-" and ".", at most 64, starting with a letter or digit. */
export const SOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

/** What a bearer token may hold (RFC 6750's b64token): a token with other characters never matches a request. */
export const TOKEN_SYNTAX = /^[A-Za-z0-9\-._~+/]+=*$/;

/** Why a token outside TOKEN_SYNTAX does not work. */
export const TOKEN_SYNTAX_TEXT = "has characters a bearer token cannot carry (letters, digits and - . _ ~ + / only, = at the end), so no request could send it";

/** The codes the REST layer adds to the operations', with their status. */
export const REST_ERRORS = Object.freeze({
    INVALID_TOKEN: 401,
    INSUFFICIENT_SCOPE: 403,
    FORBIDDEN_HOST: 403,
    FORBIDDEN_ORIGIN: 403,
    NOT_FOUND: 404,
    METHOD_NOT_ALLOWED: 405,
    BODY_TOO_LARGE: 413,
    UNSUPPORTED_MEDIA_TYPE: 415,
    VIEW_HAS_ERRORS: 422,
    RATE_LIMITED: 429,
    AUTH_NOT_READY: 503
});

/** Every code a problem can carry. */
export const PROBLEM_CODES = Object.freeze([...Object.keys(OPERATION_ERRORS), ...Object.keys(REST_ERRORS)]);

/**
 * Whether a host is loopback: "localhost", an IPv4 address of 127.0.0.0/8 or ::1 (as a URL's
 * hostname writes it, "[::1]", too). Only literal addresses: "127.example.com" is a name, not
 * loopback.
 * @param {string} host
 */
export function isLoopback(host) {
    const plain = String(host ?? "").toLowerCase().replace(/^\[(.*)\]$/, "$1");
    return plain === "localhost" || plain === "::1" || (isIPv4(plain) && plain.startsWith("127."));
}

/**
 * The RFC 9728 metadata address of a resource: /.well-known/oauth-protected-resource before its path
 * (https://host/api/v1 has it at https://host/.well-known/oauth-protected-resource/api/v1).
 * @param {string | URL} resource
 */
export function resourceMetadataUrlOf(resource) {
    const url = new URL(resource);
    const path = url.pathname.length > 1 && url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
    url.pathname = `/.well-known/oauth-protected-resource${path === "/" ? "" : path}`;
    url.hash = "";
    url.search = "";
    return url.href;
}

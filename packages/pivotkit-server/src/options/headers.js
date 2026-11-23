/*
 * The rules for a header in the configuration, shared by the HTTP sources (options/http.js), the
 * operator's upload store (options/upload.js) and the OpenAPI importer (source-from-openapi): which
 * names are headers, which values they may hold, which the connection sets and which carry a
 * credential. Each feature decides what it allows besides; the rules themselves live here once.
 */

import { ConfigError } from "./shared.js";

/** A header's name (RFC 9110 token). */
export const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,64}$/;

/** A header's value: printable Latin-1 and tab, no line break, no NUL. */
export const HEADER_VALUE = /^[\t\x20-\x7e\x80-\xff]{0,1000}$/;

/** A header or parameter name that looks like it carries a secret. */
export const SECRET_NAME = /key|token|secret|auth|pass/i;

/** The headers that carry a credential: never a text in the configuration. */
export const CREDENTIAL_HEADERS = /^(authorization|cookie)$/i;

/** The headers the connection sets (and what a proxy adds); `content-type` too where the body is pivotkit's. */
const CONNECTION_HEADERS = /^(host|content-length|transfer-encoding|connection|te|trailer|upgrade|keep-alive|accept-encoding|proxy-.*|x-forwarded-.*|forwarded)$/i;

/** Whether the connection sets this header (and a proxy what it adds). */
export const connectionHeader = (name) => CONNECTION_HEADERS.test(name);

/**
 * Refuses a header name that is no header or one the connection sets.
 * @param {string} name
 * @param {string} path  the option's path, for the message
 * @param {{ contentType?: boolean, why: string }} how  contentType: the body's type is pivotkit's too; why: the words after "this header is set by the connection"
 */
export function checkHeaderName(name, path, how) {
    if (!HEADER_NAME.test(name)) {
        throw new ConfigError(`${path}.${name.slice(0, 60)}: not a header name`);
    }
    if (CONNECTION_HEADERS.test(name) || (how.contentType && name.toLowerCase() === "content-type")) {
        throw new ConfigError(`${path}.${name}: this header is set by the connection${how.why}`);
    }
}

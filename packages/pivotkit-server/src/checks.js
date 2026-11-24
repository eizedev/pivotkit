/*
 * The checks of an HTTP request before it reaches a front end, protocol-free (each front end words
 * its own refusal): the Host header against the names the server answers to (DNS rebinding), and the
 * caller's address. A browser's Origin is checked by pivotkit-mcp (http.allowOrigins), not here.
 */

import { refusalReason } from "./log.js";

/** A Host header as RFC 9110 allows it: a name or an IP address (IPv6 in brackets), and a port. */
export const HOST_SYNTAX = /^(?:[A-Za-z0-9._~%!$&'()*+,;=-]+|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/;

/** The host names every server answers to: loopback. */
export const LOCAL_HOSTS = Object.freeze(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The host names a server answers to: loopback, the public URL's host and http.allowHosts.
 * @param {import("./config.js").ServerOptions} options
 */
export function allowedHosts(options) {
    const http = options.http ?? {};
    return [...LOCAL_HOSTS, ...(http.publicUrl ? [new URL(http.publicUrl).hostname] : []), ...(http.allowHosts ?? [])];
}

/** What a refused Host's answer and refused line say to do. */
export const HOST_HINT = "add the name with http.allowHosts or --allow-host, or set http.publicUrl";

/**
 * Why a request's Host is refused, or null when it is allowed (the port does not count). A name the
 * server does not answer to gets HOST_HINT.
 * @param {Request} request
 * @param {string[]} hosts
 */
export function hostRefusal(request, hosts) {
    // a Request built in code (a test, an adapter that keeps only the URL) has no Host header: its URL's host stands for it
    const header = request.headers.get("host") ?? new URL(request.url).host;
    if (!header) {
        return "Missing Host header";
    }
    if (!HOST_SYNTAX.test(header)) {
        return "Invalid Host header";
    }
    let hostname;
    try {
        hostname = new URL(`http://${header}`).hostname;
    } catch {
        return "Invalid Host header";
    }
    return hosts.includes(hostname) ? null : `Invalid Host: ${hostname.slice(0, 100)}; ${HOST_HINT}`;
}

/**
 * The refused line of a request whose Host is refused: the Host as sent, and HOST_HINT where the
 * refusal names it.
 * @param {Request} request
 * @param {string} refused  hostRefusal's
 * @param {{ path?: string }} [more]
 */
export const hostRefusedLine = (request, refused, more = {}) => ({ status: 403, ...more, reason: refusalReason("FORBIDDEN_HOST"), host: String(request.headers.get("host") ?? "").slice(0, 100), ...(refused.endsWith(HOST_HINT) ? { hint: HOST_HINT } : {}) });

/**
 * A client's address for the log and the limits: the socket's, or with http.trustProxy the last
 * address the proxy added to X-Forwarded-For.
 * @param {Request} request
 * @param {string} address  the socket's
 * @param {boolean} trustProxy
 */
export function clientAddress(request, address, trustProxy) {
    if (!trustProxy) {
        return address;
    }
    const forwarded = (request.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    return forwarded.at(-1)?.slice(0, 64) ?? address;
}

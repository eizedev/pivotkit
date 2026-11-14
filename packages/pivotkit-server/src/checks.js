/*
 * The checks of an HTTP request before it reaches a front end, protocol-free (each front end words
 * its own refusal): the Host header against the names the server answers to (DNS rebinding), and a
 * browser's Origin against an allow list.
 */

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

/**
 * Why a request's Host is refused, or null when it is allowed (the port does not count).
 * @param {Request} request
 * @param {string[]} hosts
 */
export function hostRefusal(request, hosts) {
    const header = request.headers.get("host");
    if (!header) {
        return "Missing Host header";
    }
    let hostname;
    try {
        hostname = new URL(`http://${header}`).hostname;
    } catch {
        return "Invalid Host header";
    }
    return hosts.includes(hostname) ? null : `Invalid Host: ${hostname.slice(0, 100)}`;
}

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

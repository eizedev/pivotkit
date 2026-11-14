/*
 * A fetch handler (Request in, Response out) on node:http: the headers checked before a byte of the
 * body is read (precheck), the body read up to a cap while it streams, the answer streamed with
 * back-pressure, a bound on connections (in all and per address, with room kept for loopback, so a
 * health check gets in while others hold every socket) and slow clients, and a close that lets
 * running requests finish for a while (SIGTERM in a container) before it cuts them off.
 */

import { createServer } from "node:http";
import { HOST_SYNTAX } from "./checks.js";

/** Whether an address is loopback. */
export const isLoopback = (host) => host === "127.0.0.1" || host === "::1" || host === "localhost" || /^127\./.test(host);

/** How long close() waits for running requests by default. */
export const GRACE_MS = 25_000;

/**
 * The bounds on connections: open at once in all, from one address (not loopback), the ones kept
 * for loopback (a health check, a proxy on the same host), and how long a client may take for its
 * headers and for its whole request (checked every checkMs: node:http's default, 30 seconds, would
 * let a stalled client stay six times as long).
 */
/** @typedef {{ total: number, perAddress: number, loopback: number, headersMs: number, requestMs: number, checkMs: number }} ConnectionLimits */
/** @type {Readonly<ConnectionLimits>} */
export const CONNECTION_LIMITS = Object.freeze({ total: 256, perAddress: 32, loopback: 16, headersMs: 5_000, requestMs: 30_000, checkMs: 1_000 });

/**
 * The connection limits for a server's options: behind a proxy it trusts (http.trustProxy) every
 * client comes from the proxy's address, so there is no bound per address.
 * @param {{ http?: { trustProxy?: boolean } }} options
 * @returns {Partial<ConnectionLimits>}
 */
export const connectionLimitsOf = (options) => (options.http?.trustProxy ? { perAddress: Infinity } : {});

/** A socket's address as a loopback check reads it ("::ffff:127.0.0.1" is 127.0.0.1). */
const plainAddress = (address) => String(address ?? "").replace(/^::ffff:/i, "");

/**
 * Who may open a connection: a count in all and per address. A connection from loopback may use
 * every slot; one from another address only those not kept for loopback, and at most
 * `perAddress` from one address, so stalled sockets from the network cannot lock out the health
 * check, and one address cannot take them all.
 * @param {{ total: number, perAddress: number, loopback: number }} limits
 */
export function connectionGate(limits) {
    const byAddress = new Map();
    let open = 0;
    let network = 0;
    return {
        /** Takes a slot for a new connection from `address`, or returns false. */
        admit(address) {
            const plain = plainAddress(address);
            if (isLoopback(plain)) {
                if (open >= limits.total) {
                    return false;
                }
            } else if (open >= limits.total || network >= limits.total - limits.loopback || (byAddress.get(plain) ?? 0) >= limits.perAddress) {
                return false;
            } else {
                network++;
            }
            open++;
            byAddress.set(plain, (byAddress.get(plain) ?? 0) + 1);
            return true;
        },
        /** Gives a connection's slot back. */
        release(address) {
            const plain = plainAddress(address);
            open--;
            if (!isLoopback(plain)) {
                network--;
            }
            const left = (byAddress.get(plain) ?? 1) - 1;
            if (left > 0) {
                byAddress.set(plain, left);
            } else {
                byAddress.delete(plain);
            }
        },
        open: () => open
    };
}

/**
 * The path and query of a request target: the origin form ("/x?y") as it is, the absolute form
 * ("http://host/x?y", which a proxy may send) by its path; anything else ("*", "host:443") is null.
 * @param {string | undefined} target
 */
export function pathOfTarget(target) {
    if (!target) {
        return null;
    }
    if (target.startsWith("/")) {
        return target;
    }
    if (/^https?:\/\//i.test(target)) {
        try {
            const url = new URL(target);
            return `${url.pathname}${url.search}`;
        } catch {
            return null;
        }
    }
    return null;
}

/**
 * @typedef {object} FetchHandler
 * @property {(request: Request, info: { address: string }) => Promise<Response>} fetch
 * @property {(request: Request, info: { address: string }) => Promise<Response | null>} [precheck]  checks before the body is read: a Response to send, or null to go on
 * @property {(status: 400 | 413, path: string) => Response} [problem]  the answer for a body that cannot be read (path: the request's)
 */

/**
 * Reads a node:http request's body, at most `max` bytes, while it streams. Beyond that it rejects
 * with status 413 and drains what follows (up to 4 x max, then the connection is cut), so the client
 * gets the answer instead of a reset connection.
 */
function readBody(req, max) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let over = false;
        req.on("data", (chunk) => {
            size += chunk.length;
            if (over) {
                if (size > max * 4) {
                    req.destroy();
                }
                return;
            }
            if (size > max) {
                over = true;
                chunks.length = 0;
                reject(Object.assign(new Error("too large"), { status: 413 }));
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
    });
}

/** The default answer for a body that cannot be read. */
const defaultProblem = (status) => Response.json({ error: status === 413 ? "request body too large" : "bad request" }, { status, headers: { connection: "close" } });

/**
 * Serves a fetch handler on node:http.
 * @param {FetchHandler} handler
 * @param {{ host: string, port: number, bodyBytes: number, graceMs?: number, limits?: Partial<ConnectionLimits> }} options  limits: CONNECTION_LIMITS's (tests)
 * @returns {Promise<{ port: number, server: import("node:http").Server, close(): Promise<void> }>}
 */
export async function serveFetch(handler, { host, port, bodyBytes, graceMs = GRACE_MS, limits: given = {} }) {
    const problem = handler.problem ?? defaultProblem;
    const limits = { ...CONNECTION_LIMITS, ...given };
    const gate = connectionGate(limits);
    let running = 0;
    /** @type {Array<() => void>} */
    let idle = [];
    const server = createServer({ maxHeaderSize: 16_384, requestTimeout: limits.requestMs, headersTimeout: limits.headersMs, connectionsCheckingInterval: limits.checkMs }, async (req, res) => {
        const path = pathOfTarget(req.url);
        if (path === null) {
            // "OPTIONS *", "CONNECT host:443": no resource of this server
            const answer = problem(400, "/");
            res.writeHead(answer.status, { ...Object.fromEntries(answer.headers), connection: "close" });
            res.end(Buffer.from(await answer.arrayBuffer()));
            return;
        }
        running++;
        const abort = new AbortController();
        res.on("close", () => abort.abort());
        const info = { address: String(req.socket.remoteAddress ?? "") };
        try {
            // every value of a repeated header: node:http keeps only the first Authorization (and drops
            // the others) in req.headers, so two tokens would pass as one; joined, the auth check sees both
            const headers = new Headers();
            for (const [k, values] of Object.entries(req.headersDistinct)) {
                for (const v of values ?? []) {
                    headers.append(k, v);
                }
            }
            // the address as the client asked for it; the Host check decides whether it is allowed. The
            // path is the request line's alone: a Host header with a path in it ("localhost/x?") is not
            // put in front of it, so it cannot change the route
            const host = req.headers.host ?? "localhost";
            const url = `http://${HOST_SYNTAX.test(host) ? host : "invalid.invalid"}${path}`;
            // what the headers tell is checked before a byte of the body is read
            const early = handler.precheck ? await handler.precheck(new Request(url, { method: req.method, headers }), info) : null;
            if (early) {
                // the body that follows is drained, not read, so the client gets the answer rather than a
                // reset connection; one that keeps sending past 4 x the cap is cut off
                let drained = 0;
                req.on("data", (chunk) => {
                    drained += chunk.length;
                    if (drained > bodyBytes * 4) {
                        req.destroy();
                    }
                });
                res.writeHead(early.status, Object.fromEntries(early.headers));
                res.end(Buffer.from(await early.arrayBuffer()));
                return;
            }
            const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req, bodyBytes);
            const request = new Request(url, { method: req.method, headers, body, signal: abort.signal });
            const response = await handler.fetch(request, info);
            res.writeHead(response.status, Object.fromEntries(response.headers));
            if (response.body && req.method !== "HEAD") {
                // a client that leaves stops the stream; a full socket is waited for
                abort.signal.addEventListener("abort", () => response.body?.cancel().catch(() => undefined), { once: true });
                for await (const chunk of response.body) {
                    if (!res.write(chunk)) {
                        // a client that leaves while the socket is full sends no drain: its close ends the wait
                        await new Promise((resolve) => {
                            res.once("drain", resolve);
                            res.once("close", resolve);
                        });
                        if (res.destroyed) {
                            break;
                        }
                    }
                }
            }
            res.end();
        } catch (e) {
            if (res.headersSent) {
                // a part of the answer is out: end the connection rather than add to it
                res.destroy();
                return;
            }
            if (e?.status === 413 && !req.complete) {
                // answer once the client has sent the rest (drained by readBody, cut beyond 4 x the cap):
                // closing while it still sends resets the connection before it reads the 413
                await new Promise((resolve) => {
                    req.once("end", resolve);
                    req.once("close", resolve);
                    setTimeout(resolve, 5000).unref();
                });
            }
            const answer = problem(e?.status === 413 ? 413 : 400, req.url ?? "/");
            res.writeHead(answer.status, { ...Object.fromEntries(answer.headers), connection: "close" });
            res.end(Buffer.from(await answer.arrayBuffer()));
        } finally {
            running--;
            if (running === 0) {
                const waiting = idle;
                idle = [];
                waiting.forEach((resolve) => resolve());
            }
        }
    });
    server.keepAliveTimeout = 5_000;
    // a bound on open connections, in all and per address, with slots kept for loopback
    server.on("connection", (socket) => {
        const address = socket.remoteAddress;
        if (!gate.admit(address)) {
            socket.destroy();
            return;
        }
        socket.once("close", () => gate.release(address));
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve(undefined));
    });
    const address = server.address();
    return {
        port: typeof address === "object" && address ? address.port : port,
        server,
        async close() {
            const closed = new Promise((resolve) => server.close(() => resolve(undefined)));
            // no new connections; idle ones go now, running requests get graceMs to finish
            server.closeIdleConnections();
            if (running > 0) {
                await Promise.race([new Promise((resolve) => idle.push(() => resolve(undefined))), new Promise((resolve) => setTimeout(resolve, graceMs).unref())]);
            }
            server.closeAllConnections();
            await closed;
        }
    };
}

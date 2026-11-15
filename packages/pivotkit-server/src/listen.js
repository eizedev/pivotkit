/*
 * A fetch handler (Request in, Response out) on node:http: the headers checked before a byte of the
 * body is read (precheck), the body read up to a cap while it streams, the answer streamed with
 * back-pressure, a bound on connections (in all and per address, with room kept for loopback, so a
 * health check gets in while others hold every socket) and slow clients, and a close that lets
 * running requests finish for a while (SIGTERM in a container) before it cuts them off.
 */

import { createServer } from "node:http";
import { isLoopback } from "pivotkit-cli/rest";
import { HOST_SYNTAX } from "./checks.js";
import { newRequestId, requestScopeFor, withRequestIdHeader, withRequestScope } from "./request-id.js";

/** Whether an address is loopback (pivotkit-cli/rest's: the CLI decides with it where http is allowed). */
export { isLoopback } from "pivotkit-cli/rest";

/**
 * Where a front end's precheck keeps a request's sign-in in the `info` object serveFetch hands to
 * precheck and then to fetch, so a token is checked once; a symbol, so a host's own info cannot
 * carry one by accident. Taken out when read.
 */
export const SIGNED_IN = Symbol("pivotkit.signedIn");

/**
 * The sign-in a precheck kept for this request, taken out of `info`, or undefined.
 * @param {Record<string | symbol, any>} info
 */
export function takeSignIn(info) {
    if (!Object.hasOwn(info, SIGNED_IN)) {
        return undefined;
    }
    const kept = info[SIGNED_IN];
    delete info[SIGNED_IN];
    return kept;
}

/** The most bytes of a request body, REST's and MCP's. */
export const BODY_BYTES = 2_097_152;

/** How long close() waits for running requests by default. */
export const GRACE_MS = 25_000;

/**
 * The bounds on connections: open at once in all; from one address other than loopback (0: no
 * bound, the default, since behind a published port, NAT or a proxy every client has one address);
 * the ones kept for loopback clients (the health check, a proxy on the same host: they protect
 * against the network, not against a local process); and how long a client may take for its
 * headers and for its whole request (checked every checkMs: node:http's default, 30 seconds, would
 * let a stalled client stay six times as long).
 */
/** @typedef {{ total: number, perAddress: number, loopback: number, headersMs: number, requestMs: number, checkMs: number }} ConnectionLimits */
/** @type {Readonly<ConnectionLimits>} */
export const CONNECTION_LIMITS = Object.freeze({ total: 256, perAddress: 0, loopback: 16, headersMs: 5_000, requestMs: 30_000, checkMs: 1_000 });

/**
 * The connection limits a server's options set: http.maxConnectionsPerAddress.
 * @param {{ http?: { maxConnectionsPerAddress?: number } }} options
 * @returns {Partial<ConnectionLimits>}
 */
export const connectionLimitsOf = (options) => (options.http?.maxConnectionsPerAddress ? { perAddress: options.http.maxConnectionsPerAddress } : {});

/**
 * What serveFetch's onRefused is told: the last refused connection's address, every bound that
 * refused one since the last report (`total`: every slot taken; `loopbackReserve`: the network's
 * slots taken, the rest kept for loopback; `perAddress`: http.maxConnectionsPerAddress), the
 * connections open then in all and from that address, and how many were refused since the last
 * report.
 * @typedef {{ address: string, limits: Array<"total" | "loopbackReserve" | "perAddress">, open: number, fromAddress: number, refused: number }} RefusedConnections
 */

/**
 * The log line for refused connections: every bound that refused one since the last line.
 * @param {RefusedConnections} entry
 */
export function refusedText(entry) {
    const why = { total: "every connection the server may hold was open", loopbackReserve: "the network held every slot not kept for loopback", perAddress: "an address held as many as http.maxConnectionsPerAddress allows" };
    return `connections refused since the last report: ${entry.limits.map((l) => why[l]).join("; ")}`;
}

/** A socket's address as a loopback check reads it ("::ffff:127.0.0.1" is 127.0.0.1). */
const plainAddress = (address) => String(address ?? "").replace(/^::ffff:/i, "");

/**
 * Who may open a connection: a count in all and per address. A connection from loopback may use
 * every slot; one from another address only those not kept for loopback, and with `perAddress` at
 * most that many from one address (an IPv6 address counts as it is, not by its network), so stalled
 * sockets from the network cannot lock out the health check, and one address cannot take them all.
 * @param {{ total: number, perAddress: number, loopback: number }} limits
 */
export function connectionGate(limits) {
    const byAddress = new Map();
    let open = 0;
    let network = 0;
    return {
        /** Which bound refused the last connection: "total", "loopbackReserve" or "perAddress". */
        refusedBy: /** @type {"total" | "loopbackReserve" | "perAddress" | null} */ (null),
        /** Takes a slot for a new connection from `address`, or returns false (refusedBy says why). */
        admit(address) {
            const plain = plainAddress(address);
            if (isLoopback(plain)) {
                if (open >= limits.total) {
                    this.refusedBy = "total";
                    return false;
                }
            } else if (open >= limits.total) {
                this.refusedBy = "total";
                return false;
            } else if (network >= limits.total - limits.loopback) {
                this.refusedBy = "loopbackReserve";
                return false;
            } else if (limits.perAddress > 0 && (byAddress.get(plain) ?? 0) >= limits.perAddress) {
                this.refusedBy = "perAddress";
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
        open: () => open,
        /** The connections open in all and from one address. */
        counts: (address) => ({ open, fromAddress: byAddress.get(plainAddress(address)) ?? 0 })
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
 * What serveFetch's onClientError is told of a request the HTTP parser refused: the status it was
 * answered with, its id (X-Request-Id of that answer), the socket's address and the parser's code.
 * @typedef {{ status: number, requestId: string, address: string, parserError: string }} ClientErrorEntry
 */

/**
 * @typedef {object} FetchHandler
 * @property {(request: Request, info: { address: string }) => Promise<Response>} fetch
 * @property {(request: Request, info: { address: string }) => Promise<Response | null>} [precheck]  checks before the body is read: a Response to send, or null to go on
 * @property {(status: 400 | 413, path: string, info?: Record<string | symbol, any>) => Response} [problem]  the answer for a body that cannot be read (path: the request's; info: the one the precheck had)
 */

/** The longest a refused body is drained before the connection is closed. */
const BODY_DRAIN_MS = 5000;

/**
 * Resolves once a request's body has ended or its connection closed, or after `ms` (a ref'd timer,
 * cleared when the request ends first).
 * @param {import("node:http").IncomingMessage} req
 * @param {number} ms
 */
function untilSent(req, ms) {
    return new Promise((resolve) => {
        const timer = setTimeout(done, ms);
        function done() {
            clearTimeout(timer);
            req.off("end", done);
            req.off("close", done);
            resolve(undefined);
        }
        req.once("end", done);
        req.once("close", done);
    });
}

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

/**
 * The cap of a request's body, decided after the precheck: it may look at the sign-in the precheck
 * kept in `info` (peekSignIn), so a larger cap can depend on who calls, never on what a stranger's
 * headers claim.
 * @typedef {(request: Request, info: Record<string | symbol, any>) => number} BodyBytes
 */

/**
 * The sign-in a precheck kept for this request, left in `info` for the route (takeSignIn takes it).
 * @param {Record<string | symbol, any>} info
 * @returns {{ caller: import("./registry.js").Caller } | undefined}
 */
export const peekSignIn = (info) => (Object.hasOwn(info, SIGNED_IN) ? info[SIGNED_IN] : undefined);

/** The most a cap function may give a signed-in caller: a larger cap is cut to it. */
export const MAX_BODY_BYTES = 67_108_864;

/**
 * A request's body cap: the number (the host's own), or what the function says, at most BODY_BYTES
 * for a caller the precheck did not sign in and at most MAX_BODY_BYTES for one it did; BODY_BYTES
 * for anything but a whole number of 1 or more.
 * @param {number | BodyBytes} bodyBytes
 * @param {Request} request  without its body
 * @param {Record<string | symbol, any>} info
 * @returns {number}
 */
export function bodyCapOf(bodyBytes, request, info) {
    if (typeof bodyBytes !== "function") {
        return Number.isSafeInteger(bodyBytes) && bodyBytes >= 1 ? bodyBytes : BODY_BYTES;
    }
    const cap = bodyBytes(request, info);
    if (!Number.isSafeInteger(cap) || cap < 1) {
        return BODY_BYTES;
    }
    return Math.min(cap, peekSignIn(info) === undefined ? BODY_BYTES : MAX_BODY_BYTES);
}

/** The default answer for a body that cannot be read. */
const defaultProblem = (status) => Response.json({ error: status === 413 ? "request body too large" : "bad request" }, { status, headers: { connection: "close" } });

/**
 * Serves a fetch handler on node:http. Every request runs in its scope (request-id.js requestScopeFor: its id, trace id and addresses, on
 * every log line written for it), and every answer names its id in X-Request-Id.
 * @param {FetchHandler} handler
 * @param {{ host: string, port: number, bodyBytes: number | BodyBytes, graceMs?: number, limits?: Partial<ConnectionLimits>, onRefused?: (entry: RefusedConnections) => void, trustProxy?: boolean, onClientError?: (entry: ClientErrorEntry) => void }} options  limits: over CONNECTION_LIMITS; onRefused: told of refused connections at most once a minute: the first at once, the rest of the minute when it ends (or at close); trustProxy: the scope names the forwarded client (http.trustProxy); onClientError: told of a request the HTTP parser refused
 * @returns {Promise<{ port: number, server: import("node:http").Server, close(): Promise<void> }>}
 */
export async function serveFetch(handler, { host, port, bodyBytes, graceMs = GRACE_MS, limits: given = {}, onRefused, trustProxy = false, onClientError }) {
    const problem = handler.problem ?? defaultProblem;
    const limits = { ...CONNECTION_LIMITS, ...given };
    const gate = connectionGate(limits);
    let running = 0;
    /** @type {Array<() => void>} */
    let idle = [];
    const server = createServer({ maxHeaderSize: 16_384, requestTimeout: limits.requestMs, headersTimeout: limits.headersMs, connectionsCheckingInterval: limits.checkMs }, async (req, res) => {
        const path = pathOfTarget(req.url);
        const info = { address: String(req.socket.remoteAddress ?? "") };
        if (path === null) {
            // "OPTIONS *", "CONNECT host:443": no resource of this server
            const scope = requestScopeFor(null, info, { trustProxy });
            const answer = withRequestIdHeader(withRequestScope(scope, () => problem(400, "/", info)), scope.id);
            res.writeHead(answer.status, { ...Object.fromEntries(answer.headers), connection: "close" });
            res.end(Buffer.from(await answer.arrayBuffer()));
            return;
        }
        running++;
        const abort = new AbortController();
        res.on("close", () => abort.abort());
        /** @type {import("./request-id.js").RequestScope | null} the request's, once its headers are read */
        let scope = null;
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
            const head = new Request(url, { method: req.method, headers });
            const inScope = requestScopeFor(head, info, { trustProxy });
            scope = inScope;
            const early = handler.precheck ? await withRequestScope(inScope, () => /** @type {any} */ (handler.precheck)(head, info)) : null;
            // the body's cap, decided once the precheck has signed the caller in (it is in info)
            const cap = bodyCapOf(bodyBytes, head, info);
            if (early) {
                // the body that follows is drained, not read, so the client gets the answer rather than a
                // reset connection; one that keeps sending past 4 x the cap is cut off
                let drained = 0;
                req.on("data", (chunk) => {
                    drained += chunk.length;
                    if (drained > cap * 4) {
                        req.destroy();
                    }
                });
                res.writeHead(early.status, { ...Object.fromEntries(early.headers), "x-request-id": inScope.id });
                res.end(Buffer.from(await early.arrayBuffer()));
                return;
            }
            const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req, cap);
            const request = new Request(url, { method: req.method, headers, body, signal: abort.signal });
            const response = await withRequestScope(inScope, () => handler.fetch(request, info));
            res.writeHead(response.status, { ...Object.fromEntries(response.headers), "x-request-id": inScope.id });
            if (response.body && req.method === "HEAD") {
                // the body is not sent: given up, so whatever waits for its end (a caller's slot) is freed
                await response.body.cancel().catch(() => undefined);
            } else if (response.body) {
                // a client that leaves stops the stream, also one that left before the answer came: the
                // stream is read through a reader of its own, which its cancel ends at once (a cancel
                // of the locked stream itself would be refused), and its source learns it is given up,
                // so whatever waits for its end (a caller's slot) is freed; a full socket is waited for
                const reader = response.body.getReader();
                const stop = () => reader.cancel().catch(() => undefined);
                if (abort.signal.aborted) {
                    await stop();
                } else {
                    abort.signal.addEventListener("abort", stop, { once: true });
                }
                for (;;) {
                    // a body that fails rejects here: the catch below ends the connection, so a cut answer
                    // never looks complete; a cancel (the client left) ends the read with done
                    const { done, value } = await reader.read();
                    if (done) {
                        break;
                    }
                    if (!res.write(value)) {
                        // a client that leaves while the socket is full sends no drain: its close ends the wait
                        await new Promise((resolve) => {
                            res.once("drain", resolve);
                            res.once("close", resolve);
                        });
                        if (res.destroyed) {
                            await stop();
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
            const failed = scope ?? requestScopeFor(null, info, { trustProxy });
            const answer = withRequestScope(failed, () => problem(e?.status === 413 ? 413 : 400, req.url ?? "/", info));
            const bytes = Buffer.from(await answer.arrayBuffer());
            res.writeHead(answer.status, { ...Object.fromEntries(answer.headers), connection: "close", "content-length": String(bytes.length), "x-request-id": failed.id });
            if (e?.status === 413 && !req.complete) {
                // a body found too large while it streams (no Content-Length, as a proxy forwards an
                // HTTP/2 body): the answer goes out at once, complete by its length, so a client or proxy
                // that reads while it sends gets the 413 and its id also when it sends past 4 x the cap
                // and the connection is cut; the connection stays open while the rest is drained
                // (readBody), since closing while the client still sends resets it before it reads the answer
                res.write(bytes);
                await untilSent(req, BODY_DRAIN_MS);
                res.end();
            } else {
                res.end(bytes);
            }
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
    // a request the HTTP parser refuses (a broken request line, headers too large, too slow) never
    // reaches the handler: it is answered as node:http would, with an id, and told to onClientError
    server.on("clientError", (error, socket) => {
        const code = String(/** @type {any} */ (error)?.code ?? "");
        // as node:http's own handler: an answer only on a socket that can take one and is not in the
        // middle of another answer, then the socket destroyed at once (never left half-closed), so its
        // connection slot is free by the time the client sees it close
        const busy = /** @type {any} */ (socket)._httpMessage?.headersSent === true;
        if (code !== "ECONNRESET" && socket.writable && !busy) {
            const status = code === "HPE_HEADER_OVERFLOW" ? 431 : code === "ERR_HTTP_REQUEST_TIMEOUT" ? 408 : 400;
            const id = newRequestId();
            onClientError?.({ status, requestId: id, address: plainAddress(/** @type {import("node:net").Socket} */ (socket).remoteAddress), parserError: code.replace(/[^A-Z0-9_]/g, "").slice(0, 40) || "unknown" });
            socket.write(`HTTP/1.1 ${status} ${status === 431 ? "Request Header Fields Too Large" : status === 408 ? "Request Timeout" : "Bad Request"}\r\nConnection: close\r\nContent-Length: 0\r\nX-Request-Id: ${id}\r\n\r\n`);
        }
        socket.destroy();
    });
    // a bound on open connections, in all and per address, with slots kept for loopback
    // refused connections are told at most once a minute, so a flood does not flood the log too: the
    // first at once, those of the rest of the minute when it ends (or at close)
    /** @type {RefusedConnections | null} */
    let pending = null;
    let toldAt = 0;
    /** @type {NodeJS.Timeout | null} */
    let flush = null;
    const tell = () => {
        if (flush) {
            clearTimeout(flush);
            flush = null;
        }
        if (pending && onRefused) {
            toldAt = Date.now();
            onRefused(pending);
        }
        pending = null;
    };
    server.on("connection", (socket) => {
        const address = socket.remoteAddress;
        if (!gate.admit(address)) {
            socket.destroy();
            const bounds = new Set([...(pending?.limits ?? []), /** @type {any} */ (gate.refusedBy)]);
            pending = { address: String(address ?? ""), limits: [...bounds], ...gate.counts(address), refused: (pending?.refused ?? 0) + 1 };
            if (Date.now() - toldAt >= 60_000) {
                tell();
            } else if (!flush) {
                flush = setTimeout(tell, 60_000 - (Date.now() - toldAt));
                flush.unref();
            }
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
            tell();
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

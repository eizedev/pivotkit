/*
 * The command line's client of a pivotkit-server's REST service (remote mode: --url or --source).
 *
 * - The address is https, http only for a literal loopback host; no user name, password, query or
 *   fragment in it. Every request's address is built from it with new URL() and checked to stay
 *   under it; a source id is checked against SOURCE_ID first.
 * - The token comes from --token-file (a regular file, no symbolic link at its end, at most 4 KiB),
 *   else PIVOTKIT_TOKEN; it is read again for every request, checked against the bearer syntax
 *   before it is sent, and never part of a message: a message holds fixed words, the problem's code
 *   (one of the known ones) and its detail cleaned, with the token taken out.
 * - Redirects are never followed; every request has a time limit and a size cap on its answer (after
 *   decoding); an answer whose Content-Type is neither the expected one nor a problem is "not a
 *   pivotkit server answer", with its status only.
 * - A loopback address goes through node:http with an agent of its own, never through a proxy. Other
 *   addresses go through Node's fetch, which uses HTTP_PROXY and HTTPS_PROXY only as Node does: with
 *   NODE_USE_ENV_PROXY=1 or --use-env-proxy (Node 22.21 or later, 24 or later). Node's fetch cannot
 *   be told to leave out the proxy for one request (that needs undici's own dispatcher), hence the
 *   two ways.
 */

import http from "node:http";
import https from "node:https";
import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { RENDER_FORMATS } from "pivotkit-report";
import { CliError, RemoteError, asCliError, printable, shortName } from "./errors.js";
import { PROBLEM_CODES, REST_BASE, SOURCE_ID, TOKEN_SYNTAX, TOKEN_SYNTAX_TEXT, isLoopback } from "./rest-contract.js";
import { readSafe } from "./safe-files.js";

/** The most bytes of an answer after decoding: a JSON answer, and a rendered file. */
export const ANSWER_BYTES = Object.freeze({ json: 5 * 1024 * 1024, file: 64 * 1024 * 1024 });

/** The most bytes of a token file. */
export const TOKEN_FILE_BYTES = 4096;

/** The most seconds --timeout takes. */
const MAX_TIMEOUT = 3600;

const JSON_TYPE = "application/json";
const PROBLEM_TYPE = "application/problem+json";

/** What a network error's code says, in fixed words. */
const NETWORK_TEXTS = Object.freeze({
    ECONNREFUSED: "the connection was refused (is the server running on that port?)",
    ENOTFOUND: "the host name is not known",
    EAI_AGAIN: "the host name cannot be looked up now",
    ECONNRESET: "the connection was reset",
    EPIPE: "the connection was closed",
    ETIMEDOUT: "the connection timed out",
    EHOSTUNREACH: "the host cannot be reached",
    ENETUNREACH: "the network cannot be reached",
    UND_ERR_SOCKET: "the connection was closed",
    UND_ERR_CONNECT_TIMEOUT: "the connection timed out",
    CERT_HAS_EXPIRED: "the server's certificate has expired",
    DEPTH_ZERO_SELF_SIGNED_CERT: "the server's certificate is self-signed and not trusted",
    SELF_SIGNED_CERT_IN_CHAIN: "the server's certificate is not trusted (a self-signed certificate in its chain)",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: "the server's certificate cannot be verified",
    UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "the server's certificate cannot be verified (its issuer is not known here; NODE_EXTRA_CA_CERTS adds one)",
    ERR_TLS_CERT_ALTNAME_INVALID: "the server's certificate is for another host name",
    ERR_SSL_WRONG_VERSION_NUMBER: "the server does not speak TLS on that port (http instead of https?)",
    EPROTO: "the TLS handshake failed (http instead of https on that port?)"
});

/**
 * The server of remote mode: --url, else PIVOTKIT_URL, checked.
 * @param {Record<string, any>} values
 * @param {Record<string, string | undefined>} env
 * @returns {{ base: URL, origin: string, loopback: boolean, apiPath: boolean }}
 */
export function serverOf(values, env) {
    const from = values.url !== undefined ? "--url" : "PIVOTKIT_URL";
    const raw = values.url ?? env.PIVOTKIT_URL;
    if (!raw) {
        throw new CliError("usage", "NO_URL", "a server's address is needed: --url https://host/api/v1, or PIVOTKIT_URL");
    }
    // no part of the address is quoted back: it may hold a password
    let url;
    try {
        url = new URL(raw);
    } catch {
        throw new CliError("usage", "BAD_URL", `${from} is not an address; give https://host/api/v1`);
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new CliError("usage", "BAD_URL", `${from} takes an https:// address (http:// only for localhost, 127.0.0.1 or [::1])`);
    }
    if (url.username || url.password) {
        throw new CliError("usage", "BAD_URL", `${from} holds a user name or password: give the token with --token-file or PIVOTKIT_TOKEN, never in the address`);
    }
    if (url.search || url.hash || raw.includes("?") || raw.includes("#")) {
        throw new CliError("usage", "BAD_URL", `${from} holds a query or a fragment: give the REST address alone, https://host/api/v1`);
    }
    const loopback = isLoopback(url.hostname);
    if (url.protocol === "http:" && !loopback) {
        throw new CliError("usage", "BAD_URL", `${from}: http:// only for localhost, 127.0.0.1 or [::1], where nothing leaves the machine; use https://`);
    }
    const base = new URL(url.href.endsWith("/") ? url.href : `${url.href}/`);
    return { base, origin: url.origin, loopback, apiPath: base.pathname.replace(/\/+$/, "").endsWith(REST_BASE) };
}

/** --timeout in milliseconds. */
export function timeoutOf(values) {
    if (values.timeout === undefined) {
        return null;
    }
    const n = Number(values.timeout);
    if (!/^\d+$/.test(String(values.timeout)) || n < 1 || n > MAX_TIMEOUT) {
        throw new CliError("usage", "BAD_VALUE", `--timeout takes a whole number of seconds from 1 to ${MAX_TIMEOUT}`);
    }
    return n * 1000;
}

/** A source id, checked before it becomes part of an address. */
export function sourceId(id, what = "--source") {
    if (typeof id !== "string" || !SOURCE_ID.test(id)) {
        throw new CliError("usage", "BAD_SOURCE", `${what} is no source id (letters, digits, "_", "-" and ".", starting with a letter or digit, at most 64); pivotkit sources lists them`);
    }
    return id;
}

/** Text without one trailing line end (what an editor or `echo` adds to a file). */
const withoutLineEnd = (text) => text.replace(/\r?\n$/, "");

/** An error of reading --token-file, named after the flag ("--token-file x.txt: not found"). */
function tokenFileError(error) {
    if (!error.message.startsWith("--token-file")) {
        error.message = `--token-file ${error.message}`;
    }
    return error;
}

/**
 * The token: --token-file, else PIVOTKIT_TOKEN, else none. Read again on every call.
 * @param {Record<string, any>} values
 * @param {{ io: any, allow: string[] }} ctx
 * @returns {Promise<{ token: string | null, warning: string | null, from: string | null }>}  from: where the token came from, for the server line
 */
export async function readToken(values, ctx) {
    const path = values["token-file"];
    if (path === undefined) {
        const token = withoutLineEnd(String(ctx.io.env.PIVOTKIT_TOKEN ?? ""));
        if (token && !TOKEN_SYNTAX.test(token)) {
            throw new CliError("usage", "BAD_TOKEN", `the token of PIVOTKIT_TOKEN ${TOKEN_SYNTAX_TEXT}`);
        }
        return { token: token || null, warning: null, from: token ? "PIVOTKIT_TOKEN" : null };
    }
    let info;
    try {
        info = await lstat(resolve(ctx.io.cwd, path));
    } catch (e) {
        throw tokenFileError(asCliError(e, path));
    }
    if (info.isSymbolicLink()) {
        throw new CliError("io", "NOT_REGULAR_FILE", `--token-file ${shortName(path)}: is a symbolic link; give the token file itself`);
    }
    let bytes;
    try {
        bytes = await readSafe(path, { cwd: ctx.io.cwd, allow: ctx.allow, maxBytes: TOKEN_FILE_BYTES });
    } catch (e) {
        const error = asCliError(e, path);
        throw error.code === "LIMIT_EXCEEDED" ? new CliError("io", "TOKEN_FILE_TOO_LARGE", `--token-file ${shortName(path)}: larger than ${TOKEN_FILE_BYTES} bytes, so no token file`) : tokenFileError(error);
    }
    const token = withoutLineEnd(new TextDecoder("utf-8").decode(bytes));
    if (!token) {
        throw new CliError("usage", "BAD_TOKEN", `--token-file ${shortName(path)}: is empty`);
    }
    if (!TOKEN_SYNTAX.test(token)) {
        throw new CliError("usage", "BAD_TOKEN", `the token of --token-file ${shortName(path)} ${TOKEN_SYNTAX_TEXT}`);
    }
    // POSIX: a token others on the machine can read is theirs too
    const open = process.platform !== "win32" && (info.mode & 0o077) !== 0;
    return { token, warning: open ? `--token-file ${shortName(path)}: readable by the group or by others; chmod 600 ${shortName(path)}` : null, from: `--token-file ${shortName(path)}` };
}

/**
 * Whether Node routes fetch through the environment's proxy, as Node's documentation dates it:
 * NODE_USE_ENV_PROXY=1 since v24.0.0 and v22.21.0, --use-env-proxy since v24.5.0 and v22.21.0
 * (neither in 23).
 * @param {Record<string, string | undefined>} env
 * @param {string} [version]  Node's, for tests
 */
export function nodeUsesEnvProxy(env, version = process.versions.node) {
    const [major, minor] = version.split(".").map(Number);
    const variable = major >= 24 || (major === 22 && minor >= 21);
    const flag = major >= 25 || (major === 24 && minor >= 5) || (major === 22 && minor >= 21);
    const byFlag = process.execArgv.includes("--use-env-proxy") || /(^|\s)--use-env-proxy(\s|$)/.test(env.NODE_OPTIONS ?? "");
    return (variable && env.NODE_USE_ENV_PROXY === "1") || (flag && byFlag);
}

/** What the proxy note says about Node's versions (Node's documentation). */
export const ENV_PROXY_VERSIONS = "NODE_USE_ENV_PROXY=1 (Node 22.21.0 or later, 24.0.0 or later) or --use-env-proxy (Node 22.21.0 or later, 24.5.0 or later)";

/** What a network error says about the proxy variables (none of their values). */
function proxyNote(server, env) {
    if (server.loopback) {
        return "";
    }
    const names = server.base.protocol === "https:" ? ["https_proxy", "HTTPS_PROXY"] : ["http_proxy", "HTTP_PROXY"];
    // named as it is spelt in the environment (Windows reads variables in any case: env.https_proxy is HTTPS_PROXY there)
    const keys = Object.keys(env);
    const set = names.find((n) => keys.includes(n) && env[n]) ?? names.find((n) => env[n]);
    if (!set) {
        return "";
    }
    return nodeUsesEnvProxy(env) ? `; the request went through the proxy of ${set}` : `; ${set} is set, but Node uses it only with ${ENV_PROXY_VERSIONS}`;
}

/** The longest wait a Retry-After is taken at: a day (a longer one is no hint worth passing on). */
const MAX_RETRY_AFTER = 86_400;

/** Retry-After in seconds, or null (also for one over a day). */
function retryAfterOf(value) {
    if (!value) {
        return null;
    }
    const at = Date.parse(value);
    const seconds = /^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - Date.now()) / 1000));
    return seconds !== null && seconds <= MAX_RETRY_AFTER ? seconds : null;
}

/**
 * One request: a loopback address through node:http(s) with an agent of its own (no proxy, no
 * compression asked for), any other through Node's fetch (its proxy settings, redirects returned,
 * not followed).
 * @returns {Promise<{ status: number, header(name: string): string | null, body: AsyncIterable<Uint8Array>, cancel(): void }>}
 */
function send(url, { method, headers, body }, loopback, signal) {
    if (!loopback) {
        return fetch(url, { method, headers, body, redirect: "manual", signal }).then((r) => ({
            status: r.status,
            header: (name) => r.headers.get(name),
            body: /** @type {any} */ (r.body ?? []),
            cancel: () => void r.body?.cancel().catch(() => undefined)
        }));
    }
    return new Promise((done, fail) => {
        const lib = url.protocol === "https:" ? https : http;
        const request = lib.request(url, { method, headers: { ...headers, "accept-encoding": "identity" }, agent: new lib.Agent(), signal }, (response) =>
            done({
                status: response.statusCode ?? 0,
                header: (name) => {
                    const value = response.headers[name.toLowerCase()];
                    return Array.isArray(value) ? value.join(", ") : (value ?? null);
                },
                body: response,
                cancel: () => void response.destroy()
            })
        );
        request.on("error", fail);
        request.end(body);
    });
}

/** A server's text with the token taken out (data that goes into a file or --json keeps its length). */
const stripFrom = (token) => (text) => (token ? String(text ?? "").split(token).join("…") : String(text ?? ""));

/**
 * NODE_TLS_REJECT_UNAUTHORIZED=0 turns off the check of an https server's certificate: refused, with
 * or without a token (what comes back could be anyone's).
 */
export function checkTls(server, env) {
    if (server.base.protocol === "https:" && env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
        throw new CliError("usage", "INSECURE_TLS", "NODE_TLS_REJECT_UNAUTHORIZED=0 turns off the check of the server's certificate: pivotkit does not talk to a server so; unset it (a certificate of your own CA: NODE_EXTRA_CA_CERTS)");
    }
}

/**
 * The client of one run.
 * @param {{ server: ReturnType<typeof serverOf>, values: Record<string, any>, ctx: any, userAgent: string }} options
 */
export function createClient({ server, values, ctx, userAgent }) {
    const env = ctx.io.env;
    const timeoutMs = timeoutOf(values) ?? 30_000;
    /** The token of the last request, to take out of what the server says. */
    let lastToken = null;
    const warnings = new Set();
    /** Text the token is taken out of, uncut: what goes into a file or --json (JSON escapes control characters). */
    const strip = (text) => stripFrom(lastToken)(text);
    /** Text to print: the token out, control and direction characters out, capped (a message, a finding). */
    const clean = (text) => printable(strip(text));

    /** A network error in fixed words (never the exception's message: it may hold the address or a header). */
    function networkError(e, signal) {
        if (signal.aborted) {
            return new RemoteError("TIMEOUT", `the server did not answer within ${timeoutMs / 1000} s (--timeout)${proxyNote(server, env)}`);
        }
        const code = [e?.cause?.code, e?.code, e?.cause?.cause?.code].find((c) => typeof c === "string" && /^[A-Z][A-Z0-9_]{1,40}$/.test(c));
        const what = code && Object.hasOwn(NETWORK_TEXTS, code) ? NETWORK_TEXTS[code] : "no answer";
        return new RemoteError(code ?? "NETWORK", `the server cannot be reached: ${what}${proxyNote(server, env)}`);
    }

    /** An answer's body, at most `max` bytes after decoding; a cut one is an error. */
    async function bodyOf(answer, max, signal) {
        const declared = Number(answer.header("content-length"));
        const encoded = (answer.header("content-encoding") ?? "identity").toLowerCase() !== "identity";
        const tooLarge = () => new RemoteError("ANSWER_TOO_LARGE", `the server's answer is larger than ${max.toLocaleString("en-US")} bytes`, { status: answer.status });
        if (!encoded && Number.isFinite(declared) && declared > max) {
            answer.cancel();
            throw tooLarge();
        }
        const chunks = [];
        let size = 0;
        try {
            for await (const chunk of answer.body) {
                size += chunk.length;
                if (size > max) {
                    answer.cancel();
                    throw tooLarge();
                }
                chunks.push(chunk);
            }
        } catch (e) {
            if (e instanceof RemoteError) {
                throw e;
            }
            throw signal.aborted ? networkError(e, signal) : new RemoteError("ANSWER_CUT", "the server's answer was cut off", { status: answer.status });
        }
        if (!encoded && answer.header("content-length") !== null && Number.isFinite(declared) && size !== declared) {
            throw new RemoteError("ANSWER_CUT", "the server's answer was cut off", { status: answer.status });
        }
        return Buffer.concat(chunks);
    }

    /** An answer that is no pivotkit-server's: its status only. */
    function notPivotkit(status) {
        const hint = status === 404 && !server.apiPath ? `; the address should end in ${REST_BASE}` : "";
        return new RemoteError("NOT_PIVOTKIT", `not a pivotkit server answer (HTTP ${status})${hint}`, { status });
    }

    /** The error of a problem document, with a fixed hint for its code. */
    function problemError(problem, status, retryAfter) {
        const code = typeof problem.code === "string" && PROBLEM_CODES.includes(problem.code) ? problem.code : "PROBLEM";
        const detail = typeof problem.detail === "string" ? clean(problem.detail) : "";
        if (code === "INVALID_TOKEN") {
            // one sentence: whether a token went, where it came from, and the server's reason for a refused one
            const from = values["token-file"] !== undefined ? `--token-file ${shortName(values["token-file"])}` : "PIVOTKIT_TOKEN";
            const text = lastToken ? `the server refused the token from ${from}${detail ? `: ${detail}` : ""} (${status} ${code})` : `the server needs a token: set PIVOTKIT_TOKEN or give --token-file <file> (${status} ${code})`;
            return new RemoteError(code, text, { status, retryAfter });
        }
        if (code === "INVALID_INPUT") {
            // a source's parameter: the server's "re-run with params.x=..." as the flag that gives it (the
            // REST route's pointer is for programs), and a refused value with the flag that fixes it
            const rerun = detail.replace(/\. GET \/sources\/.*$/, "").replace(/\bre-run with params\.([A-Za-z0-9_-]{1,64})=/, "re-run with --param $1=");
            const refused = /^params\.([A-Za-z0-9_-]{1,64}) /.exec(rerun)?.[1];
            if (rerun !== detail || refused) {
                return new RemoteError(code, `the server answered ${status} ${code}: ${rerun}${refused ? `; fix it with --param ${refused}=<value>` : ""}`, { status, retryAfter });
            }
        }
        if (code === "NOT_ALLOWED" && detail.includes("results: true")) {
            return new RemoteError(code, `the server answered ${status} ${code}: ${detail}. validate, describe and sources still work with this token.`, { status, retryAfter });
        }
        const hints = {
            NOT_ALLOWED: "this token's profile has no results: true; validate, describe and sources still work with this token",
            NOT_FOUND: server.apiPath ? "" : `the address should end in ${REST_BASE}`
        };
        const wait = retryAfter !== null ? `retry in ${retryAfter} s` : "";
        // the hints after a semicolon, never a parenthesis after the server's words (which may end in one)
        const hint = [hints[code] ?? "", wait].filter(Boolean).join("; ");
        return new RemoteError(code, `the server answered ${status} ${code}${detail ? `: ${detail}` : ""}${hint ? `; ${hint}` : ""}`, { status, retryAfter });
    }

    /**
     * A request to a path under the address.
     * @param {"GET" | "POST"} method
     * @param {string} path  relative, without a leading "/" ("views/validate", "sources/sales")
     * @param {{ body?: unknown, accept: string, max: number, attachment?: boolean }} how  attachment: a 2xx must say Content-Disposition: attachment (the file route)
     * @returns {Promise<{ status: number, bytes: Buffer } | { status: number, viewErrors: any[] }>}
     */
    async function request(method, path, { body, accept, max, attachment = false }) {
        checkTls(server, env);
        const { token, warning } = await readToken(values, ctx);
        if (warning) {
            warnings.add(warning);
        }
        lastToken = token;
        const url = new URL(path, server.base);
        if (url.origin !== server.origin || !url.pathname.startsWith(server.base.pathname)) {
            throw new CliError("internal", "BAD_PATH", "a request would leave the server's address");
        }
        const headers = { accept: `${accept}, ${PROBLEM_TYPE}`, "user-agent": userAgent, ...(body !== undefined ? { "content-type": JSON_TYPE } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) };
        const signal = AbortSignal.timeout(timeoutMs);
        let answer;
        try {
            answer = await send(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, server.loopback, signal);
        } catch (e) {
            throw networkError(e, signal);
        }
        const status = answer.status;
        if (status >= 300 && status < 400) {
            answer.cancel();
            throw new RemoteError("REDIRECT", "the server redirected (a common cause: http instead of https); redirects are not followed", { status });
        }
        const type = (answer.header("content-type") ?? "").split(";")[0].trim().toLowerCase();
        const loopbackEncoded = server.loopback && (answer.header("content-encoding") ?? "identity").toLowerCase() !== "identity";
        if ((type !== PROBLEM_TYPE && type !== accept) || loopbackEncoded) {
            answer.cancel();
            throw notPivotkit(status);
        }
        const retryAfter = retryAfterOf(answer.header("retry-after"));
        if (type === PROBLEM_TYPE) {
            const bytes = await bodyOf(answer, ANSWER_BYTES.json, signal);
            let problem;
            try {
                problem = JSON.parse(bytes.toString("utf8"));
            } catch {
                throw notPivotkit(status);
            }
            if (!problem || typeof problem !== "object" || Array.isArray(problem)) {
                throw notPivotkit(status);
            }
            if (status === 422 && problem.code === "VIEW_HAS_ERRORS" && Array.isArray(problem.findings)) {
                return { status, viewErrors: cleanFindings(problem.findings) };
            }
            throw problemError(problem, status, retryAfter);
        }
        // the file route answers with an attachment; a page of the same type (a portal's sign-in page as
        // text/html) is not taken as the report. Only a marker: the name in it is never used
        const isAttachment = /^\s*attachment\b/i.test(answer.header("content-disposition") ?? "");
        if (status < 200 || status >= 300 || (attachment && !isAttachment)) {
            answer.cancel();
            throw notPivotkit(status);
        }
        return { status, bytes: await bodyOf(answer, max, signal) };
    }

    /** A server's findings, each part cleaned (the token out), unknown parts left out. */
    function cleanFindings(list) {
        return (Array.isArray(list) ? list : [])
            .filter((f) => f && typeof f === "object")
            .map((f) => ({
                severity: ["error", "warning", "info"].includes(f.severity) ? f.severity : "warning",
                code: clean(f.code),
                path: clean(f.path),
                message: clean(f.message),
                ...(typeof f.suggestion === "string" ? { suggestion: clean(f.suggestion) } : {})
            }));
    }

    /** A JSON route: its object, or the view's errors of a 422. */
    async function json(method, path, body) {
        const answer = await request(method, path, { body, accept: JSON_TYPE, max: ANSWER_BYTES.json });
        if ("viewErrors" in answer) {
            return answer;
        }
        let data;
        try {
            data = JSON.parse(answer.bytes.toString("utf8"));
        } catch {
            throw notPivotkit(answer.status);
        }
        if (!data || typeof data !== "object" || Array.isArray(data)) {
            throw notPivotkit(answer.status);
        }
        return { status: answer.status, data };
    }

    /** The file route: the rendered file's bytes, or the view's errors of a 422. */
    async function file(body) {
        const format = RENDER_FORMATS[body.format];
        // the media type without its parameters ("text/csv; charset=utf-8"), as the answer's is compared
        return request("POST", "views/render/file", { body, accept: format.mediaType.split(";")[0].trim().toLowerCase(), max: ANSWER_BYTES.file, attachment: true });
    }

    return { json, file, clean, strip, cleanFindings, warnings: () => [...warnings], origin: server.origin };
}

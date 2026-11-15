/*
 * A backend's sign-in for HTTP sources (sources.<id>.http.auth or httpSources.backends.<name>.auth,
 * compiled by options/http.js backendAuthOf): what headers pivotkit's request to the backend carries.
 *
 *   header             a static header from a secret reference, read on every request (rotation)
 *   clientCredentials  an OAuth access token for pivotkit itself (RFC 6749 4.4), with a client secret
 *                      (client_secret_basic) or a JWT client assertion read on every token request
 *                      (RFC 7523, e.g. a projected Kubernetes service account token)
 *   tokenExchange      an access token for the signed-in person (RFC 8693): the person's own token
 *                      goes as subject_token to the token endpoint, through auth.js exchangeTokenFor,
 *                      and nowhere else; never to a backend, never to an address from an answer
 *
 * Tokens are kept in this process only (TOKEN_LIMITS.entries at most): client credentials by the
 * settings' hash, until 30 s before they expire; an exchanged token by the settings' hash and the
 * person with the client and its scopes (identityKey with client: true), so a token got through a
 * broad client never serves a restricted one, at most until 30 s before it expires, until the
 * person's own token expires and maxAgeSeconds. One request per key at a time, shared by everyone
 * waiting for it (with a time limit of its own: one caller going away does not fail the others); a
 * failure is kept 5 s. A backend's 401 drops the token it was sent (dropToken), once.
 *
 * Nothing here logs or returns a secret or a token: a token endpoint's error is logged as its RFC
 * 6749 error code only (checked, error_description dropped), and every failure is a SourceError
 * whose words are pivotkit's, never transient (no last good data after a refused sign-in).
 */

import { OperationError } from "pivotkit-report/operations";
import { discover, exchangeTokenFor, identityKey } from "../auth.js";
import { readSecret, SecretError } from "../secrets.js";
import { requestId } from "../request-id.js";
import { GuardedFetchError, guardedFetch } from "./fetch.js";
import { canonicalJson } from "./keys.js";
import { SourceError } from "./run.js";

/** The limits of the sign-in's requests and of the token cache. */
export const TOKEN_LIMITS = Object.freeze({
    /** one token request, in ms */
    timeMs: 10_000,
    /** the most bytes of a token endpoint's answer */
    maxBytes: 65_536,
    /** a token is not used in its last seconds */
    earlySeconds: 30,
    /** expires_in when the answer has none or one outside 1 to maxExpires */
    defaultExpires: 60,
    maxExpires: 86_400,
    /** how long a failed token request is kept, in ms */
    errorMs: 5_000,
    /** the most tokens (and failures) kept */
    entries: 1000,
    /** how long the issuer's token_endpoint is kept, in ms */
    metadataMs: 3_600_000
});

/** An RFC 6749 error code as the log may hold it. */
const ERROR_CODE = /^[A-Za-z0-9_.-]{1,40}$/;

/** An access token as a header's value: printable ASCII without spaces, at most 16 KiB. */
const TOKEN_TEXT = /^[\x21-\x7e]{1,16384}$/;

/** A header's value: printable Latin-1 and tab (no CR, LF or NUL). */
const HEADER_VALUE = /^[\t\x20-\x7e\x80-\xff]{1,16384}$/;

/** RFC 8693's token type of an access token. */
const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";

/** The guardedFetch codes that mean the sign-in's settings are wrong. */
const SETUP_CODES = new Set(["BAD_URL", "NOT_HTTPS", "USERINFO", "BAD_HEADER", "IP_LITERAL", "REFUSED_ADDRESS", "REDIRECT"]);

/**
 * What the sign-in uses that tests replace: the issuer's metadata (auth.js discover). The guardedFetch
 * is the caller's (sources/http.js passes httpMeans.fetch).
 */
export const authMeans = { discover };

/**
 * What a sign-in did, for check-source (never a token or a secret).
 * @typedef {{ kind: string, tokenUrl?: string, status?: number, error?: string, scope?: string, expiresIn?: number, audienceDiffers?: boolean, notes?: string[] }} AuthTrace
 */

/**
 * A warning of the sign-in: to the log, and to check-source's trace.
 * @param {{ id: string, log: any, trace?: AuthTrace }} how
 * @param {string} text  without the source's name
 * @param {Record<string, unknown>} [fields]
 */
function warn(how, text, fields = {}) {
    how.log.warn(`the source ${how.id}: ${text}`, { source: how.id, requestId: requestId(), ...fields });
    if (how.trace) {
        (how.trace.notes ??= []).push(text);
    }
}

/** @typedef {{ token: string, until: number } | { error: Error, until: number }} Kept */

/** @type {Map<string, Kept>} the kept tokens and failures, oldest first */
const kept = new Map();
/** @type {Map<string, Promise<string>>} the token requests in flight */
const inflight = new Map();
/** @type {Map<string, { url: string, until: number } | { error: Error, until: number }>} each issuer's token_endpoint */
const endpoints = new Map();

/** The token cache, for tests: its size and a way to empty it. */
export const tokenCache = Object.freeze({
    size: () => kept.size,
    clear() {
        kept.clear();
        endpoints.clear();
    }
});

/** Keeps an entry as the newest; drops what has expired, then the oldest over TOKEN_LIMITS.entries. */
function remember(key, entry) {
    kept.delete(key);
    kept.set(key, entry);
    const now = Date.now();
    for (const [k, e] of kept) {
        if (e.until <= now) {
            kept.delete(k);
        }
    }
    while (kept.size > TOKEN_LIMITS.entries) {
        kept.delete(/** @type {string} */ (kept.keys().next().value));
    }
}

/**
 * A promise that also ends when the caller's signal fires (the promise goes on for the others).
 * @template T
 * @param {Promise<T>} promise
 * @param {AbortSignal | undefined} signal
 * @returns {Promise<T>}
 */
function until(promise, signal) {
    if (!signal) {
        return promise;
    }
    if (signal.aborted) {
        return Promise.reject(signal.reason);
    }
    return new Promise((resolve, reject) => {
        const gone = () => reject(signal.reason);
        signal.addEventListener("abort", gone, { once: true });
        promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", gone));
    });
}

/**
 * The token of a key: a kept one, the request in flight, or a new request (get). A failure is kept
 * TOKEN_LIMITS.errorMs.
 * @param {string} key
 * @param {() => Promise<{ token: string, until: number }>} get  until: when it stops being used (ms)
 * @param {AbortSignal | undefined} signal
 */
function tokenFor(key, get, signal) {
    const hit = kept.get(key);
    if (hit && hit.until > Date.now()) {
        return "error" in hit ? Promise.reject(hit.error) : Promise.resolve(hit.token);
    }
    let pending = inflight.get(key);
    if (!pending) {
        pending = get()
            .then(
                (got) => {
                    if (got.until > Date.now()) {
                        remember(key, got);
                    }
                    return got.token;
                },
                (error) => {
                    remember(key, { error, until: Date.now() + TOKEN_LIMITS.errorMs });
                    throw error;
                }
            )
            .finally(() => inflight.delete(key));
        // nobody may be waiting any more when it fails
        pending.catch(() => undefined);
        inflight.set(key, pending);
    }
    return until(pending, signal);
}

/** The sign-in's failure as a caller gets it (pivotkit's words; never transient). */
const signInFailure = (reason) => new SourceError("SOURCE_UNAVAILABLE", { transient: false, ...(reason ? { reason } : {}) });

/**
 * A secret of the sign-in, read now; a missing one is the source's setup failure (the log names the
 * reference, never the value).
 * @param {import("../options/http.js").SecretRef} ref
 * @param {{ at: string, baseDir: string | undefined }} auth
 * @param {{ id: string, log: any }} how
 * @param {string} key  which secret of the sign-in
 */
async function secretOf(ref, auth, how, key) {
    try {
        return await readSecret(ref, { baseDir: auth.baseDir });
    } catch (e) {
        if (e instanceof SecretError) {
            warn(how, `the backend's sign-in cannot be made: ${auth.at}.${key}: ${e.message}`);
            throw signInFailure("setup");
        }
        throw e;
    }
}

/**
 * The token endpoint's answer read: an access token of the bearer type and how long it lasts. A
 * refusal logs its RFC 6749 error code only.
 * @param {import("./fetch.js").GuardedResponse} answer
 * @param {{ id: string, log: any, trace?: AuthTrace, audience: string | null, exchange: boolean }} how
 * @returns {{ token: string, expiresIn: number }}
 */
function tokenAnswer(answer, how) {
    /** @type {any} */
    let body;
    try {
        body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(answer.body));
    } catch {
        body = null;
    }
    if (how.trace) {
        how.trace.status = answer.status;
    }
    if (answer.status < 200 || answer.status > 299) {
        const code = typeof body?.error === "string" && ERROR_CODE.test(body.error) ? body.error : null;
        if (how.trace && code) {
            how.trace.error = code;
        }
        warn(how, `the token endpoint answered ${answer.status}${code ? ` (${code})` : ""}`, { status: answer.status });
        // a refusal (4xx) is pivotkit's access refused; the endpoint failing (5xx) is the source not available
        throw signInFailure(answer.status >= 400 && answer.status < 500 && answer.status !== 429 ? "refused" : undefined);
    }
    const type = typeof body?.token_type === "string" ? body.token_type.toLowerCase() : "";
    const bearer = type === "bearer" || (how.exchange && type === "n_a" && body?.issued_token_type === ACCESS_TOKEN_TYPE);
    if (!body || typeof body.access_token !== "string" || !TOKEN_TEXT.test(body.access_token) || !bearer) {
        warn(how, `the token endpoint's answer holds no bearer access token (access_token, token_type Bearer)`);
        throw signInFailure("setup");
    }
    const given = body.expires_in;
    const expiresIn = Number.isSafeInteger(given) && given >= 1 && given <= TOKEN_LIMITS.maxExpires ? given : TOKEN_LIMITS.defaultExpires;
    if (expiresIn !== given) {
        how.log.debug(`the source ${how.id}: the token endpoint's expires_in is missing or outside 1 to ${TOKEN_LIMITS.maxExpires}; ${TOKEN_LIMITS.defaultExpires} s is used`, { source: how.id });
    }
    if (how.trace) {
        how.trace.expiresIn = expiresIn;
        if (typeof body.scope === "string") {
            how.trace.scope = body.scope.replace(/[^\x20-\x7e]/g, "").slice(0, 500);
        }
    }
    if (how.audience !== null) {
        const aud = audienceOf(body.access_token);
        if (aud !== undefined && !aud.includes(how.audience)) {
            if (how.trace) {
                how.trace.audienceDiffers = true;
            }
            warn(how, `the token's aud does not name the requested audience ${how.audience}; check the token endpoint's audience mapping`);
        }
    }
    return { token: body.access_token, expiresIn };
}

/**
 * A JWT's aud as a list (the token is not verified: the backend does that), or undefined when the
 * token is no JWT or has no aud.
 * @param {string} token
 * @returns {string[] | undefined}
 */
function audienceOf(token) {
    const parts = token.split(".");
    if (parts.length !== 3) {
        return undefined;
    }
    try {
        const aud = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))?.aud;
        return typeof aud === "string" ? [aud] : Array.isArray(aud) ? aud.filter((a) => typeof a === "string") : undefined;
    } catch {
        return undefined;
    }
}

/**
 * A request of the sign-in failed: its message to the log at debug (it can name a host), the caller
 * gets pivotkit's words.
 * @param {unknown} error
 * @param {{ id: string, log: any }} how
 */
function requestFailure(error, how) {
    if (error instanceof GuardedFetchError) {
        how.log.debug(`the source ${how.id}: the token request failed (${error.code}): ${String(error.message).slice(0, 300)}${error.code === "REFUSED_ADDRESS" && /private/.test(error.message) ? "; for a token endpoint on an internal address set intranet: true in the sign-in's settings" : ""}`, { source: how.id, requestId: requestId() });
        warn(how, `the token endpoint could not be reached (${error.code})`);
        return signInFailure(SETUP_CODES.has(error.code) ? "setup" : undefined);
    }
    return error;
}

/**
 * The token endpoint of the configured issuer: its metadata's token_endpoint, which must be https://
 * on the issuer's own origin (else the operator names it in tokenExchange.tokenUrl).
 * @param {string} issuer
 * @param {{ id: string, log: any }} how
 */
async function issuerTokenUrl(issuer, how) {
    const hit = endpoints.get(issuer);
    if (hit && hit.until > Date.now()) {
        if ("error" in hit) {
            throw hit.error;
        }
        return hit.url;
    }
    try {
        const metadata = await authMeans.discover(issuer);
        const url = typeof metadata?.token_endpoint === "string" && URL.canParse(metadata.token_endpoint) ? new URL(metadata.token_endpoint) : null;
        if (!url || url.protocol !== "https:" || url.origin !== new URL(issuer).origin) {
            warn(how, `the issuer's metadata names no https:// token_endpoint on the issuer's origin; set tokenExchange.tokenUrl`);
            throw signInFailure("setup");
        }
        endpoints.set(issuer, { url: url.href, until: Date.now() + TOKEN_LIMITS.metadataMs });
        return url.href;
    } catch (e) {
        const error = e instanceof SourceError ? e : signInFailure(undefined);
        if (!(e instanceof SourceError)) {
            warn(how, `the issuer's metadata could not be read for the token endpoint`);
        }
        endpoints.set(issuer, { error, until: Date.now() + TOKEN_LIMITS.errorMs });
        throw error;
    }
}

/**
 * Client credentials (RFC 6749 4.4): pivotkit's own access token.
 * @param {Extract<import("../options/http.js").BackendAuth, { kind: "clientCredentials" }>} auth
 * @param {{ id: string, log: any, fetch: typeof guardedFetch, trace?: AuthTrace }} how
 * @returns {Promise<{ token: string, until: number }>}
 */
async function clientCredentials(auth, how) {
    const form = new URLSearchParams({ grant_type: "client_credentials" });
    for (const key of /** @type {const} */ (["scope", "audience", "resource"])) {
        if (auth[key] !== null) {
            form.set(key, /** @type {string} */ (auth[key]));
        }
    }
    /** @type {Record<string, string>} */
    const headers = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
    if (auth.clientSecret) {
        const secret = await secretOf(auth.clientSecret, auth, how, "clientSecret");
        // RFC 6749 2.3.1: both parts form-encoded before the Basic credentials are made
        headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(auth.clientId)}:${encodeURIComponent(secret)}`).toString("base64")}`;
    } else {
        // RFC 7523 2.2: the JWT as the client's authentication, read on every request (rotation)
        form.set("client_id", auth.clientId);
        form.set("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
        form.set("client_assertion", await secretOf(/** @type {import("../options/http.js").SecretRef} */ (auth.assertion), auth, how, "assertion"));
    }
    let answer;
    try {
        answer = await how.fetch(auth.tokenUrl, { method: "POST", headers, body: form.toString(), timeMs: TOKEN_LIMITS.timeMs, maxBytes: TOKEN_LIMITS.maxBytes, allowPrivate: auth.intranet, allowIpLiterals: auth.allowIpLiterals });
    } catch (e) {
        throw requestFailure(e, how);
    }
    const got = tokenAnswer(answer, { ...how, audience: auth.audience, exchange: false });
    return { token: got.token, until: Date.now() + (got.expiresIn - TOKEN_LIMITS.earlySeconds) * 1000 };
}

/**
 * The token exchange (RFC 8693) for the signed-in person.
 * @param {Extract<import("../options/http.js").BackendAuth, { kind: "tokenExchange" }>} auth
 * @param {import("../registry.js").Caller} caller
 * @param {{ id: string, log: any, fetch: typeof guardedFetch, trace?: AuthTrace }} how
 * @returns {Promise<{ token: string, until: number }>}
 */
async function tokenExchange(auth, caller, how) {
    const url = auth.tokenUrl ?? (await issuerTokenUrl(/** @type {string} */ (auth.issuer), how));
    if (how.trace) {
        how.trace.tokenUrl = url;
    }
    const clientSecret = await secretOf(auth.clientSecret, auth, how, "clientSecret");
    let answer;
    try {
        answer = await exchangeTokenFor(caller, { url, clientId: auth.clientId, clientSecret, ...(auth.audience !== null ? { audience: auth.audience } : {}), ...(auth.resource !== null ? { resource: auth.resource } : {}), ...(auth.scope !== null ? { scope: auth.scope } : {}), timeMs: TOKEN_LIMITS.timeMs, maxBytes: TOKEN_LIMITS.maxBytes, allowPrivate: auth.intranet, allowIpLiterals: auth.allowIpLiterals, fetch: how.fetch });
    } catch (e) {
        throw requestFailure(e, how);
    }
    const got = tokenAnswer(answer, { ...how, audience: auth.audience, exchange: true });
    const now = Date.now();
    // never past the person's own token, never longer than maxAgeSeconds
    const ends = [now + (got.expiresIn - TOKEN_LIMITS.earlySeconds) * 1000, now + auth.maxAgeSeconds * 1000, ...(answer.subjectExpiresAt !== null ? [answer.subjectExpiresAt * 1000] : [])];
    return { token: got.token, until: Math.min(...ends) };
}

/**
 * The cache key of a sign-in's token for a caller; null for a header (nothing kept) and for a token
 * exchange without a person.
 * @param {import("../options/http.js").BackendAuth} auth
 * @param {import("../registry.js").Caller} caller
 */
function keyOf(auth, caller) {
    if (auth.kind === "clientCredentials") {
        return canonicalJson(["clientCredentials", auth.hash]);
    }
    if (auth.kind === "tokenExchange") {
        const identity = identityKey(caller, { client: true });
        return identity === null ? null : canonicalJson(["tokenExchange", auth.hash, identity]);
    }
    return null;
}

/**
 * The headers of a backend's sign-in for a request of this caller ({} without a sign-in). Throws a
 * SourceError (pivotkit's words) when the sign-in cannot be made, NOT_ALLOWED for a token exchange
 * without a signed-in person.
 * @param {import("../options/http.js").BackendAuth | null} auth
 * @param {import("../registry.js").Caller} caller
 * @param {{ signal?: AbortSignal, id: string, log: any, fetch?: typeof guardedFetch, trace?: AuthTrace }} how
 * @returns {Promise<Record<string, string>>}
 */
export async function backendHeaders(auth, caller, how) {
    if (!auth) {
        return {};
    }
    const means = { id: how.id, log: how.log, fetch: how.fetch ?? guardedFetch, ...(how.trace ? { trace: how.trace } : {}) };
    if (how.trace) {
        how.trace.kind = auth.kind;
        if (auth.kind === "clientCredentials") {
            how.trace.tokenUrl = auth.tokenUrl;
        }
    }
    if (auth.kind === "header") {
        const value = `${auth.prefix}${await secretOf(auth.value, auth, means, "value")}`;
        if (!HEADER_VALUE.test(value)) {
            warn(how, `${auth.at}.value is no header value (a character outside Latin-1, or longer than 16 KiB)`);
            throw signInFailure("setup");
        }
        return { [auth.name]: value };
    }
    const key = keyOf(auth, caller);
    if (key === null) {
        throw new OperationError("NOT_ALLOWED", "this source needs a signed-in person (an OAuth token with a subject)");
    }
    const token = await tokenFor(key, () => (auth.kind === "clientCredentials" ? clientCredentials(auth, means) : tokenExchange(auth, caller, means)), how.signal);
    return { authorization: `Bearer ${token}` };
}

/**
 * A backend answered 401 to these headers: the kept token it was sent is dropped (only that one: a
 * newer token another request got stays). Whether there was one to drop, so the request may be
 * made once more with a new token.
 * @param {import("../options/http.js").BackendAuth | null} auth
 * @param {import("../registry.js").Caller} caller
 * @param {Record<string, string>} headers  backendHeaders' for the refused request
 */
export function dropToken(auth, caller, headers) {
    if (!auth || auth.kind === "header") {
        return false;
    }
    const key = keyOf(auth, caller);
    const hit = key === null ? undefined : kept.get(key);
    if (key !== null && hit && "token" in hit && headers.authorization === `Bearer ${hit.token}`) {
        kept.delete(key);
        return true;
    }
    return false;
}

/**
 * Whether a configured source can be used only by a signed-in person: its backend's sign-in is a
 * token exchange, or a parameter is bound to a claim. Such a source is neither listed nor found for
 * a caller without a subject, and a schedule (which runs without a person) cannot run over it.
 * @param {import("../config.js").ServerOptions} options
 * @param {any} source  options.sources[id]
 */
export function personBound(options, source) {
    if (Object.values(source?.params ?? {}).some((p) => p && typeof p === "object" && p.claim !== undefined)) {
        return true;
    }
    const http = source?.http;
    if (!http) {
        return false;
    }
    const backends = options.httpSources?.backends ?? {};
    const auth = http.auth ?? (typeof http.backend === "string" && Object.hasOwn(backends, http.backend) ? backends[http.backend]?.auth : undefined);
    return Boolean(auth?.tokenExchange);
}

/**
 * Whether a caller may use a source personBound marks: a verified OAuth caller with a subject (an
 * identity of its own).
 * @param {import("../registry.js").Caller} caller
 */
export const isPerson = (caller) => typeof caller.subject === "string" && caller.subject !== "" && identityKey(caller) !== null;

/**
 * check-source for a token exchange, which needs a person's token: the token endpoint asked with the
 * client's credentials and no subject token, to see that it answers and does not refuse the client.
 * @param {Extract<import("../options/http.js").BackendAuth, { kind: "tokenExchange" }>} auth
 * @param {{ id: string, log: any, fetch?: typeof guardedFetch, trace: AuthTrace }} how
 * @returns {Promise<{ reached: boolean, clientRefused: boolean }>}
 */
export async function probeExchange(auth, how) {
    const means = { id: how.id, log: how.log, fetch: how.fetch ?? guardedFetch, trace: how.trace };
    how.trace.kind = auth.kind;
    const url = auth.tokenUrl ?? (await issuerTokenUrl(/** @type {string} */ (auth.issuer), means));
    how.trace.tokenUrl = url;
    const secret = await secretOf(auth.clientSecret, auth, means, "clientSecret");
    const form = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:token-exchange", subject_token_type: ACCESS_TOKEN_TYPE, requested_token_type: ACCESS_TOKEN_TYPE });
    for (const key of /** @type {const} */ (["audience", "resource", "scope"])) {
        if (auth[key] !== null) {
            form.set(key, /** @type {string} */ (auth[key]));
        }
    }
    const headers = { "content-type": "application/x-www-form-urlencoded", accept: "application/json", authorization: `Basic ${Buffer.from(`${encodeURIComponent(auth.clientId)}:${encodeURIComponent(secret)}`).toString("base64")}` };
    let answer;
    try {
        answer = await means.fetch(url, { method: "POST", headers, body: form.toString(), timeMs: TOKEN_LIMITS.timeMs, maxBytes: TOKEN_LIMITS.maxBytes, allowPrivate: auth.intranet, allowIpLiterals: auth.allowIpLiterals });
    } catch (e) {
        throw requestFailure(e, means);
    }
    how.trace.status = answer.status;
    let code;
    try {
        const body = JSON.parse(new TextDecoder().decode(answer.body));
        code = typeof body?.error === "string" && ERROR_CODE.test(body.error) ? body.error : null;
    } catch {
        code = null;
    }
    if (code) {
        how.trace.error = code;
    }
    return { reached: true, clientRefused: answer.status === 401 || code === "invalid_client" || code === "unauthorized_client" };
}

/*
 * `pivotkit login`, `pivotkit token` and `pivotkit logout`: sign-in for REST callers with the OAuth 2.0
 * device authorization grant (RFC 8628) at the server's own issuer. The server is not asked for
 * anything but its protected-resource metadata (RFC 9728); the tokens stay between the user and the
 * issuer.
 *
 * 1. The metadata at /.well-known/oauth-protected-resource/<path> names the resource (it must be the
 *    address given) and its issuer.
 * 2. The issuer's metadata (RFC 8414, else OpenID Connect discovery) must name the same issuer and
 *    give the device authorization and token endpoints.
 * 3. The device code is asked for. The issuer's host is printed before the code, with a warning
 *    when the code page is on another domain (RFC 8628 5.4). The token endpoint is polled at the
 *    interval the issuer asks for (RFC 8628 3.5); a network error, a timeout, a 5xx or an answer
 *    that is no JSON is asked again a few times, an OAuth error is not.
 * 4. The refresh token goes to the keychain (credential-store.js). `pivotkit token` trades it for a
 *    fresh access token under a lock file, and keeps a new refresh token the issuer may hand out.
 *    `pivotkit logout` revokes it at the issuer (RFC 7009) where the issuer offers that.
 *
 * Plain http is taken for the issuer only when the server's address is loopback too (tests, a
 * provider on the same machine).
 *
 * Requests follow remote mode's rules: https, plain http to a loopback address only, no redirects, a
 * time limit and a size cap. No token, refresh token or device code is ever part of a message; an
 * issuer's error is named by its OAuth error code only, never by its text.
 */

import { CliError, RemoteError, printable } from "./errors.js";
import { checkTls, send, serverOf } from "./remote.js";
import { CLIENT_ID_SYNTAX, SIGN_IN_CLIENT_FIELD, TOKEN_SYNTAX, isLoopback, resourceMetadataUrlOf } from "./rest-contract.js";
import { credentialStore, fileStoreText } from "./credential-store.js";

/** The most bytes of a metadata document or token answer. */
const ANSWER_BYTES = 262_144;

/**
 * RFC 8628: the poll interval without one from the issuer, what slow_down adds and the interval it
 * grows to at most (an issuer's own longer interval is kept), the longest interval taken from an
 * issuer at all (five minutes; a longer one is said and cut), the longest wait for the sign-in, and
 * how many transient failures (no answer, 5xx, 429) in a row a poll takes.
 */
export const DEVICE_POLL = Object.freeze({ intervalSeconds: 5, slowDownSeconds: 5, maxSlowDownSeconds: 60, maxIntervalSeconds: 300, maxWaitSeconds: 1800, transientTries: 3 });

/** The exit code of "the sign-in has ended: run pivotkit login again" (docs/reference/cli.md). */
export const SIGN_IN_AGAIN = 3;

/** The OAuth error codes a message may name; any other is "error". */
const OAUTH_ERRORS = Object.freeze(["authorization_pending", "slow_down", "access_denied", "expired_token", "invalid_grant", "invalid_client", "invalid_scope", "invalid_request", "unauthorized_client", "unsupported_grant_type", "temporarily_unavailable", "server_error"]);

/** What each error means for the user. */
const ERROR_HINTS = Object.freeze({
    access_denied: "the sign-in was declined",
    expired_token: "the code expired before the sign-in finished; run pivotkit login again",
    invalid_grant: "the sign-in has ended or was revoked",
    invalid_client: "the issuer does not know this client id, or it is no public client",
    unauthorized_client: "this client may not use the device code flow; the operator enables it at the issuer",
    invalid_scope: "the issuer refused the scopes; give the ones it offers with --scope",
    unsupported_grant_type: "the issuer does not offer this grant"
});

/** The device grant's type (RFC 8628 3.4). */
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

/** A scope token (RFC 6749 3.3). */
const SCOPE_TOKEN = /^[\x21\x23-\x5b\x5d-\x7e]{1,200}$/;

/** Waiting between polls, and one request's time limit. Tests replace them. */
export const signInMeans = { sleep: (ms) => new Promise((done) => setTimeout(done, ms)), requestMs: 15_000 };

/** The error codes of a request that may work when asked again. */
const TRANSIENT = new Set(["NETWORK", "TIMEOUT", "ANSWER_CUT", "BAD_ANSWER"]);

/** Whether a failed request may work when asked again: no answer, a cut or non-JSON one, or a 5xx. */
const isTransient = (e) => e instanceof RemoteError && (TRANSIENT.has(e.code) || (e.status !== null && (e.status >= 500 || e.status === 429)));

/** An error that ends with "run pivotkit login again": exit code SIGN_IN_AGAIN. */
const signInAgain = (error) => Object.assign(error, { exitCode: SIGN_IN_AGAIN });

/**
 * An address an issuer or its metadata names, checked: https, or http to loopback where the server
 * itself is on loopback.
 * @param {unknown} text
 * @param {string} what
 * @param {boolean} allowHttp
 */
export function checkedUrl(text, what, allowHttp) {
    if (typeof text !== "string" || !URL.canParse(text)) {
        throw new RemoteError("BAD_METADATA", `${what} is no address`);
    }
    const url = new URL(text);
    const ok = url.protocol === "https:" || (url.protocol === "http:" && allowHttp && isLoopback(url.hostname));
    if (!ok || url.username || url.password || url.hash) {
        throw new RemoteError("BAD_METADATA", `${what} is no https:// address (${printable(url.origin)})`);
    }
    return url;
}

/**
 * Whether the code page's host belongs to the issuer's: the same host, or one is a subdomain of the
 * other. A hint against a code page an attacker put elsewhere (RFC 8628 5.4), not a guarantee: two
 * tenants of one hosting domain (a.okta.com, b.okta.com) count as different hosts on purpose.
 * @param {string} page
 * @param {string} issuer
 */
export function sameSite(page, issuer) {
    const a = page.toLowerCase().replace(/\.$/, "");
    const b = issuer.toLowerCase().replace(/\.$/, "");
    return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/**
 * One request; its answer as a JSON object with its status. The answer's text never reaches a message.
 * @param {URL} url
 * @param {Record<string, string> | null} form  a POST's form, null for GET
 * @param {Record<string, string | undefined>} env
 * @param {{ parse?: boolean }} [how]  parse: false takes any body, read and dropped, and gives `data: {}` (RFC 7009's revocation answers 200 with any body, often none)
 * @returns {Promise<{ status: number, data: Record<string, any> }>}
 */
async function call(url, form, env, { parse = true } = {}) {
    checkTls({ base: url }, env);
    // a ref'd timer: the wait keeps the process alive; cleared when the answer is read
    const controller = new AbortController();
    const limitMs = signInMeans.requestMs;
    const timer = setTimeout(() => controller.abort(), limitMs);
    try {
        const headers = { accept: "application/json", ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}) };
        let answer;
        try {
            answer = await send(url, { method: form ? "POST" : "GET", headers, body: form ? new URLSearchParams(form).toString() : undefined }, isLoopback(url.hostname), controller.signal);
        } catch {
            throw new RemoteError(controller.signal.aborted ? "TIMEOUT" : "NETWORK", `${printable(url.origin)} cannot be reached${controller.signal.aborted ? ` within ${limitMs / 1000} s` : ""}`);
        }
        if (answer.status >= 300 && answer.status < 400) {
            answer.cancel();
            throw new RemoteError("REDIRECT", `${printable(url.origin)} redirected; redirects are not followed`, { status: answer.status });
        }
        const chunks = [];
        let size = 0;
        try {
            for await (const chunk of answer.body) {
                size += chunk.length;
                if (size > ANSWER_BYTES) {
                    answer.cancel();
                    throw new RemoteError("ANSWER_TOO_LARGE", `the answer of ${printable(url.origin)} is too large`, { status: answer.status });
                }
                chunks.push(chunk);
            }
        } catch (e) {
            if (e instanceof RemoteError) {
                throw e;
            }
            throw controller.signal.aborted ? new RemoteError("TIMEOUT", `${printable(url.origin)} did not answer within ${limitMs / 1000} s`, { status: answer.status }) : new RemoteError("ANSWER_CUT", `the answer of ${printable(url.origin)} was cut off`, { status: answer.status });
        }
        if (!parse) {
            return { status: answer.status, data: {} };
        }
        let data = null;
        try {
            data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
            data = null;
        }
        if (!data || typeof data !== "object" || Array.isArray(data)) {
            throw new RemoteError("BAD_ANSWER", `${printable(url.origin)} answered without a JSON object (HTTP ${answer.status})`, { status: answer.status });
        }
        return { status: answer.status, data };
    } finally {
        clearTimeout(timer);
    }
}

/** The OAuth error of an answer: a known code, else "error". */
const errorOf = (data) => (typeof data.error === "string" && OAUTH_ERRORS.includes(data.error) ? data.error : "error");

/** An issuer's refusal as an error: its code and a fixed hint, never its description. */
function oauthError(data, status, what) {
    const code = errorOf(data);
    const hint = ERROR_HINTS[code];
    return new RemoteError(code === "error" ? "OAUTH_ERROR" : code.toUpperCase(), `${what}: the issuer answered ${status} ${code}${hint ? `; ${hint}` : ""}`, { status });
}

/**
 * The server's protected-resource metadata: its resource (the address given) and issuer.
 * @param {ReturnType<typeof serverOf>} server
 * @param {Record<string, string | undefined>} env
 */
export async function resourceOf(server, env) {
    const at = new URL(resourceMetadataUrlOf(server.base));
    const { status, data } = await call(at, null, env).catch((e) => {
        throw e.code === "BAD_ANSWER" && e.status === 404 ? notOAuth(e.status) : e;
    });
    if (status === 404) {
        throw notOAuth(status);
    }
    if (status !== 200) {
        throw new RemoteError("BAD_METADATA", `the server's sign-in metadata answered HTTP ${status}`, { status });
    }
    const given = server.base.href.replace(/\/$/, "");
    if (typeof data.resource !== "string" || data.resource.replace(/\/$/, "") !== given) {
        throw new RemoteError("BAD_METADATA", `the server's metadata is for another address${typeof data.resource === "string" ? ` (${printable(data.resource)})` : ""}; give that address with --url`);
    }
    const issuers = Array.isArray(data.authorization_servers) ? data.authorization_servers.filter((s) => typeof s === "string") : [];
    if (issuers.length === 0) {
        throw new RemoteError("BAD_METADATA", "the server's metadata names no issuer");
    }
    checkedUrl(issuers[0], "the server's issuer", server.loopback);
    const scopes = Array.isArray(data.scopes_supported) ? data.scopes_supported.filter((s) => typeof s === "string" && SCOPE_TOKEN.test(s)) : [];
    // the client the server names for pivotkit login (rest.signIn.clientId), as it is: checked where it is used
    const published = Object.hasOwn(data, SIGN_IN_CLIENT_FIELD) ? data[SIGN_IN_CLIENT_FIELD] : undefined;
    return { resource: data.resource, issuer: issuers[0], scopes, published };
}

/** A server that publishes no sign-in metadata. */
const notOAuth = (status) => new RemoteError("NO_SIGN_IN", "the server publishes no sign-in metadata: it uses no sign-in provider (auth.mode oauth). Ask the operator for a token, or check the address (https://host/api/v1)", { status });

/**
 * The issuer's metadata: RFC 8414, else OpenID Connect discovery. Its issuer must be the one asked for.
 * @param {string} issuer
 * @param {Record<string, string | undefined>} env
 * @param {boolean} allowHttp  the server is on loopback
 */
export async function issuerOf(issuer, env, allowHttp) {
    const url = checkedUrl(issuer, "the issuer", allowHttp);
    const path = url.pathname.replace(/\/$/, "");
    const tries = [`${url.origin}/.well-known/oauth-authorization-server${path}`, `${url.origin}${path}/.well-known/openid-configuration`];
    for (const at of tries) {
        // any failure of the first address (a 404 page, a redirect, no answer) moves on to the second
        const answer = await call(new URL(at), null, env).catch(() => null);
        if (!answer || answer.status !== 200) {
            continue;
        }
        if (answer.data.issuer !== issuer) {
            throw new RemoteError("BAD_METADATA", `the issuer's metadata names another issuer (${printable(String(answer.data.issuer))})`);
        }
        const meta = answer.data;
        if (typeof meta.device_authorization_endpoint !== "string") {
            throw new RemoteError("NO_DEVICE_FLOW", "the issuer offers no device code flow (no device_authorization_endpoint in its metadata); the operator enables it at the issuer");
        }
        return {
            device: checkedUrl(meta.device_authorization_endpoint, "the issuer's device_authorization_endpoint", allowHttp),
            token: checkedUrl(meta.token_endpoint, "the issuer's token_endpoint", allowHttp),
            revocation: typeof meta.revocation_endpoint === "string" ? checkedUrl(meta.revocation_endpoint, "the issuer's revocation_endpoint", allowHttp) : null,
            scopes: Array.isArray(meta.scopes_supported) ? meta.scopes_supported.filter((s) => typeof s === "string") : null
        };
    }
    throw new RemoteError("BAD_METADATA", `the issuer's metadata cannot be read at ${printable(url.origin)}`);
}

/**
 * The scope to ask for: --scope, else the server's scopes and offline_access (for a refresh token)
 * when the issuer offers it or lists no scopes.
 * @param {string | undefined} given
 * @param {string[]} serverScopes
 * @param {string[] | null} issuerScopes
 */
export function scopeOf(given, serverScopes, issuerScopes) {
    if (given !== undefined) {
        const list = given.split(/\s+/).filter(Boolean);
        if (list.length === 0 || !list.every((s) => SCOPE_TOKEN.test(s))) {
            throw new CliError("usage", "BAD_VALUE", "--scope takes scopes separated by spaces");
        }
        return list.join(" ");
    }
    const offline = issuerScopes === null || issuerScopes.includes("offline_access") ? ["offline_access"] : [];
    return [...new Set([...serverScopes, ...offline])].join(" ");
}

/**
 * The client id: --client-id, else PIVOTKIT_CLIENT_ID, else the one the server publishes in its
 * metadata (rest.signIn.clientId).
 * @param {Record<string, any>} values
 * @param {Record<string, string | undefined>} env
 * @param {unknown} published  the metadata's SIGN_IN_CLIENT_FIELD, undefined without one
 * @returns {{ id: string, published: boolean }}
 */
function clientIdOf(values, env, published) {
    const id = values["client-id"] ?? env.PIVOTKIT_CLIENT_ID;
    if (id) {
        if (!CLIENT_ID_SYNTAX.test(id)) {
            throw new CliError("usage", "BAD_VALUE", "--client-id takes printable characters without spaces, at most 200");
        }
        return { id, published: false };
    }
    if (published === undefined) {
        throw new CliError("usage", "NO_CLIENT_ID", "the issuer's client id is needed: --client-id <id>, or PIVOTKIT_CLIENT_ID; the server publishes none (the operator names it)");
    }
    if (typeof published !== "string" || !CLIENT_ID_SYNTAX.test(published)) {
        throw new RemoteError("BAD_METADATA", "the client ID the server publishes is not usable; give one with --client-id");
    }
    return { id: published, published: true };
}

/** A token answer's tokens, checked. */
function tokensOf(data) {
    const access = data.access_token;
    if (typeof access !== "string" || access.length > 16_384 || !TOKEN_SYNTAX.test(access)) {
        throw new RemoteError("BAD_ANSWER", "the issuer's answer holds no usable access token");
    }
    if (typeof data.token_type === "string" && data.token_type.toLowerCase() !== "bearer") {
        throw new RemoteError("BAD_ANSWER", "the issuer's access token is no bearer token");
    }
    const refresh = typeof data.refresh_token === "string" && data.refresh_token.length > 0 && data.refresh_token.length <= 8192 && /^[\x21-\x7e]+$/.test(data.refresh_token) ? data.refresh_token : null;
    return { access, refresh };
}

/**
 * Polls the token endpoint until the person signed in (RFC 8628 3.4, 3.5). The wait is counted in
 * polls of the interval, not by the clock: a laptop that slept asks once more and gets expired_token.
 * @returns {Promise<{ access: string, refresh: string | null }>}
 */
async function pollFor(endpoints, start, clientId, env, say) {
    const expiresIn = Math.min(Number.isFinite(start.expires_in) && start.expires_in > 0 ? start.expires_in : 600, DEVICE_POLL.maxWaitSeconds);
    let interval = Math.max(Number.isFinite(start.interval) && start.interval > 0 ? Math.ceil(start.interval) : DEVICE_POLL.intervalSeconds, 1);
    if (interval > DEVICE_POLL.maxIntervalSeconds) {
        say(`note: the issuer asks to wait ${interval} s between checks; pivotkit checks every ${DEVICE_POLL.maxIntervalSeconds} s`);
        interval = DEVICE_POLL.maxIntervalSeconds;
    }
    let waited = 0;
    let transient = 0;
    for (;;) {
        if (waited >= expiresIn) {
            throw new RemoteError("EXPIRED_TOKEN", "the code expired before the sign-in finished; run pivotkit login again");
        }
        await signInMeans.sleep(interval * 1000);
        waited += interval;
        let poll;
        try {
            poll = await call(endpoints.token, { grant_type: DEVICE_GRANT, device_code: start.device_code, client_id: clientId }, env);
            if (poll.status >= 500 || poll.status === 429) {
                throw new RemoteError("SERVER_ERROR", `the issuer answered ${poll.status}`, { status: poll.status });
            }
        } catch (e) {
            if (isTransient(e) && ++transient <= DEVICE_POLL.transientTries) {
                continue;
            }
            throw e;
        }
        transient = 0;
        if (poll.status === 200) {
            return tokensOf(poll.data);
        }
        const code = errorOf(poll.data);
        if (code === "authorization_pending") {
            continue;
        }
        if (code === "slow_down") {
            // RFC 8628 3.5: five seconds more; the growth stops at maxSlowDownSeconds, an issuer's own longer interval stays
            interval = interval >= DEVICE_POLL.maxSlowDownSeconds ? interval : Math.min(interval + DEVICE_POLL.slowDownSeconds, DEVICE_POLL.maxSlowDownSeconds);
            continue;
        }
        throw oauthError(poll.data, poll.status, "the sign-in did not finish");
    }
}

/**
 * pivotkit login: the device code flow, then the refresh token kept. The new token is kept first;
 * the old one goes only once the new one is recorded.
 * @param {Record<string, any>} values
 * @param {{ io: any }} ctx
 */
export async function loginCommand(values, ctx) {
    const env = ctx.io.env;
    const say = (text) => ctx.io.stderr.write(`${text}\n`);
    const want = values.store ?? "auto";
    const server = serverOf(values, env);
    const { resource, issuer, scopes: serverScopes, published } = await resourceOf(server, env);
    const client = clientIdOf(values, env, published);
    const clientId = client.id;
    if (client.published) {
        say(`Using the client ID ${printable(clientId)} that the server publishes, at ${printable(new URL(issuer).host)}.`);
    }
    const endpoints = await issuerOf(issuer, env, server.loopback);
    const scope = scopeOf(values.scope, serverScopes, endpoints.scopes);
    const started = await call(endpoints.device, { client_id: clientId, ...(scope ? { scope } : {}) }, env);
    if (started.status !== 200) {
        throw oauthError(started.data, started.status, "the device code was refused");
    }
    const d = started.data;
    if (typeof d.device_code !== "string" || !d.device_code || d.device_code.length > 4096 || typeof d.user_code !== "string" || !/^[\x21-\x7e]{1,64}$/.test(d.user_code)) {
        throw new RemoteError("BAD_ANSWER", "the issuer's device code answer is not usable");
    }
    const verify = checkedUrl(d.verification_uri ?? d.verification_url, "the issuer's verification_uri", server.loopback);
    const complete = typeof d.verification_uri_complete === "string" && URL.canParse(d.verification_uri_complete) ? checkedUrl(d.verification_uri_complete, "the issuer's verification_uri_complete", server.loopback) : null;
    const issuerHost = new URL(issuer).host;
    // RFC 8628 5.4: the person checks where they sign in before they enter the code
    say(`Sign in at ${printable(issuerHost)}, the sign-in provider of ${printable(server.base.host)}.`);
    if (!sameSite(verify.hostname, new URL(issuer).hostname)) {
        say(`warning: the code page is on ${printable(verify.host)}, not on ${printable(issuerHost)}. Enter the code only if this is your sign-in provider's page.`);
    }
    say(`Open ${printable(verify.href)} and enter the code ${printable(d.user_code)}`);
    if (complete) {
        say(`or open ${printable(complete.href)}`);
    }
    const expiresIn = Math.min(Number.isFinite(d.expires_in) && d.expires_in > 0 ? d.expires_in : 600, DEVICE_POLL.maxWaitSeconds);
    say(`Waiting for the sign-in (the code ends in ${Math.max(1, Math.round(expiresIn / 60))} min)...`);
    const tokens = await pollFor(endpoints, d, clientId, env, say);
    if (!tokens.refresh) {
        throw new RemoteError("NO_REFRESH_TOKEN", `the issuer gave no refresh token, so pivotkit token could not renew the sign-in; ask for one with --scope "${printable(`${scope} offline_access`.trim())}", or the operator allows refresh tokens for this client`);
    }
    const store = credentialStore(env);
    const old = (await store.list())[resource] ?? null;
    const kept = await store.put(resource, tokens.refresh, want);
    const login = { resource, issuer, clientId, scope, tokenEndpoint: endpoints.token.href, store: kept.store, ...(endpoints.revocation ? { revocationEndpoint: endpoints.revocation.href } : {}) };
    try {
        await store.record(login);
    } catch (e) {
        // no orphan: a token whose record could not be written goes again
        if (!old || old.store !== kept.store) {
            await store.drop(login).catch(() => undefined);
        }
        throw e;
    }
    if (old && old.store !== kept.store) {
        await store.drop(old).catch(() => undefined);
    }
    const where = kept.store === "keychain" ? kept.where : `${kept.where}, ${fileStoreText()}`;
    return {
        findings: [],
        note: `Signed in to ${printable(resource)}. The refresh token is in ${where}${kept.fellBack ? ` (no keychain: ${kept.why})` : ""}. Get an access token with: pivotkit token`,
        extra: { server: resource, issuer, store: kept.store }
    };
}

/** The login of --url, PIVOTKIT_URL, or the only one there is. */
async function loginOf(values, env, store) {
    const logins = await store.list();
    const named = values.url ?? env.PIVOTKIT_URL;
    if (named) {
        const server = serverOf(values, env);
        const key = Object.keys(logins).find((k) => k.replace(/\/$/, "") === server.base.href.replace(/\/$/, ""));
        if (!key) {
            throw signInAgain(new CliError("usage", "NOT_SIGNED_IN", `not signed in to ${printable(server.base.href.replace(/\/$/, ""))}; run pivotkit login --url ${printable(server.base.href.replace(/\/$/, ""))}`));
        }
        return logins[key];
    }
    const all = Object.values(logins);
    if (all.length === 1) {
        return all[0];
    }
    if (all.length) {
        throw new CliError("usage", "NO_URL", `signed in to ${all.length} servers: name one with --url or PIVOTKIT_URL`);
    }
    throw signInAgain(new CliError("usage", "NOT_SIGNED_IN", "not signed in; run pivotkit login --url https://host/api/v1"));
}

/** Whether a kept address may use plain http: only where the server itself is on loopback. */
const loopbackLogin = (login) => URL.canParse(login.resource) && isLoopback(new URL(login.resource).hostname);

/**
 * pivotkit token: a fresh access token on stdout, from the kept refresh token, under a lock so two
 * runs do not both spend one refresh token. A new refresh token from the issuer replaces the kept
 * one; where that store fails, it goes to the file, with a warning, and the access token is still
 * printed.
 * @param {Record<string, any>} values
 * @param {{ io: any }} ctx
 */
export async function tokenCommand(values, ctx) {
    const env = ctx.io.env;
    const store = credentialStore(env);
    const login = await loginOf(values, env, store);
    const again = `sign in again: pivotkit login --url ${printable(login.resource)}`;
    return store.locked(login.resource, async () => {
        // read inside the lock: a run before this one may have rotated it
        const refresh = await store.get(login);
        if (!refresh) {
            throw signInAgain(new RemoteError("NOT_SIGNED_IN", `the refresh token is gone from ${login.store === "keychain" ? "the keychain" : "its file"}; ${again}`));
        }
        const answer = await call(checkedUrl(login.tokenEndpoint, "the kept token endpoint", loopbackLogin(login)), { grant_type: "refresh_token", refresh_token: refresh, client_id: login.clientId, ...(login.scope ? { scope: login.scope } : {}) }, env);
        if (answer.status !== 200) {
            const error = oauthError(answer.data, answer.status, "the token could not be renewed");
            if (error.code === "INVALID_GRANT") {
                error.message = `${error.message}; ${again}`;
                signInAgain(error);
            }
            throw error;
        }
        const tokens = tokensOf(answer.data);
        const warnings = [];
        if (tokens.refresh && tokens.refresh !== refresh) {
            // the issuer rotated it: the old one may already be void, so the new one must be kept somewhere
            try {
                await store.put(login.resource, tokens.refresh, login.store);
            } catch {
                const kept = await store.put(login.resource, tokens.refresh, "file");
                await store.record({ ...login, store: "file" });
                // the keychain's entry holds the old, now void token: gone, so logout leaves nothing behind
                await store.drop({ ...login, store: "keychain" }).catch(() => undefined);
                warnings.push(`the keychain could not keep the new refresh token; it is in ${kept.where}, ${fileStoreText()}`);
            }
        }
        return { token: tokens.access, warnings, findings: [], extra: { server: login.resource } };
    });
}

/**
 * pivotkit logout: the refresh token revoked at the issuer where it offers that (RFC 7009), then the
 * kept sign-in removed (its refresh token and its record).
 * @param {Record<string, any>} values
 * @param {{ io: any }} ctx
 */
export async function logoutCommand(values, ctx) {
    const env = ctx.io.env;
    const store = credentialStore(env);
    const login = await loginOf(values, env, store);
    let revoked = false;
    if (login.revocationEndpoint) {
        const refresh = await store.get(login).catch(() => null);
        if (refresh) {
            const answer = await call(checkedUrl(login.revocationEndpoint, "the kept revocation endpoint", loopbackLogin(login)), { token: refresh, token_type_hint: "refresh_token", client_id: login.clientId }, env, { parse: false }).catch(() => null);
            revoked = answer !== null && answer.status >= 200 && answer.status < 300;
        }
    }
    await store.remove(login.resource);
    const issuerText = revoked ? "The issuer revoked the refresh token." : login.revocationEndpoint ? "The issuer could not be told; the refresh token works there until it expires." : "The issuer offers no revocation; its session may still be open, end it there.";
    return { findings: [], note: `Signed out of ${printable(login.resource)}. ${issuerText}`, extra: { server: login.resource, revoked } };
}

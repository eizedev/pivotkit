/*
 * The sign-in of a "signIn" link: the issuer's metadata and keys, loaded in the background, the
 * redirect to the issuer (code flow, PKCE, state and nonce in the signed cookie) and the callback,
 * which sends the file only to the person the link is for. Every request to the issuer goes
 * through issuer.js, under the rules of the server's issuers (issuer.js issuerRulesOf).
 */

import { createHash, randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { CodedError } from "pivotkit-core/internal";
import { DEFAULT_ALGORITHMS } from "../config.js";
import { subjectOf } from "../auth.js";
import { discover, ISSUER_LIMITS, issuerFetch, issuerHint, jwksUriOf, remoteKeySet } from "../issuer.js";
import { requestId, requestScope } from "../request-id.js";
import { createLimits } from "../limits.js";
import { readSecret } from "../secrets.js";
import { NONCE_SYNTAX, SIGN_IN_SECONDS, sameText, subjectDigest } from "./tokens.js";
import { placeMarker } from "./markers.js";
import { fileAnswer } from "./files.js";
import { ANSWERS, BASE_HEADERS } from "./pages.js";

/**
 * Sign-in callbacks per client address: a person signs in a few times a minute at most, and each
 * callback writes a marker of its state; over this an address waits (429), the others go on.
 */
export const SIGN_IN_CALLBACKS = Object.freeze({ perMinute: 20, burst: 20 });

/**
 * What the download links' sign-in issuer or its token endpoint gave that the sign-in cannot use: for
 * the operator's log (a warning while the issuer loads, a debug line when a sign-in fails). The person
 * gets SIGN_IN_NOT_READY or SIGN_IN_FAILED, never the message.
 * @extends {CodedError<undefined, undefined>}
 */
class SignInError extends CodedError {
    /** @param {string} message */
    constructor(message) {
        // no code: the log line is the message
        super(undefined, message);
        this.name = "SignInError";
    }
}

/**
 * The sign-in's token endpoint: output.downloads.signIn.tokenUrl, else the metadata's
 * token_endpoint, which must be on the issuer's origin (the client secret goes there), as for a
 * token exchange (sources/auth.js). Throws SignInError.
 * @param {any} metadata
 * @param {{ issuer: string, tokenUrl: string | null }} signIn
 */
function tokenUrlOf(metadata, signIn) {
    if (signIn.tokenUrl) {
        return signIn.tokenUrl;
    }
    const given = metadata?.token_endpoint;
    if (typeof given !== "string" || !URL.canParse(given)) {
        throw new SignInError("the issuer's metadata names no token_endpoint (set output.downloads.signIn.tokenUrl)");
    }
    if (new URL(given).origin !== new URL(signIn.issuer).origin) {
        throw new SignInError(`the issuer's token_endpoint is on another origin (${new URL(given).origin}); set output.downloads.signIn.tokenUrl to accept it`);
    }
    return given;
}

/**
 * The sign-in issuer: its metadata and keys, loaded in the background with retries (until then a
 * sign-in link answers 503).
 * @param {NonNullable<import("../options/downloads.js").DownloadSettings["signIn"]>} signIn
 * @param {import("../issuer.js").IssuerRules} rules
 * @param {import("../issuer.js").IssuerEntry | undefined} first  the server's first issuer, whose jwksUri the sign-in takes (signIn.issuer is that issuer)
 * @param {any} log
 */
export function signInIssuer(signIn, rules, first, log) {
    /** @type {{ metadata: any, tokenUrl: string, jwks: any } | null} */
    let loaded = null;
    let timer = null;
    let closed = false;
    let delay = 2000;
    const attempt = async () => {
        try {
            const metadata = await discover(signIn.issuer, rules);
            if (typeof metadata.authorization_endpoint !== "string") {
                throw new SignInError("the issuer's metadata names no authorization_endpoint");
            }
            loaded = { metadata, tokenUrl: tokenUrlOf(metadata, signIn), jwks: await remoteKeySet(jwksUriOf(metadata, signIn.issuer, first?.jwksUri, first?.jwksKey), rules, log) };
            log.info("download links: the sign-in issuer's metadata loaded", { issuer: signIn.issuer });
        } catch (e) {
            if (closed) {
                return;
            }
            log.warn(`download links: the sign-in issuer's metadata could not be loaded, trying again in ${delay / 1000} s: ${String(/** @type {any} */ (e)?.message ?? e).slice(0, 600)}`);
            timer = setTimeout(attempt, delay);
            timer.unref?.();
            delay = Math.min(delay * 2, 60_000);
        }
    };
    const started = attempt();
    return {
        started,
        loaded: () => loaded,
        close() {
            closed = true;
            if (timer) {
                clearTimeout(timer);
            }
        }
    };
}

/**
 * What the sign-in steps need: the download links' route (downloads.js) or the viewer page's (viewer.js).
 * @typedef {object} SignInRoute
 * @property {string} name  how the log names the route ("download links", "viewer page")
 * @property {any} context
 * @property {{ signIn: any }} settings  output.downloads' (options/downloads.js settingsOf): the sign-in client
 * @property {ReturnType<typeof import("./tokens.js").cookieJar>} jar  the route's own cookie
 * @property {(entry: Record<string, unknown>) => void} log  the route's log line
 * @property {(request: Request, code: any, headers?: Record<string, string>) => Response} answer  the route's page or problem of a code
 * @property {() => string | null} markersDir  where a used state is marked; null: in this process only
 * @property {ReturnType<typeof signInIssuer> | null} issuer  null until the route signs anyone in
 * @property {import("../issuer.js").IssuerRules} signInRules
 * @property {Record<string, string | undefined>} env
 * @property {boolean} loopback
 * @property {() => string} callbackUrl  where the issuer sends the person back
 */

/** @typedef {"SIGN_IN_NOT_READY" | "SIGN_IN_STALE" | "SIGN_IN_TOO_MANY" | "SIGN_IN_FAILED" | "SIGN_IN_DENIED"} SignInAnswer */

/**
 * Marks a sign-in's state used (placeMarker, as a one-time link): false when it was used already.
 * @param {string | null} dir  the markers' directory; null: `used`, this process's
 * @param {Map<string, number>} used  the states used in this process without a directory, with their expiry
 * @param {string} stateValue  NONCE_SYNTAX
 * @param {unknown} expiry  the cookie entry's `x` (seconds), when the state stops working anyway
 */
async function markStateUsed(dir, stateValue, expiry, used) {
    const until = Number.isSafeInteger(expiry) ? /** @type {number} */ (expiry) : Math.floor(Date.now() / 1000) + SIGN_IN_SECONDS;
    if (dir === null) {
        // no output directory: the states of this process (a replica of its own refuses the code at the issuer, which takes it once)
        const now = Math.floor(Date.now() / 1000);
        for (const [k, x] of used) {
            if (x <= now) used.delete(k);
        }
        if (used.has(stateValue)) {
            return false;
        }
        used.set(stateValue, until);
        return true;
    }
    try {
        await mkdir(dir, { recursive: true, mode: 0o700 });
        await placeMarker(join(dir, `${stateValue}.state`), until);
        return true;
    } catch (e) {
        if (/** @type {any} */ (e)?.code === "EEXIST") {
            return false;
        }
        throw e;
    }
}

/**
 * Exchanges the code for tokens at the issuer (issuer.js: its address rules, no redirect, a time
 * limit, a size cap): the ID token and the access token, where the answer has one. Throws
 * SignInError, or the request's error.
 * @param {SignInRoute} route
 * @param {{ metadata: any, tokenUrl: string }} loaded  the issuer's
 * @param {string} code
 * @param {string} verifier  PKCE's
 */
async function exchange(route, loaded, code, verifier) {
    const { context, settings, env, signInRules, callbackUrl } = route;
    const signIn = settings.signIn;
    const form = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: callbackUrl(), code_verifier: verifier, client_id: signIn.clientId });
    /** @type {Record<string, string>} */
    const headers = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
    if (signIn.clientSecret) {
        const secret = await readSecret(signIn.clientSecret, context.options, env);
        const methods = loaded.metadata.token_endpoint_auth_methods_supported;
        if (Array.isArray(methods) && !methods.includes("client_secret_basic") && methods.includes("client_secret_post")) {
            form.set("client_secret", secret);
        } else {
            headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(signIn.clientId)}:${encodeURIComponent(secret)}`).toString("base64")}`;
        }
    }
    let response;
    try {
        response = await issuerFetch(loaded.tokenUrl, signInRules, { method: "POST", headers, body: form.toString(), maxBytes: ISSUER_LIMITS.tokenBytes, timeMs: ISSUER_LIMITS.tokenMs });
    } catch (e) {
        // the operator's part of a refused request (an address, a redirect) as a warning; the person gets SIGN_IN_FAILED
        context.log.warn(`${route.name}: the issuer's token endpoint could not be reached: ${/** @type {any} */ (e)?.code ?? "error"}, ${String(/** @type {any} */ (e)?.message ?? e).slice(0, 200)}${issuerHint(e, signInRules)}`);
        throw e;
    }
    if (response.status < 200 || response.status > 299) {
        throw new SignInError(`the token endpoint answered ${response.status}`);
    }
    let doc;
    try {
        doc = JSON.parse(new TextDecoder().decode(response.body));
    } catch {
        // JSON.parse's message quotes the start of the answer, which may hold a token: never logged
        throw new SignInError("the token endpoint's answer is no JSON");
    }
    if (typeof doc?.id_token !== "string") {
        throw new SignInError("the token endpoint's answer has no id_token");
    }
    // the access token only for the viewer page (viewer.js), which reads the person's rights from it
    return { idToken: doc.id_token, accessToken: typeof doc.access_token === "string" ? doc.access_token : null };
}

/**
 * The claims of the person who signed in, or why they cannot be used: the code exchanged, the ID
 * token verified with the issuer's keys, its nonce the cookie's, its azp this client where it must be;
 * with the access token of the same answer, where it has one.
 * @param {SignInRoute} route
 * @param {{ metadata: any, tokenUrl: string, jwks: any }} loaded
 * @param {string} code
 * @param {{ v: string, nn: string }} entry  the cookie's entry of this sign-in: PKCE's verifier, the nonce
 * @returns {Promise<{ claims: Record<string, any>, accessToken: string | null } | { reason: "token" | "nonce" | "azp" }>}
 */
async function idTokenClaims(route, loaded, code, entry) {
    const { context, settings } = route;
    const options = context.options;
    let claims;
    let accessToken;
    try {
        const tokens = await exchange(route, loaded, code, entry.v);
        const idToken = tokens.idToken;
        accessToken = tokens.accessToken;
        const { jwtVerify } = await import("jose");
        ({ payload: claims } = await jwtVerify(idToken, loaded.jwks, { issuer: settings.signIn.issuer, audience: settings.signIn.clientId, algorithms: options.auth?.algorithms?.length ? options.auth.algorithms : [...DEFAULT_ALGORITHMS], clockTolerance: options.auth?.clockTolerance ?? 30, requiredClaims: ["exp", "nonce"] }));
    } catch (e) {
        context.log.debug(`${route.name}: the sign-in failed`, { reason: String(/** @type {any} */ (e)?.code ?? /** @type {any} */ (e)?.message ?? "invalid").slice(0, 120) });
        return { reason: "token" };
    }
    if (typeof claims.nonce !== "string" || !sameText(claims.nonce, entry.nn)) {
        return { reason: "nonce" };
    }
    // OpenID Connect Core 3.1.3.7: a token for several audiences names this client as its azp
    const severalAudiences = Array.isArray(claims.aud) && claims.aud.length > 1;
    if ((severalAudiences || claims.azp !== undefined) && claims.azp !== settings.signIn.clientId) {
        return { reason: "azp" };
    }
    return { claims, accessToken };
}

/** A copy of an answer with the cookie's Set-Cookie header in place of any it had. */
function withCookie(response, cookie) {
    const headers = new Headers(response.headers);
    headers.set("set-cookie", cookie);
    return new Response(response.body, { status: response.status, headers });
}

/**
 * The steps every sign-in of a route takes: the redirect to the issuer and the callback's state.
 * A route keeps its own cookie, so a state started by one route never completes at another.
 * @param {SignInRoute} route
 * @param {(entry: Record<string, unknown>) => boolean} isEntry  whether a cookie entry is a sign-in of this route
 */
export function createSignInSteps(route, isEntry) {
    const { context, settings, jar, log, answer, markersDir, issuer } = route;
    // the sign-in callbacks per address (SIGN_IN_CALLBACKS)
    const callbacks = createLimits({ rateLimit: SIGN_IN_CALLBACKS });
    /** @type {Map<string, number>} */
    const used = new Map();

    /**
     * The redirect to the issuer: code flow with PKCE, state and nonce kept in the cookie with `data`.
     * @param {Request} request
     * @param {Record<string, unknown>} data  what the callback needs of the sign-in (a link's token, the viewer's address)
     */
    async function start(request, data) {
        const loaded = issuer?.loaded();
        if (!loaded || !settings.signIn) {
            log({ bound: "signIn", ok: false, code: "SIGN_IN_NOT_READY" });
            return answer(request, "SIGN_IN_NOT_READY", { "retry-after": "5" });
        }
        const stateValue = randomBytes(16).toString("base64url");
        const nonce = randomBytes(16).toString("base64url");
        const verifier = randomBytes(32).toString("base64url");
        const challenge = createHash("sha256").update(verifier).digest("base64url");
        const map = await jar.read(request);
        const cookie = await jar.write({ ...map, [`s:${stateValue}`]: { ...data, x: Math.floor(Date.now() / 1000) + SIGN_IN_SECONDS, v: verifier, nn: nonce } });
        const target = new URL(loaded.metadata.authorization_endpoint);
        for (const [k, v] of Object.entries({ response_type: "code", client_id: settings.signIn.clientId, redirect_uri: route.callbackUrl(), scope: settings.signIn.scopes.join(" "), state: stateValue, nonce, code_challenge: challenge, code_challenge_method: "S256" })) {
            target.searchParams.set(k, v);
        }
        return new Response(null, { status: 302, headers: { ...BASE_HEADERS, location: target.href, "set-cookie": cookie } });
    }

    /**
     * The sign-in of a callback's state: its cookie entry, taken out of the cookie and marked used on
     * the server, or the answer for a stale or replayed one, or one over the address's limit.
     * @param {Request} request
     * @param {string} stateValue
     * @returns {Promise<{ entry: Record<string, any> & { v: string, nn: string, x?: number }, cookie: string } | { response: Response }>}
     */
    async function takeState(request, stateValue) {
        const map = await jar.read(request);
        const key = `s:${stateValue}`;
        const entry = NONCE_SYNTAX.test(stateValue) && Object.hasOwn(map, key) ? map[key] : null;
        // the state is used once, whatever the answer
        const rest = { ...map };
        delete rest[key];
        const cookie = await jar.write(rest);
        if (!entry || typeof entry.v !== "string" || typeof entry.nn !== "string" || !isEntry(entry)) {
            // no sign-in of this browser under way (a missing or foreign cookie, a used state): anyone can send that, so the debug log only
            // (a tab left open, a reload, another browser): the page says to open the link again, here
            context.log.debug(`${route.name}: a sign-in callback without its cookie`, { via: "link", bound: "signIn", code: "SIGN_IN_FAILED", requestId: requestId() });
            return { response: answer(request, "SIGN_IN_STALE", { "set-cookie": cookie }) };
        }
        // the state is used once on the server too, not only because the browser drops it from its
        // cookie: a callback replayed with the cookie from before it is refused (a marker beside the
        // one-time links', written only for a state of this server's signed cookie, swept at its expiry)
        // each such callback writes a marker: bounded per address (SIGN_IN_CALLBACKS), so one address
        // cannot fill the output directory with them; a callback without its cookie writes none
        const wait = callbacks.take(`address:${requestScope()?.address ?? ""}`);
        if (wait) {
            log({ bound: "signIn", ok: false, code: ANSWERS.SIGN_IN_TOO_MANY.code, answer: "SIGN_IN_TOO_MANY" });
            return { response: answer(request, "SIGN_IN_TOO_MANY", { "set-cookie": cookie, "retry-after": String(wait) }) };
        }
        if (!(await markStateUsed(markersDir(), stateValue, entry.x, used))) {
            context.log.debug(`${route.name}: a sign-in callback with a used state`, { via: "link", bound: "signIn", code: "SIGN_IN_FAILED", requestId: requestId() });
            return { response: answer(request, "SIGN_IN_STALE", { "set-cookie": cookie }) };
        }
        return { entry, cookie };
    }

    /**
     * The callback's state taken, the provider's error and the code read: what the route completes
     * the sign-in with, or the answer to send. `fail` logs a failure and answers it with the cleared cookie.
     * @param {Request} request
     * @returns {Promise<{ entry: Record<string, any> & { v: string, nn: string }, cookie: string, code: string, fail: (code: SignInAnswer | "LINK_NOT_YOURS", extra?: Record<string, unknown>) => Response } | { response: Response }>}
     */
    async function callbackOf(request) {
        const url = new URL(request.url);
        const taken = await takeState(request, url.searchParams.get("state") ?? "");
        if ("response" in taken) {
            return taken;
        }
        const { entry, cookie } = taken;
        /** @param {SignInAnswer | "LINK_NOT_YOURS"} code  LINK_NOT_YOURS: a download's own */
        const fail = (code, extra = {}) => {
            log({ bound: "signIn", ok: false, code: /** @type {{ code?: string }} */ (ANSWERS[code]).code ?? code, answer: code, ...extra });
            return answer(request, code, { "set-cookie": cookie });
        };
        if (url.searchParams.has("error")) {
            // read only after this browser's own sign-in matched; the provider's words are never shown
            return { response: fail("SIGN_IN_DENIED", { reason: "issuer" }) };
        }
        const code = url.searchParams.get("code");
        if (!code || code.length > 2048) {
            return { response: fail("SIGN_IN_FAILED") };
        }
        return { entry, cookie, code, fail };
    }

    /**
     * The person who signed in with a callback's code, or why not (idTokenClaims).
     * @param {string} code
     * @param {{ v: string, nn: string }} entry
     */
    async function claimsOf(code, entry) {
        const loaded = issuer?.loaded();
        if (!loaded || !settings.signIn) {
            return { reason: /** @type {const} */ ("notReady") };
        }
        return idTokenClaims(route, loaded, code, entry);
    }

    return { start, callbackOf, claimsOf, close: () => callbacks.close() };
}

/**
 * The sign-in flow of a context's links.
 * @param {SignInRoute & import("./links.js").LinkRoute} route
 * @param {ReturnType<typeof import("./links.js").createLinkAnswers>} links
 */
export function createSignInFlow(route, links) {
    const { context, log, env, loopback } = route;
    const { tokenOf, reportOf } = links;
    const subjectClaim = context.options.auth?.subjectClaim ?? "sub";
    // a download's sign-in holds the link's token
    const steps = createSignInSteps(route, (entry) => typeof entry.t === "string");

    /** The callback of the sign-in: the file only for the person the token is for. */
    async function callback(request) {
        const taken = await steps.callbackOf(request);
        if ("response" in taken) {
            return taken.response;
        }
        const { entry, cookie, code, fail } = taken;
        const got = await tokenOf(request, entry.t);
        if (got.response) {
            return withCookie(got.response, cookie);
        }
        const { payload, keys: k } = got;
        if (payload.b !== "signIn") {
            return fail("SIGN_IN_FAILED");
        }
        const verified = await steps.claimsOf(code, entry);
        if ("reason" in verified) {
            return verified.reason === "notReady" ? fail("SIGN_IN_NOT_READY") : fail("SIGN_IN_FAILED", { reason: verified.reason });
        }
        const { claims } = verified;
        const subject = subjectOf(claims[subjectClaim]);
        // the person who signed in, as the operator's audit setting names people on the log (the
        // shared authentication's key, so a link's line and a call's line name a person alike)
        const core = subject ? await context.auth?.({ env, loopback }).catch(() => null) : null;
        const named = core?.auditName?.(claims.iss, subject);
        const who = named ? { subject: named } : {};
        if (!subject || typeof claims.iss !== "string" || !sameText(subjectDigest(k, payload.n, claims.iss, subject), /** @type {string} */ (payload.s))) {
            return fail("LINK_NOT_YOURS", who);
        }
        const found = await reportOf(request, payload);
        if (found.response) {
            return withCookie(found.response, cookie);
        }
        log({ bound: "signIn", ok: true, ...who });
        return fileAnswer(found.report, "GET", { headers: { "set-cookie": cookie } });
    }

    return { start: (request, token) => steps.start(request, { t: token }), callback, close: steps.close };
}

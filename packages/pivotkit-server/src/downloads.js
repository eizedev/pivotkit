/*
 * The server's own download links: a report that gets a link (delivery.js decides which) is served
 * under http.publicUrl + /downloads/<token> until the link expires. One state per context (the key,
 * the sign-in issuer), shared by every front end that mounts the route (serve.js, pivotkit-mcp's
 * http.js), so a link minted by one is opened by the other.
 *
 * - A link is a signed token of its nonce, expiry, binding and person (downloads/tokens.js).
 * - "none": GET and HEAD send the file. "once": GET and HEAD answer a page with a button; its POST
 *   sends the file once (an exclusive marker in the output directory, so replicas on a shared
 *   directory agree); the same browser may repeat it for two minutes. "signIn": GET signs the person
 *   in at the issuer (code flow, PKCE, state, nonce) and the callback sends the file only to the
 *   person whose subject the token holds. The issuer's metadata, keys and token endpoint are
 *   requested through issuer.js, under the rules of auth.issuer (signIn.issuer is auth.issuer).
 * - Nothing here logs a token, a code, a state, a cookie or a path.
 *
 * This file mounts the route and gives delivery.js its links. downloads/ holds the parts: tokens.js
 * (keys, tokens, the cookie), markers.js, files.js, pages.js, links.js and sign-in.js.
 */

import { join } from "node:path";
import { publicOriginOf } from "./config.js";
import { insecurePublicHost, insecureUrlText, settingsOf } from "./options/downloads.js";
import { issuerRulesOf } from "./issuer.js";
import { allowedHosts, hostRefusal, hostRefusedLine } from "./checks.js";
import { isLoopback } from "./listen.js";
import { outputDir } from "./output.js";
import { newRequestId, requestId } from "./request-id.js";
import { createRouteHandler } from "./route-handler.js";
import { brandingOfContext } from "./branding.js";
import { TOKEN_SYNTAX, cookieJar, keySource, mac, signToken, subjectDigest } from "./downloads/tokens.js";
import { MARKER_SWEEP_MS, sweepMarkers } from "./downloads/markers.js";
import { ANSWERS, BASE_HEADERS, answerOf, pageOf } from "./downloads/pages.js";
import { createLinkAnswers } from "./downloads/links.js";
import { createSignInFlow, signInIssuer } from "./downloads/sign-in.js";

/** Where the route lives. */
export const DOWNLOADS_PATH = "/downloads";

/** Where the sign-in returns. */
export const CALLBACK_PATH = `${DOWNLOADS_PATH}/callback`;

/** The largest body a download request may carry (the one-time link's form sends none). */
export const DOWNLOAD_BODY_BYTES = 1024;

/** The route family's refused lines: a link nobody has (404) is logged at info, since a person asks the operator about it. */
const DOWNLOAD_FAMILY = Object.freeze({ path: DOWNLOADS_PATH, notFound: /** @type {const} */ ("info") });

/**
 * Whether any report can get a link: an open source (registry.js closedReason), or a binding for closed ones.
 * @param {{ bind: string }} settings
 * @param {Array<{ closed?: boolean }>} sources  registry.check()'s
 */
export const linkingFor = (settings, sources) => sources.some((s) => s.closed === false) || settings.bind !== "none";

/** The state of each context's links. */
const states = new WeakMap();

/**
 * The links of a context, for delivery.js: null where no link can be given (no route mounted, the
 * links off, no address to put in them yet); otherwise how closed sources are bound and `signer()`,
 * which reads the key and gives a function that mints a link for a stored file's nonce (null, with a
 * warning on the log, when the key cannot be read: then the report gets no link, decided before the
 * file is written).
 * @param {any} context
 * @returns {{ bind: "signIn" | "once" | "none", expiresMinutes: number, signer(): Promise<((how: { n: string, bound: "none" | "once" | "signIn", subject?: string | null, issuer?: string | null }) => { url: string, expiresAt: string } | null) | null> } | null}
 */
export function linksOf(context) {
    const state = states.get(context);
    if (!state || !state.settings.enabled || !state.base || !outputDir(context)) {
        return null;
    }
    return {
        bind: state.settings.bind,
        expiresMinutes: state.settings.expiresMinutes,
        async signer() {
            const keys = await state.keys().catch((e) => {
                context.log.warn(`download links: the key cannot be read, so the report gets no link: ${String(e?.message ?? e).slice(0, 200)}`);
                return null;
            });
            if (!keys) {
                return null;
            }
            return ({ n, bound, subject, issuer }) => {
                if (bound === "signIn" && (!subject || !issuer)) {
                    return null;
                }
                const e = Math.floor(Date.now() / 1000) + state.settings.expiresMinutes * 60;
                const token = signToken(keys, { n, e, b: bound, ...(bound === "signIn" ? { s: subjectDigest(keys, n, /** @type {string} */ (issuer), /** @type {string} */ (subject)) } : {}) });
                return { url: `${state.base}${DOWNLOADS_PATH}/${token}`, expiresAt: new Date(e * 1000).toISOString().replace(/\.\d{3}Z$/, "Z") };
            };
        }
    };
}

/**
 * The subject binding of a caller for an upload target that scopes a report to the person: an HMAC
 * of [issuer, subject] under a subkey of output.downloads.key of its own ("upload binding"), so it is
 * the same for one person across reports and never a value a link's token holds; null without the
 * route's state (no HTTP) or a readable key.
 * @param {any} context
 * @param {string} issuer
 * @param {string} subject
 * @returns {Promise<string | null>}
 */
export async function subjectBindingOf(context, issuer, subject) {
    const keys = await states.get(context)?.keys().catch(() => null);
    return keys ? mac(keys.upload, JSON.stringify([issuer, subject])) : null;
}

/**
 * What the operator should know when the links are on: a random key (links die on restart), a key
 * that cannot be read, an http:// public address, or no address to put in links.
 * @param {any} context
 * @param {any} settings  output.downloads' (options/downloads.js settingsOf)
 * @param {() => Promise<any>} keys
 * @param {boolean} loopback  the server listens on loopback only
 */
function warnAtStart(context, settings, keys, loopback) {
    const options = context.options;
    const publicOrigin = publicOriginOf(options);
    // said where some report can get a link (as check-config's): one over an open source, or a binding for closed ones
    void Promise.resolve(context.registry.check?.() ?? [])
        .then((sources) => linkingFor(settings, sources))
        .then(async (linking) => {
            if (!linking) {
                return;
            }
            if (!settings.key) {
                context.log.warn("download links use a random key: links stop working on restart and on other replicas; set output.downloads.key");
                return;
            }
            await keys().catch((e) => context.log.warn(`download links: the key cannot be read, so reports get no links until it can: ${String(e?.message ?? e).slice(0, 200)}`));
        })
        .catch(() => undefined);
    const insecure = insecurePublicHost(options);
    if (insecure) {
        context.log.warn(insecureUrlText(insecure));
    }
    if (!publicOrigin && !loopback) {
        context.log.warn("download links: http.publicUrl is not set and the server listens on an address other than loopback, so reports get no links (they would show an internal address); set http.publicUrl");
    }
}

/**
 * Builds the route of a context's links (once per context: a second call returns the first handler,
 * so the REST service and the MCP endpoint on one port share it).
 * @param {any} context
 * @param {{ env?: Record<string, string | undefined>, loopback?: boolean, sweepEveryMs?: number }} [runtime]  sweepEveryMs: how often expired one-time markers are swept (tests)
 * @returns {{ handles(path: string): boolean, precheck(request: Request, info?: Record<string | symbol, any>): Promise<Response | null>, fetch(request: Request, info?: Record<string | symbol, any>): Promise<Response>, problem(status: 400 | 413, path: string, info?: Record<string | symbol, any>): Response, listening(url: string): void, close(): void }}
 */
export function createDownloadHandler(context, runtime = {}) {
    const existing = states.get(context);
    if (existing) {
        return existing.handler;
    }
    const options = context.options;
    // the pages and problems in the operator's name and documentation (branding.js)
    const brand = brandingOfContext(context);
    /** @type {(heading: string, body: string, how?: { status?: number, form?: boolean, headers?: Record<string, string> }) => Response} */
    const page = (heading, body, how) => pageOf(brand, heading, body, how);
    /** @type {(request: Request, code: keyof typeof ANSWERS, headers?: Record<string, string>) => Response} */
    const answer = (request, code, headers) => answerOf(brand, request, code, headers);
    const settings = settingsOf(options);
    const env = runtime.env ?? process.env;
    const loopback = runtime.loopback ?? isLoopback(options.http?.host ?? "127.0.0.1");
    const publicOrigin = publicOriginOf(options);
    const hosts = allowedHosts(options);
    const keys = keySource(settings, options, env);
    const active = settings.enabled;
    const issuerRules = issuerRulesOf(options);
    // the operator's tokenUrl is an origin the operator wrote, like auth.issuer's
    const signInRules = settings.signIn?.tokenUrl ? Object.freeze({ ...issuerRules, origins: [...issuerRules.origins, new URL(settings.signIn.tokenUrl).origin] }) : issuerRules;
    const issuer = active && settings.bind === "signIn" && settings.signIn ? signInIssuer(settings.signIn, issuerRules, options.auth?.jwksUri, context.log) : null;
    /** @type {any} */
    const state = { settings, keys, base: publicOrigin, handler: null };
    const secure = () => (state.base ?? "").startsWith("https:");
    const jar = cookieJar(keys, secure());
    /** When the markers of used one-time links were last swept. */
    let swept = 0;

    if (active) {
        warnAtStart(context, settings, keys, loopback);
    }

    const markersDir = () => join(/** @type {string} */ (outputDir(context)), ".pivotkit-downloads");

    /** Deletes the markers of expired one-time links (sweepMarkers), at most every MARKER_SWEEP_MS. */
    async function sweep() {
        if (Date.now() - swept < MARKER_SWEEP_MS) {
            return;
        }
        swept = Date.now();
        await sweepMarkers(markersDir());
    }
    // and on a timer, so markers go also when no one-time link is opened any more (not the throttled
    // sweep(): a tick must not be skipped for a POST's sweep just before it)
    const sweeping = active && outputDir(context)
        ? setInterval(() => {
              swept = Date.now();
              void sweepMarkers(markersDir()).catch(() => undefined);
          }, runtime.sweepEveryMs ?? MARKER_SWEEP_MS)
        : null;
    sweeping?.unref?.();

    /** Logs a download request: never its token, path, code, state or cookie; its status is the answer's (the line's level follows it). */
    // the status is the answer's: by `answer`, the key in ANSWERS where it differs from the code logged
    // (SIGN_IN_TOO_MANY logs RATE_LIMITED), else by the code
    const log = ({ answer: key, ...entry }) => context.log.download({ via: "link", requestId: requestId() ?? newRequestId(), ...entry, status: entry.ok ? 200 : (ANSWERS[/** @type {keyof typeof ANSWERS} */ (key ?? entry.code)]?.status ?? 500) });

    /** @type {import("./downloads/sign-in.js").SignInRoute} */
    const linkRoute = { context, settings, state, keys, jar, log, answer, page, markersDir, sweep, issuer, signInRules, env, loopback, callbackUrl: () => `${state.base}${CALLBACK_PATH}` };
    // the link answers start a sign-in; the sign-in answers through the links' token and report checks
    const links = createLinkAnswers(linkRoute, (request, token) => signIn.start(request, token));
    const signIn = createSignInFlow(linkRoute, links);

    /** A request of the route after its precheck, inside its request's scope. */
    async function route(request, path) {
        try {
            if (!active || !state.base) {
                return answer(request, "NOT_FOUND");
            }
            if (path === CALLBACK_PATH) {
                return request.method === "GET" ? await signIn.callback(request) : answer(request, "METHOD_NOT_ALLOWED", { allow: "GET" });
            }
            const token = path.slice(DOWNLOADS_PATH.length + 1);
            if (!TOKEN_SYNTAX.test(token)) {
                context.log.debug("download links: no such link", { via: "link", code: "NOT_FOUND", requestId: requestId() });
                return answer(request, "NOT_FOUND");
            }
            return await links.link(request, token);
        } catch (e) {
            context.log.error(e, { where: "downloads", requestId: requestId() });
            return answer(request, "INTERNAL");
        }
    }

    /**
     * The checks before the body is read: Host, and a body of at most DOWNLOAD_BODY_BYTES.
     * @param {Request} request
     */
    async function check(request) {
        const refused = hostRefusal(request, hosts);
        if (refused) {
            context.log.refused(hostRefusedLine(request, refused, { path: DOWNLOADS_PATH }));
            return answer(request, "FORBIDDEN_HOST");
        }
        if (Number(request.headers.get("content-length") ?? 0) > DOWNLOAD_BODY_BYTES) {
            context.log.refused({ status: 413, path: DOWNLOADS_PATH, reason: "body_too_large", limit: DOWNLOAD_BODY_BYTES, size: Number(request.headers.get("content-length")) });
            return answer(request, "BODY_TOO_LARGE");
        }
        return null;
    }

    const handler = {
        /** Whether a path is the route's (anything under /downloads; what is not a link answers 404). */
        handles: (path) => path === DOWNLOADS_PATH || path.startsWith(`${DOWNLOADS_PATH}/`),

        // the request's scope, the refused line of an unlogged error, the id on every answer
        // (route-handler.js); a host passes its `info`, so the route names the host's request id
        ...createRouteHandler(context, {
            check,
            // the precheck again: a host that serves the route without one still checks Host and size
            answer: async (request) => (await check(request)) ?? route(request, new URL(request.url).pathname),
            // a link nobody has (404) is logged at info, since a person asks the operator about it
            familyOf: () => DOWNLOAD_FAMILY,
            // a body that cannot be read gets a short problem: its code and the request id, no page
            unreadable: {
                path: DOWNLOADS_PATH,
                limitOf: () => DOWNLOAD_BODY_BYTES,
                answer: (status, _limit, id) => new Response(JSON.stringify({ code: status === 413 ? "BODY_TOO_LARGE" : "INVALID_INPUT", requestId: id }), { status, headers: { ...BASE_HEADERS, "content-type": "application/problem+json", connection: "close" } })
            }
        }),

        /**
         * The address the server listens on, once it does: the links' base on loopback without
         * http.publicUrl (never off loopback: it would be an internal address).
         * @param {string} url
         */
        listening(url) {
            if (!publicOrigin && loopback) {
                state.base = new URL(url).origin;
            }
        },

        close() {
            issuer?.close();
            signIn.close();
            if (sweeping) {
                clearInterval(sweeping);
            }
        }
    };
    state.handler = handler;
    states.set(context, state);
    return handler;
}

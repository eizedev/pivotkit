/*
 * The viewer page (record 0021): the server's own page for a live link, at
 * http.publicUrl + /live/<source>?<params>&pk-access=…#pivot=<view>. Off unless rest.browser.viewer.
 *
 * 1. GET /live/<source> answers the page without starting anything: a link preview or a HEAD signs
 *    nobody in. Its script keeps the view (the fragment, which never reaches the server) in the
 *    tab's sessionStorage and goes to /live/_/sign-in?to=<the link's path and query>.
 * 2. The sign-in is the download links' (downloads/sign-in.js): the same client
 *    (output.downloads.signIn), the code flow with PKCE, state and nonce in a short cookie of this
 *    route's own, cleared with the answer. No session outlives it.
 * 3. The callback checks the ID token as a download's does, then reads the person's rights from the
 *    access token of the same answer, as the REST service reads a bearer's (audience, scopes,
 *    groups), for the same issuer and subject. With them it asks the exchange route's own steps
 *    (browser.js) for a browser token of the link's source, parameters and access level.
 * 4. The answer is the page with the report: the token is in its data block, never in an address,
 *    a cookie or the log. The script takes it into memory, puts the link's address and view back in
 *    the address bar, and gives it to the report as its getToken(). When it expires, the page signs
 *    in again (step 1). The person's access token never reaches the browser.
 *
 * /live/_/ holds the page's script and style and the built pivot-report element (viewer/assets.js).
 */

import { SOURCE_ID } from "pivotkit-node/rest";
import { OperationError } from "pivotkit-report/operations";
import { publicOriginOf } from "./config.js";
import { subjectOf } from "./auth.js";
import { allowedHosts, hostRefusal, hostRefusedLine } from "./checks.js";
import { brandingOfContext } from "./branding.js";
import { issuerRulesOf, issuersOf } from "./issuer.js";
import { isLoopback } from "./listen.js";
import { browserSettingsOf } from "./options/browser.js";
import { settingsOf } from "./options/downloads.js";
import { outputDir } from "./output.js";
import { newRequestId, requestId } from "./request-id.js";
import { createRouteHandler } from "./route-handler.js";
import { problemsFor } from "./rest/problem.js";
import { linkParamsOf } from "./link-params.js";
import { ACCESS_PARAM } from "./link-access.js";
import { cookieJar, keySource } from "./downloads/tokens.js";
import { join } from "node:path";
import { createSignInSteps, signInIssuer } from "./downloads/sign-in.js";
import { OWN_PATH, STATUSES, TEXTS, VIEWER_PATH, answerPage, languageOf, viewerPage } from "./viewer/pages.js";
import { viewerAssets } from "./viewer/assets.js";

export { VIEWER_PATH } from "./viewer/pages.js";

/** Where the sign-in starts and returns. */
export const SIGN_IN_PATH = `${OWN_PATH}/sign-in`;
export const VIEWER_CALLBACK_PATH = `${OWN_PATH}/callback`;

/** The largest body a request of the page may carry: it sends none. */
const VIEWER_BODY_BYTES = 1024;

/** The longest link the sign-in takes back (its path and query). */
const LINK_CHARS = 4096;

/** A link's path and query as the sign-in takes it back: a page of this route, never another address. */
const LINK_SYNTAX = /^\/live\/([A-Za-z0-9][A-Za-z0-9_.-]{0,63})(\?[^#\s]*)?$/;

/** The route family of the page's refused lines. */
const VIEWER_FAMILY = Object.freeze({ path: VIEWER_PATH });

/**
 * The source, parameters and access level a link's path and query ask for, as the components read
 * them (pivotkit-react's server.js): the source's linkParams only, the first value of each.
 * @param {any} options
 * @param {string} to  LINK_SYNTAX's
 */
function linkInputOf(options, to) {
    const [, source, search = ""] = /** @type {RegExpExecArray} */ (LINK_SYNTAX.exec(to));
    const query = new URLSearchParams(search);
    const declared = Object.hasOwn(options.sources ?? {}, source) ? options.sources[source] : null;
    const names = declared ? (linkParamsOf(declared) ?? []) : [];
    /** @type {Record<string, string>} */
    const params = {};
    for (const name of names) {
        const value = query.get(name);
        if (value !== null) {
            Object.defineProperty(params, name, { value, enumerable: true, writable: true, configurable: true });
        }
    }
    const access = query.get(ACCESS_PARAM);
    return { source, params, names, title: declared?.title ?? source, ...(access !== null ? { access } : {}) };
}

/**
 * The viewer page of a context.
 * @param {any} context
 * @param {{ verifyToken(token: string): Promise<{ caller: any } | { refused: Response, reason: string }>, exchange(input: Record<string, any>, caller: any, how: { entry: Record<string, unknown> }): Promise<Response> }} rest  the REST service's sign-in and exchange route (rest/handler.js)
 * @param {{ env?: Record<string, string | undefined>, loopback?: boolean, files?: Parameters<typeof viewerAssets>[0] }} [runtime]  files: other directories of the page's files (tests)
 */
export async function createViewerHandler(context, rest, runtime = {}) {
    const options = context.options;
    const brand = brandingOfContext(context);
    const { problemOf } = problemsFor(brand.docs);
    const enabled = browserSettingsOf(options).viewer;
    const downloads = settingsOf(options);
    const env = runtime.env ?? process.env;
    const loopback = runtime.loopback ?? isLoopback(options.http?.host ?? "127.0.0.1");
    const hosts = allowedHosts(options);
    const subjectClaim = options.auth?.subjectClaim ?? "sub";
    const assets = enabled ? await viewerAssets(runtime.files) : null;
    const state = { base: publicOriginOf(options) };
    const issuerRules = issuerRulesOf(options);
    const signInRules = downloads.signIn?.tokenUrl ? Object.freeze({ ...issuerRules, origins: [...issuerRules.origins, new URL(downloads.signIn.tokenUrl).origin] }) : issuerRules;
    const issuer = enabled && downloads.signIn ? signInIssuer(downloads.signIn, issuerRules, issuersOf(options)[0], context.log) : null;
    const keys = keySource(downloads, options, env);
    const secure = () => (state.base ?? "").startsWith("https:");
    const jar = cookieJar(keys, secure(), "live");

    if (enabled && assets && !assets.ready) {
        context.log.warn("viewer page: pivotkit-element is not installed next to pivotkit-server (or not built), so /live/ answers 503; install pivotkit-element");
    }
    if (enabled && !state.base && !loopback) {
        context.log.warn("viewer page: http.publicUrl is not set and the server listens on an address other than loopback, so /live/ answers 404; set http.publicUrl");
    }

    /** A sign-in's log line: never the token, a code, a state or a cookie; its id where one was made. */
    /** @param {Record<string, any>} line  answer: the page's code, whose status the line takes */
    const log = ({ answer: shown, ...entry }) => context.log.viewer({ via: "viewer", requestId: requestId() ?? newRequestId(), ...entry, status: entry.ok ? 200 : (STATUSES[/** @type {keyof typeof STATUSES} */ (shown)] ?? entry.status ?? 400) });

    /** @type {import("./downloads/sign-in.js").SignInRoute} */
    const route = {
        name: "viewer page",
        context,
        settings: downloads,
        jar,
        log,
        answer: (request, code, headers) => answerPage(brand, request, code, headers),
        markersDir: () => (outputDir(context) ? join(/** @type {string} */ (outputDir(context)), ".pivotkit-downloads") : null),
        issuer,
        signInRules,
        env,
        loopback,
        callbackUrl: () => `${state.base}${VIEWER_CALLBACK_PATH}`
    };
    // a sign-in of this page holds the link it came from
    const steps = createSignInSteps(route, (entry) => entry.k === "live" && typeof entry.to === "string" && LINK_SYNTAX.test(entry.to));

    /** The page of a link before the sign-in: nothing of the source in it yet, since nobody signed in. */
    function startPage(request) {
        const lang = languageOf(request);
        return viewerPage(brand, lang, { ...TEXTS[lang].signingIn, data: { step: "start" }, head: request.method === "HEAD" });
    }

    /**
     * The browser token of a person who signed in, as the exchange route answers it: the token, or a
     * problem the report shows as its state (the link not shared with this account, no access).
     * @param {Record<string, any>} input
     * @param {any} caller
     * @param {Record<string, unknown>} entry  the log line's
     */
    async function tokenFor(input, caller, entry) {
        let answer;
        try {
            answer = await rest.exchange({ source: input.source, params: input.params, ...(input.access !== undefined ? { access: input.access } : {}) }, caller, { entry });
        } catch (e) {
            if (!(e instanceof OperationError)) {
                throw e;
            }
            answer = problemOf(e);
        }
        const body = await answer.json();
        return answer.ok ? { token: { token: body.token, expiresAt: body.expiresAt } } : { problem: { ...body, requestId: requestId() ?? newRequestId() }, status: answer.status, code: body.code };
    }

    /** The callback: the person signed in, their rights read, a browser token made, the report's page. */
    async function callback(request) {
        const taken = await steps.callbackOf(request);
        if ("response" in taken) {
            return taken.response;
        }
        const { entry, cookie, code, fail } = taken;
        const verified = await steps.claimsOf(code, entry);
        if ("reason" in verified) {
            return verified.reason === "notReady" ? fail("SIGN_IN_NOT_READY") : fail("SIGN_IN_FAILED", { reason: verified.reason });
        }
        const { claims, accessToken } = verified;
        const input = linkInputOf(options, entry.to);
        const lang = languageOf(request);
        const report = (data) => viewerPage(brand, lang, { heading: data.problem ? brand.name : input.title, report: true, headers: { "set-cookie": cookie }, data: { step: "report", to: entry.to, source: input.source, params: input.names, ...data } });
        if (!accessToken) {
            // the operator's setup: the sign-in client's answer has no access token for this server
            context.log.warn("viewer page: the sign-in's token endpoint gave no access token, so the page cannot read the person's rights; give output.downloads.signIn the scopes of this server (see the viewer page's setup)");
            log({ ok: false, status: 401, code: "SIGN_IN_FAILED", reason: "accessToken" });
            return report({ failed: true });
        }
        let signedIn;
        try {
            signedIn = await rest.verifyToken(accessToken);
        } catch (e) {
            // a token the REST service refuses (another audience, expired): the sign-in client's, not the person's doing
            context.log.debug("viewer page: the sign-in's access token was refused", { reason: String(/** @type {any} */ (e)?.message ?? "invalid").slice(0, 120) });
            log({ ok: false, status: 401, code: "INVALID_TOKEN", reason: "accessToken" });
            return report({ failed: true });
        }
        if ("refused" in signedIn) {
            // valid, without this service's scopes or the person's groups: the person may not read here
            const problem = await signedIn.refused.json();
            log({ ok: false, status: signedIn.refused.status, code: problem.code, reason: signedIn.reason });
            return report({ problem: { ...problem, requestId: requestId() ?? newRequestId() } });
        }
        const { caller } = signedIn;
        const subject = subjectOf(claims[subjectClaim]);
        if (!subject || claims.iss !== caller.issuer || subject !== caller.subject) {
            // the ID token and the access token of one answer name another person: never read with either
            log({ ok: false, status: 401, code: "SIGN_IN_FAILED", reason: "subject" });
            return report({ failed: true });
        }
        const line = /** @type {Record<string, unknown>} */ ({});
        const made = await tokenFor(input, caller, line);
        log(made.token ? { ok: true, token: line.token } : { ok: false, status: made.status, code: made.code, ...(made.problem?.linkAccess ? { linkAccess: made.problem.linkAccess } : {}) });
        return report(made.token ? { token: made.token } : { problem: made.problem });
    }

    /** The answer of a request after its precheck. */
    async function answer(request) {
        const url = new URL(request.url);
        const path = url.pathname;
        const head = request.method === "HEAD";
        if (!enabled || !state.base) {
            return answerPage(brand, request, "NOT_FOUND");
        }
        if (request.method !== "GET" && !head) {
            return answerPage(brand, request, "METHOD_NOT_ALLOWED", { allow: "GET, HEAD" });
        }
        if (path.startsWith(`${OWN_PATH}/`)) {
            if (path === SIGN_IN_PATH && !head) {
                const to = url.searchParams.get("to") ?? "";
                if (to.length > LINK_CHARS || !LINK_SYNTAX.test(to)) {
                    return answerPage(brand, request, "NOT_FOUND");
                }
                return steps.start(request, { k: "live", to });
            }
            if (path === VIEWER_CALLBACK_PATH && !head) {
                return callback(request);
            }
            const file = await assets?.answer(path.slice(OWN_PATH.length + 1), head);
            return file ?? answerPage(brand, request, "NOT_FOUND");
        }
        const id = path.slice(VIEWER_PATH.length + 1);
        if (!SOURCE_ID.test(id)) {
            return answerPage(brand, request, "NOT_FOUND");
        }
        if (!assets?.ready) {
            return answerPage(brand, request, "UNAVAILABLE");
        }
        return startPage(request);
    }

    /** The Host check and the body's size, before anything else. */
    function check(request) {
        const refused = hostRefusal(request, hosts);
        if (refused) {
            context.log.refused(hostRefusedLine(request, refused, { path: VIEWER_PATH }));
            return answerPage(brand, request, "FORBIDDEN_HOST");
        }
        if (Number(request.headers.get("content-length") ?? 0) > VIEWER_BODY_BYTES) {
            context.log.refused({ status: 413, path: VIEWER_PATH, reason: "body_too_large", limit: VIEWER_BODY_BYTES, size: Number(request.headers.get("content-length")) });
            return answerPage(brand, request, "BODY_TOO_LARGE");
        }
        return null;
    }

    const routes = createRouteHandler(context, {
        check: async (request) => check(request),
        answer: async (request) => {
            try {
                return check(request) ?? (await answer(request));
            } catch (e) {
                context.log.error(e, { where: "viewer", requestId: requestId() });
                return answerPage(brand, request, "INTERNAL");
            }
        },
        familyOf: () => VIEWER_FAMILY,
        unreadable: {
            path: VIEWER_PATH,
            limitOf: () => VIEWER_BODY_BYTES,
            answer: (status, _limit, id) => new Response(JSON.stringify({ code: status === 413 ? "BODY_TOO_LARGE" : "INVALID_INPUT", requestId: id }), { status, headers: { "content-type": "application/problem+json", "cache-control": "no-store", connection: "close" } })
        }
    });

    return {
        /** Whether a path is the page's (anything under /live). */
        handles: (path) => path === VIEWER_PATH || path.startsWith(`${VIEWER_PATH}/`),
        ...routes,
        /** The address the server listens on: the page's base on loopback without http.publicUrl. */
        listening(url) {
            if (!publicOriginOf(options) && loopback) {
                state.base = new URL(url).origin;
            }
        },
        close() {
            issuer?.close();
            steps.close();
        }
    };
}


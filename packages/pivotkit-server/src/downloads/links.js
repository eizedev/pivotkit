/*
 * The answers of a link (/downloads/<token>): its token checked, then by its binding. "none" sends
 * the file; "once" answers a page whose button posts for the file, once (a marker), again to the same
 * browser for REPEAT_SECONDS; "signIn" starts the sign-in (sign-in.js).
 */

import { access, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { outputDir } from "../output.js";
import { requestId } from "../request-id.js";
import { readToken } from "./tokens.js";
import { placeMarker } from "./markers.js";
import { fileAnswer, openReport } from "./files.js";
import { REPEAT_SECONDS, escapeHtml, sizeText, timeHtml } from "./pages.js";

/**
 * What the link answers and the sign-in flow share (downloads.js createDownloadHandler makes it).
 * @typedef {object} LinkRoute
 * @property {any} context
 * @property {any} settings  output.downloads' (options/downloads.js settingsOf)
 * @property {{ base: string | null }} state  the links' base address
 * @property {() => Promise<any>} keys  tokens.js keySource's
 * @property {ReturnType<typeof import("./tokens.js").cookieJar>} jar
 * @property {(entry: Record<string, unknown>) => void} log  a download's log line
 * @property {(request: Request, code: keyof typeof import("./pages.js").ANSWERS, headers?: Record<string, string>) => Response} answer
 * @property {(heading: string, body: string, how?: { status?: number, form?: boolean, headers?: Record<string, string> }) => Response} page
 * @property {() => string} markersDir
 * @property {() => Promise<void>} sweep  the throttled sweep of expired markers
 * @property {(request: Request, token: string) => Promise<Response>} startSignIn  sign-in.js's start
 */

/**
 * Whether a POST comes from the link's own page: Origin equal to the link's (http.publicUrl's, not
 * the address behind a proxy), or no usable Origin (`null`: a page under Referrer-Policy
 * no-referrer, Fetch "append a request Origin header") and same-origin fetch metadata. The
 * one-time page is served with Referrer-Policy same-origin, so its form's POST names its origin.
 * @param {Request} request
 * @param {string} base  the links' base address
 */
function sameOriginPost(request, base) {
    const origin = request.headers.get("origin");
    if (origin !== null && origin !== "null") {
        return origin === new URL(base).origin;
    }
    return request.headers.get("sec-fetch-site") === "same-origin";
}

/**
 * The answers of links.
 * @param {LinkRoute} route
 */
export function createLinkAnswers(route) {
    const { context, state, keys, jar, log, answer, page, markersDir, sweep } = route;

    /** A token's payload for a request, or the answer: 404 for one that does not hold, 410 for an expired one. */
    async function tokenOf(request, token) {
        let k;
        try {
            k = await keys();
        } catch (e) {
            context.log.warn(`download links: the key cannot be read: ${String(/** @type {any} */ (e)?.message ?? e).slice(0, 200)}`);
            log({ ok: false, code: "INTERNAL" });
            return { response: answer(request, "INTERNAL") };
        }
        const payload = readToken(k, token);
        if (!payload) {
            context.log.debug("download links: no such link", { via: "link", code: "NOT_FOUND", requestId: requestId() });
            return { response: answer(request, "NOT_FOUND") };
        }
        if (payload.e < Math.floor(Date.now() / 1000)) {
            log({ bound: payload.b, ok: false, code: "LINK_EXPIRED" });
            return { response: answer(request, "LINK_EXPIRED") };
        }
        return { payload, keys: k };
    }

    /** The stored report of a payload, or the answer for a removed one. */
    async function reportOf(request, payload) {
        const report = await openReport(outputDir(context), payload.n);
        if (!report) {
            log({ bound: payload.b, ok: false, code: "LINK_EXPIRED", removed: true });
            return { response: answer(request, "REPORT_REMOVED") };
        }
        return { report };
    }

    /** GET, HEAD and POST of /downloads/<token>. */
    async function link(request, token) {
        const got = await tokenOf(request, token);
        if (got.response) {
            return got.response;
        }
        const { payload } = got;
        const method = request.method;
        if (payload.b === "none") {
            if (method !== "GET" && method !== "HEAD") {
                return answer(request, "METHOD_NOT_ALLOWED", { allow: "GET, HEAD" });
            }
            const found = await reportOf(request, payload);
            if (found.response) {
                return found.response;
            }
            log({ bound: "none", ok: true });
            return fileAnswer(found.report, method);
        }
        if (payload.b === "once") {
            if (method === "GET" || method === "HEAD") {
                // a link preview must not use the link: a page, the file only by its button
                const found = await reportOf(request, payload);
                if (found.response) {
                    return found.response;
                }
                await found.report.handle.close();
                // a used link says so at once (to a second browser, at a later visit), except to the
                // browser that took it, which may repeat it for REPEAT_SECONDS
                const repeat = (await jar.read(request))[`o:${payload.n}`];
                if (!repeat && (await access(join(markersDir(), `${payload.n}.used`)).then(() => true, () => false))) {
                    return answer(request, "LINK_USED");
                }
                const { filename, kind, size } = found.report;
                const what = `<p class="file">${escapeHtml(filename)}</p><p>${kind}, ${sizeText(size)}. `;
                // the sentence about when it can be downloaded goes once the status line says it (the page's script)
                const body = repeat ? `${what}<span id="until">You downloaded it in this browser a moment ago and can download it again until ${timeHtml(repeat.x)}; after that the link is used.</span></p>` : `${what}<span id="until">It can be downloaded once, until ${timeHtml(payload.e)}.</span></p>`;
                // same-origin, not no-referrer: so the browser names the page's origin when it posts the
                // form (under no-referrer it sends Origin: null); nothing leaves for another site
                return page("Download the report", body, { form: true, headers: { "referrer-policy": "same-origin" } });
            }
            if (method !== "POST") {
                return answer(request, "METHOD_NOT_ALLOWED", { allow: "GET, HEAD, POST" });
            }
            if (!sameOriginPost(request, /** @type {string} */ (state.base))) {
                log({ bound: "once", ok: false, code: "FORBIDDEN_ORIGIN" });
                return answer(request, "FORBIDDEN_ORIGIN");
            }
            return once(request, payload);
        }
        // signIn
        if (method !== "GET" && method !== "HEAD") {
            return answer(request, "METHOD_NOT_ALLOWED", { allow: "GET, HEAD" });
        }
        const found = await reportOf(request, payload);
        if (found.response) {
            return found.response;
        }
        await found.report.handle.close();
        // a link preview (HEAD) learns the link works, but starts no sign-in and gets no cookie
        if (method === "HEAD") {
            return page("Sign in to download the report", "<p>Open this link in your browser and sign in to download the report.</p>");
        }
        return route.startSignIn(request, token);
    }

    /** The POST of a one-time link: the file once, or again to the browser that took it within REPEAT_SECONDS. */
    async function once(request, payload) {
        void sweep().catch(() => undefined);
        const found = await reportOf(request, payload);
        if (found.response) {
            return found.response;
        }
        const map = await jar.read(request);
        const repeat = map[`o:${payload.n}`];
        const marker = join(markersDir(), `${payload.n}.used`);
        if (!repeat) {
            try {
                await mkdir(markersDir(), { recursive: true, mode: 0o700 });
                await placeMarker(marker, payload.e);
            } catch (e) {
                await found.report.handle.close();
                if (/** @type {any} */ (e)?.code === "EEXIST") {
                    log({ bound: "once", ok: false, code: "LINK_USED" });
                    return answer(request, "LINK_USED");
                }
                throw e;
            }
        }
        const cookie = repeat ? null : await jar.write({ ...map, [`o:${payload.n}`]: { x: Math.floor(Date.now() / 1000) + REPEAT_SECONDS } });
        log({ bound: "once", ok: true, ...(repeat ? { repeat: true } : {}) });
        return fileAnswer(found.report, "POST", {
            headers: cookie ? { "set-cookie": cookie } : {},
            // nothing left: the link stays unused
            failed: repeat ? () => {} : () => unlink(marker).catch(() => undefined)
        });
    }

    return { link, tokenOf, reportOf };
}

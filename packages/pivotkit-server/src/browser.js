/*
 * The browser path (records 0019 and 0020): a person's token exchanged for a browser token, and the
 * sign-in of the rows route with one.
 *
 * POST /api/v1/sources/records/token, in this order:
 *
 * 1. the person may read the source's rows, as the rows route decides it (records.js recordsRefusal);
 * 2. the source's backend does not exchange the person's token: a browser token never carries it;
 * 3. the source and its parameters for the caller (registry.resolve checks the parameters);
 * 4. the link's access level (link-access.js), where the request carries one;
 * 5. the token (browser-tokens.js), rest.browser.minutes long, never past the person's own token.
 *
 * The answer is { token, tokenType, expiresIn, expiresAt, source }. A refusal by the link's access
 * level is NOT_ALLOWED with `linkAccess: true`, so a page tells it from missing rights. The request's
 * log line names the token's ID, never its value. A browser token cannot make another one: only the rows route reads it.
 */

import { OperationError, checkInput } from "pivotkit-report/operations";
import { REST_BASE } from "pivotkit-node/rest";
import { AuthRefusal, bearerOf, browserCallerOf } from "./auth.js";
import { BrowserTokenError, bindBrowserCaller, looksBrowser } from "./browser-tokens.js";
import { publicOriginOf } from "./config.js";
import { browserSettingsOf } from "./options/browser.js";
import { checkDepth } from "./input-depth.js";
import { checkLinkAccess } from "./link-access.js";
import { recordsRefusal } from "./records.js";
import { json, problemsFor } from "./rest/problem.js";
import { brandingOfContext } from "./branding.js";
import { RECORDS_PATH } from "./rest/routes.js";
import { exchangesToken } from "./sources/auth.js";
import { PARAMS_INPUT } from "./sources/input.js";

/** What a caller sends to the exchange route. */
export const BROWSER_TOKEN_INPUT = Object.freeze({
    type: "object",
    required: ["source"],
    additionalProperties: false,
    properties: {
        source: { type: "string", minLength: 1, maxLength: 1024, pattern: "^(?!file:)", description: "A source id from GET /sources whose records is true." },
        params: PARAMS_INPUT,
        access: { type: "string", minLength: 1, maxLength: 1024, description: "The pk-access value of the link's query string, where it has one: the link's access level." }
    }
});

/** What a caller gets. */
export const BROWSER_TOKEN_OUTPUT = Object.freeze({
    type: "object",
    required: ["token", "tokenType", "expiresIn", "expiresAt", "source"],
    properties: {
        token: { type: "string", description: "The browser token: send it as Authorization: Bearer to POST /api/v1/sources/records, for this source and these params only." },
        tokenType: { type: "string", enum: ["Bearer"] },
        expiresIn: { type: "integer", description: "Seconds until it expires." },
        expiresAt: { type: "string", description: "When it expires: ISO 8601 in UTC." },
        source: { type: "string" }
    },
    additionalProperties: false
});

/** What a refused browser token is told: never which check failed beyond expiry. */
const REFUSALS = Object.freeze({ EXPIRED: "this browser token expired; get a new one", NOT_YET_VALID: "this browser token is not valid yet; the clocks of the server and the browser differ" });

/** The rows route's full path: the one route that reads a browser token. */
const ROWS = `${REST_BASE}${RECORDS_PATH}`;

/**
 * The browser path of one REST handler.
 * @param {any} context  createContext's
 */
export function createBrowserPath(context) {
    const options = context.options;
    const tokens = context.browserTokens;
    const settings = browserSettingsOf(options);
    const browserOrigins = new Set(settings.origins);
    const ownOrigin = publicOriginOf(options);
    const { problemOf } = problemsFor(brandingOfContext(context).docs);

    /**
     * The answer of the exchange route (the body read and parsed; the caller signed in).
     * @param {Record<string, any>} input
     * @param {import("./registry.js").Caller} caller
     * @param {{ entry: Record<string, unknown> }} how  entry: the request's log line
     */
    async function exchange(input, caller, how) {
        checkDepth(input);
        checkInput(BROWSER_TOKEN_INPUT, input);
        const refused = recordsRefusal(options, caller, input.source);
        if (refused) {
            throw refused;
        }
        const source = /** @type {any} */ (options.sources?.[input.source]);
        if (exchangesToken(options, source)) {
            throw new OperationError("NOT_ALLOWED", "this source's backend exchanges your own token, which a browser token never carries: read its rows through the host application's backend (POST /api/v1/sources/records with your token)");
        }
        const params = input.params ?? {};
        // the parameters as the source's rules take them for this person, before a token holds them
        await context.registry.resolve(input.source, caller, { files: false, surface: "rest" }, params);
        try {
            await checkLinkAccess(tokens.keys, options, caller, input.access);
        } catch (e) {
            // the link's level shuts this person out, which is not the source's rights: `linkAccess` tells a page which it is
            if (e instanceof OperationError) {
                return problemOf(e, { extra: { linkAccess: true } });
            }
            throw e;
        }
        const claims = Object.values(source?.params ?? {}).flatMap((p) => (p && typeof p === "object" && typeof p.claim === "string" ? [p.claim] : []));
        const issued = await tokens.issue(caller, { source: input.source, params, code: typeof source?.load === "function", claims });
        if (!issued) {
            throw new OperationError("NOT_ALLOWED", "a browser token is made for a person who signed in");
        }
        how.entry.token = issued.id;
        const nowSec = Math.floor(Date.now() / 1000);
        return json({ token: issued.token, tokenType: "Bearer", expiresIn: Math.max(0, issued.expiresAt - nowSec), expiresAt: new Date(issued.expiresAt * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"), source: input.source });
    }

    /**
     * The browser token of a request, where the request may carry one: a POST to the rows route
     * whose bearer has a browser token's shape. Every other request is signed in as before, and a
     * browser token there is refused as an unknown token.
     * @param {Request} request
     * @returns {string | null}
     */
    function tokenOf(request) {
        if (request.method !== "POST" || new URL(request.url).pathname.replace(/\/$/, "") !== ROWS) {
            return null;
        }
        const bearer = bearerOf(request);
        return "token" in bearer && looksBrowser(bearer.token) ? bearer.token : null;
    }

    /**
     * The caller of a browser token, bound to its source and parameters; AuthRefusal for one that is
     * not valid. The log names a refused token by why, never by its value.
     * @param {string} token
     * @returns {Promise<import("./registry.js").Caller>}
     */
    async function callerOf(token) {
        try {
            const claims = await tokens.read(token);
            const caller = browserCallerOf(claims.grant);
            bindBrowserCaller(caller, { id: claims.id, source: claims.source, params: claims.params });
            return caller;
        } catch (e) {
            if (!(e instanceof BrowserTokenError)) {
                throw e;
            }
            context.log.debug("rest: browser token refused", { reason: e.code });
            const refusal = new AuthRefusal(401, "invalid_token", REFUSALS[/** @type {keyof typeof REFUSALS} */ (e.code)] ?? "unknown token; get a new browser token");
            // a token this server made that ran out: the page gets a new one (getToken()), and the
            // address is not counted as one that guesses tokens
            refusal.expired = e.code === "EXPIRED";
            throw refusal;
        }
    }

    /**
     * Whether a request's Origin may call the rows route with a browser token: one of
     * rest.browser.origins, or the server's own (http.publicUrl's, else the request's own address
     * after the Host check). A preflight of the rows route has no token yet: it is let through for
     * these origins, and the request after it is checked.
     * @param {Request} request
     * @param {string} origin
     */
    function allowsOrigin(request, origin) {
        const url = new URL(request.url);
        if (url.pathname.replace(/\/$/, "") !== ROWS || !(browserOrigins.has(origin) || origin === ownOrigin || origin === url.origin)) {
            return false;
        }
        return request.method === "OPTIONS" || tokenOf(request) !== null;
    }

    return { exchange, tokenOf, callerOf, allowsOrigin };
}

/*
 * Who calls the REST service: the bearer token checked (a cookie, Basic or a token in the address is
 * never read), the REST audience and required scopes under OAuth, the person's groups, and the
 * refused-token limit of an address. A refusal is a problem with its WWW-Authenticate challenge and
 * the reason of its refused line.
 */

import { AuthRefusal, bearerOf, groupRefusal } from "../auth.js";
import { callerOf } from "../context.js";
import { refusalReason } from "../log.js";

/**
 * @typedef {{ caller: import("../registry.js").Caller } | { refused: Response, reason: string, client?: string }} SignIn
 *   reason: the refused line's (log.js refusalReason); client: the app of a verified token refused for its person's groups, for the log
 */

/**
 * The REST service's sign-in.
 * @param {any} context  createContext's
 * @param {{ core: any, audience: string[], resource: URL, requiredScopes: string[], metadataUrl: string | null, limits: ReturnType<typeof import("../limits.js").createLimits>, slug: string, problem: (code: string, detail: string, more?: any) => Response }} how
 *   core: context.auth's; metadataUrl: the Protected Resource Metadata's address under OAuth; slug: the realm of a static token's challenge (branding)
 */
export function createRestSignIn(context, { core, audience, resource, requiredScopes, metadataUrl, limits, slug, problem }) {
    const authOptions = context.options.auth ?? {};
    const mode = authOptions.mode ?? "none";
    let warnedAddress = false;

    /** The WWW-Authenticate challenge of a refusal. */
    function challenge(error, description, scopes = requiredScopes) {
        if (mode !== "oauth") {
            return `Bearer realm="${slug}"`;
        }
        const parts = [`error="${error}"`, `error_description="${description.replace(/["\\]/g, "")}"`, ...(scopes.length ? [`scope="${scopes.join(" ")}"`] : []), `resource_metadata="${metadataUrl}"`];
        return `Bearer ${parts.join(", ")}`;
    }

    /**
     * The verified caller of a request, or the refusal to send.
     * @param {Request} request
     * @param {string} address  the client's ("" when the host gave none)
     * @returns {Promise<SignIn>}
     */
    async function authenticate(request, address) {
        if (mode === "none") {
            return { caller: callerOf("none", undefined) };
        }
        // refused tokens are counted per address; without one (a host that gives none) they are not
        // counted at all, rather than every caller sharing one count that a stranger could fill
        if (!address && !warnedAddress) {
            warnedAddress = true;
            context.log.warn("rest: requests come without the client's address (fetch(request, { address })): refused tokens are not limited");
        }
        // a valid token always passes; a refused one from an address over the limit is told to wait
        // (tokens have at least 32 random characters: the limit slows scripts, guessing gets nowhere)
        const wait = address ? limits.blocked(address) : 0;
        try {
            return mode === "token" ? { caller: callerOf(mode, await core.check(request), authOptions) } : await verifyBearer(request);
        } catch (e) {
            if (!(e instanceof AuthRefusal)) {
                throw e;
            }
            if (e.status === 503) {
                return { reason: refusalReason("AUTH_NOT_READY"), refused: problem("AUTH_NOT_READY", e.message, { headers: { "retry-after": "10" } }) };
            }
            if (wait) {
                return { reason: refusalReason("RATE_LIMITED"), refused: problem("RATE_LIMITED", "too many refused tokens from this address; wait before you try again", { headers: { "retry-after": String(wait) } }) };
            }
            if (address) {
                limits.failed(address);
            }
            return { reason: refusalReason("INVALID_TOKEN", request), refused: problem("INVALID_TOKEN", e.message, { headers: { "www-authenticate": challenge("invalid_token", e.message) } }) };
        }
    }

    /**
     * An OAuth bearer: verified for the REST audience, then the required scopes and the person's groups.
     * @param {Request} request
     * @returns {Promise<SignIn>}  an AuthRefusal is thrown
     */
    async function verifyBearer(request) {
        const bearer = /** @type {{ token?: string, refused?: string }} */ (bearerOf(request));
        if (!bearer.token) {
            throw new AuthRefusal(401, "invalid_token", bearer.refused ?? "no token");
        }
        const authInfo = await core.verify(bearer.token, { audience, resource });
        if (!requiredScopes.every((s) => authInfo.scopes.includes(s))) {
            return { reason: refusalReason("INSUFFICIENT_SCOPE"), refused: problem("INSUFFICIENT_SCOPE", `this service needs the scopes ${requiredScopes.join(" ")}`, { headers: { "www-authenticate": challenge("insufficient_scope", "insufficient scope") } }) };
        }
        // a person whose groups the token does not carry (auth.groupProfiles): not a bad token
        const refusedGroups = groupRefusal(authOptions, authInfo);
        if (refusedGroups) {
            return { reason: refusalReason("NOT_ALLOWED"), refused: problem("NOT_ALLOWED", refusedGroups), client: String(authInfo.clientId) };
        }
        return { caller: callerOf(mode, authInfo, authOptions) };
    }

    /**
     * A refused sign-in's answer, after its refused line.
     * @param {{ refused: Response, reason: string, client?: string }} who
     * @param {string} path  the route family the line names
     */
    function refuse(who, path) {
        context.log.refused({ status: who.refused.status, path, reason: who.reason, ...(who.client !== undefined ? { client: who.client } : {}) });
        return who.refused;
    }

    return { authenticate, challenge, refuse };
}

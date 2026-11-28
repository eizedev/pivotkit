/*
 * Browser tokens (records 0019 and 0020): the short-lived token a page reads one report's rows with.
 * An encrypted JWT (RFC 7516 compact form, alg "dir", enc "A256GCM", typ "pivotkit-browser+jwt"):
 * only this server makes or reads one, and no script in the page reads the person in it.
 *
 *   claims  { iss: "pivotkit-server", jti, iat, nbf, exp, src, prm, who }
 *
 * jti is the token's ID (16 lowercase hex): the log names it, never the value. src is the source and
 * prm its parameters, as the exchange got them: the rows route takes the token for them only. who is
 * the person (auth.js browserGrantOf): the identity, the profile, the scopes, the claims the sources'
 * parameters name, and the groups only for a code source, whose code sees them.
 *
 * The key is an HKDF subkey of rest.browser.key (key-source.js: read again within a second, so a new
 * key ends every token at once), or of a random key per process. The access levels of live links
 * (link-access.js) take a subkey of their own.
 *
 * The other front ends never read these tokens: a static or signed token check, an OAuth issuer and
 * an external issuer all refuse one as unknown (it has five parts, none of them a readable JWT).
 */

import { CodedError } from "pivotkit-core/internal";
import { hkdfSync, randomBytes } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";
import { OperationError } from "pivotkit-report/operations";
import { browserGrantOf } from "./auth.js";
import { keySource } from "./key-source.js";
import { browserSettingsOf } from "./options/browser.js";

/** The fixed parts of a browser token. */
export const BROWSER_TOKEN = Object.freeze({
    issuer: "pivotkit-server",
    typ: "pivotkit-browser+jwt",
    alg: "dir",
    enc: "A256GCM",
    /** the longest bearer read as one; a person with more groups and claims gets no token */
    maxLength: 8192
});

/** A token's ID: 64 random bits in lowercase hex. */
const BROWSER_TOKEN_ID = /^[0-9a-f]{16}$/;

/** The purposes of the subkeys of rest.browser.key. */
const PURPOSES = Object.freeze({ token: "pivotkit browser: token v1", access: "pivotkit browser: link access v1" });

/**
 * The subkeys of a browser key: one per purpose (HKDF).
 * @param {Buffer} key
 * @returns {{ token: Uint8Array, access: Buffer }}
 */
export function browserSubkeysOf(key) {
    const derive = (purpose) => Buffer.from(hkdfSync("sha256", key, Buffer.alloc(0), purpose, 32));
    return { token: new Uint8Array(derive(PURPOSES.token)), access: derive(PURPOSES.access) };
}

/** Whether a bearer has a compact JWE's shape (five base64url parts, the key part empty) and length. */
export const looksBrowser = (token) => token.length <= BROWSER_TOKEN.maxLength && /^[A-Za-z0-9_-]+\.\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);

/**
 * Why a browser token was refused: INVALID (shape, key, type, issuer, claims), EXPIRED or
 * NOT_YET_VALID. The message never holds the token.
 */
/** @extends {CodedError<"INVALID" | "EXPIRED" | "NOT_YET_VALID", undefined>} */
export class BrowserTokenError extends CodedError {
    /**
     * @param {"INVALID" | "EXPIRED" | "NOT_YET_VALID"} code
     * @param {string} message
     */
    constructor(code, message) {
        super(code, message);
        this.name = "BrowserTokenError";
    }
}

/**
 * @typedef {object} BrowserClaims
 * @property {string} id  the token's ID (jti)
 * @property {string} source
 * @property {Record<string, string | number | boolean>} params
 * @property {NonNullable<ReturnType<typeof browserGrantOf>>} grant  the person
 * @property {number} expiresAt  seconds since 1970
 */

/**
 * What a browser token's caller may read: the source and parameters its token was made for, and the
 * token's ID for the log. Kept by caller, so nothing outside the sign-in can bind one.
 * @type {WeakMap<object, { id: string, source: string, params: Record<string, string | number | boolean> }>}
 */
const bindings = new WeakMap();

/**
 * Binds a browser token's caller to its token's source and parameters (browser.js, at sign-in).
 * @param {object} caller
 * @param {{ id: string, source: string, params: Record<string, string | number | boolean> }} binding
 */
export const bindBrowserCaller = (caller, binding) => void bindings.set(caller, Object.freeze({ ...binding, params: Object.freeze({ ...binding.params }) }));

/**
 * The source and parameters a caller may read, when it signed in with a browser token; else null.
 * @param {object} caller
 */
export const browserBindingOf = (caller) => bindings.get(caller) ?? null;

/** Whether two sets of parameters are the same, whatever the order of their names. */
export const sameParams = (a, b) => {
    const text = (p) => JSON.stringify(Object.entries(p ?? {}).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)));
    return text(a) === text(b);
};

/**
 * The browser tokens of a server: make one for a person, read one back.
 * @param {import("./config.js").ServerOptions} options
 * @param {{ env?: Record<string, string | undefined>, now?: () => number }} [how]
 */
export function createBrowserTokens(options, { env = process.env, now = Date.now } = {}) {
    const settings = browserSettingsOf(options);
    const keys = keySource({ ref: settings.key, setting: "rest.browser.key", use: "browser", derive: browserSubkeysOf }, options, env);
    const clockToleranceSec = options.auth?.clockTolerance ?? 30;

    return {
        /** The subkeys, for link-access.js. */
        keys,

        /**
         * A token for a person, for one source and its parameters: `rest.browser.minutes` long, never
         * past the person's own token. Null for a caller that is no person.
         * @param {import("./registry.js").Caller} caller
         * @param {{ source: string, params: Record<string, string | number | boolean>, code: boolean, claims: string[] }} what  code: a code source, whose code sees the groups and every claim; claims: the claims the source's parameters are bound to
         * @returns {Promise<{ token: string, id: string, expiresAt: number } | null>}  expiresAt: seconds since 1970
         */
        async issue(caller, { source, params, code, claims }) {
            const grant = browserGrantOf(caller);
            if (!grant) {
                return null;
            }
            if (!code) {
                // only what the rows of this source need: no groups, and the claims its parameters name
                delete grant.caller.groups;
                const kept = Object.entries(grant.caller.claims ?? {}).filter(([name]) => claims.includes(name));
                if (kept.length) {
                    grant.caller.claims = Object.fromEntries(kept);
                } else {
                    delete grant.caller.claims;
                }
            }
            const iat = Math.floor(now() / 1000);
            const expiresAt = Math.min(iat + settings.minutes * 60, grant.expiresAt ?? Infinity);
            const id = randomBytes(8).toString("hex");
            const token = await new EncryptJWT({ src: source, prm: params, who: grant })
                .setProtectedHeader({ alg: BROWSER_TOKEN.alg, enc: BROWSER_TOKEN.enc, typ: BROWSER_TOKEN.typ })
                .setIssuer(BROWSER_TOKEN.issuer)
                .setJti(id)
                .setIssuedAt(iat)
                .setNotBefore(iat)
                .setExpirationTime(expiresAt)
                .encrypt((await keys()).token);
            if (token.length > BROWSER_TOKEN.maxLength) {
                throw new OperationError("LIMIT_EXCEEDED", `a browser token for this sign-in would have ${token.length} characters, more than the ${BROWSER_TOKEN.maxLength} the server reads: the sign-in carries too many groups or claims`);
            }
            return { token, id, expiresAt };
        },

        /**
         * The claims of a token this server made and that has not expired. Fails closed.
         * @param {string} token
         * @returns {Promise<BrowserClaims>}
         */
        async read(token) {
            if (!looksBrowser(token)) {
                throw new BrowserTokenError("INVALID", "not a browser token");
            }
            let payload;
            try {
                ({ payload } = await jwtDecrypt(token, (await keys()).token, { issuer: BROWSER_TOKEN.issuer, typ: BROWSER_TOKEN.typ, keyManagementAlgorithms: [BROWSER_TOKEN.alg], contentEncryptionAlgorithms: [BROWSER_TOKEN.enc], clockTolerance: clockToleranceSec, requiredClaims: ["exp", "iat", "jti"], currentDate: new Date(now()) }));
            } catch (e) {
                if (/** @type {any} */ (e)?.code === "ERR_JWT_EXPIRED") {
                    throw new BrowserTokenError("EXPIRED", "the token expired");
                }
                if (/** @type {any} */ (e)?.code === "ERR_JWT_CLAIM_VALIDATION_FAILED" && (/** @type {any} */ (e).claim === "nbf" || /** @type {any} */ (e).claim === "iat")) {
                    throw new BrowserTokenError("NOT_YET_VALID", "the token is not valid yet (check the clocks)");
                }
                throw new BrowserTokenError("INVALID", "the token is not valid");
            }
            const { jti, src, prm, who, exp } = /** @type {any} */ (payload);
            // made by this server, so only a key's leak could forge these: checked all the same
            if (typeof jti !== "string" || !BROWSER_TOKEN_ID.test(jti) || typeof src !== "string" || !prm || typeof prm !== "object" || Array.isArray(prm) || !Array.isArray(who?.basis) || typeof who?.caller?.subject !== "string") {
                throw new BrowserTokenError("INVALID", "the token is not valid");
            }
            return { id: jti, source: src, params: prm, grant: who, expiresAt: exp };
        }
    };
}

/*
 * The options of download links (output.downloads): the server serves each report that gets a link
 * itself, under /downloads/<token>, for a while (downloads.js), and decides which report gets which
 * link (delivery.js). The keys, the rules between them and their values with the defaults filled
 * (settingsOf), which the route, the delivery and check-config share.
 *
 * A key is declared here once, never also in config.js or another fragment (options/index.js refuses
 * a second declaration).
 */

import { isLoopback } from "pivotkit-cli/rest";
import { ConfigError, SECRET_REF } from "./shared.js";

export const NAME = "downloads";

/** How a link to a report over a closed source is bound: to the person's sign-in, used once, or none (no link). */
export const BINDINGS = Object.freeze(["signIn", "once", "none"]);

/** How long a link works by default, at least, at most, and below what check-config warns (too short for a person to read the answer, open the link and sign in), in minutes. */
export const EXPIRES_MINUTES = Object.freeze({ default: 60, min: 1, max: 1440, short: 5 });

/** The scopes the sign-in asks for by default: an ID token is all it needs. */
export const SIGN_IN_SCOPES = Object.freeze(["openid"]);

/** @type {Readonly<Partial<Record<import("./shared.js").Slot, Record<string, any>>>>} */
export const KEYS = Object.freeze({
    output: {
        downloads: {
            object: {
                enabled: "boolean",
                expiresMinutes: "integer",
                bind: { enum: BINDINGS },
                key: SECRET_REF,
                allowInsecureUrl: "boolean",
                signIn: { object: { clientId: "string", clientSecret: SECRET_REF, issuer: "string", scopes: "strings", tokenUrl: "string" } }
            }
        }
    }
});

/**
 * @typedef {object} DownloadOptions  output.downloads as written
 * @property {boolean} [enabled]  the server's own links (default true; off with output.baseUrl)
 * @property {number} [expiresMinutes]  how long a link works, 1 to 1440 (default 60)
 * @property {"signIn" | "once" | "none"} [bind]  how links to reports over closed sources are bound (default "signIn" with OAuth and signIn.clientId, else "none")
 * @property {{ env?: string, file?: string }} [key]  the link key, at least 32 bytes (default a random key per process)
 * @property {boolean} [allowInsecureUrl]  links under an http:// http.publicUrl on a host other than loopback (default false: refused)
 * @property {{ clientId: string, clientSecret?: { env?: string, file?: string }, issuer?: string, scopes?: string[], tokenUrl?: string }} [signIn]  the browser client of the sign-in; tokenUrl: its token endpoint when the metadata names one on another origin
 */

/**
 * @typedef {object} DownloadSettings
 * @property {boolean} enabled  the built-in links are on: not switched off, no output.baseUrl, an output directory
 * @property {number} expiresMinutes
 * @property {"signIn" | "once" | "none"} bind  for reports over closed sources
 * @property {{ env?: string, file?: string } | null} key  null: a random key per process
 * @property {{ clientId: string, clientSecret: { env?: string, file?: string } | null, issuer: string, scopes: string[], tokenUrl: string | null } | null} signIn  tokenUrl: null takes the metadata's token_endpoint, which must be on the issuer's origin
 */

/**
 * The download options with their defaults filled.
 * @param {import("../config.js").ServerOptions} options
 * @returns {DownloadSettings}
 */
export function settingsOf(options) {
    const d = options.output?.downloads ?? {};
    const oauth = options.auth?.mode === "oauth";
    const signIn = d.signIn?.clientId ? { clientId: d.signIn.clientId, clientSecret: d.signIn.clientSecret ?? null, issuer: d.signIn.issuer ?? options.auth?.issuer ?? "", scopes: d.signIn.scopes ?? [...SIGN_IN_SCOPES], tokenUrl: d.signIn.tokenUrl ?? null } : null;
    return {
        enabled: d.enabled !== false && !options.output?.baseUrl && Boolean(options.output?.dir),
        expiresMinutes: d.expiresMinutes ?? EXPIRES_MINUTES.default,
        bind: d.bind ?? (oauth && signIn ? "signIn" : "none"),
        key: d.key ?? null,
        signIn
    };
}

/** Where a download sign-in with an issuer of its own is planned. */
const ISSUER_OF_ITS_OWN = "https://github.com/eizedev/pivotkit/issues/441";

/**
 * Whether two issuer addresses name the same issuer once normalised: the scheme and host in lower
 * case, a default port left out (both as URL parses them), a trailing slash of the path left out.
 * The path's case, the port, the query, the fragment and a user name or password count. Tokens name an issuer exactly, so this only tells a spelling
 * difference from another issuer, for the message.
 * @param {string} a
 * @param {string | undefined} b
 */
export function sameIssuer(a, b) {
    if (!b || !URL.canParse(a) || !URL.canParse(b)) {
        return false;
    }
    const norm = (text) => {
        const url = new URL(text);
        // a user name or password is part of the address (and refused elsewhere): never a spelling difference
        return JSON.stringify([url.protocol, url.username, url.password, url.host, url.pathname.replace(/\/+$/, ""), url.search, url.hash]);
    };
    return norm(a) === norm(b);
}

/** Whether a text is an https:// address (an http:// one where the operator allows a test issuer). */
const httpsOrAllowed = (text, insecure) => {
    try {
        const url = new URL(text);
        return url.protocol === "https:" || (insecure && url.protocol === "http:");
    } catch {
        return false;
    }
};

/**
 * The host of an http:// http.publicUrl other than loopback while the download links are on, else
 * null: a link (bound "once" or "none") is the credential, and it and the one-time cookie (not
 * Secure without https) would cross the network in clear text. The start refuses it without
 * output.downloads.allowInsecureUrl, and warns with it (downloads.js, check/downloads.js).
 * @param {import("../config.js").ServerOptions} options
 * @returns {string | null}
 */
export function insecurePublicHost(options) {
    const text = options.http?.publicUrl;
    if (!text || !URL.canParse(text) || !settingsOf(options).enabled) {
        return null;
    }
    const url = new URL(text);
    return url.protocol === "http:" && !isLoopback(url.hostname) ? url.hostname : null;
}

/** What the start and check-config say of links in clear text that the operator allowed. */
export const insecureUrlText = (host) => `http.publicUrl is http:// on ${host} (accepted by output.downloads.allowInsecureUrl): download links and their cookies cross the network in clear text, and anyone who reads one can download the report; use https:// on any network you do not fully trust`;

/**
 * Checks the rules between these keys; throws ConfigError.
 * @param {import("../config.js").ServerOptions} options
 */
export function validate(options) {
    validateKeys(options);
    // after the sign-in's rules, which need https:// whatever allowInsecureUrl says
    const insecure = insecurePublicHost(options);
    if (insecure && options.output?.downloads?.allowInsecureUrl !== true) {
        throw new ConfigError(`http.publicUrl (or --public-url): an http:// address on ${insecure} while download links are on: a link is the credential and would cross the network in clear text; use https://, set output.downloads.allowInsecureUrl: true for a network you trust, or switch every download link off with output.downloads.enabled: false`);
    }
}

/** The rules between the keys of output.downloads (validate). */
function validateKeys(options) {
    const d = options.output?.downloads;
    if (!d) {
        return;
    }
    if (d.expiresMinutes !== undefined && (d.expiresMinutes < EXPIRES_MINUTES.min || d.expiresMinutes > EXPIRES_MINUTES.max)) {
        throw new ConfigError(`output.downloads.expiresMinutes: from ${EXPIRES_MINUTES.min} to ${EXPIRES_MINUTES.max} (a day)`);
    }
    if (d.enabled === true && options.output?.baseUrl) {
        throw new ConfigError("output.downloads.enabled: true next to output.baseUrl: choose one (the server's own links, or the web server at output.baseUrl)");
    }
    if (d.signIn && !d.signIn.clientId) {
        throw new ConfigError("output.downloads.signIn.clientId: the browser client the sign-in uses is missing");
    }
    const settings = settingsOf(options);
    if (d.signIn) {
        if (options.auth?.mode !== "oauth") {
            throw new ConfigError('output.downloads.signIn: needs auth.mode "oauth" (the person signs in where the MCP client signs in)');
        }
        if (!settings.signIn?.issuer || !httpsOrAllowed(settings.signIn.issuer, options.auth?.allowInsecureIssuer === true)) {
            // the key the operator set: signIn.issuer, or auth.issuer it follows when it is left out
            throw new ConfigError(`${d.signIn.issuer !== undefined ? "output.downloads.signIn.issuer" : "auth.issuer"}: must be an https:// address (auth.allowInsecureIssuer is for tests only)`);
        }
        // links are bound to the issuer and subject the MCP or REST token named: the person must sign in at the same issuer
        if (d.signIn.issuer !== undefined && d.signIn.issuer !== options.auth?.issuer) {
            throw new ConfigError(
                sameIssuer(d.signIn.issuer, options.auth?.issuer)
                    ? "output.downloads.signIn.issuer: must be auth.issuer exactly; it differs only in its spelling (a trailing slash, upper-case letters in the scheme or host, a default port), and tokens name the issuer as auth.issuer does: leave signIn.issuer out"
                    : `output.downloads.signIn.issuer: must be auth.issuer (${JSON.stringify(String(options.auth?.issuer))}), not ${JSON.stringify(d.signIn.issuer.slice(0, 200))}: a link is bound to the issuer and subject of the caller's token, so the person signs in where the client did; leave it out. A download sign-in with an issuer of its own (a provider with one issuer per application, such as Authentik) is ${ISSUER_OF_ITS_OWN}`
            );
        }
        if (d.signIn.tokenUrl !== undefined && !httpsOrAllowed(d.signIn.tokenUrl, options.auth?.allowInsecureIssuer === true)) {
            throw new ConfigError("output.downloads.signIn.tokenUrl: must be an https:// address (the provider's token endpoint)");
        }
        if (!settings.signIn.scopes.includes("openid")) {
            throw new ConfigError('output.downloads.signIn.scopes: must hold "openid" (the sign-in reads the person from the ID token)');
        }
    }
    if (settings.bind === "signIn") {
        if (options.auth?.mode !== "oauth" || !settings.signIn) {
            throw new ConfigError('output.downloads.bind "signIn": needs auth.mode "oauth" and output.downloads.signIn.clientId');
        }
        if (!options.http?.publicUrl || !httpsOrAllowed(options.http.publicUrl, false)) {
            throw new ConfigError('output.downloads.bind "signIn": needs http.publicUrl with https:// (the sign-in returns to it, and its cookie is only sent over https)');
        }
    }
}

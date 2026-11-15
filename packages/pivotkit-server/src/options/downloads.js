/*
 * The options of download links (output.downloads): the server serves each report that gets a link
 * itself, under /downloads/<token>, for a while (downloads.js), and decides which report gets which
 * link (delivery.js). The keys, the rules between them and their values with the defaults filled
 * (settingsOf), which the route, the delivery and check-config share.
 *
 * A key is declared here once, never also in config.js or another fragment (options/index.js refuses
 * a second declaration).
 */

import { ConfigError, SECRET_REF } from "./shared.js";

export const NAME = "downloads";

/** How a link to a report over a closed source is bound: to the person's sign-in, used once, or none (no link). */
export const BINDINGS = Object.freeze(["signIn", "once", "none"]);

/** How long a link works by default, and at most, in minutes. */
export const EXPIRES_MINUTES = Object.freeze({ default: 60, min: 1, max: 1440 });

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
                signIn: { object: { clientId: "string", clientSecret: SECRET_REF, issuer: "string", scopes: "strings" } }
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
 * @property {{ clientId: string, clientSecret?: { env?: string, file?: string }, issuer?: string, scopes?: string[] }} [signIn]  the browser client of the sign-in
 */

/**
 * @typedef {object} DownloadSettings
 * @property {boolean} enabled  the built-in links are on: not switched off, no output.baseUrl, an output directory
 * @property {number} expiresMinutes
 * @property {"signIn" | "once" | "none"} bind  for reports over closed sources
 * @property {{ env?: string, file?: string } | null} key  null: a random key per process
 * @property {{ clientId: string, clientSecret: { env?: string, file?: string } | null, issuer: string, scopes: string[] } | null} signIn
 */

/**
 * The download options with their defaults filled.
 * @param {import("../config.js").ServerOptions} options
 * @returns {DownloadSettings}
 */
export function settingsOf(options) {
    const d = options.output?.downloads ?? {};
    const oauth = options.auth?.mode === "oauth";
    const signIn = d.signIn?.clientId ? { clientId: d.signIn.clientId, clientSecret: d.signIn.clientSecret ?? null, issuer: d.signIn.issuer ?? options.auth?.issuer ?? "", scopes: d.signIn.scopes ?? [...SIGN_IN_SCOPES] } : null;
    return {
        enabled: d.enabled !== false && !options.output?.baseUrl && Boolean(options.output?.dir),
        expiresMinutes: d.expiresMinutes ?? EXPIRES_MINUTES.default,
        bind: d.bind ?? (oauth && signIn ? "signIn" : "none"),
        key: d.key ?? null,
        signIn
    };
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
 * Checks the rules between these keys; throws ConfigError.
 * @param {import("../config.js").ServerOptions} options
 */
export function validate(options) {
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
            throw new ConfigError("output.downloads.signIn.issuer: must be an https:// address (auth.allowInsecureIssuer is for tests only)");
        }
        if (!settings.signIn.scopes.includes("openid")) {
            throw new ConfigError('output.downloads.signIn.scopes: must hold "openid" (the sign-in reads the person from the ID token)');
        }
    }
    if (settings.bind === "once" && options.http?.publicUrl && !httpsOrAllowed(options.http.publicUrl, false)) {
        throw new ConfigError('output.downloads.bind "once": needs http.publicUrl with https:// (a browser says that the button was pressed on the link\'s own page only over https)');
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

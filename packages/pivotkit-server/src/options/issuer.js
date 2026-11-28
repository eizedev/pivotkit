/*
 * The options of the OAuth issuers (issuer.js): auth.issuers, the list form of auth.issuer for a
 * server that accepts tokens of more than one issuer (each with its own key set, audience and
 * required scopes; issuer.js issuersOf reads both forms), and whether the issuers may be on a
 * loopback or private address (an issuer in the LAN or the cluster). Off by default, as for every
 * other outbound request (an HTTP source's backend, the upload target, a token endpoint).
 *
 * And rest.signIn.clientId: the issuer's public client that `pivotkit login` signs in with. The REST
 * metadata publishes it (pivotkit-node/rest SIGN_IN_CLIENT_FIELD), so a user needs only the address.
 *
 * A key is declared here once, never also in config.js or another fragment (options/index.js refuses
 * a second declaration).
 */

import { CLIENT_ID_SYNTAX } from "pivotkit-node/rest";
import { MAX_ISSUERS } from "../issuer.js";
import { sameIssuer } from "./downloads.js";
import { ConfigError } from "./shared.js";

export const NAME = "issuer";

/** @type {Readonly<Partial<Record<import("./shared.js").Slot, Record<string, any>>>>} */
export const KEYS = Object.freeze({
    auth: {
        issuers: { list: { object: { issuer: "string", jwksUri: "string", audience: "strings", requiredScopes: "strings" } } },
        intranet: "boolean"
    },
    // the public client pivotkit login signs in with, published in the REST metadata; named as
    // output.downloads.signIn names the browser client of a download link's sign-in
    rest: {
        signIn: { object: { clientId: "string" } }
    }
});

/** Whether a text is an http(s) address (https only is the start's rule: issuer.js issuerSchemeProblem). */
const httpAddress = (text) => typeof text === "string" && URL.canParse(text) && /^https?:$/.test(new URL(text).protocol);

/**
 * auth.issuers: with auth.mode "oauth" only, instead of auth.issuer and auth.jwksUri (never beside
 * them), 1 to MAX_ISSUERS entries, each an http(s) issuer named once, also in another spelling (a
 * token names its issuer exactly, so two spellings of one would be two issuers), with an http(s)
 * jwksUri and an audience that is not empty when they are written.
 * @param {import("../config.js").ServerOptions} options
 */
function validateIssuers(options) {
    const list = options.auth?.issuers;
    if (list === undefined) {
        if (options.auth?.mode === "oauth" && !options.auth.issuer) {
            throw new ConfigError('auth.issuer: needed for auth.mode "oauth" (or auth.issuers, a list of issuers)');
        }
        if (options.auth?.mode === "oauth" && !httpAddress(options.auth.issuer)) {
            throw new ConfigError("auth.issuer: an https:// address");
        }
        return;
    }
    if (options.auth?.mode !== "oauth") {
        throw new ConfigError('auth.issuers: needs auth.mode "oauth"');
    }
    for (const key of ["issuer", "jwksUri"]) {
        if (options.auth[key] !== undefined) {
            throw new ConfigError(`auth.${key}: set it in the entries of auth.issuers, or leave auth.issuers out; not both`);
        }
    }
    if (list.length < 1 || list.length > MAX_ISSUERS) {
        throw new ConfigError(`auth.issuers: 1 to ${MAX_ISSUERS} issuers`);
    }
    /** @type {string[]} */
    const seen = [];
    for (const [i, entry] of list.entries()) {
        const at = `auth.issuers[${i}]`;
        for (const key of /** @type {const} */ (["issuer", "jwksUri"])) {
            if ((key === "issuer" || entry[key] !== undefined) && !httpAddress(entry[key])) {
                throw new ConfigError(`${at}.${key}: ${key === "issuer" ? "the issuer, exactly as its tokens carry it in iss" : "where its keys are"}: an https:// address`);
            }
        }
        const twin = seen.find((other) => other === entry.issuer || sameIssuer(other, entry.issuer));
        if (twin !== undefined) {
            throw new ConfigError(`${at}.issuer: ${twin === entry.issuer ? "is there twice" : `is ${JSON.stringify(twin)} in another spelling; a token names its issuer exactly, so write it once, as its tokens do`}`);
        }
        seen.push(entry.issuer);
        if (entry.audience !== undefined && entry.audience.length === 0) {
            throw new ConfigError(`${at}.audience: the aud values its tokens may carry; leave it out for the endpoints' own (auth.audience, rest.audience)`);
        }
    }
}

/**
 * The issuers (validateIssuers) and rest.signIn (validateSignIn).
 * @param {import("../config.js").ServerOptions} options
 */
export function validate(options) {
    validateIssuers(options);
    validateSignIn(options);
}

/**
 * rest.signIn: only with OAuth (the metadata it goes into is served only then), and a client ID of
 * the form the command line takes. The schema has no key for a secret: a client that needs one
 * cannot be published.
 * @param {import("../config.js").ServerOptions} options
 */
function validateSignIn(options) {
    const signIn = options.rest?.signIn;
    if (signIn === undefined) {
        return;
    }
    if (typeof signIn.clientId !== "string" || !CLIENT_ID_SYNTAX.test(signIn.clientId)) {
        throw new ConfigError("rest.signIn.clientId: the public client's ID at the issuer that pivotkit login signs in with: printable, no spaces, at most 200 characters");
    }
    if (options.auth?.mode !== "oauth") {
        throw new ConfigError('rest.signIn: needs auth.mode "oauth"; the server publishes it in its sign-in metadata, which only OAuth has');
    }
}

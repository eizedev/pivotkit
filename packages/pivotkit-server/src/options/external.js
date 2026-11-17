/*
 * The options of tokens another system issues for its signed-in person (external-issuers.js):
 *
 *   "auth": { "externalIssuers": [{ "issuer": "psu", "typ": "psu+jwt", "maxMinutes": 60,
 *     "keys": [{ "kid": "psu-2026-11", "publicKey": { "file": "keys/psu.pub" } }] }] }
 *
 * They work with auth.mode "token" only, as the server's own signed tokens. The keys are Ed25519
 * public keys in PEM; check-config and the start read them (external-issuers.js loadExternalIssuers).
 *
 * A key is declared here once, never also in config.js or another fragment (options/index.js refuses
 * a second declaration).
 */

import { SIGNED_TOKEN } from "../signed-tokens.js";
import { ConfigError, SECRET_REF } from "./shared.js";

export const NAME = "external";

/** The limits of an issuer's configuration. */
export const EXTERNAL_ISSUER = Object.freeze({
    /** maxMinutes without a value, and its highest value */
    maxMinutes: 60,
    maxMinutesLimit: 1440,
    /** keys per issuer: the current one and the next (a rotation) */
    maxKeys: 2,
    maxIssuers: 8
});

/** An issuer's name: printable, no spaces, at most 200 characters. */
const ISSUER_NAME = /^[\x21-\x7e]{1,200}$/;

/** A JWT type (RFC 8725 3.11): a media type's subtype such as "psu+jwt". */
const TYP = /^[A-Za-z0-9][A-Za-z0-9.+-]{0,63}$/;

/** A key ID as the verifier looks it up. */
const KID = /^[A-Za-z0-9._-]{1,64}$/;

/** @type {Readonly<Partial<Record<import("./shared.js").Slot, Record<string, any>>>>} */
export const KEYS = Object.freeze({
    auth: {
        externalIssuers: { list: { object: { issuer: "string", typ: "string", maxMinutes: "integer", keys: { list: { object: { kid: "string", publicKey: SECRET_REF } } } } } }
    }
});

/**
 * Each issuer once, with a name and a type of its own (never the server's), one or two keys with
 * distinct IDs, and a lifetime of 1 to 1440 minutes; only with auth.mode "token" (or none written,
 * which a state directory makes "token").
 * @param {import("../config.js").ServerOptions} options
 */
export function validate(options) {
    const list = options.auth?.externalIssuers;
    if (!list) {
        return;
    }
    if (options.auth?.mode !== undefined && options.auth.mode !== "token") {
        throw new ConfigError(`auth.externalIssuers: works with auth.mode "token" only, not "${options.auth.mode}"`);
    }
    if (list.length > EXTERNAL_ISSUER.maxIssuers) {
        throw new ConfigError(`auth.externalIssuers: at most ${EXTERNAL_ISSUER.maxIssuers} issuers`);
    }
    const seen = new Set();
    for (const [i, entry] of list.entries()) {
        const at = `auth.externalIssuers[${i}]`;
        if (typeof entry.issuer !== "string" || !ISSUER_NAME.test(entry.issuer)) {
            throw new ConfigError(`${at}.issuer: the issuer's name as its tokens carry it in iss, printable without spaces, at most 200 characters`);
        }
        if (entry.issuer === SIGNED_TOKEN.issuer) {
            throw new ConfigError(`${at}.issuer: "${SIGNED_TOKEN.issuer}" is the server's own; give the other system a name of its own`);
        }
        if (seen.has(entry.issuer)) {
            throw new ConfigError(`${at}.issuer: "${entry.issuer}" is there twice; give one entry with up to ${EXTERNAL_ISSUER.maxKeys} keys`);
        }
        seen.add(entry.issuer);
        if (typeof entry.typ !== "string" || !TYP.test(entry.typ)) {
            throw new ConfigError(`${at}.typ: the type its tokens carry in their header, such as "psu+jwt"`);
        }
        if (entry.typ === SIGNED_TOKEN.typ) {
            throw new ConfigError(`${at}.typ: "${SIGNED_TOKEN.typ}" is the server's own; give the other system's tokens a type of their own`);
        }
        if (!Array.isArray(entry.keys) || entry.keys.length < 1 || entry.keys.length > EXTERNAL_ISSUER.maxKeys) {
            throw new ConfigError(`${at}.keys: one or two keys (two while the issuer changes its key)`);
        }
        const kids = new Set();
        for (const [k, key] of entry.keys.entries()) {
            if (typeof key.kid !== "string" || !KID.test(key.kid)) {
                throw new ConfigError(`${at}.keys[${k}].kid: the key's ID as the tokens name it in kid: letters, digits, ".", "_" and "-", at most 64`);
            }
            if (kids.has(key.kid)) {
                throw new ConfigError(`${at}.keys[${k}].kid: "${key.kid}" is there twice`);
            }
            kids.add(key.kid);
            if (!key.publicKey) {
                throw new ConfigError(`${at}.keys[${k}].publicKey: the issuer's Ed25519 public key in PEM, { "file": "path" } or { "env": "NAME" }`);
            }
        }
        if (entry.maxMinutes !== undefined && (entry.maxMinutes < 1 || entry.maxMinutes > EXTERNAL_ISSUER.maxMinutesLimit)) {
            throw new ConfigError(`${at}.maxMinutes: 1 to ${EXTERNAL_ISSUER.maxMinutesLimit}`);
        }
    }
}

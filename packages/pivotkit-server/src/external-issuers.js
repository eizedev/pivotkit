/*
 * Tokens another system issues for the person signed in there (auth.externalIssuers), such as
 * PowerShell Universal. The server holds only the issuer's public keys, so it can verify these tokens
 * and never mint them. auth.js accepts them in auth.mode "token" next to the static and the server's
 * own signed tokens, on REST and MCP alike.
 *
 *   header  { alg: "EdDSA", kid, typ: <the issuer's typ> }
 *   claims  { iss: <the issuer's name>, sub, jti, iat, exp, scope?, profile? }
 *
 * Each issuer has its own verifier (signed-tokens.js createSignedVerifier): its name, its type and
 * only its keys. A token of one issuer never passes as another's or as the server's own
 * ("pivotkit-server", "pivotkit+jwt", which no issuer may take). There is no deny list: such a token
 * lives at most maxMinutes. The keys are read at start; a new key takes a restart.
 */

import { createPublicKey } from "node:crypto";
import { decodeJwt } from "jose";
import { pathOf } from "./config.js";
import { readSecretFile, unreadable } from "./secrets.js";
import { SIGNED_TOKEN, createSignedVerifier } from "./signed-tokens.js";
import { ConfigError } from "./options/shared.js";
import { EXTERNAL_ISSUER } from "./options/external.js";

/** A token's ID (jti) from another issuer: letters, digits and . _ - up to 128. */
export const EXTERNAL_TOKEN_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** What an issuer's key file holds: a public key in PEM (SPKI). */
const PUBLIC_PEM = /-----BEGIN PUBLIC KEY-----/;

/** The most bytes of a public key file. */
const KEY_FILE_BYTES = 8192;

/**
 * Why a key's text is not an Ed25519 public key, or null.
 * @param {string} text
 * @returns {{ problem: string } | { key: import("node:crypto").KeyObject }}
 */
export function publicKeyOf(text) {
    if (/PRIVATE KEY-----/.test(text)) {
        return { problem: "holds a private key; give the issuer's public key only (the server must never be able to mint its tokens)" };
    }
    if (text.length > KEY_FILE_BYTES || !PUBLIC_PEM.test(text)) {
        return { problem: "is not an Ed25519 public key in PEM (-----BEGIN PUBLIC KEY-----)" };
    }
    let key;
    try {
        key = createPublicKey({ key: text, format: "pem" });
    } catch {
        return { problem: "is not an Ed25519 public key in PEM (-----BEGIN PUBLIC KEY-----)" };
    }
    if (key.asymmetricKeyType !== "ed25519") {
        return { problem: `is not an Ed25519 public key (it is ${key.asymmetricKeyType ?? "another kind"})` };
    }
    return { key };
}

/**
 * Reads an issuer's key: a file (relative to the configuration) or a variable, as PEM.
 * @param {{ env?: string, file?: string }} ref
 * @param {import("./config.js").ServerOptions} options
 * @param {Record<string, string | undefined>} env
 * @returns {Promise<{ problem: string } | { key: import("node:crypto").KeyObject }>}  problem: names where the key is
 */
export async function readPublicKey(ref, options, env) {
    const where = ref.env ? `$${ref.env}` : `the file ${ref.file}`;
    let text;
    if (ref.env) {
        text = env[ref.env];
        if (!text) {
            return { problem: `${where} is not set` };
        }
    } else {
        try {
            text = await readSecretFile(pathOf(options, /** @type {string} */ (ref.file)));
        } catch (e) {
            return { problem: `${where} cannot be read (${unreadable(/** @type {any} */ (e)?.code)})` };
        }
    }
    const read = publicKeyOf(text);
    return "problem" in read ? { problem: `${where} ${read.problem}` } : read;
}

/**
 * Why an issuer's entry gives a token that names no profile none the operator chose, or null: it
 * has no `profile` and auth.defaultProfile is unset. Such a token would fall to the sources' own
 * policy, which may show more than any profile. The start refuses it, and check-config says so.
 * @param {import("./config.js").ServerOptions} options
 * @param {number} i  the entry's index
 */
export function missingProfile(options, i) {
    const entry = options.auth?.externalIssuers?.[i];
    return entry && entry.profile === undefined && options.auth?.defaultProfile === undefined ? `auth.externalIssuers[${i}].profile: a token that names no profile needs a profile you chose; set the issuer's profile or auth.defaultProfile` : null;
}

/**
 * Every configured issuer's keys, read now. Throws ConfigError for the first key that cannot be used,
 * or an entry without a profile for tokens that name none (missingProfile): the server does not start.
 * @param {import("./config.js").ServerOptions} options
 * @param {Record<string, string | undefined>} env
 * @returns {Promise<Array<{ issuer: string, typ: string, maxMinutes: number, keys: Map<string, import("node:crypto").KeyObject> }>>}
 */
export async function loadExternalIssuers(options, env) {
    const out = [];
    for (const [i, entry] of (options.auth?.externalIssuers ?? []).entries()) {
        const missing = missingProfile(options, i);
        if (missing) {
            throw new ConfigError(missing);
        }
        const keys = new Map();
        for (const [k, { kid, publicKey }] of entry.keys.entries()) {
            const read = await readPublicKey(publicKey, options, env);
            if ("problem" in read) {
                throw new ConfigError(`auth.externalIssuers[${i}].keys[${k}]: ${read.problem}`);
            }
            keys.set(kid, read.key);
        }
        out.push({ issuer: entry.issuer, typ: entry.typ, maxMinutes: entry.maxMinutes ?? EXTERNAL_ISSUER.maxMinutes, keys });
    }
    return out;
}

/**
 * The verifier of the external issuers: a bearer to the claims of the issuer its unverified `iss`
 * names, verified with that issuer's keys, type and lifetime only. null when the token names no
 * configured issuer, so the caller tries the server's own signed tokens.
 * @param {Awaited<ReturnType<typeof loadExternalIssuers>>} issuers
 * @param {{ clockToleranceSec: number }} how
 */
export function externalVerifier(issuers, { clockToleranceSec }) {
    const verifiers = new Map(
        issuers.map((entry) => [
            entry.issuer,
            createSignedVerifier({ keyFor: async (kid) => entry.keys.get(kid) ?? null, isRevoked: async () => false, issuer: entry.issuer, typ: entry.typ, clockToleranceSec, maxLifetimeSec: entry.maxMinutes * 60, tokenId: EXTERNAL_TOKEN_ID })
        ])
    );
    return {
        /** The issuer a token names, when it is a configured one; the name only picks the verifier. */
        issuerOf(token) {
            let iss;
            try {
                iss = decodeJwt(token).iss;
            } catch {
                return null;
            }
            return typeof iss === "string" && iss !== SIGNED_TOKEN.issuer && verifiers.has(iss) ? iss : null;
        },
        /** @param {string} issuer @param {string} token */
        verify: (issuer, token) => /** @type {ReturnType<typeof createSignedVerifier>} */ (verifiers.get(issuer)).verify(token)
    };
}

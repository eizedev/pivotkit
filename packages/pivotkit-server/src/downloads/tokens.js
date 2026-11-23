/*
 * The download links' secrets: the HKDF subkeys of output.downloads.key, the signed token of a link,
 * the digest of the person it is for, and the signed cookie of the sign-ins and repeats under way.
 * Signatures are compared in constant time.
 *
 * - The token is `base64url(payload) "." base64url(HMAC-SHA256(tokenKey, base64url(payload)))`, the
 *   payload `{ v: 1, n, e, b, s? }`: n 16 random bytes (the stored file's name prefix), e the expiry
 *   in seconds, b the binding, s HMAC-SHA256(subjectKey, [n, issuer, subject]) for "signIn" (the
 *   nonce in it: two links of one person cannot be tied together). The keys are HKDF
 *   subkeys of output.downloads.key (a random key per process without one). The signature is checked
 *   first, in constant time: a forged token, an unknown one and one of another key get the same 404.
 */

import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { ConfigError } from "../options/shared.js";
import { makeKey } from "../auth.js";
import { readSecret } from "../secrets.js";

import { keyProblem } from "../secret-rules.js";

/** How long the same browser may repeat a one-time download, and how long a sign-in may take, in seconds. */
export const REPEAT_SECONDS = 120;
export const SIGN_IN_SECONDS = 600;

/** The most entries the cookie holds (parallel sign-ins and repeats); the oldest go first. */
const COOKIE_ENTRIES = 8;

/** A token as it may appear in a path: checked before anything else is done with it. */
export const TOKEN_SYNTAX = /^([A-Za-z0-9_-]{16,600})\.([A-Za-z0-9_-]{43})$/;

/** A nonce: 16 bytes in base64url. */
export const NONCE_SYNTAX = /^[A-Za-z0-9_-]{22}$/;

/** A digest in base64url (HMAC-SHA256). */
const DIGEST_SYNTAX = /^[A-Za-z0-9_-]{43}$/;

/** The purposes of the subkeys of output.downloads.key. */
const PURPOSES = Object.freeze({ token: "pivotkit downloads: token v1", subject: "pivotkit downloads: subject v1", cookie: "pivotkit downloads: cookie v1", upload: "pivotkit downloads: upload binding v1" });

/** base64url of a buffer or text. */
const b64 = (data) => Buffer.from(data).toString("base64url");

/** HMAC-SHA256 of a text under a key, in base64url. */
export const mac = (key, text) => createHmac("sha256", key).update(text).digest("base64url");

/** Whether two texts of the same form are equal, in a time that does not tell how close they are. */
export function sameText(a, b) {
    // digests of both: equal lengths for timingSafeEqual, whatever the inputs' lengths
    return timingSafeEqual(createHash("sha256").update(String(a)).digest(), createHash("sha256").update(String(b)).digest());
}

/**
 * The subkeys of a link key: one per purpose (HKDF), the upload target's person binding among them.
 * @param {Buffer} key
 * @returns {{ token: Buffer, subject: Buffer, cookie: Buffer, upload: Buffer }}
 */
export function subkeysOf(key) {
    const derive = (purpose) => Buffer.from(hkdfSync("sha256", key, Buffer.alloc(0), purpose, 32));
    return { token: derive(PURPOSES.token), subject: derive(PURPOSES.subject), cookie: derive(PURPOSES.cookie), upload: derive(PURPOSES.upload) };
}

/**
 * A signed token.
 * @param {{ token: Buffer }} keys
 * @param {{ n: string, e: number, b: "none" | "once" | "signIn", s?: string }} payload
 */
export function signToken(keys, payload) {
    const body = b64(JSON.stringify({ v: 1, n: payload.n, e: payload.e, b: payload.b, ...(payload.s ? { s: payload.s } : {}) }));
    return `${body}.${mac(keys.token, body)}`;
}

/**
 * The payload of a token whose signature holds, or null: the form first, then the signature in
 * constant time, then the payload's members (a token of another key, a forged one, an unknown one: null).
 * Expiry is the caller's to check (an expired link has its own answer).
 * @param {{ token: Buffer }} keys
 * @param {string} token
 * @returns {{ n: string, e: number, b: "none" | "once" | "signIn", s?: string } | null}
 */
export function readToken(keys, token) {
    const parts = typeof token === "string" ? TOKEN_SYNTAX.exec(token) : null;
    if (!parts || !sameText(mac(keys.token, parts[1]), parts[2])) {
        return null;
    }
    let payload;
    try {
        payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    } catch {
        return null;
    }
    const { v, n, e, b, s } = payload ?? {};
    const keys5 = Object.keys(payload ?? {});
    if (v !== 1 || typeof n !== "string" || !NONCE_SYNTAX.test(n) || b64(Buffer.from(n, "base64url")) !== n || !Number.isSafeInteger(e) || !["none", "once", "signIn"].includes(b) || keys5.some((k) => !["v", "n", "e", "b", "s"].includes(k))) {
        return null;
    }
    if (b === "signIn" ? typeof s !== "string" || !DIGEST_SYNTAX.test(s) : s !== undefined) {
        return null;
    }
    return { n, e, b, ...(b === "signIn" ? { s } : {}) };
}

/**
 * A person as the token holds them: an HMAC of the link's nonce, the issuer and the subject, so a
 * token tells nothing about who it is for, two links of one person carry different digests (they
 * cannot be tied to each other), and the same subject of another issuer is another person.
 * @param {{ subject: Buffer }} keys
 * @param {string} n  the link's nonce
 * @param {string} issuer
 * @param {string} subject
 */
// JSON of the list, not a separator: no nonce, issuer and subject can be cut differently to the same text
export const subjectDigest = (keys, n, issuer, subject) => mac(keys.subject, JSON.stringify([n, issuer, subject]));

/** How long a read of output.downloads.key is used before it is read again, in milliseconds. */
export const KEY_READ_MS = 1000;

/**
 * The keys of output.downloads.key, read again at most every KEY_READ_MS (a rotated secret works
 * without a restart, within a second; links of the old key stop working) and derived once per value;
 * a random key without one. A read, and a failed one, is shared by the requests in that time, so a
 * flood of links (forged ones too) does not read the file for each.
 * @param {import("../options/downloads.js").DownloadSettings} settings
 * @param {{ baseDir?: string }} options
 * @param {Record<string, string | undefined>} env
 */
export function keySource(settings, options, env) {
    if (!settings.key) {
        const keys = subkeysOf(randomBytes(32));
        return async () => keys;
    }
    let last = { value: "", keys: /** @type {any} */ (null) };
    const ref = settings.key;
    const read = async () => {
        const value = await readSecret(ref, options, env);
        const why = keyProblem("downloads")(value);
        if (why) {
            throw new ConfigError(`output.downloads.key (${ref.env ? `$${ref.env}` : `the file ${ref.file}`}) is ${why}; make one with: ${makeKey("downloads")}`);
        }
        if (value !== last.value) {
            last = { value, keys: subkeysOf(Buffer.from(value, "utf8")) };
        }
        return last.keys;
    };
    /** @type {{ at: number, keys: Promise<any> } | null} */
    let held = null;
    return () => {
        const now = Date.now();
        if (!held || now - held.at >= KEY_READ_MS) {
            held = { at: now, keys: read() };
        }
        return held.keys;
    };
}

/**
 * A signed map of short entries in one cookie: the sign-ins under way (by their state) and the
 * one-time downloads this browser may repeat (by their nonce). `__Host-` and Secure on https.
 */
export function cookieJar(keyOf, secure) {
    const name = secure ? "__Host-pivotkit-dl" : "pivotkit-dl";
    return {
        /** The entries of a request's cookie whose signature holds and that have not expired. */
        async read(request) {
            const header = request.headers.get("cookie") ?? "";
            const raw = header
                .split(";")
                .map((c) => c.trim())
                .find((c) => c.startsWith(`${name}=`))
                ?.slice(name.length + 1);
            const parts = raw && raw.length <= 4096 ? /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(raw) : null;
            if (!parts) {
                return {};
            }
            const keys = await keyOf();
            if (!sameText(mac(keys.cookie, parts[1]), parts[2])) {
                return {};
            }
            try {
                const map = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
                const now = Math.floor(Date.now() / 1000);
                return map && typeof map === "object" && !Array.isArray(map) ? Object.fromEntries(Object.entries(map).filter(([, v]) => v && typeof v === "object" && Number.isSafeInteger(v.x) && v.x > now)) : {};
            } catch {
                return {};
            }
        },
        /** The Set-Cookie header for a map of entries (the newest COOKIE_ENTRIES), or one that clears it. */
        async write(map) {
            const entries = Object.entries(map)
                .sort((a, b) => a[1].x - b[1].x)
                .slice(-COOKIE_ENTRIES);
            const attributes = `Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
            if (!entries.length) {
                return `${name}=; Max-Age=0; ${attributes}`;
            }
            const keys = await keyOf();
            const body = b64(JSON.stringify(Object.fromEntries(entries)));
            // as long as its last entry: REPEAT_SECONDS for a repeat alone, SIGN_IN_SECONDS with a sign-in under way
            const maxAge = Math.max(1, entries[entries.length - 1][1].x - Math.floor(Date.now() / 1000));
            return `${name}=${body}.${mac(keys.cookie, body)}; Max-Age=${maxAge}; ${attributes}`;
        }
    };
}

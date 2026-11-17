/*
 * Short-lived bearer tokens the server issues itself, without a sign-in provider: JWTs (RFC 7519)
 * signed with Ed25519 (alg EdDSA) through jose, typed "pivotkit+jwt" (RFC 8725 3.11), so no other
 * JWT is taken for one. auth.js accepts them in auth.mode "token" next to the static tokens, on REST
 * and MCP alike.
 *
 *   header  { alg: "EdDSA", kid, typ: "pivotkit+jwt" }
 *   claims  { iss: "pivotkit-server", jti, iat, nbf, exp, scope?, profile? }
 *
 * jti is the token's ID (16 lowercase hex): the log, `token list` and `token revoke` name it. A
 * missing scope means every scope, as a static token without scopes. The name a token was issued
 * with is kept in the register only.
 *
 * The directory (auth.signedTokens.dir, by default <state>/secrets/signed) holds, all 0600 in 0700
 * directories:
 *
 *   keys/<kid>.key        an Ed25519 private key, PKCS#8 DER in base64url, one line (placeSecret)
 *   issued/<id>.json      what `token issue` made: name, key, profile, scopes, issued, expires; no value
 *   revoked/<id>.json     the deny list: an entry refuses the token until it expires
 *
 * Every key verifies; the newest (kids sort by their UTC time) signs, so a new key rotates without
 * breaking tokens of the old one. One file per token: two commands at once lose nothing, and need
 * no lock. The server only reads: the keys at most once a second (at once for an unknown key, at
 * most once a second), the deny list on every request. The commands write and prune.
 *
 * createSignedVerifier is the verifier on its own: the keys come from a function, so a key held
 * elsewhere (an issuer's public key) can be verified the same way.
 */

import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes } from "node:crypto";
import { constants, lstat, mkdir, open, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { SignJWT, decodeProtectedHeader, jwtVerify } from "jose";
import { readSecretHandle, secretValue } from "./secrets.js";
import { placeSecret } from "./secret-file.js";

/** The fixed parts of a signed token, and its lifetimes. */
export const SIGNED_TOKEN = Object.freeze({
    issuer: "pivotkit-server",
    typ: "pivotkit+jwt",
    alg: "EdDSA",
    /** the lifetime without --expires: one hour */
    defaultSeconds: 3600,
    /** auth.signedTokens.maxDays without a value, and its highest value */
    maxDays: 30,
    maxDaysLimit: 365,
    /** the longest bearer tried as a signed token; `token issue` refuses to sign a longer one */
    maxLength: 2048,
    /** how often `token issue` removes records of expired tokens, at most */
    pruneMs: 3_600_000,
    /** how often the server reads the keys again, at most */
    reloadMs: 1000
});

/** A token's ID: 64 random bits in lowercase hex. A name in this form is refused. */
export const TOKEN_ID = /^[0-9a-f]{16}$/;

/** A key ID the verifier looks up: never a path, only a key of the loaded set. */
const KEY_ID = /^[A-Za-z0-9._-]{1,64}$/;

/** A key ID this server makes: k<UTC yyyymmddhhmmssSSS>-<4 hex>, so the newest sorts last. */
export const OWN_KEY_ID = /^k\d{17}-[0-9a-f]{4}$/;

/** A profile's name in a token: as policy.profiles names one. */
const PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** The directories inside the signed tokens' directory. */
export const SIGNED_PARTS = Object.freeze({ keys: "keys", issued: "issued", revoked: "revoked" });

/** Whether a bearer has a JWT's shape (three base64url parts) and length, so it is worth verifying. */
export const looksSigned = (token) => token.length <= SIGNED_TOKEN.maxLength && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);

/**
 * Why a signed token was refused: INVALID (shape, signature, type, issuer, claims), UNKNOWN_KEY,
 * EXPIRED, NOT_YET_VALID, TOO_LONG, REVOKED, or DENY_LIST (the deny list could not be read). The
 * message never holds the token.
 */
export class SignedTokenError extends Error {
    /**
     * @param {"INVALID" | "UNKNOWN_KEY" | "EXPIRED" | "NOT_YET_VALID" | "TOO_LONG" | "REVOKED" | "DENY_LIST"} code
     * @param {string} message
     */
    constructor(code, message) {
        super(message);
        this.name = "SignedTokenError";
        this.code = code;
        /** @type {string | undefined} the ID of a revoked token, which is genuinely signed */
        this.id = undefined;
    }
}

const refused = (code, message) => new SignedTokenError(code, message);

/**
 * @typedef {object} SignedClaims
 * @property {string} id  the token's ID (jti)
 * @property {string[] | null} scopes  null: every scope
 * @property {string | null} profile
 * @property {number} expiresAt  seconds since 1970
 */

/**
 * A verifier of signed tokens. Fails closed: a key that cannot be found, a claim of the wrong type
 * and a deny list that cannot be read all refuse.
 * @param {{ keyFor: (kid: string) => Promise<import("node:crypto").KeyObject | null>, isRevoked: (id: string) => Promise<boolean>, issuer: string, typ: string, clockToleranceSec: number, maxLifetimeSec: number, tokenId?: RegExp, now?: () => number }} how  tokenId: the form of a token's ID (jti), TOKEN_ID by default; another issuer may have its own
 * @returns {{ verify(token: string): Promise<SignedClaims> }}
 */
export function createSignedVerifier({ keyFor, isRevoked, issuer, typ, clockToleranceSec, maxLifetimeSec, tokenId = TOKEN_ID, now = Date.now }) {
    return {
        async verify(token) {
            if (!looksSigned(token)) {
                throw refused("INVALID", "not a signed token");
            }
            let header;
            try {
                header = decodeProtectedHeader(token);
            } catch {
                throw refused("INVALID", "the token's header cannot be read");
            }
            if (header.alg !== SIGNED_TOKEN.alg) {
                throw refused("INVALID", "the token's algorithm is not accepted");
            }
            const kid = typeof header.kid === "string" && KEY_ID.test(header.kid) ? header.kid : null;
            const key = kid ? await keyFor(kid).catch(() => null) : null;
            if (!key) {
                throw refused("UNKNOWN_KEY", "the token's key is not known");
            }
            const nowMs = now();
            let payload;
            try {
                ({ payload } = await jwtVerify(token, key, { algorithms: [SIGNED_TOKEN.alg], issuer, typ, clockTolerance: clockToleranceSec, requiredClaims: ["exp", "iat", "jti"], currentDate: new Date(nowMs) }));
            } catch (e) {
                if (e?.code === "ERR_JWT_EXPIRED") {
                    throw refused("EXPIRED", "the token expired");
                }
                if (e?.code === "ERR_JWT_CLAIM_VALIDATION_FAILED" && (e.claim === "nbf" || e.claim === "iat")) {
                    throw refused("NOT_YET_VALID", "the token is not valid yet (check the clocks)");
                }
                throw refused("INVALID", "the token is not valid");
            }
            const iat = /** @type {number} */ (payload.iat);
            const exp = /** @type {number} */ (payload.exp);
            // jose checks iat only for a type; a token from a clock ahead is refused here, as nbf is
            if (iat > nowMs / 1000 + clockToleranceSec) {
                throw refused("NOT_YET_VALID", "the token is not valid yet (check the clocks)");
            }
            if (exp - iat > maxLifetimeSec) {
                throw refused("TOO_LONG", "the token lives longer than the server allows");
            }
            const id = payload.jti;
            if (typeof id !== "string" || !tokenId.test(id)) {
                throw refused("INVALID", "the token's ID is not valid");
            }
            // a claim that is there must be right: a broken scope never becomes every scope
            const scope = payload.scope;
            if (scope !== undefined && typeof scope !== "string") {
                throw refused("INVALID", "the token's scope is not valid");
            }
            const profile = payload.profile;
            if (profile !== undefined && (typeof profile !== "string" || !PROFILE_NAME.test(profile))) {
                throw refused("INVALID", "the token's profile is not valid");
            }
            let denied;
            try {
                denied = await isRevoked(id);
            } catch {
                throw refused("DENY_LIST", "the deny list cannot be read");
            }
            if (denied) {
                // the ID of a genuinely signed token: the log may name it
                throw Object.assign(refused("REVOKED", "the token was revoked"), { id });
            }
            return { id, scopes: scope === undefined ? null : scope.split(/\s+/).filter(Boolean), profile: profile ?? null, expiresAt: exp };
        }
    };
}

/**
 * A file opened without following a symbolic link: O_NOFOLLOW where the system has it; elsewhere
 * (Windows) a link found by lstat first is refused (ELOOP).
 * @param {string} path
 * @param {number} flags
 * @param {number} [mode]
 */
async function openNoFollow(path, flags, mode) {
    if (constants.O_NOFOLLOW === undefined) {
        if ((await lstat(path).catch(() => null))?.isSymbolicLink()) {
            throw Object.assign(new Error("a symbolic link"), { code: "ELOOP" });
        }
        return open(path, flags, mode);
    }
    return open(path, flags | constants.O_NOFOLLOW, mode);
}

/**
 * Why an opened key file is not used, or null: not a regular file; on POSIX, any bit for the group
 * or others, or another owner than the user the server runs as. With the fix, for the messages.
 * @param {import("node:fs").Stats} info
 * @param {string} path
 * @returns {{ problem: string, fix: string | null } | null}
 */
function keyFileProblem(info, path) {
    if (!info.isFile()) {
        return { problem: "not a regular file", fix: null };
    }
    if (process.platform === "win32") {
        return null;
    }
    if (info.mode & 0o077) {
        return { problem: `readable by the group or others (mode ${(info.mode & 0o777).toString(8).padStart(4, "0")}, for example after a restore with another umask or on a bind mount)`, fix: `chmod 600 ${path}` };
    }
    const uid = process.getuid?.();
    if (uid !== undefined && info.uid !== uid) {
        return { problem: `owned by the user ${info.uid}, not ${uid} that the server runs as`, fix: `chown ${uid} ${path}` };
    }
    return null;
}

/**
 * A key file's text, read in one step from one handle: opened without following a link, checked
 * (keyFileProblem), then read (secrets.js readSecretHandle). Or why it is not used.
 * @param {string} path
 * @returns {Promise<string | { problem: string, fix: string | null }>}
 */
async function readKeyFile(path) {
    let handle;
    try {
        handle = await openNoFollow(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
    } catch (e) {
        return e?.code === "ELOOP" ? { problem: "a symbolic link (a key is a file of its own)", fix: `remove it: pivotkit-server key remove ${basename(path, ".key")} --for signing` } : { problem: `cannot be read (${e?.code ?? "UNREADABLE"})`, fix: null };
    }
    try {
        const why = keyFileProblem(await handle.stat(), path);
        return why ?? (await readSecretHandle(handle)).text;
    } catch (e) {
        return { problem: `cannot be read (${e?.code ?? "UNREADABLE"})`, fix: null };
    } finally {
        await handle.close();
    }
}

/**
 * The key of a key file's value, or why it cannot be used: an Ed25519 private key in PKCS#8 DER,
 * base64url.
 * @param {string} value
 * @returns {{ key: import("node:crypto").KeyObject } | { problem: string }}
 */
function privateKeyOf(value) {
    try {
        const key = createPrivateKey({ key: Buffer.from(value, "base64url"), format: "der", type: "pkcs8" });
        return key.asymmetricKeyType === "ed25519" ? { key } : { problem: "not an Ed25519 key" };
    } catch {
        return { problem: "not a private key" };
    }
}

/** Why a signing key's value cannot be used, or null (placeSecret's check). */
export const signingKeyProblem = (value) => {
    const r = privateKeyOf(value);
    return "problem" in r ? r.problem : null;
};

/**
 * @typedef {object} IssuedRecord  what the register keeps of a token; never its value
 * @property {string} id
 * @property {string | null} name
 * @property {string} kid
 * @property {string | null} profile
 * @property {string[] | null} scopes
 * @property {string} issuedAt  ISO 8601
 * @property {string} expiresAt  ISO 8601
 */

/**
 * The signed tokens' directory: its keys, register and deny list.
 * @param {string} dir  absolute
 * @param {{ now?: () => number }} [how]
 */
export function signedStore(dir, { now = Date.now } = {}) {
    const part = (name) => join(dir, SIGNED_PARTS[name]);
    const recordPath = (sub, id) => {
        if (!TOKEN_ID.test(id)) {
            throw new TypeError("not a token ID");
        }
        return join(part(sub), `${id}.json`);
    };

    /**
     * The keys of keys/, by kid, and the files that cannot be used (never their values). A missing
     * directory has none; one that cannot be read throws. For this server's own private keys only:
     * a key held elsewhere (an issuer's public key) comes to the verifier through its own keyFor.
     * A key file is checked on the handle it is read from (keyFileProblem), so it cannot change
     * between the check and the read. One that fails is skipped, and its kid is in `skipped`.
     * @returns {Promise<{ keys: Map<string, { private: import("node:crypto").KeyObject, public: import("node:crypto").KeyObject, path: string }>, problems: string[], skipped: Set<string> }>}
     */
    async function loadKeys() {
        const names = await readdir(part("keys")).catch((e) => (e?.code === "ENOENT" ? [] : Promise.reject(e)));
        const keys = new Map();
        const problems = [];
        const skipped = new Set();
        for (const name of names.sort()) {
            const kid = name.endsWith(".key") ? name.slice(0, -4) : "";
            if (!OWN_KEY_ID.test(kid)) {
                continue;
            }
            const path = join(part("keys"), name);
            const text = await readKeyFile(path);
            const read = typeof text === "string" ? privateKeyOf(secretValue(text, "key")) : text;
            if ("problem" in read) {
                const fix = "fix" in read ? read.fix : null;
                problems.push(`${path}: ${read.problem}; skipped, so its tokens get 401${fix ? `: ${fix}` : ""}`);
                skipped.add(kid);
                continue;
            }
            keys.set(kid, { private: read.key, public: createPublicKey(read.key), path });
        }
        return { keys, problems, skipped };
    }

    /** The register's records, parsed; a file that is not one is skipped. @returns {Promise<IssuedRecord[]>} */
    async function issued() {
        const names = await readdir(part("issued")).catch((e) => (e?.code === "ENOENT" ? [] : Promise.reject(e)));
        const out = [];
        for (const name of names) {
            const id = name.slice(0, -5);
            if (!name.endsWith(".json") || !TOKEN_ID.test(id)) {
                continue;
            }
            try {
                const record = JSON.parse(await readFile(join(part("issued"), name), "utf8"));
                if (record?.id === id && typeof record.expiresAt === "string") {
                    out.push(record);
                }
            } catch {
                // a record cut by a crash: the token still verifies, it is only not listed
            }
        }
        return out.sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
    }

    /** The deny list's IDs with when each entry may go. @returns {Promise<Map<string, number>>} */
    async function revokedIds() {
        const names = await readdir(part("revoked")).catch((e) => (e?.code === "ENOENT" ? [] : Promise.reject(e)));
        const out = new Map();
        for (const name of names) {
            const id = name.slice(0, -5);
            if (name.endsWith(".json") && TOKEN_ID.test(id)) {
                const until = await readFile(join(part("revoked"), name), "utf8").then((t) => Date.parse(JSON.parse(t).expiresAt), () => NaN);
                out.set(id, Number.isFinite(until) ? until : Infinity);
            }
        }
        return out;
    }

    /** Makes the directory and its parts (0700); its parent must be there. `parents` may be made first (the state's secrets/). */
    async function ensureDirs(parents = []) {
        for (const d of [...parents, dir, part("keys"), part("issued"), part("revoked")]) {
            await mkdir(d, { mode: 0o700 }).catch((e) => (e?.code === "EEXIST" ? undefined : Promise.reject(e)));
        }
    }

    /** A new signing key in keys/ (placeSecret: 0600, never over a file that is there). @returns {Promise<string>} its kid */
    async function newKey() {
        // after every key there, also one made in the same millisecond or by a clock set back
        const last = [...(await loadKeys()).keys.keys()].sort().at(-1);
        const after = last ? Date.UTC(+last.slice(1, 5), +last.slice(5, 7) - 1, +last.slice(7, 9), +last.slice(9, 11), +last.slice(11, 13), +last.slice(13, 15), +last.slice(15, 18)) + 1 : -Infinity;
        const stamp = new Date(Math.max(now(), after)).toISOString().replace(/[-:T.Z]/g, "");
        const kid = `k${stamp}-${randomBytes(2).toString("hex")}`;
        const value = generateKeyPairSync("ed25519").privateKey.export({ format: "der", type: "pkcs8" }).toString("base64url");
        await placeSecret(join(part("keys"), `${kid}.key`), value, { usable: signingKeyProblem, kind: "key" });
        return kid;
    }

    /** The keys directory's change time, NaN when it is not there. */
    const keysStamp = () => stat(part("keys")).then((i) => i.mtimeMs, (e) => (e?.code === "ENOENT" ? NaN : Promise.reject(e)));

    return {
        dir,
        loadKeys,
        keysStamp,
        /** Whether the keys directory changed since `stamp` (NaN: never read, or not there then). */
        keysChanged: (stamp) => keysStamp().then((now) => !Object.is(now, stamp), () => true),
        issued,
        revokedIds,
        ensureDirs,
        newKey,

        /** Whether a token's ID is on the deny list: one stat; an error other than "not there" throws (the verifier refuses then). */
        async isRevoked(id) {
            return stat(recordPath("revoked", id)).then(
                () => true,
                (e) => (e?.code === "ENOENT" ? false : Promise.reject(e))
            );
        },

        /**
         * Signs a token with the newest key (made first when there is none) and keeps its record.
         * @param {{ name: string | null, profile: string | null, scopes: string[] | null, expiresAt: number }} what  expiresAt: seconds since 1970
         * @returns {Promise<{ token: string, record: IssuedRecord, problems: string[] }>}  problems: key files that were not used
         */
        async issue({ name, profile, scopes, expiresAt }) {
            let { keys, problems } = await loadKeys();
            if (!keys.size) {
                await newKey();
                ({ keys, problems } = await loadKeys());
            }
            const kid = [...keys.keys()].sort().at(-1);
            const signing = /** @type {any} */ (keys.get(/** @type {string} */ (kid)));
            const id = randomBytes(8).toString("hex");
            const iat = Math.floor(now() / 1000);
            const claims = { jti: id, ...(scopes ? { scope: scopes.join(" ") } : {}), ...(profile ? { profile } : {}) };
            const token = await new SignJWT(claims).setProtectedHeader({ alg: SIGNED_TOKEN.alg, kid, typ: SIGNED_TOKEN.typ }).setIssuer(SIGNED_TOKEN.issuer).setIssuedAt(iat).setNotBefore(iat).setExpirationTime(expiresAt).sign(signing.private);
            // the verifier tries no longer bearer (looksSigned): such a token would never work
            if (token.length > SIGNED_TOKEN.maxLength) {
                throw new SignedTokenError("TOO_LONG", `the token would have ${token.length} characters, and the server takes at most ${SIGNED_TOKEN.maxLength}`);
            }
            /** @type {IssuedRecord} */
            const record = { id, name, kid: /** @type {string} */ (kid), profile, scopes, issuedAt: new Date(iat * 1000).toISOString(), expiresAt: new Date(expiresAt * 1000).toISOString() };
            await writeFile(recordPath("issued", id), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx", mode: 0o600 });
            return { token, record, problems };
        },

        /**
         * Puts a token on the deny list until `expiresAt` (ms). Whether it was there already.
         * @param {string} id
         * @param {number} expiresAt
         */
        async revoke(id, expiresAt) {
            const entry = { id, revokedAt: new Date(now()).toISOString(), expiresAt: new Date(expiresAt).toISOString() };
            return writeFile(recordPath("revoked", id), `${JSON.stringify(entry, null, 2)}\n`, { flag: "wx", mode: 0o600 }).then(
                () => false,
                (e) => (e?.code === "EEXIST" ? true : Promise.reject(e))
            );
        },

        /** Drops a token's record from the register (after it is revoked). */
        async forget(id) {
            await unlink(recordPath("issued", id)).catch((e) => (e?.code === "ENOENT" ? undefined : Promise.reject(e)));
        },

        /** Removes a key file. */
        async removeKey(kid) {
            if (!OWN_KEY_ID.test(kid)) {
                throw new TypeError("not a key ID");
            }
            await unlink(join(part("keys"), `${kid}.key`));
        },

        /**
         * prune, at most once every SIGNED_TOKEN.pruneMs: a marker file's change time says when it last ran.
         * @param {number} graceSec
         */
        async pruneSometimes(graceSec) {
            const marker = join(dir, ".pruned");
            const last = await lstat(marker).then((i) => i.mtimeMs, () => -Infinity);
            // a time in the future (a clock set back, a touched file) counts as stale
            if (last <= now() && now() - last < SIGNED_TOKEN.pruneMs) {
                return;
            }
            await this.prune(graceSec);
            const at = new Date(now());
            // never through a link: it would empty the file it points to; a marker that cannot be
            // written only means the next run prunes again
            const handle = await openNoFollow(marker, constants.O_WRONLY | constants.O_CREAT, 0o600).catch(() => null);
            if (handle) {
                await handle.utimes(at, at).finally(() => handle.close());
            }
        },

        /** Removes records and deny-list entries of tokens that expired more than `graceSec` ago. */
        async prune(graceSec) {
            const cut = now() - graceSec * 1000;
            for (const r of await issued()) {
                if (Date.parse(r.expiresAt) < cut) {
                    await unlink(recordPath("issued", r.id)).catch(() => undefined);
                }
            }
            for (const [id, until] of await revokedIds()) {
                if (until < cut) {
                    await unlink(recordPath("revoked", id)).catch(() => undefined);
                }
            }
        }
    };
}

/**
 * The keys of a signed tokens' directory as the server reads them, lazily on a request: again when
 * the keys directory changed since the last read (one stat per request), so a key the command made
 * or removed in another process counts from the next request; and when the last read is
 * SIGNED_TOKEN.reloadMs old, for a change the directory does not show. Reads at the same time share
 * one. No timer.
 * @param {ReturnType<typeof signedStore>} store
 * @param {{ now?: () => number, onProblem?: (text: string) => void }} [how]  onProblem: on every read that finds one; the caller limits how often it logs
 * @returns {(kid: string) => Promise<import("node:crypto").KeyObject | null>}
 */
export function keyring(store, { now = Date.now, onProblem = () => undefined } = {}) {
    /** @type {Map<string, any>} */
    let keys = new Map();
    let loadedAt = -Infinity;
    /** the keys directory's change time at the last read */
    let seen = NaN;
    /** @type {Promise<void> | null} */
    let inflight = null;
    const changed = () => store.keysChanged(seen);
    const load = () =>
        (inflight ??= store
            .keysStamp()
            .then(async (stamp) => {
                const { keys: k, problems } = await store.loadKeys();
                keys = k;
                seen = stamp;
                for (const p of problems) {
                    onProblem(p);
                }
            })
            .catch((e) => {
                // a directory that cannot be read: no key, so every signed token is refused
                keys = new Map();
                seen = NaN;
                onProblem(`${store.dir}: the keys cannot be read (${String(e?.code ?? e?.message ?? e).slice(0, 60)})`);
            })
            .finally(() => {
                loadedAt = now();
                inflight = null;
            }));
    return async (kid) => {
        if (now() - loadedAt >= SIGNED_TOKEN.reloadMs || (await changed())) {
            await load();
        }
        return keys.get(kid)?.public ?? null;
    };
}

/**
 * When a token expires, from `--expires` or auth.tokens[].expires, in ms since 1970: a duration
 * (15m, 8h, 7d) from `nowMs`, a date (2027-01-31: 00:00 UTC that day) or a date-time with a zone
 * (2027-01-31T08:00:00Z, +01:00). null for anything else, a date that does not exist too.
 * @param {string} text
 * @param {{ nowMs?: number, durations?: boolean }} [how]  durations: false for the configuration, which takes a date only
 * @returns {number | null}
 */
export function expiryOf(text, { nowMs = Date.now(), durations = true } = {}) {
    const duration = /^(\d{1,6})(m|h|d)$/.exec(text);
    if (duration) {
        return durations && Number(duration[1]) > 0 ? nowMs + Number(duration[1]) * { m: 60_000, h: 3_600_000, d: 86_400_000 }[duration[2]] : null;
    }
    const m = /^(\d{4}-\d{2}-\d{2})(T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(text);
    if (!m) {
        return null;
    }
    const day = Date.parse(`${m[1]}T00:00:00Z`);
    // a date that does not exist (2027-02-30) does not read back as itself
    if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== m[1]) {
        return null;
    }
    // a time that does not exist (25:00) parses as NaN: refused, never a token that does not expire
    const at = m[2] ? Date.parse(text) : day;
    return Number.isFinite(at) ? at : null;
}

/*
 * The server's own download links: a report that gets a link (delivery.js decides which) is served
 * under http.publicUrl + /downloads/<token> until the link expires. One state per context (the key,
 * the sign-in issuer), shared by every front end that mounts the route (serve.js, pivotkit-mcp's
 * http.js), so a link minted by one is opened by the other.
 *
 * - The token is `base64url(payload) "." base64url(HMAC-SHA256(tokenKey, base64url(payload)))`, the
 *   payload `{ v: 1, n, e, b, s? }`: n 16 random bytes (the stored file's name prefix), e the expiry
 *   in seconds, b the binding, s HMAC-SHA256(subjectKey, [n, issuer, subject]) for "signIn" (the
 *   nonce in it: two links of one person cannot be tied together). The keys are HKDF
 *   subkeys of output.downloads.key (a random key per process without one). The signature is checked
 *   first, in constant time: a forged token, an unknown one and one of another key get the same 404.
 * - "none": GET and HEAD send the file. "once": GET and HEAD answer a page with a button; its POST
 *   sends the file once (an exclusive marker in the output directory, so replicas on a shared
 *   directory agree); the same browser may repeat it for two minutes. "signIn": GET signs the person
 *   in at the issuer (code flow, PKCE, state, nonce) and the callback sends the file only to the
 *   person whose subject the token holds. The issuer's metadata, keys and token endpoint are
 *   requested through issuer.js, under the rules of auth.issuer (signIn.issuer is auth.issuer).
 * - Nothing here logs a token, a code, a state, a cookie or a path.
 */

import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { access, link as hardLink, mkdir, open, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ConfigError } from "./options/shared.js";
import { DEFAULT_ALGORITHMS } from "./config.js";
import { insecurePublicHost, insecureUrlText, settingsOf } from "./options/downloads.js";
import { subjectOf } from "./auth.js";
import { discover, ISSUER_LIMITS, issuerFetch, issuerHint, issuerRulesOf, jwksUriOf, remoteKeySet } from "./issuer.js";
import { allowedHosts, hostRefusal } from "./checks.js";
import { isLoopback } from "./listen.js";
import { OUTPUT_MARK, outputDir } from "./output.js";
import { newRequestId, requestId, withRequestId } from "./request-id.js";
import { readSecret } from "./secrets.js";
import { typeOf } from "./rest/problem.js";

/** Where the route lives. */
export const DOWNLOADS_PATH = "/downloads";

/** Where the sign-in returns. */
export const CALLBACK_PATH = `${DOWNLOADS_PATH}/callback`;

/** The largest body a download request may carry (the one-time link's form sends none). */
export const DOWNLOAD_BODY_BYTES = 1024;

/** The least length of output.downloads.key, in bytes. */
export const KEY_MIN_BYTES = 32;

/** How long the same browser may repeat a one-time download, and how long a sign-in may take, in seconds. */
export const REPEAT_SECONDS = 120;
export const SIGN_IN_SECONDS = 600;

/** The most entries the cookie holds (parallel sign-ins and repeats); the oldest go first. */
const COOKIE_ENTRIES = 8;

/** A token as it may appear in a path: checked before anything else is done with it. */
const TOKEN_SYNTAX = /^([A-Za-z0-9_-]{16,600})\.([A-Za-z0-9_-]{43})$/;

/** A nonce: 16 bytes in base64url. */
const NONCE_SYNTAX = /^[A-Za-z0-9_-]{22}$/;

/** A digest in base64url (HMAC-SHA256). */
const DIGEST_SYNTAX = /^[A-Za-z0-9_-]{43}$/;

/** The purposes of the subkeys of output.downloads.key. */
const PURPOSES = Object.freeze({ token: "pivotkit downloads: token v1", subject: "pivotkit downloads: subject v1", cookie: "pivotkit downloads: cookie v1", upload: "pivotkit downloads: upload binding v1" });

/** The headers every answer of the route carries. */
const BASE_HEADERS = Object.freeze({ "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex", "x-content-type-options": "nosniff", "cross-origin-resource-policy": "same-origin" });

/**
 * The pages' own style and script, allowed by their hashes and nothing else. Both are the same text on
 * every page (nothing of a request in them). Colours: text, the muted text and the button's text on
 * its background reach 4.5:1 in both schemes (tests/browser/download-link.spec.js measures them); the
 * focus ring is the accent, 3:1 or more against the page. The script writes a `<time>` in the
 * browser's own zone and, after the click, says that the download started and how long it can be
 * repeated.
 */
const PAGE_STYLE = ":root{color-scheme:light dark;--fg:#1f2328;--bg:#fff;--muted:#59636e;--accent:#0969da;--on-accent:#fff}@media (prefers-color-scheme:dark){:root{--fg:#e6edf3;--bg:#0d1117;--muted:#9198a1;--accent:#4493f8;--on-accent:#0d1117}}body{font:16px/1.5 system-ui,sans-serif;color:var(--fg);background:var(--bg);max-width:36rem;margin:3rem auto;padding:0 1rem;overflow-wrap:anywhere}.brand{color:var(--muted);font-size:.875rem;margin:0}h1{font-size:1.5rem;margin:.25rem 0 1rem}.file{font-weight:600;margin:0}button{font:inherit;min-height:2.75rem;padding:.5rem 1.25rem;border:0;border-radius:6px;background:var(--accent);color:var(--on-accent);cursor:pointer}button:focus-visible{outline:3px solid var(--accent);outline-offset:3px}[role=status]{min-height:1.5em}.ref{color:var(--muted);font-size:.875rem}";
const PAGE_SCRIPT = `for(const t of document.querySelectorAll('time[datetime]')){t.textContent=new Date(t.dateTime).toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'})}document.querySelector('form')?.addEventListener('submit',()=>{document.getElementById('status').textContent='Downloaded once. You can repeat it for ${REPEAT_SECONDS / 60} minutes, in this browser.';document.getElementById('until')?.remove()});`;
const hashOf = (text) => `'sha256-${createHash("sha256").update(text).digest("base64")}'`;
const PAGE_CSP = `default-src 'none'; style-src ${hashOf(PAGE_STYLE)}; script-src ${hashOf(PAGE_SCRIPT)}; form-action 'self'; frame-ancestors 'none'`;
const FILE_CSP = "sandbox; default-src 'none'";

/** The media types of the files pivotkit writes, by extension. */
const MEDIA_TYPES = Object.freeze({ xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", html: "text/html; charset=utf-8", csv: "text/csv; charset=utf-8", json: "application/json", svg: "image/svg+xml" });

/** A stored name of pivotkit's (a report or a draft) with a link's prefix. */
const LINKED_NAME = new RegExp(`^([A-Za-z0-9_-]{22})-(.+)\\.${OUTPUT_MARK}\\.((?:report\\.)?(xlsx|html|csv|json|svg))$`);

/** How a page writes a duration of whole minutes. */
const minutesText = (seconds) => `${seconds / 60} minutes`;

/**
 * The answers of the route that are not a file: their status, the page's heading (also its title) and
 * the words of the page and the problem. An entry with `code` answers under that code with words of
 * its own (a problem's `code` is part of the contract; the words are not).
 */
const ANSWERS = Object.freeze({
    NOT_FOUND: { status: 404, heading: "Link not found", text: "There is no such link. Check that the whole link was copied." },
    LINK_EXPIRED: { status: 410, heading: "Link expired", text: "This link has expired. Ask whoever made the report to make it again." },
    REPORT_REMOVED: { status: 410, code: "LINK_EXPIRED", heading: "Report removed", text: "The report was removed from the server before the link expired. Ask whoever made the report to make it again." },
    LINK_USED: { status: 409, heading: "Link already used", text: "This link was already used. If you downloaded the report earlier, look in the downloads of the browser you used. Otherwise ask whoever made the report to make it again." },
    LINK_NOT_YOURS: { status: 403, heading: "Signed in as someone else", text: "You are signed in as a different account than the one that asked for this report. To get it, open the download link you were sent once more and sign in with that account." },
    SIGN_IN_FAILED: { status: 400, heading: "Sign-in failed", text: "The sign-in did not complete. Open the download link you were sent once more (not this page) to try again." },
    SIGN_IN_DENIED: { status: 400, code: "SIGN_IN_FAILED", heading: "Not signed in", text: "You were not signed in. The sign-in was cancelled or the sign-in service refused it. To get the report, open the download link you were sent once more and sign in." },
    SIGN_IN_STALE: { status: 400, code: "SIGN_IN_FAILED", heading: "Sign-in page out of date", text: `This sign-in was already used, is older than ${minutesText(SIGN_IN_SECONDS)}, or was started in another browser. Open the download link you were sent once more, in this browser.` },
    SIGN_IN_NOT_READY: { status: 503, heading: "Sign-in not ready", text: "The server is waiting for its sign-in service. Try again in a moment." },
    FORBIDDEN_ORIGIN: { status: 403, heading: "Download not started from its page", text: "This download must be started from its own page. Open the download link once more and press Download there." },
    FORBIDDEN_HOST: { status: 403, heading: "Address not served", text: "This address is not served here." },
    METHOD_NOT_ALLOWED: { status: 405, heading: "Open the link in a browser", text: "This link is opened in a browser." },
    BODY_TOO_LARGE: { status: 413, heading: "Request too large", text: "The request is larger than a download takes." },
    INTERNAL: { status: 500, heading: "Download failed", text: "The download failed. Try again; if it keeps failing, tell the operator and give them the request id." }
});

/** What a page calls a report's file, by extension. */
const FILE_KINDS = Object.freeze({ xlsx: "Excel workbook", html: "HTML report", csv: "CSV file", json: "JSON file", svg: "SVG image" });

/** A file's size as a page writes it: bytes, KB or MB (of 1024), one decimal below 10. */
export function sizeText(bytes) {
    if (bytes < 1024) {
        return bytes === 1 ? "1 byte" : `${bytes} bytes`;
    }
    const [value, unit] = bytes < 1024 * 1024 ? [bytes / 1024, "KB"] : [bytes / (1024 * 1024), "MB"];
    return `${value < 10 ? Math.round(value * 10) / 10 : Math.round(value)} ${unit}`;
}

/** A time (seconds) as a `<time>` element: UTC in the page, the browser's own zone once its script ran. */
function timeHtml(seconds) {
    const iso = new Date(seconds * 1000).toISOString();
    return `<time datetime="${iso}">${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC</time>`;
}

/** base64url of a buffer or text. */
const b64 = (data) => Buffer.from(data).toString("base64url");

/** HMAC-SHA256 of a text under a key, in base64url. */
const mac = (key, text) => createHmac("sha256", key).update(text).digest("base64url");

/** Whether two texts of the same form are equal, in a time that does not tell how close they are. */
function sameText(a, b) {
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

/** The name a person sees for a stored name: without the link's prefix and pivotkit's mark. */
export function filenameOf(stored) {
    const linked = LINKED_NAME.exec(stored);
    const name = linked ? `${linked[2]}.${linked[3]}` : stored;
    return name.replace(`.${OUTPUT_MARK}.`, ".");
}

/**
 * Content-Disposition for a file name: an ASCII fallback and the UTF-8 name (RFC 6266, RFC 8187),
 * with line breaks, quotes and backslashes taken out.
 * @param {string} name
 */
export function dispositionOf(name) {
    // control characters (line breaks among them), quotes and backslashes out
    const clean = [...name].filter((c) => c.charCodeAt(0) > 0x1f && c.charCodeAt(0) !== 0x7f && c !== '"' && c !== "\\").join("");
    const ascii = clean.replace(/[^\x20-\x7e]/g, "_") || "report";
    const encoded = encodeURIComponent(clean).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** How often the markers of expired one-time links are swept: ten minutes. */
const MARKER_SWEEP_MS = 600_000;

/** A marker of a used one-time link: its nonce. */
const MARKER_NAME = /^[A-Za-z0-9_-]{22}\.used$/;

/** A marker being written: its name before it is linked into place. */
const MARKER_TEMP = /^\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+\.tmp$/;

/**
 * Marks a one-time link used: the expiry is written whole to a file of its own, then linked to the
 * marker's name, which fails when the marker exists (on a shared directory too), so of two requests
 * one wins and a marker never exists without its content. Throws EEXIST for a used link.
 * @param {string} marker
 * @param {number} expiry  seconds
 */
export async function placeMarker(marker, expiry) {
    const name = marker.split(/[\\/]/).pop() ?? "";
    const temp = join(marker, "..", `.${name.replace(/\.used$/, "")}.${randomBytes(6).toString("base64url")}.tmp`);
    await writeFile(temp, `${expiry}\n`, { flag: "wx", mode: 0o600 });
    try {
        await hardLink(temp, marker);
    } finally {
        await unlink(temp).catch(() => undefined);
    }
}

/**
 * Deletes the markers whose link has expired. A marker whose content is not a time (another
 * writer's, damaged) is never deleted: a used link stays used. Temporary files of a write that
 * died are deleted after an hour.
 * @param {string} dir  the markers' directory
 * @param {number} [now]  seconds
 */
export async function sweepMarkers(dir, now = Math.floor(Date.now() / 1000)) {
    for (const name of await readdir(dir).catch(() => [])) {
        const path = join(dir, name);
        if (MARKER_NAME.test(name)) {
            const text = (await readFile(path, "utf8").catch(() => "")).trim();
            if (/^\d{1,12}$/.test(text) && Number(text) < now) {
                await unlink(path).catch(() => undefined);
            }
        } else if (MARKER_TEMP.test(name)) {
            const info = await stat(path).catch(() => null);
            if (info && info.mtimeMs < now * 1000 - 3_600_000) {
                await unlink(path).catch(() => undefined);
            }
        }
    }
}

/**
 * Whether any report can get a link: a source whose fields are all shown, or a binding for closed ones.
 * @param {{ bind: string }} settings
 * @param {Array<{ closed?: boolean }>} sources  registry.check()'s
 */
export const linkingFor = (settings, sources) => sources.some((s) => s.closed === false) || settings.bind !== "none";

/** The state of each context's links. */
const states = new WeakMap();

/**
 * The links of a context, for delivery.js: null where no link can be given (no route mounted, the
 * links off, no address to put in them yet); otherwise how closed sources are bound and `signer()`,
 * which reads the key and gives a function that mints a link for a stored file's nonce (null, with a
 * warning on the log, when the key cannot be read: then the report gets no link, decided before the
 * file is written).
 * @param {any} context
 * @returns {{ bind: "signIn" | "once" | "none", expiresMinutes: number, signer(): Promise<((how: { n: string, bound: "none" | "once" | "signIn", subject?: string | null, issuer?: string | null }) => { url: string, expiresAt: string } | null) | null> } | null}
 */
export function linksOf(context) {
    const state = states.get(context);
    if (!state || !state.settings.enabled || !state.base || !outputDir(context)) {
        return null;
    }
    return {
        bind: state.settings.bind,
        expiresMinutes: state.settings.expiresMinutes,
        async signer() {
            const keys = await state.keys().catch((e) => {
                context.log.warn(`download links: the key cannot be read, so the report gets no link: ${String(e?.message ?? e).slice(0, 200)}`);
                return null;
            });
            if (!keys) {
                return null;
            }
            return ({ n, bound, subject, issuer }) => {
                if (bound === "signIn" && (!subject || !issuer)) {
                    return null;
                }
                const e = Math.floor(Date.now() / 1000) + state.settings.expiresMinutes * 60;
                const token = signToken(keys, { n, e, b: bound, ...(bound === "signIn" ? { s: subjectDigest(keys, n, /** @type {string} */ (issuer), /** @type {string} */ (subject)) } : {}) });
                return { url: `${state.base}${DOWNLOADS_PATH}/${token}`, expiresAt: new Date(e * 1000).toISOString().replace(/\.\d{3}Z$/, "Z") };
            };
        }
    };
}

/**
 * The subject binding of a caller for an upload target that scopes a report to the person: an HMAC
 * of [issuer, subject] under a subkey of output.downloads.key of its own ("upload binding"), so it is
 * the same for one person across reports and never a value a link's token holds; null without the
 * route's state (no HTTP) or a readable key.
 * @param {any} context
 * @param {string} issuer
 * @param {string} subject
 * @returns {Promise<string | null>}
 */
export async function subjectBindingOf(context, issuer, subject) {
    const keys = await states.get(context)?.keys().catch(() => null);
    return keys ? mac(keys.upload, JSON.stringify([issuer, subject])) : null;
}

/** How long a read of output.downloads.key is used before it is read again, in milliseconds. */
export const KEY_READ_MS = 1000;

/**
 * The keys of output.downloads.key, read again at most every KEY_READ_MS (a rotated secret works
 * without a restart, within a second; links of the old key stop working) and derived once per value;
 * a random key without one. A read, and a failed one, is shared by the requests in that time, so a
 * flood of links (forged ones too) does not read the file for each.
 * @param {import("./options/downloads.js").DownloadSettings} settings
 * @param {{ baseDir?: string }} options
 * @param {Record<string, string | undefined>} env
 */
function keySource(settings, options, env) {
    if (!settings.key) {
        const keys = subkeysOf(randomBytes(32));
        return async () => keys;
    }
    let last = { value: "", keys: /** @type {any} */ (null) };
    const ref = settings.key;
    const read = async () => {
        const value = await readSecret(ref, options, env);
        if (Buffer.byteLength(value) < KEY_MIN_BYTES) {
            throw new ConfigError(`output.downloads.key (${ref.env ? `$${ref.env}` : `the file ${ref.file}`}) is shorter than ${KEY_MIN_BYTES} bytes; make one with: openssl rand -base64 48`);
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
 * The sign-in's token endpoint: output.downloads.signIn.tokenUrl, else the metadata's
 * token_endpoint, which must be on the issuer's origin (the client secret goes there), as for a
 * token exchange (sources/auth.js). Throws Error.
 * @param {any} metadata
 * @param {{ issuer: string, tokenUrl: string | null }} signIn
 */
function tokenUrlOf(metadata, signIn) {
    if (signIn.tokenUrl) {
        return signIn.tokenUrl;
    }
    const given = metadata?.token_endpoint;
    if (typeof given !== "string" || !URL.canParse(given)) {
        throw new Error("the issuer's metadata names no token_endpoint (set output.downloads.signIn.tokenUrl)");
    }
    if (new URL(given).origin !== new URL(signIn.issuer).origin) {
        throw new Error(`the issuer's token_endpoint is on another origin (${new URL(given).origin}); set output.downloads.signIn.tokenUrl to accept it`);
    }
    return given;
}

/**
 * The sign-in issuer: its metadata and keys, loaded in the background with retries (until then a
 * sign-in link answers 503).
 * @param {NonNullable<import("./options/downloads.js").DownloadSettings["signIn"]>} signIn
 * @param {import("./issuer.js").IssuerRules} rules
 * @param {string | undefined} jwksUri  auth.jwksUri
 * @param {any} log
 */
function signInIssuer(signIn, rules, jwksUri, log) {
    /** @type {{ metadata: any, tokenUrl: string, jwks: any } | null} */
    let loaded = null;
    let timer = null;
    let closed = false;
    let delay = 2000;
    const attempt = async () => {
        try {
            const metadata = await discover(signIn.issuer, rules);
            if (typeof metadata.authorization_endpoint !== "string") {
                throw new Error("the issuer's metadata names no authorization_endpoint");
            }
            loaded = { metadata, tokenUrl: tokenUrlOf(metadata, signIn), jwks: await remoteKeySet(jwksUriOf(metadata, signIn.issuer, jwksUri), rules, log) };
            log.info("download links: the sign-in issuer's metadata loaded", { issuer: signIn.issuer });
        } catch (e) {
            if (closed) {
                return;
            }
            log.warn(`download links: the sign-in issuer's metadata could not be loaded, trying again in ${delay / 1000} s: ${String(/** @type {any} */ (e)?.message ?? e).slice(0, 600)}`);
            timer = setTimeout(attempt, delay);
            timer.unref?.();
            delay = Math.min(delay * 2, 60_000);
        }
    };
    const started = attempt();
    return {
        started,
        loaded: () => loaded,
        close() {
            closed = true;
            if (timer) {
                clearTimeout(timer);
            }
        }
    };
}

/**
 * A signed map of short entries in one cookie: the sign-ins under way (by their state) and the
 * one-time downloads this browser may repeat (by their nonce). `__Host-` and Secure on https.
 */
function cookieJar(keyOf, secure) {
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

/** Escapes a text for HTML. */
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * A short page: a heading (also the title), its body as HTML (escaped by the caller) and, for a
 * one-time link, the button. A page of status 500 or more names the request's id, for the operator.
 */
function page(heading, body, { status = 200, form = false, headers = {} } = {}) {
    // the request id where the operator has something to look up: a failure of the server's own
    const tail = form ? `<form method="post"><button type="submit">Download</button></form><p id="status" role="status"></p><script>${PAGE_SCRIPT}</script>` : status >= 500 ? `<p class="ref">Request id: ${escapeHtml(requestId() ?? newRequestId())}</p>` : "";
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(heading)} - pivotkit report</title><style>${PAGE_STYLE}</style></head><body><main><p class="brand">pivotkit report</p><h1>${escapeHtml(heading)}</h1>${body}${tail}</main></body></html>`;
    return new Response(html, { status, headers: { ...BASE_HEADERS, "content-security-policy": PAGE_CSP, "content-type": "text/html; charset=utf-8", ...headers } });
}

/** Whether a request asks for JSON rather than a page (a program, not a browser). */
const wantsJson = (request) => {
    const accept = request.headers.get("accept") ?? "";
    return !accept.includes("text/html") && /application\/(problem\+)?json/.test(accept);
};

/**
 * The answer of a code: a page for a browser, a problem document for a program.
 * @param {Request} request
 * @param {keyof typeof ANSWERS} code
 * @param {Record<string, string>} [headers]
 */
function answer(request, code, headers = {}) {
    const { status, heading, text, code: shown = code } = /** @type {{ status: number, heading: string, text: string, code?: string }} */ (ANSWERS[code]);
    if (wantsJson(request)) {
        const body = { type: typeOf(shown), title: shown.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), status, code: shown, detail: text, requestId: requestId() ?? newRequestId() };
        return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, "content-type": "application/problem+json", ...headers } });
    }
    return page(heading, `<p>${escapeHtml(text)}</p>`, { status, headers });
}

/**
 * Builds the route of a context's links (once per context: a second call returns the first handler,
 * so the REST service and the MCP endpoint on one port share it).
 * @param {any} context
 * @param {{ env?: Record<string, string | undefined>, loopback?: boolean, sweepEveryMs?: number }} [runtime]  sweepEveryMs: how often expired one-time markers are swept (tests)
 * @returns {{ handles(path: string): boolean, precheck(request: Request): Promise<Response | null>, fetch(request: Request): Promise<Response>, problem(status: number): Response, listening(url: string): void, close(): void }}
 */
export function createDownloadHandler(context, runtime = {}) {
    const existing = states.get(context);
    if (existing) {
        return existing.handler;
    }
    const options = context.options;
    const settings = settingsOf(options);
    const env = runtime.env ?? process.env;
    const loopback = runtime.loopback ?? isLoopback(options.http?.host ?? "127.0.0.1");
    const publicUrl = options.http?.publicUrl ? new URL(options.http.publicUrl) : null;
    const hosts = allowedHosts(options);
    const keys = keySource(settings, options, env);
    const active = settings.enabled;
    const issuerRules = issuerRulesOf(options);
    // the operator's tokenUrl is an origin the operator wrote, like auth.issuer's
    const signInRules = settings.signIn?.tokenUrl ? Object.freeze({ ...issuerRules, origins: [...issuerRules.origins, new URL(settings.signIn.tokenUrl).origin] }) : issuerRules;
    const issuer = active && settings.bind === "signIn" && settings.signIn ? signInIssuer(settings.signIn, issuerRules, options.auth?.jwksUri, context.log) : null;
    const subjectClaim = options.auth?.subjectClaim ?? "sub";
    /** @type {any} */
    const state = { settings, keys, base: publicUrl ? publicUrl.origin + publicUrl.pathname.replace(/\/$/, "") : null, handler: null };
    const secure = () => (state.base ?? "").startsWith("https:");
    const jar = cookieJar(keys, secure());
    /** When the markers of used one-time links were last swept. */
    let swept = 0;

    if (active) {
        // said where some report can get a link (as check-config's): one over an open source, or a binding for closed ones
        void Promise.resolve(context.registry.check?.() ?? [])
            .then((sources) => linkingFor(settings, sources))
            .then(async (linking) => {
                if (!linking) {
                    return;
                }
                if (!settings.key) {
                    context.log.warn("download links use a random key: links stop working on restart and on other replicas; set output.downloads.key");
                    return;
                }
                await keys().catch((e) => context.log.warn(`download links: the key cannot be read, so reports get no links until it can: ${String(e?.message ?? e).slice(0, 200)}`));
            })
            .catch(() => undefined);
        const insecure = insecurePublicHost(options);
        if (insecure) {
            context.log.warn(insecureUrlText(insecure));
        }
        if (!publicUrl && !loopback) {
            context.log.warn("download links: http.publicUrl is not set and the server listens on an address other than loopback, so reports get no links (they would show an internal address); set http.publicUrl");
        }
    }

    const markersDir = () => join(/** @type {string} */ (outputDir(context)), ".pivotkit-downloads");

    /** Deletes the markers of expired one-time links (sweepMarkers), at most every MARKER_SWEEP_MS. */
    async function sweep() {
        if (Date.now() - swept < MARKER_SWEEP_MS) {
            return;
        }
        swept = Date.now();
        await sweepMarkers(markersDir());
    }
    // and on a timer, so markers go also when no one-time link is opened any more (not the throttled
    // sweep(): a tick must not be skipped for a POST's sweep just before it)
    const sweeping = active && outputDir(context)
        ? setInterval(() => {
              swept = Date.now();
              void sweepMarkers(markersDir()).catch(() => undefined);
          }, runtime.sweepEveryMs ?? MARKER_SWEEP_MS)
        : null;
    sweeping?.unref?.();

    /** The stored file of a nonce, opened without following a link, or null when it is gone. */
    async function openReport(n) {
        const dir = outputDir(context);
        if (!dir) {
            return null;
        }
        const names = (await readdir(dir).catch(() => [])).filter((name) => name.startsWith(`${n}-`) && LINKED_NAME.exec(name)?.[1] === n);
        if (names.length !== 1) {
            return null;
        }
        const handle = await open(join(dir, names[0]), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)).catch(() => null);
        if (!handle) {
            return null;
        }
        const info = await handle.stat();
        if (!info.isFile()) {
            await handle.close();
            return null;
        }
        const extension = /** @type {string} */ (LINKED_NAME.exec(names[0])?.[4]);
        return { handle, size: info.size, filename: filenameOf(names[0]), mediaType: MEDIA_TYPES[/** @type {keyof typeof MEDIA_TYPES} */ (extension)], kind: FILE_KINDS[/** @type {keyof typeof FILE_KINDS} */ (extension)] };
    }

    /**
     * The file as an answer, streamed. `started` runs when its first bytes are handed on, `failed`
     * when it ends before any were.
     */
    function fileAnswer(report, method, { headers = {}, started = () => {}, failed = () => {} } = {}) {
        const responseHeaders = { ...BASE_HEADERS, "content-security-policy": FILE_CSP, "content-type": report.mediaType, "content-length": String(report.size), "content-disposition": dispositionOf(report.filename), ...headers };
        if (method === "HEAD") {
            void report.handle.close();
            return new Response(null, { status: 200, headers: responseHeaders });
        }
        let sent = false;
        let ended = false;
        const end = async (ok) => {
            if (!ended) {
                ended = true;
                await report.handle.close().catch(() => undefined);
                if (!ok && !sent) {
                    await failed();
                }
            }
        };
        const chunk = Buffer.alloc(65_536);
        const body = new ReadableStream({
            async pull(controller) {
                try {
                    const { bytesRead } = await report.handle.read(chunk, 0, chunk.length, null);
                    if (bytesRead === 0) {
                        await end(true);
                        controller.close();
                        return;
                    }
                    if (!sent) {
                        sent = true;
                        await started();
                    }
                    controller.enqueue(new Uint8Array(chunk.subarray(0, bytesRead)));
                } catch (e) {
                    await end(false);
                    controller.error(e);
                }
            },
            async cancel() {
                await end(false);
            }
        });
        return new Response(body, { status: 200, headers: responseHeaders });
    }

    /** Logs a download request: never its token, path, code, state or cookie; its status is the answer's (the line's level follows it). */
    const log = (entry) => context.log.download({ via: "link", requestId: requestId() ?? newRequestId(), ...entry, status: entry.ok ? 200 : (ANSWERS[/** @type {keyof typeof ANSWERS} */ (entry.code)]?.status ?? 500) });

    /** A token's payload for a request, or the answer: 404 for one that does not hold, 410 for an expired one. */
    async function tokenOf(request, token) {
        let k;
        try {
            k = await keys();
        } catch (e) {
            context.log.warn(`download links: the key cannot be read: ${String(/** @type {any} */ (e)?.message ?? e).slice(0, 200)}`);
            log({ ok: false, code: "INTERNAL" });
            return { response: answer(request, "INTERNAL") };
        }
        const payload = readToken(k, token);
        if (!payload) {
            context.log.debug("download links: no such link", { via: "link", code: "NOT_FOUND", requestId: requestId() });
            return { response: answer(request, "NOT_FOUND") };
        }
        if (payload.e < Math.floor(Date.now() / 1000)) {
            log({ bound: payload.b, ok: false, code: "LINK_EXPIRED" });
            return { response: answer(request, "LINK_EXPIRED") };
        }
        return { payload, keys: k };
    }

    /** The stored report of a payload, or the answer for a removed one. */
    async function reportOf(request, payload) {
        const report = await openReport(payload.n);
        if (!report) {
            log({ bound: payload.b, ok: false, code: "LINK_EXPIRED", removed: true });
            return { response: answer(request, "REPORT_REMOVED") };
        }
        return { report };
    }

    /**
     * Whether a POST comes from the link's own page: Origin equal to the link's (http.publicUrl's, not
     * the address behind a proxy), or no usable Origin (`null`: a page under Referrer-Policy
     * no-referrer, Fetch "append a request Origin header") and same-origin fetch metadata. The
     * one-time page is served with Referrer-Policy same-origin, so its form's POST names its origin.
     */
    function sameOriginPost(request) {
        const origin = request.headers.get("origin");
        const linkOrigin = new URL(/** @type {string} */ (state.base)).origin;
        if (origin !== null && origin !== "null") {
            return origin === linkOrigin;
        }
        return request.headers.get("sec-fetch-site") === "same-origin";
    }

    /** GET, HEAD and POST of /downloads/<token>. */
    async function link(request, token) {
        const got = await tokenOf(request, token);
        if (got.response) {
            return got.response;
        }
        const { payload } = got;
        const method = request.method;
        if (payload.b === "none") {
            if (method !== "GET" && method !== "HEAD") {
                return answer(request, "METHOD_NOT_ALLOWED", { allow: "GET, HEAD" });
            }
            const found = await reportOf(request, payload);
            if (found.response) {
                return found.response;
            }
            log({ bound: "none", ok: true });
            return fileAnswer(found.report, method);
        }
        if (payload.b === "once") {
            if (method === "GET" || method === "HEAD") {
                // a link preview must not use the link: a page, the file only by its button
                const found = await reportOf(request, payload);
                if (found.response) {
                    return found.response;
                }
                await found.report.handle.close();
                // a used link says so at once (to a second browser, at a later visit), except to the
                // browser that took it, which may repeat it for REPEAT_SECONDS
                const repeat = (await jar.read(request))[`o:${payload.n}`];
                if (!repeat && (await access(join(markersDir(), `${payload.n}.used`)).then(() => true, () => false))) {
                    return answer(request, "LINK_USED");
                }
                const { filename, kind, size } = found.report;
                const what = `<p class="file">${escapeHtml(filename)}</p><p>${kind}, ${sizeText(size)}. `;
                // the sentence about when it can be downloaded goes once the status line says it (the page's script)
                const body = repeat ? `${what}<span id="until">You downloaded it in this browser a moment ago and can download it again until ${timeHtml(repeat.x)}; after that the link is used.</span></p>` : `${what}<span id="until">It can be downloaded once, until ${timeHtml(payload.e)}.</span></p>`;
                // same-origin, not no-referrer: so the browser names the page's origin when it posts the
                // form (under no-referrer it sends Origin: null); nothing leaves for another site
                return page("Download the report", body, { form: true, headers: { "referrer-policy": "same-origin" } });
            }
            if (method !== "POST") {
                return answer(request, "METHOD_NOT_ALLOWED", { allow: "GET, HEAD, POST" });
            }
            if (!sameOriginPost(request)) {
                log({ bound: "once", ok: false, code: "FORBIDDEN_ORIGIN" });
                return answer(request, "FORBIDDEN_ORIGIN");
            }
            return once(request, payload);
        }
        // signIn
        if (method !== "GET" && method !== "HEAD") {
            return answer(request, "METHOD_NOT_ALLOWED", { allow: "GET, HEAD" });
        }
        const found = await reportOf(request, payload);
        if (found.response) {
            return found.response;
        }
        await found.report.handle.close();
        // a link preview (HEAD) learns the link works, but starts no sign-in and gets no cookie
        if (method === "HEAD") {
            return page("Sign in to download the report", "<p>Open this link in your browser and sign in to download the report.</p>");
        }
        return startSignIn(request, token);
    }

    /** The POST of a one-time link: the file once, or again to the browser that took it within REPEAT_SECONDS. */
    async function once(request, payload) {
        void sweep().catch(() => undefined);
        const found = await reportOf(request, payload);
        if (found.response) {
            return found.response;
        }
        const map = await jar.read(request);
        const repeat = map[`o:${payload.n}`];
        const marker = join(markersDir(), `${payload.n}.used`);
        if (!repeat) {
            try {
                await mkdir(markersDir(), { recursive: true, mode: 0o700 });
                await placeMarker(marker, payload.e);
            } catch (e) {
                await found.report.handle.close();
                if (/** @type {any} */ (e)?.code === "EEXIST") {
                    log({ bound: "once", ok: false, code: "LINK_USED" });
                    return answer(request, "LINK_USED");
                }
                throw e;
            }
        }
        const cookie = repeat ? null : await jar.write({ ...map, [`o:${payload.n}`]: { x: Math.floor(Date.now() / 1000) + REPEAT_SECONDS } });
        log({ bound: "once", ok: true, ...(repeat ? { repeat: true } : {}) });
        return fileAnswer(found.report, "POST", {
            headers: cookie ? { "set-cookie": cookie } : {},
            // nothing left: the link stays unused
            failed: repeat ? () => {} : () => unlink(marker).catch(() => undefined)
        });
    }

    /** The redirect of a sign-in link to the issuer: code flow with PKCE, state and nonce kept in the cookie. */
    async function startSignIn(request, token) {
        const loaded = issuer?.loaded();
        if (!loaded || !settings.signIn) {
            log({ bound: "signIn", ok: false, code: "SIGN_IN_NOT_READY" });
            return answer(request, "SIGN_IN_NOT_READY", { "retry-after": "5" });
        }
        const stateValue = randomBytes(16).toString("base64url");
        const nonce = randomBytes(16).toString("base64url");
        const verifier = randomBytes(32).toString("base64url");
        const challenge = createHash("sha256").update(verifier).digest("base64url");
        const map = await jar.read(request);
        const cookie = await jar.write({ ...map, [`s:${stateValue}`]: { x: Math.floor(Date.now() / 1000) + SIGN_IN_SECONDS, v: verifier, nn: nonce, t: token } });
        const target = new URL(loaded.metadata.authorization_endpoint);
        for (const [k, v] of Object.entries({ response_type: "code", client_id: settings.signIn.clientId, redirect_uri: `${state.base}${CALLBACK_PATH}`, scope: settings.signIn.scopes.join(" "), state: stateValue, nonce, code_challenge: challenge, code_challenge_method: "S256" })) {
            target.searchParams.set(k, v);
        }
        return new Response(null, { status: 302, headers: { ...BASE_HEADERS, location: target.href, "set-cookie": cookie } });
    }

    /** Exchanges the code for tokens at the issuer (issuer.js: its address rules, no redirect, a time limit, a size cap). */
    async function exchange(loaded, code, verifier) {
        const signIn = /** @type {NonNullable<typeof settings.signIn>} */ (settings.signIn);
        const form = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: `${state.base}${CALLBACK_PATH}`, code_verifier: verifier, client_id: signIn.clientId });
        /** @type {Record<string, string>} */
        const headers = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
        if (signIn.clientSecret) {
            const secret = await readSecret(signIn.clientSecret, options, env);
            const methods = loaded.metadata.token_endpoint_auth_methods_supported;
            if (Array.isArray(methods) && !methods.includes("client_secret_basic") && methods.includes("client_secret_post")) {
                form.set("client_secret", secret);
            } else {
                headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(signIn.clientId)}:${encodeURIComponent(secret)}`).toString("base64")}`;
            }
        }
        let response;
        try {
            response = await issuerFetch(loaded.tokenUrl, signInRules, { method: "POST", headers, body: form.toString(), maxBytes: ISSUER_LIMITS.tokenBytes, timeMs: ISSUER_LIMITS.tokenMs });
        } catch (e) {
            // the operator's part of a refused request (an address, a redirect) as a warning; the person gets SIGN_IN_FAILED
            context.log.warn(`download links: the issuer's token endpoint could not be reached: ${/** @type {any} */ (e)?.code ?? "error"}, ${String(/** @type {any} */ (e)?.message ?? e).slice(0, 200)}${issuerHint(e, signInRules)}`);
            throw e;
        }
        if (response.status < 200 || response.status > 299) {
            throw new Error(`the token endpoint answered ${response.status}`);
        }
        const doc = JSON.parse(new TextDecoder().decode(response.body));
        if (typeof doc?.id_token !== "string") {
            throw new Error("the token endpoint's answer has no id_token");
        }
        return doc.id_token;
    }

    /** The callback of the sign-in: the file only for the person the token is for. */
    async function callback(request) {
        const url = new URL(request.url);
        const stateValue = url.searchParams.get("state") ?? "";
        const map = await jar.read(request);
        const key = `s:${stateValue}`;
        const entry = NONCE_SYNTAX.test(stateValue) && Object.hasOwn(map, key) ? map[key] : null;
        // the state is used once, whatever the answer
        const rest = { ...map };
        delete rest[key];
        const cookie = await jar.write(rest);
        const fail = (code, extra = {}) => {
            log({ bound: "signIn", ok: false, code: /** @type {{ code?: string }} */ (ANSWERS[code]).code ?? code, ...extra });
            return answer(request, code, { "set-cookie": cookie });
        };
        if (!entry || typeof entry.t !== "string" || typeof entry.v !== "string" || typeof entry.nn !== "string") {
            // no sign-in of this browser under way (a missing or foreign cookie, a used state): anyone can send that, so the debug log only
            // (a tab left open, a reload, another browser): the page says to open the link again, here
            context.log.debug("download links: a sign-in callback without its cookie", { via: "link", bound: "signIn", code: "SIGN_IN_FAILED", requestId: requestId() });
            return answer(request, "SIGN_IN_STALE", { "set-cookie": cookie });
        }
        if (url.searchParams.has("error")) {
            // read only after this browser's own sign-in matched; the provider's words are never shown
            return fail("SIGN_IN_DENIED", { reason: "issuer" });
        }
        const code = url.searchParams.get("code");
        if (!code || code.length > 2048) {
            return fail("SIGN_IN_FAILED");
        }
        const got = await tokenOf(request, entry.t);
        if (got.response) {
            return new Response(got.response.body, { status: got.response.status, headers: { ...Object.fromEntries(got.response.headers), "set-cookie": cookie } });
        }
        const { payload, keys: k } = got;
        if (payload.b !== "signIn") {
            return fail("SIGN_IN_FAILED");
        }
        const loaded = issuer?.loaded();
        if (!loaded || !settings.signIn) {
            return fail("SIGN_IN_NOT_READY");
        }
        let claims;
        try {
            const idToken = await exchange(loaded, code, entry.v);
            const { jwtVerify } = await import("jose");
            ({ payload: claims } = await jwtVerify(idToken, loaded.jwks, { issuer: settings.signIn.issuer, audience: settings.signIn.clientId, algorithms: options.auth?.algorithms?.length ? options.auth.algorithms : [...DEFAULT_ALGORITHMS], clockTolerance: options.auth?.clockTolerance ?? 30, requiredClaims: ["exp", "nonce"] }));
        } catch (e) {
            context.log.debug("download links: the sign-in failed", { reason: String(/** @type {any} */ (e)?.code ?? /** @type {any} */ (e)?.message ?? "invalid").slice(0, 120) });
            return fail("SIGN_IN_FAILED", { reason: "token" });
        }
        if (typeof claims.nonce !== "string" || !sameText(claims.nonce, entry.nn)) {
            return fail("SIGN_IN_FAILED", { reason: "nonce" });
        }
        // OpenID Connect Core 3.1.3.7: a token for several audiences names this client as its azp
        const severalAudiences = Array.isArray(claims.aud) && claims.aud.length > 1;
        if ((severalAudiences || claims.azp !== undefined) && claims.azp !== settings.signIn.clientId) {
            return fail("SIGN_IN_FAILED", { reason: "azp" });
        }
        const subject = subjectOf(claims[subjectClaim]);
        // the person who signed in, as the operator's audit setting names people on the log (the
        // shared authentication's key, so a link's line and a call's line name a person alike)
        const core = subject ? await context.auth?.({ env, loopback }).catch(() => null) : null;
        const named = core?.auditName?.(claims.iss, subject);
        const who = named ? { subject: named } : {};
        if (!subject || typeof claims.iss !== "string" || !sameText(subjectDigest(k, payload.n, claims.iss, subject), /** @type {string} */ (payload.s))) {
            return fail("LINK_NOT_YOURS", who);
        }
        const found = await reportOf(request, payload);
        if (found.response) {
            return new Response(found.response.body, { status: found.response.status, headers: { ...Object.fromEntries(found.response.headers), "set-cookie": cookie } });
        }
        log({ bound: "signIn", ok: true, ...who });
        return fileAnswer(found.report, "GET", { headers: { "set-cookie": cookie } });
    }

    /** A request of the route after its precheck, inside its request id. */
    async function route(request, path) {
        try {
            if (!active || !state.base) {
                return answer(request, "NOT_FOUND");
            }
            if (path === CALLBACK_PATH) {
                return request.method === "GET" ? await callback(request) : answer(request, "METHOD_NOT_ALLOWED", { allow: "GET" });
            }
            const token = path.slice(DOWNLOADS_PATH.length + 1);
            if (!TOKEN_SYNTAX.test(token)) {
                context.log.debug("download links: no such link", { via: "link", code: "NOT_FOUND", requestId: requestId() });
                return answer(request, "NOT_FOUND");
            }
            return await link(request, token);
        } catch (e) {
            context.log.error(e, { where: "downloads", requestId: requestId() });
            return answer(request, "INTERNAL");
        }
    }

    const handler = {
        /** Whether a path is the route's (anything under /downloads; what is not a link answers 404). */
        handles: (path) => path === DOWNLOADS_PATH || path.startsWith(`${DOWNLOADS_PATH}/`),

        /** The checks before the body is read: Host, and a body of at most DOWNLOAD_BODY_BYTES. */
        async precheck(request) {
            const refused = hostRefusal(request, hosts);
            if (refused) {
                context.log.refused({ status: 403, path: DOWNLOADS_PATH, reason: "host", host: String(request.headers.get("host") ?? "").slice(0, 100) });
                return answer(request, "FORBIDDEN_HOST");
            }
            if (Number(request.headers.get("content-length") ?? 0) > DOWNLOAD_BODY_BYTES) {
                context.log.refused({ status: 413, path: DOWNLOADS_PATH, reason: "body_too_large", limit: DOWNLOAD_BODY_BYTES, size: Number(request.headers.get("content-length")) });
                return answer(request, "BODY_TOO_LARGE");
            }
            return null;
        },

        /** A request of the route. */
        async fetch(request) {
            const early = await handler.precheck(request);
            if (early) {
                return early;
            }
            const path = new URL(request.url).pathname;
            // one id per request: its log lines, its problem document and its page name the same one
            return withRequestId(requestId() ?? newRequestId(), () => route(request, path));
        },

        /** The answer for a body that cannot be read (too large, cut off), with its refused line. */
        problem: (status) => {
            context.log.refused({ status, path: DOWNLOADS_PATH, reason: status === 413 ? "body_too_large" : "bad_request", ...(status === 413 ? { limit: DOWNLOAD_BODY_BYTES } : {}) });
            return new Response(JSON.stringify({ code: status === 413 ? "BODY_TOO_LARGE" : "INVALID_INPUT", requestId: requestId() ?? newRequestId() }), { status, headers: { ...BASE_HEADERS, "content-type": "application/problem+json", connection: "close" } });
        },

        /**
         * The address the server listens on, once it does: the links' base on loopback without
         * http.publicUrl (never off loopback: it would be an internal address).
         * @param {string} url
         */
        listening(url) {
            if (!publicUrl && loopback) {
                state.base = new URL(url).origin;
            }
        },

        close() {
            issuer?.close();
            if (sweeping) {
                clearInterval(sweeping);
            }
        }
    };
    state.handler = handler;
    states.set(context, state);
    return handler;
}

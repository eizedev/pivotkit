// The server's own download links: the token (signed, checked in constant time, the same 404 for a
// forged and an unknown one), which report gets which link, the route's answers and headers, one-time
// links (a page for GET and HEAD, one POST from the link's own page, a marker shared by replicas), and
// sign-in links against a local OpenID provider that checks PKCE for real: only the person who asked
// opens the report. Nothing on the log holds a token, a code, a state or a cookie.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, unlinkSync, utimesSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { checkConfig, validateOptions } from "pivotkit-server";
import { dispositionOf, filenameOf, placeMarker, readToken, signToken, sizeText, subjectDigest, subkeysOf, sweepMarkers } from "../src/downloads.js";
import { NO_LINK_NOTE, linkFor, resourceLinkOf } from "../src/delivery.js";
import { BY_REGION, SALES_CSV, TOKEN, call, factsOf, raw, restServer, tempDir, workspace } from "./helpers.js";
import { createContext } from "../src/context.js";
import { deliver } from "../src/delivery.js";

const PUBLIC = "https://reports.example.com";
const MCP_RESOURCE = `${PUBLIC}/mcp`;
const REST_RESOURCE = `${PUBLIC}/api/v1`;
const CLIENT_ID = "pivotkit-downloads";
const DL_KEY = "a-download-key-for-tests-that-is-long-enough-0123456789";
const KEYS = subkeysOf(Buffer.from(DL_KEY, "utf8"));

let issuer;
let issuerServer;
let key;
let otherKey;
/** The provider's public key as a JWK (also served by the half provider of the 503 test). */
let jwk;
/** Codes the provider gave out: what the token endpoint checks and puts in the ID token. */
const codes = new Map();
/** What the issuer's metadata says besides its own addresses (a hostile issuer's tests); reset after each. */
let metadataMore = {};
/** The paths the issuer was asked for. */
const issuerAsked = [];

before(async () => {
    key = await generateKeyPair("RS256");
    otherKey = await generateKeyPair("RS256");
    jwk = { ...(await exportJWK(key.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
    issuerServer = createServer((req, res) => {
        const url = new URL(req.url, issuer);
        issuerAsked.push(url.pathname);
        if (url.pathname === "/.well-known/openid-configuration") {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, response_types_supported: ["code"], subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"], ...metadataMore }));
        } else if (url.pathname === "/jwks") {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ keys: [jwk] }));
        } else if (url.pathname === "/token" && req.method === "POST") {
            const chunks = [];
            req.on("data", (c) => chunks.push(c));
            req.on("end", async () => {
                const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
                const grant = codes.get(form.get("code"));
                // a code is used once; PKCE, the client and the redirect address are checked as a provider does
                codes.delete(form.get("code"));
                const verifier = form.get("code_verifier") ?? "";
                const ok = grant && form.get("grant_type") === "authorization_code" && form.get("client_id") === grant.clientId && form.get("redirect_uri") === grant.redirectUri && createHash("sha256").update(verifier).digest("base64url") === grant.challenge;
                if (!ok) {
                    res.writeHead(400, { "content-type": "application/json" });
                    res.end(JSON.stringify({ error: "invalid_grant" }));
                    return;
                }
                const idToken = await new SignJWT({ nonce: grant.nonce, ...grant.claims })
                    .setProtectedHeader({ alg: "RS256", kid: "k1" })
                    .setIssuer(grant.iss ?? issuer)
                    .setAudience(grant.aud ?? grant.clientId)
                    .setSubject(grant.sub)
                    .setIssuedAt()
                    .setExpirationTime("5m")
                    .sign(grant.signWith ?? key.privateKey);
                res.writeHead(200, { "content-type": "application/json" });
                res.end(JSON.stringify({ access_token: "x", token_type: "Bearer", id_token: idToken }));
            });
        } else {
            res.writeHead(404);
            res.end();
        }
    });
    await new Promise((resolve) => issuerServer.listen(0, "127.0.0.1", resolve));
    issuer = `http://127.0.0.1:${issuerServer.address().port}`;
});
after(() => new Promise((resolve) => issuerServer.close(resolve)));

/**
 * The provider's sign-in page, as a person passes it: reads the redirect's parameters and gives a
 * code for `sub` (with what `grant` changes: another nonce, audience, issuer or key).
 */
function signInAt(location, sub, grant = {}) {
    const url = new URL(location);
    assert.equal(url.origin + url.pathname, `${issuer}/authorize`);
    const p = Object.fromEntries(url.searchParams);
    assert.equal(p.response_type, "code");
    assert.equal(p.code_challenge_method, "S256");
    assert.equal(p.redirect_uri, `${PUBLIC}/downloads/callback`);
    assert.equal(p.client_id, CLIENT_ID);
    assert.match(p.scope, /\bopenid\b/);
    const code = randomBytes(16).toString("base64url");
    codes.set(code, { clientId: p.client_id, redirectUri: p.redirect_uri, challenge: p.code_challenge, nonce: grant.nonce ?? p.nonce, sub, ...grant });
    return { code, state: p.state };
}

/** A signed access token of the provider for one of the server's resources. */
async function accessToken(sub, aud = REST_RESOURCE, client = "claude", iss = issuer) {
    return new SignJWT({ scope: "pivotkit", client_id: client }).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(iss).setAudience(aud).setSubject(sub).setIssuedAt().setExpirationTime("5m").sign(key.privateKey);
}

/** The cookie a Set-Cookie header sets, as a Cookie header sends it. */
const cookieOf = (response) => (response.headers.get("set-cookie") ?? "").split(";")[0];

/** Reads a server's log as it is so far, as one text. */
const logText = (server) => JSON.stringify(server.log);

/** Every header the route's answers carry. */
function assertBaseHeaders(headers) {
    assert.equal(headers.get("cache-control"), "no-store");
    assert.equal(headers.get("referrer-policy"), "no-referrer");
    assert.equal(headers.get("x-robots-tag"), "noindex");
    assert.equal(headers.get("x-content-type-options"), "nosniff");
    assert.equal(headers.get("cross-origin-resource-policy"), "same-origin");
}

/**
 * A page's policy: nothing but its own style and script, by their hashes, a form to itself, no frames.
 * @param {string | null} csp
 * @param {string} html
 */
function assertPageCsp(csp, html) {
    const hash = (text) => `'sha256-${createHash("sha256").update(text).digest("base64")}'`;
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
    assert.match(style, /prefers-color-scheme:dark/);
    assert.match(String(csp), /^default-src 'none'; style-src '[^']+'; script-src '[^']+'; form-action 'self'; frame-ancestors 'none'$/);
    assert.ok(String(csp).includes(`style-src ${hash(style)};`), "the style's hash");
    if (script !== undefined) {
        assert.ok(String(csp).includes(`script-src ${hash(script)};`), "the script's hash");
    }
}

/** Sales: Customer is a person's name (closed: summary by default); weather: every field shown (open). */
const SOURCES = { sales: { file: "data/sales.csv" }, open: { file: "data/sales.csv", policy: { default: "show" } } };

// --- the token ---------------------------------------------------------------------------------

test("token: a signed token reads back; a changed payload or signature, another key, an extra member and every malformed form read as nothing", () => {
    const n = randomBytes(16).toString("base64url");
    const e = Math.floor(Date.now() / 1000) + 60;
    const token = signToken(KEYS, { n, e, b: "none" });
    assert.deepEqual(readToken(KEYS, token), { n, e, b: "none" });
    const [body, sig] = token.split(".");
    // another expiry under the same signature
    const later = Buffer.from(JSON.stringify({ v: 1, n, e: e + 3600, b: "none" })).toString("base64url");
    assert.equal(readToken(KEYS, `${later}.${sig}`), null);
    // a flipped character of the signature
    assert.equal(readToken(KEYS, `${body}.${sig.slice(0, -1)}${sig.at(-1) === "A" ? "B" : "A"}`), null);
    // the key of another server
    assert.equal(readToken(subkeysOf(randomBytes(32)), token), null);
    // a payload with a member pivotkit does not write, signed right
    const extra = Buffer.from(JSON.stringify({ v: 1, n, e, b: "none", name: "../../etc/passwd" })).toString("base64url");
    assert.equal(readToken(KEYS, `${extra}.${createHmacB64(KEYS.token, extra)}`), null);
    // a nonce of the wrong length, a binding pivotkit does not know, signIn without its subject, none with one
    for (const payload of [{ v: 1, n: n.slice(1), e, b: "none" }, { v: 1, n, e, b: "everyone" }, { v: 1, n, e, b: "signIn" }, { v: 1, n, e, b: "none", s: "x".repeat(43) }, { v: 2, n, e, b: "none" }, { v: 1, n, e: "soon", b: "none" }]) {
        const b = Buffer.from(JSON.stringify(payload)).toString("base64url");
        assert.equal(readToken(KEYS, `${b}.${createHmacB64(KEYS.token, b)}`), null, JSON.stringify(payload));
    }
    for (const bad of ["", ".", token.replace(".", ""), `${token}.x`, `${body}.${sig}=`, `${body}%2E${sig}`, `${"A".repeat(700)}.${sig}`, `${body} .${sig}`, null, 42]) {
        assert.equal(readToken(KEYS, /** @type {any} */ (bad)), null, String(bad));
    }
    // a person is an HMAC of issuer and subject under its own key: not the subject, not a plain hash
    // of it, and the same subject of another issuer is another person
    const s = subjectDigest(KEYS, "https://auth.example.com/", "alice");
    assert.notEqual(s, createHash("sha256").update("alice").digest("base64url"));
    assert.notEqual(s, createHmacB64(KEYS.token, "alice"));
    assert.notEqual(s, subjectDigest(KEYS, "https://other.example.com/", "alice"));
    // issuer and subject cannot be cut differently to the same person: "a" + "b\0c" is not "a\0b" + "c"
    assert.notEqual(subjectDigest(KEYS, "a", "b\u0000c"), subjectDigest(KEYS, "a\u0000b", "c"));
});

/** HMAC-SHA256 in base64url (a signature under a key the test holds). */
const createHmacB64 = (keyBytes, text) => createHmac("sha256", keyBytes).update(text).digest("base64url");

test("file names: the stored name's prefix and mark come off; Content-Disposition holds no line break, quote or backslash", () => {
    assert.equal(filenameOf("Q3vB0rD3cE1fG9hI2jK4lM-Sales by region.pivotkit-out.xlsx"), "Sales by region.xlsx");
    assert.equal(filenameOf("Q3vB0rD3cE1fG9hI2jK4lM-Weekly.pivotkit-out.report.json"), "Weekly.report.json");
    assert.equal(filenameOf("Sales-2.pivotkit-out.csv"), "Sales-2.csv");
    const header = dispositionOf('Umsätze "Q3"\r\nSet-Cookie: x=1\\.xlsx');
    assert.doesNotMatch(header, /[\r\n]/);
    assert.equal(header, `attachment; filename="Ums_tze Q3Set-Cookie: x=1.xlsx"; filename*=UTF-8''Ums%C3%A4tze%20Q3Set-Cookie%3A%20x%3D1.xlsx`);
});

test("which report gets which link: open sources plain links, closed ones only bound (sign-in with a subject, or the operator's once), REST only with results", () => {
    const signIn = { bind: /** @type {const} */ ("signIn") };
    const once = { bind: /** @type {const} */ ("once") };
    const none = { bind: /** @type {const} */ ("none") };
    const mcp = { surface: /** @type {const} */ ("mcp"), results: false };
    assert.equal(linkFor(null, { closed: false, ...mcp, subject: "alice" }), null, "no route mounted: no link");
    assert.equal(linkFor(none, { closed: false, ...mcp, subject: null }), "none");
    assert.equal(linkFor(signIn, { closed: true, ...mcp, subject: "alice" }), "signIn");
    assert.equal(linkFor(signIn, { closed: true, ...mcp, subject: null }), null, "a static token or a token without a usable subject");
    assert.equal(linkFor(once, { closed: true, ...mcp, subject: null }), "once");
    assert.equal(linkFor(none, { closed: true, ...mcp, subject: "alice" }), null);
    assert.equal(linkFor(signIn, { closed: true, surface: "rest", results: false, subject: "alice" }), null, "a REST program without results: true");
    assert.equal(linkFor(signIn, { closed: true, surface: "rest", results: true, subject: "alice" }), "signIn");
    assert.equal(linkFor(once, { closed: false, surface: "rest", results: false, subject: null }), "none", "open sources keep their link on REST");
});

test("options: expiry from 1 to 1440 minutes; enabled next to output.baseUrl, a sign-in without OAuth, an http public URL or openid are refused", () => {
    const oauth = { mode: "oauth", issuer: "https://auth.example.com/", resource: MCP_RESOURCE };
    const signIn = { clientId: CLIENT_ID };
    assert.throws(() => validateOptions({ output: { dir: "out", downloads: { expiresMinutes: 0 } } }), /output\.downloads\.expiresMinutes: from 1 to 1440/);
    assert.throws(() => validateOptions({ output: { dir: "out", downloads: { expiresMinutes: 1441 } } }), /from 1 to 1440/);
    assert.throws(() => validateOptions({ output: { dir: "out", baseUrl: "https://files.example.com/", downloads: { enabled: true } } }), /choose one/);
    assert.throws(() => validateOptions({ output: { dir: "out", downloads: { signIn } } }), /needs auth\.mode "oauth"/);
    assert.throws(() => validateOptions({ output: { dir: "out", downloads: { signIn } }, auth: oauth }), /needs http\.publicUrl with https/);
    assert.throws(() => validateOptions({ output: { dir: "out", downloads: { signIn } }, auth: oauth, http: { publicUrl: "http://reports.example.com" } }), /needs http\.publicUrl with https/);
    assert.throws(() => validateOptions({ output: { dir: "out", downloads: { bind: "signIn" } }, auth: oauth, http: { publicUrl: PUBLIC } }), /needs auth\.mode "oauth" and output\.downloads\.signIn\.clientId/);
    assert.throws(() => validateOptions({ output: { dir: "out", downloads: { signIn: { ...signIn, scopes: ["profile"] } } }, auth: oauth, http: { publicUrl: PUBLIC } }), /must hold "openid"/);
    assert.throws(() => validateOptions({ output: { dir: "out", downloads: { signIn: { ...signIn, issuer: "http://auth.example.com/" } } }, auth: oauth, http: { publicUrl: PUBLIC } }), /signIn\.issuer: must be an https/);
    assert.throws(() => validateOptions({ output: { dir: "out", downloads: { key: "the-key-itself" } } }), /output\.downloads\.key: must be a reference to a secret/);
    validateOptions({ output: { dir: "out", downloads: { signIn, key: { env: "DL_KEY" }, expiresMinutes: 1440 } }, auth: oauth, http: { publicUrl: PUBLIC } });
    validateOptions({ output: { dir: "out", downloads: { bind: "once" } } });
    // the person signs in where the caller's token came from: another issuer is refused
    assert.throws(() => validateOptions({ output: { dir: "out", downloads: { signIn: { ...signIn, issuer: "https://other.example.com/" } } }, auth: oauth, http: { publicUrl: PUBLIC } }), /signIn\.issuer: must be auth\.issuer/);
    validateOptions({ output: { dir: "out", downloads: { signIn: { ...signIn, issuer: oauth.issuer } } }, auth: oauth, http: { publicUrl: PUBLIC } });
    validateOptions({ output: { dir: "out", baseUrl: "https://files.example.com/", downloads: { enabled: false } } });
});

// --- plain links (open sources) -------------------------------------------------------------------

test("an open source's report: a plain link on loopback without http.publicUrl; GET and HEAD send it with the route's headers until it expires", async () => {
    const dir = workspace();
    const server = await restServer({ sources: SOURCES, output: { dir: "out", downloads: { key: { env: "DL_KEY" } } }, baseDir: dir }, { env: { DL_KEY } });
    try {
        const r = await call(`${server.api}/views/render`, { body: { source: "open", view: BY_REGION, format: "csv", name: "Sales by region" } });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        const output = r.data.output;
        assert.match(output.name, /^[A-Za-z0-9_-]{22}-Sales by region\.pivotkit-out\.csv$/);
        assert.equal(output.filename, "Sales by region.csv");
        assert.equal(output.bound, "none");
        assert.ok(output.url.startsWith(`${server.url}/downloads/`), output.url);
        assert.match(output.expiresAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
        assert.ok(Math.abs(Date.parse(output.expiresAt) - Date.now() - 3_600_000) < 5000);
        assert.equal(output.note, "Open the link in your browser; it works for 60 minutes.");
        // the address is output.url (and the resource_link), named once: the message names the file
        assert.equal(r.data.message.split(output.url).length, 1, r.data.message);
        assert.match(r.data.message, /^The report is saved as "Sales by region\.csv"\. Open the link in your browser; it works for 60 minutes\./);
        // the token names no file: only the nonce of the stored name
        const token = output.url.split("/downloads/")[1];
        const payload = readToken(KEYS, token);
        assert.equal(payload?.b, "none");
        assert.ok(output.name.startsWith(`${payload?.n}-`));
        assert.doesNotMatch(Buffer.from(token.split(".")[0], "base64url").toString(), /Sales/);

        const got = await fetch(output.url);
        assert.equal(got.status, 200);
        assert.deepEqual(Buffer.from(await got.arrayBuffer()), readFileSync(join(dir, "out", output.name)));
        assertBaseHeaders(got.headers);
        assert.equal(got.headers.get("content-security-policy"), "sandbox; default-src 'none'");
        assert.equal(got.headers.get("content-disposition"), `attachment; filename="Sales by region.csv"; filename*=UTF-8''Sales%20by%20region.csv`);
        assert.equal(got.headers.get("content-type"), "text/csv; charset=utf-8");
        // a range is not served: the whole file
        const ranged = await fetch(output.url, { headers: { range: "bytes=0-3" } });
        assert.equal(ranged.status, 200);
        assert.equal((await ranged.arrayBuffer()).byteLength, readFileSync(join(dir, "out", output.name)).length);
        const head = await fetch(output.url, { method: "HEAD" });
        assert.equal(head.status, 200);
        assert.equal(head.headers.get("content-length"), String(readFileSync(join(dir, "out", output.name)).length));
        // a plain link is not posted to
        assert.equal((await fetch(output.url, { method: "POST" })).status, 405);

        // an expired link of this server: 410; the same expired payload under another key: 404 (the signature first)
        const expired = signToken(KEYS, { n: /** @type {any} */ (payload).n, e: Math.floor(Date.now() / 1000) - 1, b: "none" });
        const gone = await call(`${server.url}/downloads/${expired}`, { headers: { accept: "application/json" } });
        assert.equal(gone.status, 410);
        assert.equal(gone.data.code, "LINK_EXPIRED");
        assert.equal(gone.data.type, "https://pivotkit.eize.dev/reference/rest/#error-link-expired");
        const forged = signToken(subkeysOf(randomBytes(32)), { n: /** @type {any} */ (payload).n, e: Math.floor(Date.now() / 1000) - 1, b: "none" });
        const unknown = signToken(KEYS, { n: randomBytes(16).toString("base64url"), e: Math.floor(Date.now() / 1000) + 60, b: "none" });
        const answers = [];
        for (const path of [forged, `${token.slice(0, -2)}AA`, "x", "not-a-token", `${token}/x`, "%2e%2e%2fconfig.json"]) {
            const a = await call(`${server.url}/downloads/${path}`, { headers: { accept: "application/json" } });
            answers.push([a.status, a.data.code, a.data.detail]);
        }
        assert.deepEqual(new Set(answers.map((a) => JSON.stringify(a))).size, 1, JSON.stringify(answers));
        assert.equal(answers[0][0], 404);
        // a valid token whose report is not there (another server's directory, removed): 410, removed
        const removedAnswer = await call(`${server.url}/downloads/${unknown}`, { headers: { accept: "application/json" } });
        assert.equal(removedAnswer.status, 410);
        assert.match(removedAnswer.data.detail, /removed/);
        // a browser gets a page
        const pageAnswer = await fetch(`${server.url}/downloads/${forged}`, { headers: { accept: "text/html" } });
        assert.equal(pageAnswer.status, 404);
        assert.match(await pageAnswer.text(), /There is no such link/);
        assertPageCsp(pageAnswer.headers.get("content-security-policy"), await fetch(`${server.url}/downloads/${forged}`, { headers: { accept: "text/html" } }).then((a) => a.text()));
        assertBaseHeaders(pageAnswer.headers);

        // the report removed to make room (output.maxFiles) before the link expires
        unlinkSync(join(dir, "out", output.name));
        const removed = await call(output.url, { headers: { accept: "application/json" } });
        assert.equal(removed.status, 410);
        assert.equal(removed.data.code, "LINK_EXPIRED");
        assert.match(removed.data.detail, /The report was removed from the server/);
        assert.doesNotMatch(logText(server), new RegExp(token.split(".")[1]));
    } finally {
        await server.close();
    }
});

test("a body over 1 KiB and a foreign Host are refused before anything else; the log holds no path", async () => {
    const dir = workspace();
    const server = await restServer({ sources: SOURCES, output: { dir: "out" }, baseDir: dir });
    try {
        const token = `${"A".repeat(30)}.${"B".repeat(43)}`;
        const big = await raw(`${server.url}/downloads/${token}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "content-length": "2048" }, body: "x".repeat(2048) });
        assert.equal(big.status, 413);
        // no declared length: the body is cut at 1 KiB while it is read
        const chunked = await raw(`${server.url}/downloads/${token}`, { method: "POST", headers: { "transfer-encoding": "chunked" }, body: "x".repeat(4096) });
        assert.equal(chunked.status, 413);
        const host = await raw(`${server.url}/downloads/${token}`, { headers: { host: "evil.example.com" } });
        assert.equal(host.status, 403);
        assert.doesNotMatch(logText(server), new RegExp(token));
    } finally {
        await server.close();
    }
});

test("output.downloads.enabled false keeps the old names and gives no link; off loopback without http.publicUrl no link is given (it would show an internal address)", async () => {
    const dir = workspace();
    const off = await restServer({ sources: SOURCES, output: { dir: "out", downloads: { enabled: false } }, baseDir: dir });
    try {
        const r = await call(`${off.api}/views/render`, { body: { source: "open", view: BY_REGION, format: "csv", name: "plain" } });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.equal(r.data.output.name, "plain.pivotkit-out.csv");
        assert.equal(r.data.output.url, undefined);
        assert.equal((await fetch(`${off.url}/downloads/${"A".repeat(30)}.${"B".repeat(43)}`)).status, 404);
    } finally {
        await off.close();
    }
    const wide = await restServer({ sources: SOURCES, output: { dir: "out" }, auth: { mode: "token" }, http: { host: "0.0.0.0" }, baseDir: dir }, { env: { PIVOTKIT_TOKEN: TOKEN } });
    try {
        const r = await call(`${wide.api.replace("0.0.0.0", "127.0.0.1")}/views/render`, { token: TOKEN, body: { source: "open", view: BY_REGION, format: "csv", name: "wide" } });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.equal(r.data.output.name, "wide.pivotkit-out.csv");
        assert.equal(r.data.output.url, undefined);
        assert.ok(wide.log.some((l) => l.event === "warning" && /http\.publicUrl is not set/.test(l.message)));
        assert.ok(wide.log.some((l) => l.event === "warning" && /random key/.test(l.message)));
    } finally {
        await wide.close();
    }
});

test("a closed source with a static token: no link, today's name, the message says to ask the operator; results: true on REST does not change that without a binding", async () => {
    const dir = workspace();
    const server = await restServer({ sources: SOURCES, output: { dir: "out" }, policy: { profiles: { analyst: { results: true } } }, auth: { mode: "token", tokens: [{ name: "bot", env: "BOT", profile: "analyst" }] }, baseDir: dir }, { env: { BOT: TOKEN } });
    try {
        const r = await call(`${server.api}/views/render`, { token: TOKEN, body: { source: "sales", view: BY_REGION, format: "xlsx", name: "Closed" } });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.equal(r.data.output.name, "Closed.pivotkit-out.xlsx");
        assert.equal(r.data.output.filename, "Closed.xlsx");
        assert.equal(r.data.output.url, undefined);
        assert.equal(r.data.output.bound, undefined);
        assert.equal(r.data.output.note, NO_LINK_NOTE);
        assert.match(r.data.message, /^The report is saved on the server; ask the operator how to open it\./);
        assert.doesNotMatch(JSON.stringify(r.data), /\/downloads\//);
    } finally {
        await server.close();
    }
});

// --- one-time links ---------------------------------------------------------------------------------

/** A server with one-time links for closed sources, behind a proxy at PUBLIC. */
async function onceServer() {
    const dir = workspace();
    const server = await restServer({ sources: SOURCES, output: { dir: "out", downloads: { bind: "once", key: { env: "DL_KEY" } } }, policy: { results: true }, http: { publicUrl: PUBLIC }, baseDir: dir }, { env: { DL_KEY }, enable: ["rest", "mcp"] });
    const local = (url) => url.replace(PUBLIC, server.url);
    const render = async (name = "Once") => {
        const r = await call(`${server.api}/views/render`, { body: { source: "sales", view: BY_REGION, format: "csv", name } });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        return r.data.output;
    };
    return { dir, server, local, render };
}

test("once: GET and HEAD answer a page and never use the link; one POST from the link's own page sends the file; the same browser may repeat it; any other gets 409", async () => {
    const { dir, server, local, render } = await onceServer();
    try {
        const output = await render();
        assert.equal(output.bound, "once");
        assert.ok(output.url.startsWith(`${PUBLIC}/downloads/`));
        assert.match(output.note, /works once/);
        const url = local(output.url);
        for (let i = 0; i < 3; i++) {
            const page = await fetch(url, { headers: { accept: "text/html" } });
            assert.equal(page.status, 200);
            const html = await page.text();
            assert.match(html, /<form method="post"><button type="submit">Download<\/button><\/form>/);
            assert.doesNotMatch(html, /North|Sales,/);
            assertPageCsp(page.headers.get("content-security-policy"), html);
            assert.match(html, /<p class="brand">pivotkit report<\/p>/);
            assert.match(html, /<p id="status" role="status"><\/p>/);
            // the form's POST names the page's origin (under no-referrer a browser sends Origin: null)
            assert.equal(page.headers.get("referrer-policy"), "same-origin");
            assert.equal((await fetch(url, { method: "HEAD" })).status, 200);
        }
        // not from the link's page: another site's Origin, or none without same-origin fetch metadata
        assert.equal((await fetch(url, { method: "POST", headers: { origin: "https://evil.example.com" } })).status, 403);
        assert.equal((await fetch(url, { method: "POST", headers: { origin: server.url } })).status, 403, "the address behind the proxy is not the link's origin");
        assert.equal((await fetch(url, { method: "POST" })).status, 403);
        assert.equal((await fetch(url, { method: "POST", headers: { "sec-fetch-site": "cross-site" } })).status, 403);
        // Origin "null" (a page under no-referrer) counts only with same-origin fetch metadata
        assert.equal((await fetch(url, { method: "POST", headers: { origin: "null" } })).status, 403);
        assert.equal((await fetch(url, { method: "POST", headers: { origin: "null", "sec-fetch-site": "same-site" } })).status, 403);
        const first = await fetch(url, { method: "POST", headers: { origin: PUBLIC } });
        assert.equal(first.status, 200);
        assert.deepEqual(Buffer.from(await first.arrayBuffer()), readFileSync(join(dir, "out", output.name)));
        const cookie = first.headers.get("set-cookie") ?? "";
        assert.match(cookie, /^__Host-pivotkit-dl=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}; Max-Age=\d+; Path=\/; HttpOnly; SameSite=Lax; Secure$/);
        // the cookie lives as long as the repeat window, not the sign-in's ten minutes
        const maxAge = Number(/Max-Age=(\d+)/.exec(cookie)?.[1]);
        assert.ok(maxAge > 110 && maxAge <= 120, String(maxAge));
        const again = await call(url, { method: "POST", headers: { origin: PUBLIC, accept: "application/json" } });
        assert.equal(again.status, 409);
        assert.equal(again.data.code, "LINK_USED");
        assert.match(again.data.detail, /This link was already used\. If you downloaded the report earlier, look in the downloads of the browser you used\. Otherwise ask whoever made the report to make it again\./);
        const repeat = await fetch(url, { method: "POST", headers: { "sec-fetch-site": "same-origin", cookie: cookieOf(first) } });
        assert.equal(repeat.status, 200, "the same browser within two minutes");
        // a cookie whose signature does not hold is no cookie
        const tampered = cookieOf(first).replace(/.$/, (c) => (c === "A" ? "B" : "A"));
        assert.equal((await fetch(url, { method: "POST", headers: { origin: PUBLIC, cookie: tampered } })).status, 409);
        // the marker sits in the output directory, where a second replica sees it
        const markers = readdirSync(join(dir, "out", ".pivotkit-downloads"));
        assert.equal(markers.length, 1);
        assert.match(markers[0], /^[A-Za-z0-9_-]{22}\.used$/);
        assert.ok(output.name.startsWith(markers[0].replace(".used", "-")));
    } finally {
        await server.close();
    }
});

test("once: of twenty POSTs at the same time exactly one gets the file", async () => {
    const { server, local, render } = await onceServer();
    try {
        const url = local((await render("Race")).url);
        const answers = await Promise.all(Array.from({ length: 20 }, () => fetch(url, { method: "POST", headers: { origin: PUBLIC } }).then(async (r) => ({ status: r.status, body: await r.text() }))));
        assert.deepEqual(answers.map((a) => a.status).sort(), [200, ...Array(19).fill(409)]);
    } finally {
        await server.close();
    }
});

test("once: the page names the file, its kind, size and expiry; after the download a used link says so at GET to every other browser, while the browser that took it sees when its repeat ends", async () => {
    const { dir, server, local, render } = await onceServer();
    try {
        const output = await render("Q3 sales by region");
        const url = local(output.url);
        const size = readFileSync(join(dir, "out", output.name)).length;
        const page = await fetch(url, { headers: { accept: "text/html" } });
        const html = await page.text();
        assert.match(html, /<title>Download the report - pivotkit report<\/title>/);
        assert.match(html, /<p class="file">Q3 sales by region\.csv<\/p>/);
        const expiry = new Date(Date.parse(/** @type {string} */ (output.expiresAt))).toISOString();
        assert.match(html, new RegExp(`<p>CSV file, ${size} bytes\\. <span id="until">It can be downloaded once, until <time datetime="${expiry}">${expiry.slice(0, 10)} ${expiry.slice(11, 16)} UTC</time>\\.</span></p>`));
        // shown after the click, by the page's script; the time the browser's own zone
        // after the click the page's script says it, in the repeat window's minutes
        assert.match(html, /textContent='Downloaded once\. You can repeat it for 2 minutes, in this browser\.'/);
        assert.match(html, /timeZoneName:'short'/);
        assert.match(html, /document\.getElementById\('until'\)\?\.remove\(\)/, "the click takes the sentence about when away");
        assertPageCsp(page.headers.get("content-security-policy"), html);

        const first = await fetch(url, { method: "POST", headers: { origin: PUBLIC } });
        assert.equal(first.status, 200);
        await first.arrayBuffer();
        // another browser: the used state at once, as a page and as a problem, without a button
        const other = await fetch(url, { headers: { accept: "text/html" } });
        assert.equal(other.status, 409);
        const otherHtml = await other.text();
        assert.match(otherHtml, /<title>Link already used - pivotkit report<\/title>/);
        assert.match(otherHtml, /<h1>Link already used<\/h1><p>This link was already used\. If you downloaded the report earlier, look in the downloads of the browser you used\. Otherwise ask whoever made the report to make it again\.<\/p>/);
        assert.doesNotMatch(otherHtml, /<form|<button/);
        assertPageCsp(other.headers.get("content-security-policy"), otherHtml);
        assert.equal((await fetch(url, { method: "HEAD" })).status, 409);
        const problem = await call(url, { headers: { accept: "application/json" } });
        assert.equal(problem.status, 409);
        assert.equal(problem.data.code, "LINK_USED");
        // the browser that took it: the page with its button, and until when it may repeat
        const mine = await fetch(url, { headers: { accept: "text/html", cookie: cookieOf(first) } });
        assert.equal(mine.status, 200);
        const mineHtml = await mine.text();
        assert.match(mineHtml, /<form method="post"><button type="submit">Download<\/button><\/form>/);
        const until = /<span id="until">You downloaded it in this browser a moment ago and can download it again until <time datetime="([^"]+)">/.exec(mineHtml)?.[1];
        assert.ok(until && Math.abs(Date.parse(until) - Date.now() - 120_000) < 5000, String(until));
        // a GET never uses a link: an unused one stays unused after many
        const fresh = local((await render("Fresh")).url);
        for (let i = 0; i < 3; i++) {
            assert.equal((await fetch(fresh, { headers: { accept: "text/html" } })).status, 200);
        }
        assert.equal((await fetch(fresh, { method: "POST", headers: { origin: PUBLIC } })).status, 200);
    } finally {
        await server.close();
    }
});

test("once: a repeat entry whose two minutes are over is no repeat: 409 at GET and at POST", async () => {
    const { server, local, render } = await onceServer();
    try {
        const output = await render("Late");
        const url = local(output.url);
        const first = await fetch(url, { method: "POST", headers: { origin: PUBLIC } });
        assert.equal(first.status, 200);
        await first.arrayBuffer();
        // the same browser's cookie as the server signs it, its entry past its time
        const n = /** @type {any} */ (readToken(KEYS, output.url.split("/downloads/")[1])).n;
        const body = Buffer.from(JSON.stringify({ [`o:${n}`]: { x: Math.floor(Date.now() / 1000) - 1 } })).toString("base64url");
        const late = `__Host-pivotkit-dl=${body}.${createHmac("sha256", KEYS.cookie).update(body).digest("base64url")}`;
        const page = await fetch(url, { headers: { accept: "text/html", cookie: late } });
        assert.equal(page.status, 409);
        assert.doesNotMatch(await page.text(), /<button/);
        assert.equal((await fetch(url, { method: "POST", headers: { origin: PUBLIC, cookie: late } })).status, 409);
        // the same cookie with its entry still in time repeats: the check is the time, not the cookie
        const inTime = Buffer.from(JSON.stringify({ [`o:${n}`]: { x: Math.floor(Date.now() / 1000) + 60 } })).toString("base64url");
        assert.equal((await fetch(url, { method: "POST", headers: { origin: PUBLIC, cookie: `__Host-pivotkit-dl=${inTime}.${createHmac("sha256", KEYS.cookie).update(inTime).digest("base64url")}` } })).status, 200);
    } finally {
        await server.close();
    }
});

test("pages: a failure of the server's own names the request id on the page", async () => {
    const dir = workspace();
    // a key file that cannot be read: the route answers 500
    const server = await restServer({ sources: SOURCES, output: { dir: "out", downloads: { bind: "once", key: { file: "no-such-key.txt" } } }, http: { publicUrl: PUBLIC }, baseDir: dir });
    try {
        const token = signToken(KEYS, { n: randomBytes(16).toString("base64url"), e: Math.floor(Date.now() / 1000) + 60, b: "once" });
        const page = await fetch(`${server.url}/downloads/${token}`, { headers: { accept: "text/html" } });
        assert.equal(page.status, 500);
        assert.match(await page.text(), /<p class="ref">Request id: [A-Za-z0-9_-]{11}<\/p>/);
    } finally {
        await server.close();
    }
});

test("pages: every answer has its own title and heading; an error page and a problem name the request id the log line carries", async () => {
    const { dir, server, local, render } = await onceServer();
    try {
        const output = await render("Titles");
        const payload = /** @type {any} */ (readToken(KEYS, output.url.split("/downloads/")[1]));
        const expired = `${server.url}/downloads/${signToken(KEYS, { ...payload, e: Math.floor(Date.now() / 1000) - 1 })}`;
        const removed = `${server.url}/downloads/${signToken(KEYS, { ...payload, n: randomBytes(16).toString("base64url") })}`;
        const pages = {
            "Link not found": `${server.url}/downloads/not-a-token`,
            "Link expired": expired,
            "Report removed": removed
        };
        const titles = new Set();
        for (const [heading, url] of Object.entries(pages)) {
            const html = await (await fetch(url, { headers: { accept: "text/html" } })).text();
            assert.match(html, new RegExp(`<title>${heading} - pivotkit report</title>`));
            assert.match(html, new RegExp(`<h1>${heading}</h1>`));
            // the request id on a page only where the server failed (500 or more); the problem names it always
            assert.doesNotMatch(html, /Request id/);
            titles.add(/<title>([^<]*)<\/title>/.exec(html)?.[1]);
        }
        const forbidden = await (await fetch(local(output.url), { method: "POST", headers: { origin: "https://evil.example.com" } })).text();
        assert.match(forbidden, /<title>Download not started from its page - pivotkit report<\/title>/);
        assert.equal(titles.size, 3);

        // the 404 problem names a request id (it has a debug line only); a 410 names the id of its download line
        const missing = await call(`${server.url}/downloads/not-a-token`, { headers: { accept: "application/json" } });
        assert.equal(missing.status, 404);
        assert.deepEqual(Object.keys(missing.data), ["type", "title", "status", "code", "detail", "requestId"]);
        assert.match(missing.data.requestId, /^[A-Za-z0-9_-]{11}$/);
        const gone = await call(expired, { headers: { accept: "application/json" } });
        assert.equal(gone.status, 410);
        const line = server.log.findLast((l) => l.event === "download" && l.code === "LINK_EXPIRED");
        assert.equal(gone.data.requestId, line?.requestId);
        assert.ok(readdirSync(join(dir, "out")).some((n) => n.endsWith("Titles.pivotkit-out.csv")));
    } finally {
        await server.close();
    }
});

test("sizeText: bytes, then KB and MB of 1024 with one decimal below 10", () => {
    assert.deepEqual([0, 1, 1023, 1024, 1536, 10_240, 1_048_575, 1_048_576, 5_452_595, 734_003_200].map(sizeText), ["0 bytes", "1 byte", "1023 bytes", "1 KB", "1.5 KB", "10 KB", "1024 KB", "1 MB", "5.2 MB", "700 MB"]);
});

test("once on REST and MCP on one port (serve): a browser's form POST with its Origin reaches the link (http.allowOrigins is for MCP clients); the tool result carries a resource_link without the size", async () => {
    const { server, local } = await onceServer();
    try {
        const { Client, StreamableHTTPClientTransport } = await import("@modelcontextprotocol/client");
        const client = new Client({ name: "test", version: "1.0.0" });
        await client.connect(new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`)));
        const result = /** @type {any} */ (await client.callTool({ name: "render_view", arguments: { source: "sales", view: BY_REGION, format: "xlsx", name: "Für Anna" } }));
        await client.close();
        const [text, link] = result.content;
        assert.equal(text.type, "text");
        assert.match(text.text, /Open the link in your browser and download the report; the link works once/);
        assert.equal(link.type, "resource_link");
        assert.equal(link.uri, result.structuredContent.output.url);
        // the stored name is cleaned to ASCII (pivotkit-cli's cleanFileName); Content-Disposition's UTF-8 form is tested above
        assert.equal(link.name, "Fur Anna.xlsx");
        assert.equal(link.title, "Fur Anna");
        assert.equal(link.mimeType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        assert.deepEqual(link.annotations, { audience: ["user"] });
        assert.equal(link.size, undefined, "the size of a report the assistant was not shown is withheld");
        const got = await fetch(local(link.uri), { method: "POST", headers: { origin: PUBLIC } });
        assert.equal(got.status, 200);
        assert.equal(got.headers.get("content-disposition"), `attachment; filename="Fur Anna.xlsx"; filename*=UTF-8''Fur%20Anna.xlsx`);
        assert.equal(Buffer.from(await got.arrayBuffer()).subarray(0, 2).toString(), "PK");
    } finally {
        await server.close();
    }
});

// --- sign-in links ---------------------------------------------------------------------------------

/** A server whose closed sources get sign-in links, its issuer loaded. */
async function signInServer({ signIn = {}, downloads = {}, more = {} } = {}) {
    const dir = workspace({ "sales.csv": SALES_CSV });
    const server = await restServer(
        {
            sources: SOURCES,
            output: { dir: "out", downloads: { key: { env: "DL_KEY" }, signIn: { clientId: CLIENT_ID, ...signIn }, ...downloads } },
            policy: { results: true },
            auth: { mode: "oauth", issuer, resource: MCP_RESOURCE, allowInsecureIssuer: true, requiredScopes: ["pivotkit"] },
            http: { publicUrl: PUBLIC },
            baseDir: dir,
            ...more
        },
        { env: { DL_KEY }, enable: ["rest", "mcp"] }
    );
    for (let i = 0; i < 100 && (await call(`${server.url}/readyz`)).status !== 200; i++) {
        await new Promise((r) => setTimeout(r, 30));
    }
    const local = (url) => url.replace(PUBLIC, server.url);
    /** render_view as `sub` over REST: its output. */
    const render = async (sub, source = "sales") => {
        const r = await call(`${server.api}/views/render`, { token: await accessToken(sub), body: { source, view: BY_REGION, format: "csv", name: "Signed" } });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        return r.data.output;
    };
    /** Opens a link: the redirect to the provider, its cookie. */
    const open = async (url) => {
        for (let i = 0; i < 100; i++) {
            const r = await fetch(local(url), { redirect: "manual" });
            if (r.status !== 503) {
                return r;
            }
            await new Promise((resolve) => setTimeout(resolve, 30));
        }
        throw new Error("the sign-in issuer did not load");
    };
    const callback = (code, state, cookie) => fetch(`${server.url}/downloads/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`, { headers: { cookie, accept: "text/html" } });
    return { dir, server, local, render, open, callback };
}

test("signIn: the person who asked opens the report after signing in; PKCE, state and nonce are checked; another person gets 403", async () => {
    const { dir, server, render, open, callback } = await signInServer();
    try {
        const output = await render("alice");
        assert.equal(output.bound, "signIn");
        assert.equal(output.note, "Open the link in your browser and sign in; it works for 60 minutes.");
        assert.ok(output.url.startsWith(`${PUBLIC}/downloads/`));
        // the subject is not readable from the link
        assert.doesNotMatch(Buffer.from(output.url.split("/downloads/")[1].split(".")[0], "base64url").toString(), /alice/);
        const redirect = await open(output.url);
        assert.equal(redirect.status, 302);
        assertBaseHeaders(redirect.headers);
        assert.match(redirect.headers.get("set-cookie") ?? "", /^__Host-pivotkit-dl=.+; Max-Age=600; Path=\/; HttpOnly; SameSite=Lax; Secure$/);
        const cookie = cookieOf(redirect);
        const { code, state } = signInAt(/** @type {string} */ (redirect.headers.get("location")), "alice");
        const got = await callback(code, state, cookie);
        assert.equal(got.status, 200);
        assert.deepEqual(Buffer.from(await got.arrayBuffer()), readFileSync(join(dir, "out", output.name)));
        assert.equal(got.headers.get("content-security-policy"), "sandbox; default-src 'none'");
        assert.match(got.headers.get("set-cookie") ?? "", /^__Host-pivotkit-dl=; Max-Age=0/, "no session outlives the download");
        // the state is used once: the cookie the answer sets holds it no more
        const replay = await callback(code, state, cookieOf(got));
        assert.equal(replay.status, 400);

        // bob signs in for alice's report
        const second = await open(output.url);
        const bob = signInAt(/** @type {string} */ (second.headers.get("location")), "bob");
        const refused = await callback(bob.code, bob.state, cookieOf(second));
        assert.equal(refused.status, 403);
        assert.match(await refused.text(), /You are signed in as a different account than the one that asked for this report\./);
    } finally {
        await server.close();
    }
});

test("signIn: the subject digest holds the link's nonce: two links of one person cannot be tied together, and a digest moved to another link is refused", async () => {
    const { server, render, open, callback } = await signInServer();
    try {
        const first = /** @type {any} */ (readToken(KEYS, (await render("alice")).url.split("/downloads/")[1]));
        const second = /** @type {any} */ (readToken(KEYS, (await render("alice")).url.split("/downloads/")[1]));
        assert.notEqual(first.s, second.s, "the same person's links carry different digests");
        // the first link's digest on the second link's nonce, signed with the right key: alice is still refused
        const moved = signToken(KEYS, { ...second, s: first.s });
        const redirect = await open(`${PUBLIC}/downloads/${moved}`);
        const { code, state } = signInAt(/** @type {string} */ (redirect.headers.get("location")), "alice");
        const got = await callback(code, state, cookieOf(redirect));
        assert.equal(got.status, 403);
    } finally {
        await server.close();
    }
});

test("signIn: a report over data sent in the request gets a link only its sender can open; a caller without a usable subject gets none", async () => {
    const { server } = await signInServer({ more: { policy: { results: true, data: true } } });
    try {
        const data = { columns: ["Region", "Sales"], rows: [["North", 10], ["South", 20]], rowCount: 2 };
        const mine = await call(`${server.api}/views/render`, { token: await accessToken("alice"), body: { source: "inline:", data, view: BY_REGION, format: "csv", name: "Mine" } });
        assert.equal(mine.status, 200, JSON.stringify(mine.data));
        assert.equal(mine.data.output.bound, "signIn");
        const nobody = await call(`${server.api}/views/render`, { token: await accessToken("x".repeat(300)), body: { source: "inline:", data, view: BY_REGION, format: "csv", name: "Nobody" } });
        assert.equal(nobody.status, 200, JSON.stringify(nobody.data));
        assert.equal(nobody.data.output.url, undefined);
        assert.equal(nobody.data.output.note, NO_LINK_NOTE);
    } finally {
        await server.close();
    }
});

test("signIn: with audit.subject a link's download names the person who signed in, the refused one too; without it no one", async () => {
    const audited = await signInServer({ more: { audit: { subject: "plain" } } });
    try {
        const output = await audited.render("alice");
        const redirect = await audited.open(output.url);
        const alice = signInAt(/** @type {string} */ (redirect.headers.get("location")), "alice");
        assert.equal((await audited.callback(alice.code, alice.state, cookieOf(redirect))).status, 200);
        const again = await audited.open(output.url);
        const bob = signInAt(/** @type {string} */ (again.headers.get("location")), "bob");
        assert.equal((await audited.callback(bob.code, bob.state, cookieOf(again))).status, 403);
        const downloads = audited.server.log.filter((l) => l.event === "download" && l.via === "link");
        assert.ok(downloads.some((l) => l.ok === true && l.subject === "alice"), JSON.stringify(downloads));
        assert.ok(downloads.some((l) => l.code === "LINK_NOT_YOURS" && l.subject === "bob"), JSON.stringify(downloads));
    } finally {
        await audited.server.close();
    }
    const plain = await signInServer();
    try {
        const output = await plain.render("alice");
        const redirect = await plain.open(output.url);
        const alice = signInAt(/** @type {string} */ (redirect.headers.get("location")), "alice");
        assert.equal((await plain.callback(alice.code, alice.state, cookieOf(redirect))).status, 200);
        assert.ok(plain.server.log.filter((l) => l.event === "download").every((l) => l.subject === undefined));
    } finally {
        await plain.server.close();
    }
});

test("signIn: a wrong nonce, audience, issuer, key or verifier fail with a fixed text; a missing or foreign cookie says the sign-in page is out of date; the provider's error says the sign-in was cancelled", async () => {
    const { server, render, open, callback } = await signInServer();
    try {
        const output = await render("alice");
        const attempt = async (grant, { cookie: change } = {}) => {
            const redirect = await open(output.url);
            const location = /** @type {string} */ (redirect.headers.get("location"));
            const { code, state } = signInAt(location, "alice", grant);
            const cookie = change ? change(cookieOf(redirect)) : cookieOf(redirect);
            return callback(code, state, cookie);
        };
        const bad = [
            await attempt({ nonce: "another-nonce-value-0000" }),
            await attempt({ aud: "another-client" }),
            // several audiences without this client as azp, and with another azp (OpenID Connect Core 3.1.3.7)
            await attempt({ aud: [CLIENT_ID, "another-client"] }),
            await attempt({ aud: [CLIENT_ID, "another-client"], claims: { azp: "another-client" } }),
            await attempt({ iss: "https://elsewhere.example.com" }),
            await attempt({ signWith: otherKey.privateKey }),
            await attempt({ challenge: "not-the-challenge" })
        ];
        for (const r of bad) {
            assert.equal(r.status, 400);
            const html = await r.text();
            assert.match(html, /<title>Sign-in failed - pivotkit report<\/title>/);
            assert.match(html, /The sign-in did not complete\. Open the download link you were sent once more \(not this page\) to try again\./);
        }
        // no sign-in of this browser under way (no cookie, a foreign one): a tab left open, a reload, another browser
        for (const r of [await attempt({}, { cookie: () => "" }), await attempt({}, { cookie: (c) => c.replace(/\.[A-Za-z0-9_-]{43}$/, `.${"A".repeat(43)}`) })]) {
            assert.equal(r.status, 400);
            const html = await r.text();
            assert.match(html, /<title>Sign-in page out of date - pivotkit report<\/title>/);
            assert.match(html, /This sign-in was already used, is older than 10 minutes, or was started in another browser\. Open the download link you were sent once more, in this browser\./);
        }
        // several audiences with this client as azp: the person gets the file
        assert.equal((await attempt({ aud: [CLIENT_ID, "another-client"], claims: { azp: CLIENT_ID } })).status, 200);
        // the provider's own words are not shown
        const redirect = await open(output.url);
        const { state } = signInAt(/** @type {string} */ (redirect.headers.get("location")), "alice");
        const denied = await fetch(`${server.url}/downloads/callback?error=access_denied&error_description=${encodeURIComponent("<script>alert(1)</script>")}&state=${state}`, { headers: { cookie: cookieOf(redirect) } });
        assert.equal(denied.status, 400);
        const deniedPage = await denied.text();
        assert.doesNotMatch(deniedPage, /script|access_denied/);
        assert.match(deniedPage, /<h1>Not signed in<\/h1><p>You were not signed in\. The sign-in was cancelled or the sign-in service refused it\. To get the report, open the download link you were sent once more and sign in\.<\/p>/);
        assert.match(denied.headers.get("set-cookie") ?? "", /Max-Age=0/);
        assert.ok(server.log.some((l) => l.event === "download" && l.code === "SIGN_IN_FAILED" && l.reason === "issuer"), "logged under its code");
        // the same error without this browser's sign-in (a crafted address) cannot pick the text: out of date
        const crafted = await call(`${server.url}/downloads/callback?error=access_denied&state=${state}`, { headers: { accept: "application/json" } });
        assert.equal(crafted.status, 400);
        assert.equal(crafted.data.code, "SIGN_IN_FAILED");
        assert.match(crafted.data.detail, /^This sign-in was already used/);
    } finally {
        await server.close();
    }
});

test("signIn: the callback checks the link's expiry again; reports over open sources keep plain links; a caller without a usable subject gets none", async () => {
    const { server, local, render, open, callback } = await signInServer();
    try {
        assert.equal((await render("alice", "open")).bound, "none");
        const output = await render("alice");
        const redirect = await open(output.url);
        const { code, state } = signInAt(/** @type {string} */ (redirect.headers.get("location")), "alice");
        // the token in the cookie is the link's: an expired one of the same nonce is not let through
        const payload = /** @type {any} */ (readToken(KEYS, output.url.split("/downloads/")[1]));
        assert.equal(payload.s, subjectDigest(KEYS, payload.n, issuer, "alice"));
        const ok = await callback(code, state, cookieOf(redirect));
        assert.equal(ok.status, 200);
        const expired = signToken(KEYS, { ...payload, e: Math.floor(Date.now() / 1000) - 1 });
        assert.equal((await fetch(local(`${PUBLIC}/downloads/${expired}`), { redirect: "manual" })).status, 410);
        // an access token whose subject claim is unusable (longer than 256 characters): no identity, no link
        const r = await call(`${server.api}/views/render`, { token: await accessToken("x".repeat(300)), body: { source: "sales", view: BY_REGION, format: "csv", name: "Nobody" } });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.equal(r.data.output.url, undefined);
        assert.equal(r.data.output.note, NO_LINK_NOTE);
    } finally {
        await server.close();
    }
});

test("signIn: while the sign-in issuer is not loaded a link answers 503; REST callers without results get no link to a closed report", async () => {
    // a provider whose metadata serves access tokens (keys) but names no sign-in endpoints: the
    // server takes calls, its sign-in links wait for metadata they can use
    const half = createServer((req, res) => {
        res.writeHead(req.url === "/jwks" || req.url === "/.well-known/openid-configuration" ? 200 : 404, { "content-type": "application/json" });
        res.end(req.url === "/jwks" ? JSON.stringify({ keys: [jwk] }) : JSON.stringify({ issuer: halfIssuer, jwks_uri: `${halfIssuer}/jwks` }));
    });
    await new Promise((resolve) => half.listen(0, "127.0.0.1", resolve));
    const halfIssuer = `http://127.0.0.1:${/** @type {any} */ (half.address()).port}`;
    after(() => new Promise((resolve) => half.close(resolve)));
    const dir = workspace();
    const server = await restServer(
        {
            sources: SOURCES,
            output: { dir: "out", downloads: { key: { env: "DL_KEY" }, signIn: { clientId: CLIENT_ID } } },
            policy: { profiles: { reader: { results: false } }, results: true },
            auth: { mode: "oauth", issuer: halfIssuer, resource: MCP_RESOURCE, allowInsecureIssuer: true, clientProfiles: { "report-bot": "reader" } },
            http: { publicUrl: PUBLIC },
            baseDir: dir
        },
        { env: { DL_KEY }, enable: ["rest", "mcp"] }
    );
    try {
        for (let i = 0; i < 100 && (await call(`${server.url}/readyz`)).status !== 200; i++) {
            await new Promise((r) => setTimeout(r, 30));
        }
        const r = await call(`${server.api}/views/render`, { token: await accessToken("alice", REST_RESOURCE, "claude", halfIssuer), body: { source: "sales", view: BY_REGION, format: "csv", name: "Waiting" } });
        assert.equal(r.data.output.bound, "signIn");
        const waiting = await call(r.data.output.url.replace(PUBLIC, server.url), { headers: { accept: "application/json" } });
        assert.equal(waiting.status, 503);
        assert.equal(waiting.headers.get("retry-after"), "5");
        // a REST program whose profile may not take files (results false) gets no link to a closed report
        const bot = await call(`${server.api}/views/render`, { token: await accessToken("alice", REST_RESOURCE, "report-bot", halfIssuer), body: { source: "sales", view: BY_REGION, format: "csv", name: "Bot" } });
        assert.equal(bot.status, 200, JSON.stringify(bot.data));
        assert.equal(bot.data.output.url, undefined);
        assert.equal(bot.data.output.note, NO_LINK_NOTE);
        // its link to an open report stays
        const openBot = await call(`${server.api}/views/render`, { token: await accessToken("alice", REST_RESOURCE, "report-bot", halfIssuer), body: { source: "open", view: BY_REGION, format: "csv", name: "Bot" } });
        assert.equal(openBot.data.output.bound, "none");
    } finally {
        await server.close();
    }
});

test("the log of every kind of download names its binding and outcome, never a token, a code, a state or a cookie", async () => {
    const { server, render, open, callback } = await signInServer();
    try {
        const output = await render("alice");
        const token = output.url.split("/downloads/")[1];
        const redirect = await open(output.url);
        const cookie = cookieOf(redirect);
        const { code, state } = signInAt(/** @type {string} */ (redirect.headers.get("location")), "alice");
        assert.equal((await callback(code, state, cookie)).status, 200);
        await callback(code, state, cookie);
        await fetch(`${server.url}/downloads/${token.slice(0, -3)}xyz`);
        const text = logText(server);
        for (const secret of [token, token.split(".")[0], token.split(".")[1], code, state, cookie.split("=")[1], DL_KEY]) {
            assert.ok(!text.includes(secret), `the log holds ${secret.slice(0, 12)}...`);
        }
        const downloads = server.log.filter((l) => l.event === "download" && l.via === "link");
        assert.ok(downloads.some((l) => l.bound === "signIn" && l.ok === true));
        // a link that does not exist is on the debug log only (a scan would fill the log)
        assert.ok(!downloads.some((l) => l.code === "NOT_FOUND"));
        assert.ok(downloads.every((l) => /^[A-Za-z0-9_-]{11}$/.test(l.requestId)));
    } finally {
        await server.close();
    }
});

// --- check-config -------------------------------------------------------------------------------------

test("check-config: where links point, which sources get which link, the redirect address to register, and the warnings", async () => {
    const dir = workspace();
    const sources = { sales: { file: "data/sales.csv" }, open: { file: "data/sales.csv", policy: { default: "show" } } };
    const signedIn = await checkConfig({ sources, output: { dir: "out", downloads: { signIn: { clientId: CLIENT_ID } } }, auth: { mode: "oauth", issuer: "https://auth.example.com/", resource: MCP_RESOURCE }, http: { publicUrl: PUBLIC }, baseDir: dir }, { http: true, env: {}, rest: true });
    const signIn = { text: factsOf(signedIn.text) };
    assert.match(signIn.text, /^Delivery:\n {2}download links: https:\/\/reports\.example\.com\/downloads\/<token>\n {4}route \/downloads to this service\n {4}expire after 60 minutes$/m);
    // "sign-in" only for people: the links are "download links (signed in)"
    assert.match(signIn.text, /^ {2}reports over closed sources \(sales\): download links \(signed in\)\n {4}register https:\/\/reports\.example\.com\/downloads\/callback at the provider for the client pivotkit-downloads\n {4}it must give the same subject \(claim sub\) as the MCP client\n {4}REST programs get them only with results: true$/m);
    assert.match(signIn.text, /^ {2}reports over open sources \(open\): plain links$/m);
    // why a source counts as closed: open needs default "show" and no field below it
    assert.match(signIn.text, /^ {2}closed \(a field not shown for someone\): sales \(fields summary by default\)$/m);
    const why = await checkConfig({ sources: { listed: { file: "data/sales.csv", policy: { default: "show", fields: { Customer: "values" } } }, profiled: { file: "data/sales.csv", policy: { default: "show" } } }, policy: { profiles: { reader: { default: "summary" } } }, output: { dir: "out" }, baseDir: dir }, { http: true, env: {} });
    assert.match(factsOf(why.text), /closed \(a field not shown for someone\): listed \(Customer values\), profiled \(profile reader: fields summary by default\)/);
    assert.match(signIn.text, /^WARNING \(Delivery\): output\.downloads\.key is not set: links stop working on a restart and on another replica$/m);
    assert.match(signIn.text, /\nNew in this version: [^\n]*download links under \/downloads/);

    const once = await checkConfig({ sources, output: { dir: "out", downloads: { bind: "once", key: { env: "DL_KEY" } } }, baseDir: dir }, { http: true, env: { DL_KEY: "short" } });
    assert.match(once.text, /reports over closed sources \(sales\): one-time links/);
    assert.match(factsOf(once.text), /WARNING \(Delivery\): one-time links: anyone who sees the link can use it once, including an assistant with a browser or code tool; use bind "signIn" where that matters/);
    // the server starts with a short key (it logs it), and reports get no links until it is fixed
    assert.match(factsOf(once.text), /PROBLEM: output\.downloads\.key is shorter than 32 bytes; make one with: openssl rand -base64 48 -> the server starts; reports get no download links until it can be read/);
    assert.equal(once.problems, 1);
    assert.equal(once.stops, 0);

    const baseUrl = await checkConfig({ sources, output: { dir: "out", baseUrl: "https://files.example.com/" }, baseDir: dir }, { http: false, env: {} });
    assert.match(baseUrl.text, /reports over closed sources \(sales\): no address under output\.baseUrl/);
    assert.match(factsOf(baseUrl.text), /\nNew in this version: [^\n]*no output\.baseUrl address for closed sources/);

    const stdio = await checkConfig({ sources, output: { dir: "out" }, baseDir: dir }, { http: false, env: {} });
    assert.doesNotMatch(stdio.text, /Delivery:/);

    const wide = await checkConfig({ sources, output: { dir: "out" }, auth: { mode: "token" }, http: { host: "0.0.0.0" }, baseDir: dir }, { http: true, env: {} });
    assert.match(factsOf(wide.text), /download links: none, the server listens on 0\.0\.0\.0 and http\.publicUrl is not set/);
});

test("deliver: a source whose state is not known counts as closed (no output.baseUrl address); an open one keeps it", async () => {
    const dir = tempDir();
    const context = await createContext({ output: { dir: join(dir, "out"), baseUrl: "https://files.example.com/reports/" } }, { stderr: { write() {} } });
    try {
        const file = { bytes: new TextEncoder().encode("a,b\n1,2\n"), mediaType: "text/csv;charset=utf-8", extension: "csv", name: "Unknown" };
        const how = { caller: { scopes: null, client: "local", profile: null }, surface: /** @type {const} */ ("mcp"), policy: /** @type {any} */ ({}) };
        const unknown = await deliver(context, file, { ...how, sourceClosed: undefined });
        assert.equal(unknown?.url, undefined);
        assert.equal(unknown?.note, NO_LINK_NOTE);
        const open = await deliver(context, file, { ...how, sourceClosed: false });
        assert.match(String(open?.url), /^https:\/\/files\.example\.com\/reports\/[A-Za-z0-9_-]{22}-Unknown\.pivotkit-out\.csv$/);
        assert.equal(open?.note, undefined);
    } finally {
        await context.close();
    }
});

test("markers: written whole and exclusive; the sweep deletes an expired one, keeps a live, an empty and a damaged one, and a fresh temporary file", async () => {
    const dir = join(tempDir(), ".pivotkit-downloads");
    mkdirSync(dir);
    const now = Math.floor(Date.now() / 1000);
    const nonce = () => randomBytes(16).toString("base64url");
    const [expired, live, empty, damaged] = [nonce(), nonce(), nonce(), nonce()];
    await placeMarker(join(dir, `${expired}.used`), now - 1);
    await placeMarker(join(dir, `${live}.used`), now + 3600);
    // a second writer of the same link loses, and the marker keeps the first writer's whole content
    await assert.rejects(placeMarker(join(dir, `${live}.used`), now + 1), { code: "EEXIST" });
    assert.equal(readFileSync(join(dir, `${live}.used`), "utf8"), `${now + 3600}\n`);
    writeFileSync(join(dir, `${empty}.used`), "");
    writeFileSync(join(dir, `${damaged}.used`), "soon");
    const freshTemp = join(dir, `.${nonce()}.abcdefgh.tmp`);
    const oldTemp = join(dir, `.${nonce()}.ijklmnop.tmp`);
    writeFileSync(freshTemp, "1");
    writeFileSync(oldTemp, "1");
    utimesSync(oldTemp, new Date(Date.now() - 7_200_000), new Date(Date.now() - 7_200_000));
    await sweepMarkers(dir, now);
    assert.equal(existsSync(join(dir, `${expired}.used`)), false);
    assert.equal(existsSync(join(dir, `${live}.used`)), true);
    assert.equal(existsSync(join(dir, `${empty}.used`)), true, "a marker being written (or empty) stays: a used link stays used");
    assert.equal(existsSync(join(dir, `${damaged}.used`)), true);
    assert.equal(existsSync(freshTemp), true);
    assert.equal(existsSync(oldTemp), false);
    // no temporary file is left by a write
    assert.deepEqual(readdirSync(dir).filter((n) => n.endsWith(".tmp")).length, 1);
});

test("a rotated key takes effect without a restart: links of the old key answer 404, new links work", async () => {
    const dir = workspace();
    const env = { DL_KEY };
    const server = await restServer({ sources: SOURCES, output: { dir: "out", downloads: { key: { env: "DL_KEY" } } }, baseDir: dir }, { env });
    try {
        const render = async (name) => (await call(`${server.api}/views/render`, { body: { source: "open", view: BY_REGION, format: "csv", name } })).data.output;
        const before = await render("Before");
        assert.equal((await fetch(before.url)).status, 200);
        env.DL_KEY = "another-download-key-for-tests-that-is-long-enough-9876543210";
        assert.equal((await fetch(before.url)).status, 404);
        const after = await render("After");
        assert.equal((await fetch(after.url)).status, 200);
        assert.equal(readToken(KEYS, after.url.split("/downloads/")[1]), null);
    } finally {
        await server.close();
    }
});

test("a key that cannot be read: a warning at start, and reports get no link, their plain name and the operator's note", async () => {
    const dir = workspace();
    const server = await restServer({ sources: SOURCES, output: { dir: "out", downloads: { key: { env: "DL_KEY" } } }, baseDir: dir }, { env: { DL_KEY: "too-short" } });
    try {
        for (let i = 0; i < 50 && !server.log.some((l) => /key cannot be read/.test(l.message ?? "")); i++) {
            await new Promise((r) => setTimeout(r, 20));
        }
        assert.ok(server.log.some((l) => l.event === "warning" && /download links: the key cannot be read, so reports get no links/.test(l.message)), JSON.stringify(server.log));
        const r = await call(`${server.api}/views/render`, { body: { source: "open", view: BY_REGION, format: "csv", name: "Keyless" } });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.equal(r.data.output.name, "Keyless.pivotkit-out.csv");
        assert.equal(r.data.output.url, undefined);
        assert.equal(r.data.output.note, NO_LINK_NOTE);
        assert.match(r.data.message, /^The report is saved on the server; ask the operator how to open it\./);
        assert.doesNotMatch(r.data.message, /Keyless\.pivotkit-out/);
        // the key never reaches the log
        assert.ok(!JSON.stringify(server.log).includes("too-short"));
    } finally {
        await server.close();
    }
});

test("no random-key warning where no report can get a link (only closed sources, no binding)", async () => {
    const dir = workspace();
    const server = await restServer({ sources: { sales: { file: "data/sales.csv" } }, output: { dir: "out" }, baseDir: dir });
    try {
        await new Promise((r) => setTimeout(r, 100));
        assert.ok(!server.log.some((l) => /random key/.test(l.message ?? "")), JSON.stringify(server.log));
    } finally {
        await server.close();
    }
});

test("resource_link: the title loses only the output's own extension", () => {
    const base = { name: "x", mediaType: "text/csv", url: "https://reports.example.com/downloads/t" };
    assert.equal(resourceLinkOf({ ...base, filename: "Q3.2026.csv" }, { bytes: 10, closed: false })?.title, "Q3.2026");
    assert.equal(resourceLinkOf({ ...base, filename: "Weekly.report.json" }, { bytes: 10, closed: false })?.title, "Weekly");
    assert.equal(resourceLinkOf({ ...base, filename: "v1.2" }, { bytes: 10, closed: false })?.title, "v1.2");
});

test("once: a POST sweeps the markers of expired links from the output directory", async () => {
    const { dir, server, local, render } = await onceServer();
    try {
        const output = await render("Sweep");
        const markers = join(dir, "out", ".pivotkit-downloads");
        mkdirSync(markers, { recursive: true });
        const old = join(markers, `${randomBytes(16).toString("base64url")}.used`);
        writeFileSync(old, `${Math.floor(Date.now() / 1000) - 60}\n`);
        assert.equal((await fetch(local(output.url), { method: "POST", headers: { origin: PUBLIC } })).status, 200);
        for (let i = 0; i < 50 && existsSync(old); i++) {
            await new Promise((r) => setTimeout(r, 20));
        }
        assert.equal(existsSync(old), false, "the expired marker is gone");
        assert.equal(readdirSync(markers).filter((n) => n.endsWith(".used")).length, 1, "the new link's marker stays");
    } finally {
        await server.close();
    }
});

test("a sign-in callback without its cookie is on the debug log only", async () => {
    const { server } = await onceServer();
    try {
        const r = await fetch(`${server.url}/downloads/callback?code=x&state=${"A".repeat(22)}`);
        assert.equal(r.status, 400);
        assert.ok(!server.log.some((l) => l.event === "download" && l.code === "SIGN_IN_FAILED"), JSON.stringify(server.log));
    } finally {
        await server.close();
    }
});

test("signIn: the issuer's metadata cannot send the key request elsewhere; with auth.jwksUri the sign-in reads the keys there, as the access tokens do", async () => {
    // the metadata names a key set at a cloud metadata address; the operator pinned the real one
    metadataMore = { jwks_uri: "http://169.254.169.254/latest/meta-data/jwks" };
    issuerAsked.length = 0;
    const { server, render, open, callback } = await signInServer({ more: { auth: { mode: "oauth", issuer, resource: MCP_RESOURCE, allowInsecureIssuer: true, requiredScopes: ["pivotkit"], jwksUri: `${issuer}/jwks` } } });
    try {
        const output = await render("alice");
        const redirect = await open(output.url);
        const { code, state } = signInAt(/** @type {string} */ (redirect.headers.get("location")), "alice");
        const got = await callback(code, state, cookieOf(redirect));
        assert.equal(got.status, 200, logText(server));
        assert.ok(issuerAsked.includes("/jwks"));
    } finally {
        metadataMore = {};
        await server.close();
    }
    // without auth.jwksUri the sign-in issuer is refused, as the access tokens' is (the issuer's origin only)
    metadataMore = { jwks_uri: "http://169.254.169.254/latest/meta-data/jwks" };
    try {
        const dir = workspace({ "sales.csv": SALES_CSV });
        const server2 = await restServer({ sources: SOURCES, output: { dir: "out", downloads: { key: { env: "DL_KEY" }, signIn: { clientId: CLIENT_ID } } }, auth: { mode: "oauth", issuer, resource: MCP_RESOURCE, allowInsecureIssuer: true }, http: { publicUrl: PUBLIC }, baseDir: dir }, { env: { DL_KEY }, enable: ["rest", "mcp"] });
        try {
            for (let i = 0; i < 100 && !/download links: the sign-in issuer's metadata could not be loaded/.test(logText(server2)); i++) {
                await new Promise((r) => setTimeout(r, 30));
            }
            assert.match(logText(server2), /download links: the sign-in issuer's metadata could not be loaded.*jwks_uri is on another origin \(http:\/\/169\.254\.169\.254\)/);
        } finally {
            await server2.close();
        }
    } finally {
        metadataMore = {};
    }
});

test("signIn: the metadata's token endpoint must be on the issuer's origin; output.downloads.signIn.tokenUrl names another one", async () => {
    // the same token endpoint under another origin (localhost instead of 127.0.0.1)
    const elsewhere = `${issuer.replace("127.0.0.1", "localhost")}/token`;
    metadataMore = { token_endpoint: elsewhere };
    try {
        const dir = workspace({ "sales.csv": SALES_CSV });
        const refused = await restServer({ sources: SOURCES, output: { dir: "out", downloads: { key: { env: "DL_KEY" }, signIn: { clientId: CLIENT_ID } } }, auth: { mode: "oauth", issuer, resource: MCP_RESOURCE, allowInsecureIssuer: true }, http: { publicUrl: PUBLIC }, baseDir: dir }, { env: { DL_KEY }, enable: ["rest", "mcp"] });
        try {
            for (let i = 0; i < 100 && !/the sign-in issuer's metadata could not be loaded/.test(logText(refused)); i++) {
                await new Promise((r) => setTimeout(r, 30));
            }
            assert.match(logText(refused), /token_endpoint is on another origin \(http:\/\/localhost:\d+\); set output\.downloads\.signIn\.tokenUrl to accept it/);
        } finally {
            await refused.close();
        }
        // the operator names it: the sign-in works and the code goes there
        issuerAsked.length = 0;
        const { server, render, open, callback } = await signInServer({ signIn: { tokenUrl: elsewhere } });
        try {
            const output = await render("alice");
            const redirect = await open(output.url);
            const { code, state } = signInAt(/** @type {string} */ (redirect.headers.get("location")), "alice");
            const got = await callback(code, state, cookieOf(redirect));
            assert.equal(got.status, 200, logText(server));
            assert.ok(issuerAsked.includes("/token"));
        } finally {
            await server.close();
        }
    } finally {
        metadataMore = {};
    }
});

test("signIn: a token endpoint on a metadata address is refused before a request, even when the operator names it; the person gets SIGN_IN_FAILED, the operator a warning", async () => {
    const { server, render, open, callback } = await signInServer({ signIn: { tokenUrl: "https://169.254.169.254/token" } });
    try {
        const output = await render("alice");
        const redirect = await open(output.url);
        const { code, state } = signInAt(/** @type {string} */ (redirect.headers.get("location")), "alice");
        const got = await callback(code, state, cookieOf(redirect));
        assert.equal(got.status, 400);
        assert.match(await got.text(), /The sign-in did not complete/);
        assert.match(logText(server), /download links: the issuer's token endpoint could not be reached: REFUSED_ADDRESS, the address is never connected to/);
    } finally {
        await server.close();
    }
});

// The server's own download links: the token (signed, checked in constant time, the same 404 for a
// forged and an unknown one), which report gets which link, the route's answers and headers, one-time
// links (a page for GET and HEAD, one POST from the link's own page, a marker shared by replicas), and
// sign-in links against a local OpenID provider that checks PKCE for real: only the person who asked
// opens the report. Nothing on the log holds a token, a code, a state or a cookie.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { checkConfig, validateOptions } from "pivotkit-server";
import { dispositionOf, filenameOf, readToken, signToken, subjectDigest, subkeysOf } from "../src/downloads.js";
import { NO_LINK_NOTE, linkFor } from "../src/delivery.js";
import { BY_REGION, SALES_CSV, TOKEN, call, raw, restServer, tempDir, workspace } from "./helpers.js";
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
/** Codes the provider gave out: what the token endpoint checks and puts in the ID token. */
const codes = new Map();

before(async () => {
    key = await generateKeyPair("RS256");
    otherKey = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(key.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
    issuerServer = createServer((req, res) => {
        const url = new URL(req.url, issuer);
        if (url.pathname === "/.well-known/openid-configuration") {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, response_types_supported: ["code"], subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"] }));
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
async function accessToken(sub, aud = REST_RESOURCE, client = "claude") {
    return new SignJWT({ scope: "pivotkit", client_id: client }).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(issuer).setAudience(aud).setSubject(sub).setIssuedAt().setExpirationTime("5m").sign(key.privateKey);
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
    // a subject is an HMAC under its own key: not the subject, not a plain hash of it
    const s = subjectDigest(KEYS, "alice");
    assert.notEqual(s, createHash("sha256").update("alice").digest("base64url"));
    assert.notEqual(s, createHmacB64(KEYS.token, "alice"));
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
        assert.match(r.data.message, /saved as http:\/\/127\.0\.0\.1:\d+\/downloads\//);
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
        assert.equal(pageAnswer.headers.get("content-security-policy"), "default-src 'none'; form-action 'self'; frame-ancestors 'none'");
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
            assert.equal(page.headers.get("content-security-policy"), "default-src 'none'; form-action 'self'; frame-ancestors 'none'");
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
        const again = await call(url, { method: "POST", headers: { origin: PUBLIC, accept: "application/json" } });
        assert.equal(again.status, 409);
        assert.equal(again.data.code, "LINK_USED");
        assert.match(again.data.detail, /This link was already used\. Ask the assistant to make the report again\./);
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
async function signInServer({ signIn = {}, downloads = {} } = {}) {
    const dir = workspace({ "sales.csv": SALES_CSV });
    const server = await restServer(
        {
            sources: SOURCES,
            output: { dir: "out", downloads: { key: { env: "DL_KEY" }, signIn: { clientId: CLIENT_ID, ...signIn }, ...downloads } },
            policy: { results: true },
            auth: { mode: "oauth", issuer, resource: MCP_RESOURCE, allowInsecureIssuer: true, requiredScopes: ["pivotkit"] },
            http: { publicUrl: PUBLIC },
            baseDir: dir
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

test("signIn: a wrong nonce, audience, issuer, key or verifier, a missing or foreign cookie and the provider's error all fail with a fixed text", async () => {
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
            await attempt({ iss: "https://elsewhere.example.com" }),
            await attempt({ signWith: otherKey.privateKey }),
            await attempt({ challenge: "not-the-challenge" }),
            await attempt({}, { cookie: () => "" }),
            await attempt({}, { cookie: (c) => c.replace(/\.[A-Za-z0-9_-]{43}$/, `.${"A".repeat(43)}`) })
        ];
        for (const r of bad) {
            assert.equal(r.status, 400);
            assert.match(await r.text(), /The sign-in did not complete\. Open the link again to try once more\./);
        }
        // the provider's own words are not shown
        const redirect = await open(output.url);
        const { state } = signInAt(/** @type {string} */ (redirect.headers.get("location")), "alice");
        const denied = await fetch(`${server.url}/downloads/callback?error=access_denied&error_description=${encodeURIComponent("<script>alert(1)</script>")}&state=${state}`, { headers: { cookie: cookieOf(redirect) } });
        assert.equal(denied.status, 400);
        assert.doesNotMatch(await denied.text(), /script|access_denied/);
        assert.match(denied.headers.get("set-cookie") ?? "", /Max-Age=0/);
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
        assert.equal(payload.s, subjectDigest(KEYS, "alice"));
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
    const dir = workspace();
    const server = await restServer(
        {
            sources: SOURCES,
            output: { dir: "out", downloads: { key: { env: "DL_KEY" }, signIn: { clientId: CLIENT_ID, issuer: "http://127.0.0.1:9/nobody" } } },
            policy: { profiles: { reader: { results: false } }, results: true },
            auth: { mode: "oauth", issuer, resource: MCP_RESOURCE, allowInsecureIssuer: true, clientProfiles: { "report-bot": "reader" } },
            http: { publicUrl: PUBLIC },
            baseDir: dir
        },
        { env: { DL_KEY }, enable: ["rest", "mcp"] }
    );
    try {
        for (let i = 0; i < 100 && (await call(`${server.url}/readyz`)).status !== 200; i++) {
            await new Promise((r) => setTimeout(r, 30));
        }
        const r = await call(`${server.api}/views/render`, { token: await accessToken("alice"), body: { source: "sales", view: BY_REGION, format: "csv", name: "Waiting" } });
        assert.equal(r.data.output.bound, "signIn");
        const waiting = await call(r.data.output.url.replace(PUBLIC, server.url), { headers: { accept: "application/json" } });
        assert.equal(waiting.status, 503);
        assert.equal(waiting.headers.get("retry-after"), "5");
        // a REST program whose profile may not take files (results false) gets no link to a closed report
        const bot = await call(`${server.api}/views/render`, { token: await accessToken("alice", REST_RESOURCE, "report-bot"), body: { source: "sales", view: BY_REGION, format: "csv", name: "Bot" } });
        assert.equal(bot.status, 200, JSON.stringify(bot.data));
        assert.equal(bot.data.output.url, undefined);
        assert.equal(bot.data.output.note, NO_LINK_NOTE);
        // its link to an open report stays
        const openBot = await call(`${server.api}/views/render`, { token: await accessToken("alice", REST_RESOURCE, "report-bot"), body: { source: "open", view: BY_REGION, format: "csv", name: "Bot" } });
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
        assert.ok(downloads.some((l) => l.ok === false && l.code === "NOT_FOUND"));
        assert.ok(downloads.every((l) => /^[A-Za-z0-9_-]{11}$/.test(l.requestId)));
    } finally {
        await server.close();
    }
});

// --- check-config -------------------------------------------------------------------------------------

test("check-config: where links point, which sources get which link, the redirect address to register, and the warnings", async () => {
    const dir = workspace();
    const sources = { sales: { file: "data/sales.csv" }, open: { file: "data/sales.csv", policy: { default: "show" } } };
    const signIn = await checkConfig({ sources, output: { dir: "out", downloads: { signIn: { clientId: CLIENT_ID } } }, auth: { mode: "oauth", issuer: "https://auth.example.com/", resource: MCP_RESOURCE }, http: { publicUrl: PUBLIC }, baseDir: dir }, { http: true, env: {}, rest: true });
    assert.match(signIn.text, /^Delivery:\n {2}downloads: on, links https:\/\/reports\.example\.com\/downloads\/<token> \(route \/downloads to this service\), expire after 60 minutes$/m);
    assert.match(signIn.text, /^ {2}reports over closed sources \(sales\): sign-in links; register https:\/\/reports\.example\.com\/downloads\/callback at the provider for client pivotkit-downloads; it must resolve the same subject \(sub\) as the MCP client; REST programs get them only with results: true$/m);
    assert.match(signIn.text, /^ {2}reports over open sources \(open\): plain links$/m);
    assert.match(signIn.text, /^ {2}warning: output\.downloads\.key is not set: links stop working on a restart and on another replica$/m);
    assert.match(signIn.text, /New in this version[\s\S]*download links under \/downloads/);

    const once = await checkConfig({ sources, output: { dir: "out", downloads: { bind: "once", key: { env: "DL_KEY" } } }, baseDir: dir }, { http: true, env: { DL_KEY: "short" } });
    assert.match(once.text, /reports over closed sources \(sales\): one-time links/);
    assert.match(once.text, /warning: one-time links: anyone who sees the link can use it once, including an assistant with a browser or code tool; use bind "signIn" where that matters/);
    assert.match(once.text, /PROBLEM: output\.downloads\.key is shorter than 32 bytes/);
    assert.equal(once.problems, 1);

    const baseUrl = await checkConfig({ sources, output: { dir: "out", baseUrl: "https://files.example.com/" }, baseDir: dir }, { http: false, env: {} });
    assert.match(baseUrl.text, /reports over closed sources \(sales\): no address under output\.baseUrl/);
    assert.match(baseUrl.text, /New in this version[\s\S]*no longer carry a url under output\.baseUrl/);

    const stdio = await checkConfig({ sources, output: { dir: "out" }, baseDir: dir }, { http: false, env: {} });
    assert.doesNotMatch(stdio.text, /Delivery:/);

    const wide = await checkConfig({ sources, output: { dir: "out" }, auth: { mode: "token" }, http: { host: "0.0.0.0" }, baseDir: dir }, { http: true, env: {} });
    assert.match(wide.text, /downloads: on, but no links: the server listens on 0\.0\.0\.0 and http\.publicUrl is not set/);
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

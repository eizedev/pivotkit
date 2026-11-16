// The requests to the OAuth issuer (issuer.js): metadata and keys go through guardedFetch, so a
// hostile or broken issuer cannot send them to a metadata address, through a redirect, or make the
// server read an endless key set; an issuer in the LAN works with auth.intranet: true and is refused
// without it. The https tests make a certificate per run with the openssl command (it must be on the
// PATH) and point a made-up name at loopback with a stand-in lookup.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as createTlsServer } from "node:https";
import { join } from "node:path";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { checkConfig } from "pivotkit-server";
import { ISSUER_LIMITS, discover, issuerMeans } from "../src/issuer.js";
import { createGuardedFetch } from "../src/sources/fetch.js";
import { call, factsOf, restServer, tempDir, workspace } from "./helpers.js";

const REST_RESOURCE = "https://pk.example.com/api/v1";
const NAME = "idp.example.test";
const SOURCES = { sales: { file: "data/sales.csv", policy: { fields: { Region: "show" } } } };

let key;
let jwk;
let cert;
let tlsKey;
/** What the test issuers answer, by path; changed per test. */
let routes = {};
/** The paths the issuers were asked for, in order. */
let asked = [];

/** An issuer's handler: `routes[path]` is a function (req, res, origin) or a JSON body. */
const handler = (scheme) => (req, res) => {
    const origin = `${scheme}://${req.headers.host}`;
    const path = new URL(req.url, origin).pathname;
    asked.push(path);
    const route = routes[path];
    if (typeof route === "function") {
        route(req, res, origin);
    } else if (route) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(route));
    } else {
        res.writeHead(404);
        res.end();
    }
};

let plain;
let tls;
let plainIssuer;
let tlsPort;

before(async () => {
    key = await generateKeyPair("RS256");
    jwk = { ...(await exportJWK(key.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
    const dir = tempDir();
    execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"), "-days", "2", "-subj", `/CN=${NAME}`, "-addext", `subjectAltName=DNS:${NAME},IP:127.0.0.1`], { stdio: "ignore" });
    cert = readFileSync(join(dir, "cert.pem"));
    tlsKey = readFileSync(join(dir, "key.pem"));
    plain = createServer(handler("http"));
    tls = createTlsServer({ key: tlsKey, cert }, handler("https"));
    await new Promise((resolve) => plain.listen(0, "127.0.0.1", resolve));
    await new Promise((resolve) => tls.listen(0, "127.0.0.1", resolve));
    plainIssuer = `http://127.0.0.1:${plain.address().port}`;
    tlsPort = tls.address().port;
});
after(async () => {
    await new Promise((resolve) => plain.close(resolve));
    await new Promise((resolve) => tls.close(resolve));
});

/** The metadata of an issuer at `issuer`, with `more` over it. */
const metadataOf = (issuer, more = {}) => ({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, response_types_supported: ["code"], ...more });

/** A signed access token of `issuer` for the REST resource. */
const accessToken = (issuer) => new SignJWT({ scope: "pivotkit", client_id: "report-bot" }).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(issuer).setAudience(REST_RESOURCE).setSubject("someone").setIssuedAt().setExpirationTime("5m").sign(key.privateKey);

/** A lookup that answers `addresses` (one or a list per call: `answers(call)`) for every name. */
function lookupOf(answers) {
    let calls = 0;
    return (hostname, options, callback) => {
        calls++;
        const list = (typeof answers === "function" ? answers(calls) : answers).map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
        if (options.all) {
            callback(null, list);
        } else {
            callback(null, list[0].address, list[0].family);
        }
    };
}

/** Runs `body` with issuer.js's https fetch made with a stand-in lookup and the test's certificate. */
async function withLookup(answers, body) {
    const original = issuerMeans.fetch;
    issuerMeans.fetch = createGuardedFetch({ lookup: lookupOf(answers), ca: cert });
    try {
        return await body();
    } finally {
        issuerMeans.fetch = original;
    }
}

/** A REST server signed in through `issuer`; waits until its metadata is loaded or `waitMs` passed. */
async function oauthServer(issuer, auth = {}, waitMs = 3000) {
    const server = await restServer({ sources: SOURCES, auth: { mode: "oauth", issuer, resource: REST_RESOURCE, requiredScopes: ["pivotkit"], ...auth }, baseDir: workspace() });
    const until = Date.now() + waitMs;
    while (Date.now() < until && (await call(`${server.url}/readyz`)).status !== 200) { // wall time: a polling deadline
        await new Promise((resolve) => setTimeout(resolve, 30));
    }
    return server;
}

/** The server's warnings as one text. */
const warnings = (server) => server.log.filter((l) => l.event === "warning").map((l) => l.message).join("\n");

/** A signed-in request with a token of `issuer`: the status. */
const signedIn = async (server, issuer) => (await call(`${server.api}/sources`, { token: await accessToken(issuer) })).status;

test("an issuer in the LAN: refused without auth.intranet (a warning names the setting), works with it, over https through guardedFetch", async () => {
    const issuer = `https://${NAME}:${tlsPort}`;
    routes = { "/.well-known/openid-configuration": metadataOf(issuer), "/jwks": { keys: [jwk] } };
    await withLookup(["127.0.0.1"], async () => {
        const refused = await oauthServer(issuer, {}, 600);
        try {
            const ready = await call(`${refused.url}/readyz`);
            assert.equal(ready.status, 503);
            // the reason in fixed words, without the issuer's address
            assert.equal(ready.data.reason, "the OAuth issuer's metadata is not loaded; see the log");
            assert.doesNotMatch(JSON.stringify(ready.data), /example\.test|127\.0\.0\.1/);
            assert.equal(await signedIn(refused, issuer), 503);
            assert.match(warnings(refused), /REFUSED_ADDRESS, the address is a loopback or private one.*set auth\.intranet: true/);
        } finally {
            await refused.close();
        }
        asked = [];
        const allowed = await oauthServer(issuer, { intranet: true });
        try {
            assert.equal(await signedIn(allowed, issuer), 200);
            assert.deepEqual(asked, ["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration", "/jwks"]);
        } finally {
            await allowed.close();
        }
    });
});

test("an issuer whose name resolves to a metadata or link-local address is refused even with auth.intranet", async () => {
    const issuer = `https://${NAME}:${tlsPort}`;
    routes = { "/.well-known/openid-configuration": metadataOf(issuer), "/jwks": { keys: [jwk] } };
    for (const address of ["169.254.169.254", "fd00:ec2::254", "::ffff:169.254.169.254"]) {
        await withLookup([address], async () => {
            const server = await oauthServer(issuer, { intranet: true }, 400);
            try {
                assert.equal((await call(`${server.url}/readyz`)).status, 503, address);
                assert.match(warnings(server), /REFUSED_ADDRESS, the address is never connected to/, address);
            } finally {
                await server.close();
            }
        });
    }
});

test("the key set's name answering a metadata address when the keys are read: refused, the token with it", async () => {
    const issuer = `https://${NAME}:${tlsPort}`;
    routes = { "/.well-known/openid-configuration": metadataOf(issuer), "/jwks": { keys: [jwk] } };
    // the metadata (two tries) resolve to loopback; the key set, read on the first token, to the metadata service
    await withLookup((n) => (n <= 2 ? ["127.0.0.1"] : ["169.254.169.254"]), async () => {
        asked = [];
        const server = await oauthServer(issuer, { intranet: true });
        try {
            assert.equal((await call(`${server.url}/readyz`)).status, 200);
            assert.equal(await signedIn(server, issuer), 401);
            assert.equal(asked.includes("/jwks"), false, "the key set was not asked for");
            assert.match(warnings(server), /the issuer's keys could not be read from .*\/jwks: REFUSED_ADDRESS/);
        } finally {
            await server.close();
        }
    });
});

test("an issuer written as an IP address works with auth.intranet; the metadata cannot move the key set to another IP address", async () => {
    const issuer = `https://127.0.0.1:${tlsPort}`;
    routes = { "/.well-known/openid-configuration": metadataOf(issuer), "/jwks": { keys: [jwk] } };
    await withLookup(["127.0.0.1"], async () => {
        const server = await oauthServer(issuer, { intranet: true });
        try {
            assert.equal(await signedIn(server, issuer), 200);
        } finally {
            await server.close();
        }
        // a jwks_uri elsewhere is refused before a request (the issuer's origin only, or auth.jwksUri)
        routes = { "/.well-known/openid-configuration": metadataOf(issuer, { jwks_uri: "https://169.254.169.254/latest/meta-data/jwks" }) };
        const hostile = await oauthServer(issuer, { intranet: true }, 400);
        try {
            assert.equal((await call(`${hostile.url}/readyz`)).status, 503);
            assert.match(warnings(hostile), /jwks_uri is on another origin \(https:\/\/169\.254\.169\.254\)/);
        } finally {
            await hostile.close();
        }
    });
});

test("a key set larger than the cap is refused, so a token signed with a key in it is not accepted", async () => {
    // a real key set with the signing key first and many more keys after it, over the cap
    const filler = { kty: "RSA", kid: "x", alg: "RS256", use: "sig", n: jwk.n, e: jwk.e };
    const count = Math.ceil((ISSUER_LIMITS.jwksBytes * 1.2) / JSON.stringify(filler).length);
    const big = { keys: [jwk, ...Array.from({ length: count }, (_, i) => ({ ...filler, kid: `x${i}` }))] };
    assert.ok(JSON.stringify(big).length > ISSUER_LIMITS.jwksBytes);
    for (const chunked of [false, true]) {
        routes = {
            "/.well-known/openid-configuration": metadataOf(plainIssuer),
            // chunked: no content-length, so the cap counts while the body streams
            "/jwks": (req, res) => {
                const body = JSON.stringify(big);
                res.writeHead(200, { "content-type": "application/json", ...(chunked ? {} : { "content-length": Buffer.byteLength(body) }) });
                res.end(body);
            }
        };
        const server = await oauthServer(plainIssuer, { allowInsecureIssuer: true });
        try {
            assert.equal(await signedIn(server, plainIssuer), 401, `chunked ${chunked}`);
            assert.match(warnings(server), /the issuer's keys could not be read from .*\/jwks: TOO_LARGE/);
        } finally {
            await server.close();
        }
    }
    // the same key set within the cap works
    routes = { "/.well-known/openid-configuration": metadataOf(plainIssuer), "/jwks": { keys: [jwk] } };
    const server = await oauthServer(plainIssuer, { allowInsecureIssuer: true });
    try {
        assert.equal(await signedIn(server, plainIssuer), 200);
    } finally {
        await server.close();
    }
});

test("redirects are not followed: of the metadata and of the key set (to a metadata address)", async () => {
    const away = (req, res) => {
        res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
        res.end();
    };
    routes = { "/.well-known/oauth-authorization-server": away, "/.well-known/openid-configuration": away };
    const metadata = await oauthServer(plainIssuer, { allowInsecureIssuer: true }, 400);
    try {
        assert.equal((await call(`${metadata.url}/readyz`)).status, 503);
        assert.match(warnings(metadata), /REDIRECT/);
    } finally {
        await metadata.close();
    }
    routes = { "/.well-known/openid-configuration": metadataOf(plainIssuer), "/jwks": away };
    const keys = await oauthServer(plainIssuer, { allowInsecureIssuer: true });
    try {
        assert.equal(await signedIn(keys, plainIssuer), 401);
        assert.match(warnings(keys), /the issuer's keys could not be read from .*\/jwks: REDIRECT/);
    } finally {
        await keys.close();
    }
});

test("auth.allowInsecureIssuer allows plain http to loopback only", async () => {
    const issuer = "http://idp.example.test";
    const original = issuerMeans.loopback;
    issuerMeans.loopback = createGuardedFetch({ allowHttpLoopback: true, lookup: lookupOf(["10.0.0.7"]) });
    try {
        const server = await oauthServer(issuer, { allowInsecureIssuer: true }, 400);
        try {
            assert.equal((await call(`${server.url}/readyz`)).status, 503);
            assert.match(warnings(server), /NOT_HTTPS, plain http goes to a loopback address only/);
        } finally {
            await server.close();
        }
    } finally {
        issuerMeans.loopback = original;
    }
});

test("check-config: the issuer's rules, and a PROBLEM for an issuer on a private or metadata address", async () => {
    const options = (auth) => ({ sources: SOURCES, baseDir: workspace(), auth: { mode: "oauth", issuer: "https://localhost/realms/x", resource: REST_RESOURCE, ...auth } });
    const checked = await checkConfig(options({}));
    const refused = { ...checked, text: factsOf(checked.text) };
    assert.match(refused.text, /\nIssuer requests:\n {2}https only, no redirects, metadata up to 256 KiB, keys up to 256 KiB\n {2}loopback and private addresses: refused \(set auth\.intranet: true for an issuer in your LAN or cluster\)\n/);
    // the server starts and keeps trying: callers get 503 meanwhile
    assert.match(refused.text, /PROBLEM: auth\.issuer: localhost resolves to (127\.0\.0\.1|::1), a loopback or private address, which the server refuses without auth\.intranet: true -> the server starts; callers get 503 until the issuer can be reached/);
    assert.match(refused.text, /\nNew in this version: [^\n]*issuer requests under the outbound rules \(a LAN issuer needs auth\.intranet: true\)/, "the upgrade note");
    assert.ok(refused.problems >= 1);
    assert.equal(refused.stops, 0);
    const allowed = await checkConfig(options({ intranet: true }));
    assert.match(allowed.text, /loopback and private addresses: allowed \(auth\.intranet\)/);
    assert.doesNotMatch(allowed.text, /PROBLEM: auth\.issuer/);
    const metadata = await checkConfig(options({ issuer: "https://169.254.169.254/", intranet: true }));
    assert.match(factsOf(metadata.text), /PROBLEM: auth\.issuer: 169\.254\.169\.254, which is never connected to/);
    const jwks = await checkConfig(options({ intranet: true, jwksUri: "https://[fd00:ec2::254]/keys" }));
    assert.match(factsOf(jwks.text), /PROBLEM: auth\.jwksUri: fd00:ec2::254, which is never connected to/);
    // the download sign-in's token endpoint: the issuer's host, or the operator's tokenUrl, checked like the issuer
    const signInOptions = (signIn) => ({ ...options({ intranet: true }), output: { dir: "out", downloads: { signIn: { clientId: "pivotkit-downloads", ...signIn } } }, http: { publicUrl: "https://pk.example.com/" } });
    assert.match(factsOf((await checkConfig(signInOptions({}), { http: true })).text), /\n {2}download links' token endpoint: on the issuer's host only\n/);
    const google = factsOf((await checkConfig(signInOptions({ tokenUrl: "https://169.254.169.254/token" }), { http: true })).text);
    assert.match(google, /\n {2}download links' token endpoint: on 169\.254\.169\.254 \(output\.downloads\.signIn\.tokenUrl\)\n/);
    assert.match(google, /PROBLEM: output\.downloads\.signIn\.tokenUrl: 169\.254\.169\.254, which is never connected to/);
    // without OAuth the setting does nothing, and check-config says so
    const token = await checkConfig({ sources: SOURCES, baseDir: workspace(), auth: { mode: "token", intranet: true } }, { env: { PIVOTKIT_MCP_TOKEN: "x".repeat(40) } });
    assert.match(factsOf(token.text), /WARNING \(Auth\): auth\.intranet has no effect without an OAuth issuer/);
});

test("a key set that cannot be read: tokens right after the failure do not ask the issuer again, and the warning is written once", async () => {
    routes = {
        "/.well-known/openid-configuration": metadataOf(plainIssuer),
        "/jwks": (req, res) => {
            res.writeHead(302, { location: "http://169.254.169.254/" });
            res.end();
        }
    };
    const server = await oauthServer(plainIssuer, { allowInsecureIssuer: true });
    try {
        asked = [];
        for (let i = 0; i < 5; i++) {
            assert.equal(await signedIn(server, plainIssuer), 401);
        }
        assert.equal(asked.filter((p) => p === "/jwks").length, 1);
        assert.equal(warnings(server).match(/the issuer's keys could not be read/g)?.length, 1);
    } finally {
        await server.close();
    }
});

test("a key-set answer jose would refuse (500, or 200 without a keys list) counts as a failed read: no request per token", async () => {
    const down = (req, res) => {
        res.writeHead(500);
        res.end("down");
    };
    const html = (req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end("<html>");
    };
    for (const [what, route] of [["500", down], ["{}", {}], ["not JSON", html]]) {
        routes = { "/.well-known/openid-configuration": metadataOf(plainIssuer), "/jwks": route };
        const server = await oauthServer(plainIssuer, { allowInsecureIssuer: true });
        try {
            asked = [];
            for (let i = 0; i < 30; i++) {
                assert.equal(await signedIn(server, plainIssuer), 401, what);
            }
            assert.equal(asked.filter((p) => p === "/jwks").length, 1, what);
            assert.equal(warnings(server).match(/the issuer's keys could not be read/g)?.length, 1, what);
        } finally {
            await server.close();
        }
    }
});

test("check-config: an issuer on a metadata address is a PROBLEM the server starts with, never one that stops it", async () => {
    const result = await checkConfig({ sources: SOURCES, baseDir: workspace(), auth: { mode: "oauth", issuer: "https://169.254.169.254/", resource: REST_RESOURCE, intranet: true } }, { http: true, env: {} });
    const text = factsOf(result.text);
    assert.match(text, /^PROBLEM: auth\.issuer: 169\.254\.169\.254, which is never connected to \(link-local, metadata, multicast or unspecified\) -> the server starts; callers get 503 until the issuer can be reached$/m);
    assert.equal(result.stops, 0);
    assert.match(text.split("\n")[0], /the server starts, but not everything will work\.$/);
    assert.doesNotMatch(text, /does not start/);
});

test("check-config: a private issuer without auth.intranet is one PROBLEM, and its metadata is not asked for a second line", async () => {
    const issuer = `https://127.0.0.1:${tlsPort}`;
    routes = { "/.well-known/openid-configuration": metadataOf(issuer), "/jwks": { keys: [jwk] } };
    asked = [];
    await withLookup(["127.0.0.1"], async () => {
        const result = await checkConfig({ sources: SOURCES, baseDir: workspace(), auth: { mode: "oauth", issuer, resource: REST_RESOURCE } }, { http: true, env: {}, discover });
        const lines = factsOf(result.text).split("\n");
        assert.deepEqual(lines.filter((l) => l.startsWith("PROBLEM: auth.issuer")), [`PROBLEM: auth.issuer: 127.0.0.1, a loopback or private address, which the server refuses without auth.intranet: true -> the server starts; callers get 503 until the issuer can be reached`]);
        assert.deepEqual(lines.filter((l) => l.startsWith("WARNING") && l.includes("auth.issuer")), [], result.text);
        assert.equal(result.problems, 1, result.text);
    });
    assert.deepEqual(asked, [], "the metadata was not asked for");
});

test("check-config: an https issuer in the LAN with auth.intranet that answers gives no warning", async () => {
    const issuer = `https://127.0.0.1:${tlsPort}`;
    routes = { "/.well-known/openid-configuration": metadataOf(issuer), "/jwks": { keys: [jwk] } };
    asked = [];
    await withLookup(["127.0.0.1"], async () => {
        const result = await checkConfig({ sources: SOURCES, baseDir: workspace(), auth: { mode: "oauth", issuer, resource: REST_RESOURCE, intranet: true } }, { http: true, env: {}, discover });
        assert.equal(result.problems, 0, result.text);
        assert.doesNotMatch(result.text, /auth\.issuer|WARNING \(Auth\)/, result.text);
        assert.match(factsOf(result.text), /\n {2}loopback and private addresses: allowed \(auth\.intranet\)\n/);
    });
    // it was asked, and it answered
    assert.ok(asked.includes("/.well-known/openid-configuration"), asked.join(" "));
});

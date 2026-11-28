// The viewer page (record 0021): a live link opened on the server's own origin. GET of the link
// signs nobody in; the sign-in is the download links' (code flow with PKCE, state and nonce) against
// a local OpenID provider that checks PKCE for real; the callback reads the person's rights from the
// access token of the same answer and answers the page with a browser token for the link's source,
// parameters and access level. No session outlives it, the token is never in an address, a cookie
// or the log, and the person's access token never reaches the page. Stored titles and branding
// cannot break out of the page, whose policy allows no inline script or style.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SignJWT } from "jose";
import { checkConfig, validateOptions } from "pivotkit-server";
import { ACCESS_PARAM } from "../src/link-access.js";
import { VIEWER_CSP } from "../src/viewer/pages.js";
import { viewerAssets } from "../src/viewer/assets.js";
import { call, factsOf, restServer, tempDir, untilReady, workspace } from "./helpers.js";
import { localIssuer } from "./auth/local-issuer.js";
import { until } from "../../../tests/until.js";

const PUBLIC = "https://reports.example.com";
const REST_RESOURCE = `${PUBLIC}/api/v1`;
const CLIENT_ID = "pivotkit-downloads";
const DL_KEY = "a-download-key-for-tests-that-is-long-enough-0123456789";
const BROWSER_KEY = "a-browser-key-of-the-test-0123456789abcdef";
const CSV = ["Region,Customer,Sales", "North,acme,10", "South,acme,20", "West,beta,7"].join("\n") + "\n";
/** A title and a name that try to leave their place in the page. */
const HOSTILE = `Sales </script><script>alert(1)</script> "><img src=x onerror=alert(2)> &amp; \u2028`;
/** branding.name takes 60 characters at most. */
const HOSTILE_NAME = `</script><script>alert(3)</script>"><img src=x onerror=1>`;

let provider;
/** Codes the provider gave out: what the token endpoint checks and what its answer holds. */
const codes = new Map();

before(async () => {
    provider = await localIssuer();
    // the token endpoint: a code for an ID token and an access token for the REST service
    provider.routes["/token"] = (req, res) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", async () => {
            const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
            const grant = codes.get(form.get("code"));
            codes.delete(form.get("code"));
            const verifier = form.get("code_verifier") ?? "";
            const ok = grant && form.get("grant_type") === "authorization_code" && form.get("client_id") === grant.clientId && form.get("redirect_uri") === grant.redirectUri && createHash("sha256").update(verifier).digest("base64url") === grant.challenge;
            if (!ok) {
                res.writeHead(400, { "content-type": "application/json" });
                res.end(JSON.stringify({ error: "invalid_grant" }));
                return;
            }
            const idToken = await new SignJWT({ nonce: grant.nonce }).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(provider.url).setAudience(grant.clientId).setSubject(grant.sub).setIssuedAt().setExpirationTime("5m").sign(provider.key.privateKey);
            const access = grant.access === null ? {} : { access_token: await provider.token({ claims: { client_id: grant.clientId, groups: grant.groups ?? [], ...(grant.scope ? { scope: grant.scope } : {}) }, aud: grant.aud ?? REST_RESOURCE, sub: grant.accessSub ?? grant.sub }) };
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ ...access, token_type: "Bearer", id_token: idToken }));
        });
    };
});
after(() => provider.close());

/** Fake built files of the element and the page's own, so the tests do not need a build. */
function viewerFiles() {
    const dir = tempDir("viewer-files");
    mkdirSync(join(dir, "own"));
    mkdirSync(join(dir, "element", "chunks"), { recursive: true });
    writeFileSync(join(dir, "own", "viewer.js"), "// the page's script\n");
    writeFileSync(join(dir, "own", "viewer.css"), "body{}\n");
    writeFileSync(join(dir, "element", "index.js"), 'import "./chunks/a.js";\n');
    writeFileSync(join(dir, "element", "chunks", "a.js"), "export {};\n");
    writeFileSync(join(dir, "element", "secret.txt"), "not served\n");
    return { ownDir: join(dir, "own"), elementDir: join(dir, "element") };
}

/** A server with the viewer page on, its sign-in client the download links', its issuer loaded. */
async function viewerServer({ browser = {}, top = {}, files = viewerFiles() } = {}) {
    const dir = workspace({ "sales.csv": CSV });
    const server = await restServer(
        {
            sources: {
                sales: { title: HOSTILE, file: "data/sales.csv", link: `${PUBLIC}/live/sales`, policy: { fields: { Customer: "hide" } } },
                team: { title: "Team", load: async (params) => [{ Region: String(params.team), Sales: 1 }], params: { team: { type: "string" } }, link: `${PUBLIC}/live/team`, linkParams: ["team"], policy: { default: "show" } }
            },
            policy: { profiles: { staff: { records: ["sales", "team"], fields: { Region: "show", Sales: "show" } }, plain: { fields: { Region: "show" } } } },
            auth: { mode: "oauth", issuer: provider.url, resource: `${PUBLIC}/mcp`, allowInsecureIssuer: true, requiredScopes: ["pivotkit"], defaultProfile: "staff", groupProfiles: [{ group: "plain", profile: "plain" }] },
            output: { dir: "out", downloads: { key: { env: "DL_KEY" }, signIn: { clientId: CLIENT_ID, scopes: ["openid", "pivotkit"] } } },
            rest: { browser: { key: { env: "BROWSER_KEY" }, viewer: true, levels: ["me", "signedIn"], ...browser } },
            branding: { name: HOSTILE_NAME },
            http: { publicUrl: PUBLIC },
            baseDir: dir,
            ...top
        },
        { env: { DL_KEY, BROWSER_KEY }, viewerFiles: files }
    );
    await untilReady(server, 100);
    const local = (url) => url.replace(PUBLIC, server.url);
    /** Starts the sign-in of a link: the redirect to the provider (after the issuer loaded). */
    const start = (link) =>
        until(async () => {
            const to = new URL(link, PUBLIC);
            const r = await fetch(`${server.url}/live/_/sign-in?to=${encodeURIComponent(to.pathname + to.search)}`, { redirect: "manual" });
            return r.status !== 503 && r;
        }, { message: "the sign-in issuer did not load", tries: 100, every: 30 });
    const callback = (code, state, cookie, headers = {}) => fetch(`${server.url}/live/_/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`, { headers: { cookie, ...headers } });
    return { server, local, start, callback };
}

/** The provider's sign-in page, as a person passes it: a code for `sub`, with what `grant` changes. */
function signInAt(location, sub, grant = {}) {
    const url = new URL(location);
    const p = Object.fromEntries(url.searchParams);
    assert.equal(url.origin + url.pathname, `${provider.url}/authorize`);
    assert.equal(p.redirect_uri, `${PUBLIC}/live/_/callback`);
    assert.equal(p.client_id, CLIENT_ID);
    assert.equal(p.code_challenge_method, "S256");
    assert.equal(p.scope, "openid pivotkit");
    const code = randomBytes(16).toString("base64url");
    codes.set(code, { clientId: p.client_id, redirectUri: p.redirect_uri, challenge: p.code_challenge, nonce: p.nonce, sub, scope: "pivotkit", ...grant });
    return { code, state: p.state };
}

const cookieOf = (response) => (response.headers.get("set-cookie") ?? "").split(";")[0];

/** The page's data block, as its script reads it. */
function dataOf(html) {
    const m = /<script type="application\/json" id="pk-live">([^<]*)<\/script>/.exec(html);
    assert.ok(m, "the page has its data block");
    return JSON.parse(m[1]);
}

/** Signs `sub` in for a link: the callback's answer and its page's data. */
async function signedIn(viewer, link, sub, grant) {
    const redirect = await viewer.start(link);
    assert.equal(redirect.status, 302);
    const { code, state } = signInAt(/** @type {string} */ (redirect.headers.get("location")), sub, grant);
    const page = await viewer.callback(code, state, cookieOf(redirect));
    const html = await page.text();
    return { redirect, page, html, data: dataOf(html), code, state };
}

test("viewer: the link's page signs nobody in; the sign-in's callback answers the report's page with a browser token for the link's source and parameters", async () => {
    const viewer = await viewerServer();
    const { server } = viewer;
    try {
        // the link itself: a page that starts nothing and names nothing of the source
        for (const method of ["GET", "HEAD"]) {
            const opened = await fetch(`${server.url}/live/team?team=north`, { method });
            assert.equal(opened.status, 200);
            assert.equal(opened.headers.get("content-security-policy"), VIEWER_CSP);
            assert.equal(opened.headers.get("cache-control"), "no-store");
            assert.equal(opened.headers.get("referrer-policy"), "no-referrer");
            assert.equal(opened.headers.get("set-cookie"), null, "opening a link starts no sign-in");
            if (method === "GET") {
                const html = await opened.text();
                assert.deepEqual(dataOf(html), { lang: "en", step: "start" });
                assert.doesNotMatch(html, /Team/, "the report's title shows only after the sign-in");
            }
        }

        const { redirect, page, html, data, code, state } = await signedIn(viewer, "/live/team?team=north", "alice");
        assert.match(redirect.headers.get("set-cookie") ?? "", /^__Host-pivotkit-live=.+; Max-Age=600; Path=\/; HttpOnly; SameSite=Lax; Secure$/);
        assert.equal(page.status, 200);
        assert.equal(page.headers.get("content-security-policy"), VIEWER_CSP);
        assert.equal(page.headers.get("cache-control"), "no-store");
        assert.match(page.headers.get("set-cookie") ?? "", /^__Host-pivotkit-live=; Max-Age=0/, "no session outlives the sign-in");
        assert.equal(data.step, "report");
        assert.equal(data.to, "/live/team?team=north");
        assert.equal(data.source, "team");
        assert.deepEqual(data.params, ["team"]);
        assert.match(html, /<h1 class="title">Team<\/h1>/);
        assert.match(data.token.token, /^[A-Za-z0-9_-]+\.\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, "a browser token (an encrypted JWT)");
        assert.doesNotMatch(html, /eyJhbGciOiJSUzI1Ni/, "the person's access token never reaches the page");

        // the token reads this source with the link's parameters, and nothing else
        const rows = await call(`${server.api}/sources/records`, { token: data.token.token, body: { source: "team", params: { team: "north" } } });
        assert.equal(rows.status, 200, JSON.stringify(rows.data));
        assert.equal((await call(`${server.api}/sources/records`, { token: data.token.token, body: { source: "team", params: { team: "south" } } })).status, 403);
        assert.equal((await call(`${server.api}/sources`, { token: data.token.token })).status, 401);

        // the log: the token's id, never the token, a code, a state or a cookie
        const line = server.log.find((l) => l.event === "viewer" && l.ok === true);
        assert.ok(line, JSON.stringify(server.log.filter((l) => l.event === "viewer")));
        assert.match(String(line.token), /^[A-Za-z0-9_-]{8,}$/);
        const logged = JSON.stringify(server.log);
        assert.equal(logged.includes(data.token.token), false);
        assert.equal(logged.includes(cookieOf(redirect).split("=")[1]), false);

        // the state is used once: replayed with the cookie from before the callback, it is refused
        const replay = await viewer.callback(code, state, cookieOf(redirect));
        assert.equal(replay.status, 400);
        assert.equal(dataOf(await replay.text()).answer, "SIGN_IN_STALE");
        // a download's sign-in never completes here: each route has its own cookie
        assert.equal((await viewer.callback(code, state, cookieOf(redirect).replace("pivotkit-live", "pivotkit-dl"))).status, 400);
    } finally {
        await server.close();
    }
});

test("viewer: a link only for its maker, opened by another person, says it is not shared with this account; the person's rights decide the rest", async () => {
    const viewer = await viewerServer();
    const { server } = viewer;
    try {
        const made = await call(`${server.api}/views/link`, { token: await provider.token({ claims: { client_id: "host-app" }, aud: REST_RESOURCE, sub: "ana" }), body: { source: "sales", view: { rows: ["Region"] }, access: { level: "me" } } });
        assert.equal(made.status, 200, JSON.stringify(made.data));
        const link = new URL(made.data.url);
        assert.equal(link.origin + link.pathname, `${PUBLIC}/live/sales`);
        assert.ok(link.searchParams.get(ACCESS_PARAM));
        const to = link.pathname + link.search;

        const ana = await signedIn(viewer, to, "ana");
        assert.ok(ana.data.token?.token, JSON.stringify(ana.data));
        const bob = await signedIn(viewer, to, "bob");
        assert.equal(bob.page.status, 200, "the page shows the report's state");
        assert.equal(bob.data.token, undefined);
        assert.equal(bob.data.problem.code, "NOT_ALLOWED");
        assert.equal(bob.data.problem.linkAccess, "refused");
        assert.ok(bob.data.problem.requestId);
        // the refused person learns nothing of the report: its title stays out of the page
        assert.doesNotMatch(bob.html, /class="title">Sales/);
        // a person whose profile reads no rows is refused by their rights, with or without the link
        const plain = await signedIn(viewer, "/live/sales", "carol", { groups: ["plain"] });
        assert.equal(plain.data.problem.code, "NOT_ALLOWED");
        assert.equal(plain.data.problem.linkAccess, undefined);
    } finally {
        await server.close();
    }
});

test("viewer: an access token the REST service refuses, a missing one, or one of another person gives no browser token", async () => {
    const viewer = await viewerServer();
    const { server } = viewer;
    try {
        // another audience: the sign-in client's token is not one for this service
        const audience = await signedIn(viewer, "/live/sales", "alice", { aud: "someone-else" });
        assert.deepEqual([audience.data.failed, audience.data.token], [true, undefined]);
        // no access token in the answer: the operator's setup, on the log as a warning
        const none = await signedIn(viewer, "/live/sales", "alice", { access: null });
        assert.equal(none.data.failed, true);
        assert.ok(server.log.some((l) => l.level === "warn" && /gave no access token/.test(l.message)));
        // without the service's scope: refused by the person's rights
        const scope = await signedIn(viewer, "/live/sales", "alice", { scope: "openid" });
        assert.equal(scope.data.problem.code, "INSUFFICIENT_SCOPE");
        // the access token names another person than the ID token: never read with either
        const crossed = await signedIn(viewer, "/live/sales", "alice", { accessSub: "mallory" });
        assert.equal(crossed.data.failed, true);
        assert.ok(server.log.some((l) => l.event === "viewer" && l.reason === "subject"));
    } finally {
        await server.close();
    }
});

test("viewer: stored titles and branding are escaped in every page; the sign-in takes back only a link of this page; files only from the list", async () => {
    const viewer = await viewerServer();
    const { server } = viewer;
    try {
        const { html } = await signedIn(viewer, "/live/sales", "alice");
        for (const page of [html, await (await fetch(`${server.url}/live/sales`)).text(), await (await fetch(`${server.url}/live/_/callback?state=x`)).text()]) {
            assert.doesNotMatch(page, /<script>alert/);
            assert.doesNotMatch(page, /<img src=x/);
            assert.doesNotMatch(page, /<script(?![^>]*(?:type="module" src="\/live\/_\/viewer\.js"|type="application\/json" id="pk-live"))/, "the page's only scripts are its file and its data block");
            assert.doesNotMatch(page, /<style|style=/, "no inline style");
            assert.equal(page.match(/<\/script>/g)?.length, 2, "no text closes the data block");
        }
        assert.match(html, /<h1 class="title">Sales &#60;\/script&#62;&#60;script&#62;alert\(1\)&#60;\/script&#62; &#34;&#62;&#60;img/);
        // the sign-in returns to a page of this route only: never another address
        for (const to of ["https://evil.example/live/sales", "//evil.example/live/sales", "/live/../api/v1/sources", "/live/_/callback", "/downloads/x", "/live/sales#x", `/live/sales?${"a".repeat(2100)}`]) {
            const r = await fetch(`${server.url}/live/_/sign-in?to=${encodeURIComponent(to)}`, { redirect: "manual" });
            assert.equal(r.status, 404, to);
            assert.equal(r.headers.get("location"), null);
        }
        // files: the page's own and the element's built ones, nothing else
        for (const [path, status] of [["/live/_/viewer.js", 200], ["/live/_/viewer.css", 200], ["/live/_/element/index.js", 200], ["/live/_/element/chunks/a.js", 200], ["/live/_/element/secret.txt", 404], ["/live/_/element/../own/viewer.js", 404], ["/live/_/element/%2e%2e/own/viewer.js", 404]]) {
            const r = await fetch(`${server.url}${path}`);
            assert.equal(r.status, status, path);
            if (status === 200) {
                assert.match(r.headers.get("content-type") ?? "", /^text\/(javascript|css)/);
                assert.equal(r.headers.get("x-content-type-options"), "nosniff");
            }
        }
        // a POST is not the page's
        assert.equal((await fetch(`${server.url}/live/sales`, { method: "POST" })).status, 405);
        // German where the browser's first language is
        const de = await fetch(`${server.url}/live/sales`, { headers: { "accept-language": "de-DE,de;q=0.9,en;q=0.5" } });
        assert.match(await de.text(), /<html lang="de">.*Sie werden angemeldet/s);
    } finally {
        await server.close();
    }
});

test("viewer: a long link signs in; parallel sign-ins keep the newest in a cookie a browser keeps", async () => {
    const viewer = await viewerServer();
    const { server } = viewer;
    try {
        const long = (n) => `/live/team?team=north&x${n}=${"a".repeat(2030)}`.slice(0, 2048);
        const alone = await signedIn(viewer, long(0), "alice");
        assert.equal(alone.data.to, long(0));
        assert.ok(alone.data.token?.token);
        // three tabs sign in at once: the browser sends the cookie of the ones before
        let cookie = "";
        const started = [];
        for (const n of [1, 2, 3]) {
            const r = await fetch(`${server.url}/live/_/sign-in?to=${encodeURIComponent(long(n))}`, { redirect: "manual", headers: { cookie } });
            assert.equal(r.status, 302);
            const set = r.headers.get("set-cookie") ?? "";
            assert.ok(set.split(";")[0].length <= 4096, `the cookie fits a browser: ${set.length}`);
            cookie = cookieOf(r);
            started.push(signInAt(/** @type {string} */ (r.headers.get("location")), "alice"));
        }
        // the newest completes; the oldest made room for it
        const newest = dataOf(await (await viewer.callback(started[2].code, started[2].state, cookie)).text());
        assert.equal(newest.to, long(3));
        assert.ok(newest.token?.token);
        assert.equal((await viewer.callback(started[0].code, started[0].state, cookie)).status, 400);
    } finally {
        await server.close();
    }
});

test("viewer: the page's own files and pivotkit-element's built ones, from where they are installed", async () => {
    const assets = await viewerAssets();
    for (const name of ["viewer.js", "viewer.css"]) {
        const file = await assets.answer(name, true);
        assert.equal(file?.status, 200, name);
    }
    // the element is a workspace package here; built only after npm run build:playground
    const built = existsSync(new URL("../../pivotkit-element/dist/index.js", import.meta.url));
    assert.equal(assets.ready, built);
    assert.equal((await assets.answer("element/index.js", true))?.status ?? 404, built ? 200 : 404);
    assert.equal(await assets.answer("element/import-worker.js", true), null, "the import worker is not the page's");
});

test("viewer: off by default; without pivotkit-element the page says it is not available; the options need the sign-in client", async () => {
    const off = await restServer({ sources: { sales: { file: "data/sales.csv" } }, baseDir: workspace({ "sales.csv": CSV }) });
    try {
        assert.equal((await fetch(`${off.url}/live/sales`)).status, 404);
    } finally {
        await off.close();
    }
    const viewer = await viewerServer({ files: { ownDir: viewerFiles().ownDir, elementDir: null } });
    try {
        const r = await fetch(`${viewer.server.url}/live/sales`);
        assert.equal(r.status, 503);
        assert.match(await r.text(), /This server cannot show reports in the browser yet/);
        assert.ok(viewer.server.log.some((l) => l.level === "warn" && /pivotkit-element is not installed/.test(l.message)));
    } finally {
        await viewer.server.close();
    }
    assert.throws(() => validateOptions({ auth: { mode: "token", tokens: [{ name: "a", env: "A" }] }, rest: { browser: { viewer: true } } }), /rest\.browser\.viewer: needs auth\.mode "oauth" and output\.downloads\.signIn\.clientId/);
    assert.throws(() => validateOptions({ auth: { mode: "oauth", issuer: "https://idp.example.com", resource: "https://reports.example.com/mcp" }, output: { downloads: { bind: "once", signIn: { clientId: "c" } } }, http: { publicUrl: "http://reports.example.com" }, rest: { browser: { viewer: true } } }), /rest\.browser\.viewer: needs http\.publicUrl with https:\/\//);
});

test("check-config: the viewer page's address, what to register at the provider, what its sign-in asks for", async () => {
    const options = {
        sources: { sales: { file: "data/sales.csv", link: `${PUBLIC}/live/sales` } },
        policy: { profiles: { staff: { records: ["sales"] } } },
        auth: { mode: "oauth", issuer: "https://idp.example.com", resource: `${PUBLIC}/mcp`, defaultProfile: "staff" },
        output: { dir: "out", downloads: { signIn: { clientId: "pivotkit-web", scopes: ["openid", "pivotkit"] } } },
        rest: { browser: { viewer: true, key: { env: "BROWSER_KEY" } } },
        http: { publicUrl: PUBLIC },
        baseDir: workspace({ "sales.csv": CSV })
    };
    const text = factsOf((await checkConfig(options, { http: true, rest: true, env: { BROWSER_KEY }, name: "pivotkit-server" })).text);
    assert.match(text, /^ {2}viewer page: https:\/\/reports\.example\.com\/live\/<source> \(rest\.browser\.viewer\); a source's link opens it when it is that address\n {4}register https:\/\/reports\.example\.com\/live\/_\/callback at the provider for the client pivotkit-web\n {4}the sign-in asks for openid pivotkit \(output\.downloads\.signIn\.scopes\): its access token must be one the REST service accepts, with its audience and required scopes$/m);
});

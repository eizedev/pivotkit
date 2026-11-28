// pivotkit-server's viewer page in a real browser (record 0021): a live link opened at /live/<source>,
// the sign-in at a local OpenID provider whose sign-in page lets the person in at once (the code
// flow with PKCE, checked for real), and the report on the server's own origin with its rows. Under
// the page's own Content-Security-Policy header: no violation in any engine. The link's view comes
// back after the sign-in, the address never holds the token, the page's data block is gone once read.
// Then the states: a link not shared with this account, a cancelled sign-in and its Sign in again,
// in German too; light and dark, wide and at 390 px, every text 4.5:1 or more.
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SignJWT } from "jose";
import { serve } from "pivotkit-server";
import { encodeViewLink } from "pivotkit-core/link";
import { localIssuer } from "../../packages/pivotkit-server/test/auth/local-issuer.js";
import { expect, test, watchConsole } from "./fixtures.js";
import { measure } from "./report-contrast.js";
import { removeTempDirs, tempDir } from "../temp-dir.js";

test.afterAll(removeTempDirs);

/** What a browser logs for a page the server answers with an error on purpose (a cancelled sign-in, a refusal). */
const REFUSED_PAGE = /^Failed to load resource: the server responded with a status of 40[034] \(.+\)$/;
/** Firefox's own request for /favicon.ico, which the page's policy refuses: the browser's, not the page's. */
const FAVICON = /^\[JavaScript Error: "Content-Security-Policy: .+\/favicon\.ico .+" \{file: "resource:\/\/\/modules\/FaviconLoader\.sys\.mjs"/;
/**
 * Firefox's warning when Playwright's driver evaluates its own code in a page whose stylesheet is
 * still loading: the file is "debugger eval code", not the page's script. The page's files are
 * checked again on every use (no-cache), so a page of the sign-in can be read before its stylesheet
 * came; fixtures.js ignores the same warning from the driver's own file.
 */
const DRIVER_LAYOUT = /^\[JavaScript Warning: "Layout was forced before the page was fully loaded\. If stylesheets are not yet loaded this may cause a flash of unstyled content\." \{file: "debugger eval code" line: \d+\}\]$/;
/** All, as one: Playwright reads a list of two objects in test.use as a value and its fixture options. */
const EXPECTED = new RegExp(`${FAVICON.source}|${REFUSED_PAGE.source}|${DRIVER_LAYOUT.source}`);
test.use({ ignoreConsole: [EXPECTED] });

const CLIENT_ID = "pivotkit-web";
const AUDIENCE = "pivotkit-viewer-test";
/** A field whose name tries to become markup: the report shows it as text. */
const HOSTILE_FIELD = "Note <img src=x onerror=window.pwned=1>";
const SALES = `Region,Customer,Sales,${HOSTILE_FIELD}\nNorth,acme,10,a\nSouth,acme,20,b\nWest,beta,7,c\n`;
const VIEW = { rows: ["Region"], values: [{ field: "Sales", agg: "sum" }] };
/** The view as a link carries it, in the fragment. */
const FRAGMENT = `#pivot=${encodeViewLink(VIEW)}`;

/**
 * A provider whose sign-in page lets `who.sub` in at once, or refuses when `who.deny`; and a
 * pivotkit-server on loopback with the viewer page on, its sign-in that provider's.
 */
async function viewerServer() {
    const provider = await localIssuer();
    const who = { sub: "alice", deny: false };
    const codes = new Map();
    provider.routes["/authorize"] = (req, res) => {
        const p = Object.fromEntries(new URL(req.url ?? "/", provider.url).searchParams);
        const back = new URL(p.redirect_uri);
        back.searchParams.set("state", p.state);
        if (who.deny) {
            back.searchParams.set("error", "access_denied");
        } else {
            const code = randomBytes(16).toString("base64url");
            codes.set(code, { ...p, sub: who.sub });
            back.searchParams.set("code", code);
        }
        res.writeHead(302, { location: back.href });
        res.end();
    };
    provider.routes["/token"] = (req, res) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", async () => {
            const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
            const grant = codes.get(form.get("code"));
            codes.delete(form.get("code"));
            if (!grant || createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url") !== grant.code_challenge || form.get("redirect_uri") !== grant.redirect_uri) {
                res.writeHead(400, { "content-type": "application/json" });
                res.end(JSON.stringify({ error: "invalid_grant" }));
                return;
            }
            const idToken = await new SignJWT({ nonce: grant.nonce }).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(provider.url).setAudience(CLIENT_ID).setSubject(grant.sub).setIssuedAt().setExpirationTime("5m").sign(provider.key.privateKey);
            const accessToken = await provider.token({ claims: { client_id: CLIENT_ID }, aud: AUDIENCE, sub: grant.sub });
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ access_token: accessToken, token_type: "Bearer", id_token: idToken }));
        });
    };
    const dir = tempDir("viewer");
    mkdirSync(join(dir, "data"));
    writeFileSync(join(dir, "data", "sales.csv"), SALES);
    const server = await serve(
        {
            // the link's origin is the server's, whose port is known only once it listens: the test swaps it
            sources: { sales: { title: "Sales by region", file: "data/sales.csv", link: "http://127.0.0.1/live/sales" } },
            policy: { profiles: { staff: { records: ["sales"], default: "show" } } },
            auth: { mode: "oauth", issuer: provider.url, resource: "http://127.0.0.1/mcp", allowInsecureIssuer: true, requiredScopes: ["pivotkit"], defaultProfile: "staff" },
            // the download links are one-time ones here: their sign-in needs an https address
            output: { dir: "out", downloads: { bind: "once", key: { env: "DL_KEY" }, signIn: { clientId: CLIENT_ID, scopes: ["openid", "pivotkit"] } } },
            rest: { audience: [AUDIENCE], browser: { key: { env: "BROWSER_KEY" }, viewer: true, levels: ["me", "signedIn"] } },
            branding: { name: "Example Corp" },
            http: { port: 0, enable: ["rest"] },
            log: "off",
            baseDir: dir
        },
        { env: { DL_KEY: "a-download-key-for-tests-that-is-long-enough-0123456789", BROWSER_KEY: "a-browser-key-of-the-test-0123456789abcdef" }, stderr: { write() {} } }
    );
    // the sign-in's issuer loads in the background: the sign-in answers 503 until then
    await expect.poll(async () => (await fetch(`${server.url}/live/_/sign-in?to=%2Flive%2Fsales`, { redirect: "manual" })).status, { timeout: 10_000 }).toBe(302);
    return {
        server,
        who,
        /** A link of `sub` made through the REST service, as create_link makes it. */
        async linkOf(sub, access) {
            const token = await provider.token({ claims: { client_id: "host-app" }, aud: AUDIENCE, sub });
            const r = await fetch(`${server.url}/api/v1/views/link`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ source: "sales", view: VIEW, access }) });
            return /** @type {string} */ ((await r.json()).url);
        },
        async close() {
            await server.close();
            await provider.close();
        }
    };
}

/** Records every Content-Security-Policy violation of the page, in every document it opens. */
const watchPolicy = (page) => page.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => sessionStorage.setItem(`pk-csp:${Date.now()}:${Math.random()}`, `${e.violatedDirective} ${e.blockedURI}`)));
const violations = (page) => page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith("pk-csp:")).map((k) => sessionStorage.getItem(k)));

test("a live link: the page signs in at the provider, shows the report with the link's view, under its own policy, with nothing of the token in the address", async ({ page, browser }) => {
    const viewer = await viewerServer();
    try {
        await watchPolicy(page);
        const fragment = FRAGMENT;
        const answered = page.waitForResponse((r) => r.url().includes("/live/_/callback"));
        await page.goto(`${viewer.server.url}/live/sales${fragment}`);
        const callback = await answered;
        expect(callback.headers()["content-security-policy"]).toContain("script-src 'self'; style-src 'self'");
        const report = page.locator("pivot-report");
        await expect(report.getByTestId("pivot-table")).toContainText("North");
        await expect(report.getByTestId("pivot-table")).toContainText("37");
        await expect(page.getByRole("heading", { level: 1, name: "Sales by region" })).toBeVisible();
        await expect(page.getByText("Example Corp report")).toBeVisible();
        await expect(page).toHaveTitle("Sales by region - Example Corp report");
        // the link's address and view, never the callback's code or a token
        expect(page.url()).toBe(`${viewer.server.url}/live/sales${fragment}`);
        await expect(page.locator("#pk-live")).toHaveCount(0);
        // a stored label stays text
        await expect(page.locator("pivot-report").getByText(HOSTILE_FIELD, { exact: true }).first()).toBeVisible();
        expect(await page.evaluate(() => /** @type {any} */ (window).pwned)).toBeUndefined();
        expect(await page.locator("pivot-report img[src='x']").count()).toBe(0);
        expect(await violations(page)).toEqual([]);
        // the policy is in force: an inline style is refused (in a page of its own, whose console says so)
        const other = await browser.newContext();
        const probe = await other.newPage();
        await probe.goto(`${viewer.server.url}/live/no-such-source-but-a-page`);
        const refused = await probe.evaluate(() => new Promise((done) => {
            document.addEventListener("securitypolicyviolation", (e) => done(e.violatedDirective), { once: true });
            const style = document.createElement("style");
            style.textContent = "body { color: red }";
            document.head.append(style);
            setTimeout(() => done("none"), 2000);
        }));
        await other.close();
        expect(refused).toMatch(/^style-src/);
    } finally {
        await viewer.close();
    }
});

test("the report reads again after its token ran out: the page signs in again, and the report comes back with the view the tab kept", async ({ page }) => {
    const viewer = await viewerServer();
    try {
        await page.clock.install();
        await page.goto(`${viewer.server.url}/live/sales${FRAGMENT}`);
        await expect(page.locator("pivot-report").getByTestId("pivot-table")).toContainText("37");
        const signIns = [];
        page.on("request", (r) => r.url().includes("/live/_/sign-in") && signIns.push(r.url()));
        // past the token's 5 minutes the report keeps its rows; reading them again asks for a new token,
        // and the page goes to the sign-in
        await page.clock.runFor("06:00");
        expect(signIns).toHaveLength(0);
        const back = page.waitForResponse((r) => r.url().includes("/live/_/callback"));
        await page.locator("pivot-report").evaluate((el) => /** @type {any} */ (el).refresh());
        await back;
        expect(signIns).toHaveLength(1);
        await expect(page.locator("pivot-report").getByTestId("pivot-table")).toContainText("37");
        // the view is the tab's (persist-view), not the link's fragment, which is gone
        expect(page.url()).toBe(`${viewer.server.url}/live/sales`);
    } finally {
        await viewer.close();
    }
});

test("a link only for its maker says to another account that it is not shared with it; a cancelled sign-in offers Sign in again, in German", async ({ page, browser }) => {
    const viewer = await viewerServer();
    try {
        const link = await viewer.linkOf("ana", { level: "me" });
        viewer.who.sub = "bob";
        await page.goto(link.replace(/^https?:\/\/[^/]+/, viewer.server.url));
        const state = page.locator("pivot-report").getByTestId("server-state");
        await expect(state).toHaveAttribute("data-state", "linkRefused");
        await expect(state).toContainText("This link is not shared with this account");
        await expect(state).toContainText(/For IT support: NOT_ALLOWED, request [A-Za-z0-9_-]{11}/);
        // the refused person learns nothing of the report: no title in the page
        await expect(page.getByRole("heading", { name: "Sales by region" })).toHaveCount(0);

        const de = await browser.newContext({ locale: "de-DE" });
        try {
            const tab = await de.newPage();
            const problems = watchConsole(tab, { ignore: [EXPECTED] });
            viewer.who.deny = true;
            await tab.goto(`${viewer.server.url}/live/sales${FRAGMENT}`);
            await expect(tab.getByRole("heading", { name: "Nicht angemeldet" })).toBeVisible();
            await expect(tab).toHaveTitle("Nicht angemeldet - Example Corp Bericht");
            viewer.who.deny = false;
            viewer.who.sub = "alice";
            await tab.getByRole("button", { name: "Erneut anmelden" }).click();
            await expect(tab.locator("pivot-report").getByTestId("pivot-table")).toContainText("North");
            await expect(tab.locator("pivot-report")).toHaveAttribute("locale", "de-DE");
            await expect(tab.locator("html")).toHaveAttribute("lang", "de");
            expect(tab.url()).toBe(`${viewer.server.url}/live/sales${FRAGMENT}`);
            expect(problems).toEqual([]);
        } finally {
            await de.close();
        }
    } finally {
        await viewer.close();
    }
});

test("the pages, light and dark, wide and at 390 px: contrast 4.5:1 for every text, nothing wider than the window", async ({ browser }) => {
    const viewer = await viewerServer();
    try {
        for (const colorScheme of /** @type {const} */ (["light", "dark"])) {
            for (const width of [1280, 390]) {
                const context = await browser.newContext({ colorScheme, viewport: { width, height: 844 } });
                try {
                    const page = await context.newPage();
                    const problems = watchConsole(page, { ignore: [EXPECTED] });
                    const pages = {
                        report: async () => {
                            await page.goto(`${viewer.server.url}/live/sales${FRAGMENT}`);
                            await expect(page.locator("pivot-report").getByTestId("pivot-table")).toContainText("North");
                        },
                        denied: async () => {
                            viewer.who.deny = true;
                            await page.goto(`${viewer.server.url}/live/sales`);
                            await expect(page.getByRole("button", { name: "Sign in again" })).toBeVisible();
                            viewer.who.deny = false;
                        },
                        notFound: async () => {
                            await page.goto(`${viewer.server.url}/live/no such page`);
                            await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
                        }
                    };
                    for (const [name, open] of Object.entries(pages)) {
                        await open();
                        const where = `${name}, ${colorScheme}, ${width} px`;
                        const drawn = await measure(page);
                        expect(drawn.body, where).toBe(colorScheme === "dark" ? "rgb(13, 17, 23)" : "rgb(255, 255, 255)");
                        for (const t of drawn.texts) {
                            expect(t.ratio, `${where}: "${t.text}"`).toBeGreaterThanOrEqual(4.5);
                        }
                        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${where}: no sideways scrolling`).toBe(true);
                    }
                    expect(problems, `${colorScheme} ${width}: console errors and warnings`).toEqual([]);
                } finally {
                    await context.close();
                }
            }
        }
    } finally {
        await viewer.close();
    }
});

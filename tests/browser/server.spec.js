// A report that reads its rows from a server (record 0020): the web component with server-url on
// pages/element/server.html, under the strict Content-Security-Policy (connect-src 'self'). This spec
// answers the server's rows route; tests/browser-path.test.js runs the same network code against a
// real pivotkit-server. The states, the banner above rows already shown, the line over a slow
// skeleton, and Copy link keeping the parameters.
import { captureClipboard, expect, test, toolbar } from "./fixtures.js";

const ROUTE = "**/pk-test-server/api/v1/sources/records";
const ROWS = { columns: ["Region", "Sales"], types: ["string", "number"], rowCount: 3, data: [["North", "South", "West"], [10, 20, 7]], requestId: "Ab3_xY9-k2Q" };
const json = (status, body) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

// a refused or aborted request is the browser's console line, not the page's
test.use({ ignoreConsole: [/^Failed to load resource/] });

const live = (page) => page.locator("#live");
const state = (page) => live(page).getByTestId("server-state");
const states = (page) => page.evaluate(() => /** @type {any} */ (window).__states.map((s) => s.state));

test("the report reads its rows with the page's token, in the header only, with the parameters allowParams lets through", async ({ page }) => {
    /** @type {import("@playwright/test").Request[]} */
    const sent = [];
    await page.route(ROUTE, (route) => {
        sent.push(route.request());
        return route.fulfill(json(200, ROWS));
    });
    await page.goto("pages/element-server.html?customer=acme&customer=beta&region=north");
    await expect(live(page).getByTestId("pivot-table")).toContainText("North");
    await expect(live(page).getByTestId("pivot-table")).toContainText("37");
    expect(sent).toHaveLength(1);
    const headers = await sent[0].allHeaders();
    expect(headers.authorization).toBe("Bearer pkb.a-test-token");
    expect(sent[0].url()).not.toContain("pkb.");
    expect(headers.cookie).toBeUndefined();
    expect(headers.referer).toBeUndefined();
    expect(sent[0].postDataJSON()).toEqual({ source: "sales", params: { customer: "acme" } });
    expect(await page.evaluate(() => /** @type {any} */ (window).__asked)).toEqual([{ source: "sales", params: { customer: "acme" } }]);
    expect(await states(page)).toEqual(["loading", "ready"]);
    expect(JSON.stringify(await page.evaluate(() => /** @type {any} */ (window).__states))).not.toContain("pkb.");
});

test("a refusal shows a message in place of the report, with the server's code and request for IT support", async ({ page }) => {
    await page.route(ROUTE, (route) => route.fulfill(json(403, { code: "NOT_ALLOWED", requestId: "q3Zr8mT0aXw" })));
    await page.goto("pages/element-server.html");
    await expect(state(page)).toHaveAttribute("data-state", "refused");
    await expect(state(page)).toContainText("No access to this data");
    await expect(state(page)).toContainText("For IT support: NOT_ALLOWED, request q3Zr8mT0aXw");
    await expect(live(page).getByTestId("pivot-table")).toHaveCount(0);
    expect(await states(page)).toEqual(["loading", "refused"]);
});

test("too large names the server's limit in the report's language", async ({ page }) => {
    await page.route(ROUTE, (route) => route.fulfill(json(413, { code: "LIMIT_EXCEEDED", maxRows: 50000, requestId: "q3Zr8mT0aXw" })));
    await page.goto("pages/element-server.html?lang=de");
    await expect(state(page)).toHaveAttribute("data-state", "large");
    await expect(state(page)).toContainText("Zu viele Daten für einen Bericht");
    await expect(state(page)).toContainText("mehr als 50.000 Zeilen");
});

test("a 401 asks getToken() once more; when it gives nothing, the sign-in ended and the page is reloaded", async ({ page }) => {
    let calls = 0;
    await page.route(ROUTE, (route) => (calls++, route.fulfill(json(401, { code: "INVALID_TOKEN", expired: true }))));
    await page.goto("pages/element-server.html?token=none");
    await expect(state(page)).toHaveAttribute("data-state", "expired");
    await expect(state(page)).toContainText("Your sign-in has ended");
    expect(calls).toBe(0);
    await Promise.all([page.waitForEvent("load"), live(page).getByTestId("server-reload").click()]);
});

test("no answer: Try again reads once more and shows the rows", async ({ page }) => {
    let down = true;
    await page.route(ROUTE, (route) => (down ? route.abort("connectionrefused") : route.fulfill(json(200, ROWS))));
    await page.goto("pages/element-server.html");
    await expect(state(page)).toHaveAttribute("data-state", "unreachable");
    await expect(state(page)).toContainText(/For IT support: no answer from 127\.0\.0\.1:\d+/);
    down = false;
    await live(page).getByTestId("server-retry").click();
    await expect(live(page).getByTestId("pivot-table")).toContainText("North");
    await expect(state(page)).toHaveCount(0);
});

test("rows already shown: a failed refresh() keeps them, and a banner says from when they are", async ({ page }) => {
    let down = false;
    await page.route(ROUTE, (route) => (down ? route.abort("connectionrefused") : route.fulfill(json(200, ROWS))));
    await page.goto("pages/element-server.html");
    await expect(live(page).getByTestId("pivot-table")).toContainText("North");
    down = true;
    await live(page).evaluate((el) => /** @type {any} */ (el).refresh());
    const banner = live(page).getByTestId("server-banner");
    await expect(banner).toHaveAttribute("data-state", "unreachable");
    await expect(banner).toContainText(/still shows the data from \d{1,2}:\d{2}/);
    await expect(live(page).getByTestId("pivot-table")).toContainText("North");
    expect((await page.evaluate(() => /** @type {any} */ (window).__states)).at(-1)).toMatchObject({ state: "unreachable", shown: true });
});

test("a slow load says so over the skeleton after a few seconds", async ({ page }) => {
    /** @type {() => void} */
    let answer = () => {};
    await page.route(ROUTE, (route) => new Promise((done) => (answer = () => done(route.fulfill(json(200, ROWS))))));
    await page.goto("pages/element-server.html");
    await expect(live(page).getByTestId("server-slow")).toBeVisible({ timeout: 6000 });
    await expect(live(page).getByTestId("server-slow")).toContainText("Loading the report…");
    answer();
    await expect(live(page).getByTestId("pivot-table")).toContainText("North");
    await expect(live(page).getByTestId("server-slow")).toHaveCount(0);
});

test("Copy link keeps the parameters the report read and the link's access level, and names the parameters", async ({ page }) => {
    await captureClipboard(page);
    await page.route(ROUTE, (route) => route.fulfill(json(200, ROWS)));
    await page.goto("pages/element-server.html?customer=acme&pk-access=abc.def&other=x");
    await toolbar(live(page), "views");
    await expect(live(page).getByText("The link keeps customer: acme.")).toBeVisible();
    await live(page).getByTestId("copy-link").click();
    await expect(live(page).locator(".pk-toasts")).toContainText("Link copied, with customer: acme");
    const link = new URL(await page.evaluate(() => /** @type {any} */ (window).__copied));
    expect([...link.searchParams]).toEqual([["customer", "acme"], ["pk-access", "abc.def"]]);
});

test("the link's access level shuts this account out: its own message, without the rows route", async ({ page }) => {
    let calls = 0;
    await page.route(ROUTE, (route) => (calls++, route.fulfill(json(200, ROWS))));
    await page.goto("pages/element-server.html?pk-access=abc.def&token=link");
    await expect(state(page)).toHaveAttribute("data-state", "linkRefused");
    await expect(state(page)).toContainText("This link is not shared with this account");
    await expect(state(page)).toContainText("For IT support: NOT_ALLOWED, request q3Zr8mT0aXw");
    expect(calls).toBe(0);
    expect(await page.evaluate(() => /** @type {any} */ (window).__asked)).toEqual([{ source: "sales", params: {}, access: "abc.def" }]);
});

test("the sign-in ends while rows are shown: a banner to reload the page, the rows stay", async ({ page }) => {
    let refused = false;
    await page.route(ROUTE, (route) => route.fulfill(refused ? json(401, { code: "INVALID_TOKEN", expired: true }) : json(200, ROWS)));
    await page.goto("pages/element-server.html?token=once");
    await expect(live(page).getByTestId("pivot-table")).toContainText("North");
    refused = true;
    await live(page).evaluate((el) => /** @type {any} */ (el).refresh());
    const banner = live(page).getByTestId("server-banner");
    await expect(banner).toHaveAttribute("data-state", "expired");
    await expect(banner).toContainText(/because your sign-in has ended\. The report still shows the data from \d{1,2}:\d{2}/);
    await expect(banner.getByTestId("server-reload")).toBeVisible();
    await expect(live(page).getByTestId("pivot-table")).toContainText("North");
});

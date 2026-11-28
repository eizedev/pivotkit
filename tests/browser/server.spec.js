// A report that reads its rows from a server (record 0021): the web component with server-url on
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

test("a link that no longer works, a request that does not fit, and a sign-in step that failed: each says what helps", async ({ page }) => {
    await page.route(ROUTE, (route) => route.fulfill(json(400, { code: "INVALID_INPUT", requestId: "q3Zr8mT0aXw" })));
    await page.goto("pages/element-server.html?pk-access=abc.def&token=invalid");
    await expect(state(page)).toHaveAttribute("data-state", "linkInvalid");
    await expect(state(page)).toContainText("Ask the person who shared it for a new link");
    await page.goto("pages/element-server.html");
    await expect(state(page)).toHaveAttribute("data-state", "unfit");
    await expect(state(page)).toContainText("The link does not fit this report");
    await page.goto("pages/element-server.html?token=fail");
    await expect(state(page)).toHaveAttribute("data-state", "signIn");
    await expect(state(page)).not.toContainText("For IT support");
    await expect(live(page).getByTestId("server-reload")).toBeVisible();
    await page.goto("pages/element-server.html?token=large&lang=de");
    await expect(state(page)).toHaveAttribute("data-state", "signInLarge");
    await expect(state(page)).toContainText("Für den IT-Support: LIMIT_EXCEEDED, Anfrage q3Zr8mT0aXw");
});

/** A busy answer with the server's wait in seconds. */
const busy = (seconds) => ({ ...json(503, { code: "BUSY", requestId: "q3Zr8mT0aXw" }), headers: { "retry-after": String(seconds) } });

test("busy: the report counts down the server's wait and reads again on its own, once; Try again allows one more", async ({ page }) => {
    await page.clock.install();
    const answers = [busy(10), busy(10), busy(10), json(200, ROWS)];
    let calls = 0;
    await page.route(ROUTE, (route) => route.fulfill(answers[calls++]));
    await page.goto("pages/element-server.html");
    await expect(state(page)).toHaveAttribute("data-state", "busy");
    const countdown = state(page).getByTestId("server-countdown");
    await expect(countdown).toHaveText("Many reports are loading at the moment. Trying again in 10 s.");
    // a screen reader hears the wait once, not every second
    await expect(countdown).toHaveAttribute("aria-hidden", "true");
    await expect(state(page).locator(".pk-sr")).toHaveText("Many reports are loading at the moment. The report tries again in 10 seconds.");
    await expect(state(page).getByTestId("server-retry")).toBeVisible();
    await page.clock.runFor(3000);
    await expect(countdown).toHaveText(/Trying again in 7 s\.$/);
    await page.clock.runFor(7000);
    // the second busy answer: no more automatic tries, the server's wait as before
    await expect(state(page)).toContainText("Try again in 10 seconds");
    await expect(countdown).toHaveCount(0);
    expect(calls).toBe(2);
    await page.clock.runFor("02:00");
    expect(calls).toBe(2);
    // Try again: one more read, and one more automatic try after it
    await state(page).getByTestId("server-retry").click();
    await expect(countdown).toHaveText(/Trying again in 10 s\.$/);
    expect(calls).toBe(3);
    await page.clock.runFor(10_000);
    await expect(live(page).getByTestId("pivot-table")).toContainText("North");
    expect(calls).toBe(4);
    expect(await states(page)).toEqual(["loading", "busy", "loading", "busy", "loading", "busy", "loading", "ready"]);
});

test("busy over rows already shown: the banner counts down and the report reads again on its own", async ({ page }) => {
    await page.clock.install();
    const answers = [json(200, ROWS), busy(5), json(200, { ...ROWS, data: [["North", "South", "West"], [11, 20, 7]] })];
    let calls = 0;
    await page.route(ROUTE, (route) => route.fulfill(answers[calls++]));
    await page.goto("pages/element-server.html");
    await expect(live(page).getByTestId("pivot-table")).toContainText("37");
    await live(page).evaluate((el) => /** @type {any} */ (el).refresh());
    const banner = live(page).getByTestId("server-banner");
    await expect(banner).toHaveAttribute("data-state", "busy");
    await expect(banner.getByTestId("server-countdown")).toHaveText(/Trying again in 5 s\.$/);
    await expect(live(page).getByTestId("pivot-table")).toContainText("37");
    await page.clock.runFor(5000);
    await expect(live(page).getByTestId("pivot-table")).toContainText("38");
    await expect(banner).toHaveCount(0);
});

test("busy with a wait over a minute, or none given: no automatic try, the wait as the server said it, in German too", async ({ page }) => {
    await page.clock.install();
    let calls = 0;
    await page.route(ROUTE, (route) => (calls++, route.fulfill(busy(120))));
    await page.goto("pages/element-server.html?lang=de");
    await expect(state(page)).toHaveAttribute("data-state", "busy");
    await expect(state(page)).toContainText("In 120 Sekunden erneut versuchen");
    await page.clock.runFor("05:00");
    expect(calls).toBe(1);
    await page.unroute(ROUTE);
    await page.route(ROUTE, (route) => (calls++, route.fulfill(json(503, { code: "BUSY" }))));
    await state(page).getByTestId("server-retry").click();
    await expect(state(page)).toContainText("In einem Moment erneut versuchen");
    await page.clock.runFor("05:00");
    expect(calls).toBe(2);
});

test("Try again while the report waits for its automatic try reads once, and the wait is gone", async ({ page }) => {
    await page.clock.install();
    let calls = 0;
    await page.route(ROUTE, (route) => (calls++, route.fulfill(calls === 1 ? busy(10) : json(200, ROWS))));
    await page.goto("pages/element-server.html");
    await expect(state(page).getByTestId("server-countdown")).toBeVisible();
    await state(page).getByTestId("server-retry").click();
    await expect(live(page).getByTestId("pivot-table")).toContainText("North");
    await page.clock.runFor(20_000);
    expect(calls).toBe(2);
});

test.describe("the server's code does not load", () => {
    // one pattern: test.use reads an array of two as a value and its options
    test.use({ ignoreConsole: [/^Failed to load resource|the server's code did not load|Loading failed for the module/] });

    test("the report says so in place of the rows, and Try again loads it and reads them", async ({ page }) => {
        let blocked = true;
        await page.route("**/chunks/server-module-*.js", (route) => (blocked ? route.abort("connectionrefused") : route.continue()));
        await page.route(ROUTE, (route) => route.fulfill(json(200, ROWS)));
        await page.goto("pages/element-server.html");
        await expect(state(page)).toHaveAttribute("data-state", "unreachable");
        await expect(state(page)).toContainText("This menu could not be loaded.");
        expect(await states(page)).toEqual(["loading", "unreachable"]);
        blocked = false;
        await state(page).getByRole("button", { name: "Try again" }).click();
        await expect(live(page).getByTestId("pivot-table")).toContainText("North");
        await expect(state(page)).toHaveCount(0);
        expect(await states(page)).toEqual(["loading", "unreachable", "loading", "ready"]);
    });
});

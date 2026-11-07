// Chart display settings, sharing a view (link, JSON, file), the view kept in the address and per tab,
// the skeleton, and the help switches. Every test here fails without its feature.
import { readFile } from "node:fs/promises";
import { chips, expect, test, toolbar } from "./fixtures.js";

/** A switch of a menu (its checkbox is drawn as a track): by keyboard, as a person reaches it. */
async function flip(locator) {
    await locator.focus();
    await locator.press("Space");
}

/** navigator.clipboard.writeText that keeps what it was given in window.__copied (every browser, no permission). */
async function captureClipboard(page) {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText: async (text) => void (/** @type {any} */ (window).__copied = text) }
        });
    });
}

test.describe("chart display", () => {
    test("value labels, legend, title and smooth lines are set in the chart type menu and stay with the view", async ({ page }) => {
        await page.goto("?data=sales");
        await toolbar(page, "chart-type");
        await page.getByTestId("chart-bar").click();
        await expect(page.getByTestId("pivot-chart")).toBeVisible();
        await toolbar(page, "chart-type");
        await page.getByTestId("labels-value").click();
        await page.getByTestId("legend-right").click();
        // a choice applies at once and the menu stays open
        await expect(page.getByTestId("legend-right")).toHaveAttribute("aria-pressed", "true");
        // pie-only labels are not offered for bars
        await expect(page.getByTestId("labels-percent")).toHaveCount(0);
        await page.getByTestId("chart-title").fill("Revenue by region");
        await page.getByTestId("chart-title").press("Enter");
        await expect(page.getByTestId("pivot-chart")).toHaveAttribute("aria-label", "Chart: Revenue by region");
        // the settings stay when the type changes; a line offers smooth lines, a pie its shares
        await page.getByTestId("chart-line").click();
        await toolbar(page, "chart-type");
        await expect(page.getByTestId("labels-value")).toHaveAttribute("aria-pressed", "true");
        await flip(page.getByTestId("chart-smooth"));
        await page.getByTestId("chart-pie").click();
        await toolbar(page, "chart-type");
        await expect(page.getByTestId("labels-percent")).toBeVisible();
        await expect(page.getByTestId("chart-smooth")).toHaveCount(0);
        // the × removes the title at once, as one step Undo takes back
        await page.locator(".pk-chart-menu .pk-clear-x").click();
        await expect(page.getByTestId("pivot-chart")).toHaveAttribute("aria-label", "Chart");
        await expect(page.getByTestId("chart-title")).toBeFocused();
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        await page.getByTestId("undo").click();
        await expect(page.getByTestId("pivot-chart")).toHaveAttribute("aria-label", "Chart: Revenue by region");
        // the image has what the screen shows: it is exported from the drawn chart
        await toolbar(page, "export");
        const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-png").click()]);
        expect((await readFile(await download.path())).subarray(1, 4).toString()).toBe("PNG");
    });
});

test.describe("sharing a view", () => {
    test("Copy link holds the data, the start and the view; opening it shows that view", async ({ page, context }) => {
        await captureClipboard(page);
        await page.goto("?data=sales");
        // the playground's address says what the report starts from, in words
        await expect.poll(() => new URL(page.url()).searchParams.get("start")).toBe("revenue-by-region-and-category");
        await page.getByRole("button", { name: "Remove Country" }).click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Region"]);
        await toolbar(page, "templates");
        await page.getByTestId("copy-link").click();
        await expect(page.locator(".pk-toasts")).toContainText("Link copied");
        const link = await page.evaluate(() => /** @type {any} */ (window).__copied);
        expect(link).toMatch(/\?data=sales&start=revenue-by-region-and-category#pivot-playground=1\.[A-Za-z0-9_-]+$/);
        const other = await context.newPage();
        await other.goto(link);
        await expect.poll(() => chips(other, "rows")).toEqual(["Region"]);
        await expect(other.locator(".pk-toasts")).toContainText("Opened the view from the link");
        // the link's view is where the report starts; Reset still goes to the start template
        await toolbar(other, "reset");
        await expect.poll(() => chips(other, "rows")).toEqual(["Region", "Country"]);
    });

    test("the playground keeps the view in its address: a reload shows it again", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByRole("button", { name: "Remove Country" }).click();
        await expect.poll(() => page.url()).toContain("#pivot-playground=1.");
        await page.reload();
        await expect.poll(() => chips(page, "rows")).toEqual(["Region"]);
    });

    test("a damaged link and one with fields the data lacks say so in plain words", async ({ page }) => {
        await page.goto("?data=sales#pivot-playground=1.broken");
        await expect(page.locator(".pk-toasts")).toContainText("This link is damaged or not a pivotkit link.");
        await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country"]);
    });

    test("the view as JSON: copied, downloaded, loaded again; what does not fit is named", async ({ page }) => {
        await captureClipboard(page);
        await page.goto("?data=sales");
        await toolbar(page, "templates");
        await page.getByTestId("copy-json").click();
        await expect(page.locator(".pk-toasts")).toContainText("View copied as JSON");
        const json = JSON.parse(await page.evaluate(() => /** @type {any} */ (window).__copied));
        expect(json.rows).toEqual(["Region", "Country"]);
        await toolbar(page, "templates");
        const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-view").click()]);
        expect(download.suggestedFilename()).toBe("pivotkit-sales-view.json");
        const file = await download.path();
        expect(JSON.parse(await readFile(file, "utf8")).cols).toEqual(["Category"]);

        // paste: a view with a field this data does not have
        await toolbar(page, "templates");
        await page.getByTestId("load-view").click();
        await expect(page.getByTestId("load-view-text")).toBeFocused();
        await page.getByTestId("load-view-text").fill("{ nope");
        await page.getByTestId("load-view-apply").click();
        await expect(page.getByTestId("load-view-problem")).toHaveText("This is neither a view in JSON nor a pivotkit link.");
        await page.getByTestId("load-view-text").fill(JSON.stringify({ rows: ["Product", "Planet"], values: [{ field: "Units", agg: "sum" }] }));
        await page.getByTestId("load-view-apply").click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Product"]);
        await expect(page.locator(".pk-toasts")).toContainText("View loaded. Some parts did not fit this data and were left out: fields this data does not have (“Planet”)");
        // one step: Undo goes back to the view before
        await page.getByTestId("undo").click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country"]);

        // a file: the one downloaded above
        await toolbar(page, "templates");
        await page.getByTestId("load-view").click();
        await page.getByTestId("load-view-file").setInputFiles(file);
        await expect(page.locator(".pk-toasts")).toContainText("View loaded");
        await expect.poll(() => chips(page, "cols")).toEqual(["Category"]);
    });

    test("a host's page: the view is kept for the tab (persistView), chartOptions and loading change nothing else", async ({ page }) => {
        await page.goto("pages/host.html?persist&options&loading");
        // the host is loading: the skeleton, named for assistive technology
        await expect(page.getByTestId("skeleton")).toHaveAttribute("aria-busy", "true");
        await expect(page.getByRole("status").filter({ hasText: "Loading the report…" })).toHaveCount(1);
        await expect(page.getByTestId("pivot-table")).toBeVisible();
        await expect(page.getByTestId("skeleton")).toHaveCount(0);
        await page.getByRole("button", { name: "Remove Country" }).click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Region"]);
        await page.getByTestId("show-chart").click();
        // drawn: ECharts has loaded (a reload during its load is a warning in Firefox)
        await expect(page.locator('[data-testid="pivot-chart"] canvas')).toBeVisible();
        await page.reload();
        await expect.poll(() => chips(page, "rows")).toEqual(["Region"]);
        await expect(page.getByTestId("pivot-chart")).toBeVisible();
        // Reset goes to the start view, and that is what the tab keeps then
        await page.getByTestId("show-table").click();
        await toolbar(page, "reset");
        await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country"]);
        await page.reload();
        await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country"]);
    });

    test("a large data set paints the skeleton first, then the report", async ({ page }) => {
        // records whether the skeleton was in the page before the table came
        await page.addInitScript(() => {
            const seen = { skeleton: false, tableFirst: false };
            /** @type {any} */ (window).__seen = seen;
            new MutationObserver(() => {
                if (document.querySelector('[data-testid="skeleton"]')) seen.skeleton = true;
                if (document.querySelector('[data-testid="pivot-table"]') && !seen.skeleton) seen.tableFirst = true;
            }).observe(document, { childList: true, subtree: true });
        });
        await page.goto("?data=tickets&rows=100000");
        await expect(page.getByTestId("pivot-table")).toBeVisible();
        expect(await page.evaluate(() => /** @type {any} */ (window).__seen)).toEqual({ skeleton: true, tableFirst: false });
        // a small one renders at once, as before
        await page.goto("?data=tickets&rows=4000");
        await expect(page.getByTestId("pivot-table")).toBeVisible();
        expect(await page.evaluate(() => /** @type {any} */ (window).__seen.skeleton)).toBe(false);
    });
});

test.describe("help switches", () => {
    test("zone explanations: an i per zone, off and on in Options, remembered", async ({ page }) => {
        await page.goto("?data=sales");
        await expect(page.locator(".pk-zone-info")).toHaveCount(4);
        const rows = page.getByTestId("zone-info-rows");
        await expect(rows).toHaveAccessibleName("About Rows");
        await rows.focus();
        await expect(page.locator(".pk-info-pop")).toContainText("Example: Region in Rows");
        await page.keyboard.press("Escape");
        await toolbar(page, "options");
        await flip(page.getByTestId("show-zone-info"));
        await expect(page.locator(".pk-zone-info")).toHaveCount(0);
        await page.reload();
        await expect(page.getByTestId("pivot-table")).toBeVisible();
        await expect(page.locator(".pk-zone-info")).toHaveCount(0);
        await toolbar(page, "options");
        await flip(page.getByTestId("show-zone-info"));
        await expect(page.locator(".pk-zone-info")).toHaveCount(4);
    });

    test("field descriptions: the switch hides every i of a field; screen readers keep the text", async ({ page }) => {
        await page.goto("?data=sales");
        await toolbar(page, "options");
        // the generated sales data has no descriptions: no switch for them
        await expect(page.getByTestId("show-field-info")).toHaveCount(0);
        await page.goto("?data=countries");
        await expect(page.locator('.pk-field[data-field="Population"] .pk-info')).toHaveCount(1);
        await toolbar(page, "options");
        await flip(page.getByTestId("show-field-info"));
        await expect(page.locator(".pk-panel .pk-info, .pk-chip .pk-info")).toHaveCount(0);
        await expect(page.locator('.pk-field[data-field="Population"] .pk-field-name')).toHaveAttribute("aria-describedby", /.+/);
    });
});

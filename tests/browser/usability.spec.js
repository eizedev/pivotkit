// What a business user sees: words instead of bare icons, notes that explain, charts that stay
// readable. Every test here fails without its fix.
import { chips, expect, tableRows, test } from "./fixtures.js";

test("narrow: every toolbar button keeps its text; the rest is in a labelled More menu", async ({ page }) => {
    for (const width of [640, 390]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto("?data=sales");
        const buttons = page.locator(".pk-toolbar button");
        const texts = await buttons.evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.textContent.trim()));
        expect(texts.every((t) => t.length > 0), `${width}: ${JSON.stringify(texts)}`).toBe(true);
        for (const name of ["Table", "Chart", "Undo", "Export", "More"]) {
            expect(texts.some((t) => t.startsWith(name)), `${width}: ${name}`).toBe(true);
        }
        await page.getByTestId("more").click();
        await expect(page.getByRole("menuitem", { name: "Redo" })).toBeVisible();
        await page.keyboard.press("Escape");
    }
});

test("wide German toolbar fits on one line", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("?data=sales&lang=de");
    const tops = await page.locator(".pk-toolbar > :is(button, div)").evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))]);
    expect(tops).toHaveLength(1);
});

test("a chart with many series says so and swaps rows and columns", async ({ page }) => {
    await page.goto("?data=sales&empty");
    await page.getByTestId("field-menu-Category").click();
    await page.getByRole("menuitem", { name: "Add to Rows" }).click();
    await page.getByTestId("field-menu-Country").click();
    await page.getByRole("menuitem", { name: "Add to Columns" }).click();
    await page.locator('.pk-field[data-field="Revenue"] .pk-field-name').click();
    await page.getByTestId("show-chart").click();
    const hint = page.locator('[data-hint="series"]');
    await expect(hint).toContainText("series are hard to tell apart");
    await hint.getByRole("button", { name: "Swap rows and columns" }).click();
    await expect.poll(() => chips(page, "rows")).toEqual(["Country"]);
    await expect.poll(() => chips(page, "cols")).toEqual(["Category"]);
    await expect(page.locator('[data-hint="series"]')).toHaveCount(0);
});

test("lines with the dates on Columns get a hint to swap", async ({ page }) => {
    await page.goto("?data=tickets&empty");
    await page.getByTestId("field-menu-Team").click();
    await page.getByRole("menuitem", { name: "Add to Rows" }).click();
    await page.getByTestId("field-menu-Created").click();
    await page.getByRole("menuitem", { name: "Add to Columns" }).click();
    await page.locator('.pk-field[data-field="Lead hours"] .pk-field-name').click();
    await page.getByTestId("chart-type").click();
    await page.getByTestId("chart-line").click();
    await expect(page.locator('[data-hint="dates"]')).toBeVisible();
    await page.locator('[data-hint="dates"]').getByRole("button", { name: "Swap rows and columns" }).click();
    await expect.poll(() => chips(page, "rows")).toEqual(["Created (Month)"]);
});

test("a chart draws 50 categories at most and says so", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("?data=tickets&rows=100000&empty");
    await page.getByTestId("field-menu-Ticket").click();
    await page.getByRole("menuitem", { name: "Add to Rows" }).click();
    await page.locator('.pk-field[data-field="Lead hours"] .pk-field-name').click();
    await page.getByTestId("show-chart").click();
    await expect(page.locator('[data-hint="capped"]')).toHaveText("Showing the first 50 of 100,000 categories. Add a filter or Top N to choose them.");
});

test("top N: its own badge on the chip and a note that totals cover the shown items only", async ({ page }) => {
    await page.goto("?data=sales");
    await page.getByTestId("chip-menu-Country").click();
    await page.getByTestId("top-count").fill("2");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.locator('[data-zone="rows"] .pk-chip[data-chip="Country"] [data-testid="top-badge"]')).toHaveText("Top 2");
    await expect(page.getByTestId("note-top")).toHaveText("Country shows the top 2 only: totals and percentages cover these items, not all of them.");
});

test("Rows without Values: a note says what to do; one value column is not stretched", async ({ page }) => {
    await page.goto("?data=sales");
    await page.getByRole("button", { name: "Remove Sum of Revenue" }).click();
    await expect(page.getByTestId("note-values")).toContainText("Add a number to Values");
    await page.getByRole("button", { name: "Remove Category" }).click();
    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => chips(page, "values")).toEqual(["Sum of Revenue"]);
    await page.getByRole("button", { name: "Remove Category" }).click();
    const wrap = await page.getByTestId("pivot-table").boundingBox();
    const table = await page.locator(".pk-table").boundingBox();
    expect(table.width).toBeLessThan(wrap.width * 0.8);
});

test("a filtered field says how many of its values are shown", async ({ page }) => {
    await page.goto("?data=sales");
    await page.getByTestId("chip-menu-Region").click();
    await page.getByTestId("open-filter").click();
    const total = await page.locator(".pk-value").count();
    await page.locator(".pk-value", { hasText: "West" }).locator("input").uncheck();
    await page.getByTestId("filter-apply").click();
    await expect(page.locator('[data-zone="rows"] .pk-chip[data-chip="Region"] .pk-badge-text')).toHaveText(`${total - 1} of ${total}`);
});

test("text from the data is never markup: table, filter list, drill-down and chart summary", async ({ page }) => {
    await page.goto("?data=markup");
    await expect(page.getByTestId("pivot-table")).toContainText("<img src=x onerror=window.__pwned=1>");
    expect((await tableRows(page)).length).toBeGreaterThan(0);
    await page.locator('[data-testid="pivot-table"] tbody tr', { hasText: "<img" }).locator("td.pk-clickable").first().click();
    await expect(page.getByTestId("drill-panel")).toContainText("<img src=x onerror=window.__pwned=1>");
    await page.keyboard.press("Escape");
    await page.getByTestId("show-chart").click();
    await expect(page.getByTestId("chart-summary")).toContainText("<img");
    await page.locator('[data-testid="pivot-chart"] canvas').hover({ position: { x: 200, y: 150 } });
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
    expect(await page.locator(".pk-root img, .pk-root script").count()).toBe(0);
});

test("a panel opened from More keeps the focus on a switch; it closes when its button fits again", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto("?data=sales");
    await page.getByTestId("more").click();
    await page.getByTestId("more-options").click();
    // the panel has taken the focus (on its first option) before the user moves it
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest(".pk-popover")))).toBe(true);
    const sw = page.getByTestId("total-rowSubtotals");
    await sw.focus();
    await page.keyboard.press("Space");
    await expect(sw).not.toBeChecked();
    await page.waitForTimeout(300);
    await expect(sw).toBeFocused();
    // wider: Options is a button of its own again, the panel of the More menu goes
    await page.setViewportSize({ width: 1920, height: 900 });
    await expect(page.getByTestId("options")).toBeVisible();
    await expect(page.locator(".pk-popover")).toHaveCount(0);
});

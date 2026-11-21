// A click on a bar, slice or cell of the chart opens a small menu at it (#53): "Show the rows" first,
// then "Only …" and "Without …" for its category and its series. A filter is one step: the chip shows
// it and Undo takes it back. A double click opens the rows at once. The keys work in the menu.
import { test, expect } from "./fixtures.js";
import { HARDWARE, NORTH, SOFTWARE, barMiddle, cellMiddle, mount, pointOf, sliceMiddle } from "./chart-report.js";

const menu = (page) => page.getByRole("menu");
const lastView = (page) => page.evaluate(() => window.__tooltipViews.at(-1));
/** The categories the chart draws now, in order. */
const categories = (chartEl) =>
    chartEl.evaluate(async (el) => {
        const { getInstanceByDom } = await import("echarts/core");
        return getInstanceByDom(el).getOption().xAxis[0].data.map((d) => (typeof d === "string" ? d : d.value));
    });

test.describe("the menu at a clicked point of the chart", () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto("pages/host.html");
    });

    test("a bar's menu sits at the bar: Show the rows first, then Only and Without its region and its category", async ({ page }) => {
        const chartEl = await mount(page, { type: "bar" }, { cellClicks: true });
        const at = await pointOf(chartEl, barMiddle, { series: SOFTWARE, index: NORTH });
        await page.mouse.click(at.x, at.y);
        await expect(menu(page)).toBeVisible();
        await expect(menu(page)).toHaveAccessibleName("Filter or open North, Software");
        // the point's names on top; each filter entry with its field's name under it
        await expect(menu(page)).toContainText("North, Software");
        await expect(menu(page).getByRole("menuitem")).toHaveText(["Show the rows", "Only NorthRegion", "Without NorthRegion", "Only SoftwareCategory", "Without SoftwareCategory"]);
        // at the bar: the menu's corner within a few pixels of the click
        const box = await menu(page).boundingBox();
        expect(Math.min(Math.abs(box.x - at.x), Math.abs(box.x + box.width - at.x))).toBeLessThan(40);
        expect(Math.min(Math.abs(box.y - at.y), Math.abs(box.y + box.height - at.y))).toBeLessThan(40);
        // nothing opened yet: no rows, no call
        expect(await page.evaluate(() => window.__cellClicks)).toEqual([]);
        await page.keyboard.press("Escape");
        await expect(menu(page)).toHaveCount(0);
        await expect(page.getByTestId("drill-panel")).toHaveCount(0);
    });

    test("Only keeps the one region as a filter, and Undo takes it back", async ({ page }) => {
        const chartEl = await mount(page, { type: "bar" });
        const before = await categories(chartEl);
        const at = await pointOf(chartEl, barMiddle, { series: SOFTWARE, index: NORTH });
        await page.mouse.click(at.x, at.y);
        await menu(page).getByRole("menuitem", { name: "Only North" }).click();
        await expect(menu(page)).toHaveCount(0);
        await expect.poll(() => categories(chartEl)).toEqual(["North"]);
        // the field's pick, as the chip's filter writes it (its chip says "1 of 3")
        await expect.poll(async () => (await lastView(page)).filters.map((f) => [f.field, f.type])).toEqual([["Region", "in"]]);
        await page.keyboard.press("ControlOrMeta+z");
        await expect.poll(() => categories(chartEl)).toEqual(before);
    });

    test("Without leaves the category out of the series; the keys move through the menu", async ({ page }) => {
        const chartEl = await mount(page, { type: "bar" });
        const at = await pointOf(chartEl, barMiddle, { series: HARDWARE, index: NORTH });
        await page.mouse.click(at.x, at.y);
        await expect(menu(page).getByRole("menuitem").first()).toBeFocused();
        // down to "Without Hardware", the fifth entry, and Enter
        for (let i = 0; i < 4; i++) {
            await page.keyboard.press("ArrowDown");
        }
        await expect(menu(page).getByRole("menuitem", { name: "Without Hardware" })).toBeFocused();
        await page.keyboard.press("Enter");
        await expect.poll(() => chartEl.evaluate(async (el) => {
            const { getInstanceByDom } = await import("echarts/core");
            return getInstanceByDom(el).getOption().series.map((s) => s.name);
        })).toEqual(["Services", "Software"]);
    });

    test("Show the rows opens the bar's rows; a double click opens them at once, without the menu", async ({ page }) => {
        const chartEl = await mount(page, { type: "bar" }, { cellClicks: true });
        const at = await pointOf(chartEl, barMiddle, { series: SOFTWARE, index: NORTH });
        await page.mouse.click(at.x, at.y);
        await expect(menu(page).getByRole("menuitem").first()).toBeFocused();
        await page.keyboard.press("Enter");
        const panel = page.getByTestId("drill-panel");
        await expect(panel).toBeVisible();
        expect(await page.evaluate(() => window.__cellClicks)).toEqual([{ row: ["North"], col: ["Software"], count: 1 }]);
        await page.keyboard.press("Escape");
        await expect(panel).toHaveCount(0);
        await page.mouse.dblclick(at.x, at.y);
        await expect(panel).toBeVisible();
        await expect(menu(page)).toHaveCount(0);
    });

    test("drillDown off: no Show the rows without onCellClick; with it, Show the rows is the host's call (#705)", async ({ page }) => {
        let chartEl = await mount(page, { type: "bar" }, { drillDown: false });
        let at = await pointOf(chartEl, barMiddle, { series: SOFTWARE, index: NORTH });
        await page.mouse.click(at.x, at.y);
        await expect(menu(page).getByRole("menuitem")).toHaveText(["Only NorthRegion", "Without NorthRegion", "Only SoftwareCategory", "Without SoftwareCategory"]);
        await page.keyboard.press("Escape");
        // the host listens: the entry calls it, and no panel opens
        chartEl = await mount(page, { type: "bar" }, { drillDown: false, cellClicks: true });
        at = await pointOf(chartEl, barMiddle, { series: SOFTWARE, index: NORTH });
        await page.mouse.click(at.x, at.y);
        await menu(page).getByRole("menuitem", { name: "Show the rows" }).click();
        await expect.poll(() => page.evaluate(() => window.__cellClicks)).toEqual([{ row: ["North"], col: ["Software"], count: 1 }]);
        await expect(page.getByTestId("drill-panel")).toHaveCount(0);
    });

    test("a heatmap's cell: its row's and its column's items; Only keeps the column", async ({ page }) => {
        const chartEl = await mount(page, { type: "heatmap" });
        const at = await pointOf(chartEl, cellMiddle, { x: SOFTWARE, y: NORTH });
        await page.mouse.click(at.x, at.y);
        await expect(menu(page)).toContainText("North, Software");
        await menu(page).getByRole("menuitem", { name: /^Only Software/ }).click();
        await expect.poll(async () => (await lastView(page)).filters.map((f) => [f.field, f.type])).toEqual([["Category", "in"]]);
    });

    test("a slice adds up every column: Only and Without, no rows of its own", async ({ page }) => {
        const chartEl = await mount(page, { type: "pie" }, { view: { cols: [] } });
        const at = await pointOf(chartEl, sliceMiddle, { index: 0 });
        await page.mouse.click(at.x, at.y);
        await expect(menu(page)).toBeVisible();
        const items = await menu(page).getByRole("menuitem").allTextContents();
        expect(items).toHaveLength(2);
        expect(items[0]).toMatch(/^Only /);
        expect(items[1]).toMatch(/^Without /);
    });
});

test("on a phone the menu is a sheet at the bottom, and its entries are big enough to tap", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: false });
    const page = await context.newPage();
    await page.goto("pages/host.html");
    const chartEl = await mount(page, { type: "bar" });
    const at = await pointOf(chartEl, barMiddle, { series: SOFTWARE, index: NORTH });
    // the first tap shows the tooltip, the second opens the menu
    await page.touchscreen.tap(at.x, at.y);
    await page.waitForTimeout(400);
    await page.touchscreen.tap(at.x, at.y);
    await expect(menu(page)).toBeVisible();
    // the click a phone sends after the tap does not close it
    await page.waitForTimeout(400);
    await expect(menu(page)).toBeVisible();
    const heights = await menu(page).getByRole("menuitem").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    expect(heights.every((h) => h >= 44)).toBe(true);
    await menu(page).getByRole("menuitem", { name: "Only North" }).tap();
    await expect.poll(() => categories(chartEl)).toEqual(["North"]);
    await context.close();
});

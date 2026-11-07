// Every popover fits the window: a filter opened from a field low in the field list keeps Apply in view
// and clickable, and the menus of the chips and the toolbar stay inside a 1280 x 720 window.
import { test, expect, toolbar } from "./fixtures.js";

/** The box of the open popover against the window: inside, with the margin of place.js. */
async function insideWindow(page, selector = ".pk-popover") {
    const pop = page.locator(selector).last();
    await expect(pop).toBeVisible();
    // placed after a frame (popover.jsx), and an animation of its own
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const box = await pop.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: innerHeight };
    });
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(box.height);
}

for (const height of [970, 720, 480]) {
    test(`a filter opened from the last field of the list keeps Apply in view at 1280 x ${height}`, async ({ page }) => {
        await page.setViewportSize({ width: 1280, height });
        await page.goto("?data=tickets&rows=100000");
        await page.locator('[data-testid="pivot-table"]').waitFor();
        const field = await page.locator(".pk-field-list .pk-field").last().getAttribute("data-field");
        await page.getByTestId(`field-menu-${field}`).click();
        await page.getByTestId(`field-filter-${field}`).click();
        const apply = page.getByTestId("filter-apply");
        await expect(apply).toBeVisible();
        await insideWindow(page, ".pk-filter-popover");
        const box = await apply.boundingBox();
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(height);
        // clickable: nothing covers it, and a click applies (the popover closes)
        const hit = await apply.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const at = (el.getRootNode()).elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return el === at || el.contains(at);
        });
        expect(hit).toBe(true);
        await apply.click();
        await expect(page.locator(".pk-filter-popover")).toHaveCount(0);
    });
}

test("chip menus, the value filter, Views and Options stay inside a 1280 x 720 window", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("?data=tickets&rows=100000");
    await page.locator('[data-testid="pivot-table"]').waitFor();
    // a window this low folds the zones into one line: open them
    if (!(await page.getByTestId("chip-menu-Team").isVisible())) {
        await toolbar(page, "layout");
    }
    for (const chip of ["Team", "Priority"]) {
        await page.getByTestId(`chip-menu-${chip}`).click();
        await insideWindow(page);
        await page.keyboard.press("Escape");
    }
    await page.getByTestId("chip-menu-Team").click();
    await page.getByText("Value filter…").click();
    await insideWindow(page);
    await expect(page.getByTestId("value-filter-apply")).toBeInViewport();
    await page.keyboard.press("Escape");
    for (const menu of ["views", "options", "export"]) {
        await toolbar(page, menu);
        await insideWindow(page);
        await page.keyboard.press("Escape");
    }
});

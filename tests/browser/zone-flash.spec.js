// The flash of a zone that takes a field lasts as long as its animation: a multiple of --pk-duration,
// so a host's longer value makes it longer instead of being cut by a fixed timer. The sales data,
// a field added to Rows with "+ Add".
import { expect, test } from "./fixtures.js";

test("a zone's flash ends with its animation, which a host's --pk-duration lengthens", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("?data=sales&lang=en");
    await page.locator('[data-testid="pivot-table"]').waitFor();
    await page.addStyleTag({ content: ".pk-root { --pk-duration: 400ms; }" });
    const zone = page.locator('[data-zone="rows"]');
    // when the zone gets and loses its flash, measured in the page
    await zone.evaluate((el) => {
        const seen = /** @type {any} */ (window);
        seen.flash = {};
        new MutationObserver(() => {
            const on = el.classList.contains("pk-flash");
            if (on && seen.flash.on === undefined) {
                seen.flash.on = performance.now();
            } else if (!on && seen.flash.on !== undefined && seen.flash.off === undefined) {
                seen.flash.off = performance.now();
            }
        }).observe(el, { attributes: true, attributeFilter: ["class"] });
    });
    await page.getByTestId("add-field-rows").click();
    await page.locator(".pk-add-menu").getByTestId("add-pick-Product").click();
    await expect(zone).toHaveClass(/pk-flash/);
    await expect(zone).not.toHaveClass(/pk-flash/, { timeout: 5_000 });
    const { on, off } = await page.evaluate(() => /** @type {any} */ (window).flash);
    // 400 ms × 3.3 = 1,320 ms; a fixed 600 ms timer would end it at 600
    expect(off - on).toBeGreaterThan(1_100);
});

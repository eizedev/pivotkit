// The list of values in a field's filter (the Filter level of a chip's menu and the field list's Add
// to Filters): "Only" beside each value is reached by Tab and shown while its row has the focus, and
// a touch screen always shows it, so no tap lands on a button nobody sees. The Filter level, which
// applies every tick at once, says so beside Select all and Select none; Add to Filters, which waits
// for Apply, does not. The picks' header action says what it does ("Pick all again"), not "Clear",
// which read like Select none, and the picks' state beside it is never cut off on a phone.
import { chipMenu, expect, test } from "./fixtures.js";

/** How the "Only" of a value row is drawn: shown (opacity and visibility) or not. */
const shown = (only) => only.evaluate((el) => {
    const s = getComputedStyle(el);
    return s.visibility === "visible" && Number(s.opacity) > 0;
});

test.describe("desktop, mouse and keyboard", () => {
    test("Tab from a value's checkbox reaches its Only, which shows while it has the focus and keeps only that value", async ({ page }) => {
        await page.goto("?data=sales");
        await chipMenu(page, "Region", "filter");
        const menu = page.locator(".pk-chip-menu");
        const row = menu.locator(".pk-value").nth(1);
        const only = row.locator(".pk-only");
        // with the pointer away it is out of sight
        await page.mouse.move(0, 0);
        expect(await shown(only)).toBe(false);
        await row.locator("input[type=checkbox]").focus();
        await page.keyboard.press("Tab");
        await expect(only).toBeFocused();
        expect(await shown(only)).toBe(true);
        await page.keyboard.press("Enter");
        await expect(menu.locator(".pk-value input:checked")).toHaveCount(1);
        await expect(row.locator("input[type=checkbox]")).toBeChecked();
    });

    test("the Filter level says its ticks apply at once and says what its picks' header action does; Add to Filters waits for Apply", async ({ page }) => {
        await page.goto("?data=sales");
        await chipMenu(page, "Region", "filter");
        const menu = page.locator(".pk-chip-menu");
        await expect(menu.getByTestId("values-note")).toHaveText("Applies at once");
        await menu.locator(".pk-value input[type=checkbox]").first().click();
        await expect(menu.getByTestId("filter-clear-picks")).toHaveText("Pick all again");
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        await page.getByTestId("field-menu-Product").click();
        await page.getByRole("menuitem", { name: "Add to Filters" }).click();
        const popover = page.locator(".pk-filter-popover");
        await expect(popover.getByTestId("filter-apply")).toBeVisible();
        await expect(popover.getByTestId("values-note")).toHaveCount(0);
    });
});

test.describe("phone, touch", () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

    test("every value shows its Only without a pointer over it", async ({ page, browserName }) => {
        test.skip(browserName === "firefox", "Firefox has no mobile emulation");
        await page.goto("?data=sales&lang=de");
        expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
        await page.getByTestId("layout-summary").click();
        await chipMenu(page, "Region", "filter");
        const menu = page.locator(".pk-chip-menu");
        const onlys = menu.locator(".pk-value .pk-only");
        await expect(onlys).toHaveCount(5);
        for (const only of await onlys.all()) {
            expect(await shown(only)).toBe(true);
        }
        await expect(menu.getByTestId("values-note")).toHaveText("Wirkt sofort");
        // with a value unticked, the picks' state and its action both fit: the state is not cut off
        await menu.locator(".pk-value input[type=checkbox]").first().tap();
        const state = menu.getByTestId("section-picks").locator(".pk-fsection-state");
        await expect(state).toHaveText("4 von 5 ausgewählt");
        expect(await state.evaluate((el) => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().right <= el.closest(".pk-fsection-head").getBoundingClientRect().right)).toBe(true);
    });
});

// Keyboard, focus and screen reader behaviour (WCAG 2.2 AA): every test here fails without its fix.
import { chips, expect, tableRows, test } from "./fixtures.js";

test.describe("keyboard and focus", () => {
    test("collapse and expand from the keyboard keep the focus on the toggle", async ({ page }) => {
        await page.goto("?data=sales");
        const toggle = page.getByRole("button", { name: "Collapse Central" });
        await toggle.focus();
        const before = (await tableRows(page)).length;
        await page.keyboard.press("Enter");
        await expect.poll(async () => (await tableRows(page)).length).toBeLessThan(before);
        await expect(page.getByRole("button", { name: "Expand Central" })).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("button", { name: "Collapse Central" })).toBeFocused();
    });

    test("after a chip is removed the focus goes to its neighbour, then to the zone", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByRole("button", { name: "Remove Region" }).click();
        await expect(page.locator('[data-zone="rows"] .pk-chip[data-chip="Country"] .pk-chip-label')).toBeFocused();
        await page.getByRole("button", { name: "Remove Country" }).click();
        await expect(page.locator('[data-zone="rows"]')).toBeFocused();
        // removing from the chip's menu does the same
        await page.getByTestId("chip-menu-Category").click();
        await page.getByTestId("menu-remove").click();
        await expect(page.locator('[data-zone="cols"]')).toBeFocused();
    });

    test("a field from the field list moves into a zone with the keyboard, with its position announced", async ({ page }) => {
        await page.goto("?data=sales");
        const handle = page.locator('.pk-field[data-field="Channel"] .pk-handle');
        await handle.focus();
        await page.keyboard.press("Space");
        // it starts in the field list, which is no zone
        await expect(page.locator('[id^="DndLiveRegion"]')).toHaveText("Channel is not over a zone.");
        // dnd-kit listens for the arrow keys from the next task on
        await page.waitForTimeout(100);
        await page.keyboard.press("ArrowRight");
        await expect(page.locator('[id^="DndLiveRegion"]')).toHaveText("Channel is over Rows, at the end.");
        await page.keyboard.press("ArrowLeft");
        await expect(page.locator('[id^="DndLiveRegion"]')).toHaveText("Channel is over Rows, position 2 of 3.");
        await page.keyboard.press("ArrowUp");
        await expect(page.locator('[id^="DndLiveRegion"]')).toHaveText("Channel is over Columns, at the end.");
        await page.keyboard.press("Space");
        await expect.poll(() => chips(page, "cols")).toEqual(["Category", "Channel"]);
        // a chip goes up from Rows to Columns and on to Filters
        const region = page.locator('[data-zone="rows"] .pk-chip[data-chip="Region"] .pk-handle');
        await region.focus();
        await page.keyboard.press("Space");
        await expect(page.locator('[id^="DndLiveRegion"]')).toHaveText("Region is over Rows, position 1 of 2.");
        // dnd-kit listens for the arrow keys from the next task on
        await page.waitForTimeout(100);
        await page.keyboard.press("ArrowUp");
        await expect(page.locator('[id^="DndLiveRegion"]')).toHaveText("Region is over Columns, at the end.");
        await page.keyboard.press("ArrowUp");
        await expect(page.locator('[id^="DndLiveRegion"]')).toHaveText("Region is over Filters, at the end.");
        await page.keyboard.press("Space");
        await expect.poll(() => chips(page, "filters")).toEqual(["Region"]);
    });

    test("the drill-down keeps the focus inside and closes with Escape from anywhere", async ({ page }) => {
        await page.goto("?data=tickets");
        const cell = page.locator('[data-testid="pivot-table"] td.pk-clickable').first();
        await cell.click();
        const panel = page.getByTestId("drill-panel");
        await expect(panel.getByRole("button", { name: "Close" })).toBeFocused();
        for (let i = 0; i < 4; i++) {
            await page.keyboard.press("Tab");
            expect(await panel.evaluate((el) => el.contains(document.activeElement))).toBe(true);
        }
        await page.keyboard.press("Shift+Tab");
        expect(await panel.evaluate((el) => el.contains(document.activeElement))).toBe(true);
        // Escape works even when the focus is on the page outside the report
        await page.evaluate(() => document.body.focus());
        await page.keyboard.press("Escape");
        await expect(panel).toBeHidden();
    });

    test("a menu closes with Tab, a popover when the focus leaves it, both with Escape from outside", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByTestId("export").click();
        await expect(page.getByTestId("export-xlsx")).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(page.locator(".pk-popover")).toHaveCount(0);
        await expect(page.getByTestId("export")).toBeFocused();
        await page.getByTestId("chip-menu-Region").click();
        await expect(page.locator(".pk-popover")).toHaveCount(1);
        await page.getByTestId("swap").focus();
        await expect(page.locator(".pk-popover")).toHaveCount(0);
        await page.getByTestId("options").click();
        await expect(page.locator(".pk-popover")).toHaveCount(1);
        await page.evaluate(() => document.body.focus());
        await page.keyboard.press("Escape");
        await expect(page.locator(".pk-popover")).toHaveCount(0);
    });

    test("narrow: the field drawer is a dialog that takes the focus and closes with Escape", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto("?data=sales");
        await page.getByTestId("show-fields").click();
        const drawer = page.getByRole("dialog", { name: "Field list" });
        await expect(drawer).toBeVisible();
        await expect(drawer.getByRole("searchbox")).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(page.locator(".pk-panel")).toBeHidden();
        await expect(page.getByTestId("show-fields")).toBeFocused();
    });
});

test.describe("names, roles and sizes", () => {
    test("Table | Chart are toggle buttons; the table has a name and a described hint", async ({ page }) => {
        await page.goto("?data=sales");
        await expect(page.getByRole("radio")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Table" })).toHaveAttribute("aria-pressed", "true");
        const table = page.getByRole("table", { name: "Pivot table" });
        await expect(table).toBeVisible();
        const hint = await table.getAttribute("aria-describedby");
        await expect(page.locator(`[id="${hint}"]`)).toContainText("press Enter");
        // an empty corner is no header without a name
        expect(await page.locator('[data-testid="pivot-table"] thead th').evaluateAll((ths) => ths.filter((th) => !th.textContent.trim()).length)).toBe(0);
    });

    test("where a field is and what is set on a chip is in its accessible name", async ({ page }) => {
        await page.goto("?data=sales");
        await expect(page.locator('.pk-field[data-field="Region"] .pk-field-name')).toHaveAccessibleName("Region, in Rows");
        await expect(page.getByTestId("chip-menu-Region")).toHaveAccessibleName("Region, sorted Largest Sum of Revenue first");
        await page.getByTestId("chip-menu-Region").click();
        await page.getByTestId("open-filter").click();
        const total = await page.locator(".pk-value").count();
        await page.locator(".pk-value", { hasText: "West" }).locator("input").uncheck();
        await page.getByTestId("filter-apply").click();
        await expect(page.getByTestId("chip-menu-Region")).toHaveAccessibleName(new RegExp(`^Region, filtered ${total - 1} of ${total}, sorted`));
    });

    test("every control is at least 24 by 24 px (WCAG 2.5.8), wide and narrow", async ({ page }) => {
        // measured at rest: the chips scale in when they appear
        await page.emulateMedia({ reducedMotion: "reduce" });
        for (const width of [1440, 390]) {
            await page.setViewportSize({ width, height: 900 });
            await page.goto("?data=sales");
            await expect(page.locator(".pk-root")).toHaveAttribute("data-pk-size", width < 640 ? "narrow" : "wide");
            // measured once the layout of this width has settled
            const small = () => page.locator(".pk-root :is(button, [role=button], .pk-handle, input[type=search])").evaluateAll((els) =>
                els
                    .filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== "hidden")
                    .map((e) => ({ name: e.getAttribute("aria-label") || e.textContent.trim() || e.className, box: e.getBoundingClientRect() }))
                    .filter(({ box }) => box.width > 0 && (box.width < 23.5 || box.height < 23.5))
                    .map(({ name, box }) => `${name}: ${Math.round(box.width)}x${Math.round(box.height)}`)
            );
            await expect.poll(small, { message: `at ${width} px` }).toEqual([]);
        }
    });

    test("the chart has a text alternative with its numbers", async ({ page }) => {
        await page.goto("?data=sales");
        await page.getByTestId("show-chart").click();
        const chart = page.getByRole("img", { name: "Chart" });
        await expect(chart).toBeVisible();
        const id = await chart.getAttribute("aria-describedby");
        const text = await page.locator(`[id="${id}"]`).textContent();
        expect(text).toMatch(/^Bars: Sum of Revenue by Region \/ Country\. \d+ categories, 3 series\. Highest €[\d,.]+ at .+; lowest €[\d,.]+ at .+\. Switch to Table to read every value\.$/);
    });
});

test.describe("notes", () => {
    test("no note for an add; Undone names the step; notes sit under the table; a note stays while hovered", async ({ page }) => {
        await page.goto("?data=sales");
        await page.locator('.pk-field[data-field="Channel"] .pk-field-name').click();
        await expect.poll(() => chips(page, "rows")).toEqual(["Region", "Country", "Channel"]);
        await expect(page.locator(".pk-toast")).toHaveCount(0);
        await page.keyboard.press("ControlOrMeta+z");
        const toast = page.locator(".pk-toast");
        await expect(toast).toHaveText(/Undone: Channel added to Rows/);
        const table = await page.getByTestId("pivot-table").boundingBox();
        const box = await toast.boundingBox();
        expect(box.y).toBeGreaterThanOrEqual(table.y + table.height);
        await toast.hover();
        await page.waitForTimeout(6800);
        await expect(toast).toBeVisible();
        await page.mouse.move(0, 0);
        await expect(toast).toHaveCount(0, { timeout: 9000 });
    });
});
